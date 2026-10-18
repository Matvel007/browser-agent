import React, { useEffect, useRef, useState } from 'react';
import { ActiveTabInfo, AppSettings, Attachment, ChatSession, SettingsTab } from '../types';
import { DEFAULT_SETTINGS, deleteChatSession, getChatSession, getChatSessions, getSettings, saveSettings, saveSingleSession } from '../services/storage';
import { compactSession, runAgent } from '../services/agent';
import { contextCosts, contextToolCosts, summaryForRollback } from '../services/context';
import { i18n, tr } from '../services/i18n';
import { playCompletion, unlockAudio } from '../services/sound';
import { cleanUrl } from '../services/budget';
import { logicalMessageCount } from '../services/transcript';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput, SLASH_COMMANDS } from './components/MessageInput';
import { ModelSelectorBar } from './components/ModelSelectorBar';
import { SettingsModal } from './components/SettingsModal';
import { SessionsDrawer } from './components/SessionsDrawer';

function newSession(): ChatSession {
  return { id: crypto.randomUUID(), title: tr('Новый чат', 'New chat'), createdAt: Date.now(), updatedAt: Date.now(), messages: [], version: 2 };
}

async function runtime(message: any) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error(tr('Откройте установленное расширение в браузере', 'Open the installed browser extension'));
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.success) throw new Error(response?.error || tr('Нет ответа фонового процесса', 'Background worker did not respond'));
  return response;
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(newSession);
  const sessionRef = useRef(session);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const [isGenerating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [, renderLanguage] = useState(0);
  const operation = useRef<{ id: string; controller: AbortController }>();
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const switchVersion = useRef(0);

  const refreshSessions = async () => { const rows = await getChatSessions(); setSessions(rows); };
  const persist = (value: ChatSession) => {
    if (!settingsRef.current.saveSessionHistory) return;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveSingleSession(value)).then(refreshSessions).catch(err => setNotice(String(err.message)));
  };
  const update = (value: ChatSession, immediate = false) => {
    sessionRef.current = value; setSession(value);
    clearTimeout(saveTimer.current);
    if (immediate) persist(value);
    else saveTimer.current = setTimeout(() => persist(value), 600);
  };
  const refreshTab = async () => {
    try { setActiveTab((await runtime({ action: 'GET_ACTIVE_TAB' })).tab); }
    catch { setActiveTab(null); }
  };

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([getSettings(), getChatSessions()]).then(([loaded, rows]) => {
      if (!mounted) return;
      if (loaded.status === 'fulfilled') {
        setSettings(loaded.value); settingsRef.current = loaded.value; void i18n.init(loaded.value.language);
      }
      if (rows.status === 'fulfilled') setSessions(rows.value);
      const errors = [loaded, rows].filter(item => item.status === 'rejected').map(item => item.status === 'rejected' ? String(item.reason?.message || item.reason) : '');
      if (errors.length) setNotice(errors.join('\n'));
      setReady(true);
    });
    const unsubscribe = i18n.subscribe(() => renderLanguage(v => v + 1));
    void refreshTab();
    const listener = () => { void refreshTab(); };
    if (typeof chrome !== 'undefined') { chrome.tabs?.onActivated.addListener(listener); chrome.tabs?.onUpdated.addListener(listener); }
    return () => {
      mounted = false; unsubscribe(); clearTimeout(saveTimer.current);
      operation.current?.controller.abort();
      if (operation.current) void runtime({ action: 'CANCEL_RUN', runId: operation.current.id }).catch(() => {});
      if (typeof chrome !== 'undefined') { chrome.tabs?.onActivated.removeListener(listener); chrome.tabs?.onUpdated.removeListener(listener); }
    };
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', settings.theme === 'dark' || (settings.theme === 'system' && media.matches));
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.language !== 'auto') return;
    const refreshLanguage = () => { void i18n.init('auto'); };
    window.addEventListener('languagechange', refreshLanguage);
    return () => window.removeEventListener('languagechange', refreshLanguage);
  }, [settings.language]);

  const cancel = (detach = false) => {
    const op = operation.current;
    if (!op) return;
    op.controller.abort(); void runtime({ action: 'CANCEL_RUN', runId: op.id }).catch(() => {});
    if (detach) {
      operation.current = undefined; setGenerating(false);
      const current = sessionRef.current;
      const messages = current.messages.map(m => ({ ...m, isStreaming: false,
        toolCalls: m.toolCalls?.map(call => ['pending', 'running'].includes(call.status) ? { ...call, status: 'cancelled' as const } : call) }));
      update({ ...current, messages: [...messages, { id: crypto.randomUUID(), role: 'assistant', content: tr('Выполнение остановлено при смене диалога.', 'Execution stopped when the conversation changed.'), timestamp: Date.now(), status: 'stopped' }], updatedAt: Date.now() }, true);
    }
  };
  const changeSession = (value: ChatSession) => { switchVersion.current++; cancel(true); clearTimeout(saveTimer.current); sessionRef.current = value; setSession(value); setInput(''); };
  const openSettings = (tab: SettingsTab) => { setSettingsTab(tab); setSettingsOpen(true); };

  const save = async (value: AppSettings) => {
    await saveSettings(value); settingsRef.current = value; setSettings(value); await i18n.init(value.language);
  };

  const compact = async () => {
    if (operation.current) return;
    const op = { id: crypto.randomUUID(), controller: new AbortController() }; operation.current = op; setGenerating(true);
    try {
      const value = await compactSession(settingsRef.current, sessionRef.current, op.controller.signal, 0);
      if (operation.current === op) update(value, true);
    } catch (err: any) { if (operation.current === op) setNotice(op.controller.signal.aborted ? tr('Сжатие остановлено, история сохранена.', 'Compression stopped; history preserved.') : err.message); }
    finally { if (operation.current === op) { operation.current = undefined; setGenerating(false); } }
  };

  const send = async (text: string, attachments: Attachment[] = []) => {
    if (!ready || operation.current) return;
    void unlockAudio(); setNotice('');
    const current = sessionRef.current;
    const first = !current.messages.some(m => m.role === 'user');
    const title = text || attachments.map(attachment => attachment.name).join(', ');
    const initial: ChatSession = { ...current, title: first ? title.slice(0, 60) : current.title,
      messages: [...current.messages, { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now(), attachments: attachments.length ? attachments : undefined }] };
    update(initial, true);
    const op = { id: crypto.randomUUID(), controller: new AbortController() }; operation.current = op; setGenerating(true);
    let targetId = activeTab?.id, targetUrl = activeTab?.url || '';
    try {
      const finished = await runAgent(settingsRef.current, initial, op.controller.signal, {
        update: value => { if (operation.current === op) update(value); },
        chunk: value => { if (operation.current === op) update(value); },
        execute: async (call, profile) => {
          const response = await runtime({ action: 'EXECUTE_DEVTOOLS_TOOL', payload: { tabId: activeTab?.id, toolName: call.name,
            args: { ...call.args, profile: call.args.profile || profile }, runId: op.id, sessionId: initial.id,
            history: call.name === 'history_read' ? sessionRef.current.messages : undefined } });
          if (response.result.ok) {
            if (response.result.data?.selectedTabId != null) { targetId = response.result.data.selectedTabId; targetUrl = response.result.data.url || ''; }
            if (call.name === 'devtools_navigate') targetUrl = response.result.data?.url || targetUrl;
          }
          return response.result;
        },
        browserState: () => { const current = activeTabRef.current; return JSON.stringify({ tabId: targetId, url: cleanUrl(current && current.id === targetId ? current.url : targetUrl) }); },
      }, typeof chrome !== 'undefined' && Boolean(chrome.debugger));
      if (operation.current === op) {
        update(finished, true);
        if (!op.controller.signal.aborted && settingsRef.current.soundEnabled) void playCompletion(settingsRef.current.soundVolume);
      }
    } finally {
      void runtime({ action: 'RELEASE_RUN', runId: op.id }).catch(() => {});
      if (operation.current === op) { operation.current = undefined; setGenerating(false); void refreshTab(); }
    }
  };

  const command = (value: string) => {
    switch (value.trim().toLowerCase()) {
      case '/compact': void compact(); break;
      case '/new': changeSession(newSession()); break;
      case '/clear': cancel(true); update({ ...sessionRef.current, messages: [], summary: undefined, updatedAt: Date.now() }, true); break;
      case '/settings': openSettings('interface'); break;
      case '/model': openSettings('models'); break;
      case '/tools': openSettings('tools'); break;
      case '/help': setNotice(SLASH_COMMANDS.map(c => `${c.command} — ${tr(c.ru, c.en)}`).join('\n')); break;
      default: setNotice(tr('Неизвестная команда. Введите /help.', 'Unknown command. Enter /help.'));
    }
  };
  const costs = contextCosts(settings, session, { hasBrowser: typeof chrome !== 'undefined' && Boolean(chrome.debugger) });
  return <div className="app-shell">
    <Header activeTab={activeTab} onOpenSettings={() => openSettings('models')} onOpenHistory={() => setHistoryOpen(true)}
      onNewChat={() => changeSession(newSession())} onClearChat={() => command('/clear')}
      onToggleAttachDebugger={() => { if (activeTab) void runtime({ action: activeTab.isAttached ? 'DETACH_DEBUGGER' : 'ATTACH_DEBUGGER', payload: { tabId: activeTab.id } }).then(refreshTab).catch(err => setNotice(err.message)); }} />
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label={tr('Закрыть уведомление', 'Dismiss notice')} onClick={() => setNotice('')}>×</button></div>}
    <MessageList messages={session.messages} sessionId={session.id} isGenerating={isGenerating} onOpenSettings={() => openSettings('models')}
      onRollback={(index, content) => {
        cancel(true); const current = sessionRef.current; const remaining = current.messages.slice(0, index);
        update({ ...current, messages: remaining, summary: summaryForRollback(current.summary, remaining), updatedAt: Date.now() }, true); setInput(content);
      }} />
    <MessageInput key={session.id} onSendMessage={(text, attachments) => { void send(text, attachments).catch(err => { setNotice(err.message); }); }} onStop={() => cancel()} isGenerating={isGenerating}
      disabled={!ready} supportsVision={settings.supportsVision} initialText={input} onTextConsumed={() => setInput('')} onExecuteCommand={command} />
    <ModelSelectorBar settings={settings} usedTokens={costs.total} messageCount={logicalMessageCount(session.messages)}
      costs={costs} toolCosts={contextToolCosts(session)} busy={isGenerating} onTriggerCompact={() => { void compact(); }} onOpenModelSettings={() => openSettings('models')}
      onSelectModel={model => { void save({ ...settings, model }).catch(err => setNotice(err.message)); }} />
    <SettingsModal isOpen={settingsOpen} settings={settings} initialTab={settingsTab} onSave={save} onClose={() => setSettingsOpen(false)} />
    <SessionsDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} sessions={sessions} currentSessionId={session.id}
      onSelectSession={selected => {
        const version = ++switchVersion.current; cancel(true); setReady(false);
        void saveQueue.current.then(() => getChatSession(selected.id)).then(value => { if (switchVersion.current === version) changeSession(value); })
          .catch(err => setNotice(err.message)).finally(() => setReady(true));
      }} onNewChat={() => changeSession(newSession())} onDeleteSession={id => {
        if (sessionRef.current.id === id) changeSession(newSession());
        void saveQueue.current.then(() => deleteChatSession(id)).then(refreshSessions).catch(err => setNotice(err.message));
      }} />
  </div>;
};
