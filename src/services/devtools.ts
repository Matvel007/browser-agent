import { ConsoleLogItem, NetworkRequestItem } from '../types';

export class DevToolsService {
  private attachedTabs = new Set<number>();
  private consoleLogs = new Map<number, ConsoleLogItem[]>();
  private networkRequests = new Map<number, NetworkRequestItem[]>();

  constructor() {
    this.initEventListeners();
  }

  private initEventListeners() {
    if (typeof chrome === 'undefined' || !chrome.debugger) return;

    // Listen to detach events
    chrome.debugger.onDetach.addListener((source) => {
      if (source.tabId) {
        this.attachedTabs.delete(source.tabId);
        console.log(`[DevTools] Detached from tab ${source.tabId}`);
      }
    });

    // Listen to CDP events for Console and Network
    chrome.debugger.onEvent.addListener((source, method, params: any) => {
      const tabId = source.tabId;
      if (!tabId) return;

      if (method === 'Console.messageAdded' && params?.message) {
        const msg = params.message;
        const item: ConsoleLogItem = {
          type: (msg.level || 'log') as any,
          text: msg.text || '',
          timestamp: Date.now(),
          url: msg.url,
          lineNumber: msg.line,
        };
        const list = this.consoleLogs.get(tabId) || [];
        list.push(item);
        if (list.length > 100) list.shift();
        this.consoleLogs.set(tabId, list);
      }

      if (method === 'Runtime.consoleAPICalled' && params?.args) {
        const text = params.args.map((a: any) => a.value ?? a.description ?? '').join(' ');
        const item: ConsoleLogItem = {
          type: (params.type || 'log') as any,
          text: text,
          timestamp: Date.now(),
        };
        const list = this.consoleLogs.get(tabId) || [];
        list.push(item);
        if (list.length > 100) list.shift();
        this.consoleLogs.set(tabId, list);
      }

      if (method === 'Runtime.exceptionThrown' && params?.exceptionDetails) {
        const ex = params.exceptionDetails;
        const item: ConsoleLogItem = {
          type: 'error',
          text: ex.exception?.description || ex.text || 'Uncaught error',
          timestamp: Date.now(),
          url: ex.url,
          lineNumber: ex.lineNumber,
        };
        const list = this.consoleLogs.get(tabId) || [];
        list.push(item);
        this.consoleLogs.set(tabId, list);
      }

      if (method === 'Network.requestWillBeSent' && params?.request) {
        const req = params.request;
        const item: NetworkRequestItem = {
          requestId: params.requestId,
          url: req.url,
          method: req.method,
          type: params.type,
          timestamp: Date.now(),
        };
        const list = this.networkRequests.get(tabId) || [];
        list.push(item);
        if (list.length > 100) list.shift();
        this.networkRequests.set(tabId, list);
      }

      if (method === 'Network.responseReceived' && params?.response) {
        const res = params.response;
        const list = this.networkRequests.get(tabId) || [];
        const found = list.find((r) => r.requestId === params.requestId);
        if (found) {
          found.status = res.status;
          found.duration = Date.now() - found.timestamp;
        }
      }
    });
  }

  public isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  public async attach(tabId: number): Promise<boolean> {
    if (this.attachedTabs.has(tabId)) return true;

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      this.attachedTabs.add(tabId);

      // Enable necessary DevTools domains
      await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Console.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
        maxPostDataSize: 65536,
      });

      console.log(`[DevTools] Attached and initialized for tab ${tabId}`);
      return true;
    } catch (err: any) {
      console.error(`[DevTools] Failed to attach to tab ${tabId}:`, err);
      // Already attached or restricted page (like chrome:// URLs)
      if (err?.message?.includes('already attached')) {
        this.attachedTabs.add(tabId);
        return true;
      }
      return false;
    }
  }

  public async detach(tabId: number): Promise<void> {
    if (!this.attachedTabs.has(tabId)) return;
    try {
      await chrome.debugger.detach({ tabId });
    } catch (err) {
      console.warn(`[DevTools] Error detaching from tab ${tabId}:`, err);
    } finally {
      this.attachedTabs.delete(tabId);
    }
  }

  public async sendCommand(tabId: number, method: string, commandParams: Record<string, any> = {}): Promise<any> {
    const attached = await this.attach(tabId);
    if (!attached) {
      throw new Error(`Cannot attach Chrome DevTools to tab ${tabId}. Make sure it is not a chrome:// or internal page.`);
    }
    return await chrome.debugger.sendCommand({ tabId }, method, commandParams);
  }

  // --- High Level DevTools Actions for the Agent ---

  public async evaluateJs(tabId: number, expression: string): Promise<any> {
    const res = await this.sendCommand(tabId, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  public async getConsoleLogs(tabId: number): Promise<ConsoleLogItem[]> {
    await this.attach(tabId);
    return this.consoleLogs.get(tabId) || [];
  }

  public async getNetworkRequests(tabId: number): Promise<NetworkRequestItem[]> {
    await this.attach(tabId);
    return this.networkRequests.get(tabId) || [];
  }

  public async captureScreenshot(tabId: number): Promise<string> {
    const res = await this.sendCommand(tabId, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: 80,
    });
    return `data:image/jpeg;base64,${res.data}`;
  }

  public async navigate(tabId: number, url: string): Promise<void> {
    let target = url;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    await this.sendCommand(tabId, 'Page.navigate', { url: target });
  }

  public async clickElement(tabId: number, selector: string): Promise<string> {
    // 1. Locate element bounds via Runtime.evaluate
    const boxScript = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || '').slice(0, 50).trim()
        };
      })()
    `;
    const box = await this.evaluateJs(tabId, boxScript);
    if (!box) {
      throw new Error(`Element matching "${selector}" not found on the page.`);
    }

    // 2. Dispatch hardware mouse click via CDP Input domain
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x,
      y: box.y,
    });
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    });
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    });

    return `Clicked element <${box.tag}> ("${box.text}") at coordinates (${box.x}, ${box.y})`;
  }

  public async typeText(tabId: number, selector: string, text: string, clearFirst: boolean = false): Promise<string> {
    // 1. Focus element
    const focusScript = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.focus();
        if (${clearFirst}) {
          if ('value' in el) el.value = '';
          else el.textContent = '';
        }
        return true;
      })()
    `;
    const focused = await this.evaluateJs(tabId, focusScript);
    if (!focused) {
      throw new Error(`Input element matching "${selector}" not found.`);
    }

    // 2. Dispatch hardware keystrokes via CDP Input domain
    for (const char of text) {
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
        unmodifiedText: char,
      });
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
      });
    }

    return `Typed "${text}" into ${selector}`;
  }

  public async scrollPage(tabId: number, direction: 'up' | 'down', amount: number = 500): Promise<string> {
    const deltaY = direction === 'down' ? amount : -amount;
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 300,
      y: 300,
      deltaX: 0,
      deltaY: deltaY,
    });
    return `Scrolled page ${direction} by ${amount}px`;
  }

  public async inspectDom(tabId: number, selector: string = 'body'): Promise<any> {
    const inspectScript = `
      (() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return null;
        
        function summarize(el, depth = 0) {
          if (depth > 3) return { tag: el.tagName?.toLowerCase() };
          const children = Array.from(el.children).slice(0, 15).map(c => summarize(c, depth + 1));
          const text = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) 
            ? el.textContent.trim().slice(0, 100) 
            : undefined;
          
          return {
            tag: el.tagName?.toLowerCase(),
            id: el.id || undefined,
            className: el.className ? String(el.className).slice(0, 80) : undefined,
            type: el.getAttribute('type') || undefined,
            role: el.getAttribute('role') || undefined,
            href: el.getAttribute('href') || undefined,
            text,
            children: children.length > 0 ? children : undefined
          };
        }
        return summarize(root);
      })()
    `;
    return await this.evaluateJs(tabId, inspectScript);
  }

  public async getPageSummary(tabId: number): Promise<{ title: string; url: string; content: string }> {
    const summaryScript = `
      (() => {
        const title = document.title || '';
        const url = window.location.href;
        
        // Extract visible readable text
        const walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName.toLowerCase();
              if (['script', 'style', 'noscript', 'svg'].includes(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden') {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        
        const chunks = [];
        let node;
        let charCount = 0;
        while ((node = walker.nextNode()) && charCount < 10000) {
          const val = node.nodeValue?.trim();
          if (val && val.length > 2) {
            chunks.push(val);
            charCount += val.length;
          }
        }
        
        return {
          title,
          url,
          content: chunks.join('\\n').slice(0, 8000)
        };
      })()
    `;
    return await this.evaluateJs(tabId, summaryScript);
  }
}

export const devtools = new DevToolsService();
