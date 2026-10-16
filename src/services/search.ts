import { DOMParser } from 'linkedom';
import { AppSettings } from '../types';
import { pageItems } from './budget';

export async function readResponse(response: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response body');
  const decoder = new TextDecoder(); let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('Response exceeds capture size; narrow the request'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function publicUrl(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) URL without credentials');
  return url.href;
}

export function parseSearchHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.querySelector('#challenge-form,.anomaly-modal') || /bots use DuckDuckGo|unfortunately.*bots/i.test(doc.body?.textContent || '')) throw new Error('DuckDuckGo challenge. Retry later or select Tavily.');
  const rows = [...doc.querySelectorAll('.result')].map(node => {
    const anchor = node.querySelector('a.result__a');
    if (!anchor) return null;
    let url = anchor.getAttribute('href') || '';
    try { const parsed = new URL(url, 'https://duckduckgo.com'); url = parsed.searchParams.get('uddg') || parsed.href; publicUrl(url); } catch { return null; }
    return { title: anchor.textContent?.trim(), url, snippet: node.querySelector('.result__snippet')?.textContent?.trim().slice(0, 1000) || '' };
  }).filter(Boolean);
  if (!rows.length && !doc.querySelector('.no-results')) throw new Error('DuckDuckGo returned no readable search results; the endpoint may be unavailable');
  return rows;
}

const cache = new Map<string, { expires: number; rows: any[] }>();
export async function webSearch(settings: AppSettings, args: any, signal: AbortSignal) {
  const query = String(args.query || '').trim().slice(0, 1000);
  if (!query) throw new Error('Search query is required');
  const key = `${settings.searchProvider}:${query}`;
  let entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    let rows: any[];
    if (settings.searchProvider === 'tavily') {
      if (!settings.tavilyApiKey) throw new Error('Tavily API key is not configured');
      const response = await fetch('https://api.tavily.com/search', { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.tavilyApiKey}` },
        body: JSON.stringify({ query, max_results: 10, search_depth: 'basic', include_answer: false, include_raw_content: false }) });
      const json = JSON.parse(await readResponse(response));
      rows = (json.results || []).map((r: any) => ({ title: r.title, url: r.url, snippet: String(r.content || '').slice(0, 1000) }));
    } else {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { signal, credentials: 'omit' });
      rows = parseSearchHtml(await readResponse(response));
    }
    entry = { expires: Date.now() + 5 * 60000, rows }; cache.set(key, entry);
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  return { query, provider: settings.searchProvider, ...pageItems(entry.rows, args.cursor, args.limit || 5) };
}

export async function webRead(args: any, signal: AbortSignal) {
  const response = await fetch(publicUrl(args.url), { signal, credentials: 'omit' });
  const type = response.headers.get('content-type') || '';
  if (!/text\/|json|xml/.test(type)) throw new Error('Not a readable text resource');
  const text = await readResponse(response);
  if (!/html/.test(type)) return { url: response.url, content: text };
  const doc = new DOMParser().parseFromString(text, 'text/html');
  for (const node of doc.querySelectorAll('script,style,svg,nav,footer,noscript')) node.remove();
  const root = doc.querySelector('main,article,[role=main]') || doc.body;
  return { url: response.url, title: doc.querySelector('title')?.textContent || '', content: (root?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() };
}
