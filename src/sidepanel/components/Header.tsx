import React from 'react';
import { Settings, Trash2, Bug, Clock, Plus, Bot } from 'lucide-react';
import { ActiveTabInfo } from '../../types';
import { t } from '../../services/i18n';

interface HeaderProps {
  activeTab: ActiveTabInfo | null;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onClearChat: () => void;
  onToggleAttachDebugger: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenSettings,
  onOpenHistory,
  onNewChat,
  onClearChat,
  onToggleAttachDebugger,
}) => {
  return (
    <header className="border-b border-agent-border bg-agent-surface px-3 py-2 flex items-center justify-between select-none">
      {/* Brand title */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-agent-card border border-agent-border flex items-center justify-center text-agent-accent shadow-sm">
          <Bot className="w-4 h-4" />
        </div>
        <h1 className="text-sm font-semibold text-agent-text leading-none tracking-tight">
          {t('app_title')}
        </h1>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* New Chat */}
        <button
          type="button"
          onClick={onNewChat}
          title={t('new_chat')}
          className="p-1.5 rounded-md text-agent-muted hover:text-agent-text hover:bg-agent-card transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Chat History */}
        <button
          type="button"
          onClick={onOpenHistory}
          title={t('chat_history')}
          className="p-1.5 rounded-md text-agent-muted hover:text-agent-text hover:bg-agent-card transition-colors"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* CDP Debugger Toggle */}
        <button
          type="button"
          onClick={onToggleAttachDebugger}
          title={activeTab?.isAttached ? t('cdp_connected') : t('cdp_disconnected')}
          className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs px-2 border ${
            activeTab?.isAttached
              ? 'bg-agent-accent/15 border-agent-accent/40 text-agent-accent'
              : 'bg-agent-card border-agent-border text-agent-muted hover:text-agent-text'
          }`}
        >
          <Bug className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium hidden sm:inline">
            {activeTab?.isAttached ? 'CDP On' : 'CDP Off'}
          </span>
        </button>

        {/* Clear Current Chat */}
        <button
          type="button"
          onClick={onClearChat}
          title={t('clear_chat')}
          className="p-1.5 rounded-md text-agent-muted hover:text-agent-text hover:bg-agent-card transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          title={t('settings')}
          className="p-1.5 rounded-md text-agent-muted hover:text-agent-text hover:bg-agent-card transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
