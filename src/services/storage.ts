import { AppSettings, ChatMessage, ChatSession } from '../types';

const SETTINGS_KEY = 'browser_agent_settings';
const SESSIONS_KEY = 'browser_agent_sessions';
const LEGACY_SETTINGS_KEY = 'chromium_agent_settings';
const LEGACY_SESSIONS_KEY = 'chromium_agent_sessions';

export const DEFAULT_SYSTEM_PROMPT = `You are Browser Agent, a neutral and precise AI browser assistant.
You have access to Chrome DevTools Protocol (CDP) tools for page inspection and browser automation.

BEHAVIOR AND ETHICAL GUIDELINES:
1. Be concise, polite, objective, and neutral in your communication. Avoid cheerleading, exaggerated greetings, or unsolicited announcements.
2. STRICT RULE: DO NOT execute any browser tools, DO NOT inspect the DOM, and DO NOT scan the current page when the user merely greets you (e.g. "привет", "hello") or asks a general question. Only execute browser tools when the user explicitly requests an action related to the webpage, browser, DOM, console, or network.
3. NEVER display, log, or leak sensitive user data found on the page (passwords, auth tokens, personal emails, payment details, account balances) unless explicitly asked to do so by the user for a specific debugging purpose.
4. When performing an action (clicking, typing, inspecting console or network), succinctly report the outcome with clean formatting.
5. Answer in the same language as the user.`;

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'routerai',
  apiKey: '',
  model: '',
  customBaseUrl: 'https://routerai.ru/api/v1',
  temperature: 0.7,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  autoAttachDebugger: true,
  theme: 'system',
  language: 'auto',
  saveSessionHistory: true,
  maxHistoryMessages: 15,
  maxContextTokens: 252000,
  compressionThreshold: 80,
  customHotkey: 'Alt+C',
};

export async function getSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY]);
      const loaded = data[SETTINGS_KEY] || data[LEGACY_SETTINGS_KEY];
      return { ...DEFAULT_SETTINGS, ...(loaded || {}) };
    }
  } catch (err) {
    console.warn('Failed to load settings from storage:', err);
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

// --- Sessions Management ---

export async function getChatSessions(): Promise<ChatSession[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get([SESSIONS_KEY, LEGACY_SESSIONS_KEY]);
      return data[SESSIONS_KEY] || data[LEGACY_SESSIONS_KEY] || [];
    }
  } catch (err) {
    console.warn('Failed to load sessions:', err);
  }
  return [];
}

export async function saveChatSessions(sessions: ChatSession[]): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // Keep up to 50 sessions
      const trimmed = sessions.slice(0, 50);
      await chrome.storage.local.set({ [SESSIONS_KEY]: trimmed });
    }
  } catch (err) {
    console.error('Failed to save sessions:', err);
  }
}

export async function saveSingleSession(session: ChatSession): Promise<void> {
  if (!session.messages || session.messages.length === 0) return;
  const sessions = await getChatSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await saveChatSessions(sessions);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const sessions = await getChatSessions();
  const filtered = sessions.filter((s) => s.id !== sessionId);
  await saveChatSessions(filtered);
}
