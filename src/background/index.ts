import { devtools } from '../services/devtools';
import { executeTool } from '../services/tool-executor';
import { getSettings } from '../services/storage';
import { resolveLanguage } from '../services/language';

const runs = new Map<string, { controller: AbortController; sessionId: string; tabId?: number; touched: number }>();
const cancelled = new Map<string, number>();
const lastTargets = new Map<number, number>();
const PENDING_CONTEXT_KEY = 'browser_agent_pending_context';
type PendingContext = { action: 'explain' | 'translate' | 'summarize'; text?: string; url?: string; pageUrl?: string; frameId?: number; tabId?: number; createdAt: number };
let widgetUpdates = Promise.resolve();
const tabOrigins = new Map<number, string>();

async function storePendingContext(value: PendingContext) {
  const storage = chrome.storage.session || chrome.storage.local;
  await storage.set({ [PENDING_CONTEXT_KEY]: value });
}
function ensureWidget(tabId: number) {
  void chrome.tabs.sendMessage(tabId, { action: 'WIDGET_PING' }).catch(() => {
    void chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
  });
}
function rememberOrigin(tabId: number, url?: string) {
  try { const origin = new URL(url || '').origin; if (origin) tabOrigins.set(tabId, origin); } catch {}
}
function ensureActiveWidgets() {
  return chrome.tabs.query({ active: true }).then(tabs => {
    for (const tab of tabs) if (tab.id != null && /^https?:/.test(tab.url || '')) ensureWidget(tab.id);
  });
}
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void chrome.tabs.get(tabId).then(tab => {
    if (/^https?:/.test(tab.url || '')) { lastTargets.set(windowId, tabId); rememberOrigin(tabId, tab.url); ensureWidget(tabId); }
  }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    let origin = '';
    try { origin = new URL(changeInfo.url).origin; } catch {}
    if (origin && tabOrigins.has(tabId) && tabOrigins.get(tabId) !== origin) void chrome.storage.session?.remove(`widget_hidden_${tabId}`);
    if (origin) tabOrigins.set(tabId, origin);
  }
  if (changeInfo.status === 'complete' && /^https?:/.test(tab.url || '')) ensureWidget(tabId);
});
void ensureActiveWidgets().catch(() => {});
chrome.runtime.onStartup.addListener(() => { void ensureActiveWidgets().catch(() => {}); });

let menuUpdate = Promise.resolve();
function createContextMenus(lang: 'ru' | 'en') {
  const ru = lang === 'ru';
  menuUpdate = menuUpdate.catch(() => {}).then(() => new Promise<void>(resolve => {
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError;
      const items: chrome.contextMenus.CreateProperties[] = [
        { id: 'open_browser_agent', title: ru ? 'Открыть Browser Agent' : 'Open Browser Agent', contexts: ['page', 'editable'] },
        { id: 'explain_selection', title: ru ? 'Объяснить выделенное' : 'Explain selection', contexts: ['selection'] },
        { id: 'translate_selection', title: ru ? 'Перевести выделенное' : 'Translate selection', contexts: ['selection'] },
        { id: 'summarize_link', title: ru ? 'Суммировать ссылку' : 'Summarize link', contexts: ['link'] },
        { id: 'summarize_page', title: ru ? 'Суммировать страницу' : 'Summarize page', contexts: ['page'] },
      ];
      let pending = items.length;
      for (const item of items) {
        const done = () => { void chrome.runtime.lastError; if (--pending === 0) resolve(); };
        try { chrome.contextMenus.create(item, done); } catch { done(); }
      }
    });
  }));
  return menuUpdate;
}
void getSettings().then(settings => createContextMenus(resolveLanguage(settings.language))).catch(() => createContextMenus(resolveLanguage()));

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(console.warn);
  void getSettings().then(settings => createContextMenus(resolveLanguage(settings.language))).catch(() => createContextMenus(resolveLanguage()));
  void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.warn);
  void chrome.storage.local.remove('browser_agent_widget_position').catch(console.warn);
  if (chrome.storage.session) widgetUpdates = widgetUpdates.then(() => chrome.storage.session.get(null)).then(state => chrome.storage.session.remove(Object.keys(state).filter(key => key.startsWith('widget_hidden_')))).catch(console.warn);
});

async function openPanel(windowId?: number, sourceTabId?: number) {
  if (chrome.sidePanel?.open && windowId != null) {
    try { return await chrome.sidePanel.open({ windowId }); }
    catch (err) { console.warn('sidePanel.open failed, opening a tab instead', err); }
  }
  const url = chrome.runtime.getURL('sidepanel.html') + (sourceTabId != null ? `?sourceTabId=${sourceTabId}` : '');
  return chrome.tabs.create({ url });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.browser_agent_settings) return;
  const before = changes.browser_agent_settings.oldValue || {}, after = changes.browser_agent_settings.newValue || {};
  if (before.language !== after.language) {
    void getSettings().then(settings => createContextMenus(resolveLanguage(settings.language))).catch(console.warn);
  }
  if (before.widgetEnabled === after.widgetEnabled) return;
  widgetUpdates = widgetUpdates.then(() => chrome.tabs.query({})).then(async tabs => {
    if (before.widgetEnabled === false && after.widgetEnabled !== false && chrome.storage.session) {
      await chrome.storage.session.remove(tabs.map(tab => `widget_hidden_${tab.id}`));
    }
    await Promise.all(tabs.filter(tab => tab.id != null).map(tab => chrome.tabs.sendMessage(tab.id!, { action: 'WIDGET_VISIBILITY', enabled: after.widgetEnabled !== false }).catch(() => {})));
  }).catch(console.warn);
});
chrome.tabs.onRemoved.addListener(id => { tabOrigins.delete(id); void chrome.storage.session?.remove(`widget_hidden_${id}`); });
chrome.action.onClicked.addListener(tab => { void openPanel(tab.windowId, tab.id).catch(console.warn); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open_browser_agent' || info.menuItemId === 'open_devtools_copilot') { void openPanel(tab?.windowId, tab?.id).catch(console.warn); return; }
  const summarizePage = info.menuItemId === 'summarize_page';
  const action = info.menuItemId === 'explain_selection' ? 'explain' : info.menuItemId === 'translate_selection' ? 'translate'
    : info.menuItemId === 'summarize_link' || summarizePage ? 'summarize' : null;
  if (!action) return;
  const payload: PendingContext = { action, text: (info.selectionText || '').slice(0, 8000),
    url: (summarizePage ? (info.pageUrl || tab?.url || '') : (info.linkUrl || '')).slice(0, 4000),
    pageUrl: (info.pageUrl || tab?.url || '').slice(0, 4000), frameId: info.frameId, tabId: tab?.id, createdAt: Date.now() };
  void openPanel(tab?.windowId, tab?.id).catch(console.warn);
  void storePendingContext(payload).then(() => {
    void chrome.runtime.sendMessage({ action: 'CONTEXT_MENU_CONTEXT', payload }).catch(() => {});
  }).catch(console.warn);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const respond = (promise: Promise<any>) => {
    promise.then(result => sendResponse({ success: true, ...result })).catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
  };
  if (message?.action === 'OPEN_SIDE_PANEL') { respond(openPanel(sender.tab?.windowId, sender.tab?.id).then(() => ({}))); return true; }
  if (message?.action === 'GET_WIDGET_SETTINGS') {
    respond((async () => {
      await widgetUpdates;
      const [settings, state] = await Promise.all([getSettings(), chrome.storage.session?.get(`widget_hidden_${sender.tab?.id}`)]);
      return { enabled: settings.widgetEnabled, hidden: Boolean(state?.[`widget_hidden_${sender.tab?.id}`]), language: resolveLanguage(settings.language) };
    })()); return true;
  }
  if (message?.action === 'HIDE_WIDGET') {
    respond(Promise.resolve(chrome.storage.session?.set({ [`widget_hidden_${sender.tab?.id}`]: true })).then(() => ({}))); return true;
  }
  // Only trusted extension pages can invoke privileged operations; content scripts only open the panel.
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  switch (message?.action) {
    case 'OPEN_SHORTCUTS_SETTINGS':
      respond(chrome.tabs.create({ url: navigator.userAgent.includes('YaBrowser') ? 'browser://extensions/shortcuts' : 'chrome://extensions/shortcuts' }).then(() => ({}))); break;
    case 'GET_ACTIVE_TAB':
      respond(chrome.tabs.query({ lastFocusedWindow: true }).then(tabs => {
        const active = tabs.find(tab => tab.active);
        const tab = active && /^https?:/.test(active.url || '') ? active : tabs.find(tab => tab.id === lastTargets.get(active?.windowId || -1)) || tabs.find(tab => /^https?:/.test(tab.url || ''));
        return { tab: tab?.id != null ? { id: tab.id, title: tab.title || '', url: tab.url || '', favIconUrl: tab.favIconUrl, isAttached: devtools.isAttached(tab.id) } : null };
      })); break;
    case 'ATTACH_DEBUGGER': respond(devtools.attach(message.payload.tabId).then(() => ({}))); break;
    case 'DETACH_DEBUGGER': respond(devtools.detach(message.payload.tabId).then(() => ({}))); break;
    case 'CANCEL_RUN': {
      const key = message.runId;
      cancelled.set(key, Date.now()); runs.get(key)?.controller.abort(); runs.delete(key);
      sendResponse({ success: true }); return;
    }
    case 'RELEASE_RUN': runs.delete(message.runId); sendResponse({ success: true }); return;
    case 'EXECUTE_DEVTOOLS_TOOL': {
      const payload = message.payload || {};
      respond((async () => {
        const now = Date.now();
        for (const [key, run] of runs) if (now - run.touched > 120000) { run.controller.abort(); runs.delete(key); }
        for (const [key, at] of cancelled) if (now - at > 120000) cancelled.delete(key);
        if (!payload.runId || !payload.sessionId) throw new Error('Run and session identity required');
        if (cancelled.has(payload.runId)) throw new Error('Run was stopped');
        let run = runs.get(payload.runId);
        if (!run) { run = { controller: new AbortController(), sessionId: payload.sessionId, tabId: payload.tabId, touched: now }; runs.set(payload.runId, run); }
        if (run.sessionId !== payload.sessionId) throw new Error('Run/session mismatch');
        run.touched = now;
        const stepSignal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(45000)]);
        const result = await executeTool(payload.toolName, payload.args || {}, await getSettings(), { tabId: run.tabId, sessionId: run.sessionId, runId: payload.runId, signal: stepSignal,
          history: payload.toolName === 'history_read' && Array.isArray(payload.history) ? payload.history : undefined });
        if (payload.toolName === 'browser_tabs' && result.ok && result.data?.selectedTabId != null) run.tabId = result.data.selectedTabId;
        if (payload.toolName === 'browser_tabs' && result.ok && result.data?.closedTabId === run.tabId) run.tabId = undefined;
        return { result };
      })()); break;
    }
    default: return;
  }
  return true;
});
