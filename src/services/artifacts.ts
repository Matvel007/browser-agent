import { ArtifactRef } from '../types';

const DB_NAME = 'browser-agent-data';
export const ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const STORE_MAX_BYTES = 64 * 1024 * 1024;
const TTL = 7 * 86400000;
let database: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('artifacts', { keyPath: 'id' });
      db.createObjectStore('sessions', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Database upgrade blocked. Close other extension pages.')); };
  });
  return database;
}

export async function dbRequest<T>(store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
  });
}

interface StoredArtifact extends ArtifactRef { blob: Blob }

export async function pruneArtifacts(sessionId?: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('artifacts', 'readwrite');
    const store = tx.objectStore('artifacts');
    const rows: ArtifactRef[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const row: StoredArtifact = cursor.value;
        if (row.expiresAt <= Date.now() || (sessionId && row.sessionId === sessionId)) cursor.delete();
        else { const { blob: _, ...ref } = row; rows.push(ref); }
        cursor.continue();
      } else {
        let bytes = rows.reduce((n, row) => n + row.bytes, 0);
        for (const row of rows.sort((a, b) => a.createdAt - b.createdAt)) {
          if (bytes <= STORE_MAX_BYTES) break;
          store.delete(row.id); bytes -= row.bytes;
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putArtifact(blob: Blob, name: string, sessionId: string): Promise<ArtifactRef> {
  if (blob.size > ARTIFACT_MAX_BYTES) throw new Error('Artifact exceeds 8 MiB. Use a region, projection or smaller capture.');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
  const ref: ArtifactRef = { id: crypto.randomUUID(), name: name.slice(0, 120), mime: blob.type || 'application/octet-stream',
    bytes: blob.size, sha256, sessionId, createdAt: Date.now(), expiresAt: Date.now() + TTL };
  await dbRequest('artifacts', 'readwrite', store => store.put({ ...ref, blob }));
  await pruneArtifacts();
  return ref;
}

export async function getArtifact(id: string, sessionId: string): Promise<StoredArtifact> {
  const row = await dbRequest<StoredArtifact | undefined>('artifacts', 'readonly', store => store.get(id));
  if (!row || row.sessionId !== sessionId || row.expiresAt <= Date.now()) throw new Error('Artifact unavailable or expired. Capture the data again.');
  return row;
}

export async function artifactStats() {
  const db = await openDatabase();
  return new Promise<{ count: number; bytes: number }>((resolve, reject) => {
    const tx = db.transaction('artifacts');
    let count = 0, bytes = 0;
    const request = tx.objectStore('artifacts').openCursor();
    request.onsuccess = () => { const c = request.result; if (c) { count++; bytes += c.value.bytes; c.continue(); } };
    tx.oncomplete = () => resolve({ count, bytes });
    tx.onerror = () => reject(tx.error);
  });
}
