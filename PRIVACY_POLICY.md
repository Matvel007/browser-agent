# Privacy Policy for Browser Agent

**Last updated:** October 17, 2026

**Browser Agent** ("the Extension") is an open-source autonomous AI assistant extension for Chromium-based browsers, developed by Matvel007.

We respect your privacy and are committed to protecting it. This Privacy Policy explains our data practices.

---

## 1. No Data Collection by the Developer

- **We do not collect, store, or sell any personal data.**
- The Extension has no developer-owned telemetry servers, tracking cookies, analytics services, or advertising SDKs.
- All operations, session history, and artifacts remain strictly on your local device.

---

## 2. Local Storage

- **API Keys & Settings:** Your API keys (e.g. OpenAI, Anthropic, Google Gemini, DeepSeek, RouterAI, Tavily) and extension settings are stored exclusively in your browser's local storage (`chrome.storage.local`). They are never transmitted to the extension developer or any unauthorized third parties.
- **Chat History & Artifacts:** Session history and browser artifacts (e.g. DOM captures, screenshots, network logs) are stored locally in your browser's IndexedDB database. You can clear them at any time in the extension's Settings under Diagnostics.

---

## 3. Third-Party AI Providers

- When you enter a prompt, the Extension sends your query, relevant page excerpts, and tool outputs directly to the AI provider endpoint you have selected and configured (such as OpenAI, Anthropic, Google, DeepSeek, or custom OpenAI-compatible endpoints).
- Requests to AI providers are governed by their respective privacy policies and terms of service. You have full control over which provider and endpoint the extension communicates with.

---

## 4. Browser Permissions

The Extension requests specific permissions required solely for its core autonomous automation functionality:
- **`debugger`:** Enables the Chrome DevTools Protocol (CDP) to inspect DOM elements, capture network/console activity, and execute user-requested actions (clicking, typing, scrolling).
- **`activeTab` & `tabs`:** Allows the extension to read and switch tabs when explicitly instructed by the user.
- **`<all_urls>`:** Necessary because the user may run the AI assistant on any website they choose to navigate to.
- **`storage`:** Used to save your settings and preferences locally.
- **`sidePanel` & `contextMenus`:** Provides the user interface in the browser side panel and context menu shortcuts.

---

## 5. Contact & Source Code

Browser Agent is fully open-source under the MIT license. You can inspect the entire source code, report issues, or contact the developer at:
- **GitHub Repository:** [https://github.com/Matvel007/browser-agent](https://github.com/Matvel007/browser-agent)
