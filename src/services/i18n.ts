// i18n service parsing XML translation resources with preloaded fallback dictionary
import { resolveLanguage } from './language';

export type SupportedLang = 'ru' | 'en' | 'auto';

const PRELOADED_RU: Record<string, string> = {
  app_title: 'Browser Agent',
  cdp_connected: 'CDP подключен',
  cdp_disconnected: 'CDP отключен',
  clear_chat: 'Очистить текущий диалог',
  chat_history: 'История сессий',
  settings: 'Настройки',
  theme_light: 'Светлая',
  theme_dark: 'Тёмная',
  theme_system: 'Системная',
  new_chat: 'Новый чат',
  no_model_selected: 'Нет модели',
  provider_routerai: 'RouterAI (Россия)',
  provider_aitunnel: 'AItunnel (Россия)',
  provider_openai: 'OpenAI',
  provider_deepseek: 'DeepSeek',
  provider_gemini: 'Google Gemini',
  provider_anthropic: 'Anthropic Claude',
  provider_custom: 'Пользовательский (OpenRouter / Groq / Ollama)',
  fetch_models: 'Загрузить список моделей',
  fetching_models: 'Загрузка моделей...',
  models_found: 'Найдено моделей (только текст): {count}',
  fetch_models_error: 'Не удалось загрузить модели. Проверьте адрес API.',
  search_model_placeholder: 'Поиск модели...',
  input_placeholder: 'Введите сообщение...',
  send_message: 'Отправить сообщение',
  stop_generation: 'Остановить генерацию',
  copy_message: 'Копировать',
  copied: 'Скопировано',
  rollback_message: 'Откатить',
  welcome_title: 'Чем помочь?',
  welcome_subtitle: 'Задайте вопрос или дайте задачу по странице браузера.',
  not_configured_title: 'Требуется настройка провайдера',
  not_configured_desc: 'Чтобы отправлять запросы, выберите провайдера (RouterAI, AItunnel, DeepSeek, OpenAI и др.), укажите API-ключ и выберите модель.',
  open_settings: 'Открыть настройки',
  context_usage: 'Контекст диалога',
  context_messages: 'Сообщений: {count}',
  context_tokens: 'Токенов: ~{used} / {max} ({percent}%)',
  context_compression_status: 'Сжатие: {status}',
  compression_active: 'активно',
  compression_idle: 'норма',
  sessions_title: 'История диалогов',
  no_sessions: 'История пуста',
  delete_session: 'Удалить сессию',
  confirm_delete_session: 'Удалить эту сессию?',
  confirm_clear_chat: 'Очистить сообщения текущего чата?',
  messages_count: 'сообщений: {count}',
  settings_title: 'Настройки Browser Agent',
  tab_general: 'Основные',
  tab_models: 'Провайдер и модели',
  tab_context: 'Контекст и память',
  tab_hotkey: 'Горячие клавиши',
  label_theme: 'Тема оформления',
  label_language: 'Язык интерфейса',
  label_save_sessions: 'Сохранять историю сессий',
  label_save_sessions_desc: 'Предыдущие диалоги сохраняются в истории',
  label_auto_attach_cdp: 'Автоподключение DevTools (CDP)',
  label_auto_attach_cdp_desc: 'Подключать отладчик при задачах управления браузером',
  label_api_key: 'API-ключ',
  api_key_stored_locally: 'Хранится локально в расширении',
  label_base_url: 'Base URL API',
  label_model: 'Модель',
  label_system_prompt: 'Системные инструкции',
  label_max_history: 'Количество последних сообщений в контексте',
  label_max_tokens: 'Максимальный размер контекста (токенов)',
  label_compression_threshold: 'Порог сжатия контекста (%)',
  label_hotkey: 'Горячая клавиша открытия панели',
  hotkey_hint: 'По умолчанию используется Alt+C. Вы можете изменить шорткат в настройках браузера:',
  open_browser_shortcuts: 'Настроить горячие клавиши в браузере',
  btn_cancel: 'Отмена',
  btn_save: 'Сохранить',
  saved_success: 'Сохранено',
  widget_tooltip: 'Browser Agent (Alt+C)',
  widget_drop_close: 'ЗАКРЫТЬ',
};

const PRELOADED_EN: Record<string, string> = {
  app_title: 'Browser Agent',
  cdp_connected: 'CDP connected',
  cdp_disconnected: 'CDP disconnected',
  clear_chat: 'Clear current chat',
  chat_history: 'Session history',
  settings: 'Settings',
  theme_light: 'Light',
  theme_dark: 'Dark',
  theme_system: 'System',
  new_chat: 'New chat',
  no_model_selected: 'No model',
  provider_routerai: 'RouterAI (Russia)',
  provider_aitunnel: 'AItunnel (Russia)',
  provider_openai: 'OpenAI',
  provider_deepseek: 'DeepSeek',
  provider_gemini: 'Google Gemini',
  provider_anthropic: 'Anthropic Claude',
  provider_custom: 'Custom (OpenRouter / Groq / Ollama)',
  fetch_models: 'Fetch models list',
  fetching_models: 'Loading models...',
  models_found: 'Models found (text-only): {count}',
  fetch_models_error: 'Failed to load models. Check API address.',
  search_model_placeholder: 'Search model...',
  input_placeholder: 'Type a message...',
  send_message: 'Send message',
  stop_generation: 'Stop generation',
  copy_message: 'Copy',
  copied: 'Copied',
  rollback_message: 'Rollback',
  welcome_title: 'How can I help?',
  welcome_subtitle: 'Ask a question or assign a task on the browser page.',
  not_configured_title: 'Provider setup required',
  not_configured_desc: 'To start chatting, select a provider (RouterAI, AItunnel, DeepSeek, OpenAI, etc.), enter your API key, and select a model.',
  open_settings: 'Open settings',
  context_usage: 'Chat context',
  context_messages: 'Messages: {count}',
  context_tokens: 'Tokens: ~{used} / {max} ({percent}%)',
  context_compression_status: 'Compression: {status}',
  compression_active: 'active',
  compression_idle: 'normal',
  sessions_title: 'Chat History',
  no_sessions: 'No previous sessions',
  delete_session: 'Delete session',
  confirm_delete_session: 'Delete this session?',
  confirm_clear_chat: 'Clear current chat messages?',
  messages_count: 'messages: {count}',
  settings_title: 'Browser Agent Settings',
  tab_general: 'General',
  tab_models: 'Provider & Models',
  tab_context: 'Context & Memory',
  tab_hotkey: 'Hotkeys',
  label_theme: 'Appearance Theme',
  label_language: 'Language',
  label_save_sessions: 'Save session history',
  label_save_sessions_desc: 'Previous sessions remain saved in history',
  label_auto_attach_cdp: 'Auto-attach DevTools (CDP)',
  label_auto_attach_cdp_desc: 'Connect debugger when browser automation tasks run',
  label_api_key: 'API Key',
  api_key_stored_locally: 'Stored locally in extension storage',
  label_base_url: 'API Base URL',
  label_model: 'Model',
  label_system_prompt: 'System instructions',
  label_max_history: 'Max history messages in context',
  label_max_tokens: 'Max context window size (tokens)',
  label_compression_threshold: 'Context compression threshold (%)',
  label_hotkey: 'Side panel trigger hotkey',
  hotkey_hint: 'Default is Alt+C. You can customize keyboard shortcuts in browser settings:',
  open_browser_shortcuts: 'Configure shortcuts in browser',
  btn_cancel: 'Cancel',
  btn_save: 'Save',
  saved_success: 'Saved',
  widget_tooltip: 'Browser Agent (Alt+C)',
  widget_drop_close: 'CLOSE',
};

class I18nService {
  private currentLang: 'ru' | 'en' = resolveLanguage();
  private dictionary: Record<string, string> = { ...(this.currentLang === 'ru' ? PRELOADED_RU : PRELOADED_EN) };
  private listeners: Set<() => void> = new Set();
  private loaded: boolean = false;

  public async init(prefLang: SupportedLang = 'auto'): Promise<void> {
    const resolved = resolveLanguage(prefLang);

    this.currentLang = resolved;
    if (typeof document !== 'undefined') document.documentElement.lang = resolved;
    const baseDict = resolved === 'en' ? PRELOADED_EN : PRELOADED_RU;
    this.dictionary = { ...baseDict };
    this.notify();
    await this.loadTranslations(resolved);
    this.notify();
  }

  public async setLanguage(lang: 'ru' | 'en'): Promise<void> {
    this.currentLang = lang;
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    const baseDict = lang === 'en' ? PRELOADED_EN : PRELOADED_RU;
    this.dictionary = { ...baseDict };
    this.notify();
    await this.loadTranslations(lang);
    this.notify();
  }

  public getLanguage(): 'ru' | 'en' {
    return this.currentLang;
  }

  private async loadTranslations(lang: 'ru' | 'en'): Promise<void> {
    const filename = lang === 'ru' ? 'locales/ru.xml' : 'locales/eng.xml';
    let xmlText = '';

    try {
      let url = filename;
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        url = chrome.runtime.getURL(filename);
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xmlText = await res.text();
    } catch (err) {
      console.warn(`Failed to fetch XML translations for ${lang}:`, err);
    }

    const dict: Record<string, string> = {};
    if (xmlText) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const root = xmlDoc.querySelector('translations');
        if (root) {
          for (const child of Array.from(root.children)) {
            dict[child.tagName] = child.textContent?.trim() || '';
          }
        }
      } catch (err) {
        console.error('Failed to parse translation XML:', err);
      }
    }

    // Merge onto dictionary
    if (this.currentLang !== lang) return;
    this.dictionary = { ...this.dictionary, ...dict };
    this.loaded = true;
  }

  public t(key: string, params?: Record<string, any>): string {
    const baseDict = this.currentLang === 'en' ? PRELOADED_EN : PRELOADED_RU;
    let val = this.dictionary[key] || baseDict[key] || PRELOADED_RU[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return val;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }
}

export const i18n = new I18nService();
export const t = (key: string, params?: Record<string, any>) => i18n.t(key, params);
export const tr = (ru: string, en: string) => i18n.getLanguage() === 'ru' ? ru : en;
