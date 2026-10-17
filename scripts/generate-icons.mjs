import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Render toolbar PNGs from the same SVG used by the panel and floating button.
const directory = resolve(import.meta.dirname, '../public/icons');
const svg = await readFile(resolve(directory, 'logo.svg'), 'utf8');
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
} catch {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
}
try {
  const page = await browser.newPage();
  for (const size of [16, 48, 64, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: resolve(directory, `icon${size}.png`), omitBackground: true });
  }
} finally { await browser.close(); }
