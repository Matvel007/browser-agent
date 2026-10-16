import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, Undo2, Settings, ChevronDown } from 'lucide-react';
import { ChatMessage } from '../../types';
import { ToolStepCard } from './ToolStepCard';
import { t } from '../../services/i18n';

interface MessageListProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  onOpenSettings?: () => void;
  onRollback?: (index: number, content: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isGenerating,
  onOpenSettings,
  onRollback,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [expandedCompMap, setExpandedCompMap] = React.useState<Record<string, boolean>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCompExpand = (id: string) => {
    setExpandedCompMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-agent-muted select-none">
          <div className="w-11 h-11 rounded-xl bg-agent-card border border-agent-border flex items-center justify-center text-agent-accent mb-3 shadow-sm">
            <Bot className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-semibold text-agent-text mb-1">
            {t('welcome_title')}
          </h2>
          <p className="text-xs text-agent-muted max-w-[260px] leading-relaxed">
            {t('welcome_subtitle')}
          </p>
        </div>
      ) : (
        messages.map((message, index) => {
          if (message.isCompressionCard) {
            const isExpanded = Boolean(expandedCompMap[message.id]);
            return (
              <div key={message.id} className="my-2.5 flex justify-center w-full">
                <div className="w-full max-w-[94%] bg-agent-card border border-agent-border hover:border-agent-accent/40 rounded-xl overflow-hidden transition-all shadow-sm">
                  {/* Collapsed Header Bar */}
                  <button
                    type="button"
                    onClick={() => toggleCompExpand(message.id)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-xs bg-agent-surface/60 hover:bg-agent-surface transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">🗜️</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-agent-text text-xs">Сжатие контекста</span>
                        <span className="text-agent-muted text-[11px]">
                          (сжато {message.compressedCount || 0} сообщ.
                          {message.tokensSaved ? `, сохранено ~${Math.round(message.tokensSaved / 1000)}k токенов` : ''})
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-agent-muted transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-agent-text' : ''
                      }`}
                    />
                  </button>

                  {/* Collapsible Content */}
                  {isExpanded && (
                    <div className="p-3 border-t border-agent-border bg-agent-card text-xs text-agent-text space-y-1.5 animate-in fade-in duration-150">
                      <div className="text-[11px] font-medium text-agent-accent">
                        Сводка сохранённого контекста:
                      </div>
                      <div className="text-agent-muted text-xs leading-relaxed whitespace-pre-wrap font-sans">
                        {message.summaryText || message.content}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const isUser = message.role === 'user';

          if (isUser) {
            return (
              <div
                key={message.id}
                className="flex gap-2 text-sm leading-relaxed justify-end group"
              >
                <div className="flex flex-col items-end max-w-[82%]">
                  {/* Bubble card */}
                  <div className="rounded-xl px-3.5 py-2 border bg-agent-card border-agent-border text-agent-text rounded-tr-sm text-xs whitespace-pre-wrap break-words shadow-sm">
                    {message.content}
                  </div>

                  {/* Actions UNDER the bubble */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center gap-2.5 text-[11px] text-agent-muted px-1 select-none">
                    <button
                      type="button"
                      onClick={() => handleCopy(message.content, message.id)}
                      title={t('copy_message')}
                      className="hover:text-agent-text rounded flex items-center gap-1 transition-colors"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500">{t('copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('copy_message')}</span>
                        </>
                      )}
                    </button>

                    {onRollback && (
                      <button
                        type="button"
                        onClick={() => onRollback(index, message.content)}
                        title={t('rollback_message')}
                        className="hover:text-agent-accent rounded flex items-center gap-1 transition-colors"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>{t('rollback_message')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* User Avatar */}
                <div className="w-6 h-6 rounded-md bg-agent-surface border border-agent-border flex items-center justify-center text-agent-muted flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className="flex gap-2.5 text-sm leading-relaxed justify-start group"
            >
              {/* Bot Avatar */}
              <div className="w-6 h-6 rounded-md bg-agent-card border border-agent-border flex items-center justify-center text-agent-accent flex-shrink-0 mt-0.5 shadow-sm">
                <Bot className="w-3.5 h-3.5" />
              </div>

              <div className="flex-1 flex flex-col items-start max-w-[90%] -ml-1">
                {/* Tool calls rendered as step cards */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="mb-2 w-full">
                    {message.toolCalls.map((tc) => (
                      <ToolStepCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}

                {/* Markdown text */}
                <div className="prose-agent text-xs break-words text-agent-text w-full">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>

                  {/* Blinking cursor while streaming */}
                  {message.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-agent-accent animate-pulse ml-0.5 align-middle" />
                  )}

                  {/* Open Settings button if message prompts to configure */}
                  {(message.content.includes('Настройки') || message.content.includes('Settings')) &&
                    onOpenSettings && (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="px-3 py-1.5 rounded-md bg-agent-card hover:bg-agent-border border border-agent-border text-agent-text text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Settings className="w-3.5 h-3.5 text-agent-accent" />
                          <span>{t('open_settings')}</span>
                        </button>
                      </div>
                    )}
                </div>

                {/* Actions UNDER the assistant message */}
                {message.content && !message.isStreaming && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center gap-2 text-[11px] text-agent-muted select-none">
                    <button
                      type="button"
                      onClick={() => handleCopy(message.content, message.id)}
                      title={t('copy_message')}
                      className="hover:text-agent-text rounded flex items-center gap-1 transition-colors"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500">{t('copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('copy_message')}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
};
