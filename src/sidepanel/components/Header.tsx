import React from 'react';
import { Settings, Trash2, Bug, Clock, Plus, X } from 'lucide-react';
import { ActiveTabInfo } from '../../types';
import { tr } from '../../services/i18n';
import { AgentLogo } from './AgentLogo';

interface Props { activeTab: ActiveTabInfo | null; onOpenSettings: () => void; onOpenHistory: () => void; onNewChat: () => void; onClearChat: () => void; onToggleAttachDebugger: () => void; onClose?: () => void }
export const Header: React.FC<Props> = ({ activeTab, onOpenSettings, onOpenHistory, onNewChat, onClearChat, onToggleAttachDebugger, onClose }) => <header className="app-header">
  <div className="brand"><AgentLogo /><h1>Browser Agent</h1></div>
  <div className="header-actions">
    <button type="button" aria-label={tr('Новый чат', 'New chat')} title={tr('Новый чат', 'New chat')} onClick={onNewChat}><Plus size={17} /></button>
    <button type="button" aria-label={tr('История', 'History')} title={tr('История', 'History')} onClick={onOpenHistory}><Clock size={17} /></button>
    <button type="button" className={activeTab?.isAttached ? 'connected' : ''} aria-label={activeTab?.isAttached ? 'CDP connected' : 'CDP disconnected'} title={activeTab?.isAttached ? 'CDP connected' : 'CDP disconnected'} onClick={onToggleAttachDebugger}><Bug size={17} /></button>
    <button type="button" aria-label={tr('Очистить чат', 'Clear chat')} title={tr('Очистить чат', 'Clear chat')} onClick={onClearChat}><Trash2 size={17} /></button>
    <button type="button" aria-label={tr('Настройки', 'Settings')} title={tr('Настройки', 'Settings')} onClick={onOpenSettings}><Settings size={17} /></button>
    {onClose && <button type="button" className="close-panel" aria-label={tr('Закрыть чат', 'Close chat')} title={tr('Закрыть чат', 'Close chat')} onClick={onClose}><X size={17} /></button>}
  </div>
</header>;
