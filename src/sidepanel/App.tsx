import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ModelSelectorBar } from './components/ModelSelectorBar';
import { SettingsModal } from './components/SettingsModal';
import { SessionsDrawer } from './components/SessionsDrawer';
import {
  ActiveTabInfo,
  AppSettings,
  ChatMessage,
  ChatSession,
  ToolCallRecord,
} from '../types';
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getChatSessions,
  saveSingleSession,
  deleteChatSession,
} from '../services/storage';
import { LLMClient, estimateHistoryTokens } from '../services/llm';
import { i18n, t } from '../services/i18n';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'models' | 'context' | 'hotkey'>('models');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Sessions and messages
  const [currentSessionId, setCurrentSessionId] = useState<string>(`sess_${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Rollback text input state
  const [restoredInputText, setRestoredInputText] = useState<string>('');

  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [, setI18nVersion] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Subscribe to i18n changes
  useEffect(() => {
    return i18n.subscribe(() => setI18nVersion((v) => v + 1));
  }, []);

  // Initialize Settings, i18n, Theme, and Sessions
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      i18n.init(s.language);
      applyTheme(s.theme);
    });

    getChatSessions().then((loadedSessions) => {
      setSessions(loadedSessions);
    });

    fetchActiveTab();

    // Listen to tab activation changes in Chromium
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleTabChange = () => fetchActiveTab();
      chrome.tabs.onActivated?.addListener(handleTabChange);
      chrome.tabs.onUpdated?.addListener(handleTabChange);
      return () => {
        chrome.tabs.onActivated?.removeListener(handleTabChange);
        chrome.tabs.onUpdated?.removeListener(handleTabChange);
      };
    }
  }, []);

  // Apply Theme to document root
  const applyTheme = (theme: 'system' | 'dark' | 'light') => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Save current session automatically when messages change
  useEffect(() => {
    if (settings.saveSessionHistory && messages.length > 0) {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 36) : 'Диалог';

      const sessionObj: ChatSession = {
        id: currentSessionId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages,
      };

      saveSingleSession(sessionObj).then(() => {
        getChatSessions().then(setSessions);
      });
    }
  }, [messages, currentSessionId, settings.saveSessionHistory]);

  const fetchActiveTab = () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB' }, (res) => {
      if (res?.success && res.tab) {
        setActiveTab(res.tab);
      }
    });
  };

  const handleToggleAttachDebugger = () => {
    if (!activeTab) return;
    const action = activeTab.isAttached ? 'DETACH_DEBUGGER' : 'ATTACH_DEBUGGER';
    chrome.runtime.sendMessage({ action, payload: { tabId: activeTab.id } }, (res) => {
      if (res?.success) {
        setActiveTab({ ...activeTab, isAttached: !activeTab.isAttached });
      }
    });
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    applyTheme(newSettings.theme);
  };

  const handleNewChat = () => {
    setCurrentSessionId(`sess_${Date.now()}`);
    setMessages([]);
  };

  const handleSelectSession = (sess: ChatSession) => {
    setCurrentSessionId(sess.id);
    setMessages(sess.messages || []);
  };

  const handleDeleteSession = async (sessId: string) => {
    await deleteChatSession(sessId);
    const updated = await getChatSessions();
    setSessions(updated);
    if (sessId === currentSessionId) {
      handleNewChat();
    }
  };

  const handleClearChat = () => {
    if (window.confirm(t('confirm_clear_chat'))) {
      setMessages([]);
    }
  };

  const handleRollback = (index: number, content: string) => {
    // Put message text back into input
    setRestoredInputText(content);
    // Slice history to before this message
    setMessages((prev) => prev.slice(0, index));
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  // Agent execution loop
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    if (!settings.apiKey || !settings.model) {
      const notConfiguredMsg: ChatMessage = {
        id: `ast_${Date.now() + 1}`,
        role: 'assistant',
        content: `**${t('not_configured_title')}**\n\n${t('not_configured_desc')}`,
        timestamp: Date.now() + 1,
      };

      setMessages((prev) => [...prev, userMsg, notConfiguredMsg]);
      return;
    }

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await runAgentLoop(newMessages, abortController.signal, 0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Ошибка**: ${err.message || 'Не удалось выполнить запрос.'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const runAgentLoop = async (
    currentHistory: ChatMessage[],
    signal: AbortSignal,
    stepCount: number
  ): Promise<void> => {
    if (stepCount > 8) return;

    const assistantMsgId = `ast_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages([...currentHistory, initialAssistantMsg]);

    const result = await LLMClient.chat(
      settings,
      currentHistory,
      {
        onChunk: (chunkText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: chunkText } : m
            )
          );
        },
      },
      signal
    );

    const completedMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: result.content,
      timestamp: Date.now(),
      isStreaming: false,
      toolCalls: result.toolCalls,
    };

    const updatedHistory = [...currentHistory, completedMsg];
    setMessages(updatedHistory);

    // If agent requested tool execution
    if (result.toolCalls && result.toolCalls.length > 0) {
      const executedToolCalls: ToolCallRecord[] = [];

      for (const tc of result.toolCalls) {
        if (signal.aborted) break;

        tc.status = 'running';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  toolCalls: m.toolCalls?.map((t) => (t.id === tc.id ? { ...t, status: 'running' } : t)),
                }
              : m
          )
        );

        if (tc.args?.selector && activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'HIGHLIGHT_ELEMENT',
            selector: tc.args.selector,
          }).catch(() => {});
        }

        try {
          const toolRes = await executeDevToolsAction(tc.name, tc.args);
          tc.status = 'success';
          tc.result = toolRes;
        } catch (err: any) {
          tc.status = 'error';
          tc.error = err.message || 'Ошибка выполнения действия';
        }

        executedToolCalls.push(tc);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  toolCalls: m.toolCalls?.map((t) => (t.id === tc.id ? { ...tc } : t)),
                }
              : m
          )
        );
      }

      if (!signal.aborted) {
        const nextHistory = updatedHistory.map((m) =>
          m.id === assistantMsgId ? { ...m, toolCalls: executedToolCalls } : m
        );
        await runAgentLoop(nextHistory, signal, stepCount + 1);
      }
    }
  };

  const executeDevToolsAction = (toolName: string, args: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!activeTab?.id) {
        reject(new Error('Нет активной вкладки браузера для выполнения действия.'));
        return;
      }

      chrome.runtime.sendMessage(
        {
          action: 'EXECUTE_DEVTOOLS_TOOL',
          payload: {
            tabId: activeTab.id,
            toolName,
            args,
          },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res?.success) {
            fetchActiveTab();
            resolve(res.result);
          } else {
            reject(new Error(res?.error || 'Неизвестная ошибка DevTools'));
          }
        }
      );
    });
  };

  const usedTokens = estimateHistoryTokens(messages, settings.systemPrompt);

  return (
    <div className="flex flex-col h-screen w-screen bg-agent-bg text-agent-text overflow-hidden select-text">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onOpenSettings={() => {
          setSettingsTab('general');
          setIsSettingsOpen(true);
        }}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewChat={handleNewChat}
        onClearChat={handleClearChat}
        onToggleAttachDebugger={handleToggleAttachDebugger}
      />

      {/* Messages List */}
      <MessageList
        messages={messages}
        isGenerating={isGenerating}
        onOpenSettings={() => {
          setSettingsTab('models');
          setIsSettingsOpen(true);
        }}
        onRollback={handleRollback}
      />

      {/* Message Input Container */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isGenerating={isGenerating}
        initialText={restoredInputText}
        onTextConsumed={() => setRestoredInputText('')}
      />

      {/* OpenCode-style Model Selector Bar with Context Gauge */}
      <ModelSelectorBar
        settings={settings}
        onOpenModelSettings={() => {
          setSettingsTab('models');
          setIsSettingsOpen(true);
        }}
        onSelectModel={(model: string) => {
          const updated = { ...settings, model };
          handleSaveSettings(updated);
        }}
        usedTokens={usedTokens}
        messageCount={messages.length}
      />

      {/* Settings Modal */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        initialTab={settingsTab}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      {/* Sessions History Drawer */}
      <SessionsDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  );
};
