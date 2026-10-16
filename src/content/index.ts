// Keep this entry self-contained: Chromium loads it as a classic content script.
(() => {
  let host: HTMLDivElement | undefined;
  let removeWidget = () => {};
  let hidden = false, enabled = true, revision = 0;
  function valid() {
    try { return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id); } catch { return false; }
  }
  async function message(payload: any) {
    if (!valid()) { removeWidget(); return; }
    try { return await chrome.runtime.sendMessage(payload); }
    catch (err: any) {
      if (!valid() || /extension context invalidated/i.test(err?.message || '')) removeWidget();
      else console.warn('[Browser Agent]', err?.message || 'Message failed');
    }
  }
  async function inject() {
    if (!valid() || host || hidden || !enabled) return;
    const ticket = ++revision;
    const config = await message({ action: 'GET_WIDGET_SETTINGS' });
    if (ticket !== revision || !valid() || host || !enabled || !config?.success || !config.enabled || config.hidden) return;
    const ru = config.language === 'ru';
    document.getElementById('__browser_agent_root__')?.remove();
    host = document.createElement('div'); host.id = '__browser_agent_root__';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{all:initial}
      .agent-btn{all:unset;box-sizing:border-box;position:fixed;z-index:2147483646;right:20px;bottom:60px;width:48px;height:48px;display:grid;place-items:center;border-radius:50%;cursor:pointer;touch-action:none;user-select:none;box-shadow:0 4px 14px #0005;transition:transform .15s}
      .agent-btn:hover{transform:scale(1.06)}.agent-btn:focus-visible{outline:2px solid #8ab4d8;outline-offset:3px}.agent-btn.dragging{transition:none;transform:none;cursor:grabbing}
      .agent-btn img{display:block;width:100%;height:100%;pointer-events:none;-webkit-user-drag:none}
      .drop-zone{position:fixed;z-index:2147483647;left:50%;bottom:28px;transform:translateX(-50%) scale(.8);width:76px;height:76px;box-sizing:border-box;border-radius:50%;background:#242528ed;border:1px dashed #8697a8;color:#d7e0e8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font:10px/1 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .12s,transform .12s,background .12s}
      .drop-zone.visible{opacity:1;transform:translateX(-50%) scale(1)}.drop-zone.active{background:#344b61;border-color:#a9c6df;border-style:solid}.drop-zone svg{width:24px;height:24px;flex:none}
      @media(prefers-reduced-motion:reduce){.agent-btn,.drop-zone{transition:none}}`;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'agent-btn';
    open.title = ru ? 'Browser Agent · Alt+C. Перетащите в зону закрытия, чтобы скрыть.' : 'Browser Agent · Alt+C. Drag to the close target to hide.';
    open.setAttribute('aria-label', ru ? 'Открыть Browser Agent' : 'Open Browser Agent');
    const icon = document.createElement('img'); icon.src = chrome.runtime.getURL('icons/logo.svg'); icon.alt = ''; icon.draggable = false;
    open.append(icon);
    const drop = document.createElement('div'); drop.className = 'drop-zone'; drop.setAttribute('aria-hidden', 'true');
    drop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const label = document.createElement('span'); label.textContent = ru ? 'Закрыть' : 'Close'; drop.append(label);
    let dragging = false, moved = false, inTarget = false, startX = 0, startY = 0, left = 0, top = 0;
    const stop = () => {
      dragging = false; open.classList.remove('dragging'); drop.classList.remove('visible', 'active');
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', stop);
    };
    const place = (x: number, y: number) => {
      open.style.left = `${Math.max(4, Math.min(innerWidth - 52, x))}px`; open.style.top = `${Math.max(4, Math.min(innerHeight - 52, y))}px`;
      open.style.right = 'auto'; open.style.bottom = 'auto';
    };
    const resize = () => { if (open.style.left) { const rect = open.getBoundingClientRect(); place(rect.left, rect.top); } };
    removeWidget = () => { stop(); window.removeEventListener('resize', resize); host?.remove(); host = undefined; };
    const hide = () => { hidden = true; removeWidget(); void message({ action: 'HIDE_WIDGET' }); };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      if (!valid()) { removeWidget(); return; }
      const dx = event.clientX - startX, dy = event.clientY - startY;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (moved) {
        event.preventDefault(); open.classList.add('dragging'); drop.classList.add('visible'); place(left + dx, top + dy);
        const buttonRect = open.getBoundingClientRect(), targetRect = drop.getBoundingClientRect();
        inTarget = Math.hypot(buttonRect.left + 24 - targetRect.left - targetRect.width / 2, buttonRect.top + 24 - targetRect.top - targetRect.height / 2) < 58;
        drop.classList.toggle('active', inTarget);
      }
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      const dropped = moved && inTarget && event.type !== 'pointercancel'; stop();
      if (dropped) { hide(); return; }
      if (moved && event.type !== 'pointercancel') {
        const rect = open.getBoundingClientRect();
        void message({ action: 'SET_WIDGET_POSITION', x: rect.left / innerWidth, y: rect.top / innerHeight });
      }
    };
    open.addEventListener('pointerdown', event => {
      if (!valid()) { removeWidget(); return; }
      if (event.button !== 0) return;
      const rect = open.getBoundingClientRect(); left = rect.left; top = rect.top; startX = event.clientX; startY = event.clientY;
      dragging = true; moved = false; inTarget = false;
      window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', stop);
    });
    open.addEventListener('click', event => { if (!moved || event.detail === 0) void message({ action: 'OPEN_SIDE_PANEL' }); moved = false; });
    open.addEventListener('keydown', event => { if (event.key === 'Delete') { event.preventDefault(); hide(); } });
    shadow.append(style, drop, open); document.documentElement.append(host);
    if (config.position) place(config.position.x * innerWidth, config.position.y * innerHeight);
    window.addEventListener('resize', resize);
  }
  if (valid()) chrome.runtime.onMessage.addListener((payload, _sender, respond) => {
    if (payload.action === 'WIDGET_VISIBILITY') {
      revision++; enabled = payload.enabled; removeWidget(); hidden = false;
      if (enabled) void inject();
      respond({ success: true });
    }
  });
  void inject();
})();
