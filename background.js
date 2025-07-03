// background.js

// This script enables the extension's action (popup) only on pages
// whose URL contains 'trace.axd'.

// When the extension is installed or updated...
chrome.runtime.onInstalled.addListener(() => {
  // Disable the action by default to ensure it's only active on specific pages.
  chrome.action.disable();

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
      actions: [new chrome.declarativeContent.ShowAction(), new chrome.declarativeContent.SetPopup({ popup: 'popup.html' })],
    };

    // Register the rule.
    chrome.declarativeContent.onPageChanged.addRules([rule]);
  });
});
