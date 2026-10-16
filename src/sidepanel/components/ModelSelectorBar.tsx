import React, { useState, useEffect } from 'react';
import { Cpu, ChevronDown, Search, Check, RefreshCw, Settings, X } from 'lucide-react';
import { AppSettings } from '../../types';
import { ContextGauge } from './ContextGauge';
import { t } from '../../services/i18n';
import { LLMClient } from '../../services/llm';

interface ModelSelectorBarProps {
  settings: AppSettings;
  onOpenModelSettings: () => void;
  onSelectModel: (model: string) => void;
  usedTokens: number;
  messageCount: number;
}

const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
  routerai: [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'deepseek/deepseek-chat',
    'google/gemini-2.0-flash-exp',
    'meta-llama/llama-3.3-70b-instruct',
    'qwen/qwen-2.5-72b-instruct',
  ],
  aitunnel: [
    'gpt-4o-mini',
    'gpt-4o',
    'claude-3-5-sonnet-20241022',
    'deepseek-chat',
    'gemini-2.0-flash',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  custom: ['openrouter/auto', 'llama-3.3-70b-versatile', 'qwen-2.5-72b'],
};

export const ModelSelectorBar: React.FC<ModelSelectorBarProps> = ({
  settings,
  onOpenModelSettings,
  onSelectModel,
  usedTokens,
  messageCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await LLMClient.fetchAvailableModels(settings);
      if (fetched.length > 0) {
        setModels(fetched);
      } else {
        setModels(DEFAULT_PROVIDER_MODELS[settings.provider] || []);
      }
    } catch (err: any) {
      setError(err.message || t('fetch_models_error'));
      if (models.length === 0) {
        setModels(DEFAULT_PROVIDER_MODELS[settings.provider] || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      setSearch('');
      setError(null);
      if (models.length === 0) {
        fetchModels();
      }
    }
  };

  const handleSelect = (modelName: string) => {
    onSelectModel(modelName);
    setIsOpen(false);
  };

  const activeModels = models.length > 0 ? models : (DEFAULT_PROVIDER_MODELS[settings.provider] || []);
  const filteredModels = activeModels.filter((m) =>
    m.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative px-3.5 py-1.5 flex items-center justify-between text-xs border-t border-agent-border bg-agent-surface select-none">
      {/* Slide-up popover sheet */}
      {isOpen && (
        <>
          {/* Transparent Backdrop */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />

          {/* Popover Sheet */}
          <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-agent-card border border-agent-border rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col max-h-72 text-xs">
            {/* Popover Header */}
            <div className="px-3 py-2 border-b border-agent-border flex items-center justify-between bg-agent-surface">
              <span className="font-semibold text-agent-text flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-agent-accent" />
                <span>{getProviderLabel()}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={fetchModels}
                  disabled={isLoading}
                  title={t('fetch_models')}
                  className="p-1 text-agent-muted hover:text-agent-text rounded hover:bg-agent-card transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenModelSettings();
                  }}
                  title={t('settings')}
                  className="p-1 text-agent-muted hover:text-agent-text rounded hover:bg-agent-card transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-agent-muted hover:text-agent-text rounded hover:bg-agent-card transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="p-2 border-b border-agent-border bg-agent-card">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-agent-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search_model_placeholder')}
                  autoFocus
                  className="w-full bg-agent-surface border border-agent-border focus:border-agent-accent rounded-lg px-2.5 py-1.5 pl-7 text-xs text-agent-text outline-none"
                />
              </div>
            </div>

            {/* Scrollable Model List */}
            <div className="overflow-y-auto max-h-48 p-1.5 space-y-0.5">
              {isLoading && (
                <div className="p-3 text-center text-agent-muted text-[11px] flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-agent-accent" />
                  <span>{t('fetching_models')}</span>
                </div>
              )}

              {error && (
                <div className="p-2 text-rose-500 text-[11px] bg-rose-500/10 rounded border border-rose-500/20 mb-1">
                  {error}
                </div>
              )}

              {filteredModels.map((m) => {
                const isSelected = settings.model === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md font-mono text-[11px] flex items-center justify-between transition-colors truncate ${
                      isSelected
                        ? 'bg-agent-accent text-white'
                        : 'hover:bg-agent-surface text-agent-text'
                    }`}
                  >
                    <span className="truncate">{m}</span>
                    {isSelected && <Check className="w-3 h-3 flex-shrink-0 ml-1" />}
                  </button>
                );
              })}

              {filteredModels.length === 0 && search.trim() && !isLoading && (
                <button
                  type="button"
                  onClick={() => handleSelect(search.trim())}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] text-agent-accent hover:bg-agent-surface transition-colors"
                >
                  Использовать «{search.trim()}»
                </button>
              )}

              {filteredModels.length === 0 && !search.trim() && !isLoading && (
                <div className="p-3 text-center text-agent-muted text-[11px]">
                  Модели не найдены
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Left: OpenCode-style compact model pill */}
      <button
        type="button"
        onClick={handleToggleOpen}
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
        <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Right: Circular Context Gauge */}
      <ContextGauge
        usedTokens={usedTokens}
        maxTokens={settings.maxContextTokens || 252000}
        messageCount={messageCount}
        compressionThreshold={settings.compressionThreshold || 80}
      />
    </div>
  );
};
