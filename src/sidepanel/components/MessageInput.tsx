import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Sparkles } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

const QUICK_PROMPTS = [
  '🔍 Проверить ошибки в Console',
  '🌐 Инспектировать сетевые запросы API',
  '📄 Сделать саммари этой страницы',
  '📸 Сделать скриншот страницы',
];

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onStop,
  isGenerating,
  disabled,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating || disabled) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-3 border-t border-[#383838] bg-[#171717] flex flex-col gap-2">
      {/* Quick suggestions */}
      {!isGenerating && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(prompt)}
              className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-[#242424] hover:bg-[#2e2e2e] text-[#ccc] border border-[#383838] transition-colors flex items-center gap-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-[#10a37f]" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input container */}
      <div className="relative flex items-end bg-[#2f2f2f] rounded-2xl border border-[#404040] focus-within:border-[#606060] transition-colors px-3 py-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Спросите или дайте команду (Enter для отправки)..."
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent text-sm text-[#ececec] placeholder-[#888] resize-none outline-none max-h-40 overflow-y-auto leading-relaxed py-1"
        />

        <div className="ml-2 flex-shrink-0 flex items-center">
          {isGenerating ? (
            <button
              type="button"
              onClick={onStop}
              title="Остановить генерацию"
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:opacity-85 transition-opacity"
            >
              <Square className="w-3.5 h-3.5 fill-black" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || disabled}
              title="Отправить сообщение"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                input.trim() && !disabled
                  ? 'bg-white text-black hover:opacity-85 shadow-sm'
                  : 'bg-[#404040] text-[#777] cursor-not-allowed'
              }`}
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
