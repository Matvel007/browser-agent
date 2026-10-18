import { describe, expect, it } from 'vitest';
import { cleanUrl, envelope, pageItems, PROFILES, serializeArtifact } from '../../src/services/budget';
import { aggregateNetwork, groupConsole } from '../../src/services/devtools';

describe('bounded output contracts', () => {
  const cycle: any = { text: 'я\\"\n'.repeat(10000), password: 'private' }; cycle.self = cycle;
  const catalog = Array.from({ length: 500 }, (_, i) => ({ id: i, title: `Card ${i}`, description: 'Содержимое '.repeat(500), image: 'data:image/png;base64,' + 'A'.repeat(10000) }));
  for (const profile of ['lean', 'balanced', 'full'] as const) {
    for (const [name, value] of [['cycle', cycle], ['catalog', catalog], ['base64', 'data:image/jpeg;base64,' + 'A'.repeat(100000)], ['nested', { a: { b: { c: { d: { e: catalog } } } } }]] as const) {
      it(`${profile}: ${name} stays within the final serialized limit`, () => {
        const result = envelope(value, { profile });
        expect(JSON.stringify(result).length).toBeLessThanOrEqual(PROFILES[profile].chars);
        expect(result.truncated).toBe(true);
        expect(result.next).toBeTruthy();
        expect(result.tokens_est).toBeGreaterThan(0);
        expect(JSON.stringify(result)).not.toContain('data:image/');
        expect(JSON.stringify(result)).not.toContain('private');
      });
    }
  }
  it('preserves own prototype-named JSON fields without prototype pollution', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":12}');
    expect(envelope(value).data.__proto__).toEqual({ polluted: true });
    expect(({} as any).polluted).toBeUndefined();
  });
  it('redacts credentials in artifacts without truncating ordinary arrays', () => {
    const data = JSON.parse(serializeArtifact({ items: Array.from({ length: 200 }, (_, i) => i), password: '123', url: 'https://x.test/?api_key=secret&name=a' }));
    expect(data.items).toHaveLength(200);
    expect(data.password).toBe('[redacted]');
    expect(data.url).not.toContain('=secret');
  });
  it('redacts common provider tokens in text and artifacts', () => {
    const tokens = [
      'ghp_' + 'a'.repeat(30),
      'glpat-' + 'b'.repeat(25),
      'xoxb-' + '1-'.repeat(6) + 'c',
      'AKIA' + 'A'.repeat(16),
      'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12),
    ];
    for (const token of tokens) {
      expect(serializeArtifact({ value: token })).not.toContain(token);
      expect(envelope({ value: token }).data.value).not.toContain(token);
    }
  });
  it('redacts labeled passwords and payment fields in plain text', () => {
    const text = 'Password: hunter2; card number: 4111 1111 1111 1111; CVV=123';
    const safe = envelope({ text }).data.text;
    expect(safe).not.toContain('hunter2');
    expect(safe).not.toContain('4111');
    expect(safe).not.toContain('123');
    expect(safe).toContain('[redacted]');
  });
  it('redacts common header names and camel-case token fields', () => {
    const input = { 'X-API-Key': 'private-key', accessToken: 'private-access', token: 'private-token', 'Proxy-Authorization': 'private-proxy', cookies: [{ name: 'session', domain: '.test', path: '/', value: 'private-cookie' }] };
    expect(JSON.stringify(envelope(input))).not.toContain('private-');
    expect(serializeArtifact(input)).not.toContain('private-');
  });
  it('paginates exactly and rejects invalid cursors', () => {
    expect(pageItems([1, 2, 3], '1', 1)).toEqual({ items: [2], total: 3, nextCursor: '2' });
    expect(() => pageItems([], '-1', 10)).toThrow('cursor');
    expect(cleanUrl('data:text/plain,secret')).toBe('[data:]');
  });
  it('aggregates heavy traffic deterministically without CDN floods', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ requestId: String(i), url: `https://cdn.test/img/${i}?token=secret`, method: 'GET', timestamp: i, type: 'Image', status: 200 }));
    const result = aggregateNetwork(rows);
    expect(result.total).toBe(500); expect(result.byType).toEqual({ Image: 500 });
    expect(result.byOrigin).toEqual({ 'https://cdn.test': 500 });
    expect(JSON.stringify(result).length).toBeLessThan(300);
  });
  it('groups repeat errors', () => {
    expect(groupConsole([{ type: 'error', text: 'Error', timestamp: 1 }, { type: 'error', text: 'Error', timestamp: 2 }])).toEqual([{ level: 'error', text: 'Error', count: 2, firstAt: 1, lastAt: 2, url: undefined }]);
  });
});
