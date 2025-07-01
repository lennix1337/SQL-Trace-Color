document.addEventListener('DOMContentLoaded', function() {
    const openPanelCheckbox = document.getElementById('openPanelByDefault');
    const languageSelect = document.getElementById('languageSelect');
    const statusDiv = document.getElementById('status');

    // Apply i18n to static text
    document.querySelector('h2').textContent = chrome.i18n.getMessage("optionsTitle");
    document.querySelector('label[for="openPanelByDefault"]').textContent = chrome.i18n.getMessage("openPanelByDefault");
    document.querySelector('label[for="languageSelect"]').textContent = chrome.i18n.getMessage("languageSetting");
    document.querySelector('option[value="en"]').textContent = chrome.i18n.getMessage("languageEnglish");
    document.querySelector('option[value="pt_BR"]').textContent = chrome.i18n.getMessage("languagePortuguese");

    // Load saved preferences
    chrome.storage.sync.get(['openPanelByDefault', 'language'], function(data) {
        openPanelCheckbox.checked = data.openPanelByDefault || false; // Default to false if not set
        languageSelect.value = data.language || chrome.i18n.getUILanguage().split('-')[0]; // Default to browser language or 'en'
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
            // Reload the page to apply new language settings in content.js
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.reload(tabs[0].id);
            });
        });
    });
});