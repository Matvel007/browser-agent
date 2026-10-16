import React from 'react';
import { Settings, Trash2, Cpu, Wrench, Bug, ExternalLink, RefreshCw } from 'lucide-react';
import { ActiveTabInfo, AppSettings } from '../../types';

interface HeaderProps {
  settings: AppSettings;
  activeTab: ActiveTabInfo | null;
  onOpenSettings: () => void;
  onClearChat: () => void;
  onToggleAttachDebugger: () => void;
  onRefreshTab: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  activeTab,
  onOpenSettings,
  onClearChat,
  onToggleAttachDebugger,
  onRefreshTab,
}) => {
  const getDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url.slice(0, 25);
    }
  };

  return (
    <header className="border-b border-[#383838] bg-[#171717] px-3.5 py-2.5 flex items-center justify-between select-none">
      {/* Left: Brand title and model selector */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#10a37f] flex items-center justify-center text-white shadow-sm font-semibold">
          <Wrench className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[#ececec] flex items-center gap-1.5 leading-none">
            Chromium Agent
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#10a37f] border border-[#383838] font-mono">
              CDP
            </span>
          </h1>
          {settings.apiKey && settings.model ? (
            <p className="text-[11px] text-[#b4b4b4] flex items-center gap-1 mt-0.5">
              <Cpu className="w-3 h-3 text-[#10a37f]" />
              <span className="truncate max-w-[120px] font-mono">{settings.model}</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Нажмите, чтобы подключить провайдер и выбрать модель"
              className="text-[11px] flex items-center gap-1 mt-0.5 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <Cpu className="w-3 h-3 text-amber-400" />
              <span className="truncate max-w-[140px] font-medium underline underline-offset-2">
                Модель не выбрана
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleAttachDebugger}
          title={activeTab?.isAttached ? 'CDP Отладчик подключен к вкладке' : 'Нажмите для подключения CDP Отладчика'}
          className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs px-2 border ${
            activeTab?.isAttached
              ? 'bg-[#10a37f]/20 border-[#10a37f]/50 text-[#10a37f]'
              : 'bg-[#2a2a2a] border-[#383838] text-[#b4b4b4] hover:text-[#ececec]'
          }`}
        >
          <Bug className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium hidden sm:inline">
            {activeTab?.isAttached ? 'CDP On' : 'CDP Off'}
          </span>
        </button>

        <button
          onClick={onClearChat}
          title="Очистить диалог"
          className="p-1.5 rounded-md text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2a2a2a] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title="Настройки API и моделей"
          className="p-1.5 rounded-md text-[#b4b4b4] hover:text-[#ececec] hover:bg-[#2a2a2a] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
