import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react';
import { Attachment } from '../../types';
import { ATTACHMENT_LIMITS, attachmentDataUrl, formatBytes, readAttachment } from '../../services/attachments';
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
interface Props { onSendMessage: (text: string, attachments: Attachment[]) => void; onStop: () => void; isGenerating: boolean; disabled?: boolean; supportsVision?: boolean; initialText?: string; onTextConsumed?: () => void; onExecuteCommand?: (command: string) => void }

export const MessageInput: React.FC<Props> = ({ onSendMessage, onStop, isGenerating, disabled, supportsVision, initialText, onTextConsumed, onExecuteCommand }) => {
  const [input, setInput] = useState(''), [selected, setSelected] = useState(0), [dismissed, setDismissed] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]), [attachError, setAttachError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initialText) { setInput(initialText); onTextConsumed?.(); field.current?.focus(); }
  }, [initialText]);
  useEffect(() => { if (field.current) { field.current.style.height = 'auto'; field.current.style.height = `${Math.min(160, field.current.scrollHeight)}px`; } }, [input]);
  const commands = !attachments.length && !dismissed && input.startsWith('/') && !input.includes(' ') ? SLASH_COMMANDS.filter(cmd => cmd.command.startsWith(input.toLowerCase())) : [];
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachError('');
    const incoming = Array.from(files);
    const room = ATTACHMENT_LIMITS.files - attachments.length;
    if (room <= 0) { setAttachError(tr(`Можно прикрепить не больше ${ATTACHMENT_LIMITS.files} файлов.`, `You can attach at most ${ATTACHMENT_LIMITS.files} files.`)); return; }
    if (incoming.length > room) setAttachError(tr(`Можно прикрепить не больше ${ATTACHMENT_LIMITS.files} файлов.`, `You can attach at most ${ATTACHMENT_LIMITS.files} files.`));
    let total = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    const added: Attachment[] = [];
    for (const file of incoming.slice(0, room)) {
      if (total + file.size > ATTACHMENT_LIMITS.totalBytes) {
        setAttachError(tr(`Общий размер вложений не должен превышать ${formatBytes(ATTACHMENT_LIMITS.totalBytes)}.`, `Total attachment size must not exceed ${formatBytes(ATTACHMENT_LIMITS.totalBytes)}.`));
        break;
      }
      try { const attachment = await readAttachment(file); added.push(attachment); total += file.size; }
      catch (err: any) { setAttachError(err.message); }
    }
    if (added.length) setAttachments(previous => [...previous, ...added]);
  };
  const submit = (text?: string) => {
    const value = (text || input).trim(), hasAttachments = attachments.length > 0;
    if ((!value && !hasAttachments) || disabled || isGenerating) return;
    if (!supportsVision && attachments.some(attachment => attachment.kind === 'image')) {
      setAttachError(tr('Включите поддержку изображений в настройках модели, чтобы отправлять изображения.', 'Enable image support in model settings to send images.'));
      return;
    }
    if (value.startsWith('/') && !hasAttachments) onExecuteCommand?.(value); else onSendMessage(value, attachments);
    setInput(''); setAttachments([]); setAttachError(''); setSelected(0); setDismissed(false);
  };
  return <form className="composer" onSubmit={event => { event.preventDefault(); submit(commands[selected]?.command); }}>
    {commands.length > 0 && <div className="command-menu" role="listbox" aria-label={tr('Команды', 'Commands')}>{commands.map((cmd, i) => <button key={cmd.command} type="button" role="option" aria-selected={selected === i} onClick={() => submit(cmd.command)}><code>{cmd.command}</code><span>{tr(cmd.ru, cmd.en)}</span></button>)}</div>}
    <div className="composer-body">
      {attachments.length > 0 && <div className="attachment-list" aria-label={tr('Вложения', 'Attachments')}>
        {attachments.map(attachment => <span className="attachment-chip" key={attachment.id}>
          {attachment.kind === 'image' ? <img src={attachmentDataUrl(attachment)} alt="" /> : <FileText size={15} />}
          <span title={attachment.name}>{attachment.name}</span><small>{formatBytes(attachment.size)}</small>
          <button type="button" aria-label={tr('Удалить вложение', 'Remove attachment')} onClick={() => setAttachments(previous => previous.filter(item => item.id !== attachment.id))}><X size={13} /></button>
        </span>)}
      </div>}
      <div className="composer-row">
        <button type="button" className="attach-button" aria-label={tr('Прикрепить файлы', 'Attach files')} title={tr('Прикрепить файлы', 'Attach files')} disabled={disabled || isGenerating} onClick={() => picker.current?.click()}><Paperclip size={17} /></button>
        <input ref={picker} type="file" multiple hidden onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
        <textarea ref={field} aria-label={tr('Сообщение', 'Message')} value={input} rows={1} placeholder={tr('Введите сообщение…', 'Enter a message…')} disabled={disabled}
          onChange={event => { setInput(event.target.value); setSelected(0); setDismissed(false); }} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') { setDismissed(true); return; }
            if (commands.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setSelected(i => (i + (event.key === 'ArrowDown' ? 1 : commands.length - 1)) % commands.length); return; }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(commands[selected]?.command); }
          }} />
        {isGenerating ? <button type="button" className="send-button" aria-label={tr('Остановить', 'Stop')} onClick={onStop}><Square size={16} /></button>
          : <button type="submit" className="send-button" disabled={disabled || (!input.trim() && !attachments.length)} aria-label={tr('Отправить', 'Send')}><ArrowUp size={18} /></button>}
      </div>
      {attachError && <small className="error-text composer-error" role="alert">{attachError}</small>}
    </div>
  </form>;
};
