import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { artifactStats, dbRequest, getArtifact, putArtifact } from '../../src/services/artifacts';
import { DEFAULT_SETTINGS, getChatSession, getChatSessions, saveSingleSession } from '../../src/services/storage';
import { executeTool, validateArguments } from '../../src/services/tool-executor';
import { parseSearchHtml, publicUrl } from '../../src/services/search';

beforeEach(async () => {
  await dbRequest('artifacts', 'readwrite', store => store.clear());
  await dbRequest('sessions', 'readwrite', store => store.clear());
  await dbRequest('session_meta', 'readwrite', store => store.clear());
});
const context = () => ({ sessionId: 's1', runId: 'r1', signal: new AbortController().signal });

describe('artifacts and execution boundary', () => {
  it('loads history metadata separately and preserves the full transcript', async () => {
    const messages = [{ id: 'u', role: 'user' as const, content: 'Original message', timestamp: 1 }, { id: 'a', role: 'assistant' as const, content: 'Original answer', timestamp: 2 }];
    await saveSingleSession({ id: 'saved', title: 'History', createdAt: 1, updatedAt: 2, messages });
    const rows = await getChatSessions();
    expect(rows[0].messages).toHaveLength(0); expect(rows[0].messageCount).toBe(2);
    expect((await getChatSession('saved')).messages).toEqual(messages.map(message => ({ ...message, isStreaming: false, toolCalls: undefined })));
  });
  it('rebuilds session metadata for transcripts saved before the metadata store existed', async () => {
    await dbRequest('sessions', 'readwrite', store => store.put({ id: 'legacy', title: 'Legacy', createdAt: 1, updatedAt: 2, messages: [{ id: 'u', role: 'user', content: 'Hi', timestamp: 1 }] }));
    const rows = await getChatSessions();
    expect(rows.find(row => row.id === 'legacy')?.messageCount).toBe(1);
  });
  it('stores image bytes with a digest; prevents cross-chat access', async () => {
    const ref = await putArtifact(new Blob(['image bytes'], { type: 'image/png' }), 'screen.png', 's1');
    expect(ref.sha256).toHaveLength(64);
    expect(await (await getArtifact(ref.id, 's1')).blob.text()).toBe('image bytes');
    await expect(getArtifact(ref.id, 's2')).rejects.toThrow('unavailable');
    expect((await artifactStats()).count).toBe(1);
  });
  it('rejects oversized artifacts instead of dropping bytes silently', async () => {
    await expect(putArtifact(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]), 'huge', 's1')).rejects.toThrow('8 MiB');
  });
  it('enforces disabled tools at the execution boundary', async () => {
    const result = await executeTool('web_search', { query: 'test' }, { ...DEFAULT_SETTINGS, disabledTools: ['web_search'] }, context());
    expect(result.ok).toBe(false); expect(result.data.error).toContain('disabled');
  });
  it('validates tool args before sending browser commands', () => {
    expect(() => validateArguments('devtools_click_element', {})).toThrow('selector');
    expect(() => validateArguments('devtools_evaluate_js', { code: '1', full: 'yes' })).toThrow('type');
  });
  it('ignores null optional arguments and validates array item types', () => {
    const args = { cursor: null, limit: null };
    expect(() => validateArguments('devtools_get_page_summary', args)).not.toThrow();
    expect(args).toEqual({});
    expect(() => validateArguments('devtools_click_element', { selector: null })).toThrow('selector');
    expect(() => validateArguments('devtools_evaluate_js', { code: '1', projection: [123] })).toThrow('array item');
  });
  it('blocks private and loopback hosts for public fetches but keeps local tabs usable', () => {
    expect(() => publicUrl('http://127.0.0.1:8080', { allowPrivate: false })).toThrow('private');
    expect(() => publicUrl('http://localhost:3000', { allowPrivate: false })).toThrow('private');
    expect(() => publicUrl('http://192.168.1.1', { allowPrivate: false })).toThrow('private');
    expect(() => publicUrl('http://[::1]/', { allowPrivate: false })).toThrow('private');
    expect(publicUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    expect(publicUrl('https://example.test', { allowPrivate: false })).toBe('https://example.test/');
  });
  it('reads large JSON through stable slices and reports more data', async () => {
    const ref = await putArtifact(new Blob([JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i })))], { type: 'application/json' }), 'rows.json', 's1');
    const result = await executeTool('artifact_read', { id: ref.id, limit: 5 }, DEFAULT_SETTINGS, context());
    expect(result.data.items).toHaveLength(5); expect(result.data.nextCursor).toBe('5'); expect(result.next).toContain('cursor');
  });
  it('reads the active transcript even with persistent history disabled', async () => {
    const result = await executeTool('history_read', { text: 'earlier' }, { ...DEFAULT_SETTINGS, saveSessionHistory: false }, { ...context(), history: [
      { id: 'u', role: 'user', content: 'Earlier important fact', timestamp: 1 },
    ] });
    expect(result.ok).toBe(true); expect(result.data.items[0].content).toBe('Earlier important fact');
  });
  it('parses search links and explicitly reports challenges', () => {
    const rows = parseSearchHtml('<html><body><div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.test">Example</a><div class="result__snippet">A useful page</div></div></body></html>');
    expect(rows[0]?.url).toBe('https://example.test');
    expect(() => parseSearchHtml('<html><body><form id="challenge-form"></form></body></html>')).toThrow('challenge');
  });
});
