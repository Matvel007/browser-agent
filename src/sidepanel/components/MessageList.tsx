import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check } from 'lucide-react';
import { ChatMessage } from '../../types';
import { ToolStepCard } from './ToolStepCard';

interface MessageListProps {
  messages: ChatMessage[];
  isGenerating: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isGenerating }) => {
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
    <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-5">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#888] select-none">
          <div className="w-12 h-12 rounded-2xl bg-[#10a37f]/10 border border-[#10a37f]/20 flex items-center justify-center text-[#10a37f] mb-3">
            <Bot className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-[#ececec] mb-1">Чем помочь сегодня?</h2>
          <p className="text-xs text-[#888] max-w-[260px] leading-relaxed">
            Я могу анализировать страницы, кликать, заполнять формы, отлаживать консоль и исследовать сетевые запросы через Chrome DevTools.
          </p>
        </div>
      ) : (
        messages.map((message) => {
          const isUser = message.role === 'user';

          return (
            <div
              key={message.id}
              className={`flex gap-3 text-sm leading-relaxed ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Bot Avatar */}
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-[#10a37f] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              {/* Message Content Bubble */}
              <div
                className={`group relative max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                  isUser
                    ? 'bg-[#303030] text-[#ececec] rounded-tr-sm'
                    : 'bg-transparent text-[#ececec] -ml-1 flex-1'
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

                {/* Markdown text for Assistant or simple text for User */}
                {isUser ? (
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                ) : (
                  <div className="prose-dark text-sm break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>

                    {/* Blinking cursor while streaming */}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-[#10a37f] animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                )}

                {/* Copy button for Assistant messages */}
                {!isUser && message.content && (
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    title="Скопировать ответ"
                    className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 p-1 text-[#888] hover:text-[#ececec] rounded flex items-center gap-1 text-[11px]"
                  >
                    {copiedId === message.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* User Avatar */}
              {isUser && (
                <div className="w-7 h-7 rounded-full bg-[#383838] flex items-center justify-center text-[#ccc] flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
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
