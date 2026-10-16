export type ProviderType =
  | 'routerai'
  | 'aitunnel'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'anthropic'
  | 'custom';

export type AppTheme = 'system' | 'dark' | 'light';
export type AppLang = 'ru' | 'en' | 'auto';

export interface AppSettings {
  provider: ProviderType;
  apiKey: string;
  model: string;
  customBaseUrl?: string;
  temperature: number;
  systemPrompt?: string;
  autoAttachDebugger: boolean;
  theme: AppTheme;
  language: AppLang;
  saveSessionHistory: boolean;
  maxHistoryMessages: number;
  maxContextTokens: number;
  compressionThreshold: number;
  customHotkey: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: any;
  error?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ActiveTabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  isAttached: boolean;
}

export interface ConsoleLogItem {
  type: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

export interface NetworkRequestItem {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  type?: string;
  timestamp: number;
  duration?: number;
}

export interface AgentActionTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
