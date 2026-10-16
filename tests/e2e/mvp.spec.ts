import { test as base, expect, chromium, BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let server: Server, origin: string;
base.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/api') { response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}'); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><title>Fixture catalog</title></head><body><main><h1>Test catalog</h1><button id="action" onclick="this.textContent=\'Clicked\'">Action</button><input id="query"><label><input type="checkbox" id="check">Check</label><select id="choice"><option value="a">A</option><option value="b">B</option></select>' + Array.from({ length: 300 }, (_, i) => `<article class="card"><h2>Card ${i}</h2><p>Description ${i}</p></article>`).join('') + '</main></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
base.afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

const test = base.extend<{ extension: { context: BrowserContext; page: Page; fixture: Page; worker: Worker; id: string } }>({
  extension: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'browser-agent-e2e-'));
    const extensionPath = resolve('dist');
    const context = await chromium.launchPersistentContext(directory, { ...(process.env.BROWSER_AGENT_BROWSER ? { executablePath: process.env.BROWSER_AGENT_BROWSER } : { channel: 'chromium' }), headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`], viewport: { width: 390, height: 844 } });
    try {
      const isAgentWorker = (worker: Worker) => /^chrome-extension:\/\//.test(worker.url()) && worker.url().endsWith('/background.js');
      const worker = context.serviceWorkers().find(isAgentWorker) || await context.waitForEvent('serviceworker', { predicate: isAgentWorker });
      const id = new URL(worker.url()).host;
      await worker.evaluate(async () => {
        await chrome.storage.local.set({ browser_agent_settings: { version: 2, provider: 'routerai', apiKey: 'test-key', model: 'test-model', language: 'ru', soundEnabled: false, theme: 'light', maxContextTokens: 64000 } });
      });
      const fixture = await context.newPage(); await fixture.goto(origin);
      const page = await context.newPage(); await page.goto(`chrome-extension://${id}/sidepanel.html`);
      await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeEnabled();
      await use({ context, page, fixture, worker, id });
    } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
  },
});

function stream(events: any[]) { return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'; }

test('settings and model picker close after selection; no overflow at mobile widths', async ({ extension: { context, page } }) => {
  await context.route('https://routerai.ru/api/v1/models', route => route.fulfill({ json: { data: [{ id: 'model-a' }, { id: 'model-b' }] } }));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Выбрать модель' }).click();
  await dialog.getByRole('option', { name: 'model-b', exact: true }).click();
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'ID модели', exact: true })).toHaveValue('model-b');
  for (const width of [320, 360, 390, 480]) {
    await page.setViewportSize({ width, height: 740 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Инструменты', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: /Каталог/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Модели', exact: true }).click();
  }
  const centers = await dialog.locator('.settings-tabs button').evaluateAll(buttons => buttons.map(button => {
    const range = document.createRange(); range.selectNodeContents(button);
    const box = button.getBoundingClientRect(), text = range.getBoundingClientRect();
    return Math.abs((box.top + box.bottom) / 2 - (text.top + text.bottom) / 2);
  }));
  expect(Math.max(...centers)).toBeLessThan(1.5);
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.app-header')).not.toContainText('Fixture catalog');
  const centered = await page.locator('.empty-chat').evaluate(element => {
    const box = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
    return Math.abs((box.left + box.right) / 2 - (parent.left + parent.right) / 2) < 2
      && Math.abs((box.top + box.bottom) / 2 - (parent.top + parent.bottom) / 2) < 2;
  });
  expect(centered).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-chat.png' });
});

test('chat tools finish with text; compression and reload retain the transcript', async ({ extension: { context, page } }) => {
  let responseIndex = 0;
  const requests: any[] = [];
  await context.route('https://routerai.ru/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    let events: any[];
    if (!body.tools) events = [{ choices: [{ delta: { content: 'Сводка: пользователь проверяет каталог; заголовок Test catalog.' }, finish_reason: 'stop' }] }];
    else if (responseIndex++ === 0) events = [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call1', function: { name: 'devtools_get_page_summary', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }];
    else if (responseIndex === 2) events = [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call2', function: { name: 'devtools_inspect_dom', arguments: '{"selector":"#action"}' } }] }, finish_reason: 'tool_calls' }] }];
    else events = [{ choices: [{ delta: { content: 'Проверил каталог. Заголовок: Test catalog.' }, finish_reason: 'stop' }] }];
    await route.fulfill({ contentType: 'text/event-stream', body: stream(events) });
  });
  const input = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await input.fill('Проверь страницу'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.message-list')).toContainText('Проверил каталог.');
  expect(requests[1].messages.some((m: any) => m.role === 'tool')).toBe(true);
  await expect(page.locator('.message.assistant')).toHaveCount(1);
  await expect(page.locator('.message.assistant .usage')).toHaveCount(1);
  await expect(page.locator('.action-summary > summary')).toContainText('Свод действий · 2');
  await page.locator('.action-summary > summary').click();
  await expect(page.locator('.tool-card')).toHaveCount(2);
  await page.locator('.action-summary > summary').click();
  await page.getByRole('button', { name: 'Контекст модели', exact: true }).click();
  await expect(page.locator('.context-popover')).toContainText('2 сообщений в истории');
  await page.getByRole('button', { name: 'Контекст модели', exact: true }).press('Escape');
  await input.fill('Что было проверено?'); await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.message.assistant').last()).toContainText('Проверил каталог.');
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeVisible();
  await input.fill('/compact'); await input.press('Enter');
  await expect(page.locator('.compression-card')).toBeVisible();
  await expect(page.locator('.message.assistant')).toHaveCount(2);
  await expect(page.locator('.message-list')).toContainText('Проверь страницу');
  await expect(page.locator('.message-list')).toContainText('Что было проверено?');
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByText('Проверь страницу', { exact: true }) }).click();
  await expect(page.locator('.message-list')).toContainText('Что было проверено?');
  await expect(page.locator('.compression-card')).toBeVisible();
});

test('round chat widget can be moved and dropped on the close target', async ({ extension: { fixture, worker } }) => {
  const button = fixture.locator('#__browser_agent_root__ .agent-btn');
  await expect(button).toBeVisible();
  expect(await button.evaluate(element => getComputedStyle(element).borderRadius)).toBe('50%');
  await expect.poll(() => button.locator('img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const first = (await button.boundingBox())!;
  await fixture.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await fixture.mouse.down(); await fixture.mouse.move(120, 160, { steps: 12 }); await fixture.mouse.up();
  const moved = (await button.boundingBox())!;
  expect(moved.x).toBeLessThan(first.x - 50);
  await fixture.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2); await fixture.mouse.down();
  const target = fixture.locator('#__browser_agent_root__ .drop-zone');
  await fixture.mouse.move(195, 778, { steps: 16 });
  await expect(target).toHaveClass(/active/);
  await fixture.screenshot({ path: 'test-results/widget-drop-target.png' });
  await fixture.mouse.up(); await expect(button).toHaveCount(0);
  await expect.poll(() => worker.evaluate(async () => Object.values(await chrome.storage.session.get(null)).includes(true))).toBe(true);
  await worker.evaluate(async () => {
    const { browser_agent_settings: settings } = await chrome.storage.local.get('browser_agent_settings');
    await chrome.storage.local.set({ browser_agent_settings: { ...settings, widgetEnabled: false } });
    await chrome.storage.local.set({ browser_agent_settings: { ...settings, widgetEnabled: true } });
  });
  await expect(button).toBeVisible();
});

test('missing language preference follows the browser; an explicit choice is retained', async ({ extension: { page, worker } }) => {
  const browserLanguage = await worker.evaluate(async () => {
    const { browser_agent_settings: settings } = await chrome.storage.local.get('browser_agent_settings');
    delete settings.language; await chrome.storage.local.set({ browser_agent_settings: settings });
    return chrome.i18n.getUILanguage();
  });
  const expected = /^ru/i.test(browserLanguage) ? 'ru' : 'en';
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', expected);
  await expect(page.getByRole('textbox', { name: expected === 'ru' ? 'Сообщение' : 'Message', exact: true })).toBeEnabled();
  const manual = expected === 'ru' ? 'en' : 'ru';
  await worker.evaluate(async language => {
    const { browser_agent_settings: settings } = await chrome.storage.local.get('browser_agent_settings');
    await chrome.storage.local.set({ browser_agent_settings: { ...settings, language } });
  }, manual);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', manual);
});

test('real CDP actions, bounded screenshots and disabled tools', async ({ extension: { page, fixture } }) => {
  const response = await page.evaluate(async () => chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB' }));
  const tabId = response.tab.id;
  const tool = (name: string, args: any = {}) => page.evaluate(async ({ name, args, tabId }) => {
    const response = await chrome.runtime.sendMessage({ action: 'EXECUTE_DEVTOOLS_TOOL', payload: { toolName: name, args, tabId, sessionId: 'cdp-test', runId: 'cdp-run' } });
    return response.result;
  }, { name, args, tabId });
  expect((await tool('devtools_click_element', { selector: '#action' })).ok).toBe(true);
  await expect(fixture.locator('#action')).toHaveText('Clicked');
  expect((await tool('devtools_type_text', { selector: '#query', text: 'Hello', clearFirst: true })).ok).toBe(true);
  await expect(fixture.locator('#query')).toHaveValue('Hello');
  expect((await tool('devtools_set_value', { selector: '#choice', value: 'b' })).ok).toBe(true);
  await expect(fixture.locator('#choice')).toHaveValue('b');
  const screenshot = await tool('devtools_capture_screenshot');
  expect(screenshot.ok).toBe(true); expect(screenshot.artifact.mime).toBe('image/jpeg');
  expect(JSON.stringify(screenshot).length).toBeLessThan(7200);
  expect(JSON.stringify(screenshot)).not.toContain('base64');
  await fixture.evaluate(async () => { await fetch('/api'); console.error('fixture repeated error'); console.error('fixture repeated error'); });
  const network = await tool('devtools_get_network_requests');
  expect(network.data.total).toBeGreaterThanOrEqual(1);
  const har = await tool('devtools_get_network_requests', { mode: 'har' });
  expect(har.artifact.name).toBe('network.har');
  const original = await tool('artifact_read', { id: har.artifact.id, path: 'log.entries', limit: 1 });
  expect(original.ok).toBe(true); expect(original.data.total).toBeGreaterThanOrEqual(1);
  const snapshot = await tool('devtools_inspect_dom', { selector: '#action' });
  expect(snapshot.data.snapshot.ref).toMatch(/^@/);
  expect((await tool('devtools_click_element', { selector: snapshot.data.snapshot.ref })).ok).toBe(true);
  const cyclic = await tool('devtools_evaluate_js', { code: '(() => {const value={title:document.title,count:1n};value.self=value;return value;})()' });
  expect(cyclic.ok).toBe(true); expect(cyclic.data.count).toBe('1');
  expect(cyclic.truncated).toBe(true); expect(cyclic.artifact.id).toBeTruthy();
  await fixture.goto(`${origin}/second`);
  const stale = await tool('devtools_click_element', { selector: snapshot.data.snapshot.ref });
  expect(stale.ok).toBe(false); expect(stale.data.error).toContain('Stale element reference');
  await page.evaluate(async () => { const data = await chrome.storage.local.get('browser_agent_settings'); await chrome.storage.local.set({ browser_agent_settings: { ...data.browser_agent_settings, disabledTools: ['devtools_evaluate_js'] } }); });
  const disabled = await tool('devtools_evaluate_js', { code: 'document.title' });
  expect(disabled.ok).toBe(false); expect(disabled.data.error).toContain('disabled');
});

test('switching chats during a request prevents a late answer from leaking into the new chat', async ({ extension: { context, page } }) => {
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await context.route('https://routerai.ru/api/v1/chat/completions', async route => {
    started(); await pending;
    await route.fulfill({ contentType: 'text/event-stream', body: stream([{ choices: [{ delta: { content: 'LATE ANSWER' }, finish_reason: 'stop' }] }]) }).catch(() => {});
  });
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Old task');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await requestStarted;
  await page.getByRole('button', { name: 'Новый чат', exact: true }).click();
  release();
  await expect(page.locator('.empty-chat')).toBeVisible();
  await expect(page.locator('.message-list')).not.toContainText('LATE ANSWER');
  await page.getByRole('button', { name: 'История', exact: true }).click();
  await page.getByRole('button').filter({ has: page.getByText('Old task', { exact: true }) }).click();
  await expect(page.locator('.message-list')).toContainText('Выполнение остановлено');
});
