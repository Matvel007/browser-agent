import { AppSettings, ChatMessage, ChatSession, ContextSummary } from '../types';
import { envelope } from './budget';
import { ChatOptions, promptEstimate } from './llm';
import { groupTranscript } from './transcript';

export function buildContext(session: ChatSession): ChatMessage[] {
  const transcript = session.messages.filter(message => !message.isCompressionCard);
  let start = 0;
  if (session.summary) {
    const index = transcript.findIndex(m => m.id === session.summary!.throughId);
    if (index >= 0) start = index + 1;
    // A rollback can invalidate a summary: fail open to the visible transcript, not stale future facts.
    else return transcript;
  }
  return [
    ...(session.summary ? [{ id: 'context-summary', role: 'system' as const, content: `Conversation summary (earlier observations may be stale):\n${session.summary.text}`, timestamp: session.summary.createdAt }] : []),
    ...transcript.slice(start).map(message => ({ ...message, toolCalls: message.toolCalls?.map(call => ({ ...call,
      args: JSON.stringify(call.args).length > 64000 ? { note: 'Large legacy arguments excluded' } : call.args,
      result: call.result?.tokens_est != null ? call.result : envelope(call.result ?? { error: call.error }, { ok: call.status === 'success' }),
    })) })),
  ];
}

export function contextCosts(settings: AppSettings, session: ChatSession, options: ChatOptions = {}) {
  const parts = promptEstimate(settings, buildContext(session), options);
  const input = Object.values(parts).reduce((sum, n) => sum + n, 0);
  return { ...parts, input, reserve: settings.maxOutputTokens, total: input + settings.maxOutputTokens };
}

export function compressionBoundary(session: ChatSession, keepRecent = 6) {
  const messages = session.messages.filter(m => !m.isCompressionCard);
  // Cut at a complete user turn, never split assistant tool_use/tool_result pairs.
  const userIndexes = messages.map((m, index) => m.role === 'user' ? index : -1).filter(index => index >= 0);
  const turns = groupTranscript(messages).filter(group => group.role === 'user' || group.role === 'assistant');
  const recentStart = turns[Math.max(0, turns.length - keepRecent)]?.index || 0;
  const boundary = keepRecent === 0 && messages.length >= 2 && messages.at(-1)?.role === 'assistant'
    ? messages.length : userIndexes.filter(index => index <= recentStart && index > 0).at(-1) ?? userIndexes.filter(index => index > 0).at(-1);
  if (boundary == null) return undefined;
  const through = messages[boundary - 1];
  if (through.id === session.summary?.throughId) return undefined;
  const previousIndex = messages.findIndex(m => m.id === session.summary?.throughId);
  return { messages: messages.slice(previousIndex + 1, boundary), throughId: through.id };
}

export function summaryForRollback(summary: ContextSummary | undefined, remaining: ChatMessage[]) {
  return summary && remaining.some(m => m.id === summary.throughId) ? summary : undefined;
}

export function contextToolCosts(session: ChatSession) {
  const costs: Record<string, number> = {};
  for (const message of buildContext(session)) for (const call of message.toolCalls || []) {
    if (call.result?.tokens_est) costs[call.name] = (costs[call.name] || 0) + call.result.tokens_est;
  }
  return Object.entries(costs).sort((a, b) => b[1] - a[1]).slice(0, 5);
}
