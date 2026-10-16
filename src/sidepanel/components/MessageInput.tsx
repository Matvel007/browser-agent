import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { tr } from '../../services/i18n';

export const SLASH_COMMANDS = [
  { command: '/compact', ru: 'Сжать контекст, сохранив историю', en: 'Compact context, keep transcript' },
  { command: '/clear', ru: 'Очистить текущий чат', en: 'Clear this chat' },
  { command: '/new', ru: 'Новый диалог', en: 'New conversation' },
  { command: '/model', ru: 'Модели и подключение', en: 'Models & connection' },
  { command: '/tools', ru: 'Настройки инструментов', en: 'Tool settings' },
  { command: '/settings', ru: 'Настройки интерфейса', en: 'Interface settings' },
  { command: '/help', ru: 'Список команд', en: 'Available commands' },
];
interface Props { onSendMessage: (text: string) => void; onStop: () => void; isGenerating: boolean; disabled?: boolean; initialText?: string; onTextConsumed?: () => void; onExecuteCommand?: (command: string) => void }

export const MessageInput: React.FC<Props> = ({ onSendMessage, onStop, isGenerating, disabled, initialText, onTextConsumed, onExecuteCommand }) => {
  const [input, setInput] = useState(''), [selected, setSelected] = useState(0), [dismissed, setDismissed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (initialText) { setInput(initialText); onTextConsumed?.(); field.current?.focus(); }
  }, [initialText]);
  useEffect(() => { if (field.current) { field.current.style.height = 'auto'; field.current.style.height = `${Math.min(160, field.current.scrollHeight)}px`; } }, [input]);
  const commands = !dismissed && input.startsWith('/') && !input.includes(' ') ? SLASH_COMMANDS.filter(cmd => cmd.command.startsWith(input.toLowerCase())) : [];
  const submit = (text?: string) => {
    const value = (text || input).trim();
    if (!value || disabled || isGenerating) return;
    if (value.startsWith('/')) onExecuteCommand?.(value); else onSendMessage(value);
    setInput(''); setSelected(0); setDismissed(false);
  };
  return <form className="composer" onSubmit={event => { event.preventDefault(); submit(commands[selected]?.command); }}>
    {commands.length > 0 && <div className="command-menu" role="listbox" aria-label={tr('Команды', 'Commands')}>{commands.map((cmd, i) => <button key={cmd.command} type="button" role="option" aria-selected={selected === i} onClick={() => submit(cmd.command)}><code>{cmd.command}</code><span>{tr(cmd.ru, cmd.en)}</span></button>)}</div>}
    <textarea ref={field} aria-label={tr('Сообщение', 'Message')} value={input} rows={1} placeholder={tr('Введите сообщение…', 'Enter a message…')} disabled={disabled}
      onChange={event => { setInput(event.target.value); setSelected(0); setDismissed(false); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { setDismissed(true); return; }
        if (commands.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setSelected(i => (i + (event.key === 'ArrowDown' ? 1 : commands.length - 1)) % commands.length); return; }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(commands[selected]?.command); }
      }} />
    {isGenerating ? <button type="button" className="send-button" aria-label={tr('Остановить', 'Stop')} onClick={onStop}><Square size={16} /></button>
      : <button type="submit" className="send-button" disabled={disabled || !input.trim()} aria-label={tr('Отправить', 'Send')}><ArrowUp size={18} /></button>}
  </form>;
};
