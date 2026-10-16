import { AppSettings, ChatMessage, ChatSession, ToolCallRecord } from '../types';
import { getArtifact } from './artifacts';
import { envelope } from './budget';
import { buildContext, compressionBoundary, contextCosts } from './context';
import { ChatOptions, LLMClient } from './llm';
import { getSettings } from './storage';
import { logicalMessageCount } from './transcript';
import { tr } from './i18n';

export interface AgentHooks {
  update: (session: ChatSession) => void;
  chunk: (session: ChatSession) => void;
  execute: (call: ToolCallRecord, profile: string) => Promise<any>;
  settings?: () => Promise<AppSettings>;
  browserState?: () => string;
}

export async function compactSession(settings: AppSettings, session: ChatSession, signal?: AbortSignal, keepRecent = 6): Promise<ChatSession> {
  const boundary = compressionBoundary(session, keepRecent);
  if (!boundary) throw new Error(tr('Для сжатия нужен завершённый диалог с новыми сообщениями. История сохранена.', 'Compaction needs a completed conversation with new messages. History is preserved.'));
  const text = await LLMClient.summarizeHistory(settings, boundary.messages, signal, session.summary?.text);
  signal?.throwIfAborted();
  const card: ChatMessage = { id: crypto.randomUUID(), role: 'system', content: text, summaryText: text, summaryThroughId: boundary.throughId,
    timestamp: Date.now(), isCompressionCard: true, compressedCount: boundary.messages.length };
  return { ...session, messages: [...session.messages, card], summary: { text, throughId: boundary.throughId, createdAt: Date.now() }, updatedAt: Date.now() };
}

export async function runAgent(settings: AppSettings, initial: ChatSession, signal: AbortSignal, hooks: AgentHooks, hasBrowser: boolean): Promise<ChatSession> {
  let session = initial, finalStatus: ChatMessage['status'] = 'completed', terminal = false;
  const runId = crypto.randomUUID();
  let currentMessage: ChatMessage | undefined;
  let images: NonNullable<ChatOptions['images']> = [];
  let executed = 0;
  const publish = () => { session = { ...session, updatedAt: Date.now() }; hooks.update(session); };
  const replace = (message: ChatMessage, chunk = false) => {
    currentMessage = message;
    session = { ...session, messages: session.messages.map(m => m.id === message.id ? message : m), updatedAt: Date.now() };
    if (chunk) hooks.chunk(session); else hooks.update(session);
  };
  try {
    for (let step = 0; step <= settings.maxSteps + 1; step++) {
      signal.throwIfAborted();
      const live = await (hooks.settings || getSettings)();
      // Provider and model are fixed for this run; tool toggles and output budget are refreshed each step.
      settings = { ...settings, disabledTools: live.disabledTools, searchEnabled: live.searchEnabled, toolProfile: live.toolProfile };
      const browserState = hooks.browserState?.();
      let costs = contextCosts(settings, session, { hasBrowser, images, browserState });
      if (costs.total >= settings.maxContextTokens * ((settings.compressionThreshold || 75) / 100)
        || logicalMessageCount(buildContext(session)) > settings.maxHistoryMessages) {
        const boundary = compressionBoundary(session);
        if (boundary) {
          session = await compactSession(settings, session, signal); publish();
          costs = contextCosts(settings, session, { hasBrowser, images, browserState });
        }
      }
      if (costs.total > settings.maxContextTokens) throw new Error(tr('Контекст текущей задачи превышает бюджет модели. История сохранена; выберите большее окно или начните новый чат с нужными данными.', 'The current task context exceeds the model budget. History is preserved; choose a larger window or start a new chat with the needed data.'));
      const finalize = step >= settings.maxSteps || terminal;
      if (step >= settings.maxSteps) finalStatus = 'limit';
      let assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true, runId };
      session = { ...session, messages: [...session.messages, assistant] }; currentMessage = assistant; publish();
      const result = await LLMClient.chat(settings, buildContext({ ...session, messages: session.messages.slice(0, -1) }), {
        onChunk: content => { signal.throwIfAborted(); assistant = { ...assistant, content }; replace(assistant, true); },
      }, signal, { tools: !finalize, finalize, hasBrowser, images, browserState });
      images = [];
      assistant = { ...assistant, content: result.content, toolCalls: result.toolCalls, usage: result.usage, isStreaming: false };
      replace(assistant);
      if (!result.toolCalls?.length) {
        if (assistant.content.trim()) {
          if (result.finishReason === 'incomplete') {
            assistant = { ...assistant, content: `${assistant.content}\n\n${tr('Поток API завершился без маркера окончания. Ответ может быть неполным.', 'The API stream ended without a completion marker. The reply may be incomplete.')}`, status: 'error' };
          } else if (result.finishReason && /length|max_tokens|MAX_TOKENS/.test(result.finishReason)) {
            assistant = { ...assistant, content: `${assistant.content}\n\n${tr('Ответ остановлен по лимиту вывода. Можно попросить продолжить.', 'The reply stopped at the output limit. You can ask it to continue.')}`, status: 'limit' };
          } else assistant = { ...assistant, status: finalStatus };
          replace(assistant); return session;
        }
        if (!terminal) { terminal = true; continue; }
        throw new Error(tr('Модель не вернула итоговый текст.', 'The model returned no final text.'));
      }
      if (finalize) {
        replace({ ...assistant, toolCalls: result.toolCalls.map(call => ({ ...call, status: 'cancelled' })), content: assistant.content || tr('Достигнут лимит шагов. Новые действия не выполнялись.', 'Step limit reached. No new actions were run.'), status: 'limit' });
        return session;
      }
      const lean = costs.total > settings.maxContextTokens * 0.65;
      for (let i = 0; i < result.toolCalls.length; i++) {
        signal.throwIfAborted();
        let call = { ...result.toolCalls[i], status: 'running' as const } as ToolCallRecord;
        const updateCall = () => {
          const calls = [...assistant.toolCalls!]; calls[i] = call; assistant = { ...assistant, toolCalls: calls }; replace(assistant);
        };
        updateCall();
        try {
          call.result = await hooks.execute(call, lean && !call.args.profile && !call.args.full ? 'lean' : settings.toolProfile);
          signal.throwIfAborted();
          call.status = call.result.ok === false ? 'error' : 'success';
          if (call.result.ok) executed++;
          if (call.args.vision && call.result.artifact?.mime.startsWith('image/')) {
            let attached = false;
            let note = settings.supportsVision ? 'Image attachment limit reached; request a smaller image or another turn.' : 'Vision is disabled in model settings. The image remains available in the chat.';
            if (settings.supportsVision && images.length < 2) {
              const row = await getArtifact(call.result.artifact.id, session.id);
              if (row.bytes <= 2 * 1024 * 1024) {
              const bytes = new Uint8Array(await row.blob.arrayBuffer()); let binary = '';
              for (const byte of bytes) binary += String.fromCharCode(byte);
              images.push({ mime: row.mime, data: btoa(binary) });
                attached = true; note = 'Image is attached separately to the next model request.';
              } else note = 'Image exceeds the 2 MiB vision attachment limit. Request a smaller region/quality.';
            }
            call.result = envelope({ ...call.result.data, visionAttached: attached, visionNote: note }, {
              profile: call.result.profile, summary: call.result.summary, artifact: call.result.artifact, next: call.result.next, truncation: call.result.truncation,
            });
          }
        } catch (err: any) {
          call.status = signal.aborted ? 'cancelled' : 'error';
          call.error = String(err?.message || err);
          call.result = envelope({ error: call.error }, { ok: false, profile: 'lean' });
        }
        updateCall();
      }
    }
  } catch (err: any) {
    finalStatus = signal.aborted ? 'stopped' : 'error';
    if (currentMessage) {
      const calls = currentMessage.toolCalls?.map(call => ['pending', 'running'].includes(call.status) ? { ...call, status: 'cancelled' as const } : call);
      replace({ ...currentMessage, toolCalls: calls, isStreaming: false });
    }
    const content = signal.aborted
      ? tr(`Выполнение остановлено. Успешных действий: ${executed}. Частичный ответ и результаты сохранены. Уже отправленные браузеру команды могли завершиться.`, `Run stopped. Successful actions: ${executed}. Partial reply and results are saved. Browser commands already sent may have completed.`)
      : tr(`Выполнение завершено с ошибкой: ${err?.message || err}\n\nУспешных действий: ${executed}. История и результаты сохранены.`, `Run failed: ${err?.message || err}\n\nSuccessful actions: ${executed}. History and results are saved.`);
    session = { ...session, messages: [...session.messages, { id: crypto.randomUUID(), role: 'assistant', content, timestamp: Date.now(), status: finalStatus, runId }] }; publish();
  }
  return session;
}
