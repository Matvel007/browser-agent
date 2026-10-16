import { AppSettings, ChatMessage } from '../types';

const SETTINGS_KEY = 'devtools_copilot_settings';
const CHAT_HISTORY_KEY = 'devtools_copilot_history';

export const DEFAULT_SYSTEM_PROMPT = `You are Chrome DevTools Copilot, an expert AI assistant living inside Chromium with direct access to the Chrome DevTools Protocol (CDP) and browser automation.
You can inspect the DOM, view console logs and runtime errors, monitor network traffic and API responses, simulate real hardware mouse clicks and keystrokes, and navigate web pages.

GUIDELINES:
1. When asked to inspect or interact with the page, use the appropriate DevTools tools.
2. If there are console errors or network failures, proactively inspect them and explain their root cause.
3. When clicking or typing, prefer locating elements by clear CSS selectors or descriptive text.
4. After executing an action, explain what you did clearly in natural language with helpful formatting.
5. Answer in the same language as the user (Russian, English, etc.).`;

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  apiKey: '',
  model: '',
  customBaseUrl: '',
  temperature: 0.7,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  autoAttachDebugger: true,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
    }
  } catch (err) {
    console.warn('Failed to load settings from chrome.storage:', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(CHAT_HISTORY_KEY);
      return data[CHAT_HISTORY_KEY] || [];
    }
  } catch (err) {
    console.warn('Failed to load chat history:', err);
  }
  return [];
}

export async function saveChatHistory(history: ChatMessage[]): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // Keep last 50 messages to prevent excessive storage
      const trimmed = history.slice(-50);
      await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: trimmed });
    }
  } catch (err) {
    console.error('Failed to save chat history:', err);
  }
}

export async function clearChatHistory(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(CHAT_HISTORY_KEY);
    }
  } catch (err) {
    console.error('Failed to clear chat history:', err);
  }
}
