// Incident Injector - Panel Script
// This script provides the functionality for the slide-out panel
(function() {
    'use strict';
    
    // Helper function to check if Chrome extension API is available
    function isExtensionContext() {
        try {
            // Check if Chrome API exists and is functional
            if (typeof chrome === 'undefined' || !chrome) {
                console.log('[Panel] Chrome object is undefined');
                return false;
            }
            
            // Use try-catch for each property access to avoid errors
            try {
                if (!chrome.storage) {
                    console.log('[Panel] chrome.storage is not available');
                    return false;
                }
            } catch (e) {
                console.log('[Panel] Error accessing chrome.storage:', e.message);
                return false;
            }
            
            try {
                if (!chrome.storage.sync) {
                    console.log('[Panel] chrome.storage.sync is not available');
                    return false;
                }
            } catch (e) {
                console.log('[Panel] Error accessing chrome.storage.sync:', e.message);
                return false;
            }
            
            try {
                if (!chrome.runtime) {
                    console.log('[Panel] chrome.runtime is not available');
                    return false;
                }
            } catch (e) {
                console.log('[Panel] Error accessing chrome.runtime:', e.message);
                return false;
            }
            
            // Check if functions exist
            try {
                if (typeof chrome.storage.sync.get !== 'function' ||
                    typeof chrome.storage.sync.set !== 'function') {
                    console.log('[Panel] Chrome storage sync functions not available');
                    return false;
                }
            } catch (e) {
                console.log('[Panel] Error checking chrome.storage.sync functions:', e.message);
                return false;
            }
            
            try {
                if (typeof chrome.runtime.sendMessage !== 'function') {
                    console.log('[Panel] Chrome runtime.sendMessage not available');
                    return false;
                }
            } catch (e) {
                console.log('[Panel] Error checking chrome.runtime.sendMessage:', e.message);
                return false;
            }
            
            // Try a simple test to see if the extension context is valid
            // If the extension was reloaded, this might throw an error
            try {
                chrome.runtime.id; // This will throw if context is invalidated
                console.log('[Panel] Extension context is valid');
                return true;
            } catch (contextError) {
                console.log('[Panel] Extension context invalidated:', contextError.message);
                return false;
            }
        } catch (e) {
            console.log('[Panel] Running in page context - Chrome APIs not available:', e.message);
            return false;
        }
    }
    
    // More permissive check for runtime features
    function hasRuntimeAPI() {
        try {
            // Check if chrome.runtime exists and has the methods we need
            return typeof chrome !== 'undefined' && 
                   chrome.runtime && 
                   typeof chrome.runtime.sendMessage === 'function';
        } catch (e) {
            console.log('[Panel] Chrome runtime API not available');
            return false;
        }
    }
    
    // Initialize panel when it's loaded
    function initializePanel() {
        
        // Wait for panel DOM to be ready
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) {
            console.error('[Panel] Panel element not found');
            return;
        }
        
        // Initialize panel functionality
        initializePanelFunctionality();
        
    }
    
    // Store loaded settings globally for use across functions
    let loadedSettings = {};
    
    // Initialize all panel functionality (adapted from popup.js)
    async function initializePanelFunctionality() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        try {
            // Load saved settings
            loadedSettings = await loadSettings();
            
            // Update status
            updateStatus();

            // Initialize toggle sections
            initializeToggleSections();
            
            // Ensure sections remain collapsed after initialization
            ensureSectionsCollapsed();
            
            // Initialize trigger options
            initializeTriggerOptions();
            
            // Initialize click interception
            initializeClickInterception();
            
            // Load event definition if exists
            const eventDefinitionTextarea = panel.querySelector('#event-definition');
            const scenarioControls = panel.querySelector('#scenario-controls');
            
            // Load event definition with fallback support
            let localResult = {};
            if (isExtensionContext()) {
                localResult = await chrome.storage.local.get(['event_definition']);
            } else {
                // Fallback: communicate through content script for local storage
                try {
                    const response = await new Promise((resolve, reject) => {
                        const messageHandler = (event) => {
                            if (event.data.action === 'load_local_settings_response' && event.data.source === 'incident-injector-content') {
                                window.removeEventListener('message', messageHandler);
                                resolve(event.data.response);
                            }
                        };
                        
                        window.addEventListener('message', messageHandler);
                        
                        window.postMessage({
                            action: 'load_local_settings_request',
                            source: 'incident-injector-panel'
                        }, '*');
                        
                        setTimeout(() => {
                            window.removeEventListener('message', messageHandler);
                            reject(new Error('Local settings load request timed out'));
                        }, 5000);
                    });
                    
                    if (response.success) {
                        localResult = response.settings;
                    }
                } catch (error) {
                    console.log('[Panel] Failed to load local settings via message relay:', error);
                }
            }
            
            if (localResult.event_definition) {
                eventDefinitionTextarea.value = localResult.event_definition;
                validateEventDefinition(localResult.event_definition);
            }
            
            // Update scenario button state
            updateScenarioButtonState();
            
            // Make sure scenario controls visibility matches validation state
            const definition = eventDefinitionTextarea ? eventDefinitionTextarea.value.trim() : '';
            if (definition) {
                try {
                    JSON.parse(definition);
                    if (scenarioControls) scenarioControls.style.display = 'block';
                } catch (e) {
                    if (scenarioControls) scenarioControls.style.display = 'none';
                }
            } else {
                if (scenarioControls) scenarioControls.style.display = 'none';
            }
            
            // Load sample if no event definition exists
            if (!localResult.event_definition) {
                loadSampleEventDefinition();
            }

            // Check for active scenarios and update UI
            checkForActiveScenarios();
            
        } catch (error) {
            console.error('[Panel] Error initializing panel functionality:', error);
        }
    }
    
    // Load settings (adapted from popup.js)
    async function loadSettings() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        try {
            let result = {};
            
            if (isExtensionContext()) {
                // Direct Chrome API access
                console.log('[Panel] Loading settings via direct Chrome API');
                result = await chrome.storage.sync.get([
                    'integration_key',
                    'crux_url',
                    'extension_enabled',
                    'show_alert',
                    'custom_alert_message',
                    'allow_form_continuation',
                    'redirect_to_500',
                    'trigger_crux',
                    'target_element_texts',
                    'trigger_on_click_enabled',
                    'run_scenario_on_submit',
                    'active_scenario_id'
                ]);
            } else {
                // Fallback: communicate through content script
                console.log('[Panel] Loading settings via message relay');
                const response = await new Promise((resolve, reject) => {
                    const messageHandler = (event) => {
                        if (event.data.action === 'settings_load_response' && event.data.source === 'incident-injector-content') {
                            window.removeEventListener('message', messageHandler);
                            resolve(event.data.response);
                        }
                    };
                    
                    window.addEventListener('message', messageHandler);
                    
                    // Send message to content script
                    window.postMessage({
                        action: 'load_settings_request',
                        source: 'incident-injector-panel'
                    }, '*');
                    
                    // Timeout after 10 seconds
                    setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error('Settings load request timed out'));
                    }, 10000);
                });
                
                if (!response.success) {
                    throw new Error(response.error || 'Failed to load settings');
                }
                
                result = response.settings;
            }
            
            console.log('[Panel] Loaded settings:', result);
            console.log('[Panel] Integration key from storage:', result.integration_key ? `${result.integration_key.length} chars` : 'not set');

            const extensionEnabledToggle = panel.querySelector('#extension-enabled');
            const integrationKeyInput = panel.querySelector('#integration-key');
            const cruxUrlInput = panel.querySelector('#crux-url');
            const alertMessageTextarea = panel.querySelector('#alert-message');
            const showAlertCheckbox = panel.querySelector('#option-create-alert');
            const allowContinuationCheckbox = panel.querySelector('#option-continue-destination');
            const redirectTo500Checkbox = panel.querySelector('#option-add-500-error');
            const triggerCruxCheckbox = panel.querySelector('#option-trigger-crux');
            const targetElementsTextarea = panel.querySelector('#target-elements');
            const triggerOnClickEnabledToggle = panel.querySelector('#trigger-on-click-enabled');
            const runScenarioToggle = panel.querySelector('#option-run-scenario');

            if (integrationKeyInput) integrationKeyInput.value = result.integration_key || '';
            if (cruxUrlInput) cruxUrlInput.value = result.crux_url || '';
            // Check localStorage first, then chrome.storage, then default to true
            const savedExtensionEnabled = localStorage.getItem('incident_injector_extension_enabled');
            let extensionEnabled = true; // Default to true (enabled)
            if (result.extension_enabled !== undefined) {
                extensionEnabled = result.extension_enabled;
            } else if (savedExtensionEnabled !== null) {
                extensionEnabled = savedExtensionEnabled === 'true';
            }
            if (extensionEnabledToggle) extensionEnabledToggle.checked = extensionEnabled;
            if (showAlertCheckbox) showAlertCheckbox.checked = result.show_alert === true;
            if (alertMessageTextarea) alertMessageTextarea.value = result.custom_alert_message || 'Incident Injected: Form submission failed! PagerDuty incident created.';
            if (allowContinuationCheckbox) allowContinuationCheckbox.checked = result.allow_form_continuation === true;
            if (redirectTo500Checkbox) redirectTo500Checkbox.checked = result.redirect_to_500 === true;
            if (triggerCruxCheckbox) triggerCruxCheckbox.checked = result.trigger_crux === true;
            if (targetElementsTextarea) {
                // Use sensible defaults if no value is stored
                const defaultTargets = "Submit, Login, Sign In, Register, Sign Up, Buy Now, Checkout, Purchase, Add to Cart";
                targetElementsTextarea.value = result.target_element_texts || defaultTargets;
            }
            // Check localStorage first, then chrome.storage, then default to true
            const savedTriggerOnClick = localStorage.getItem('incident_injector_trigger_on_click');
            let triggerOnClickEnabled = true; // Default to true (enabled)
            if (result.trigger_on_click_enabled !== undefined) {
                triggerOnClickEnabled = result.trigger_on_click_enabled;
            } else if (savedTriggerOnClick !== null) {
                triggerOnClickEnabled = savedTriggerOnClick === 'true';
            }
            if (triggerOnClickEnabledToggle) triggerOnClickEnabledToggle.checked = triggerOnClickEnabled;
            if (runScenarioToggle) runScenarioToggle.checked = result.run_scenario_on_submit !== false;

            // Add event listeners
            addEventListeners();
            
            // Update status after settings are loaded
            setTimeout(updateStatus, 100);
            
            return result;
            
        } catch (error) {
            console.error('[Panel] Error loading settings:', error);
            return {};
        }
    }
    
    // Add event listeners to panel elements
    function addEventListeners() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        // Extension toggle
        const extensionEnabledToggle = panel.querySelector('#extension-enabled');
        if (extensionEnabledToggle) {
            extensionEnabledToggle.addEventListener('change', async (e) => {
                const value = e.target.checked;
                console.log('[Panel] Extension enabled changed to:', value);

                // Always save to localStorage for persistence
                localStorage.setItem('incident_injector_extension_enabled', value.toString());

                // Try to save to chrome.storage
                try {
                    if (isExtensionContext()) {
                        await chrome.storage.sync.set({ extension_enabled: value });
                        console.log('[Panel] Extension enabled saved to both chrome.storage and localStorage');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, saved to localStorage only');
                    } else {
                        console.log('[Panel] Failed to save to chrome.storage:', error.message);
                    }
                }
            });
        }
        
        // Integration key - validation on input, auto-save on blur
        const integrationKeyInput = panel.querySelector('#integration-key');
        if (integrationKeyInput) {
            integrationKeyInput.addEventListener('input', (e) => {
                const key = e.target.value;
                console.log('[Panel] Integration key input:', key.length, 'characters');
                validateIntegrationKey(key);
            });

            // Auto-save when user leaves the field
            integrationKeyInput.addEventListener('blur', async (e) => {
                const key = e.target.value.trim(); // Trim whitespace
                console.log('[Panel] Integration key blur - attempting to save:', key.length, 'chars');

                try {
                    if (isExtensionContext()) {
                        await new Promise((resolve, reject) => {
                            chrome.storage.sync.set({ integration_key: key }, () => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    console.log('[Panel] ✅ Integration key auto-saved to chrome.storage:', `"${key}"`);
                                    resolve();
                                }
                            });
                        });

                        // Update the input field to trimmed value
                        e.target.value = key;

                        // Update status after a delay to ensure storage write completes
                        setTimeout(updateStatus, 250);
                    } else {
                        console.log('[Panel] ⚠️ Extension context not available, key will save on panel close');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, skipping auto-save');
                    } else {
                        console.log('[Panel] Failed to auto-save integration key:', error.message);
                    }
                }
            });

            // Also save on change as backup
            integrationKeyInput.addEventListener('change', async (e) => {
                const key = e.target.value.trim(); // Trim whitespace
                console.log('[Panel] Integration key changed - attempting to save:', key.length, 'chars');

                try {
                    if (isExtensionContext()) {
                        await new Promise((resolve, reject) => {
                            chrome.storage.sync.set({ integration_key: key }, () => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    console.log('[Panel] ✅ Integration key auto-saved via change event:', `"${key}"`);
                                    resolve();
                                }
                            });
                        });

                        // Update the input field to trimmed value
                        e.target.value = key;

                        // Update status after a delay to ensure storage write completes
                        setTimeout(updateStatus, 250);
                    }
                } catch (error) {
                    console.log('[Panel] Change event save failed:', error.message);
                }
            });
        }

        // Crux URL - auto-save on blur
        const cruxUrlInput = panel.querySelector('#crux-url');
        if (cruxUrlInput) {
            // Auto-save when user leaves the field
            cruxUrlInput.addEventListener('blur', async (e) => {
                const url = e.target.value;
                try {
                    if (isExtensionContext()) {
                        await chrome.storage.sync.set({ crux_url: url });
                        console.log('[Panel] Crux URL auto-saved');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, skipping auto-save');
                    } else {
                        console.log('[Panel] Failed to auto-save Crux URL:', error.message);
                    }
                }
            });
        }

        // Save integration key button
        const saveKeyButton = panel.querySelector('#save-key');
        if (saveKeyButton) {
            saveKeyButton.addEventListener('click', async () => {
                const key = integrationKeyInput ? integrationKeyInput.value : '';
                console.log('[Panel] Save button clicked, key length:', key.length);
                console.log('[Panel] Key value:', key); // Debug: show actual key value
                
                const validation = panel.querySelector('#key-validation');
                
                try {
                    let saveResult = false;
                    
                    if (isExtensionContext()) {
                        // Direct Chrome API access with additional safety check
                        console.log('[Panel] Using direct Chrome API for key save');
                        try {
                            // Double-check that chrome object and storage.sync are actually accessible
                            if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.sync || typeof chrome.storage.sync.set !== 'function') {
                                console.log('[Panel] Chrome object or storage API not available, will use message relay');
                                throw new Error('Chrome storage API not available');
                            }
                            
                            await new Promise((resolve, reject) => {
                                chrome.storage.sync.set({ integration_key: key }, () => {
                                    if (chrome.runtime && chrome.runtime.lastError) {
                                        const errorMsg = chrome.runtime.lastError.message;
                                        if (errorMsg.includes('Extension context invalidated')) {
                                            // Extension was reloaded, need to use message relay
                                            console.log('[Panel] Extension context invalidated, will try message relay');
                                            reject(new Error('CONTEXT_INVALIDATED'));
                                        } else {
                                            reject(new Error(errorMsg));
                                        }
                                    } else {
                                        console.log('[Panel] Integration key saved successfully via direct API');
                                        resolve();
                                    }
                                });
                            });
                            saveResult = true;
                        } catch (directApiError) {
                            console.log('[Panel] Direct Chrome API failed:', directApiError.message);
                            // Fall through to message relay method below
                            saveResult = false;
                        }
                    }
                    
                    if (!saveResult) {
                        // Fallback: communicate through content script
                        console.log('[Panel] Using message relay for key save');
                        const response = await new Promise((resolve, reject) => {
                            const messageHandler = (event) => {
                                if (event.data.action === 'key_save_response' && event.data.source === 'incident-injector-content') {
                                    window.removeEventListener('message', messageHandler);
                                    resolve(event.data.response);
                                }
                            };
                            
                            window.addEventListener('message', messageHandler);
                            
                            // Send message to content script
                            window.postMessage({
                                action: 'save_key_request',
                                source: 'incident-injector-panel',
                                key: key
                            }, '*');
                            
                            // Timeout after 10 seconds
                            setTimeout(() => {
                                window.removeEventListener('message', messageHandler);
                                reject(new Error('Key save request timed out'));
                            }, 10000);
                        });
                        
                        saveResult = response.success;
                        if (!saveResult) {
                            throw new Error(response.error || 'Failed to save key');
                        }
                    }
                    
                    if (saveResult) {
                        console.log('[Panel] Integration key saved successfully');
                        
                        // Show confirmation
                        if (validation) {
                            const originalText = validation.textContent;
                            const originalClass = validation.className;
                            validation.textContent = 'Saved!';
                            validation.className = 'validation-message valid';
                            setTimeout(() => {
                                validation.textContent = originalText;
                                validation.className = originalClass;
                            }, 2000);
                        }
                        
                        // Force update status after save
                        setTimeout(updateStatus, 300);
                    }
                    
                } catch (error) {
                    console.error('[Panel] Error saving integration key:', error);
                    
                    // Handle extension context invalidated error
                    if (error.message === 'CONTEXT_INVALIDATED') {
                        console.log('[Panel] Extension context invalidated, trying message relay fallback');
                        try {
                            // Try message relay as fallback
                            const response = await new Promise((resolve, reject) => {
                                const messageHandler = (event) => {
                                    if (event.data.action === 'key_save_response' && event.data.source === 'incident-injector-content') {
                                        window.removeEventListener('message', messageHandler);
                                        resolve(event.data.response);
                                    }
                                };
                                
                                window.addEventListener('message', messageHandler);
                                
                                // Send message to content script
                                window.postMessage({
                                    action: 'save_key_request',
                                    source: 'incident-injector-panel',
                                    key: key
                                }, '*');
                                
                                // Timeout after 10 seconds
                                setTimeout(() => {
                                    window.removeEventListener('message', messageHandler);
                                    reject(new Error('Key save request timed out'));
                                }, 10000);
                            });
                            
                            if (response.success) {
                                if (validation) {
                                    validation.textContent = 'Saved via refresh!';
                                    validation.className = 'validation-message valid';
                                    setTimeout(() => {
                                        const originalText = validation.textContent;
                                        const originalClass = validation.className;
                                        validation.textContent = 'Valid integration key format';
                                        validation.className = 'validation-message valid';
                                    }, 2000);
                                }
                                setTimeout(updateStatus, 300);
                            } else {
                                throw new Error(response.error || 'Message relay save failed');
                            }
                        } catch (relayError) {
                            if (validation) {
                                validation.textContent = 'Extension reloaded - please refresh page to continue';
                                validation.className = 'validation-message invalid';
                                
                                // Add a refresh button
                                setTimeout(() => {
                                    const refreshButton = document.createElement('button');
                                    refreshButton.textContent = 'Refresh Page';
                                    refreshButton.className = 'btn btn-secondary';
                                    refreshButton.style.marginTop = '8px';
                                    refreshButton.style.width = '100%';
                                    refreshButton.onclick = () => window.location.reload();
                                    validation.appendChild(refreshButton);
                                }, 1000);
                            }
                        }
                    } else {
                        // Regular error handling
                        if (validation) {
                            validation.textContent = 'Save failed: ' + error.message;
                            validation.className = 'validation-message invalid';
                        }
                    }
                }
            });
        }
        
        
        // Note: Alert message now has explicit save button instead of auto-save
        
        // Load sample button
        const loadSampleButton = panel.querySelector('#load-sample');
        if (loadSampleButton) {
            loadSampleButton.addEventListener('click', loadSampleEventDefinition);
        }
        
        // Save/Load file buttons
        const saveToFileButton = panel.querySelector('#save-to-file');
        const loadFromFileButton = panel.querySelector('#load-from-file');
        if (saveToFileButton) {
            saveToFileButton.addEventListener('click', handleSaveToFile);
        }
        if (loadFromFileButton) {
            loadFromFileButton.addEventListener('click', handleLoadFromFile);
        }
        
        // Run scenario quick button
        const runScenarioQuickButton = panel.querySelector('#run-scenario-quick');
        if (runScenarioQuickButton) {
            runScenarioQuickButton.addEventListener('click', runCurrentScenario);
        }
        
        // Event definition textarea
        const eventDefinitionTextarea = panel.querySelector('#event-definition');
        if (eventDefinitionTextarea) {
            eventDefinitionTextarea.addEventListener('input', async (e) => {
                const definition = e.target.value;
                
                // Save event definition with fallback support
                try {
                    if (isExtensionContext()) {
                        chrome.storage.local.set({ event_definition: definition });
                    } else {
                        // Fallback: save via message relay
                        window.postMessage({
                            action: 'save_event_definition_request',
                            source: 'incident-injector-panel',
                            eventDefinition: definition
                        }, '*');
                    }
                } catch (error) {
                    console.log('[Panel] Failed to auto-save event definition:', error);
                }
                
                validateEventDefinition(definition);
            });
        }
        
        // Target elements auto-save on change (no button needed)
        const targetElementsTextarea = panel.querySelector('#target-elements');

        if (targetElementsTextarea) {
            console.log('[Panel] Adding target elements auto-save listener');

            // Auto-save on blur (when user leaves the field)
            targetElementsTextarea.addEventListener('blur', async () => {
                const value = targetElementsTextarea.value;
                console.log('[Panel] Saving target elements:', value);

                // Auto-save to storage (silent, no UI feedback)
                try {
                    if (isExtensionContext()) {
                        await chrome.storage.sync.set({ target_element_texts: value });
                        console.log('[Panel] Target elements auto-saved successfully');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, skipping auto-save');
                        return; // Exit early
                    }
                    console.log('[Panel] Failed to auto-save target_element_texts:', error.message);
                }

                // If direct save failed or not in extension context, try message relay
                if (!isExtensionContext()) {
                    console.log('[Panel] Extension context not available - using message relay');

                    // Use message relay to save
                    try {
                        const response = await new Promise((resolve, reject) => {
                            const messageHandler = (event) => {
                                if (event.data.action === 'target_elements_save_response' && event.data.source === 'incident-injector-content') {
                                    window.removeEventListener('message', messageHandler);
                                    resolve(event.data.response);
                                }
                            };

                            window.addEventListener('message', messageHandler);
                            
                            window.postMessage({
                                action: 'save_target_elements_request',
                                source: 'incident-injector-panel',
                                targetElements: value
                            }, '*');
                            
                            // Timeout after 5 seconds
                            setTimeout(() => {
                                window.removeEventListener('message', messageHandler);
                                reject(new Error('Save request timed out'));
                            }, 5000);
                        });
                        
                        if (response.success) {
                            console.log('[Panel] Target elements auto-saved via message relay');
                        } else {
                            console.log('[Panel] Auto-save failed:', response.error);
                        }
                    } catch (relayError) {
                        console.log('[Panel] Message relay auto-save failed:', relayError);
                    }
                }
                
                // Notify content script of configuration change
                const triggerEnabled = panel.querySelector('#trigger-on-click-enabled')?.checked || false;
                console.log('[Panel] Sending click config update - enabled:', triggerEnabled, 'targetElements:', value);
                window.postMessage({
                    action: 'update_click_config',
                    source: 'incident-injector-panel',
                    enabled: triggerEnabled,
                    targetElements: value
                }, '*');
            });
        }
        
        // Alert message auto-save on blur (no button needed)
        const alertMessageTextarea = panel.querySelector('#alert-message');

        if (alertMessageTextarea) {
            console.log('[Panel] Adding alert message auto-save listener');
            alertMessageTextarea.addEventListener('blur', async () => {
                const value = alertMessageTextarea.value;
                console.log('[Panel] Saving alert message:', value);

                try {
                    if (isExtensionContext()) {
                        await chrome.storage.sync.set({ custom_alert_message: value });
                        console.log('[Panel] Alert message auto-saved successfully');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, skipping auto-save');
                        return; // Exit early
                    }
                    console.log('[Panel] Failed to auto-save custom_alert_message:', error.message);
                }

                // If not in extension context, try message relay
                if (!isExtensionContext()) {
                    console.log('[Panel] Extension context not available - using message relay for alert message');
                    
                    // Use message relay to save alert message
                    try {
                        const response = await new Promise((resolve, reject) => {
                            const messageHandler = (event) => {
                                if (event.data.action === 'alert_message_save_response' && event.data.source === 'incident-injector-content') {
                                    window.removeEventListener('message', messageHandler);
                                    resolve(event.data.response);
                                }
                            };
                            
                            window.addEventListener('message', messageHandler);
                            
                            window.postMessage({
                                action: 'save_alert_message_request',
                                source: 'incident-injector-panel',
                                alertMessage: value
                            }, '*');
                            
                            // Timeout after 5 seconds
                            setTimeout(() => {
                                window.removeEventListener('message', messageHandler);
                                reject(new Error('Save request timed out'));
                            }, 5000);
                        });
                        
                        if (response.success) {
                            console.log('[Panel] Alert message saved via message relay');
                            if (alertMessageValidation) {
                                alertMessageValidation.textContent = 'Alert message saved successfully';
                                alertMessageValidation.className = 'validation-message valid';
                                setTimeout(() => {
                                    alertMessageValidation.textContent = '';
                                    alertMessageValidation.className = 'validation-message';
                                }, 3000);
                            }
                        } else {
                            throw new Error(response.error || 'Failed to save alert message');
                        }
                    } catch (relayError) {
                        console.log('[Panel] Message relay save failed:', relayError);
                        if (alertMessageValidation) {
                            alertMessageValidation.textContent = 'Failed to save: ' + relayError.message;
                            alertMessageValidation.className = 'validation-message error';
                        }
                    }
                }
            });
        }
        
        // Trigger options save button
        const saveTriggerOptionsButton = panel.querySelector('#save-trigger-options');
        const triggerOptionsValidation = panel.querySelector('#trigger-options-validation');
        
        if (saveTriggerOptionsButton) {
            console.log('[Panel] Adding trigger options save button listener');
            saveTriggerOptionsButton.addEventListener('click', async () => {
                console.log('[Panel] Saving trigger options...');
                
                // Get all trigger option values
                const showAlert = panel.querySelector('#option-create-alert')?.checked || false;
                const runScenario = panel.querySelector('#option-run-scenario')?.checked || false;
                const add500Error = panel.querySelector('#option-add-500-error')?.checked || false;
                const continueDestination = panel.querySelector('#option-continue-destination')?.checked || false;
                
                console.log('[Panel] Trigger options to save:', {
                    showAlert,
                    runScenario,
                    add500Error,
                    continueDestination
                });
                
                if (isExtensionContext()) {
                    try {
                        await chrome.storage.sync.set({
                            show_alert: showAlert,
                            run_scenario_on_submit: runScenario,
                            redirect_to_500: add500Error,
                            allow_form_continuation: continueDestination
                        });
                        console.log('[Panel] Trigger options saved to storage successfully');
                        
                        // Show success message
                        if (triggerOptionsValidation) {
                            triggerOptionsValidation.textContent = 'Trigger options saved successfully';
                            triggerOptionsValidation.className = 'validation-message valid';
                            setTimeout(() => {
                                triggerOptionsValidation.textContent = '';
                                triggerOptionsValidation.className = 'validation-message';
                            }, 3000);
                        }
                    } catch (error) {
                        console.log('[Panel] Failed to save trigger options:', error);
                        
                        if (triggerOptionsValidation) {
                            triggerOptionsValidation.textContent = 'Failed to save: ' + error.message;
                            triggerOptionsValidation.className = 'validation-message error';
                        }
                    }
                } else {
                    console.log('[Panel] Extension context not available - using message relay for trigger options');
                    
                    // Use message relay to save trigger options
                    try {
                        const response = await new Promise((resolve, reject) => {
                            const messageHandler = (event) => {
                                if (event.data.action === 'trigger_options_save_response' && event.data.source === 'incident-injector-content') {
                                    window.removeEventListener('message', messageHandler);
                                    resolve(event.data.response);
                                }
                            };
                            
                            window.addEventListener('message', messageHandler);
                            
                            window.postMessage({
                                action: 'save_trigger_options_request',
                                source: 'incident-injector-panel',
                                options: {
                                    show_alert: showAlert,
                                    run_scenario_on_submit: runScenario,
                                    redirect_to_500: add500Error,
                                    allow_form_continuation: continueDestination
                                }
                            }, '*');
                            
                            // Timeout after 5 seconds
                            setTimeout(() => {
                                window.removeEventListener('message', messageHandler);
                                reject(new Error('Save request timed out'));
                            }, 5000);
                        });
                        
                        if (response.success) {
                            console.log('[Panel] Trigger options saved via message relay');
                            if (triggerOptionsValidation) {
                                triggerOptionsValidation.textContent = 'Trigger options saved successfully';
                                triggerOptionsValidation.className = 'validation-message valid';
                                setTimeout(() => {
                                    triggerOptionsValidation.textContent = '';
                                    triggerOptionsValidation.className = 'validation-message';
                                }, 3000);
                            }
                        } else {
                            throw new Error(response.error || 'Failed to save trigger options');
                        }
                    } catch (relayError) {
                        console.log('[Panel] Message relay save failed:', relayError);
                        if (triggerOptionsValidation) {
                            triggerOptionsValidation.textContent = 'Failed to save: ' + relayError.message;
                            triggerOptionsValidation.className = 'validation-message error';
                        }
                    }
                }
            });
        }
        
        // Save All Settings button removed - now using auto-save on panel close
        
        // Panel close button
        const panelCloseButton = panel.querySelector('#panel-close');
        if (panelCloseButton) {
            panelCloseButton.addEventListener('click', async () => {
                // Auto-save all settings before closing
                await autoSaveAllSettings();
                // Send message to content script to hide panel
                window.postMessage({ action: 'hide_panel', source: 'incident-injector-panel' }, '*');
            });
        }
        
        // Help modal
        const helpLink = panel.querySelector('#help-link');
        const setupLink = panel.querySelector('#setup-link');
        const helpModal = panel.querySelector('#help-modal');
        const closeModal = panel.querySelector('.close');
        
        if (helpLink && helpModal) {
            helpLink.addEventListener('click', (e) => {
                e.preventDefault();
                helpModal.style.display = 'block';
            });
        }
        
        if (setupLink && helpModal) {
            setupLink.addEventListener('click', (e) => {
                e.preventDefault();
                helpModal.style.display = 'block';
            });
        }
        
        if (closeModal && helpModal) {
            closeModal.addEventListener('click', () => {
                helpModal.style.display = 'none';
            });
        }
        
        // Close modal when clicking outside
        if (helpModal) {
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) {
                    helpModal.style.display = 'none';
                }
            });
        }
    }
    
    // Update status (adapted from popup.js)
    async function updateStatus() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const statusDot = panel.querySelector('#status-dot');
        const statusText = panel.querySelector('#status-text');
        
        if (!isExtensionContext()) {
            // Request status from content script
            window.postMessage({
                action: 'request_status',
                source: 'incident-injector-panel'
            }, '*');
            
            if (statusDot && statusText) {
                statusDot.className = 'status-dot warning';
                statusText.textContent = 'Loading Status...';
            }
            return;
        }
        
        try {
            let result = {};

            if (isExtensionContext()) {
                // Direct Chrome API access with additional debugging
                result = await new Promise((resolve, reject) => {
                    chrome.storage.sync.get(['integration_key', 'extension_enabled'], (storageResult) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            console.log('[Panel] Raw storage result:', storageResult);
                            resolve(storageResult);
                        }
                    });
                });
            } else {
                // Fallback: communicate through content script
                const response = await new Promise((resolve, reject) => {
                    const messageHandler = (event) => {
                        if (event.data.action === 'settings_load_response' && event.data.source === 'incident-injector-content') {
                            window.removeEventListener('message', messageHandler);
                            resolve(event.data.response);
                        }
                    };
                    
                    window.addEventListener('message', messageHandler);
                    
                    // Send message to content script
                    window.postMessage({
                        action: 'load_settings_request',
                        source: 'incident-injector-panel'
                    }, '*');
                    
                    // Timeout after 5 seconds for status updates
                    setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error('Status update request timed out'));
                    }, 5000);
                });
                
                if (response.success) {
                    result = response.settings;
                } else {
                    throw new Error(response.error || 'Failed to get status');
                }
            }
            
            console.log('[Panel] Storage result for status update:', result);
            console.log('[Panel] Integration key:', result.integration_key ? `${result.integration_key.length} chars` : 'not set');
            const hasKey = result.integration_key && result.integration_key.trim().length > 0; // Just check if key exists, not length
            const enabled = result.extension_enabled !== false;
            console.log('[Panel] Has key:', hasKey, 'Extension enabled:', enabled);
            
            if (statusDot && statusText) {
                if (!enabled) {
                    statusDot.className = 'status-dot inactive';
                    statusText.textContent = 'Disabled';
                } else if (!hasKey) {
                    statusDot.className = 'status-dot warning';
                    statusText.textContent = 'No Integration Key';
                } else {
                    statusDot.className = 'status-dot active';
                    statusText.textContent = 'Ready';
                }
            }
        } catch (error) {
            console.error('[Panel] Error updating status:', error);
            if (statusDot && statusText) {
                statusDot.className = 'status-dot warning';
                statusText.textContent = 'Status Update Error';
            }
        }
        
        // Update last incident time
        if (isExtensionContext()) {
            try {
                chrome.storage.local.get(['last_incident_time'], (result) => {
                    const lastIncidentSpan = panel.querySelector('#last-incident');
                    if (lastIncidentSpan) {
                    if (result.last_incident_time) {
                        const date = new Date(result.last_incident_time);
                        lastIncidentSpan.textContent = date.toLocaleString();
                    } else {
                        lastIncidentSpan.textContent = 'Never';
                    }
                }
            });
            } catch (error) {
                console.log('[Panel] Error updating last incident time:', error.message);
            }
        }
    }
    
    // Initialize toggle sections
    function initializeToggleSections() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const toggleButtons = panel.querySelectorAll('.toggle-button');
        
        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const isCollapsed = button.classList.contains('collapsed');
                const targetId = button.id.replace('toggle-', '') + '-content';
                const targetSection = panel.querySelector('#' + targetId);
                
                if (targetSection) {
                    if (isCollapsed) {
                        // Expand
                        button.classList.remove('collapsed');
                        targetSection.classList.remove('collapsed');
                    } else {
                        // Collapse
                        button.classList.add('collapsed');
                        targetSection.classList.add('collapsed');
                    }
                }
            });
        });
    }
    
    // Ensure all sections remain collapsed by default
    function ensureSectionsCollapsed() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        // Get all sections that should be collapsed by default
        const collapsibleSections = [
            { button: '#toggle-pagerduty-config', content: '#pagerduty-config-content' },
            { button: '#toggle-alert-config', content: '#alert-config-content' },
            { button: '#toggle-event-definition', content: '#event-definition-content' },
            { button: '#toggle-target-config', content: '#target-config-content' }
        ];
        
        collapsibleSections.forEach(section => {
            const toggleButton = panel.querySelector(section.button);
            const contentDiv = panel.querySelector(section.content);
            
            if (toggleButton && contentDiv) {
                // Only add collapsed class if it's not already there
                if (!toggleButton.classList.contains('collapsed')) {
                    toggleButton.classList.add('collapsed');
                }
                
                if (!contentDiv.classList.contains('collapsed')) {
                    contentDiv.classList.add('collapsed');
                }
            }
        });
        
        console.log('[Panel] Ensured all sections are collapsed by default');
    }
    
    // Initialize trigger options (now uses explicit save buttons instead of auto-save)
    function initializeTriggerOptions() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        console.log('[Panel] Trigger options initialized - using explicit save buttons');
        // Note: Auto-save listeners removed - trigger options now require explicit save button clicks
    }
    
    // Initialize click interception
    function initializeClickInterception() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const triggerOnClickEnabledToggle = panel.querySelector('#trigger-on-click-enabled');
        const clickInterceptionConfig = panel.querySelector('#click-interception-config');
        const targetElementsTextarea = panel.querySelector('#target-elements');
        
        // Show/hide click config when toggle changes and notify content script
        function updateClickConfig() {
            if (!triggerOnClickEnabledToggle) return;
            
            const isEnabled = triggerOnClickEnabledToggle.checked;
            if (clickInterceptionConfig) {
                clickInterceptionConfig.style.display = isEnabled ? 'block' : 'none';
            }
            console.log('[Panel] Click config updated:', {
                isEnabled: isEnabled,
                display: clickInterceptionConfig ? clickInterceptionConfig.style.display : 'N/A'
            });
            
            // Notify content script about configuration change
            window.postMessage({
                action: 'update_click_config',
                source: 'incident-injector-panel',
                enabled: isEnabled,
                targetElements: targetElementsTextarea ? targetElementsTextarea.value : ''
            }, '*');
        }
        
        if (triggerOnClickEnabledToggle && clickInterceptionConfig) {
            
            triggerOnClickEnabledToggle.addEventListener('change', async (e) => {
                const value = e.target.checked;
                console.log('[Panel] Trigger on click enabled changed to:', value);

                // Always save to localStorage for persistence
                localStorage.setItem('incident_injector_trigger_on_click', value.toString());

                // Try to save to chrome.storage
                try {
                    if (isExtensionContext()) {
                        await chrome.storage.sync.set({ trigger_on_click_enabled: value });
                        console.log('[Panel] Trigger on click enabled saved to both chrome.storage and localStorage');
                    }
                } catch (error) {
                    // Silently handle extension context invalidation
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        console.log('[Panel] Extension was reloaded, saved to localStorage only');
                    } else {
                        console.log('[Panel] Failed to save to chrome.storage:', error.message);
                    }
                }
                updateClickConfig();
            });
            
            // Set initial state after small delay to ensure settings are loaded
            setTimeout(() => {
                updateClickConfig();
                // Debug log the initial state
                console.log('[Panel] Click interception initialized:', {
                    toggleChecked: triggerOnClickEnabledToggle ? triggerOnClickEnabledToggle.checked : 'not found',
                    configVisible: clickInterceptionConfig ? clickInterceptionConfig.style.display : 'not found'
                });
            }, 200);
            
            // Note: Target elements event listener is handled in the main addEventListeners function
            // to avoid duplicate listeners and ensure it works even if this function doesn't run
        }
    }
    
    // Validate integration key
    function validateIntegrationKey(key) {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const keyValidation = panel.querySelector('#key-validation');
        if (!keyValidation) return;
        
        if (!key) {
            keyValidation.textContent = '';
            keyValidation.className = 'validation-message';
        } else if (key.length !== 32 || !/^[a-zA-Z0-9]+$/.test(key)) {
            keyValidation.textContent = 'Invalid format. Must be 32 alphanumeric characters.';
            keyValidation.className = 'validation-message invalid';
        } else {
            keyValidation.textContent = 'Valid integration key format';
            keyValidation.className = 'validation-message valid';
            
            // Keep the section open after saving - user can manually collapse if desired
        }
    }
    
    // Run current scenario
    async function runCurrentScenario() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const resultDiv = panel.querySelector('#quick-action-result');
        if (!resultDiv) return;
        
        try {
            // Note: We don't need to check isExtensionContext() here because
            // we have a fallback message relay system in place
            
            // Get the current selected scenario
            const scenarioSelect = panel.querySelector('#scenario-select');
            const eventDefinitionTextarea = panel.querySelector('#event-definition');
            
            if (!eventDefinitionTextarea || !eventDefinitionTextarea.value.trim()) {
                resultDiv.textContent = 'No event definition loaded';
                resultDiv.className = 'test-result error';
                return;
            }
            
            let selectedScenarioId = null;
            if (scenarioSelect && scenarioSelect.value) {
                selectedScenarioId = scenarioSelect.value;
            }
            
            // If no scenario is explicitly selected, try to use the first available one
            if (!selectedScenarioId && scenarioSelect && scenarioSelect.options.length > 1) {
                selectedScenarioId = scenarioSelect.options[1].value; // Index 0 is "-- Select a scenario --"
                scenarioSelect.value = selectedScenarioId;
                console.log('[Panel] Auto-selected first scenario:', selectedScenarioId);
            }
            
            if (!selectedScenarioId) {
                resultDiv.textContent = 'No scenarios available - please load an event definition first';
                resultDiv.className = 'test-result error';
                return;
            }
            
            resultDiv.textContent = 'Running scenario...';
            resultDiv.className = 'test-result';
            
            console.log('[Panel] Attempting to run scenario:', selectedScenarioId);
            console.log('[Panel] Extension context available:', isExtensionContext());
            console.log('[Panel] Chrome runtime available:', hasRuntimeAPI());
            console.log('[Panel] Event definition length:', eventDefinitionTextarea.value?.length || 0);
            console.log('[Panel] Event definition preview:', eventDefinitionTextarea.value?.substring(0, 200) + '...');
            
            // Send message to background script to run the scenario
            let response;
            
            // Always use message relay to avoid Chrome API issues
            console.log('[Panel] Using message relay for scenario execution');
            
            // Communicate through content script
            response = await new Promise((resolve, reject) => {
                let timeoutId;
                const messageHandler = (event) => {
                    console.log('[Panel] Received message:', event.data);
                    if (event.data.action === 'scenario_run_response' && event.data.source === 'incident-injector-content') {
                        console.log('[Panel] Got scenario response:', event.data.response);
                        clearTimeout(timeoutId);
                        window.removeEventListener('message', messageHandler);
                        resolve(event.data.response);
                    }
                };
                
                window.addEventListener('message', messageHandler);
                
                // Send message to content script
                console.log('[Panel] Sending scenario run request');
                window.postMessage({
                    action: 'run_scenario_request',
                    source: 'incident-injector-panel',
                    scenarioId: selectedScenarioId,
                    options: {
                        eventDefinition: eventDefinitionTextarea.value,
                        url: window.location.href,
                        timestamp: new Date().toISOString()
                    }
                }, '*');
                
                // Timeout after 60 seconds (increased timeout for longer scenarios)
                timeoutId = setTimeout(() => {
                    console.log('[Panel] Scenario run timed out after 60 seconds');
                    window.removeEventListener('message', messageHandler);
                    reject(new Error('Scenario run request timed out but may still be running in background'));
                }, 60000);
            });
            
            if (response && response.success) {
                resultDiv.textContent = 'Scenario executed successfully!';
                resultDiv.className = 'test-result success';
            } else {
                resultDiv.textContent = response?.error || 'Failed to run scenario';
                resultDiv.className = 'test-result error';
            }
        } catch (error) {
            console.log('[Panel] Scenario execution error:', error);
            // If it's a timeout error, show a more helpful message
            if (error.message.includes('timed out')) {
                resultDiv.textContent = 'Scenario may still be running in background. Check browser console for updates.';
                resultDiv.className = 'test-result warning';
            } else if (error.message.includes('Extension context invalidated') || error.message.includes('CONTEXT_INVALIDATED')) {
                resultDiv.innerHTML = 'Extension reloaded - please refresh page to continue<br><button onclick="window.location.reload()" class="btn btn-secondary" style="margin-top:8px;width:100%">Refresh Page</button>';
                resultDiv.className = 'test-result error';
            } else {
                resultDiv.textContent = 'Error: ' + error.message;
                resultDiv.className = 'test-result error';
            }
        }
    }
    
    // Load sample event definition
    async function loadSampleEventDefinition() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const eventDefinitionTextarea = panel.querySelector('#event-definition');
        const definitionValidation = panel.querySelector('#definition-validation');
        if (!eventDefinitionTextarea) return;
        
        try {
            
            // Since we don't have Chrome API access, request the content script to load it
            const loadPromise = new Promise((resolve, reject) => {
                // Listen for response from content script
                const messageHandler = (event) => {
                    if (event.data.action === 'sample_definition_loaded' && event.data.source === 'incident-injector-content') {
                        window.removeEventListener('message', messageHandler);
                        if (event.data.success) {
                            resolve(event.data.definition);
                        } else {
                            reject(new Error(event.data.error || 'Failed to load sample definition'));
                        }
                    }
                };
                
                window.addEventListener('message', messageHandler);
                
                // Request content script to load the sample definition
                window.postMessage({
                    action: 'load_sample_definition',
                    source: 'incident-injector-panel'
                }, '*');
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    window.removeEventListener('message', messageHandler);
                    reject(new Error('Timeout loading sample definition'));
                }, 10000);
            });
            
            const sampleDefinition = await loadPromise;
            eventDefinitionTextarea.value = sampleDefinition;
            
            // Save to storage if possible
            if (isExtensionContext()) {
                await chrome.storage.local.set({ event_definition: sampleDefinition });
            }
            
            validateEventDefinition(sampleDefinition);
            
        } catch (error) {
            console.error('[Panel] Error loading sample event definition:', error);
            
            // Fallback: Load a basic sample using new schema format
            const fallbackDefinition = {
                schema_version: "1.0",
                global_config: {
                    variables: {
                        environment: "test"
                    }
                },
                event_definitions: [
                    {
                        id: "sample_scenario",
                        name: "Sample Incident Scenario",
                        description: "Basic sample scenario for testing",
                        variables: {
                            incident_key: "SAMPLE-{{incident_id}}",
                            component: "sample-component",
                            application: "Sample Application"
                        },
                        events: [
                            {
                                type: "trigger",
                                summary: "Sample incident triggered from extension",
                                severity: "error",
                                component: "{{component}}",
                                group: "testing",
                                class: "extension-test",
                                custom_details: {
                                    message: "This is a sample incident for testing the extension",
                                    timestamp: "{{timestamp}}",
                                    application: "{{application}}",
                                    source: "chrome-extension"
                                }
                            }
                        ]
                    }
                ]
            };
            
            const fallbackJson = JSON.stringify(fallbackDefinition, null, 2);
            eventDefinitionTextarea.value = fallbackJson;
            validateEventDefinition(fallbackJson);
            
            if (definitionValidation) {
                definitionValidation.textContent = 'Loaded fallback sample scenario (full samples unavailable)';
                definitionValidation.className = 'validation-message valid';
            }
            
        }
    }
    
    // Validate event definition
    function validateEventDefinition(definition) {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const definitionValidation = panel.querySelector('#definition-validation');
        const scenarioControls = panel.querySelector('#scenario-controls');
        const scenarioSelect = panel.querySelector('#scenario-select');
        
        if (!definitionValidation) return;
        
        if (!definition || !definition.trim()) {
            definitionValidation.textContent = '';
            definitionValidation.className = 'validation-message';
            if (scenarioControls) scenarioControls.style.display = 'none';
            return;
        }
        
        try {
            const parsed = JSON.parse(definition);
            
            // Support both new (event_definitions) and legacy (scenarios) formats
            let scenarios = [];
            
            if (parsed.event_definitions && Array.isArray(parsed.event_definitions)) {
                // New format
                scenarios = parsed.event_definitions;
            } else if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
                // Legacy format with scenarios array
                scenarios = parsed.scenarios;
            } else if (parsed.scenarios && typeof parsed.scenarios === 'object') {
                // Legacy format with scenarios object
                scenarios = Object.keys(parsed.scenarios).map(key => ({
                    id: key,
                    name: parsed.scenarios[key].name || key,
                    ...parsed.scenarios[key]
                }));
            } else {
                throw new Error('Must contain either "event_definitions" array or "scenarios" array/object');
            }
            
            if (scenarios.length === 0) {
                throw new Error('Must contain at least one scenario or event definition');
            }
            
            definitionValidation.textContent = `Valid definition with ${scenarios.length} scenario(s)`;
            definitionValidation.className = 'validation-message valid';
            
            // Show scenario controls and populate dropdown
            if (scenarioControls) {
                scenarioControls.style.display = 'block';
                
                if (scenarioSelect) {
                    scenarioSelect.innerHTML = '<option value="">-- Select a scenario --</option>';
                    scenarios.forEach((scenario, index) => {
                        const option = document.createElement('option');
                        option.value = scenario.id || index.toString();
                        option.textContent = scenario.name || `Event Definition ${index + 1}`;
                        scenarioSelect.appendChild(option);
                    });
                    
                    // Restore saved scenario selection using loaded settings
                    const activeScenarioId = loadedSettings.active_scenario_id;
                    if (activeScenarioId && scenarios.find(s => s.id === activeScenarioId)) {
                        scenarioSelect.value = activeScenarioId;
                        console.log('[Panel] Restored saved scenario from loaded settings:', activeScenarioId);
                    } else if (scenarios.length > 0) {
                        scenarioSelect.value = scenarios[0].id || '0';
                        console.log('[Panel] Auto-selected first scenario:', scenarioSelect.value);
                    }
                    
                    // Add event listener to auto-save scenario selection changes
                    scenarioSelect.addEventListener('change', async (e) => {
                        const selectedScenarioId = e.target.value;
                        console.log('[Panel] Scenario selection changed, saving:', selectedScenarioId);
                        
                        // Update loaded settings for immediate use
                        loadedSettings.active_scenario_id = selectedScenarioId;
                        
                        // Save to storage with fallback support
                        try {
                            if (isExtensionContext()) {
                                await chrome.storage.sync.set({ active_scenario_id: selectedScenarioId });
                            } else {
                                // Fallback: save via message relay
                                window.postMessage({
                                    action: 'save_scenario_selection_request',
                                    source: 'incident-injector-panel',
                                    scenarioId: selectedScenarioId
                                }, '*');
                            }
                            console.log('[Panel] Scenario selection saved successfully');
                        } catch (error) {
                            console.log('[Panel] Failed to save scenario selection:', error);
                        }
                    });
                }
            }
            
        } catch (error) {
            definitionValidation.textContent = `Invalid JSON: ${error.message}`;
            definitionValidation.className = 'validation-message invalid';
            if (scenarioControls) scenarioControls.style.display = 'none';
        }
    }
    
    // Update scenario button state
    function updateScenarioButtonState() {
        // This function would handle enabling/disabling scenario buttons
        // based on the current state
    }
    
    // Check for active scenarios
    function checkForActiveScenarios() {
        if (!isExtensionContext()) return;
        
        try {
            chrome.storage.sync.get(['scenario_running'], (result) => {
            const panel = document.getElementById('incident-injector-panel');
            if (!panel) return;
            
            const scenarioIndicator = panel.querySelector('#scenario-running-indicator');
            
            if (result.scenario_running && scenarioIndicator) {
                showScenarioRunning(result.scenario_running);
            }
        });
        } catch (error) {
            console.log('[Panel] Error checking for active scenarios:', error.message);
        }
    }
    
    // Show scenario running indicator
    function showScenarioRunning(scenarioData) {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const scenarioIndicator = panel.querySelector('#scenario-running-indicator');
        const scenarioName = panel.querySelector('#scenario-name');
        const scenarioProgressFill = panel.querySelector('#scenario-progress-fill');
        
        if (scenarioIndicator) {
            let scenarioNameText = scenarioData.name || scenarioData.id || 'Unknown Scenario';
            if (scenarioData.status) {
                scenarioNameText = `${scenarioNameText} - ${scenarioData.status}`;
            }
            
            if (scenarioName) {
                scenarioName.textContent = scenarioNameText;
            }
            
            if (scenarioProgressFill && scenarioData.progress >= 0) {
                scenarioProgressFill.style.width = `${Math.min(100, Math.max(0, scenarioData.progress))}%`;
            }
            
            scenarioIndicator.style.display = 'block';
        }
    }
    
    // Listen for storage changes to update panel
    if (isExtensionContext()) {
        try {
            chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                if (changes.scenario_running) {
                    const panel = document.getElementById('incident-injector-panel');
                    if (!panel) return;
                    
                    const scenarioIndicator = panel.querySelector('#scenario-running-indicator');
                    
                    if (changes.scenario_running.newValue) {
                        showScenarioRunning(changes.scenario_running.newValue);
                    } else if (scenarioIndicator) {
                        scenarioIndicator.style.display = 'none';
                    }
                }
            }
        });
        } catch (error) {
            console.log('[Panel] Error setting up storage change listener:', error.message);
        }
    }
    
    // Listen for messages from content script
    window.addEventListener('message', (event) => {
        if (event.data.source === 'incident-injector-content') {
            if (event.data.action === 'status_update') {
                updateStatusFromContentScript(event.data.status);
            }
        }
    });
    
    // Update status from content script message
    function updateStatusFromContentScript(statusData) {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const statusDot = panel.querySelector('#status-dot');
        const statusText = panel.querySelector('#status-text');
        const lastIncidentSpan = panel.querySelector('#last-incident');
        
        if (statusDot && statusText) {
            statusDot.className = `status-dot ${statusData.dotClass}`;
            statusText.textContent = statusData.text;
        }
        
        if (lastIncidentSpan && statusData.lastIncident) {
            lastIncidentSpan.textContent = statusData.lastIncident;
        }
        
    }
    
    // Handle saving event definition to file
    async function handleSaveToFile() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const eventDefinitionTextarea = panel.querySelector('#event-definition');
        
        try {
            // Get the current event definition
            const eventDefinition = eventDefinitionTextarea ? eventDefinitionTextarea.value.trim() : '';
            
            if (!eventDefinition) {
                console.error('[Panel] No event definition to save');
                return;
            }
            
            // Validate JSON
            try {
                JSON.parse(eventDefinition);
            } catch (e) {
                console.error('[Panel] Invalid JSON format');
                return;
            }
            
            // Create blob and download
            const blob = new Blob([eventDefinition], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Create temporary link and click it
            const a = document.createElement('a');
            a.href = url;
            a.download = `incident-scenarios-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up URL
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
            
            console.log('[Panel] Event definition saved to file');
        } catch (error) {
            console.error('[Panel] Error saving to file:', error);
        }
    }
    
    // Handle loading event definition from file
    function handleLoadFromFile() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        const eventDefinitionTextarea = panel.querySelector('#event-definition');
        
        try {
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            
            // Add event listener for when a file is selected
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        const text = await file.text();
                        
                        // Validate JSON
                        try {
                            JSON.parse(text);
                        } catch (e) {
                            console.error('[Panel] Invalid JSON file');
                            return;
                        }
                        
                        // Set the content
                        if (eventDefinitionTextarea) {
                            eventDefinitionTextarea.value = text;
                            
                            // Save to storage - try direct first, then use message relay if needed
                            if (isExtensionContext()) {
                                try {
                                    if (chrome.storage && chrome.storage.local) {
                                        await chrome.storage.local.set({ event_definition: text });
                                        console.log('[Panel] Event definition saved to local storage directly');
                                    }
                                } catch (error) {
                                    console.log('[Panel] Failed to save event definition directly:', error);
                                }
                            } else {
                                // Use message relay to save
                                console.log('[Panel] Using message relay to save loaded event definition');
                                window.postMessage({
                                    action: 'save_event_definition_request',
                                    source: 'incident-injector-panel',
                                    eventDefinition: text
                                }, '*');
                            }
                            
                            // Validate the loaded definition
                            validateEventDefinition(text);
                            
                            console.log('[Panel] Event definition loaded from file');
                        }
                        
                    } catch (error) {
                        console.error('[Panel] Error reading file:', error);
                    }
                }
                
                // Clean up
                document.body.removeChild(fileInput);
            });
            
            // Append to body and trigger click
            document.body.appendChild(fileInput);
            fileInput.click();
            
        } catch (error) {
            console.error('[Panel] Error loading file:', error);
        }
    }
    
    // Initialize panel when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePanel);
    } else {
        // If DOM is already loaded, check if we're in a panel context
        setTimeout(() => {
            const panel = document.getElementById('incident-injector-panel');
            if (panel) {
                initializePanel();
            }
        }, 100);
    }

    // Listen for auto-save messages from content script
    window.addEventListener('message', (event) => {
        if (event.data.action === 'auto_save_settings' && event.data.source === 'incident-injector-content') {
            console.log('[Panel] Received auto-save request from content script');
            autoSaveAllSettings().catch(error => {
                console.log('[Panel] Auto-save error:', error.message);
            });
        }
    });

    // Auto-save all settings (called when panel closes)
    async function autoSaveAllSettings() {
        console.log('[Panel] Auto-saving all settings on panel close...');

        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;

        // Gather all settings (use ?? false for booleans to preserve explicit false values)
        const extensionEnabledCheckbox = panel.querySelector('#extension-enabled');
        const triggerOnClickCheckbox = panel.querySelector('#trigger-on-click-enabled');

        const settings = {
            extension_enabled: extensionEnabledCheckbox ? extensionEnabledCheckbox.checked : false,
            integration_key: (panel.querySelector('#integration-key')?.value || '').trim(),
            crux_url: (panel.querySelector('#crux-url')?.value || '').trim(),
            custom_alert_message: panel.querySelector('#alert-message')?.value || '',
            show_alert: panel.querySelector('#option-create-alert')?.checked || false,
            run_scenario_on_submit: panel.querySelector('#option-run-scenario')?.checked || false,
            redirect_to_500: panel.querySelector('#option-add-500-error')?.checked || false,
            trigger_crux: panel.querySelector('#option-trigger-crux')?.checked || false,
            allow_form_continuation: panel.querySelector('#option-continue-destination')?.checked || false,
            trigger_on_click_enabled: triggerOnClickCheckbox ? triggerOnClickCheckbox.checked : false,
            target_element_texts: panel.querySelector('#target-elements')?.value || '',
            active_scenario_id: panel.querySelector('#scenario-select')?.value || ''
        };

        console.log('[Panel] Auto-save gathering settings:', {
            extension_enabled: settings.extension_enabled,
            trigger_on_click_enabled: settings.trigger_on_click_enabled,
            integration_key: settings.integration_key ? `${settings.integration_key.length} chars` : 'empty',
            crux_url: settings.crux_url ? `${settings.crux_url.length} chars` : 'empty'
        });

        // Also save the event definition JSON to local storage (it can be large)
        const eventDefinition = panel.querySelector('#event-definition')?.value || '';
        const localSettings = {
            event_definition: eventDefinition
        };

        // Save to localStorage for persistence
        Object.keys(settings).forEach(key => {
            if (key === 'extension_enabled' || key === 'trigger_on_click_enabled') {
                localStorage.setItem(`incident_injector_${key}`, settings[key].toString());
            }
        });

        // Try direct Chrome API save first
        try {
            if (typeof chrome !== 'undefined' &&
                chrome &&
                chrome.storage &&
                chrome.storage.sync &&
                typeof chrome.storage.sync.set === 'function') {

                console.log('[Panel] Auto-saving via Chrome API...');

                // Save sync settings
                await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.sync.set(settings, () => {
                            if (chrome.runtime && chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve();
                            }
                        });
                    } catch (e) {
                        reject(e);
                    }
                });

                // Save local settings (event definition)
                if (chrome.storage.local && typeof chrome.storage.local.set === 'function') {
                    await new Promise((resolve, reject) => {
                        try {
                            chrome.storage.local.set(localSettings, () => {
                                if (chrome.runtime && chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve();
                                }
                            });
                        } catch (e) {
                            reject(e);
                        }
                    });
                }

                console.log('[Panel] Auto-save successful');

                // Update click configuration in content script
                window.postMessage({
                    action: 'update_click_config',
                    source: 'incident-injector-panel',
                    enabled: settings.trigger_on_click_enabled,
                    targetElements: settings.target_element_texts
                }, '*');

            }
        } catch (error) {
            // Silently handle extension context invalidation
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.log('[Panel] Extension was reloaded during close, settings not saved');
                return; // Exit gracefully without showing error to user
            }

            console.log('[Panel] Auto-save failed, will use message relay as fallback:', error.message);

            // Fallback to message relay (fire and forget)
            try {
                window.postMessage({
                    action: 'save_all_settings_request',
                    source: 'incident-injector-panel',
                    settings: settings,
                    localSettings: localSettings
                }, '*');
            } catch (msgError) {
                console.log('[Panel] Message relay also failed, settings not saved');
            }
        }
    }

})();