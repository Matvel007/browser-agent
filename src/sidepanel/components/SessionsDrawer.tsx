import React, { useEffect, useRef } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { ChatSession } from '../../types';
import { tr } from '../../services/i18n';
import { logicalMessageCount } from '../../services/transcript';

interface Props { isOpen: boolean; onClose: () => void; sessions: ChatSession[]; currentSessionId: string; onSelectSession: (session: ChatSession) => void; onNewChat: () => void; onDeleteSession: (id: string) => void }
export const SessionsDrawer: React.FC<Props> = props => {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (props.isOpen) root.current?.focus(); }, [props.isOpen]);
  if (!props.isOpen) return null;
  return <div className="modal-root" onClick={e => { if (e.target === e.currentTarget) props.onClose(); }}>
    <div className="history-panel" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr('История чатов', 'Chat history')} onKeyDown={e => { if (e.key === 'Escape') props.onClose(); }}>
      <div className="settings-header"><h2>{tr('История', 'History')}</h2><button type="button" aria-label={tr('Закрыть историю', 'Close history')} onClick={props.onClose}><X size={18} /></button></div>
      <button type="button" className="button" onClick={() => { props.onNewChat(); props.onClose(); }}><Plus size={14} />{tr('Новый чат', 'New chat')}</button>
      <div className="session-list">{!props.sessions.length && <p className="hint">{tr('Сохранённых диалогов пока нет.', 'No saved conversations yet.')}</p>}
        {props.sessions.map(session => <div className="session-row" key={session.id}>
          <button type="button" aria-current={session.id === props.currentSessionId ? 'page' : undefined} onClick={() => { props.onSelectSession(session); props.onClose(); }}><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString()} · {session.messageCount ?? logicalMessageCount(session.messages)}</small></button>
          <button type="button" aria-label={`${tr('Удалить', 'Delete')} ${session.title}`} onClick={() => { if (confirm(tr('Удалить этот диалог и его артефакты?', 'Delete this conversation and its artifacts?'))) props.onDeleteSession(session.id); }}><Trash2 size={15} /></button>
        </div>)}
      </div>
    </div>
  </div>;
};
