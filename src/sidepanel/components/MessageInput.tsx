import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { t } from '../../services/i18n';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  initialText?: string;
  onTextConsumed?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onStop,
  isGenerating,
  disabled,
  initialText,
  onTextConsumed,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync initialText if provided (e.g. from rollback)
  useEffect(() => {
    if (initialText !== undefined && initialText !== '') {
      setInput(initialText);
      onTextConsumed?.();
      textareaRef.current?.focus();
    }
  }, [initialText, onTextConsumed]);

  // Adjust textarea height without jumpiness
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
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
    <div className="p-3 bg-agent-surface">
      <div className="relative flex items-center bg-agent-card rounded-xl border border-agent-border focus-within:border-agent-accent transition-colors px-3 py-1.5 shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('input_placeholder')}
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent text-xs text-agent-text placeholder-agent-muted resize-none outline-none max-h-36 overflow-y-auto leading-relaxed py-1"
        />

        <div className="ml-2 flex-shrink-0 flex items-center">
          {isGenerating ? (
            <button
              type="button"
              onClick={onStop}
              title={t('stop_generation')}
              className="w-7 h-7 rounded-lg bg-agent-text text-agent-bg flex items-center justify-center hover:opacity-85 transition-opacity"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || disabled}
              title={t('send_message')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                input.trim() && !disabled
                  ? 'bg-agent-accent text-white hover:opacity-90 shadow-sm'
                  : 'bg-agent-surface text-agent-muted cursor-not-allowed border border-agent-border'
              }`}
            >
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
