// i18n service parsing XML translation resources
export type SupportedLang = 'ru' | 'en' | 'auto';

class I18nService {
  private currentLang: 'ru' | 'en' = 'ru';
  private dictionary: Record<string, string> = {};
  private listeners: Set<() => void> = new Set();
  private loaded: boolean = false;

  public async init(prefLang: SupportedLang = 'auto'): Promise<void> {
    let resolved: 'ru' | 'en' = 'ru';
    if (prefLang === 'auto') {
      const navLang = navigator.language?.toLowerCase() || 'ru';
      resolved = navLang.startsWith('ru') ? 'ru' : 'en';
    } else {
      resolved = prefLang === 'en' ? 'en' : 'ru';
    }

    this.currentLang = resolved;
    await this.loadTranslations(resolved);
  }

  public async setLanguage(lang: 'ru' | 'en'): Promise<void> {
    if (this.currentLang === lang && this.loaded) return;
    this.currentLang = lang;
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

    this.dictionary = dict;
    this.loaded = true;
  }

  public t(key: string, params?: Record<string, any>): string {
    let val = this.dictionary[key] || key;
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
