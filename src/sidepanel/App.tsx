import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { SettingsModal } from './components/SettingsModal';
import {
  ActiveTabInfo,
  AppSettings,
  ChatMessage,
  ToolCallRecord,
} from '../types';
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
} from '../services/storage';
import { LLMClient } from '../services/llm';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load initial settings and history
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      // Auto-open settings if no API key is set
      if (!s.apiKey) {
        setIsSettingsOpen(true);
      }
    });

    getChatHistory().then((h) => {
      if (h && h.length > 0) setMessages(h);
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

  // Update storage whenever messages change (debounce)
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

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
  };

  const handleClearChat = () => {
    if (window.confirm('Очистить всю историю диалога?')) {
      setMessages([]);
      clearChatHistory();
    }
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
    if (!settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

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
    if (stepCount > 8) {
      // Safety limit for maximum tool iterations
      return;
    }

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

    // Update with final response chunk and any parsed tool calls
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

        // Mark tool as running
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

        // Optional visual highlight via content script if selector exists
        if (tc.args?.selector && activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'HIGHLIGHT_ELEMENT',
            selector: tc.args.selector,
          }).catch(() => {});
        }

        // Execute DevTools action via background worker
        try {
          const toolRes = await executeDevToolsAction(tc.name, tc.args);
          tc.status = 'success';
          tc.result = toolRes;
        } catch (err: any) {
          tc.status = 'error';
          tc.error = err.message || 'Ошибка выполнения действия';
        }

        executedToolCalls.push(tc);

        // Update UI with tool result
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

      // If there are tool results and we haven't aborted, continue ReAct loop!
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
            // Update activeTab status if attachment state changed
            fetchActiveTab();
            resolve(res.result);
          } else {
            reject(new Error(res?.error || 'Неизвестная ошибка DevTools'));
          }
        }
      );
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#212121] text-[#ececec] overflow-hidden select-text">
      {/* Native Top Header */}
      <Header
        settings={settings}
        activeTab={activeTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onClearChat={handleClearChat}
        onToggleAttachDebugger={handleToggleAttachDebugger}
        onRefreshTab={fetchActiveTab}
      />

      {/* ChatGPT Message List */}
      <MessageList messages={messages} isGenerating={isGenerating} />

      {/* Message Input & Quick Action Chips */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isGenerating={isGenerating}
      />

      {/* Settings Modal */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
