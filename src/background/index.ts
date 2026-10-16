import { devtools } from '../services/devtools';

console.log('[Background] Browser Agent service worker initialized.');

// Configure Chrome Side Panel behavior and auto-open on install/reload
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn('Could not set sidePanel behavior:', err);
    }
  }

  // Create context menu item on right-click anywhere on page
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'open_devtools_copilot',
        title: '🤖 Открыть Browser Agent',
        contexts: ['page', 'selection', 'link', 'editable'],
      });
    });
  }
});

// Handle right-click context menu
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open_devtools_copilot' && tab?.windowId && chrome.sidePanel) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('Failed to open sidePanel from context menu:', err);
    }
  }
});

// Also open side panel on action click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('Failed to open sidePanel:', err);
    }
  }
});

// Listen to messages from Side Panel and Content Script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, payload } = message || {};

  if (action === 'OPEN_SIDE_PANEL') {
    const tabId = _sender.tab?.id;
    const windowId = _sender.tab?.windowId;
    if (windowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId }).catch((err) => {
        console.warn('Failed to open sidePanel by windowId, trying tabId:', err);
        if (tabId) {
          chrome.sidePanel.open({ tabId }).catch(console.warn);
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (action === 'OPEN_SHORTCUTS_SETTINGS') {
    const shortcutUrl = navigator.userAgent.includes('YaBrowser')
      ? 'browser://extensions/shortcuts'
      : 'chrome://extensions/shortcuts';
    chrome.tabs.create({ url: shortcutUrl }).catch(() => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(console.warn);
    });
    sendResponse({ success: true });
    return true;
  }

  if (action === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      sendResponse({
        success: true,
        tab: {
          id: activeTab.id,
          title: activeTab.title || 'Untitled',
          url: activeTab.url || '',
          favIconUrl: activeTab.favIconUrl,
          isAttached: devtools.isAttached(activeTab.id),
        },
      });
    }).catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async sendResponse
  }

  if (action === 'EXECUTE_DEVTOOLS_TOOL') {
    const { tabId, toolName, args } = payload;
    handleToolExecution(tabId, toolName, args)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'ATTACH_DEBUGGER') {
    devtools.attach(payload.tabId)
      .then((success) => sendResponse({ success }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === 'DETACH_DEBUGGER') {
    devtools.detach(payload.tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleToolExecution(tabId: number, toolName: string, args: any): Promise<any> {
  console.log(`[Background] Executing tool ${toolName} on tab ${tabId}`, args);

  switch (toolName) {
    case 'devtools_get_page_summary':
      return await devtools.getPageSummary(tabId);

    case 'devtools_click_element':
      return await devtools.clickElement(tabId, args.selector);

    case 'devtools_type_text':
      return await devtools.typeText(tabId, args.selector, args.text, args.clearFirst ?? true);

    case 'devtools_evaluate_js':
      return await devtools.evaluateJs(tabId, args.code);

    case 'devtools_get_console_logs':
      return await devtools.getConsoleLogs(tabId);

    case 'devtools_get_network_requests':
      return await devtools.getNetworkRequests(tabId);

    case 'devtools_inspect_dom':
      return await devtools.inspectDom(tabId, args.selector || 'body');

    case 'devtools_scroll_page':
      return await devtools.scrollPage(tabId, args.direction, args.amount ?? 500);

    case 'devtools_navigate':
      await devtools.navigate(tabId, args.url);
      return `Navigated tab to ${args.url}`;

    case 'devtools_capture_screenshot':
      return await devtools.captureScreenshot(tabId);

    default:
      throw new Error(`Unknown DevTools tool: ${toolName}`);
  }
}
