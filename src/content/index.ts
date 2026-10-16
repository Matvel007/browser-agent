// Chromium Agent Content Script
// Injects floating Chromium Agent trigger widget and provides element highlighting

console.log('[Chromium Agent] Content script initialized on:', window.location.href);

let highlightOverlay: HTMLDivElement | null = null;

function getOrCreateOverlay(): HTMLDivElement {
  if (highlightOverlay && document.body.contains(highlightOverlay)) {
    return highlightOverlay;
  }
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = '__devtools_copilot_highlighter__';
  highlightOverlay.style.position = 'fixed';
  highlightOverlay.style.pointerEvents = 'none';
  highlightOverlay.style.zIndex = '2147483647';
  highlightOverlay.style.border = '2px solid #10a37f'; // ChatGPT green
  highlightOverlay.style.backgroundColor = 'rgba(16, 163, 127, 0.15)';
  highlightOverlay.style.borderRadius = '4px';
  highlightOverlay.style.transition = 'all 0.15s ease-in-out';
  highlightOverlay.style.display = 'none';
  document.body.appendChild(highlightOverlay);
  return highlightOverlay;
}

// Injects a floating native-style Copilot trigger button directly onto every web page
function injectFloatingCopilotButton() {
  // Prevent duplicate injections
  if (document.getElementById('__devtools_copilot_root__')) return;

  const host = document.createElement('div');
  host.id = '__devtools_copilot_root__';
  host.style.all = 'initial';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Styles isolated in Shadow DOM
  const style = document.createElement('style');
  style.textContent = `
    .copilot-btn {
      position: fixed;
      right: 18px;
      bottom: 60px;
      z-index: 2147483646;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #171717;
      border: 1.5px solid #10a37f;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(16, 163, 127, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, opacity 0.2s ease;
      touch-action: none;
    }
    .copilot-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.6), 0 0 18px rgba(16, 163, 127, 0.6);
    }
    .copilot-btn:active {
      transform: scale(0.95);
    }
    .copilot-icon {
      width: 22px;
      height: 22px;
      color: #10a37f;
      display: block;
    }
    .copilot-tooltip {
      position: absolute;
      right: 54px;
      background: #212121;
      color: #ececec;
      border: 1px solid #383838;
      border-radius: 8px;
      padding: 6px 11px;
      font-size: 12px;
      font-weight: 500;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateX(8px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .copilot-tooltip kbd {
      background: #2f2f2f;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 1px 4px;
      font-size: 10px;
      color: #10a37f;
    }
    .copilot-btn:hover .copilot-tooltip {
      opacity: 1;
      transform: translateX(0);
    }
  `;

  const btn = document.createElement('div');
  btn.className = 'copilot-btn';
  btn.title = 'Chromium Agent';

  // SVG Icon (Copilot / AI Wrench)
  btn.innerHTML = `
    <div class="copilot-tooltip">
      <span>Chromium Agent</span>
      <kbd>Alt+C</kbd>
    </div>
    <svg class="copilot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  `;

  // Dragging support (drag vertically so it doesn't block page content)
  let isDragging = false;
  let startY = 0;
  let initialBottom = 60;
  let hasMoved = false;

  btn.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    initialBottom = window.innerHeight - rect.bottom;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    if (Math.abs(deltaY) > 4) {
      hasMoved = true;
    }
    const newBottom = Math.max(16, Math.min(window.innerHeight - 60, initialBottom + deltaY));
    btn.style.bottom = `${newBottom}px`;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging && !hasMoved) {
      // Normal click: open side panel!
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    }
    isDragging = false;
  });

  // Touch support for touch screens
  btn.addEventListener('touchstart', (e) => {
    isDragging = true;
    hasMoved = false;
    startY = e.touches[0].clientY;
    const rect = btn.getBoundingClientRect();
    initialBottom = window.innerHeight - rect.bottom;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.touches[0].clientY;
    if (Math.abs(deltaY) > 4) {
      hasMoved = true;
    }
    const newBottom = Math.max(16, Math.min(window.innerHeight - 60, initialBottom + deltaY));
    btn.style.bottom = `${newBottom}px`;
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isDragging && !hasMoved) {
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    }
    isDragging = false;
  });

  shadow.appendChild(style);
  shadow.appendChild(btn);
}

// Inject floating button when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFloatingCopilotButton);
} else {
  injectFloatingCopilotButton();
}

// Extension message listener for element highlighting
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'HIGHLIGHT_ELEMENT' && message.selector) {
    try {
      const el = document.querySelector(message.selector);
      if (!el) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
      }

      const rect = el.getBoundingClientRect();
      const overlay = getOrCreateOverlay();
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.display = 'block';

      // Auto-hide after 2.5 seconds
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 2500);

      sendResponse({ success: true });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
  }

  if (message.action === 'PING') {
    sendResponse({ success: true, url: window.location.href, title: document.title });
  }
});
