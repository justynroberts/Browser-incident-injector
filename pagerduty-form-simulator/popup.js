// Incident Injector - Popup Script
document.addEventListener('DOMContentLoaded', async () => {
    // We'll communicate with the event processor through messages
    // instead of trying to access it directly
    // DOM elements
    const extensionEnabledToggle = document.getElementById('extension-enabled');
    const integrationKeyInput = document.getElementById('integration-key');
    const alertMessageTextarea = document.getElementById('alert-message');
    // Use the correct IDs from the HTML
    const showAlertCheckbox = document.getElementById('option-create-alert');
    const allowContinuationCheckbox = document.getElementById('option-continue-destination');
    const redirectTo500Checkbox = document.getElementById('option-add-500-error');
    const targetElementsTextarea = document.getElementById('target-elements');
    const testIncidentButton = document.getElementById('test-incident');
    const testScenarioButton = document.getElementById('test-scenario');
    const testResult = document.getElementById('test-result');
    const lastIncidentSpan = document.getElementById('last-incident');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const keyValidation = document.getElementById('key-validation');
    const helpLink = document.getElementById('help-link');
    const setupLink = document.getElementById('setup-link');
    const helpModal = document.getElementById('help-modal');
    const closeModal = document.querySelector('.close');
    
    // Event Definition System elements
    const eventDefinitionTextarea = document.getElementById('event-definition');
    const definitionValidation = document.getElementById('definition-validation');
    const scenarioControls = document.getElementById('scenario-controls');
    const scenarioSelect = document.getElementById('scenario-select');
    const dryRunCheckbox = document.getElementById('dry-run-mode');
    const runScenarioButton = document.getElementById('run-scenario');
    const scenarioResult = document.getElementById('scenario-result');
    const loadSampleButton = document.getElementById('load-sample');
    
    // Trigger Options elements
    const createAlertToggle = document.getElementById('option-create-alert');
    const runScenarioToggle = document.getElementById('option-run-scenario');
    const add500ErrorToggle = document.getElementById('option-add-500-error');
    const continueDestinationToggle = document.getElementById('option-continue-destination');
    const toggleButtonVisibleCheckbox = document.getElementById('toggle-button-visible');

    // Load saved settings
    await loadSettings();
    
    // Update status
    updateStatus();

    // Initialize toggle sections
    initializeToggleSections();
    
    // Initialize trigger options
    initializeTriggerOptions();
    
    // Initially disable test scenario button until a scenario is selected
    updateScenarioButtonState();

    // Event listeners
    extensionEnabledToggle.addEventListener('change', saveSettings);
    integrationKeyInput.addEventListener('input', handleKeyInput);
    integrationKeyInput.addEventListener('blur', saveSettings);
    alertMessageTextarea.addEventListener('input', saveSettings);
    // These elements are already handled by the trigger options event listeners
    // No need to add duplicate event listeners here
    targetElementsTextarea.addEventListener('input', saveSettings);
    toggleButtonVisibleCheckbox.addEventListener('change', saveSettings);
    testIncidentButton.addEventListener('click', handleTestIncident);
    testScenarioButton.addEventListener('click', handleTestScenario);
    helpLink.addEventListener('click', showHelpModal);
    setupLink.addEventListener('click', showHelpModal);
    closeModal.addEventListener('click', hideHelpModal);
    
    // Event Definition System event listeners
    eventDefinitionTextarea.addEventListener('input', handleEventDefinitionInput);
    scenarioSelect.addEventListener('change', handleScenarioSelect);
    runScenarioButton.addEventListener('click', handleRunScenario);
    loadSampleButton.addEventListener('click', handleLoadSample);
    
    // Add event listener for the Edit JSON button
    document.getElementById('edit-json').addEventListener('click', handleEditJson);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === helpModal) {
            hideHelpModal();
        }
    });

    // Load settings from storage
    async function loadSettings() {
        try {
            // Load sync settings
            const syncResult = await chrome.storage.sync.get([
                'extension_enabled',
                'pagerduty_integration_key',
                'custom_alert_message',
                'show_alert',
                'allow_form_continuation',
                'redirect_to_500',
                'target_element_texts',
                'last_incident_timestamp',
                'active_scenario_id',
                'run_scenario_on_submit',
                'toggle_button_visible'
            ]);
            
            // Load event definition from local storage (can be larger)
            const localResult = await chrome.storage.local.get(['event_definition']);
            
            // Combine results
            const result = { ...syncResult, ...localResult };

            // Set form values with null checks
            if (extensionEnabledToggle) extensionEnabledToggle.checked = result.extension_enabled === true; // Default to false
            if (integrationKeyInput) integrationKeyInput.value = result.pagerduty_integration_key || '';
            if (alertMessageTextarea) alertMessageTextarea.value = result.custom_alert_message ||
                'Oops ⛓️‍💥 Error: UX Failure -  Our team are Working on it now.';
            // These values will be set in initializeTriggerOptions() function
            if (targetElementsTextarea) targetElementsTextarea.value = result.target_element_texts || '';
            if (toggleButtonVisibleCheckbox) toggleButtonVisibleCheckbox.checked = result.toggle_button_visible !== false; // Default to true

            // Update last incident timestamp
            if (result.last_incident_timestamp) {
                const date = new Date(result.last_incident_timestamp);
                lastIncidentSpan.textContent = formatTimestamp(date);
            } else {
                lastIncidentSpan.textContent = 'Never';
            }

            // Validate integration key
            validateIntegrationKey(integrationKeyInput.value);
            
            // Load event definition if exists
            if (result.event_definition) {
                eventDefinitionTextarea.value = result.event_definition;
                validateEventDefinition(result.event_definition);
            }

        } catch (error) {
            console.error('Error loading settings:', error);
            showError('Failed to load settings');
        }
    }

    // Save settings to storage
    async function saveSettings() {
        try {
            // Save most settings to sync storage
            const syncSettings = {
                extension_enabled: extensionEnabledToggle.checked,
                pagerduty_integration_key: integrationKeyInput.value.trim(),
                custom_alert_message: alertMessageTextarea.value.trim(),
                show_alert: true, // Always show alert when extension is enabled
                allow_form_continuation: continueDestinationToggle.checked,
                redirect_to_500: add500ErrorToggle.checked,
                run_scenario_on_submit: runScenarioToggle.checked,
                target_element_texts: targetElementsTextarea.value.trim(),
                toggle_button_visible: toggleButtonVisibleCheckbox.checked
            };

            // Save event definition to local storage (can handle larger data)
            const localSettings = {
                event_definition: eventDefinitionTextarea.value.trim()
            };

            // Save to both storage types
            await Promise.all([
                chrome.storage.sync.set(syncSettings),
                chrome.storage.local.set(localSettings)
            ]);
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
    
    // Handle test scenario
    async function handleTestScenario() {
        // Check for valid integration key
        if (!validateIntegrationKey(integrationKeyInput.value.trim())) {
            showError('Please enter a valid PagerDuty integration key first');
            testScenarioButton.disabled = true;
            
            // Automatically open the PagerDuty Configuration section
            const toggleButton = document.getElementById('toggle-pagerduty-config');
            const contentElement = document.getElementById('pagerduty-config-content');
            
            if (toggleButton && contentElement) {
                // Expand the section if it's collapsed
                if (contentElement.classList.contains('collapsed')) {
                    contentElement.classList.remove('collapsed');
                    toggleButton.classList.remove('collapsed');
                    // Save the expanded state
                    saveToggleState('toggle-pagerduty-config', false);
                }
                
                // Focus on the integration key input
                setTimeout(() => {
                    integrationKeyInput.focus();
                }, 100);
            }
            
            return;
        }
        
        // Get the active scenario ID
        const result = await chrome.storage.sync.get(['active_scenario_id']);
        const activeScenarioId = result.active_scenario_id;
        
        if (!activeScenarioId) {
            showError('Please select a scenario first');
            testScenarioButton.disabled = true;
            
            // Automatically open the Event Definition section
            const toggleButton = document.getElementById('toggle-event-definition');
            const contentElement = document.getElementById('event-definition-content');
            
            if (toggleButton && contentElement) {
                // Expand the section if it's collapsed
                if (contentElement.classList.contains('collapsed')) {
                    contentElement.classList.remove('collapsed');
                    toggleButton.classList.remove('collapsed');
                    // Save the expanded state
                    saveToggleState('toggle-event-definition', false);
                }
            }
            
            return;
        }

        // Disable button and show loading
        testScenarioButton.disabled = true;
        testScenarioButton.innerHTML = '<span class="btn-icon">⏳</span>Running...';
        testResult.textContent = '';

        try {
            // Send test scenario via background script
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'run_scenario',
                    scenarioId: activeScenarioId,
                    options: {
                        dryRun: false
                    }
                }, resolve);
            });

            if (response.success) {
                showTestSuccess(`Scenario "${activeScenarioId}" executed successfully!`);
                
                // Update last incident timestamp
                const now = new Date();
                lastIncidentSpan.textContent = formatTimestamp(now);
                await chrome.storage.sync.set({
                    last_incident_timestamp: now.toISOString()
                });
            } else {
                showTestError(`Failed to run scenario: ${response.error}`);
            }

        } catch (error) {
            console.error('Test scenario error:', error);
            showTestError(`Error: ${error.message}`);
        } finally {
            // Re-enable button
            testScenarioButton.disabled = false;
            testScenarioButton.innerHTML = '<span class="btn-icon">▶️</span>Test Current Scenario';
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
        if (namespace === 'sync') {
            if (changes.last_incident_timestamp) {
                const date = new Date(changes.last_incident_timestamp.newValue);
                lastIncidentSpan.textContent = formatTimestamp(date);
            }
            
            // Update scenario button state if active_scenario_id changes
            if (changes.active_scenario_id) {
                updateScenarioButtonState();
            }
        }
    });
    
    // Function to update scenario button state based on whether a scenario is defined
    function updateScenarioButtonState() {
        chrome.storage.sync.get(['active_scenario_id'], (result) => {
            const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
            testScenarioButton.disabled = !hasActiveScenario;
            
            // Update button appearance to indicate why it's disabled
            if (!hasActiveScenario) {
                testScenarioButton.title = 'Please select a scenario first';
                testScenarioButton.classList.add('disabled-with-reason');
            } else {
                testScenarioButton.title = 'Test the currently selected scenario';
                testScenarioButton.classList.remove('disabled-with-reason');
            }
        });
    }

    console.log('Popup script loaded');
    
    // Initialize toggle sections
    function initializeToggleSections() {
        const toggleSections = [
            { toggle: 'toggle-pagerduty-config', content: 'pagerduty-config-content' },
            { toggle: 'toggle-alert-config', content: 'alert-config-content' },
            { toggle: 'toggle-event-definition', content: 'event-definition-content' },
            { toggle: 'toggle-target-config', content: 'target-config-content' },
            { toggle: 'toggle-trigger-options', content: 'trigger-options-content' },
            { toggle: 'toggle-test-section', content: 'test-section-content' },
            { toggle: 'toggle-status-section', content: 'status-section-content' }
        ];
        
        // Check if PagerDuty integration key is defined
        chrome.storage.sync.get(['pagerduty_integration_key'], (result) => {
            const hasIntegrationKey = result.pagerduty_integration_key && result.pagerduty_integration_key.trim() !== '';
            
            // Set initial state for each section
            toggleSections.forEach(section => {
                const toggleButton = document.getElementById(section.toggle);
                const contentElement = document.getElementById(section.content);
                
                if (toggleButton && contentElement) {
                    // Add click event listener
                    toggleButton.addEventListener('click', () => {
                        // Toggle collapsed class on content
                        contentElement.classList.toggle('collapsed');
                        // Toggle collapsed class on button
                        toggleButton.classList.toggle('collapsed');
                        // Save state to storage
                        saveToggleState(section.toggle, toggleButton.classList.contains('collapsed'));
                    });
                    
                    // Set initial collapsed state
                    contentElement.classList.add('collapsed');
                    toggleButton.classList.add('collapsed');
                    
                    // Special case: If this is the PagerDuty config section and no key is defined,
                    // expand it automatically
                    if (section.toggle === 'toggle-pagerduty-config' && !hasIntegrationKey) {
                        console.log('[Incident Injector] No PagerDuty integration key defined, expanding config section');
                        contentElement.classList.remove('collapsed');
                        toggleButton.classList.remove('collapsed');
                        saveToggleState(section.toggle, false);
                    } else {
                        // Load saved state (only if explicitly set to expanded)
                        chrome.storage.local.get([section.toggle], (result) => {
                            if (result[section.toggle] === false) {
                                contentElement.classList.remove('collapsed');
                                toggleButton.classList.remove('collapsed');
                            }
                        });
                    }
                }
            });
        });
    }
    
    // Save toggle state to storage
    function saveToggleState(toggleId, isCollapsed) {
        const state = {};
        state[toggleId] = isCollapsed;
        chrome.storage.local.set(state);
    }
    
    // Initialize trigger options
    function initializeTriggerOptions() {
        // Set initial values from storage
        chrome.storage.sync.get([
            'show_alert',
            'run_scenario_on_submit',
            'redirect_to_500',
            'allow_form_continuation',
            'active_scenario_id'
        ], (result) => {
            // Add null checks before setting properties
            if (createAlertToggle) {
                createAlertToggle.checked = true; // Always show alert when extension is enabled
                createAlertToggle.disabled = true; // Disable the toggle since it's always on
            }
            if (runScenarioToggle) runScenarioToggle.checked = result.run_scenario_on_submit === true;
            if (add500ErrorToggle) add500ErrorToggle.checked = result.redirect_to_500 === true;
            if (continueDestinationToggle) continueDestinationToggle.checked = result.allow_form_continuation === true;
            
            // Disable run scenario toggle if no active scenario
            if (runScenarioToggle && !result.active_scenario_id) {
                runScenarioToggle.disabled = true;
                runScenarioToggle.checked = false;
            }
        });
        
        // Add event listeners with null checks
        // Alert toggle is now always enabled when extension is enabled
        if (runScenarioToggle) runScenarioToggle.addEventListener('change', saveTriggerOptions);
        if (add500ErrorToggle) add500ErrorToggle.addEventListener('change', saveTriggerOptions);
        if (continueDestinationToggle) continueDestinationToggle.addEventListener('change', saveTriggerOptions);
    }
    
    // Save trigger options to storage
    function saveTriggerOptions() {
        chrome.storage.sync.set({
            show_alert: true, // Always show alert when extension is enabled
            run_scenario_on_submit: runScenarioToggle.checked,
            redirect_to_500: add500ErrorToggle.checked,
            allow_form_continuation: continueDestinationToggle.checked
        });
        
        // No need to update UI based on selections since we're now using the same elements
        
        // Save the changes to the main settings
        saveSettings();
    }
    
    // Handle Edit JSON button click
    function handleEditJson() {
        const textarea = document.getElementById('event-definition');
        
        // Toggle between compact and pretty-printed JSON
        try {
            const json = JSON.parse(textarea.value.trim() || '{}');
            const formatted = JSON.stringify(json, null, 2);
            textarea.value = formatted;
            
            // Validate the formatted JSON
            validateEventDefinition(formatted);
            
            // Save the formatted JSON
            saveSettings();
            
            // Show success message
            showSuccess('JSON formatted');
        } catch (error) {
            showError(`Invalid JSON: ${error.message}`);
        }
    }
    
    // Event Definition System Functions
    
    // Handle event definition input
    function handleEventDefinitionInput() {
        const definitionJson = eventDefinitionTextarea.value.trim();
        validateEventDefinition(definitionJson);
        
        // Debounced save
        clearTimeout(handleEventDefinitionInput.timeout);
        handleEventDefinitionInput.timeout = setTimeout(saveSettings, 500);
    }
    
    // Validate event definition JSON
    function validateEventDefinition(definitionJson) {
        if (!definitionJson) {
            definitionValidation.textContent = '';
            definitionValidation.className = 'validation-message';
            scenarioControls.style.display = 'none';
            return false;
        }
        
        try {
            // Try to parse the JSON
            const definition = JSON.parse(definitionJson);
            
            // Check for schema version
            if (definition.schema_version) {
                console.log(`Event definition schema version: ${definition.schema_version}`);
            }
            
            // Basic validation - check for event_definitions (new schema) or scenarios (old schema)
            let hasValidDefinitions = false;
            
            // Check new schema format
            if (definition.event_definitions && definition.event_definitions.length > 0) {
                // Check if at least one event definition has events
                for (const eventDef of definition.event_definitions) {
                    if (eventDef.events && eventDef.events.length > 0) {
                        hasValidDefinitions = true;
                        break;
                    }
                }
                
                if (!hasValidDefinitions) {
                    definitionValidation.textContent = '✗ Invalid format: No events defined in any event definition';
                    definitionValidation.className = 'validation-message invalid';
                    scenarioControls.style.display = 'none';
                    return false;
                }
            }
            // Check old schema format
            else if (definition.scenarios && Object.keys(definition.scenarios).length > 0) {
                // Check if at least one scenario has events
                for (const scenarioId in definition.scenarios) {
                    const scenario = definition.scenarios[scenarioId];
                    if (scenario.events && scenario.events.length > 0) {
                        hasValidDefinitions = true;
                        break;
                    }
                }
                
                if (!hasValidDefinitions) {
                    definitionValidation.textContent = '✗ Invalid format: No events defined in any scenario';
                    definitionValidation.className = 'validation-message invalid';
                    scenarioControls.style.display = 'none';
                    return false;
                }
            }
            // No valid definitions found
            else {
                definitionValidation.textContent = '✗ Invalid format: No event definitions or scenarios found';
                definitionValidation.className = 'validation-message invalid';
                scenarioControls.style.display = 'none';
                return false;
            }
            
            // Valid definition
            definitionValidation.textContent = '✓ Valid event definition format';
            definitionValidation.className = 'validation-message valid';
            scenarioControls.style.display = 'block';
            
            // Send to background script to load
            chrome.runtime.sendMessage({
                action: 'load_event_definition',
                definition: definitionJson
            }, (response) => {
                if (response && response.success) {
                    populateScenarioDropdown(response.scenarios);
                } else {
                    console.error('Failed to load event definition:', response?.error);
                }
            });
            
            return true;
        } catch (error) {
            definitionValidation.textContent = `✗ Invalid JSON: ${error.message}`;
            definitionValidation.className = 'validation-message invalid';
            scenarioControls.style.display = 'none';
            return false;
        }
    }
    
    // Populate scenario dropdown
    function populateScenarioDropdown(scenarios) {
        // Clear existing options except the first one
        while (scenarioSelect.options.length > 1) {
            scenarioSelect.remove(1);
        }
        
        // Add scenarios to dropdown
        scenarios.forEach(scenario => {
            const option = document.createElement('option');
            option.value = scenario.id;
            option.textContent = scenario.name || scenario.id;
            
            // Add event count as data attribute
            option.dataset.eventCount = scenario.eventCount;
            option.dataset.description = scenario.description || '';
            
            scenarioSelect.appendChild(option);
        });
        
        // Get the previously selected scenario ID from storage
        chrome.storage.sync.get(['active_scenario_id'], (result) => {
            const activeScenarioId = result.active_scenario_id;
            
            if (activeScenarioId) {
                console.log(`[Event Definition] Restoring previously selected scenario: ${activeScenarioId}`);
                
                // Find and select the option with the matching scenario ID
                for (let i = 0; i < scenarioSelect.options.length; i++) {
                    if (scenarioSelect.options[i].value === activeScenarioId) {
                        scenarioSelect.selectedIndex = i;
                        
                        // Trigger the change event to update UI
                        handleScenarioSelect();
                        break;
                    }
                }
            }
            
            // Enable/disable run button based on selection
            runScenarioButton.disabled = scenarioSelect.value === '';
        });
    }
    
    // Handle scenario selection
    function handleScenarioSelect() {
        const selectedOption = scenarioSelect.options[scenarioSelect.selectedIndex];
        runScenarioButton.disabled = scenarioSelect.value === '';
        
        // Show scenario details if available
        if (selectedOption && selectedOption.value) {
            const eventCount = selectedOption.dataset.eventCount;
            const description = selectedOption.dataset.description;
            
            // Update scenario result with info
            let infoHtml = '';
            if (eventCount) {
                infoHtml += `<span class="scenario-badge">${eventCount} events</span>`;
            }
            
            if (description) {
                infoHtml += `<div class="scenario-description">${description}</div>`;
            }
            
            scenarioResult.innerHTML = infoHtml;
            scenarioResult.className = 'test-result';
            
            // Set this as the active scenario for trigger options
            chrome.storage.sync.set({
                active_scenario_id: selectedOption.value
            });
            console.log(`[Event Definition] Set active scenario to: ${selectedOption.value}`);
            
            // Update run scenario toggle if it exists
            if (runScenarioToggle) {
                runScenarioToggle.disabled = false;
                runScenarioToggle.checked = true; // Automatically enable the toggle
                
                // Save the setting
                chrome.storage.sync.set({
                    run_scenario_on_submit: true
                });
                console.log('[Event Definition] Automatically enabled Run Scenario toggle');
            }
            
            // Update test scenario button state
            testScenarioButton.disabled = false;
            testScenarioButton.title = 'Test the currently selected scenario';
            testScenarioButton.classList.remove('disabled-with-reason');
        } else {
            scenarioResult.textContent = '';
            
            // Clear active scenario
            chrome.storage.sync.set({
                active_scenario_id: ""
            });
            
            // Disable run scenario toggle if it exists
            if (runScenarioToggle) {
                runScenarioToggle.disabled = true;
                runScenarioToggle.checked = false;
            }
            
            // Disable test scenario button
            testScenarioButton.disabled = true;
            testScenarioButton.title = 'Please select a scenario first';
            testScenarioButton.classList.add('disabled-with-reason');
        }
    }
    
    // Handle run scenario button click
    function handleRunScenario() {
        // Check for valid integration key first
        if (!validateIntegrationKey(integrationKeyInput.value.trim())) {
            showError('Please enter a valid PagerDuty integration key first');
            
            // Automatically open the PagerDuty Configuration section
            const toggleButton = document.getElementById('toggle-pagerduty-config');
            const contentElement = document.getElementById('pagerduty-config-content');
            
            if (toggleButton && contentElement) {
                // Expand the section if it's collapsed
                if (contentElement.classList.contains('collapsed')) {
                    contentElement.classList.remove('collapsed');
                    toggleButton.classList.remove('collapsed');
                    // Save the expanded state
                    saveToggleState('toggle-pagerduty-config', false);
                }
                
                // Focus on the integration key input
                setTimeout(() => {
                    integrationKeyInput.focus();
                }, 100);
            }
            
            return;
        }
        
        const scenarioId = scenarioSelect.value;
        if (!scenarioId) {
            showError('Please select a scenario first');
            runScenarioButton.disabled = true;
            return;
        }
        
        // Disable button and show loading
        runScenarioButton.disabled = true;
        runScenarioButton.innerHTML = '<span class="btn-icon">⏳</span>Running...';
        scenarioResult.textContent = '';
        
        // Get dry run option
        const dryRun = dryRunCheckbox.checked;
        
        // Send to background script to run
        chrome.runtime.sendMessage({
            action: 'run_scenario',
            scenarioId: scenarioId,
            options: {
                dryRun: dryRun
            }
        }, (response) => {
            // Re-enable button
            runScenarioButton.disabled = false;
            runScenarioButton.innerHTML = '<span class="btn-icon">▶️</span>Run Scenario';
            
            if (response && response.success) {
                showScenarioSuccess(`Scenario "${scenarioId}" started successfully${dryRun ? ' (DRY RUN)' : ''}`);
                
                // Update last incident timestamp if not dry run
                if (!dryRun) {
                    const now = new Date();
                    lastIncidentSpan.textContent = formatTimestamp(now);
                    chrome.storage.sync.set({
                        last_incident_timestamp: now.toISOString()
                    });
                }
            } else {
                showScenarioError(`Failed to run scenario: ${response?.error || 'Unknown error'}`);
            }
        });
    }
    
    // Show scenario success message
    function showScenarioSuccess(message) {
        scenarioResult.textContent = message;
        scenarioResult.className = 'test-result success';
    }
    
    // Show scenario error message
    function showScenarioError(message) {
        scenarioResult.textContent = message;
        scenarioResult.className = 'test-result error';
    }
    
    // Handle loading sample event definition
    async function handleLoadSample() {
        try {
            // Disable button and show loading
            loadSampleButton.disabled = true;
            loadSampleButton.innerHTML = '<span class="btn-icon">⏳</span>Loading...';
            
            // Make sure the Event Definition section is expanded
            const toggleButton = document.getElementById('toggle-event-definition');
            const contentElement = document.getElementById('event-definition-content');
            
            if (toggleButton && contentElement) {
                // Expand the section if it's collapsed
                if (contentElement.classList.contains('collapsed')) {
                    contentElement.classList.remove('collapsed');
                    toggleButton.classList.remove('collapsed');
                    // Save the expanded state
                    saveToggleState('toggle-event-definition', false);
                }
            }
            
            // Fetch the sample definition
            const response = await fetch(chrome.runtime.getURL('sample-event-definition.json'));
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${response.status} ${response.statusText}`);
            }
            
            const sampleDefinition = await response.json();
            const sampleJson = JSON.stringify(sampleDefinition, null, 2);
            
            // Set the textarea value
            eventDefinitionTextarea.value = sampleJson;
            
            // Validate the definition
            const isValid = validateEventDefinition(sampleJson);
            
            if (!isValid) {
                throw new Error('The sample definition is not valid. Please check the format.');
            }
            
            // Save the event definition to local storage (not sync storage)
            await chrome.storage.local.set({
                event_definition: sampleJson
            });
            
            // Explicitly send to background script to load
            chrome.runtime.sendMessage({
                action: 'load_event_definition',
                definition: sampleJson
            }, (response) => {
                if (response && response.success) {
                    // Populate the dropdown and select the first scenario
                    populateScenarioDropdown(response.scenarios);
                    
                    // Select the first scenario if available
                    if (response.scenarios && response.scenarios.length > 0 && scenarioSelect.options.length > 1) {
                        scenarioSelect.selectedIndex = 1; // Select the first scenario (index 0 is the placeholder)
                        handleScenarioSelect(); // Trigger the selection handler
                    }
                    
                    showSuccess('Sample definition loaded and first scenario selected');
                } else {
                    console.error('Failed to load event definition:', response?.error);
                    showError(`Failed to process sample: ${response?.error || 'Unknown error'}`);
                }
            });
            
            updateStatus();
            
        } catch (error) {
            console.error('Error loading sample definition:', error);
            showError(`Failed to load sample: ${error.message}`);
        } finally {
            // Re-enable button
            loadSampleButton.disabled = false;
            loadSampleButton.innerHTML = '<span class="btn-icon">📋</span>Load Sample Definition';
        }
    }
});