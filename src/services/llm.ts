import { AppSettings, ChatMessage, ToolCallRecord, AgentActionTool } from '../types';

export const DEVTOOLS_TOOLS: AgentActionTool[] = [
  {
    name: 'devtools_get_page_summary',
    description: 'Get the title, URL, and visible readable text content of the currently active page in the browser.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'devtools_click_element',
    description: 'Click an element on the active page by CSS selector using real hardware mouse events.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to click (e.g. "button#submit", "a.nav-link", "input[type=\'submit\']").',
        },
        description: {
          type: 'string',
          description: 'Brief description of what is being clicked for logging purposes.',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'devtools_type_text',
    description: 'Type text into an input, textarea, or contenteditable element using real hardware keystrokes.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input field.',
        },
        text: {
          type: 'string',
          description: 'The text to type into the field.',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Whether to clear existing text before typing. Default is true.',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'devtools_evaluate_js',
    description: 'Execute arbitrary JavaScript expression in the context of the active web page and return the evaluated value.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript expression or IIFE to evaluate (e.g. "document.title", "window.__INITIAL_STATE__").',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'devtools_get_console_logs',
    description: 'Get captured console logs, warnings, and runtime JavaScript exceptions from the active page.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'devtools_get_network_requests',
    description: 'Get captured network activity (API calls, fetch, XHR requests, HTTP status codes) from the active page.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'devtools_inspect_dom',
    description: 'Inspect the DOM tree structure or specific element hierarchy.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the root element to inspect. Default is "body".',
        },
      },
    },
  },
  {
    name: 'devtools_scroll_page',
    description: 'Scroll the active web page up or down.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Direction to scroll.',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll. Default is 500.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'devtools_navigate',
    description: 'Navigate the active tab to a new URL.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (e.g. "https://google.com").',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'devtools_capture_screenshot',
    description: 'Capture a visual screenshot of the current viewport as base64 image.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onToolCallStart?: (toolCall: ToolCallRecord) => void;
}

export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 3.5);
}

export function estimateHistoryTokens(messages: ChatMessage[], systemPrompt?: string): number {
  let chars = (systemPrompt || '').length;
  for (const m of messages) {
    chars += (m.content || '').length;
    if (m.toolCalls) {
      chars += JSON.stringify(m.toolCalls).length;
    }
  }
  return Math.ceil(chars / 3.5);
}

export class LLMClient {
  public static async fetchAvailableModels(settings: AppSettings): Promise<string[]> {
    let baseUrl = 'https://api.openai.com/v1';
    if (settings.provider === 'routerai') {
      baseUrl = 'https://routerai.ru/api/v1';
    } else if (settings.provider === 'aitunnel') {
      baseUrl = 'https://api.aitunnel.ru/v1';
    } else if (settings.provider === 'deepseek') {
      baseUrl = 'https://api.deepseek.com';
    } else if (settings.provider === 'custom' && settings.customBaseUrl) {
      baseUrl = settings.customBaseUrl.replace(/\/+$/, '');
    } else if (settings.provider === 'gemini') {
      // Gemini models
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
    } else if (settings.provider === 'anthropic') {
      // Anthropic models
      return [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ];
    }

    const headers: Record<string, string> = {};
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(`${baseUrl}/models`, { headers });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ошибка загрузки моделей (${response.status}): ${err.slice(0, 100)}`);
    }

    const json = await response.json();
    const rawList: any[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];

    // Filter out non-text/chat models
    const EXCLUDED_PATTERNS = [
      'dall-e',
      'dalle',
      'flux',
      'midjourney',
      'imagen',
      'stable-diffusion',
      'sdxl',
      'whisper',
      'tts',
      'audio',
      'voice',
      'speech',
      'transcription',
      'embedding',
      'embed',
      'bge',
      'moderation',
      'guard',
      'rerank',
    ];

    const filtered = rawList
      .map((item) => (typeof item === 'string' ? item : item.id || item.name || ''))
      .filter((id: string) => {
        if (!id) return false;
        const lower = id.toLowerCase();
        return !EXCLUDED_PATTERNS.some((p) => lower.includes(p));
      })
      .sort();

    return Array.from(new Set(filtered));
  }

  public static async summarizeHistory(
    settings: AppSettings,
    messagesToCompress: ChatMessage[],
    abortSignal?: AbortSignal
  ): Promise<string> {
    const textHistory = messagesToCompress
      .filter((m) => !m.isCompressionCard)
      .map((m) => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`)
      .join('\n\n');

    const prompt = `Пожалуйста, создай краткую, точную и структурированную сводку (summary) следующей переписки.
Сохрани ключевые факты, сущности, намерения пользователя, важные детали (URL, селекторы, результаты действий).
Сводка должна быть на русском языке, в виде 2-4 четких пунктов или кратких абзацев, без лишних вступлений:

${textHistory.slice(-12000)}`;

    try {
      if (settings.apiKey && settings.model) {
        const dummyMessages: ChatMessage[] = [
          {
            id: 'sum_req',
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          },
        ];
        const res = await this.chat(
          { ...settings, temperature: 0.3 },
          dummyMessages,
          {},
          abortSignal
        );
        if (res.content && res.content.trim()) {
          return res.content.trim();
        }
      }
    } catch (err) {
      console.warn('Failed to summarize via LLM, falling back to extractive summary:', err);
    }

    // Fallback: fast extractive summary if LLM call is unavailable or fails
    const userTopics = messagesToCompress
      .filter((m) => m.role === 'user' && !m.isCompressionCard)
      .map((m) => `• ${m.content.slice(0, 90).replace(/\n/g, ' ')}...`)
      .slice(-5)
      .join('\n');

    return `Диалог из ${messagesToCompress.length} сообщений.\nОсновные темы:\n${userTopics || '• Обсуждение страницы браузера и задач'}`;
  }

  public static async chat(
    settings: AppSettings,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal
  ): Promise<{ content: string; toolCalls?: ToolCallRecord[] }> {
    if (!settings.apiKey) {
      throw new Error('API-ключ не указан. Настройте провайдер и модель.');
    }

    // Apply context limits while preserving compression summary
    let effectiveMessages = [...messages];
    if (settings.maxHistoryMessages && settings.maxHistoryMessages > 0) {
      const compCardIndex = effectiveMessages.findIndex((m) => m.isCompressionCard);
      if (compCardIndex !== -1) {
        const compCard = effectiveMessages[compCardIndex];
        const afterComp = effectiveMessages.slice(compCardIndex + 1);
        effectiveMessages = [compCard, ...afterComp.slice(-settings.maxHistoryMessages)];
      } else {
        effectiveMessages = effectiveMessages.slice(-settings.maxHistoryMessages);
      }
    }

    if (
      settings.provider === 'routerai' ||
      settings.provider === 'aitunnel' ||
      settings.provider === 'openai' ||
      settings.provider === 'deepseek' ||
      settings.provider === 'custom'
    ) {
      return this.chatOpenAICompatible(settings, effectiveMessages, callbacks, abortSignal);
    } else if (settings.provider === 'gemini') {
      return this.chatGemini(settings, effectiveMessages, callbacks, abortSignal);
    } else if (settings.provider === 'anthropic') {
      return this.chatAnthropic(settings, effectiveMessages, callbacks, abortSignal);
    }

    throw new Error(`Неподдерживаемый провайдер: ${settings.provider}`);
  }

  // --- OpenAI / RouterAI / AItunnel / DeepSeek / Custom provider ---
  private static async chatOpenAICompatible(
    settings: AppSettings,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal
  ): Promise<{ content: string; toolCalls?: ToolCallRecord[] }> {
    let baseUrl = 'https://api.openai.com/v1';
    let defaultModel = 'gpt-4o';

    if (settings.provider === 'routerai') {
      baseUrl = 'https://routerai.ru/api/v1';
      defaultModel = 'openai/gpt-4o-mini';
    } else if (settings.provider === 'aitunnel') {
      baseUrl = 'https://api.aitunnel.ru/v1';
      defaultModel = 'gpt-4o-mini';
    } else if (settings.provider === 'deepseek') {
      baseUrl = 'https://api.deepseek.com';
      defaultModel = 'deepseek-chat';
    } else if (settings.provider === 'custom' && settings.customBaseUrl) {
      baseUrl = settings.customBaseUrl.replace(/\/+$/, '');
    }

    const model = settings.model || defaultModel;

    // Convert internal ChatMessage format to OpenAI format
    const formattedMessages: any[] = [];
    if (settings.systemPrompt) {
      formattedMessages.push({ role: 'system', content: settings.systemPrompt });
    }

    for (const msg of messages) {
      if (msg.isCompressionCard) {
        formattedMessages.push({
          role: 'system',
          content: `[Сводка предыдущего сжатого контекста диалога]:\n${msg.summaryText || msg.content}`,
        });
        continue;
      }
      if (msg.role === 'user') {
        formattedMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const item: any = { role: 'assistant', content: msg.content || '' };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          item.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }
        formattedMessages.push(item);

        // Also add tool responses if any
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.status === 'success' || tc.status === 'error') {
              formattedMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result ?? tc.error),
              });
            }
          }
        }
      }
    }

    // Convert tool definitions to OpenAI format
    const tools = DEVTOOLS_TOOLS.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        tools,
        tool_choice: 'auto',
        temperature: settings.temperature ?? 0.7,
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = errText;
      try {
        const json = JSON.parse(errText);
        msg = json.error?.message || errText;
      } catch {}
      throw new Error(`API error (${response.status}): ${msg}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable response body stream from API');

    const decoder = new TextDecoder();
    let accumulatedContent = '';
    const toolCallBuffers: { id: string; name: string; argsStr: string }[] = [];

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') continue;

        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Streaming text chunk
          if (delta.content) {
            accumulatedContent += delta.content;
            callbacks.onChunk(accumulatedContent);
          }

          // Streaming tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCallBuffers[index]) {
                toolCallBuffers[index] = {
                  id: tc.id || `tc_${Date.now()}_${index}`,
                  name: tc.function?.name || '',
                  argsStr: '',
                };
              }
              if (tc.id) toolCallBuffers[index].id = tc.id;
              if (tc.function?.name) toolCallBuffers[index].name = tc.function.name;
              if (tc.function?.arguments) toolCallBuffers[index].argsStr += tc.function.arguments;
            }
          }
        } catch (e) {
          // ignore incomplete JSON chunk parse errors
        }
      }
    }

    // Process completed tool calls
    const parsedToolCalls: ToolCallRecord[] = [];
    for (const raw of toolCallBuffers) {
      if (!raw || !raw.name) continue;
      let argsObj: any = {};
      try {
        argsObj = JSON.parse(raw.argsStr || '{}');
      } catch {
        argsObj = { raw: raw.argsStr };
      }
      parsedToolCalls.push({
        id: raw.id,
        name: raw.name,
        args: argsObj,
        status: 'pending',
        timestamp: Date.now(),
      });
    }

    return {
      content: accumulatedContent,
      toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
    };
  }

  // --- Google Gemini Provider ---
  private static async chatGemini(
    settings: AppSettings,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal
  ): Promise<{ content: string; toolCalls?: ToolCallRecord[] }> {
    const model = settings.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${settings.apiKey}&alt=sse`;

    const contents: any[] = [];
    for (const msg of messages) {
      if (msg.isCompressionCard) {
        contents.push({
          role: 'user',
          parts: [{ text: `[Контекст предыдущей части диалога]:\n${msg.summaryText || msg.content}` }],
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Понял, учитываю контекст предыдущей части диалога.' }],
        });
        continue;
      }
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content || '' }],
      });
    }

    const functionDeclarations = DEVTOOLS_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: settings.systemPrompt
          ? { parts: [{ text: settings.systemPrompt }] }
          : undefined,
        tools: [{ functionDeclarations }],
        generationConfig: {
          temperature: settings.temperature ?? 0.7,
        },
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream from Gemini');

    const decoder = new TextDecoder();
    let accumulatedContent = '';
    const parsedToolCalls: ToolCallRecord[] = [];

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const candidate = parsed.candidates?.[0];
          if (!candidate) continue;

          for (const part of candidate.content?.parts || []) {
            if (part.text) {
              accumulatedContent += part.text;
              callbacks.onChunk(accumulatedContent);
            }
            if (part.functionCall) {
              parsedToolCalls.push({
                id: `gemini_call_${Date.now()}_${parsedToolCalls.length}`,
                name: part.functionCall.name,
                args: part.functionCall.args || {},
                status: 'pending',
                timestamp: Date.now(),
              });
            }
          }
        } catch {}
      }
    }

    return {
      content: accumulatedContent,
      toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
    };
  }

  // --- Anthropic Claude Provider ---
  private static async chatAnthropic(
    settings: AppSettings,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    abortSignal?: AbortSignal
  ): Promise<{ content: string; toolCalls?: ToolCallRecord[] }> {
    const model = settings.model || 'claude-3-5-sonnet-20241022';
    const url = 'https://api.anthropic.com/v1/messages';

    const formattedMessages: any[] = [];
    for (const msg of messages) {
      if (msg.isCompressionCard) {
        formattedMessages.push({
          role: 'user',
          content: `[Контекст предыдущей части диалога]:\n${msg.summaryText || msg.content}`,
        });
        formattedMessages.push({
          role: 'assistant',
          content: 'Понял, учитываю контекст предыдущей части диалога.',
        });
        continue;
      }
      if (msg.role === 'user' || msg.role === 'assistant') {
        formattedMessages.push({
          role: msg.role,
          content: msg.content || '',
        });
      }
    }

    const tools = DEVTOOLS_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        system: settings.systemPrompt,
        tools,
        max_tokens: 4096,
        temperature: settings.temperature ?? 0.7,
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream from Anthropic');

    const decoder = new TextDecoder();
    let accumulatedContent = '';
    const parsedToolCalls: ToolCallRecord[] = [];

    let currentTool: { id: string; name: string; json: string } | null = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.type === 'content_block_start') {
            if (parsed.content_block?.type === 'tool_use') {
              currentTool = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                json: '',
              };
            }
          } else if (parsed.type === 'content_block_delta') {
            if (parsed.delta?.type === 'text_delta') {
              accumulatedContent += parsed.delta.text;
              callbacks.onChunk(accumulatedContent);
            } else if (parsed.delta?.type === 'input_json_delta' && currentTool) {
              currentTool.json += parsed.delta.partial_json;
            }
          } else if (parsed.type === 'content_block_stop') {
            if (currentTool) {
              let args = {};
              try {
                args = JSON.parse(currentTool.json);
              } catch {}
              parsedToolCalls.push({
                id: currentTool.id,
                name: currentTool.name,
                args,
                status: 'pending',
                timestamp: Date.now(),
              });
              currentTool = null;
            }
          }
        } catch {}
      }
    }

    return {
      content: accumulatedContent,
      toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
    };
  }
}
