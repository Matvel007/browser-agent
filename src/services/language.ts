import { AppLang } from '../types';

export function resolveLanguage(preference: AppLang = 'auto'): 'ru' | 'en' {
  if (preference === 'ru' || preference === 'en') return preference;
  let browserLanguage = '';
  try {
    if (typeof chrome !== 'undefined') browserLanguage = chrome.i18n?.getUILanguage?.() || '';
  } catch { /* Browser bindings can be unavailable in a reloaded extension context. */ }
  if (!browserLanguage && typeof navigator !== 'undefined') browserLanguage = navigator.languages?.[0] || navigator.language || '';
  return browserLanguage ? (/^ru(?:-|_|$)/i.test(browserLanguage) ? 'ru' : 'en') : 'ru';
}
