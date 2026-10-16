# Browser Agent · 1.0.0

[Русская версия (README_ru.md)](README_ru.md)

An AI assistant for Chromium browsers: chat, web search, tab control and Chrome DevTools Protocol tools. Primary targets: Chrome/Chromium and Yandex Browser.

The extension version is shown in **Settings → Interface** and **Settings → Diagnostics**.

---

## Features

- **Multi-provider models:** RouterAI, AItunnel, OpenAI, DeepSeek, Google Gemini, Anthropic, and any OpenAI-compatible endpoint (OpenRouter, Groq, Ollama, and others). Each provider keeps its own key and model.
- **29 agent tools:** page reading, element actions, tabs, JavaScript, console, network, DOM/CSS, screenshots, performance, device emulation, JavaScript debugger, raw CDP commands, web search and artifact/history readers. Each tool can be enabled or disabled.
- **Web search:** DuckDuckGo by default, Tavily with its own key. Public URLs can be read without opening a tab.
- **Bounded output:** every tool result is trimmed to a profile limit (lean / balanced / full). Large data goes to IndexedDB artifacts and is referenced by ID instead of being pasted into the prompt.
- **Context management:** the full transcript is kept separately from what the model sees. `/compact` adds a summary card and never deletes visible messages. Model-window and output-reserve budgets are explicit.
- **Action summary:** all steps of one task are grouped into a single expandable "Action summary" inside the assistant reply.
- **Floating page button:** a round chat button on pages. Drag it onto the close target to hide it on that tab.
- **Completion sound**, light/dark/system theme, Russian and English interface with automatic language detection.
- **Adaptive layout** for narrow windows (320–480 px).

## Requirements

- Chrome, Chromium, or Yandex Browser with side panel and debugger support.
- Node.js `^22.12.0`, `^24.0.0`, or `>=26.0.0` to build from source.
- An API key from at least one supported provider (or a local OpenAI-compatible server).

## Install from source

```sh
npm ci
npm run build
```

Open `chrome://extensions/` (or `browser://extensions/` in Yandex Browser), enable **Developer mode**, click **Load unpacked**, and select the `dist` folder. After rebuilding, reload the extension and any open pages.

Ways to open the panel: the toolbar button, `Alt+C`, the context menu, or the floating page button. If the side panel API is unavailable, the UI opens in an extension tab. Shortcuts are managed by the browser.

> Yandex Browser 26.8 may block auto-loaded unpacked extensions with `ERR_BLOCKED_BY_CLIENT`. Load `dist` manually through its extensions page.

## Configuration

- **Models:** pick a provider, enter the API key, and choose a model. The **Test connection** button sends one small request, which may be billed by the provider. A model appearing in the list does not guarantee tool or vision support; enable vision only for compatible models.
- **Tools:** toggle individual tools, select the search provider, and read tool documentation.
- **Context & history:** set the real context window of your model, the output reserve, the compaction threshold, and the output profile.
- **Behavior:** extra instructions, temperature, step limit, and automatic CDP attachment.
- **Interface:** theme, language, floating button, completion sound and volume.
- **Diagnostics:** API capability checks, artifact storage usage, cleanup, and a configuration export that contains no keys.

## Data and privacy

- API keys are stored locally in extension storage and are never written to chat history or diagnostic exports.
- Known password, API-key, authorization-header and token fields are redacted in tool output and JSON artifacts.
- Artifacts (IndexedDB): up to 8 MiB each, 64 MiB total, deleted after 7 days. Transcripts are not removed by artifact cleanup.
- Nothing is sent to a provider except what the current request needs: instructions, tool schemas, the selected context, and any images you explicitly allowed.

## Tools and browser limits

- **Page:** readable text summary, compact DOM with `@e` element references, accessibility tree.
- **Actions:** click, type, hover, form fields, keyboard, scroll, wait.
- **Tabs:** list, create, select, close, reload, back/forward.
- **DevTools:** JavaScript, console, network (aggregates, lists, HAR), request bodies, DOM/CSS, performance, emulation, debugger, raw CDP and CDP events.
- **Search and data:** web search, URL reading, artifact reading, chat history recovery, tool help.

`chrome.debugger` only exposes the CDP domains that Chromium allows for extensions. Console and network capture begin when the debugger attaches and use bounded buffers. Opening the built-in DevTools can detach the extension's debugger. A browser command that was already sent may finish even after a run is stopped; such actions are never retried automatically.

DuckDuckGo may block programmatic queries. A block or CAPTCHA is reported as an error, not as "no results"; switch to Tavily if needed.

## Commands

`/compact` · `/clear` · `/new` · `/model` · `/tools` · `/settings` · `/help`

## Development

```sh
npm run typecheck     # TypeScript check
npm test              # unit tests (Vitest)
npm run icons         # regenerate PNG icons from public/icons/logo.svg
npx playwright install chromium
npm run test:e2e      # browser tests against the built dist
```

Browser tests use a clean temporary profile, the built `dist`, local test pages and mocked LLM responses. No real API keys are needed. Set `PLAYWRIGHT_BROWSERS_PATH` to keep the test browser outside the project.

## Project structure

```text
src/services/agent.ts           Run controller, finalization, cancellation
src/services/context.ts         Context assembly and compaction boundaries
src/services/llm.ts             Provider adapters and SSE parsing
src/services/tools.ts           Tool registry and schemas
src/services/tool-executor.ts   Argument validation and execution
src/services/budget.ts          Projections, redaction, output envelope
src/services/artifacts.ts       IndexedDB artifact storage
src/services/devtools.ts        CDP integration and bounded journals
src/services/search.ts          DuckDuckGo, Tavily, URL reading
src/services/storage.ts         Settings and full history
src/background/index.ts         Routing, targets, cancellation
src/content/index.ts            Isolated page widget
src/sidepanel/                  React interface
tests/unit/                     Unit tests
tests/e2e/                      Browser scenarios
```

## License

No license has been chosen yet. The repository is private; all rights are reserved by the author until a license is added.
