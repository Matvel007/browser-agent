import { AppSettings, ArtifactRef, ChatMessage, ToolProfile, ToolResult } from '../types';
import { ARTIFACT_MAX_BYTES, dbRequest, getArtifact, putArtifact } from './artifacts';
import { envelope, pageItems, PROFILES, serializeArtifact } from './budget';
import { devtools } from './devtools';
import { isToolEnabled, TOOLS } from './tools';
import { publicUrl, webRead, webSearch } from './search';
import { groupTranscript } from './transcript';

export interface ToolContext { tabId?: number; sessionId: string; runId: string; signal: AbortSignal; history?: ChatMessage[] }
const snapshots = new Map<string, string>();

export function validateArguments(name: string, args: any) {
  const definition = TOOLS.find(t => t.name === name);
  if (!definition) throw new Error(`Unknown tool: ${name}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object');
  const required = new Set(definition.parameters.required || []);
  for (const key of required) if (args[key] == null) throw new Error(`Required argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(definition.parameters.properties, key)) throw new Error(`Unknown argument: ${key}`);
    if (value === null || value === undefined) {
      if (required.has(key)) throw new Error(`Required argument: ${key}`);
      delete args[key];
      continue;
    }
    const schema = definition.parameters.properties[key];
    let normalized = value;
    if (schema.type === 'object' && typeof value === 'string') { try { normalized = JSON.parse(value); } catch { throw new Error(`Invalid JSON object for ${key}`); } }
    if ((schema.type === 'array' && !Array.isArray(normalized)) || (schema.type === 'object' && (normalized == null || typeof normalized !== 'object' || Array.isArray(normalized)))
      || (['string', 'number', 'boolean'].includes(schema.type) && typeof normalized !== schema.type)) throw new Error(`Invalid type for ${key}`);
    if (schema.type === 'array' && schema.items?.type && !(normalized as any[]).every((item: any) => typeof item === schema.items.type)) throw new Error(`Invalid array item type for ${key}`);
    args[key] = normalized;
    if (schema.enum && !schema.enum.includes(normalized)) throw new Error(`Invalid value for ${key}`);
    if (schema.type === 'number' && !Number.isFinite(normalized)) throw new Error(`Invalid number for ${key}`);
  }
  return definition;
}

function abortableDelay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function binaryArtifact(data: string, mime: string, name: string, sessionId: string) {
  if (data.length > ARTIFACT_MAX_BYTES * 1.4) throw new Error('Binary capture exceeds 8 MiB; use a smaller region');
  const bytes = Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
  return putArtifact(new Blob([bytes], { type: mime }), name, sessionId);
}

export async function executeTool(name: string, args: any, settings: AppSettings, context: ToolContext): Promise<ToolResult> {
  const profile: ToolProfile = args?.full ? 'full' : args?.profile || settings.toolProfile;
  try {
    context.signal.throwIfAborted();
    if (args && typeof args === 'object' && !Array.isArray(args)) args = { ...args };
    const definition = validateArguments(name, args);
    if (!isToolEnabled(settings, name)) throw new Error('Tool is disabled in settings');
    const tabId = context.tabId;
    if (definition.browser && name !== 'browser_tabs') {
      if (tabId == null) throw new Error('No target tab selected');
      if (!settings.autoAttachDebugger && !devtools.isAttached(tabId)) throw new Error('Attach the debugger in the header or enable automatic connection');
    }
    let result: any;
    let artifact: ArtifactRef | undefined;
    let truncation: string[] = [];
    let next: string | undefined;
    const id = tabId!;
    switch (name) {
      case 'history_read': {
        const session: any = await dbRequest('sessions', 'readonly', store => store.get(context.sessionId));
        const transcript = context.history || session?.messages;
        if (!transcript) throw new Error('History is not saved for this chat');
        const rows = groupTranscript(transcript).filter(group => group.role === 'user' || group.role === 'assistant').map(group => ({
          id: group.id, role: group.role, content: group.messages.filter(m => !m.isCompressionCard).map(m => m.content).filter(Boolean).join('\n\n'), timestamp: group.messages[0].timestamp,
          actions: group.messages.flatMap(m => m.toolCalls || []).map(call => ({ name: call.name, status: call.status, summary: call.result?.summary, artifactId: call.result?.artifact?.id })),
        })).filter(message => !args.text || message.content.toLowerCase().includes(args.text.toLowerCase()));
        result = pageItems(rows, args.cursor, args.limit || 5); break;
      }
      case 'tools_describe': {
        const tool = TOOLS.find(t => t.name === args.name);
        if (!tool) throw new Error('Unknown tool');
        result = { ...tool, enabled: isToolEnabled(settings, tool.name), browserAvailable: Boolean(chrome.debugger), available: !tool.browser || tabId != null };
        break;
      }
      case 'artifact_read': {
        const row = await getArtifact(args.id, context.sessionId);
        if (row.mime.startsWith('image/') || !/json|text|javascript|xml/.test(row.mime)) {
          const { blob: _, ...ref } = row; artifact = ref;
          result = { ...ref, message: 'Binary artifact; open its preview or download in the chat' };
        }
        else {
          const text = await row.blob.text();
          let value: any = row.mime.includes('json') ? JSON.parse(text) : text;
          if (args.path) value = String(args.path).split('.').reduce((v: any, key: string) => v?.[key], value);
          if (value === undefined) throw new Error('JSON path not found');
          if (typeof value === 'string') {
            const lines = value.split('\n').filter(line => !args.text || line.includes(args.text));
            // Small chunks prevent the serializer silently clipping requested text pages.
            const chunks = lines.flatMap(line => line.match(/[\s\S]{1,500}/g) || ['']);
            result = pageItems(chunks, args.cursor, args.limit || 8);
          } else if (Array.isArray(value)) result = pageItems(value, args.cursor, args.limit || 10);
          else result = pageItems(Object.entries(value || {}).map(([key, data]) => ({ key, value: data })), args.cursor, args.limit || 10);
          next = result.nextCursor ? `artifact_read {id:"${row.id}",cursor:"${result.nextCursor}"}` : undefined;
        }
        break;
      }
      case 'web_search': result = await webSearch(settings, args, context.signal); break;
      case 'web_read': result = await webRead(args, context.signal); break;
      case 'browser_tabs': {
        const targetId = args.tabId ?? tabId;
        switch (args.action) {
          case 'list': result = pageItems((await chrome.tabs.query({ currentWindow: true })).map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active })), args.cursor, args.limit); break;
          case 'create': { const tab = await chrome.tabs.create({ url: publicUrl(args.url), active: true }); result = { selectedTabId: tab.id, url: tab.url }; break; }
          case 'select': {
            if (targetId == null) throw new Error('tabId required');
            const tab = await chrome.tabs.update(targetId, { active: true });
            result = { selectedTabId: tab?.id, url: tab?.url }; break;
          }
          case 'close': if (targetId == null) throw new Error('tabId required'); await chrome.tabs.remove(targetId); result = { closedTabId: targetId }; break;
          case 'reload': if (targetId == null) throw new Error('tabId required'); await chrome.tabs.reload(targetId); result = { reloadedTabId: targetId }; break;
          case 'back': await chrome.tabs.goBack(targetId); result = { navigation: 'back' }; break;
          case 'forward': await chrome.tabs.goForward(targetId); result = { navigation: 'forward' }; break;
          default: throw new Error('Unknown tab action');
        }
        break;
      }
      case 'devtools_get_page_summary':
        result = await devtools.getPageSummary(id);
        if (result.contentLength > result.content.length) truncation.push(`Text capture: ${result.content.length} of ${result.contentLength} characters; narrow via JS projection`);
        if (result.captureLimited) truncation.push('Readable-text scan reached its node limit; use a narrower DOM/JS projection');
        break;
      case 'devtools_inspect_dom':
        result = await devtools.inspectDom(id, args);
        if (result.omitted) truncation.push(`DOM capture omitted ${result.omitted} nodes; narrow the selector or use CDP DOMSnapshot`);
        break;
      case 'devtools_accessibility': {
        const tree = await devtools.sendCommand(id, 'Accessibility.getFullAXTree');
        result = pageItems(tree.nodes || [], args.cursor, args.limit || 20); break;
      }
      case 'devtools_click_element': result = await devtools.clickElement(id, args.selector, args.frameId); break;
      case 'devtools_hover': result = await devtools.clickElement(id, args.selector, args.frameId, true); break;
      case 'devtools_type_text': result = await devtools.typeText(id, args); break;
      case 'devtools_set_value': result = await devtools.setValue(id, args); break;
      case 'devtools_scroll_page': result = await devtools.scrollPage(id, args); break;
      case 'devtools_navigate': result = await devtools.navigate(id, args.url); break;
      case 'devtools_press_key': {
        for (const type of ['keyDown', 'keyUp']) await devtools.sendCommand(id, 'Input.dispatchKeyEvent', { type, key: args.key, modifiers: args.modifiers || 0,
          windowsVirtualKeyCode: ({ Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 } as Record<string, number>)[args.key] });
        result = { key: args.key }; break;
      }
      case 'devtools_wait': {
        if (!args.selector && !args.url) throw new Error('selector or url required');
        const deadline = Date.now() + Math.min(30000, Math.max(100, args.timeoutMs || 10000));
        do {
          context.signal.throwIfAborted();
          const ready = await devtools.waitState(id, args);
          if (ready) { result = { ready: true }; break; }
          await abortableDelay(250, context.signal);
        } while (Date.now() < deadline);
        if (!result) throw new Error('Wait deadline exceeded');
        break;
      }
      case 'devtools_evaluate_js': {
        const evaluated = await devtools.evaluateJs(id, args.code, args.frameId, args.projection);
        result = evaluated?.value; truncation = evaluated?.captureTruncation || []; break;
      }
      case 'devtools_get_console_logs': result = await devtools.consoleLogs(id, args); break;
      case 'devtools_get_network_requests': result = await devtools.network(id, args); break;
      case 'devtools_network_detail': result = await devtools.networkDetail(id, args); break;
      case 'devtools_capture_screenshot': {
        if (args.mode === 'text') { result = await devtools.getPageSummary(id); break; }
        if (args.mode === 'a11y') { result = await devtools.sendCommand(id, 'Accessibility.getFullAXTree'); break; }
        if (args.frameId) throw new Error('Frame-local screenshot regions require a child-session Page.captureScreenshot via devtools_cdp');
        const targetBox = args.selector ? await devtools.box(id, args.selector, args.frameId) : undefined;
        const metrics = await devtools.sendCommand(id, 'Page.getLayoutMetrics');
        const viewport = metrics.cssVisualViewport || metrics.visualViewport;
        const region = targetBox || { left: viewport.pageX, top: viewport.pageY, width: viewport.clientWidth, height: viewport.clientHeight };
        const scale = Math.min(1, Math.max(200, Math.min(2000, args.maxWidth || 1000)) / region.width);
        const image = await devtools.sendCommand(id, 'Page.captureScreenshot', { format: 'jpeg', quality: Math.max(20, Math.min(90, args.quality || 45)),
          clip: { x: region.left + (args.selector ? viewport.pageX : 0), y: region.top + (args.selector ? viewport.pageY : 0), width: region.width, height: region.height, scale }, captureBeyondViewport: false });
        artifact = await binaryArtifact(image.data, 'image/jpeg', 'screenshot.jpg', context.sessionId);
        result = { width: Math.round(region.width * scale), height: Math.round(region.height * scale), visionRequested: Boolean(args.vision) }; break;
      }
      case 'devtools_dom_css': {
        result = await devtools.value(id, `(() => {const state=globalThis.__browserAgentElements;const selector=${JSON.stringify(args.selector)};
          const el=selector.startsWith('@')?state?.nodes.get(selector):document.querySelector(selector);if(!el?.isConnected)throw new Error('Element missing or reference stale');
          const changes=${JSON.stringify(args.styles || {})};for(const [key,value]of Object.entries(changes))el.style.setProperty(key,String(value));
          const computed=getComputedStyle(el);return Object.fromEntries(${JSON.stringify(args.properties || ['display', 'position', 'color', 'background-color', 'font-size', 'width', 'height'])}.map(key=>[key,computed.getPropertyValue(key)]));})()`, args.frameId); break;
      }
      case 'devtools_storage': {
        if (args.area === 'cookies') {
          if (args.action !== 'list') throw new Error('Use Network.setCookie/deleteCookies via devtools_cdp for cookie changes');
          result = await devtools.sendCommand(id, 'Network.getCookies');
        } else result = await devtools.value(id, `(() => {const storage=${args.area === 'local' ? 'localStorage' : 'sessionStorage'};
          const action=${JSON.stringify(args.action)},key=${JSON.stringify(args.key || '')};
          if(action==='get')return {key,value:storage.getItem(key)};
          if(action==='set'){storage.setItem(key,${JSON.stringify(String(args.value ?? ''))});return {changed:key};}
          if(action==='remove'){storage.removeItem(key);return {removed:key};}
          return Object.fromEntries(Object.keys(storage).map(k=>[k,storage.getItem(k)]));})()`);
        break;
      }
      case 'devtools_performance': {
        const domain = args.action?.startsWith('profile') ? 'Profiler' : 'Performance';
        await devtools.sendCommand(id, `${domain}.enable`);
        result = await devtools.sendCommand(id, args.action === 'profileStart' ? 'Profiler.start' : args.action === 'profileStop' ? 'Profiler.stop' : 'Performance.getMetrics'); break;
      }
      case 'devtools_emulate': {
        if (args.reset) await devtools.sendCommand(id, 'Emulation.clearDeviceMetricsOverride');
        else await devtools.sendCommand(id, 'Emulation.setDeviceMetricsOverride', { width: Math.max(200, Math.min(4000, args.width || 390)), height: Math.max(200, Math.min(4000, args.height || 844)), deviceScaleFactor: Math.max(1, Math.min(4, args.deviceScaleFactor || 1)), mobile: Boolean(args.mobile) });
        await devtools.sendCommand(id, 'Emulation.setTouchEmulationEnabled', { enabled: !args.reset && Boolean(args.mobile) }); result = { emulated: !args.reset }; break;
      }
      case 'devtools_debugger': result = await devtools.debuggerAction(id, args); break;
      case 'devtools_cdp': result = await devtools.sendCommand(id, args.method, args.params || {}, args.sessionId); break;
      case 'devtools_events': result = await devtools.eventPage(id, args); break;
      default: throw new Error('Tool has no implementation');
    }
    context.signal.throwIfAborted();

    if (!artifact && typeof result === 'string' && result.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(result);
      if (match) {
        artifact = await binaryArtifact(match[2], match[1], 'binary-capture', context.sessionId);
        result = { binary: true, bytes: artifact.bytes };
      }
    }
    // CDP binary responses must also use the artifact path, including the generic escape hatch.
    if (!artifact && result && (result.base64Encoded || (name === 'devtools_cdp' && args.method === 'Page.captureScreenshot'))) {
      const encoded = result.body || result.data;
      if (typeof encoded === 'string') {
        artifact = await binaryArtifact(encoded, name === 'devtools_cdp' && args.method === 'Page.captureScreenshot' ? `image/${args.params?.format === 'jpeg' ? 'jpeg' : 'png'}` : 'application/octet-stream', 'cdp-capture', context.sessionId);
        result = { binary: true, bytes: artifact.bytes };
      }
    }

    if (args.changedOnly && ['devtools_get_page_summary', 'devtools_inspect_dom'].includes(name)) {
      const key = `${context.sessionId}:${id}:${name}:${args.selector || ''}:${args.frameId || ''}`;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(result))))].map(v => v.toString(16).padStart(2, '0')).join('');
      if (snapshots.get(key) === digest) return envelope({ changed: false, hash: digest }, { profile, summary: 'Snapshot unchanged' });
      snapshots.set(key, digest); if (snapshots.size > 50) snapshots.delete(snapshots.keys().next().value!);
      result = { ...result, hash: digest, changed: true };
    }
    const serialized = serializeArtifact(result ?? null);
    const preview = envelope(result, { profile, truncation });
    if (!artifact && name !== 'artifact_read' && (args.full || args.mode === 'har' || preview.truncated || serialized.length > PROFILES[profile].chars / 2)) {
      // Credentials are excluded; original data stays in the artifact, not in the model's text channel.
      artifact = await putArtifact(new Blob([serialized], { type: 'application/json' }), args.mode === 'har' ? 'network.har' : `${name}.json`, context.sessionId);
    }
    if (artifact) next = `artifact_read {id:"${artifact.id}"}; or open/download the artifact in the chat`;
    else if (result?.nextCursor) next = `Repeat ${name} with cursor:"${result.nextCursor}" and the same filters`;
    return envelope(result, { profile, artifact, next, truncation, summary: `${definition.title}: completed` });
  } catch (err: any) {
    if (context.signal.aborted) throw err;
    return envelope({ error: String(err?.message || err).split('\n').slice(0, 5).join('\n') }, { ok: false, profile: ['lean', 'balanced', 'full'].includes(profile) ? profile : 'balanced', summary: `${name}: failed` });
  }
}
