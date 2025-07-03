// background.js

// This script enables the extension's action (popup) only on pages
// whose URL contains 'trace.axd'.

// When the extension is installed or updated...
chrome.runtime.onInstalled.addListener(() => {
  // Clear all existing rules to ensure a clean state.
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    // Define the rule to enable the action on trace.axd pages.
    const rule = {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { urlContains: 'trace.axd' },
        })
      ],
      // If the condition is met, show the extension's action icon.
      actions: [new chrome.declarativeContent.ShowAction()],
    };

    // Register the rule.
    chrome.declarativeContent.onPageChanged.addRules([rule]);
  });
});

// Listen for tab updates to enable/disable the action dynamically
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('trace.axd')) {
    chrome.action.enable(tabId);
  } else if (changeInfo.status === 'complete' && tab.url && !tab.url.includes('trace.axd')) {
    chrome.action.disable(tabId);
  }
});
