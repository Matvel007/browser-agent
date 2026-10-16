import { devtools } from '../services/devtools';

console.log('[Background] DevTools AI Copilot service worker initialized.');

// Configure Chrome Side Panel to open when user clicks the extension toolbar icon
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn('Could not set sidePanel behavior:', err));
  }
});

// Also open side panel on action click if setPanelBehavior is not supported
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('Failed to open sidePanel:', err);
    }
  }
});

// Listen to messages from Side Panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, payload } = message || {};

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
