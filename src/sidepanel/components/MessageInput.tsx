import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Terminal } from 'lucide-react';
import { t } from '../../services/i18n';

export interface SlashCommand {
  command: string;
  description: string;
  icon?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/compact',
    description: 'Сжать историю диалога и освободить контекст',
    icon: '🗜️',
  },
  {
    command: '/clear',
    description: 'Очистить сообщения текущего чата',
    icon: '🗑️',
  },
  {
    command: '/new',
    description: 'Создать новый диалог',
    icon: '✨',
  },
  {
    command: '/settings',
    description: 'Открыть настройки провайдера и расширения',
    icon: '⚙️',
  },
  {
    command: '/help',
    description: 'Справка по доступным командам',
    icon: '❓',
  },
];

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  initialText?: string;
  onTextConsumed?: () => void;
  onExecuteCommand?: (command: string) => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onStop,
  isGenerating,
  disabled,
  initialText,
  onTextConsumed,
  onExecuteCommand,
}) => {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommands, setShowCommands] = useState(false);
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

  // Handle slash commands visibility
  const matchingCommands = input.startsWith('/') && !input.includes(' ')
    ? SLASH_COMMANDS.filter((cmd) => cmd.command.toLowerCase().startsWith(input.toLowerCase()))
    : [];

  useEffect(() => {
    if (matchingCommands.length > 0) {
      setShowCommands(true);
      setSelectedIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  const executeSelectedCommand = (cmdStr: string) => {
    setShowCommands(false);
    setInput('');
    if (onExecuteCommand) {
      onExecuteCommand(cmdStr);
    } else {
      onSendMessage(cmdStr);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isGenerating || disabled) return;

    if (showCommands && matchingCommands.length > 0) {
      executeSelectedCommand(matchingCommands[selectedIndex].command);
      return;
    }

    if (trimmed.startsWith('/')) {
      executeSelectedCommand(trimmed);
      return;
    }

    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands && matchingCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % matchingCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + matchingCommands.length) % matchingCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        executeSelectedCommand(matchingCommands[selectedIndex].command);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative p-3 bg-agent-surface">
      {/* Slash Commands Dropdown Menu */}
      {showCommands && matchingCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-agent-card border border-agent-border rounded-xl shadow-2xl overflow-hidden z-50 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-1.5 border-b border-agent-border/70 bg-agent-surface text-[10px] font-semibold text-agent-muted uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-3 h-3 text-agent-accent" />
            <span>Команды чата</span>
          </div>
          <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
            {matchingCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => executeSelectedCommand(cmd.command)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-agent-accent text-white'
                      : 'hover:bg-agent-surface text-agent-text'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cmd.icon}</span>
                    <span className="font-mono font-medium text-xs">{cmd.command}</span>
                  </div>
                  <span
                    className={`text-[11px] truncate max-w-[200px] ${
                      isSelected ? 'text-white/80' : 'text-agent-muted'
                    }`}
                  >
                    {cmd.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input Field */}
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
