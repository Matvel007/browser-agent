import { ChatMessage } from '../types';

export interface TranscriptGroup {
  id: string;
  role: ChatMessage['role'];
  index: number;
  runId?: string;
  messages: ChatMessage[];
}

/** Display turns without changing the tool-call/result ledger sent to providers. */
export function groupTranscript(messages: ChatMessage[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  let assistant: TranscriptGroup | undefined;
  messages.forEach((message, index) => {
    if (message.isCompressionCard) {
      if (assistant) assistant.messages.push(message);
      else groups.push({ id: message.id, role: message.role, index, messages: [message] });
      return;
    }
    if (message.role === 'assistant' && assistant && (!message.runId || !assistant.runId || message.runId === assistant.runId)) {
      assistant.runId ||= message.runId;
      assistant.messages.push(message);
      return;
    }
    const group = { id: message.id, role: message.role, index, runId: message.runId, messages: [message] };
    groups.push(group);
    assistant = message.role === 'assistant' ? group : undefined;
  });
  return groups;
}

export function logicalMessageCount(messages: ChatMessage[]): number {
  return groupTranscript(messages).filter(group => group.role === 'user' || group.role === 'assistant').length;
}
