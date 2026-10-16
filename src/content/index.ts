// DevTools Copilot Content Script
// Provides visual feedback and element highlighting on the active web page

console.log('[DevTools Copilot] Content script loaded on page:', window.location.href);

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
