// Chromium Agent Content Script
// Injects floating draggable chat widget with Drop-to-Close zone and particle explosion

console.log('[Chromium Agent] Content script initialized on:', window.location.href);

let highlightOverlay: HTMLDivElement | null = null;

function getOrCreateOverlay(): HTMLDivElement {
  if (highlightOverlay && document.body.contains(highlightOverlay)) {
    return highlightOverlay;
  }
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = '__chromium_agent_highlighter__';
  highlightOverlay.style.position = 'fixed';
  highlightOverlay.style.pointerEvents = 'none';
  highlightOverlay.style.zIndex = '2147483647';
  highlightOverlay.style.border = '2px solid #3794ff'; // Neutral browser blue
  highlightOverlay.style.backgroundColor = 'rgba(55, 148, 255, 0.15)';
  highlightOverlay.style.borderRadius = '4px';
  highlightOverlay.style.transition = 'all 0.15s ease-in-out';
  highlightOverlay.style.display = 'none';
  document.body.appendChild(highlightOverlay);
  return highlightOverlay;
}

function injectFloatingAgentWidget() {
  if (document.getElementById('__chromium_agent_root__')) return;
  if (sessionStorage.getItem('chromium_agent_hidden') === 'true') return;

  const host = document.createElement('div');
  host.id = '__chromium_agent_root__';
  host.style.all = 'initial';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .agent-btn {
      position: fixed;
      right: 20px;
      bottom: 60px;
      z-index: 2147483646;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #1e1e1e;
      border: 1.5px solid #383838;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 10px rgba(55, 148, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease;
      touch-action: none;
    }
    .agent-btn:hover {
      transform: scale(1.08);
      border-color: #3794ff;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(55, 148, 255, 0.4);
    }
    .agent-btn:active {
      transform: scale(0.96);
    }
    .agent-icon {
      width: 22px;
      height: 22px;
      color: #cccccc;
      transition: color 0.2s ease;
    }
    .agent-btn:hover .agent-icon {
      color: #3794ff;
    }
    .agent-tooltip {
      position: absolute;
      right: 54px;
      background: #252526;
      color: #cccccc;
      border: 1px solid #383838;
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 500;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateX(6px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .agent-tooltip kbd {
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 10px;
      color: #3794ff;
      font-family: monospace;
    }
    .agent-btn:hover .agent-tooltip {
      opacity: 1;
      transform: translateX(0);
    }

    /* Drop-to-Close Target Zone */
    #agent-drop-close {
      position: fixed;
      top: 85%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.7);
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: rgba(20, 20, 20, 0.92);
      border: 2px dashed rgba(255, 68, 68, 0.6);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ff4444;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s, transform 0.2s, border-color 0.2s, box-shadow 0.2s, background 0.2s;
      box-shadow: 0 0 15px rgba(255, 68, 68, 0.25);
    }
    #agent-drop-close.visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    #agent-drop-close.active {
      border-color: #ff3344;
      border-style: solid;
      background: rgba(255, 51, 68, 0.25);
      box-shadow: 0 0 35px rgba(255, 51, 68, 0.85);
      transform: translate(-50%, -50%) scale(1.2);
    }

    /* Particle Explosion */
    .agent-particle {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      font-family: monospace;
      font-size: 12px;
      color: #3794ff;
      font-weight: 700;
      text-shadow: 0 0 8px #3794ff;
      user-select: none;
      animation: agent-particle-fly 0.65s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
    }
    @keyframes agent-particle-fly {
      0% {
        opacity: 1;
        transform: translate(0, 0) scale(1.4) rotate(0deg);
      }
      100% {
        opacity: 0;
        transform: translate(var(--dx), var(--dy)) scale(0.2) rotate(360deg);
      }
    }
  `;

  // Drop Target Element
  const dropTarget = document.createElement('div');
  dropTarget.id = 'agent-drop-close';
  dropTarget.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
    <span style="font-size:9px;margin-top:2px;font-weight:700;letter-spacing:0.5px">ЗАКРЫТЬ</span>
  `;

  // Floating Button Element
  const btn = document.createElement('div');
  btn.className = 'agent-btn';
  btn.title = 'Chromium Agent';

  // SVG Chat Bubble Icon
  btn.innerHTML = `
    <div class="agent-tooltip">
      <span>Chromium Agent</span>
      <kbd>Alt+C</kbd>
    </div>
    <svg class="agent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  `;

  // Particle explosion effect
  function triggerParticleExplosion(x: number, y: number) {
    const chars = ['0', '1', '>', '#', '*', '⚡', '{', '}', ';', '●', '▲'];
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('span');
      p.className = 'agent-particle';
      p.textContent = chars[Math.floor(Math.random() * chars.length)];

      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 110;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);
      p.style.animationDelay = `${Math.random() * 0.08}s`;

      shadow.appendChild(p);

      setTimeout(() => {
        if (p.parentNode) p.parentNode.removeChild(p);
      }, 750);
    }
  }

  // Restore saved position if available
  const savedPos = localStorage.getItem('chromium_agent_btn_pos');
  if (savedPos) {
    try {
      const parsed = JSON.parse(savedPos);
      if (parsed.left !== undefined && parsed.top !== undefined) {
        btn.style.left = `${Math.max(10, Math.min(window.innerWidth - 60, parsed.left))}px`;
        btn.style.top = `${Math.max(10, Math.min(window.innerHeight - 60, parsed.top))}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    } catch {}
  }

  // Full 2D Dragging & Drop-to-Close
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let hasMoved = false;

  function onPointerDown(e: MouseEvent | TouchEvent) {
    if (e.type === 'mousedown' && (e as MouseEvent).button !== 0) return;
    const pointer = 'touches' in e ? e.touches[0] : (e as MouseEvent);
    startX = pointer.clientX;
    startY = pointer.clientY;

    const rect = btn.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    hasMoved = false;
    isDragging = true;

    window.addEventListener('mousemove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', onPointerUp);
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    const pointer = 'touches' in e ? e.touches[0] : (e as MouseEvent);
    const dx = pointer.clientX - startX;
    const dy = pointer.clientY - startY;

    if (Math.hypot(dx, dy) > 6) {
      hasMoved = true;
      if (e.cancelable) e.preventDefault();
      dropTarget.classList.add('visible');

      const newLeft = Math.max(10, Math.min(window.innerWidth - 54, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - 54, initialTop + dy));

      btn.style.left = `${newLeft}px`;
      btn.style.top = `${newTop}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';

      const btnCenterX = newLeft + 22;
      const btnCenterY = newTop + 22;
      const targetCenterX = window.innerWidth / 2;
      const targetCenterY = window.innerHeight * 0.85;

      const dist = Math.hypot(btnCenterX - targetCenterX, btnCenterY - targetCenterY);
      if (dist < 80) {
        dropTarget.classList.add('active');
      } else {
        dropTarget.classList.remove('active');
      }
    }
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;

    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
    window.removeEventListener('touchcancel', onPointerUp);

    const isDropped = dropTarget.classList.contains('active');
    dropTarget.classList.remove('visible', 'active');

    if (isDropped) {
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      triggerParticleExplosion(centerX, centerY);

      sessionStorage.setItem('chromium_agent_hidden', 'true');
      btn.style.display = 'none';
    } else if (hasMoved) {
      // Save position to localStorage
      const rect = btn.getBoundingClientRect();
      localStorage.setItem(
        'chromium_agent_btn_pos',
        JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })
      );
    } else {
      // Simple click without movement: open side panel!
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    }
  }

  btn.addEventListener('mousedown', onPointerDown);
  btn.addEventListener('touchstart', onPointerDown, { passive: true });

  shadow.appendChild(style);
  shadow.appendChild(dropTarget);
  shadow.appendChild(btn);
}

// Inject widget
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFloatingAgentWidget);
} else {
  injectFloatingAgentWidget();
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
