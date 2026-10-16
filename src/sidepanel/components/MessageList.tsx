import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, Undo2, Settings } from 'lucide-react';
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
          const isUser = message.role === 'user';

          return (
            <div
              key={message.id}
              className={`flex gap-2.5 text-sm leading-relaxed ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Bot Avatar */}
              {!isUser && (
                <div className="w-6 h-6 rounded-md bg-agent-card border border-agent-border flex items-center justify-center text-agent-accent flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Message Bubble Container */}
              <div
                className={`group relative max-w-[88%] rounded-xl px-3.5 py-2.5 border ${
                  isUser
                    ? 'bg-agent-card border-agent-border text-agent-text rounded-tr-sm'
                    : 'bg-transparent border-transparent text-agent-text -ml-1 flex-1'
                }`}
              >
                {/* Tool calls rendered as step cards */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="mb-2">
                    {message.toolCalls.map((tc) => (
                      <ToolStepCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}

                {/* Markdown text or User text */}
                {isUser ? (
                  <div className="whitespace-pre-wrap text-xs text-agent-text">{message.content}</div>
                ) : (
                  <div className="prose-agent text-xs break-words">
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
                )}

                {/* Action buttons (Copy & Rollback for User, Copy for Assistant) */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center gap-2 text-[11px] text-agent-muted">
                  {/* Copy button */}
                  <button
                    type="button"
                    onClick={() => handleCopy(message.content, message.id)}
                    title={t('copy_message')}
                    className="hover:text-agent-text rounded flex items-center gap-1"
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

                  {/* Rollback button on user message (OpenCode style) */}
                  {isUser && onRollback && (
                    <button
                      type="button"
                      onClick={() => onRollback(index, message.content)}
                      title={t('rollback_message')}
                      className="hover:text-agent-accent rounded flex items-center gap-1"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>{t('rollback_message')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* User Avatar */}
              {isUser && (
                <div className="w-6 h-6 rounded-md bg-agent-surface border border-agent-border flex items-center justify-center text-agent-muted flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
};
