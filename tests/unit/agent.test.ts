import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings, selectProvider } from '../../src/services/storage';
import { buildContext, summaryForRollback } from '../../src/services/context';
import { compactSession, runAgent } from '../../src/services/agent';
import { LLMClient } from '../../src/services/llm';
import { ChatResult } from '../../src/services/llm';
import { ChatSession } from '../../src/types';
import { envelope } from '../../src/services/budget';

const settings = { ...DEFAULT_SETTINGS, model: 'test', apiKey: 'key', maxSteps: 1 };
const initial = (): ChatSession => ({ id: 'session', title: 'test', createdAt: 1, updatedAt: 1, messages: [{ id: 'u1', role: 'user', content: 'Task', timestamp: 1 }] });
const result = (content: string): ChatResult => ({ content, usage: { input: 10, output: 5, estimated: false } });
afterEach(() => vi.restoreAllMocks());

describe('history and agent lifecycle', () => {
  it('can manually compact one completed turn without erasing it', async () => {
    const session = initial(); session.messages.push({ id: 'a1', role: 'assistant', content: 'Done', timestamp: 2 });
    vi.spyOn(LLMClient, 'summarizeHistory').mockResolvedValue('The task was completed.');
    const compacted = await compactSession(settings, session, undefined, 0);
    expect(compacted.messages).toHaveLength(3);
    expect(buildContext(compacted)).toHaveLength(1);
    expect(compacted.summary?.throughId).toBe('a1');
  });
  it('compacts without deleting messages and includes the previous summary', async () => {
    const session = initial();
    session.messages.push({ id: 'a1', role: 'assistant', content: 'Old fact', timestamp: 2 }, { id: 'u2', role: 'user', content: 'Next task', timestamp: 3 }, { id: 'a2', role: 'assistant', content: 'Next answer', timestamp: 4 });
    const before = structuredClone(session);
    vi.spyOn(LLMClient, 'summarizeHistory').mockResolvedValue('Summary with old fact');
    const compacted = await compactSession(settings, session, undefined, 2);
    expect(session).toEqual(before);
    expect(compacted.messages.filter(m => !m.isCompressionCard)).toEqual(before.messages);
    expect(buildContext(compacted).map(m => m.id)).toEqual(['context-summary', 'u2', 'a2']);
    compacted.messages.push({ id: 'u3', role: 'user', content: 'Third', timestamp: 5 }, { id: 'a3', role: 'assistant', content: 'Third answer', timestamp: 6 });
    await compactSession(settings, compacted, undefined, 2);
    expect(LLMClient.summarizeHistory).toHaveBeenLastCalledWith(settings, expect.any(Array), undefined, 'Summary with old fact');
    expect(summaryForRollback(compacted.summary, before.messages.slice(0, 1))).toBeUndefined();
  });
  it('makes a final tool-free request when the action limit is reached', async () => {
    const chat = vi.spyOn(LLMClient, 'chat').mockResolvedValueOnce({ ...result(''), toolCalls: [{ id: 'c1', name: 'devtools_get_page_summary', args: {}, status: 'pending', timestamp: 2 }] }).mockResolvedValueOnce(result('Checked the page.'));
    const execute = vi.fn().mockResolvedValue(envelope({ title: 'Example' }));
    const session = await runAgent(settings, initial(), new AbortController().signal, { update() {}, chunk() {}, execute, settings: async () => settings }, true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[1][4]).toMatchObject({ tools: false, finalize: true });
    expect(session.messages.at(-1)?.content).toBe('Checked the page.');
  });
  it('does not finish silently on an empty response', async () => {
    vi.spyOn(LLMClient, 'chat').mockResolvedValueOnce(result('')).mockResolvedValueOnce(result('Finished without additional actions.'));
    const session = await runAgent(settings, initial(), new AbortController().signal, { update() {}, chunk() {}, execute: vi.fn(), settings: async () => settings }, false);
    expect(session.messages.at(-1)?.content).toBeTruthy();
  });
  it('preserves partial output and ends stopped after cancellation', async () => {
    const controller = new AbortController();
    vi.spyOn(LLMClient, 'chat').mockImplementation(async (_settings, _messages, callbacks) => {
      callbacks?.onChunk?.('Partial answer'); controller.abort(); throw new DOMException('Stopped', 'AbortError');
    });
    const session = await runAgent(settings, initial(), controller.signal, { update() {}, chunk() {}, execute: vi.fn(), settings: async () => settings }, false);
    expect(session.messages.some(m => m.content === 'Partial answer')).toBe(true);
    expect(session.messages.at(-1)?.status).toBe('stopped');
    expect(session.messages.every(m => !m.isStreaming)).toBe(true);
  });
  it('reports failures without inventing success', async () => {
    vi.spyOn(LLMClient, 'chat').mockRejectedValue(new Error('HTTP 429'));
    const session = await runAgent(settings, initial(), new AbortController().signal, { update() {}, chunk() {}, execute: vi.fn(), settings: async () => settings }, false);
    expect(session.messages.at(-1)?.status).toBe('error');
    expect(session.messages.at(-1)?.content).toContain('429');
  });
  it('migrates settings and keeps provider credentials separate', () => {
    const migrated = migrateSettings({ maxContextTokens: 252000, provider: 'routerai', apiKey: 'router-key', model: 'old' });
    expect(migrated.maxContextTokens).toBe(64000);
    const changed = selectProvider(migrated, 'anthropic'); expect(changed.apiKey).toBe('');
    expect(selectProvider(changed, 'routerai').apiKey).toBe('router-key');
    const custom = 'You are Browser Agent, a neutral and precise AI browser assistant.\nMy custom instructions.';
    expect(migrateSettings({ systemPrompt: custom }).systemPrompt).toBe(custom);
  });
});
