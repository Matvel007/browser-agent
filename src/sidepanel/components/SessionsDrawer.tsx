import React from 'react';
import { X, Plus, Trash2, MessageSquare, Clock } from 'lucide-react';
import { ChatSession } from '../../types';
import { t } from '../../services/i18n';

interface SessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export const SessionsDrawer: React.FC<SessionsDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex select-none">
      <div className="w-72 bg-agent-surface border-r border-agent-border h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="px-3.5 py-3 border-b border-agent-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-agent-text">
            <Clock className="w-4 h-4 text-agent-accent" />
            <span>{t('sessions_title')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-agent-card text-agent-muted hover:text-agent-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 border-b border-agent-border">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full py-2 px-3 rounded-lg bg-agent-card hover:bg-agent-border border border-agent-border text-agent-text text-xs font-medium flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 text-agent-accent" />
            <span>{t('new_chat')}</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-agent-muted text-xs">
              <MessageSquare className="w-6 h-6 mb-2 opacity-40" />
              <span>{t('no_sessions')}</span>
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === currentSessionId;
              return (
                <div
                  key={sess.id}
                  className={`group relative flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs transition-colors border ${
                    isActive
                      ? 'bg-agent-card border-agent-accent/50 text-agent-text'
                      : 'border-transparent hover:bg-agent-card/60 text-agent-muted hover:text-agent-text'
                  }`}
                  onClick={() => {
                    onSelectSession(sess);
                    onClose();
                  }}
                >
                  <div className="flex-1 overflow-hidden pr-2">
                    <div className="font-medium truncate text-agent-text text-xs">
                      {sess.title || t('app_title')}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-agent-muted mt-0.5">
                      <span>{formatDate(sess.updatedAt)}</span>
                      <span>•</span>
                      <span>{t('messages_count', { count: sess.messages?.length || 0 })}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(t('confirm_delete_session'))) {
                        onDeleteSession(sess.id);
                      }
                    }}
                    title={t('delete_session')}
                    className="opacity-0 group-hover:opacity-100 p-1 text-agent-muted hover:text-red-500 rounded transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Backdrop Click */}
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
