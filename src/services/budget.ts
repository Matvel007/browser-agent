import { ArtifactRef, ToolProfile, ToolResult } from '../types';

export const PROFILES = {
  lean: { chars: 2400, items: 10, string: 300, depth: 3 },
  balanced: { chars: 7200, items: 25, string: 700, depth: 4 },
  full: { chars: 18000, items: 100, string: 4000, depth: 8 },
} as const;
const CREDENTIAL_FIELD = /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|(?:x[-_])?(?:api[-_]?key|auth[-_]?token)|token|(?:access|refresh|auth|id|csrf|xsrf)[-_]?token|(?:client[-_]?)?secret)$/i;
function secretField(key: string, parent: any) {
  return CREDENTIAL_FIELD.test(key) || (key === 'value' && parent && (
    (typeof parent.name === 'string' && CREDENTIAL_FIELD.test(parent.name)) ||
    (typeof parent.domain === 'string' && ('httpOnly' in parent || 'sameSite' in parent || 'path' in parent))
  ));
}

export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value) || '';
  // Conservative estimate for mixed Cyrillic, JSON and source code. Usage from the API takes precedence.
  return Math.ceil(text.length / 2.5);
}

export function redactText(text: string): string {
  if (text.length > 1024 && /^(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|JVBERi0|UEsDB)[A-Za-z0-9+/\r\n]*={0,2}$/.test(text)) return '[encoded data: request an artifact]';
  return redactCredentials(text.replace(/data:[^\s"'<>]*;base64,[a-z\d+/=\s]+/gi, '[binary artifact]'));
}

function redactCredentials(text: string): string {
  return text
    .replace(/\bBearer\s+[a-z\d._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:api[_-]?key|token|access_token|secret|password)=)[^&#\s]*/gi, '$1[redacted]')
    .replace(/\b(?:sk-|tvly-)[a-z\d_-]{16,}/gi, '[redacted API key]')
    .replace(/\bAIza[a-z\d_-]{30,}/g, '[redacted API key]')
    .replace(/(["'](?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)["']\s*:\s*["'])[^"']*(["'])/gi, '$1[redacted]$2');
}

export function serializeArtifact(value: unknown): string {
  return JSON.stringify(value, function (key, item) {
    if (secretField(key, this)) return '[redacted]';
    // Original binary/text content can live in a downloadable artifact; only its projection enters the prompt.
    return typeof item === 'string' ? redactCredentials(item) : item;
  });
}

export function projectValue(value: unknown, profile: ToolProfile = 'balanced') {
  const limits = PROFILES[profile];
  const truncation = new Set<string>();
  const ancestors = new WeakSet<object>();
  const visit = (input: any, depth: number): any => {
    if (typeof input === 'string') {
      const safe = redactText(input);
      if (safe !== input) truncation.add('Binary data or credentials excluded');
      if (safe.length > limits.string) truncation.add(`Strings limited to ${limits.string} characters`);
      return safe.slice(0, limits.string);
    }
    if (input == null || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : String(input);
    if (typeof input === 'bigint' || typeof input === 'function' || typeof input === 'symbol') return String(input).slice(0, 100);
    if (typeof input !== 'object') return String(input);
    if (ancestors.has(input)) { truncation.add('Circular reference'); return '[circular]'; }
    if (depth >= limits.depth) { truncation.add(`Depth limited to ${limits.depth}`); return `[${Array.isArray(input) ? `Array(${input.length})` : 'Object'}]`; }
    ancestors.add(input);
    let output: any;
    if (Array.isArray(input) || ArrayBuffer.isView(input)) {
      const list = input as ArrayLike<any>;
      if (list.length > limits.items) truncation.add(`Array: ${limits.items} of ${list.length} items`);
      output = Array.from({ length: Math.min(list.length, limits.items) }, (_, i) => visit(list[i], depth + 1));
    } else {
      output = Object.create(null);
      const keys = Object.keys(input);
      if (keys.length > limits.items) truncation.add(`Object: ${limits.items} of ${keys.length} keys`);
      for (const key of keys.slice(0, limits.items)) {
        if (secretField(key, input)) {
          output[key] = '[redacted]';
          truncation.add('Credential fields excluded');
        } else {
          try { output[key] = visit(input[key], depth + 1); }
          catch { output[key] = '[unreadable]'; truncation.add('Unreadable property'); }
        }
      }
    }
    ancestors.delete(input);
    return output;
  };
  return { data: visit(value, 0), truncation: [...truncation] };
}

export function envelope(value: unknown, options: {
  profile?: ToolProfile; ok?: boolean; summary?: string; artifact?: ArtifactRef; next?: string; truncation?: string[];
} = {}): ToolResult {
  const profile = options.profile || 'balanced';
  const projected = projectValue(value, profile);
  const result: ToolResult = {
    ok: options.ok !== false,
    summary: redactText(options.summary || (options.ok === false ? 'Action failed' : 'Action completed')).slice(0, 240),
    data: projected.data, truncated: false,
    truncation: [...new Set([...projected.truncation, ...(options.truncation || [])])].slice(0, 8),
    tokens_est: 0, profile,
  };
  if (options.artifact) result.artifact = options.artifact;
  if (options.next) result.next = options.next.slice(0, 240);
  const cap = PROFILES[profile].chars;
  if (JSON.stringify(result).length > cap) {
    result.data = { preview: JSON.stringify(projected.data).slice(0, Math.floor(cap / 4)) };
    result.truncation.push('Serialized response exceeds budget; preview returned');
  }
  result.truncated = result.truncation.length > 0;
  if (result.truncated && !result.next) result.next = 'Request a narrower projection, limit/cursor, or read the original artifact.';
  result.tokens_est = estimateTokens(result) + 8;
  // Escaped strings can expand substantially. Enforce the final serialized envelope, including metadata.
  if (JSON.stringify(result).length > cap) {
    result.data = '[Preview omitted: response budget exceeded]';
    result.truncated = true;
    result.truncation = ['Serialized response budget exceeded'];
    result.tokens_est = estimateTokens(result) + 8;
  }
  return result;
}

export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? `${parsed.origin}${parsed.pathname}`.slice(0, 500) : `[${parsed.protocol}]`;
  } catch { return '[invalid URL]'; }
}

export function pageItems<T>(items: T[], cursor: unknown, limit: unknown = 20) {
  const offset = Number(cursor || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid cursor');
  const count = Math.max(1, Math.min(100, Number(limit) || 20));
  return { items: items.slice(offset, offset + count), total: items.length,
    nextCursor: offset + count < items.length ? String(offset + count) : null };
}
