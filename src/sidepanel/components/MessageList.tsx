import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Copy, Undo2 } from 'lucide-react';
import { ChatMessage } from '../../types';
import { i18n, tr } from '../../services/i18n';
import { ToolStepCard } from './ToolStepCard';
import { groupTranscript } from '../../services/transcript';
import { TOOLS, toolLabel } from '../../services/tools';
import { AgentLogo } from './AgentLogo';

interface Props { messages: ChatMessage[]; sessionId?: string; isGenerating: boolean; onOpenSettings?: () => void; onRollback?: (index: number, content: string) => void }
export const MessageList: React.FC<Props> = ({ messages, sessionId, isGenerating, onOpenSettings, onRollback }) => {
  const scroller = useRef<HTMLDivElement>(null), follow = useRef(true);
  const [copied, setCopied] = useState(''), [copyError, setCopyError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { if (follow.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages, isGenerating]);
  useEffect(() => { follow.current = true; }, [sessionId]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const groups = groupTranscript(messages);
  const compression = (message: ChatMessage) => <details className="compression-card" key={message.id}><summary>{tr('Контекст сжат · история сохранена', 'Context compacted · transcript preserved')}</summary><p>{message.summaryText || message.content}</p></details>;
  return <div className="message-list" ref={scroller} onScroll={() => { const el = scroller.current!; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
    {!messages.length && <div className="empty-chat"><AgentLogo className="welcome-logo" /><h2>Browser Agent</h2><p>{tr('Задайте вопрос или поручите действие в браузере.', 'Ask a question or request an action in the browser.')}</p><button className="button" type="button" onClick={onOpenSettings}>{tr('Настроить модель', 'Configure model')}</button><small>{tr('Команды: /help', 'Commands: /help')}</small></div>}
    {groups.map((group, groupIndex) => {
      const parts = group.messages.filter(m => !m.isCompressionCard);
      if (!parts.length) return group.messages.map(compression);
      const calls = parts.flatMap(m => m.toolCalls || []);
      const progress = parts.filter(m => m.toolCalls?.length && m.content.trim());
      const content = parts.filter(m => !m.toolCalls?.length).map(m => m.content).filter(Boolean).join('\n\n');
      const active = isGenerating && groupIndex === groups.length - 1 && group.role === 'assistant';
      const current = calls.find(call => call.status === 'running') || calls.find(call => call.status === 'pending');
      const failed = calls.filter(call => call.status === 'error').length;
      const completed = calls.filter(call => call.status === 'success').length;
      const usage = parts.flatMap(m => m.usage ? [m.usage] : []);
      const status = [...parts].reverse().find(m => m.status)?.status;
      const summary = active ? (current ? toolLabel(TOOLS.find(tool => tool.name === current.name)?.title || current.name, i18n.getLanguage()) : tr('Выполнение…', 'Working…'))
        : `${completed}/${calls.length} ${tr('выполнено', 'completed')}${failed ? ` · ${failed} ${tr('с ошибкой', 'failed')}` : ''}`;
      return <article className={`message ${group.role}`} key={group.id}>
        <header><div className="message-identity">{group.role === 'assistant' && <AgentLogo />}<strong>{group.role === 'user' ? tr('Вы', 'You') : 'Browser Agent'}</strong></div><div className="message-actions">
          {content && <button type="button" aria-label={tr('Копировать сообщение', 'Copy message')} title={tr('Копировать', 'Copy')} onClick={() => {
            void navigator.clipboard.writeText(content).then(() => { setCopied(group.id); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(''), 1500); }).catch(() => setCopyError(tr('Не удалось скопировать текст.', 'Could not copy text.')));
          }}>{copied === group.id ? tr('Скопировано', 'Copied') : <Copy size={14} />}</button>}
          {group.role === 'user' && onRollback && <button type="button" disabled={isGenerating} aria-label={tr('Редактировать с этого сообщения', 'Edit from this message')} onClick={() => onRollback(group.index, content)}><Undo2 size={14} /></button>}
        </div></header>
        {!!calls.length && <details className="action-summary">
          <summary><span>{tr('Свод действий', 'Actions')} · {calls.length}</span><small>{summary}</small><ChevronDown size={14} /></summary>
          <div className="action-steps">{calls.map(call => <ToolStepCard key={call.id} toolCall={call} sessionId={sessionId} />)}
            {progress.length > 0 && <details className="progress-notes"><summary>{tr('Ход выполнения', 'Progress notes')}</summary>{progress.map(m => <p key={m.id}>{m.content}</p>)}</details>}
          </div>
        </details>}
        {content && <div className="prose-agent"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
          img: ({ src, alt }) => <a href={src} target="_blank" rel="noopener noreferrer">{alt || tr('Изображение', 'Image')}</a>,
        }}>{content}</ReactMarkdown></div>}
        {active && <small role="status">{parts.some(m => m.isStreaming) ? tr('Генерация…', 'Generating…') : tr('Выполнение задачи…', 'Working…')}</small>}
        {!active && usage.length > 0 && <small className="usage" title={tr('Суммарное использование API для этого ответа, включая промежуточные запросы.', 'Total API usage for this reply, including intermediate requests.')}>
          {tr('Всего за ответ', 'Reply total')} · {usage.length > 1 ? `${usage.length} ${tr('запр.', 'requests')} · ` : ''}{usage.some(u => u.estimated) ? '~' : ''}{usage.reduce((sum, u) => sum + u.input, 0).toLocaleString()} in · {usage.reduce((sum, u) => sum + u.output, 0).toLocaleString()} out
        </small>}
        {status && status !== 'completed' && <small className="status-label">{({ stopped: tr('Остановлено', 'Stopped'), error: tr('Ошибка', 'Error'), limit: tr('Лимит', 'Limit') })[status]}</small>}
        {group.messages.filter(m => m.isCompressionCard).map(compression)}
      </article>;
    })}
    {isGenerating && groups.at(-1)?.role !== 'assistant' && <p className="hint" role="status">{tr('Выполнение задачи…', 'Working…')}</p>}
    {copyError && <p className="error-text" role="status">{copyError}</p>}
  </div>;
};
