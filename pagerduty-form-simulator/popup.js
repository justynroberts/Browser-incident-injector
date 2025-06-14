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
    
    // Load event definition if exists
    const localResult = await chrome.storage.local.get(['event_definition']);
    if (localResult.event_definition) {
        console.log('[Event Definition] Found existing event definition, validating...');
        eventDefinitionTextarea.value = localResult.event_definition;
        validateEventDefinition(localResult.event_definition);
    } else {
        console.log('[Event Definition] No existing event definition found');
    }
    
    // Update scenario button state
    updateScenarioButtonState();
    
    // Make sure scenario controls visibility matches validation state
    const definition = eventDefinitionTextarea.value.trim();
    if (definition) {
        try {
            JSON.parse(definition);
            scenarioControls.style.display = 'block';
        } catch (e) {
            scenarioControls.style.display = 'none';
        }
    } else {
        scenarioControls.style.display = 'none';
    }
    
    // Check if event definition exists, if not, load the sample by default
    try {
        const localResult = await chrome.storage.local.get(['event_definition']);
        if (!localResult.event_definition) {
            console.log('[Incident Injector] No event definition found, loading sample by default');
            // Call the sample loading function but don't block the UI initialization
            handleLoadSample().catch(error => {
                console.error('[Incident Injector] Error auto-loading sample:', error);
                // Show a non-blocking error message
                showMessage('Failed to auto-load sample. You can try loading it manually.', 'error');
            });
        }
    } catch (error) {
        console.error('[Incident Injector] Error checking for event definition:', error);
    }

    // Event listeners
    extensionEnabledToggle.addEventListener('change', saveSettings);
    integrationKeyInput.addEventListener('input', handleKeyInput);
    integrationKeyInput.addEventListener('blur', saveSettings);
    alertMessageTextarea.addEventListener('input', saveSettings);
    showAlertCheckbox.addEventListener('change', saveSettings);
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
    loadSampleButton.addEventListener('click', handleLoadSample);
    
    // Add event listener for the Edit JSON button
    document.getElementById('edit-json').addEventListener('click', handleEditJson);
    
    // Add event listeners for save/load file buttons
    document.getElementById('save-to-file').addEventListener('click', handleSaveToFile);
    document.getElementById('load-from-file').addEventListener('click', handleLoadFromFile);
    
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
            if (showAlertCheckbox) showAlertCheckbox.checked = result.show_alert !== false; // Default to true
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
                show_alert: showAlertCheckbox.checked,
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
                    scenarioId: activeScenarioId
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
        console.log('[Event Definition] Updating scenario button state');
        
        chrome.storage.sync.get(['active_scenario_id', 'pagerduty_integration_key'], (result) => {
            const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
            const hasIntegrationKey = result.pagerduty_integration_key && result.pagerduty_integration_key.trim() !== '';
            
            // Button should be disabled if either condition is not met
            const shouldBeEnabled = hasActiveScenario && hasIntegrationKey;
            testScenarioButton.disabled = !shouldBeEnabled;
            
            // Update button appearance and tooltip based on state
            if (!hasActiveScenario) {
                testScenarioButton.title = 'Please select a scenario first';
                testScenarioButton.classList.add('disabled-with-reason');
                console.log('[Event Definition] Button disabled: No active scenario');
            } else if (!hasIntegrationKey) {
                testScenarioButton.title = 'Please configure PagerDuty integration key first';
                testScenarioButton.classList.add('disabled-with-reason');
                console.log('[Event Definition] Button disabled: No integration key');
            } else {
                testScenarioButton.title = 'Test the currently selected scenario';
                testScenarioButton.classList.remove('disabled-with-reason');
                console.log('[Event Definition] Button enabled: All requirements met');
            }
            
            // Also update the run scenario toggle if it exists
            if (runScenarioToggle) {
                runScenarioToggle.disabled = !hasActiveScenario;
                if (hasActiveScenario) {
                    // Restore the previous state or default to true
                    chrome.storage.sync.get(['run_scenario_on_submit'], (toggleResult) => {
                        runScenarioToggle.checked = toggleResult.run_scenario_on_submit !== false;
                    });
                } else {
                    runScenarioToggle.checked = false;
                }
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
                createAlertToggle.checked = result.show_alert !== false; // Default to true
                createAlertToggle.addEventListener('change', saveTriggerOptions);
            }
            if (runScenarioToggle) {
                runScenarioToggle.checked = result.run_scenario_on_submit === true;
                runScenarioToggle.disabled = !result.active_scenario_id;
            }
            if (add500ErrorToggle) add500ErrorToggle.checked = result.redirect_to_500 === true;
            if (continueDestinationToggle) continueDestinationToggle.checked = result.allow_form_continuation === true;
            
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
            show_alert: createAlertToggle ? createAlertToggle.checked : true,
            run_scenario_on_submit: runScenarioToggle ? runScenarioToggle.checked : false,
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
        console.log('[Event Definition] Validating event definition');
        
        if (!definitionJson) {
            console.warn('[Event Definition] Empty definition provided');
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
                console.log(`[Event Definition] Schema version: ${definition.schema_version}`);
            } else {
                console.warn('[Event Definition] No schema version specified');
            }
            
            // Basic validation - check for event_definitions (new schema) or scenarios (old schema)
            let hasValidDefinitions = false;
            let scenarioCount = 0;
            
            // Check new schema format
            if (definition.event_definitions && Array.isArray(definition.event_definitions)) {
                console.log(`[Event Definition] Found ${definition.event_definitions.length} event definitions`);
                
                // Check if at least one event definition has events
                for (const eventDef of definition.event_definitions) {
                    if (!eventDef.id) {
                        throw new Error(`Event definition at index ${scenarioCount} missing required 'id' field`);
                    }
                    
                    if (!eventDef.events || !Array.isArray(eventDef.events) || eventDef.events.length === 0) {
                        console.warn(`[Event Definition] Event definition '${eventDef.id}' has no events`);
                        continue;
                    }
                    
                    hasValidDefinitions = true;
                    scenarioCount++;
                }
                
                if (!hasValidDefinitions) {
                    throw new Error('No valid events found in any event definition');
                }
            }
            // Check old schema format
            else if (definition.scenarios && typeof definition.scenarios === 'object') {
                console.log('[Event Definition] Using legacy scenarios format');
                
                // Check if at least one scenario has events
                for (const scenarioId in definition.scenarios) {
                    const scenario = definition.scenarios[scenarioId];
                    if (!scenario.events || !Array.isArray(scenario.events) || scenario.events.length === 0) {
                        console.warn(`[Event Definition] Scenario '${scenarioId}' has no events`);
                        continue;
                    }
                    
                    hasValidDefinitions = true;
                    scenarioCount++;
                }
                
                if (!hasValidDefinitions) {
                    throw new Error('No valid events found in any scenario');
                }
            }
            else {
                throw new Error('Invalid format: No event definitions or scenarios found');
            }
            
            console.log(`[Event Definition] Validation successful: Found ${scenarioCount} valid scenarios`);
            
            // Update UI
            definitionValidation.textContent = `✓ Valid event definition format (${scenarioCount} scenarios)`;
            definitionValidation.className = 'validation-message valid';
            scenarioControls.style.display = 'block';
            
            // Send to background script to load
            chrome.runtime.sendMessage({
                action: 'load_event_definition',
                definition: definitionJson
            }, (response) => {
                if (response && response.success) {
                    console.log('[Event Definition] Successfully loaded into background script');
                    populateScenarioDropdown(response.scenarios);
                } else {
                    console.error('[Event Definition] Failed to load:', response?.error);
                    showError(`Failed to load event definition: ${response?.error || 'Unknown error'}`);
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
        console.log('[Event Definition] Populating scenarios:', scenarios);
        
        // Clear existing options except the first one
        while (scenarioSelect.options.length > 1) {
            scenarioSelect.remove(1);
        }
        
        if (!Array.isArray(scenarios) || scenarios.length === 0) {
            console.warn('[Event Definition] No scenarios available to populate');
            scenarioSelect.disabled = true;
            return;
        }
        
        scenarioSelect.disabled = false;
        
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
            } else {
                // If no previous selection, select the first scenario by default
                if (scenarioSelect.options.length > 1) {
                    scenarioSelect.selectedIndex = 1;
                    handleScenarioSelect();
                }
            }
            
            // Enable/disable run button based on selection
            updateScenarioButtonState();
        });
    }
    
    // Handle scenario selection
    function handleScenarioSelect() {
        console.log('[Event Definition] Handling scenario selection');
        const selectedOption = scenarioSelect.options[scenarioSelect.selectedIndex];
        
        // Show scenario details if available
        if (selectedOption && selectedOption.value) {
            console.log(`[Event Definition] Selected scenario: ${selectedOption.value}`);
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
                active_scenario_id: selectedOption.value,
                run_scenario_on_submit: true  // Enable scenario running by default
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Event Definition] Error saving scenario:', chrome.runtime.lastError);
                    return;
                }
                console.log(`[Event Definition] Set active scenario to: ${selectedOption.value}`);
                
                // Update run scenario toggle if it exists
                if (runScenarioToggle) {
                    runScenarioToggle.disabled = false;
                    runScenarioToggle.checked = true;
                }
                
                // Update test scenario button state
                testScenarioButton.disabled = false;
                testScenarioButton.title = 'Test the currently selected scenario';
                testScenarioButton.classList.remove('disabled-with-reason');
            });
        } else {
            console.log('[Event Definition] No scenario selected');
            scenarioResult.textContent = '';
            
            // Clear active scenario
            chrome.storage.sync.set({
                active_scenario_id: '',
                run_scenario_on_submit: false
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Event Definition] Error clearing scenario:', chrome.runtime.lastError);
                    return;
                }
                
                // Disable run scenario toggle if it exists
                if (runScenarioToggle) {
                    runScenarioToggle.disabled = true;
                    runScenarioToggle.checked = false;
                }
                
                // Disable test scenario button
                testScenarioButton.disabled = true;
                testScenarioButton.title = 'Please select a scenario first';
                testScenarioButton.classList.add('disabled-with-reason');
            });
        }
        
        // Update button state
        updateScenarioButtonState();
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
    
    // Handle saving event definition to file
    async function handleSaveToFile() {
        try {
            // Get the current event definition
            const eventDefinition = eventDefinitionTextarea.value.trim();
            
            if (!eventDefinition) {
                showError('No event definition to save');
                return;
            }
            
            // Validate JSON
            try {
                JSON.parse(eventDefinition);
            } catch (error) {
                showError(`Invalid JSON: ${error.message}`);
                return;
            }
            
            // Create a blob with the JSON content
            const blob = new Blob([eventDefinition], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Create a default filename based on current date/time
            const now = new Date();
            const defaultFilename = `pagerduty-scenario-${now.toISOString().slice(0, 10)}.json`;
            
            // Create a temporary link element to trigger the download
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            a.style.display = 'none';
            
            // Add to the DOM, click it, then remove it
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            showSuccess('Event definition saved to file');
        } catch (error) {
            console.error('Error saving to file:', error);
            showError(`Failed to save file: ${error.message}`);
        }
    }
    
    // Handle loading event definition from file
    function handleLoadFromFile() {
        try {
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            
            // Add event listener for when a file is selected
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                
                try {
                    // Read the file content
                    const content = await readFileContent(file);
                    
                    // Validate JSON
                    try {
                        JSON.parse(content);
                    } catch (error) {
                        showError(`Invalid JSON in file: ${error.message}`);
                        return;
                    }
                    
                    // Set the content in the textarea
                    eventDefinitionTextarea.value = content;
                    
                    // Validate and process the event definition
                    const isValid = validateEventDefinition(content);
                    
                    if (isValid) {
                        // Save to local storage
                        await chrome.storage.local.set({
                            event_definition: content
                        });
                        
                        showSuccess(`Event definition loaded from ${file.name}`);
                    }
                } catch (error) {
                    console.error('Error reading file:', error);
                    showError(`Failed to read file: ${error.message}`);
                }
                
                // Clean up
                document.body.removeChild(fileInput);
            });
            
            // Add to the DOM and trigger click
            document.body.appendChild(fileInput);
            fileInput.click();
        } catch (error) {
            console.error('Error loading from file:', error);
            showError(`Failed to load file: ${error.message}`);
        }
    }
    
    // Helper function to read file content
    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = (error) => {
                reject(error);
            };
            
            reader.readAsText(file);
        });
    }
});