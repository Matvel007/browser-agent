<div align="center">

<img src="public/icons/logo.svg" alt="Browser Agent Logo" width="128" height="128" />

# Browser Agent

**An AI assistant for Chromium browsers with bounded Chrome DevTools Protocol tools.**

[![Chromium](https://img.shields.io/badge/Chromium-MV3-blue.svg?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Translations](https://img.shields.io/badge/i18n-English%20%7C%20Русский-purple.svg)](#localization)

[Русская версия (README_ru.md)](README_ru.md)

</div>

<div align="center">

<table>
  <tr>
    <td align="center"><b>Main</b><br><img src="docs/main.png" alt="Main chat panel" width="300" /></td>
    <td align="center"><b>Settings</b><br><img src="docs/settings.png" alt="Settings" width="300" /></td>
  </tr>
</table>

</div>

---

## Overview

**Browser Agent** is a side-panel AI assistant for Chromium browsers, including Chrome and Yandex Browser. It reads pages, clicks, types, switches tabs, inspects console and network through the DevTools Protocol, and searches the web. Tool output is bounded, large data is stored as artifacts, and your full chat history is never deleted by compaction.

---

## What you can use it for

- **Website analysis** — inspect the DOM, open Shadow DOM, iframes, console errors, network requests and performance metrics to understand how a page works.
- **Network and API debugging** — see failed 4xx/5xx requests, inspect request/response metadata, and block or mock API responses to test UI behavior.
- **QA and bug reports** — reproduce a scenario, capture console and network evidence, and get a structured report with a likely cause and fix.
- **Workflow automation** — fill forms, click through dashboards, switch tabs and repeat routine steps, with optional confirmation before dangerous actions.
- **Data extraction** — pull tables, cards and lists into structured JSON or CSV artifacts for further use.
- **Reading and research** — summarize a page or link, explain selected text, translate fragments and compare up to five tabs.
- **Developer tools** — evaluate JavaScript, inspect storage and cookies, set breakpoints and use raw CDP commands when high-level tools are not enough.

---

## Features

- **Any provider** — RouterAI, AItunnel, OpenAI, DeepSeek, Google Gemini, Anthropic, or any OpenAI-compatible endpoint (OpenRouter, Groq, Ollama).
- **34 browser tools** — page reading, element actions, frames, tabs, JavaScript, console, network, DOM/CSS, screenshots, performance, debugger, raw CDP. Each tool can be turned off.
- **Complex pages** — open Shadow DOM, iframes, native `alert` / `confirm` / `prompt` dialogs, and element search by role, accessible name or visible text.
- **Context menu actions** — explain or translate selected text, summarize a link or the current page. The panel opens automatically and the text or URL is inserted into the input.
- **Safety controls** — passwords and payment fields are protected; optional confirmation before clicks, typing, navigation, JavaScript/CDP and storage changes; post-action verification and a repeated-action guard.
- **Network and forms** — block or mock API responses, and attach chat artifacts (JSON, CSV, screenshots) to file inputs up to 2 MiB.
- **Multi-tab work** — collect short summaries of up to 5 tabs for comparison.
- **Web search** — DuckDuckGo by default, Tavily optional. Public URLs can be read without opening a tab.
- **Bounded output** — every tool result fits a lean / balanced / full profile. Large payloads go to IndexedDB artifacts and are referenced by ID.
- **Context you control** — full transcript kept separately from what the model sees. `/compact` adds a summary card; visible messages stay.
- **Chat attachments** — attach up to 8 images or text files with the paperclip; they are sent with the message and shown in history.
- **Slash commands** — `/compact`, `/debug`, `/extract`, `/perf`, `/clear`, `/new`, `/model`, `/tools`, `/settings`, `/help`.
- **Action summary** — all steps of one task collapse into a single expandable block inside the reply.
- **Floating page button** — round chat button on pages. Drag it onto the close target to hide it on that tab.
- **Adaptive UI** — works from 320 px wide panels up to desktop, light and dark themes, completion sound.
- **Mobile-friendly** — the floating button adapts to touch screens and safe areas; on mobile it opens an in-page chat sheet with a close button. If the page blocks embedding, the chat falls back to a tab.
- **Two languages** — English and Русский. The interface and context menu follow the extension language setting.

---

## Tech Stack

- **Platform:** Chromium Manifest V3 (side panel, `chrome.debugger`, service worker)
- **UI:** [React](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- **Build:** [Vite](https://vitejs.dev/), TypeScript
- **Tests:** [Vitest](https://vitest.dev/) for units, [Playwright](https://playwright.dev/) for browser scenarios

---

## Installation

### Quick install (no build)

1. Download the release archive from the [latest release](https://github.com/Matvel007/browser-agent/releases/latest).
2. Unzip it into a folder you will keep (the extension runs from this folder).
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select that folder.

### From source

```bash
git clone https://github.com/Matvel007/browser-agent.git
cd browser-agent
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist` folder. Other Chromium browsers use the same flow on their extensions page.

### Mobile build (no side panel)

Mobile Chromium and Yandex builds may not support the Side Panel API and can warn about `side_panel` / `sidePanel`. Build the mobile variant instead — it has no side-panel manifest entries and opens the chat in a tab:

```bash
npm run build:mobile
```

Load `dist-mobile` in the extensions page. On mobile the floating button opens an in-page chat sheet; if the page blocks embedding, the chat opens in a tab with a close button that returns to the page.

> Requires Node.js 22.12+, 24 or 26+.

### Opening the panel

- Toolbar button
- `Alt+C` (change it in browser shortcut settings)
- Right-click context menu
- Floating button on the page

---

## Configuration

Open **Settings** in the panel:

- **Models** — choose a provider, paste the API key, select a model. *Test connection* sends one small request.
- **Tools** — enable or disable each tool, configure search.
- **Context** — set your model's real context window, output reserve and compaction threshold.
- **Behavior** — extra instructions, step limit, automatic CDP attachment, confirmation before dangerous actions.
- **Interface** — theme, language, floating button, sound.
- **Diagnostics** — capability checks, artifact storage, configuration export without keys.

API keys stay in local extension storage and are never written to chat history or exports.

---

## Known limits

- `chrome.debugger` exposes only the CDP domains Chromium allows for extensions.
- Console and network capture start when the debugger attaches.
- Opening the built-in DevTools can detach the extension's debugger.
- DuckDuckGo may block programmatic queries; a CAPTCHA is reported as an error.
- The floating button is unavailable on browser-internal pages, the extension store and some PDF viewers.
- Mobile Chromium builds may not expose the side panel; the floating button opens an in-page chat sheet instead.
- Some sites block embedded extension frames; the mobile chat then falls back to a tab.
- Only open Shadow DOM is accessible; closed shadow roots are hidden by the browser.
- File uploads are limited to 2 MiB; inputs that require a native picker may reject synthetic files.
- Mocked network responses are limited to 100 KB.
- Confirmation before dangerous actions is optional and off by default.
- Some Chromium builds may block auto-loaded unpacked extensions; load `dist` manually from the extensions page.

---

## Development

```bash
npm run typecheck    # TypeScript
npm test             # unit tests
npm run icons        # regenerate PNG icons from logo.svg
npx playwright install chromium
npm run test:e2e     # browser tests against dist
```

Browser tests use a temporary profile and mocked model responses. No real API keys are required.

---

## Project structure

```text
src/services/     agent loop, context, providers, tools, CDP, storage, artifacts
src/background/   service worker: routing, targets, cancellation
src/content/      floating page widget
src/sidepanel/    React interface
tests/unit/       unit tests
tests/e2e/        browser scenarios
```

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
