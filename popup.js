document.addEventListener('DOMContentLoaded', function() {
    console.log("UI Language:", chrome.i18n.getUILanguage());
    chrome.i18n.getAcceptLanguages(function(languages) {
        console.log("Accepted Languages:", languages);
    });
    const openPanelCheckbox = document.getElementById('openPanelByDefault');
    const openPanelByDefaultLabel = document.getElementById('openPanelByDefaultLabel');
    const languageSelect = document.getElementById('languageSelect');
    const statusDiv = document.getElementById('status');

    // Apply i18n to static text
    openPanelByDefaultLabel.textContent = chrome.i18n.getMessage("openPanelByDefault");
    document.querySelector('label[for="languageSelect"]').textContent = chrome.i18n.getMessage("languageSetting");
    document.querySelector('option[value="en"]').textContent = chrome.i18n.getMessage("languageEnglish");
    document.querySelector('option[value="pt_BR"]').textContent = chrome.i18n.getMessage("languagePortuguese");

    // Load saved preferences
    chrome.storage.sync.get(['openPanelByDefault', 'language'], function(data) {
        openPanelCheckbox.checked = data.openPanelByDefault || false; // Default to false if not set
        const initialLanguage = data.language || chrome.i18n.getUILanguage().split('-')[0];
        languageSelect.value = initialLanguage;
        document.documentElement.lang = initialLanguage; // Set initial lang attribute
    });

    // Save openPanelByDefault preference when checkbox changes
    openPanelCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({'openPanelByDefault': openPanelCheckbox.checked}, function() {
            statusDiv.textContent = chrome.i18n.getMessage("preferenceSaved");
            setTimeout(() => { statusDiv.textContent = ''; }, 1500);
        });
    });

    // Save language preference when dropdown changes
    languageSelect.addEventListener('change', function() {
        const selectedLanguage = languageSelect.value;
        chrome.storage.sync.set({'language': selectedLanguage}, function() {
            statusDiv.textContent = chrome.i18n.getMessage("preferenceSaved");
            setTimeout(() => { statusDiv.textContent = ''; }, 1500);
            document.documentElement.lang = selectedLanguage; // Update lang attribute
            // Send a message to the content script to update its language
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "updateLanguage", language: selectedLanguage}, function(response) {
                        if (chrome.runtime.lastError) {
                            console.log("Could not establish connection. Assuming content script is not injected yet.");
                        } else {
                            console.log(response.status);
                        }
                    });
                } else {
                    console.log("Could not find active tab to send message to.");
                }
            });
        });
    });
});