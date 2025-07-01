document.addEventListener('DOMContentLoaded', function() {
    const openPanelCheckbox = document.getElementById('openPanelByDefault');
    const statusDiv = document.getElementById('status');

    // Load saved preference
    chrome.storage.sync.get('openPanelByDefault', function(data) {
        openPanelCheckbox.checked = data.openPanelByDefault || false; // Default to false if not set
    });

    // Save preference when checkbox changes
    openPanelCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({'openPanelByDefault': openPanelCheckbox.checked}, function() {
            statusDiv.textContent = 'Preference saved!';
            setTimeout(() => { statusDiv.textContent = ''; }, 1500);
        });
    });
});