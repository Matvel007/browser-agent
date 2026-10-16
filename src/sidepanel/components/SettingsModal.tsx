import React, { useState } from 'react';
import { X, Key, Cpu, Globe, Sliders, Eye, EyeOff, Save, Check } from 'lucide-react';
import { AppSettings, ProviderType } from '../../types';

interface SettingsModalProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

const PROVIDER_PRESETS: Record<
  ProviderType,
  { label: string; defaultModel: string; models: string[]; defaultBaseUrl?: string }
> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo'],
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com',
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  anthropic: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  },
  custom: {
    label: 'Custom (OpenRouter/Groq/Ollama)',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['openrouter/auto', 'llama-3.3-70b-versatile', 'qwen-2.5-72b'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleProviderChange = (provider: ProviderType) => {
    const preset = PROVIDER_PRESETS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      model: preset.defaultModel,
      customBaseUrl: preset.defaultBaseUrl || prev.customBaseUrl || '',
    }));
  };

  const handleSave = () => {
    onSave(form);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="bg-[#212121] border border-[#383838] w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-sm">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#383838] flex items-center justify-between bg-[#171717]">
          <h2 className="font-semibold text-[#ececec] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#10a37f]" />
            Настройки AI и DevTools
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#888] hover:text-[#ececec] hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="px-4 py-3.5 overflow-y-auto space-y-4 flex-1">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-medium text-[#ccc] mb-1.5">Провайдер LLM</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(PROVIDER_PRESETS) as ProviderType[]).map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => handleProviderChange(prov)}
                  className={`px-3 py-2 text-xs rounded-lg border text-left transition-all font-medium ${
                    form.provider === prov
                      ? 'bg-[#10a37f]/20 border-[#10a37f] text-[#10a37f]'
                      : 'bg-[#2a2a2a] border-[#383838] text-[#ccc] hover:bg-[#333]'
                  }`}
                >
                  {PROVIDER_PRESETS[prov].label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-[#ccc] mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-[#10a37f]" />
                API Key
              </span>
              <span className="text-[11px] text-[#888]">Хранится локально в расширении</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={`Введите ваш ${PROVIDER_PRESETS[form.provider].label} API Key`}
                className="w-full bg-[#2a2a2a] border border-[#383838] focus:border-[#10a37f] rounded-lg px-3 py-2 pr-9 text-xs text-[#ececec] outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#ccc]"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-medium text-[#ccc] mb-1.5 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#10a37f]" />
              Модель
            </label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. gpt-4o, deepseek-chat, gemini-2.0-flash"
              className="w-full bg-[#2a2a2a] border border-[#383838] focus:border-[#10a37f] rounded-lg px-3 py-2 text-xs text-[#ececec] outline-none font-mono mb-1.5"
            />
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1">
              {PROVIDER_PRESETS[form.provider].models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, model: m })}
                  className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                    form.model === m
                      ? 'bg-[#10a37f]/20 border-[#10a37f] text-[#10a37f]'
                      : 'bg-[#1e1e1e] border-[#383838] text-[#888] hover:text-[#ccc]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Base URL (if custom or deepseek) */}
          {(form.provider === 'custom' || form.provider === 'deepseek') && (
            <div>
              <label className="block text-xs font-medium text-[#ccc] mb-1.5 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-[#10a37f]" />
                API Base URL
              </label>
              <input
                type="text"
                value={form.customBaseUrl || ''}
                onChange={(e) => setForm({ ...form, customBaseUrl: e.target.value })}
                placeholder="https://api.deepseek.com или https://openrouter.ai/api/v1"
                className="w-full bg-[#2a2a2a] border border-[#383838] focus:border-[#10a37f] rounded-lg px-3 py-2 text-xs text-[#ececec] outline-none font-mono"
              />
            </div>
          )}

          {/* DevTools Auto-Attach Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-[#303030]">
            <div>
              <div className="text-xs font-medium text-[#ececec]">Авто-подключение CDP DevTools</div>
              <div className="text-[11px] text-[#888]">Автоматически подключать отладчик при командах агента</div>
            </div>
            <input
              type="checkbox"
              checked={form.autoAttachDebugger}
              onChange={(e) => setForm({ ...form, autoAttachDebugger: e.target.checked })}
              className="w-4 h-4 accent-[#10a37f] rounded cursor-pointer"
            />
          </div>

          {/* System Instructions */}
          <div>
            <label className="block text-xs font-medium text-[#ccc] mb-1">Системный промпт</label>
            <textarea
              rows={3}
              value={form.systemPrompt || ''}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className="w-full bg-[#2a2a2a] border border-[#383838] focus:border-[#10a37f] rounded-lg p-2 text-[11px] text-[#ececec] outline-none resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#383838] bg-[#171717] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-[#ccc] hover:bg-[#2a2a2a] transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs bg-[#10a37f] hover:bg-[#0e8e6e] text-white font-medium transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedSuccess ? 'Сохранено!' : 'Сохранить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
