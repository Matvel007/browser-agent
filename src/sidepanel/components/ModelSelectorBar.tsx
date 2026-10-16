import React from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
import { AppSettings } from '../../types';
import { ContextGauge } from './ContextGauge';
import { t } from '../../services/i18n';

interface ModelSelectorBarProps {
  settings: AppSettings;
  onOpenModelSettings: () => void;
  usedTokens: number;
  messageCount: number;
}

export const ModelSelectorBar: React.FC<ModelSelectorBarProps> = ({
  settings,
  onOpenModelSettings,
  usedTokens,
  messageCount,
}) => {
  const isConfigured = Boolean(settings.apiKey && settings.model);

  const getProviderLabel = () => {
    switch (settings.provider) {
      case 'routerai':
        return 'RouterAI';
      case 'aitunnel':
        return 'AItunnel';
      case 'deepseek':
        return 'DeepSeek';
      case 'openai':
        return 'OpenAI';
      case 'gemini':
        return 'Gemini';
      case 'anthropic':
        return 'Claude';
      default:
        return 'Custom';
    }
  };

  return (
    <div className="px-3.5 py-1.5 flex items-center justify-between text-xs border-t border-agent-border bg-agent-surface select-none">
      {/* Left: OpenCode-style compact model pill */}
      <button
        type="button"
        onClick={onOpenModelSettings}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all text-xs ${
          isConfigured
            ? 'bg-agent-card border-agent-border text-agent-text hover:border-agent-accent'
            : 'bg-amber-500/10 border-amber-500/40 text-amber-500 hover:bg-amber-500/20'
        }`}
      >
        <Cpu className="w-3.5 h-3.5 opacity-80" />
        <span className="font-medium max-w-[170px] truncate">
          {isConfigured ? `${getProviderLabel()} / ${settings.model}` : t('no_model_selected')}
        </span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {/* Right: Circular Context Gauge */}
      <ContextGauge
        usedTokens={usedTokens}
        maxTokens={settings.maxContextTokens || 8192}
        messageCount={messageCount}
        compressionThreshold={settings.compressionThreshold || 80}
      />
    </div>
  );
};
