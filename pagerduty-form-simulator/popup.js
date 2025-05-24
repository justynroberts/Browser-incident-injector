// Incident Injector - Popup Script
document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const extensionEnabledToggle = document.getElementById('extension-enabled');
    const integrationKeyInput = document.getElementById('integration-key');
    const alertMessageTextarea = document.getElementById('alert-message');
    const showAlertCheckbox = document.getElementById('show-alert');
    const allowContinuationCheckbox = document.getElementById('allow-continuation');
    const redirectTo500Checkbox = document.getElementById('redirect-to-500');
    const targetElementsTextarea = document.getElementById('target-elements');
    const testIncidentButton = document.getElementById('test-incident');
    const testResult = document.getElementById('test-result');
    const lastIncidentSpan = document.getElementById('last-incident');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const keyValidation = document.getElementById('key-validation');
    const helpLink = document.getElementById('help-link');
    const setupLink = document.getElementById('setup-link');
    const helpModal = document.getElementById('help-modal');
    const closeModal = document.querySelector('.close');

    // Load saved settings
    await loadSettings();
    
    // Update status
    updateStatus();

    // Event listeners
    extensionEnabledToggle.addEventListener('change', saveSettings);
    integrationKeyInput.addEventListener('input', handleKeyInput);
    integrationKeyInput.addEventListener('blur', saveSettings);
    alertMessageTextarea.addEventListener('input', saveSettings);
    showAlertCheckbox.addEventListener('change', saveSettings);
    allowContinuationCheckbox.addEventListener('change', saveSettings);
    redirectTo500Checkbox.addEventListener('change', saveSettings);
    targetElementsTextarea.addEventListener('input', saveSettings);
    testIncidentButton.addEventListener('click', handleTestIncident);
    helpLink.addEventListener('click', showHelpModal);
    setupLink.addEventListener('click', showHelpModal);
    closeModal.addEventListener('click', hideHelpModal);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === helpModal) {
            hideHelpModal();
        }
    });

    // Load settings from storage
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get([
                'extension_enabled',
                'pagerduty_integration_key',
                'custom_alert_message',
                'show_alert',
                'allow_form_continuation',
                'redirect_to_500',
                'target_element_texts',
                'last_incident_timestamp'
            ]);

            // Set form values
            extensionEnabledToggle.checked = result.extension_enabled !== false; // Default to true
            integrationKeyInput.value = result.pagerduty_integration_key || '';
            alertMessageTextarea.value = result.custom_alert_message ||
                '🚨 Error: Form submission failed! PagerDuty incident created.';
            showAlertCheckbox.checked = result.show_alert !== false; // Default to true
            allowContinuationCheckbox.checked = result.allow_form_continuation || false;
            redirectTo500Checkbox.checked = result.redirect_to_500 || false;
            targetElementsTextarea.value = result.target_element_texts || '';

            // Update last incident timestamp
            if (result.last_incident_timestamp) {
                const date = new Date(result.last_incident_timestamp);
                lastIncidentSpan.textContent = formatTimestamp(date);
            } else {
                lastIncidentSpan.textContent = 'Never';
            }

            // Validate integration key
            validateIntegrationKey(integrationKeyInput.value);

        } catch (error) {
            console.error('Error loading settings:', error);
            showError('Failed to load settings');
        }
    }

    // Save settings to storage
    async function saveSettings() {
        try {
            const settings = {
                extension_enabled: extensionEnabledToggle.checked,
                pagerduty_integration_key: integrationKeyInput.value.trim(),
                custom_alert_message: alertMessageTextarea.value.trim(),
                show_alert: showAlertCheckbox.checked,
                allow_form_continuation: allowContinuationCheckbox.checked,
                redirect_to_500: redirectTo500Checkbox.checked,
                target_element_texts: targetElementsTextarea.value.trim()
            };

            await chrome.storage.sync.set(settings);
            updateStatus();
            
            // Show brief success feedback
            showSuccess('Settings saved');

        } catch (error) {
            console.error('Error saving settings:', error);
            showError('Failed to save settings');
        }
    }

    // Handle integration key input
    function handleKeyInput() {
        const key = integrationKeyInput.value.trim();
        validateIntegrationKey(key);
        
        // Debounced save
        clearTimeout(handleKeyInput.timeout);
        handleKeyInput.timeout = setTimeout(saveSettings, 500);
    }

    // Validate PagerDuty integration key
    function validateIntegrationKey(key) {
        const keyRegex = /^[a-zA-Z0-9]{32}$/;
        
        if (!key) {
            keyValidation.textContent = '';
            keyValidation.className = 'validation-message';
            return false;
        } else if (keyRegex.test(key)) {
            keyValidation.textContent = '✓ Valid integration key format';
            keyValidation.className = 'validation-message valid';
            return true;
        } else {
            keyValidation.textContent = '✗ Invalid format (must be 32 alphanumeric characters)';
            keyValidation.className = 'validation-message invalid';
            return false;
        }
    }

    // Update extension status
    function updateStatus() {
        const isEnabled = extensionEnabledToggle.checked;
        const hasValidKey = validateIntegrationKey(integrationKeyInput.value.trim());
        
        if (isEnabled && hasValidKey) {
            statusDot.className = 'status-dot active';
            statusText.textContent = 'Active';
        } else if (isEnabled && !hasValidKey) {
            statusDot.className = 'status-dot warning';
            statusText.textContent = 'Enabled (No API Key)';
        } else {
            statusDot.className = 'status-dot inactive';
            statusText.textContent = 'Disabled';
        }
    }

    // Handle test incident
    async function handleTestIncident() {
        if (!validateIntegrationKey(integrationKeyInput.value.trim())) {
            showError('Please enter a valid PagerDuty integration key first');
            return;
        }

        // Disable button and show loading
        testIncidentButton.disabled = true;
        testIncidentButton.innerHTML = '<span class="btn-icon">⏳</span>Sending...';
        testResult.textContent = '';

        try {
            // Send test incident via background script
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'test_incident'
                }, resolve);
            });

            if (response.success) {
                showTestSuccess(`Test incident created successfully! ID: ${response.incidentId}`);
                
                // Update last incident timestamp
                const now = new Date();
                lastIncidentSpan.textContent = formatTimestamp(now);
                await chrome.storage.sync.set({
                    last_incident_timestamp: now.toISOString()
                });
            } else {
                showTestError(`Failed to create test incident: ${response.error}`);
            }

        } catch (error) {
            console.error('Test incident error:', error);
            showTestError(`Error: ${error.message}`);
        } finally {
            // Re-enable button
            testIncidentButton.disabled = false;
            testIncidentButton.innerHTML = '<span class="btn-icon">🧪</span>Send Test Incident';
        }
    }

    // Show help modal
    function showHelpModal(event) {
        event.preventDefault();
        helpModal.style.display = 'block';
    }

    // Hide help modal
    function hideHelpModal() {
        helpModal.style.display = 'none';
    }

    // Utility functions
    function formatTimestamp(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    function showSuccess(message) {
        showMessage(message, 'success');
    }

    function showError(message) {
        showMessage(message, 'error');
    }

    function showTestSuccess(message) {
        testResult.textContent = message;
        testResult.className = 'test-result success';
        setTimeout(() => {
            testResult.textContent = '';
            testResult.className = 'test-result';
        }, 5000);
    }

    function showTestError(message) {
        testResult.textContent = message;
        testResult.className = 'test-result error';
        setTimeout(() => {
            testResult.textContent = '';
            testResult.className = 'test-result';
        }, 5000);
    }

    function showMessage(message, type) {
        // Create temporary message element
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            ${type === 'success' ? 'background: #4CAF50; color: white;' : 'background: #f44336; color: white;'}
        `;

        document.body.appendChild(messageEl);

        // Remove after 3 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
    }

    // Listen for storage changes to update UI
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.last_incident_timestamp) {
            const date = new Date(changes.last_incident_timestamp.newValue);
            lastIncidentSpan.textContent = formatTimestamp(date);
        }
    });

    console.log('Popup script loaded');
});