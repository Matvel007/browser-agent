import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Cpu,
  Globe,
  Sliders,
  Eye,
  EyeOff,
  Save,
  Check,
  RefreshCw,
  Search,
  Keyboard,
  Layers,
  Moon,
  Sun,
  Laptop,
} from 'lucide-react';
import { AppSettings, ProviderType, AppTheme, AppLang } from '../../types';
import { LLMClient } from '../../services/llm';
import { t, i18n } from '../../services/i18n';

interface SettingsModalProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  initialTab?: 'general' | 'models' | 'context' | 'hotkey';
}

interface ProviderPreset {
  labelKey: string;
  defaultModel: string;
  defaultBaseUrl?: string;
}

const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  routerai: {
    labelKey: 'provider_routerai',
    defaultModel: 'openai/gpt-4o-mini',
    defaultBaseUrl: 'https://routerai.ru/api/v1',
  },
  aitunnel: {
    labelKey: 'provider_aitunnel',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.aitunnel.ru/v1',
  },
  openai: {
    labelKey: 'provider_openai',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  deepseek: {
    labelKey: 'provider_deepseek',
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com',
  },
  gemini: {
    labelKey: 'provider_gemini',
    defaultModel: 'gemini-2.0-flash',
  },
  anthropic: {
    labelKey: 'provider_anthropic',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  custom: {
    labelKey: 'provider_custom',
    defaultModel: 'openrouter/auto',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
  initialTab = 'models',
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'models' | 'context' | 'hotkey'>(initialTab);
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Model loading state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm({ ...settings });
      setActiveTab(initialTab);
      setModelsFetchError(null);
    }
  }, [isOpen, settings, initialTab]);

  if (!isOpen) return null;

  const handleProviderChange = (provider: ProviderType) => {
    const preset = PROVIDER_PRESETS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      model: prev.model || preset.defaultModel,
      customBaseUrl: preset.defaultBaseUrl || prev.customBaseUrl || '',
    }));
    setFetchedModels([]);
    setModelsFetchError(null);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelsFetchError(null);
    try {
      const models = await LLMClient.fetchAvailableModels(form);
      setFetchedModels(models);
    } catch (err: any) {
      setModelsFetchError(err.message || t('fetch_models_error'));
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleClose = () => {
    // Revert theme and language to saved settings if not saved
    if (form.theme !== settings.theme) {
      const isDark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    if (form.language !== settings.language) {
      i18n.init(settings.language);
    }
    onClose();
  };

  const handleSave = () => {
    onSave(form);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleOpenBrowserShortcuts = () => {
    chrome.runtime.sendMessage({ action: 'OPEN_SHORTCUTS_SETTINGS' });
  };

  const filteredModels = fetchedModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <div className="bg-agent-surface border border-agent-border w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-agent-border flex items-center justify-between bg-agent-card">
          <h2 className="font-semibold text-sm text-agent-text flex items-center gap-2">
            <Sliders className="w-4 h-4 text-agent-accent" />
            <span>{t('settings_title')}</span>
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md text-agent-muted hover:text-agent-text hover:bg-agent-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 border-b border-agent-border flex gap-1 bg-agent-card overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'models'
                ? 'border-agent-accent text-agent-text'
                : 'border-transparent text-agent-muted hover:text-agent-text'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{t('tab_models')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'context'
                ? 'border-agent-accent text-agent-text'
                : 'border-transparent text-agent-muted hover:text-agent-text'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('tab_context')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-agent-accent text-agent-text'
                : 'border-transparent text-agent-muted hover:text-agent-text'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('tab_general')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hotkey')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'hotkey'
                ? 'border-agent-accent text-agent-text'
                : 'border-transparent text-agent-muted hover:text-agent-text'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{t('tab_hotkey')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: Models & Provider */}
          {activeTab === 'models' && (
            <div className="space-y-3.5">
              {/* Provider Selection */}
              <div>
                <label className="block font-medium text-agent-text mb-1.5">Провайдер</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {(Object.keys(PROVIDER_PRESETS) as ProviderType[]).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => handleProviderChange(prov)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border text-left transition-all font-medium truncate ${
                        form.provider === prov
                          ? 'bg-agent-accent/15 border-agent-accent text-agent-accent'
                          : 'bg-agent-card border-agent-border text-agent-text hover:bg-agent-border/60'
                      }`}
                    >
                      {t(PROVIDER_PRESETS[prov].labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block font-medium text-agent-text mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-agent-accent" />
                    {t('label_api_key')}
                  </span>
                  <span className="text-[10px] text-agent-muted">{t('api_key_stored_locally')}</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg px-3 py-1.5 pr-8 text-xs text-agent-text outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-agent-muted hover:text-agent-text"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Base URL */}
              {form.provider !== 'gemini' && form.provider !== 'anthropic' && (
                <div>
                  <label className="block font-medium text-agent-text mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-agent-accent" />
                    {t('label_base_url')}
                  </label>
                  <input
                    type="text"
                    value={form.customBaseUrl || ''}
                    onChange={(e) => setForm({ ...form, customBaseUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg px-3 py-1.5 text-xs text-agent-text outline-none font-mono"
                  />
                </div>
              )}

              {/* Model Fetching and Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-agent-text flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-agent-accent" />
                    {t('label_model')}
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="text-[11px] text-agent-accent hover:underline flex items-center gap-1 disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    <span>{isFetchingModels ? t('fetching_models') : t('fetch_models')}</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. gpt-4o, deepseek-chat, openai/gpt-4o-mini"
                  className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg px-3 py-1.5 text-xs text-agent-text outline-none font-mono mb-2"
                />

                {/* Error message */}
                {modelsFetchError && (
                  <div className="text-[11px] text-rose-500 bg-rose-500/10 p-2 rounded border border-rose-500/20 mb-2">
                    {modelsFetchError}
                  </div>
                )}

                {/* Fetched Models List with Search */}
                {fetchedModels.length > 0 && (
                  <div className="border border-agent-border rounded-lg bg-agent-card p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-agent-muted">
                      <span>{t('models_found', { count: fetchedModels.length })}</span>
                      <div className="relative w-36">
                        <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-agent-muted" />
                        <input
                          type="text"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder={t('search_model_placeholder')}
                          className="w-full bg-agent-surface border border-agent-border rounded px-2 py-0.5 pl-5 text-[10px] text-agent-text outline-none"
                        />
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-0.5">
                      {filteredModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, model: m })}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono transition-colors truncate ${
                            form.model === m
                              ? 'bg-agent-accent text-white'
                              : 'hover:bg-agent-surface text-agent-text'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Context & Memory */}
          {activeTab === 'context' && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-medium text-agent-text mb-1">
                  {t('label_max_history')}
                </label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={form.maxHistoryMessages}
                  onChange={(e) =>
                    setForm({ ...form, maxHistoryMessages: parseInt(e.target.value) || 10 })
                  }
                  className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg px-3 py-1.5 text-xs text-agent-text outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-agent-text mb-1">
                  {t('label_max_tokens')}
                </label>
                <input
                  type="number"
                  step="1000"
                  min="2000"
                  max="1000000"
                  value={form.maxContextTokens}
                  onChange={(e) =>
                    setForm({ ...form, maxContextTokens: parseInt(e.target.value) || 252000 })
                  }
                  className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg px-3 py-1.5 text-xs text-agent-text outline-none font-mono"
                />
              </div>

              <div className="p-3 rounded-xl bg-agent-card border border-agent-border text-agent-muted text-xs leading-relaxed space-y-1.5">
                <div className="font-semibold text-agent-text flex items-center gap-1.5">
                  <span className="text-sm">🗜️</span>
                  <span>Автоматическое сжатие контекста</span>
                </div>
                <p className="text-[11px] text-agent-muted">
                  Диалог автоматически сжимается при заполнении максимального лимита токенов, а также вручную по команде <code className="bg-agent-surface px-1.5 py-0.5 rounded text-agent-accent font-mono font-medium">/compact</code>. Сжатые блоки сохраняются в истории в виде компактных раскрывающихся карточек.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: General */}
          {activeTab === 'general' && (
            <div className="space-y-3.5">
              {/* Theme Selector */}
              <div>
                <label className="block font-medium text-agent-text mb-1.5">
                  {t('label_theme')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['system', 'dark', 'light'] as AppTheme[]).map((themeMode) => (
                    <button
                      key={themeMode}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, theme: themeMode }));
                        const isDark =
                          themeMode === 'dark' ||
                          (themeMode === 'system' &&
                            window.matchMedia('(prefers-color-scheme: dark)').matches);
                        if (isDark) {
                          document.documentElement.classList.add('dark');
                        } else {
                          document.documentElement.classList.remove('dark');
                        }
                      }}
                      className={`p-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors font-medium capitalize ${
                        form.theme === themeMode
                          ? 'bg-agent-accent/15 border-agent-accent text-agent-accent'
                          : 'bg-agent-card border-agent-border text-agent-muted hover:text-agent-text'
                      }`}
                    >
                      {themeMode === 'system' && <Laptop className="w-3.5 h-3.5" />}
                      {themeMode === 'dark' && <Moon className="w-3.5 h-3.5" />}
                      {themeMode === 'light' && <Sun className="w-3.5 h-3.5" />}
                      <span>{t(`theme_${themeMode}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Selector */}
              <div>
                <label className="block font-medium text-agent-text mb-1.5">
                  {t('label_language')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'auto', label: 'Авто' },
                    { id: 'ru', label: 'Русский' },
                    { id: 'en', label: 'English' },
                  ].map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => {
                        const newLang = lang.id as AppLang;
                        setForm((prev) => ({ ...prev, language: newLang }));
                        i18n.init(newLang);
                      }}
                      className={`p-2 rounded-lg border text-center transition-colors font-medium ${
                        form.language === lang.id
                          ? 'bg-agent-accent/15 border-agent-accent text-agent-accent'
                          : 'bg-agent-card border-agent-border text-agent-muted hover:text-agent-text'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Sessions Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-agent-border">
                <div>
                  <div className="font-medium text-agent-text">{t('label_save_sessions')}</div>
                  <div className="text-[11px] text-agent-muted">{t('label_save_sessions_desc')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={form.saveSessionHistory}
                  onChange={(e) => setForm({ ...form, saveSessionHistory: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Auto Attach CDP Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-agent-border">
                <div>
                  <div className="font-medium text-agent-text">{t('label_auto_attach_cdp')}</div>
                  <div className="text-[11px] text-agent-muted">{t('label_auto_attach_cdp_desc')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={form.autoAttachDebugger}
                  onChange={(e) => setForm({ ...form, autoAttachDebugger: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block font-medium text-agent-text mb-1">
                  {t('label_system_prompt')}
                </label>
                <textarea
                  rows={3}
                  value={form.systemPrompt || ''}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  className="w-full bg-agent-card border border-agent-border focus:border-agent-accent rounded-lg p-2 text-[11px] text-agent-text outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 4: Hotkeys */}
          {activeTab === 'hotkey' && (
            <div className="space-y-3.5">
              <div>
                <label className="block font-medium text-agent-text mb-1">
                  {t('label_hotkey')}
                </label>
                <div className="p-3 rounded-lg bg-agent-card border border-agent-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-agent-accent" />
                    <span className="font-mono text-xs text-agent-text font-semibold">
                      {form.customHotkey || 'Alt+C'}
                    </span>
                  </div>
                  <span className="text-[10px] text-agent-muted">Глобальный шорткат</span>
                </div>
                <p className="text-[11px] text-agent-muted mt-2">
                  {t('hotkey_hint')}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleOpenBrowserShortcuts}
                  className="py-2 px-3 rounded-lg bg-agent-card hover:bg-agent-border border border-agent-border text-agent-accent font-medium text-xs flex items-center gap-2 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{t('open_browser_shortcuts')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-agent-border bg-agent-card flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg text-agent-muted hover:text-agent-text hover:bg-agent-surface transition-colors"
          >
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-agent-accent hover:opacity-90 text-white font-medium transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedSuccess ? t('saved_success') : t('btn_save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
