import { ConsoleLogItem, NetworkRequestItem } from '../types';
import { cleanUrl, envelope, pageItems, projectValue, redactText } from './budget';

export const CDP_DOMAINS = new Set(['Accessibility', 'Audits', 'CacheStorage', 'Console', 'CSS', 'Database', 'Debugger', 'DOM', 'DOMDebugger', 'DOMSnapshot', 'DOMStorage', 'Emulation', 'Fetch', 'IO', 'Input', 'Inspector', 'Log', 'Network', 'Overlay', 'Page', 'Performance', 'Profiler', 'Runtime', 'Storage', 'Target', 'Tracing', 'WebAudio', 'WebAuthn']);
type Target = chrome.debugger.Debuggee & { sessionId?: string };

export function aggregateNetwork(rows: NetworkRequestItem[]) {
  const byType: Record<string, number> = {}, byStatus: Record<string, number> = {}, byOrigin: Record<string, number> = {};
  for (const row of rows) {
    const type = row.type || 'Other', status = row.error ? 'failed' : String(row.status || 'pending');
    let origin = '[other]'; try { origin = new URL(row.url).origin; } catch {}
    byType[type] = (byType[type] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    byOrigin[origin] = (byOrigin[origin] || 0) + 1;
  }
  const compact = (row: NetworkRequestItem) => ({ requestId: row.requestId, url: cleanUrl(row.url), method: row.method, status: row.status, ms: row.duration, error: row.error, sessionId: row.sessionId });
  return { total: rows.length, byType, byStatus, byOrigin,
    errors: rows.filter(r => r.error || (r.status || 0) >= 400).slice(-10).map(compact),
    interesting: rows.filter(r => /fetch|xhr/i.test(r.type || '')).slice(-10).map(compact) };
}

export function groupConsole(rows: ConsoleLogItem[]) {
  const groups = new Map<string, { level: string; text: string; count: number; firstAt: number; lastAt: number; url?: string }>();
  for (const row of rows) {
    const text = redactText(row.text).split('\n').slice(0, 6).join('\n').slice(0, 4000);
    const key = JSON.stringify([row.type, text, row.url]);
    const current = groups.get(key);
    if (current) { current.count++; current.lastAt = row.timestamp; }
    else groups.set(key, { level: row.type, text, count: 1, firstAt: row.timestamp, lastAt: row.timestamp, url: row.url ? cleanUrl(row.url) : undefined });
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt);
}

function matchUrlPattern(pattern: string, url: string) {
  if (!pattern || pattern === '*') return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

export class DevToolsService {
  private attached = new Set<number>();
  private attaching = new Map<number, Promise<void>>();
  private logs = new Map<number, ConsoleLogItem[]>();
  private requests = new Map<number, NetworkRequestItem[]>();
  private events = new Map<number, any[]>();
  private scripts = new Map<number, any[]>();
  private contexts = new Map<number, Map<string, number>>();
  private frameSessions = new Map<number, Map<string, string>>();
  private dialogs = new Map<number, { type: string; message: string; defaultPrompt?: string; url?: string; at: number }>();
  private intercepts = new Map<number, { pattern: string; action: 'block' | 'mock'; status: number; body: string; mimeType: string; paused: number }>();
  private dropped = new Map<number, number>();
  private capturedAt = new Map<number, number>();
  private sequence = 0;

  constructor() {
    if (typeof chrome === 'undefined' || !chrome.debugger) return;
    chrome.debugger.onDetach.addListener(source => { if (source.tabId != null) { this.attached.delete(source.tabId); this.contexts.delete(source.tabId); } });
    chrome.tabs.onRemoved.addListener(id => this.cleanup(id));
    chrome.debugger.onEvent.addListener((source: Target, method, params: any = {}) => {
      const tabId = source.tabId;
      if (tabId == null) return;
      const add = <T>(map: Map<number, T[]>, item: T, max = 300) => {
        const list = map.get(tabId) || []; list.push(item);
        if (list.length > max) { list.shift(); this.dropped.set(tabId, (this.dropped.get(tabId) || 0) + 1); }
        map.set(tabId, list);
      };
      add(this.events, { sequence: ++this.sequence, method, sessionId: source.sessionId, at: Date.now(), params: envelope(params, { profile: 'lean' }) });
      if (method === 'Runtime.executionContextCreated' && params.context?.auxData?.frameId && params.context.auxData.isDefault) {
        const frameId = params.context.auxData.frameId;
        const contexts = this.contexts.get(tabId) || new Map(); contexts.set(frameId, params.context.id); this.contexts.set(tabId, contexts);
        if (source.sessionId) {
          const sessions = this.frameSessions.get(tabId) || new Map(); sessions.set(frameId, source.sessionId); this.frameSessions.set(tabId, sessions);
        }
      }
      if (method === 'Runtime.executionContextsCleared' && !source.sessionId) this.contexts.delete(tabId);
      if (method === 'Runtime.executionContextDestroyed') {
        for (const [frame, id] of this.contexts.get(tabId) || []) if (id === params.executionContextId) this.contexts.get(tabId)?.delete(frame);
      }
      if (method === 'Page.javascriptDialogOpening') {
        this.dialogs.set(tabId, { type: String(params.type || 'alert'), message: String(params.message || ''), defaultPrompt: params.defaultPrompt,
          url: params.url, at: Date.now() });
      }
      if (method === 'Page.javascriptDialogClosed') this.dialogs.delete(tabId);
      if (method === 'Fetch.requestPaused') {
        const requestId = params.requestId;
        const url = String(params.request?.url || '');
        const config = this.intercepts.get(tabId);
        if (!config) void this.sendCommand(tabId, 'Fetch.continueRequest', { requestId }).catch(() => {});
        else {
          config.paused++;
          if (!matchUrlPattern(config.pattern, url)) void this.sendCommand(tabId, 'Fetch.continueRequest', { requestId }).catch(() => {});
          else if (config.action === 'block') void this.sendCommand(tabId, 'Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
          else void this.sendCommand(tabId, 'Fetch.fulfillRequest', { requestId, responseCode: config.status,
            responseHeaders: [{ name: 'Content-Type', value: config.mimeType }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }],
            body: btoa(unescape(encodeURIComponent(config.body))) }).catch(() => {});
        }
      }
      if (method === 'Target.attachedToTarget') {
        void this.initialize({ tabId, sessionId: params.sessionId }).catch(() => {});
      }
      if (method === 'Runtime.consoleAPICalled') {
        add(this.logs, { type: params.type || 'log', text: (params.args || []).map((a: any) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 4000), timestamp: Date.now(), url: params.stackTrace?.callFrames?.[0]?.url });
      }
      if (method === 'Runtime.exceptionThrown') {
        const ex = params.exceptionDetails || {};
        add(this.logs, { type: 'error', text: String(ex.exception?.description || ex.text || 'Runtime error').split('\n').slice(0, 6).join('\n').slice(0, 4000), timestamp: Date.now(), url: ex.url });
      }
      if (method === 'Debugger.scriptParsed') add(this.scripts, { scriptId: params.scriptId, url: params.url, sessionId: source.sessionId, length: params.length }, 1000);
      if (method === 'Network.requestWillBeSent') {
        if (params.redirectResponse) {
          const old = this.findRequest(tabId, params.requestId, source.sessionId);
          if (old) { old.status = params.redirectResponse.status; old.finished = true; }
        }
        const req = params.request || {};
        add(this.requests, { requestId: params.requestId, sessionId: source.sessionId, url: String(req.url || '').slice(0, 16000), method: req.method,
          type: params.type, timestamp: Date.now(), startedAt: params.timestamp, frameId: params.frameId,
          requestHeaders: projectValue(req.headers, 'full').data, postData: req.postData?.slice(0, 16000) }, 500);
      }
      const row = params.requestId && method.startsWith('Network.') ? this.findRequest(tabId, params.requestId, source.sessionId) : undefined;
      if (row && method === 'Network.responseReceived') {
        row.status = params.response?.status; row.mimeType = params.response?.mimeType;
        row.responseHeaders = projectValue(params.response?.headers, 'full').data;
      }
      if (row && (method === 'Network.loadingFinished' || method === 'Network.loadingFailed')) {
        row.finished = true; row.error = params.errorText;
        row.duration = row.startedAt != null && params.timestamp != null ? Math.round((params.timestamp - row.startedAt) * 1000) : Date.now() - row.timestamp;
      }
    });
  }

  private cleanup(id: number) {
    this.attached.delete(id); this.attaching.delete(id); this.logs.delete(id); this.requests.delete(id);
    this.events.delete(id); this.scripts.delete(id); this.contexts.delete(id); this.frameSessions.delete(id);
    this.dialogs.delete(id); this.intercepts.delete(id); this.dropped.delete(id); this.capturedAt.delete(id);
  }

  private findRequest(tabId: number, id: string, sessionId?: string) {
    return (this.requests.get(tabId) || []).findLast(r => r.requestId === id && r.sessionId === sessionId);
  }

  isAttached(tabId: number) { return this.attached.has(tabId); }

  private async initialize(target: Target) {
    for (const domain of ['Runtime', 'Page', 'Network']) await chrome.debugger.sendCommand(target, `${domain}.enable`);
    // Flat child sessions are unavailable on older Chromium versions. Main-frame tools remain usable.
    await chrome.debugger.sendCommand(target, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
      filter: [{ type: 'iframe', exclude: false }, { type: 'worker', exclude: false }, { exclude: true }] }).catch(() => {});
  }

  async attach(tabId: number): Promise<boolean> {
    if (this.attached.has(tabId)) return true;
    if (!this.attaching.has(tabId)) this.attaching.set(tabId, (async () => {
      if (!chrome.debugger) throw new Error('chrome.debugger is unavailable in this browser');
      await chrome.debugger.attach({ tabId }, '1.3');
      try { await this.initialize({ tabId }); this.attached.add(tabId); this.capturedAt.set(tabId, Date.now()); }
      catch (err) { await chrome.debugger.detach({ tabId }).catch(() => {}); throw err; }
    })());
    try { await this.attaching.get(tabId); return true; }
    finally { this.attaching.delete(tabId); }
  }

  async detach(tabId: number) {
    await chrome.debugger.detach({ tabId }); this.cleanup(tabId);
  }

  async sendCommand(tabId: number, method: string, params: Record<string, any> = {}, sessionId?: string): Promise<any> {
    if (!CDP_DOMAINS.has(method.split('.')[0]) || !/^[A-Za-z]+\.[A-Za-z]+$/.test(method)) throw new Error('Unsupported chrome.debugger domain or command');
    await this.attach(tabId);
    const dialog = this.dialogs.get(tabId);
    if (dialog && method !== 'Page.handleJavaScriptDialog' && !/\.(enable|disable)$/.test(method) && method !== 'Target.setAutoAttach' && method !== 'Page.getFrameTree' && !method.startsWith('Fetch.')) {
      throw new Error(`JavaScript dialog is open (${dialog.type}): ${dialog.message.slice(0, 300)}. Use devtools_handle_dialog before other page commands.`);
    }
    // A deadline does not imply a failed side effect; never retry automatically.
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        chrome.debugger.sendCommand({ tabId, ...(sessionId ? { sessionId } : {}) }, method, params),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP deadline exceeded; command outcome is unknown. Inspect state before retrying.')), 15000); }),
      ]);
    } finally { clearTimeout(timer!); }
  }

  dialogInfo(tabId: number) {
    return this.dialogs.get(tabId) || null;
  }

  async handleDialog(tabId: number, accept = true, promptText?: string) {
    const dialog = this.dialogs.get(tabId);
    if (!dialog) throw new Error('No JavaScript dialog is open');
    const result = await this.sendCommand(tabId, 'Page.handleJavaScriptDialog', {
      accept: Boolean(accept), ...(promptText != null ? { promptText: String(promptText) } : {}),
    });
    this.dialogs.delete(tabId);
    return { handled: true, type: dialog.type, accepted: Boolean(accept), message: dialog.message, result };
  }

  async frames(tabId: number) {
    await this.attach(tabId);
    const tree = await this.sendCommand(tabId, 'Page.getFrameTree');
    const rows: Array<{ id: string; parentId?: string; url: string; name?: string; mimeType?: string; securityOrigin?: string }> = [];
    const walk = (node: any, parentId?: string) => {
      if (!node?.frame || rows.length >= 100) return;
      const frame = node.frame;
      rows.push({ id: frame.id, parentId, url: cleanUrl(frame.url || ''), name: frame.name || undefined,
        mimeType: frame.mimeType || undefined, securityOrigin: frame.securityOrigin || undefined });
      for (const child of node.childFrames || []) walk(child, frame.id);
    };
    walk(tree?.frameTree);
    return rows;
  }

  async interceptNetwork(tabId: number, args: any) {
    const action = String(args.action || 'off');
    if (action === 'off') {
      this.intercepts.delete(tabId);
      await this.sendCommand(tabId, 'Fetch.disable').catch(() => {});
      return { enabled: false };
    }
    if (action !== 'block' && action !== 'mock') throw new Error('Unknown intercept action');
    const pattern = String(args.urlPattern || '*');
    const status = Math.max(100, Math.min(599, Number(args.status) || 200));
    const body = String(args.body ?? '');
    if (body.length > 100000) throw new Error('Mock body is limited to 100 KB');
    const mimeType = String(args.mimeType || 'application/json');
    this.intercepts.set(tabId, { pattern, action, status, body, mimeType, paused: 0 });
    try {
      await this.sendCommand(tabId, 'Fetch.enable', { patterns: [{ urlPattern: pattern }] });
    } catch (err) {
      this.intercepts.delete(tabId);
      throw err;
    }
    return { enabled: true, pattern, action, status, mimeType, bodyLength: body.length };
  }

  interceptStatus(tabId: number) {
    const config = this.intercepts.get(tabId);
    return config ? { enabled: true, pattern: config.pattern, action: config.action, status: config.status, mimeType: config.mimeType, paused: config.paused } : { enabled: false };
  }

  private sessionForFrame(tabId: number, frameId?: string) {
    return frameId ? this.frameSessions.get(tabId)?.get(frameId) : undefined;
  }

  async evaluateJs(tabId: number, expression: string, frameId?: string, projection?: string[]): Promise<any> {
    await this.attach(tabId);
    const contextId = frameId ? this.contexts.get(tabId)?.get(frameId) : undefined;
    if (frameId && contextId == null) throw new Error('Frame context unavailable. Use Page.getFrameTree / child session with devtools_cdp.');
    const script = `(async () => {
      const value = await (
        ${expression}
      );
      const paths = ${JSON.stringify(projection || [])};
      const pick = item => Object.fromEntries(paths.map(path => [path, path.split('.').reduce((v,k)=>v?.[k],item)]));
      const selected = paths.length ? (Array.isArray(value) ? value.slice(0,2000).map(pick) : pick(value)) : value;
      const seen = new WeakSet(); let nodes = 0, chars = 0; const omitted = new Set();
      if(paths.length && Array.isArray(value) && value.length>2000)omitted.add('Projection capture limit: first 2000 entries');
      function serialize(v, depth=0) {
        if (++nodes > 20000 || chars > 3000000) { omitted.add('Capture limit reached; use projection'); return '[capture limit]'; }
        if (typeof v === 'string') { chars += v.length; if(v.length>1000000)omitted.add('String capture limit'); return v.slice(0,1000000); }
        if (v == null || typeof v === 'boolean') return v;
        if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
        if (typeof v !== 'object') return String(v);
        if (v instanceof Element) return {tag:v.tagName.toLowerCase(),id:v.id,text:(v.innerText||'').slice(0,300)};
        if (seen.has(v)) { omitted.add('Circular references'); return '[circular]'; }
        if (depth>12) { omitted.add('Capture depth limit'); return '[depth limit]'; }
        seen.add(v); let out;
        if(Array.isArray(v)||ArrayBuffer.isView(v)) { if(v.length>2000)omitted.add('Array capture limit'); out=Array.from({length:Math.min(v.length||0,2000)},(_,i)=>serialize(v[i],depth+1)); }
        else { out=Object.create(null); const keys=Object.keys(v); if(keys.length>1000)omitted.add('Object capture limit');
          for(const key of keys.slice(0,1000)) { try { out[key]=serialize(v[key],depth+1); } catch { out[key]='[unreadable]'; omitted.add('Unreadable property'); } } }
        seen.delete(v); return out;
      }
      return {value:serialize(selected),captureTruncation:[...omitted]};
    })()`;
    const res = await this.sendCommand(tabId, 'Runtime.evaluate', { expression: script, contextId, returnByValue: true, awaitPromise: true, timeout: 10000 }, this.sessionForFrame(tabId, frameId));
    if (res.exceptionDetails) throw new Error(String(res.exceptionDetails.exception?.description || res.exceptionDetails.text).split('\n').slice(0, 6).join('\n'));
    return res.result?.value;
  }

  async value(tabId: number, expression: string, frameId?: string) {
    return (await this.evaluateJs(tabId, expression, frameId)).value;
  }

  element(selector: string) {
    return `(() => {
      const ref=${JSON.stringify(selector)};
      const deepQuery=(root,sel)=>{
        try { const direct=root.querySelector(sel); if(direct) return direct; } catch {}
        for(const node of root.querySelectorAll('*')){
          if(node.shadowRoot){ const hit=deepQuery(node.shadowRoot,sel); if(hit) return hit; }
        }
        return null;
      };
      if(ref.startsWith('@')){
        const state=globalThis.__browserAgentElements; const el=state?.nodes?.get(ref);
        if(!el?.isConnected) throw new Error('Stale element reference. Take a new DOM snapshot.'); return el;
      }
      return deepQuery(document,ref);
    })()`;
  }

  async inspectDom(tabId: number, args: any) {
    const snapshot = await this.value(tabId, `(() => {
      const root=${this.element(args.selector || 'body')}; if(!root)throw new Error('Element not found');
      const state=globalThis.__browserAgentElements ||= {nodes:new Map(),ids:new WeakMap(),token:crypto.randomUUID().slice(0,8),next:0};
      function ref(el){let id=state.ids.get(el);if(!id||!state.nodes.has(id)){id='@'+state.token+':e'+(++state.next);state.ids.set(el,id);state.nodes.set(id,el);}return id;}
      for(const [id,node] of state.nodes)if(!node.isConnected)state.nodes.delete(id);
      if(state.nodes.size>1500){state.nodes.clear();state.ids=new WeakMap();}
      let count=0, omitted=0;
      function walk(el,depth,inShadow){if(++count>400){omitted++;return null;} const tag=el.tagName.toLowerCase();if(['script','style','svg','noscript'].includes(tag))return null;
        const row={ref:ref(el),tag,id:el.id||undefined,role:el.getAttribute('role')||undefined,type:el.getAttribute('type')||undefined,
          name:el.getAttribute('aria-label')||undefined,shadow:inShadow||undefined,shadowRoot:el.shadowRoot?true:undefined,
          childCount:el.children.length+(el.shadowRoot?el.shadowRoot.children.length:0),text:(el.innerText||'').trim().replace(/\\s+/g,' ').slice(0,100)};
        if(depth<${Math.max(1, Math.min(5, Number(args.depth) || 3))}){
          const children=[];
          for(const child of el.children)children.push({el:child,shadow:false});
          if(el.shadowRoot)for(const child of el.shadowRoot.children)children.push({el:child,shadow:true});
          row.childCount=children.length;
          const groups=new Map();for(const child of children){const key=child.el.tagName+'|'+String(child.el.className).slice(0,100)+'|'+child.el.getAttribute('role')+'|'+(child.shadow?'shadow':'light');const group=groups.get(key)||[];group.push(child);groups.set(key,group);}
          row.children=[...groups.values()].slice(0,30).map(group=>{
            if(group.length<4)return group.map(c=>walk(c.el,depth+1,c.shadow)).filter(Boolean);
            omitted+=group.length-3;return {repeat:group.length,tag:group[0].el.tagName.toLowerCase(),className:String(group[0].el.className).slice(0,100),samples:[group[0],group[1],group.at(-1)].map(c=>walk(c.el,depth+1,c.shadow)).filter(Boolean)};
          }).flat();if(groups.size>30)omitted+=[...groups.values()].slice(30).reduce((n,group)=>n+group.length,0);
        } else omitted+=el.children.length+(el.shadowRoot?el.shadowRoot.children.length:0); return row; }
      const snapshot=walk(root,0,false);return {url:location.href,snapshot,omitted,frames:Array.from(document.querySelectorAll('iframe')).slice(0,20).map(e=>({title:e.title,src:e.src}))};
    })()`, args.frameId);
    const frames = await this.frames(tabId).catch(() => snapshot?.frames || []);
    return { ...snapshot, frames, dialog: this.dialogInfo(tabId) };
  }

  async findElement(tabId: number, args: any) {
    const role = String(args.role || '').toLowerCase();
    const name = String(args.name || '').toLowerCase();
    const text = String(args.text || '').toLowerCase();
    const tag = String(args.tag || '').toLowerCase();
    const exact = Boolean(args.exact);
    const limit = Math.max(1, Math.min(30, Number(args.limit) || 10));
    return this.value(tabId, `(() => {
      const state=globalThis.__browserAgentElements ||= {nodes:new Map(),ids:new WeakMap(),token:crypto.randomUUID().slice(0,8),next:0};
      function ref(el){let id=state.ids.get(el);if(!id||!state.nodes.has(id)){id='@'+state.token+':e'+(++state.next);state.ids.set(el,id);state.nodes.set(id,el);}return id;}
      for(const [id,node] of state.nodes)if(!node.isConnected)state.nodes.delete(id);
      if(state.nodes.size>1500){state.nodes.clear();state.ids=new WeakMap();}
      const roots=[document];const collect=(root)=>{for(const el of root.querySelectorAll('*'))if(el.shadowRoot){roots.push(el.shadowRoot);collect(el.shadowRoot);}};collect(document);
      const roleOf=(el)=>{const explicit=el.getAttribute('role');if(explicit)return explicit.toLowerCase();
        const tag=el.tagName.toLowerCase();
        if(tag==='button')return 'button';
        if(tag==='a'&&el.hasAttribute('href'))return 'link';
        if(tag==='input'){const type=(el.type||'text').toLowerCase();if(type==='checkbox'||type==='radio')return type;if(type==='submit'||type==='button')return 'button';return 'textbox';}
        if(tag==='textarea')return 'textbox';
        if(tag==='select')return 'combobox';
        if(/^h[1-6]$/.test(tag))return 'heading';
        if(tag==='img')return 'img';
        return tag;};
      const nameOf=(el)=>{const root=el.getRootNode();const byId=(id)=>root.getElementById?root.getElementById(id):document.getElementById(id);
        const labelled=el.getAttribute('aria-labelledby');
        if(labelled){const text=labelled.split(/\\s+/).map(id=>byId(id)?.textContent||'').join(' ').trim();if(text)return text;}
        return (el.getAttribute('aria-label')||el.getAttribute('alt')||el.getAttribute('title')||el.getAttribute('placeholder')||(el.labels?.[0]?.textContent)||el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,300);};
      const role=${JSON.stringify(role)},name=${JSON.stringify(name)},text=${JSON.stringify(text)},tag=${JSON.stringify(tag)},exact=${exact};
      const limit=${limit};
      const match=(value,query)=>!query||(exact?value.toLowerCase()===query:value.toLowerCase().includes(query));
      const seen=new Set(),rows=[];let matched=0;
      for(const root of roots)for(const el of root.querySelectorAll('*')){
        if(seen.has(el))continue;seen.add(el);
        const tagName=el.tagName.toLowerCase();if(['script','style','svg','noscript'].includes(tagName))continue;
        const r=roleOf(el),n=nameOf(el),t=(el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,300);
        if(tag&&tagName!==tag)continue;if(role&&r!==role)continue;if(name&&!match(n,name))continue;if(text&&!match(t,text))continue;
        if(!role&&!name&&!text&&!tag)continue;
        matched++;
        if(rows.length<limit)rows.push({ref:ref(el),tag:tagName,role:r,name:n.slice(0,160),text:t.slice(0,160),visible:!!el.getClientRects().length,disabled:!!el.disabled});
      }
      return {matches:rows,total:matched,limited:matched>rows.length};
    })()`, args.frameId);
  }

  async getPageSummary(tabId: number) {
    const summary = await this.value(tabId, `(() => {
      const roots=[document];
      const collectRoots=(root)=>{for(const el of root.querySelectorAll('*')){if(el.shadowRoot){roots.push(el.shadowRoot);collectRoots(el.shadowRoot);}}};
      collectRoots(document);
      const chunks=[],seen=new Set();let visited=0,total=0;
      const visible=(el)=>{if(!el)return false;const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&el.getClientRects().length>0;};
      for(const root of roots){
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())&&visited++<10000){
          const parent=node.parentElement;
          if(!parent||parent.closest('script,style,svg,noscript,nav,footer,[role=navigation],[role=contentinfo]'))continue;
          const slot=parent.closest('slot');if(slot&&slot.assignedNodes?.().length)continue;
          if(!visible(parent))continue;
          const value=node.nodeValue.trim().replace(/\\s+/g,' ');if(!value||seen.has(value))continue;
          seen.add(value);chunks.push(value);total+=value.length;
        }
      }
      const text=chunks.join('\\n');
      const count=(selector)=>roots.reduce((sum,root)=>sum+root.querySelectorAll(selector).length,0);
      return {title:document.title,url:location.href,content:text.slice(0,40000),contentLength:text.length,
        captureLimited:visited>=10000,
        pageType:count('article')?'article':count('form')?'form':count('main,[role=main]')?'app':'list',
        counts:{links:count('a'),forms:count('form'),inputs:count('input,select,textarea')},
        frames:Array.from(document.querySelectorAll('iframe')).slice(0,20).map(e=>({title:e.title,src:e.src}))};
    })()`);
    const frames = await this.frames(tabId).catch(() => summary?.frames || []);
    return { ...summary, frames, dialog: this.dialogInfo(tabId) };
  }

  async box(tabId: number, selector: string, frameId?: string) {
    const box = await this.value(tabId, `(() => {const el=${this.element(selector)};if(!el)throw new Error('Element not found');
      if(el.disabled)throw new Error('Element disabled');el.scrollIntoView({block:'center',behavior:'instant'});
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none')throw new Error('Element not visible');
      return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,left:r.x,top:r.y,tag:el.tagName};})()`, frameId);
    // Child frames need their own coordinate transform; use DOM-based click/focus for explicit frame targets.
    return box;
  }

  async clickElement(tabId: number, selector: string, frameId?: string, hover = false) {
    const box = await this.box(tabId, selector, frameId);
    if (frameId) {
      if (hover) throw new Error('Use a child session Input command for frame-local hover');
      await this.value(tabId, `(() => {const el=${this.element(selector)};el.click();return true;})()`, frameId);
      return { clicked: true, frameId, method: 'DOM click', tag: box.tag };
    }
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    if (!hover) for (const type of ['mousePressed', 'mouseReleased']) await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    return { clicked: !hover, hovered: hover, tag: box.tag };
  }

  async typeText(tabId: number, args: any) {
    await this.box(tabId, args.selector, args.frameId);
    await this.value(tabId, `(() => {const el=${this.element(args.selector)};
      const label=[el.type,el.name,el.id,el.autocomplete].join(' ').toLowerCase();
      const sensitive=el.type==='password'||/cc-(number|csc|exp)|password|passwd|card.?number|cvv|cvc/.test(label);
      if(sensitive&&!${Boolean(args.confirmSensitive)})throw new Error('Sensitive field: confirm explicitly with confirmSensitive=true');
      el.focus();
      if(${args.clearFirst !== false}){if('value'in el){const p=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(p,'value')?.set;setter?setter.call(el,''):el.value='';}else if(el.isContentEditable)el.textContent='';else throw new Error('Element is not editable');el.dispatchEvent(new Event('input',{bubbles:true}));}return true;})()`, args.frameId);
    await this.sendCommand(tabId, 'Input.insertText', { text: String(args.text) }, this.sessionForFrame(tabId, args.frameId));
    return { insertedCharacters: String(args.text).length };
  }

  async setValue(tabId: number, args: any) {
    return this.value(tabId, `(() => {const el=${this.element(args.selector)};if(!el)throw new Error('Element not found');
      if(el.disabled)throw new Error('Element disabled');
      const label=[el.type,el.name,el.id,el.autocomplete].join(' ').toLowerCase();
      const sensitive=el.type==='password'||/cc-(number|csc|exp)|password|passwd|card.?number|cvv|cvc/.test(label);
      if(sensitive&&!${Boolean(args.confirmSensitive)})throw new Error('Sensitive field: confirm explicitly with confirmSensitive=true');
      if(el instanceof HTMLSelectElement)el.value=${JSON.stringify(String(args.value ?? ''))};
      else if(el instanceof HTMLInputElement&&['checkbox','radio'].includes(el.type)){if(el.checked!==${Boolean(args.checked)})el.click();}
      else throw new Error('Expected select, checkbox or radio');
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return {value:el.value,checked:el.checked};})()`, args.frameId);
  }

  async scrollPage(tabId: number, args: any) {
    const amount = Math.min(10000, Math.max(0, Number(args.amount) || 500)) * (args.direction === 'up' ? -1 : 1);
    return this.value(tabId, `(() => {const el=${args.selector ? this.element(args.selector) : 'document.scrollingElement'};if(!el)throw new Error('Scroll target missing');el.scrollBy({top:${amount},behavior:'instant'});return {scrollTop:el.scrollTop};})()`, args.frameId);
  }

  async waitState(tabId: number, args: any) {
    return this.value(tabId, `(() => {${args.url ? `return location.href.includes(${JSON.stringify(args.url)});` : `const el=${this.element(args.selector)};const visible=!!el&&!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';return ${args.state === 'hidden' ? '!visible' : args.state === 'attached' ? '!!el' : 'visible'};`}})()`, args.frameId);
  }

  async navigate(tabId: number, url: string) {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only HTTP(S) navigation is supported');
    const result = await this.sendCommand(tabId, 'Page.navigate', { url: parsed.href });
    if (result.errorText) throw new Error(result.errorText);
    return { url: parsed.href, frameId: result.frameId, status: 'navigation started; use wait to verify readiness' };
  }

  async consoleLogs(tabId: number, args: any) {
    await this.attach(tabId);
    const rows = (this.logs.get(tabId) || []).filter(r => (!args.level || r.type === args.level) && (!args.text || r.text.includes(args.text)) && (!args.origin || r.url?.includes(args.origin)));
    return { ...pageItems(groupConsole(rows), args.cursor, args.limit), capturedAt: this.capturedAt.get(tabId), dropped: this.dropped.get(tabId) || 0 };
  }

  async network(tabId: number, args: any) {
    await this.attach(tabId);
    const rows = (this.requests.get(tabId) || []).filter(r => (!args.type || r.type?.toLowerCase() === args.type.toLowerCase()) && (!args.status || r.status === args.status)
      && (!args.origin || cleanUrl(r.url).startsWith(args.origin)) && (!args.url || r.url.includes(args.url)));
    if (args.mode === 'har') {
      const headers = (value?: Record<string, string>) => Object.entries(value || {}).map(([name, value]) => ({ name, value }));
      return { log: { version: '1.2', creator: { name: 'Browser Agent', version: __APP_VERSION__ },
        _coverage: { capturedAt: this.capturedAt.get(tabId), priorActivityAvailable: false, droppedRecords: this.dropped.get(tabId) || 0, bodiesIncluded: false },
        entries: rows.map(row => ({ startedDateTime: new Date(row.timestamp).toISOString(), time: row.duration ?? 0,
          request: { method: row.method, url: row.url, httpVersion: '', headers: headers(row.requestHeaders), queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
          response: { status: row.status || 0, statusText: row.error || '', httpVersion: '', headers: headers(row.responseHeaders), cookies: [], content: { size: 0, mimeType: row.mimeType || '', _bodyNotCaptured: true }, redirectURL: '', headersSize: -1, bodySize: -1 },
          cache: {}, timings: { send: -1, wait: -1, receive: -1 }, _requestId: row.requestId, _sessionId: row.sessionId, _finished: row.finished,
        })) } };
    }
    return { ...(args.mode === 'list' ? pageItems([...rows].reverse().map(r => ({ ...r, url: cleanUrl(r.url), requestHeaders: undefined, responseHeaders: undefined, postData: undefined })), args.cursor, args.limit) : aggregateNetwork(rows)),
      capturedAt: this.capturedAt.get(tabId), retainedWindow: 500, dropped: this.dropped.get(tabId) || 0 };
  }

  async networkDetail(tabId: number, args: any) {
    await this.attach(tabId);
    const row = this.findRequest(tabId, args.requestId, args.sessionId);
    if (args.part === 'responseBody') {
      const response = await this.sendCommand(tabId, 'Network.getResponseBody', { requestId: args.requestId }, args.sessionId);
      return response;
    }
    if (args.part === 'requestBody') return this.sendCommand(tabId, 'Network.getRequestPostData', { requestId: args.requestId }, args.sessionId);
    if (!row) throw new Error('Request not retained; capture begins at attach and uses a ring buffer');
    return row;
  }

  async eventPage(tabId: number, args: any) {
    await this.attach(tabId);
    for (const domain of (args.domains || []).slice(0, 10)) await this.sendCommand(tabId, `${domain}.enable`);
    const result = pageItems((this.events.get(tabId) || []).filter(e => !args.method || e.method.includes(args.method)), args.cursor, args.limit);
    if (args.clear) this.events.delete(tabId);
    return { ...result, dropped: this.dropped.get(tabId) || 0, priorActivityAvailable: false };
  }

  async debuggerAction(tabId: number, args: any) {
    await this.sendCommand(tabId, 'Debugger.enable');
    switch (args.action) {
      case 'scripts': return pageItems(this.scripts.get(tabId) || [], args.cursor, args.limit);
      case 'source': return this.sendCommand(tabId, 'Debugger.getScriptSource', { scriptId: args.scriptId });
      case 'breakpoint': return this.sendCommand(tabId, 'Debugger.setBreakpointByUrl', { url: args.url, lineNumber: Math.max(0, Number(args.lineNumber) || 0) });
      case 'removeBreakpoint': return this.sendCommand(tabId, 'Debugger.removeBreakpoint', { breakpointId: args.breakpointId });
      default:
        if (!['pause', 'resume', 'stepOver', 'stepInto', 'stepOut'].includes(args.action)) throw new Error('Unknown debugger action');
        return this.sendCommand(tabId, `Debugger.${args.action}`);
    }
  }
}

export const devtools = new DevToolsService();
