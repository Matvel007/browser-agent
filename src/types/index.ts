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
export type ToolProfile = 'lean' | 'balanced' | 'full';
export type SettingsTab = 'models' | 'tools' | 'context' | 'behavior' | 'interface' | 'diagnostics' | 'general' | 'hotkey';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  customBaseUrl?: string;
}

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
  compressionThreshold?: number;
  customHotkey: string;
  version: number;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  disabledTools: string[];
  confirmDangerousActions: boolean;
  toolProfile: ToolProfile;
  searchEnabled: boolean;
  searchProvider: 'duckduckgo' | 'tavily';
  tavilyApiKey: string;
  maxSteps: number;
  maxStepsEnabled: boolean;
  maxOutputTokens: number;
  supportsVision: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  widgetEnabled: boolean;
}

export interface ArtifactRef {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  sha256: string;
  createdAt: number;
  expiresAt: number;
  sessionId: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: any;
  truncated: boolean;
  truncation: string[];
  next?: string;
  artifact?: ArtifactRef;
  tokens_est: number;
  profile: ToolProfile;
}

export interface ContextSummary {
  text: string;
  throughId: string;
  createdAt: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  estimated: boolean;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  result?: any;
  error?: string;
  timestamp: number;
  providerData?: any;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'text';
  data: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  isStreaming?: boolean;
  isCompressionCard?: boolean;
  compressedCount?: number;
  tokensSaved?: number;
  summaryText?: string;
  summaryThroughId?: string;
  runId?: string;
  usage?: TokenUsage;
  status?: 'completed' | 'stopped' | 'error' | 'limit';
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  summary?: ContextSummary;
  version?: number;
  messageCount?: number;
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
  error?: string;
  frameId?: string;
  sessionId?: string;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  postData?: string;
  mimeType?: string;
  finished?: boolean;
  startedAt?: number;
}

export interface AgentActionTool {
  name: string;
  description: string;
  title?: string;
  group?: string;
  details?: string;
  browser?: boolean;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
