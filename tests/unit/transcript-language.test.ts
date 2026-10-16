import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '../../src/types';
import { groupTranscript, logicalMessageCount } from '../../src/services/transcript';
import { resolveLanguage } from '../../src/services/language';
import { migrateSettings } from '../../src/services/storage';
import { runAgent } from '../../src/services/agent';
import { LLMClient } from '../../src/services/llm';

const user = (id: string): ChatMessage => ({ id, role: 'user', content: id, timestamp: 1 });
const step = (id: string, runId?: string): ChatMessage => ({ id, role: 'assistant', content: '', timestamp: 2, runId,
  toolCalls: [{ id: `call-${id}`, name: 'devtools_get_page_summary', args: {}, status: 'success', timestamp: 2, result: { ok: true, summary: 'Read title', tokens_est: 20 } }] });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('logical conversation turns', () => {
  it('groups action steps and final text as one reply without mutating the provider ledger', () => {
    const messages = [user('question'), step('action1', 'run'), step('action2', 'run'), { id: 'final', role: 'assistant' as const, runId: 'run', content: 'Done', timestamp: 3 }];
    const original = structuredClone(messages);
    const groups = groupTranscript(messages);
    expect(groups).toHaveLength(2); expect(groups[1].messages).toHaveLength(3);
    expect(logicalMessageCount(messages)).toBe(2); expect(messages).toEqual(original);
  });
  it('groups legacy steps, recovery notices and compression markers without inflating counts', () => {
    const messages: ChatMessage[] = [user('u'), step('a'), { id: 'comp', role: 'system', content: 'Summary', isCompressionCard: true, timestamp: 3 }, step('b'),
      { id: 'stopped', role: 'assistant', content: 'Stopped', timestamp: 4, status: 'stopped' }];
    expect(groupTranscript(messages)).toHaveLength(2); expect(logicalMessageCount(messages)).toBe(2);
    expect(groupTranscript(messages)[1].messages.some(m => m.isCompressionCard)).toBe(true);
  });
  it('does not merge different user turns or different explicit runs', () => {
    expect(logicalMessageCount([user('u1'), step('a', 'one'), user('u2'), step('b', 'two')])).toBe(4);
    expect(groupTranscript([step('a', 'one'), step('b', 'two')])).toHaveLength(2);
  });
  it('uses logical message count for auto-compaction, not the number of actions', async () => {
    const settings = { ...migrateSettings(), model: 'test', apiKey: 'key', maxHistoryMessages: 4 };
    const summary = vi.spyOn(LLMClient, 'summarizeHistory').mockResolvedValue('Summary');
    vi.spyOn(LLMClient, 'chat').mockResolvedValue({ content: 'Done', usage: { input: 1, output: 1, estimated: false } });
    const messages = [user('u1'), ...Array.from({ length: 20 }, (_, i) => step(`step${i}`, 'one')), user('u2')];
    await runAgent(settings, { id: 's', title: 't', createdAt: 1, updatedAt: 1, messages }, new AbortController().signal,
      { update() {}, chunk() {}, execute: vi.fn(), settings: async () => settings }, true);
    expect(summary).not.toHaveBeenCalled();
  });
});

describe('automatic interface language', () => {
  it('defaults missing or invalid settings to auto', () => {
    expect(migrateSettings().language).toBe('auto');
    expect(migrateSettings({ language: undefined }).language).toBe('auto');
    expect(migrateSettings({ language: 'invalid' as any }).language).toBe('auto');
  });
  it('prefers the browser UI language over website language preferences', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'ru-RU' } });
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(resolveLanguage()).toBe('ru');
  });
  it('falls back to navigator and supported English for other languages', () => {
    vi.stubGlobal('chrome', undefined); vi.stubGlobal('navigator', { languages: ['ru-KZ'], language: 'en' });
    expect(resolveLanguage()).toBe('ru');
    vi.stubGlobal('navigator', { languages: ['de-DE'] }); expect(resolveLanguage()).toBe('en');
  });
  it('preserves an explicit user choice', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'en-US' } });
    expect(resolveLanguage('ru')).toBe('ru'); expect(resolveLanguage('en')).toBe('en');
  });
});
