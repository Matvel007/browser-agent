import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/services/storage';
import { estimateHistoryTokens, formatAnthropic, formatGemini, formatOpenAI, geminiParameters, LLMClient, sseData } from '../../src/services/llm';
import { envelope } from '../../src/services/budget';

const messages: ChatMessage[] = [
  { id: 'u', role: 'user', content: 'Read title', timestamp: 1 },
  { id: 'a', role: 'assistant', content: '', timestamp: 2, toolCalls: [{ id: 'call1', name: 'devtools_get_page_summary', args: {}, status: 'success', timestamp: 2, result: envelope({ title: 'Example' }) }] },
];
function response(events: any[], size = 7) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') + 'data: [DONE]');
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close(); } }));
}
afterEach(() => vi.unstubAllGlobals());

describe('provider protocol', () => {
  it('keeps OpenAI tool calls and results paired', () => {
    const rows = formatOpenAI(messages);
    expect(rows[1].tool_calls[0].id).toBe('call1'); expect(rows[2].tool_call_id).toBe('call1');
  });
  it('sends Gemini functionCall and functionResponse', () => {
    const rows = formatGemini(messages);
    expect(rows[1].parts[0].functionCall.name).toBe('devtools_get_page_summary');
    expect(rows[2].parts[0].functionResponse.response.ok).toBe(true);
  });
  it('adapts open-ended JSON objects to the supported Gemini schema form', () => {
    expect(geminiParameters({ type: 'object', properties: { params: { type: 'object' } } }).properties.params.type).toBe('string');
  });
  it('sends Anthropic tool_use and tool_result', () => {
    const rows = formatAnthropic(messages);
    expect(rows[1].content[0].id).toBe('call1'); expect(rows[2].content[0].tool_use_id).toBe('call1');
  });
  it('includes a failed result for cancelled calls rather than orphaning them', () => {
    const cancelled = structuredClone(messages); cancelled[1].toolCalls![0].status = 'cancelled';
    expect(JSON.parse(formatOpenAI(cancelled)[2].content).ok).toBe(false);
  });
  it('handles UTF-8, CRLF and a final event without a newline', async () => {
    const stream = response([{ text: 'Привет' }], 1).body!;
    const events = []; for await (const event of sseData(stream)) events.push(event);
    expect(events).toEqual([{ text: 'Привет' }]);
  });
  for (const provider of ['routerai', 'aitunnel', 'openai', 'deepseek', 'custom'] as const) {
    it(`${provider}: streams text, multiple calls and usage`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(response([
        { choices: [{ delta: { content: 'Работаю', tool_calls: [{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"query":' } }, { index: 1, id: 'c2', function: { name: 'tools_describe', arguments: '{"name":"web_search"}' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"test"}' } }] }, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 12, completion_tokens: 8 } },
      ]));
      vi.stubGlobal('fetch', fetchMock);
      const result = await LLMClient.chat({ ...DEFAULT_SETTINGS, provider, apiKey: 'key', model: 'test', customBaseUrl: 'http://localhost/v1' }, messages);
      expect(result.content).toBe('Работаю'); expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].args).toEqual({ query: 'test' }); expect(result.usage).toEqual({ input: 12, output: 8, estimated: false });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.messages.some((m: any) => m.tool_call_id === 'call1')).toBe(true);
    });
  }
  it('Gemini preserves signatures, results and API usage without a key in URL', async () => {
    const mock = vi.fn().mockResolvedValue(response([{ candidates: [{ content: { parts: [{ functionCall: { name: 'web_search', args: { query: 'test' } }, thoughtSignature: 'signature' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }]));
    vi.stubGlobal('fetch', mock);
    const result = await LLMClient.chat({ ...DEFAULT_SETTINGS, provider: 'gemini', model: 'test', apiKey: 'key' }, messages);
    expect(result.toolCalls![0].providerData).toEqual({ thoughtSignature: 'signature' });
    expect(mock.mock.calls[0][0]).not.toContain('key=');
    expect(JSON.parse(mock.mock.calls[0][1].body).contents[2].parts[0].functionResponse).toBeTruthy();
  });
  it('Anthropic assembles indexed tool blocks and sends the browser-access header', async () => {
    const mock = vi.fn().mockResolvedValue(response([
      { type: 'message_start', message: { usage: { input_tokens: 8 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'newcall', name: 'web_search' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"test"}' } },
      { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } },
    ]));
    vi.stubGlobal('fetch', mock);
    const result = await LLMClient.chat({ ...DEFAULT_SETTINGS, provider: 'anthropic', model: 'test', apiKey: 'key' }, messages);
    expect(result.toolCalls![0].id).toBe('newcall'); expect(result.usage.output).toBe(6);
    expect(mock.mock.calls[0][1].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
  it('excludes disabled function schemas and includes their state compactly', async () => {
    const mock = vi.fn().mockResolvedValue(response([{ choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] }]));
    vi.stubGlobal('fetch', mock);
    await LLMClient.chat({ ...DEFAULT_SETTINGS, apiKey: 'key', model: 'test', disabledTools: ['devtools_evaluate_js'] }, messages);
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.tools.some((t: any) => t.function.name === 'devtools_evaluate_js')).toBe(false);
    expect(body.messages[0].content).toContain('Disabled: devtools_evaluate_js');
  });
  it('does not swallow protocol errors or execute malformed arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ error: { message: 'Overloaded' } }])));
    await expect(LLMClient.chat({ ...DEFAULT_SETTINGS, model: 'test', apiKey: 'key' }, messages)).rejects.toThrow('Overloaded');
  });
  it('attaches Gemini images to the existing user turn instead of adding a consecutive role', async () => {
    const mock = vi.fn().mockResolvedValue(response([{ candidates: [{ content: { parts: [{ text: 'Done' }] }, finishReason: 'STOP' }] }]));
    vi.stubGlobal('fetch', mock);
    await LLMClient.chat({ ...DEFAULT_SETTINGS, provider: 'gemini', model: 'test', apiKey: 'key' }, messages, {}, undefined, { images: [{ mime: 'image/jpeg', data: 'AAAA' }] });
    const contents = JSON.parse(mock.mock.calls[0][1].body).contents;
    const last = contents.at(-1);
    expect(contents.at(-2).role).toBe('model');
    expect(last.role).toBe('user');
    expect(last.parts[0].functionResponse).toBeTruthy();
    expect(last.parts.at(-1).inlineData).toEqual({ mimeType: 'image/jpeg', data: 'AAAA' });
  });
  it('attaches Anthropic images to the existing user tool_result turn', async () => {
    const mock = vi.fn().mockResolvedValue(response([{ type: 'message_start', message: { usage: { input_tokens: 1 } } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }]));
    vi.stubGlobal('fetch', mock);
    await LLMClient.chat({ ...DEFAULT_SETTINGS, provider: 'anthropic', model: 'test', apiKey: 'key' }, messages, {}, undefined, { images: [{ mime: 'image/png', data: 'BBBB' }] });
    const formatted = JSON.parse(mock.mock.calls[0][1].body).messages;
    const last = formatted.at(-1);
    expect(formatted.at(-2).role).toBe('assistant');
    expect(last.role).toBe('user');
    expect(last.content[0].type).toBe('tool_result');
    expect(last.content.at(-1)).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BBBB' } });
  });
  it('includes user attachments in OpenAI, Gemini and Anthropic payloads', () => {
    const attached: ChatMessage[] = [{ id: 'u', role: 'user', content: 'Look', timestamp: 1, attachments: [
      { id: 'img', name: 'photo.png', mime: 'image/png', size: 3, kind: 'image', data: 'AQID' },
      { id: 'txt', name: 'notes.txt', mime: 'text/plain', size: 5, kind: 'text', data: 'hello' },
    ] }];
    const openai = formatOpenAI(attached);
    expect(openai[0].content[0].text).toContain('[Attached file: notes.txt]');
    expect(openai[0].content.at(-1).image_url.url).toBe('data:image/png;base64,AQID');
    const gemini = formatGemini(attached);
    expect(gemini[0].parts[0].text).toContain('hello');
    expect(gemini[0].parts.at(-1).inlineData).toEqual({ mimeType: 'image/png', data: 'AQID' });
    const anthropic = formatAnthropic(attached);
    expect(anthropic[0].content[0].text).toContain('hello');
    expect(anthropic[0].content.at(-1)).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } });
  });
  it('counts user attachments in the context estimate', () => {
    const plain: ChatMessage[] = [{ id: 'u', role: 'user', content: 'Look', timestamp: 1 }];
    const attached: ChatMessage[] = [{ ...plain[0], attachments: [{ id: 'img', name: 'photo.png', mime: 'image/png', size: 3, kind: 'image', data: 'AQID' }] }];
    expect(estimateHistoryTokens(attached)).toBeGreaterThan(estimateHistoryTokens(plain) + 1000);
  });
});
