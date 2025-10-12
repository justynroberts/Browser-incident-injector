// Incident Injector - Background Script

// Import event processor
importScripts('event-processor.js');

// Initialize event processor
console.log('[Incident Injector] Initializing event processor');
eventProcessor.initialize()
    .then(() => {
        console.log('[Incident Injector] Event processor initialized successfully');
        
        // Check if there's an event definition in local storage
        return chrome.storage.local.get(['event_definition']);
    })
    .then((result) => {
        if (result.event_definition) {
            console.log('[Incident Injector] Found event definition in storage, loading it');
            return eventProcessor.loadEventDefinition(result.event_definition);
        } else {
            console.log('[Incident Injector] No event definition found in storage');
            return false;
        }
    })
    .then((loaded) => {
        console.log('[Incident Injector] Event definition loaded:', loaded);
    })
    .catch(error => {
        console.error('[Incident Injector] Failed to initialize event processor:', error);
    });

chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Incident Injector] Extension installed');
    
    // Check if we have existing stored preferences (for upgrades)
    const existingSettings = await chrome.storage.sync.get(['extension_enabled', 'trigger_on_click_enabled']);
    
    // Set sensible defaults for new installs while preserving user settings on upgrades
    const defaults = {
        show_alert: false, // Default to off - user must opt-in to see alerts
        allow_form_continuation: true, // Allow clicks to proceed by default - just observe
        redirect_to_500: false,
        run_scenario_on_submit: false,
        trigger_crux: false, // Default to off - user must opt-in to trigger Crux
        crux_url: "", // No default Crux URL - user must configure
        custom_alert_message: "Error: UX Failure - Our team are working on it now.",
        target_element_texts: "Login", // Simple default - user can customize
        active_scenario_id: "" // No default active scenario
    };

    // Set extension_enabled to true by default ONLY on fresh install (ready to use)
    if (existingSettings.extension_enabled === undefined) {
        defaults.extension_enabled = true; // Enabled by default - ready to use out of the box
    }

    // Set trigger_on_click_enabled to true by default ONLY on fresh install
    if (existingSettings.trigger_on_click_enabled === undefined) {
        defaults.trigger_on_click_enabled = true; // Click interception enabled with sensible defaults
    }
    
    chrome.storage.sync.set(defaults);
    console.log('[Incident Injector] Default settings applied:', defaults);
});

// Handle extension icon click to open panel
chrome.action.onClicked.addListener(async (tab) => {
    console.log('[Incident Injector] Extension icon clicked, opening panel');
    
    // Check if we can inject content scripts on this URL
    if (!canInjectContentScript(tab.url)) {
        console.warn('[Incident Injector] Cannot inject content script on this URL:', tab.url);
        
        // Show notification to user
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Incident Injector',
            message: 'Please navigate to a regular website (not chrome:// or extension pages) to use the panel.'
        });
        return;
    }
    
    try {
        // Send message to content script to toggle panel
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'toggle_panel'
        });
        
        if (response && response.success) {
            console.log('[Incident Injector] Panel toggle message sent successfully');
        } else {
            console.log('[Incident Injector] No response from content script, attempting injection...');
            await injectAndTogglePanel(tab.id);
        }
    } catch (error) {
        console.log('[Incident Injector] Content script not found, attempting injection...', error.message);
        await injectAndTogglePanel(tab.id);
    }
});

// Check if we can inject content scripts on a given URL
function canInjectContentScript(url) {
    if (!url) return false;
    
    // URLs where content scripts cannot be injected
    const restrictedSchemes = [
        'chrome://',
        'chrome-extension://',
        'moz-extension://',
        'edge://',
        'about:',
        'data:',
        'file://',
        'chrome-search://',
        'chrome-devtools://'
    ];
    
    const restrictedUrls = [
        'https://chrome.google.com/webstore',
        'https://addons.mozilla.org',
        'https://microsoftedge.microsoft.com/addons'
    ];
    
    // Check restricted schemes
    for (const scheme of restrictedSchemes) {
        if (url.startsWith(scheme)) {
            return false;
        }
    }
    
    // Check restricted URLs
    for (const restrictedUrl of restrictedUrls) {
        if (url.startsWith(restrictedUrl)) {
            return false;
        }
    }
    
    return true;
}

// Inject content script and toggle panel
async function injectAndTogglePanel(tabId) {
    try {
        // Inject the content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        console.log('[Incident Injector] Content script injected successfully');
        
        // Wait a moment for the script to initialize, then try to toggle panel
        setTimeout(async () => {
            try {
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'toggle_panel'
                });
                
                if (response && response.success) {
                    console.log('[Incident Injector] Panel toggled successfully after injection');
                } else {
                    console.warn('[Incident Injector] Panel toggle failed after injection');
                }
            } catch (retryError) {
                console.error('[Incident Injector] Retry failed after injection:', retryError.message);
            }
        }, 500);
        
    } catch (scriptError) {
        console.error('[Incident Injector] Failed to inject content script:', scriptError.message);
        
        // Show user-friendly notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Incident Injector Error',
            message: 'Unable to load panel on this page. Please try on a different website.'
        });
    }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'create_incident') {
        handleIncidentCreation(request.data, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'test_incident') {
        handleTestIncident(sendResponse);
        return true;
    } else if (request.action === 'load_event_definition') {
        handleLoadEventDefinition(request.definition, sendResponse);
        return true;
    } else if (request.action === 'run_scenario') {
        handleRunScenario(request.scenarioId, request.options, sendResponse);
        return true;
    } else if (request.action === 'run_active_scenario') {
        handleRunActiveScenario(request.data, sendResponse);
        return true;
    } else if (request.action === 'open_popup') {
        // Handle opening the panel (legacy support)
        // This action is no longer needed since we use the panel now
        sendResponse({ success: false, error: 'Popup no longer available - use panel instead' });
        return true;
    } else if (request.action === 'updateScenarioProgress') {
        handleUpdateScenarioProgress(request.progress, request.status, sendResponse);
        return true;
    }
});

// Handle loading event definition
async function handleLoadEventDefinition(definitionJson, sendResponse) {
    try {
        // Load the definition into the event processor
        const success = eventProcessor.loadEventDefinition(definitionJson);
        
        if (success) {
            // Get available scenarios
            const scenarios = eventProcessor.getAvailableScenarios();
            sendResponse({
                success: true,
                scenarios: scenarios
            });
        } else {
            sendResponse({
                success: false,
                error: 'Failed to load event definition'
            });
        }
    } catch (error) {
        console.error('[Event Definition] Error loading definition:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle running a scenario
async function handleRunScenario(scenarioId, options, sendResponse) {
    try {
        // Re-initialize to ensure integration key is loaded
        await eventProcessor.initialize();
        
        // Load the event definition if provided
        if (options && options.eventDefinition) {
            try {
                const definition = JSON.parse(options.eventDefinition);
                eventProcessor.loadEventDefinition(definition);
            } catch (e) {
                console.error('[Background] Failed to parse event definition:', e);
                sendResponse({
                    success: false,
                    error: 'Invalid event definition JSON'
                });
                return;
            }
        }
        
        // Get scenario details for the indicator
        const scenarios = eventProcessor.getAvailableScenarios();
        const scenario = scenarios.find(s => s.id === scenarioId);
        
        // Set running status with timestamp
        await setScenarioRunningStatus({
            id: scenarioId,
            name: scenario ? scenario.name : scenarioId,
            progress: 0,
            startTime: Date.now()
        });
        
        // Check if integration key is configured - REQUIRED for scenarios
        const result = await chrome.storage.sync.get(['integration_key']);
        console.log('[Background] Integration key from storage:', result.integration_key ? `"${result.integration_key}" (${result.integration_key.length} chars)` : 'not set');

        // Trim the key and validate
        const integrationKey = result.integration_key ? result.integration_key.trim() : '';
        const hasIntegrationKey = integrationKey.length === 32 && /^[a-zA-Z0-9]+$/.test(integrationKey);

        if (!hasIntegrationKey) {
            console.log('[Background] No valid integration key configured - scenario cannot run');
            console.log('[Background] Key validation failed:', {
                hasKey: !!result.integration_key,
                trimmedLength: integrationKey.length,
                isAlphanumeric: /^[a-zA-Z0-9]+$/.test(integrationKey)
            });
            await clearScenarioRunningStatus();
            sendResponse({
                success: false,
                error: 'Valid PagerDuty integration key required. Please configure a 32-character integration key first.'
            });
            return;
        }
        
        // Start the scenario with debugging
        console.log('[Background] Starting scenario with options:', options);
        console.log('[Background] Event processor integration key:', eventProcessor.integrationKey ? 'Present' : 'Missing');
        console.log('[Background] Event processor has definition:', eventProcessor.currentDefinition ? 'Yes' : 'No');
        
        // Log the event definition being used
        if (options && options.eventDefinition) {
            try {
                const parsed = JSON.parse(options.eventDefinition);
                console.log('[Background] Event definition schema:', parsed.event_definitions ? 'New' : parsed.scenarios ? 'Legacy' : 'Unknown');
                const eventCount = parsed.event_definitions ? 
                    parsed.event_definitions.reduce((sum, def) => sum + (def.events?.length || 0), 0) :
                    parsed.scenarios ? Object.values(parsed.scenarios).reduce((sum, scenario) => sum + (scenario.events?.length || 0), 0) : 0;
                console.log('[Background] Total events to process:', eventCount);
            } catch (e) {
                console.error('[Background] Failed to parse event definition for logging:', e);
            }
        }
        
        const success = await eventProcessor.startScenario(scenarioId, options);
        console.log('[Background] Scenario execution result:', success);
        
        // Clear running status
        await clearScenarioRunningStatus();
        
        if (success) {
            sendResponse({
                success: true,
                message: `Event definition ${scenarioId} started successfully`
            });
        } else {
            // Check if integration key is missing
            const result = await chrome.storage.sync.get(['integration_key']);
            const errorMessage = !result.integration_key ?
                'No PagerDuty integration key configured. Please set a key in the extension settings.' :
                'Failed to start event definition';
                
            sendResponse({
                success: false,
                error: errorMessage
            });
        }
    } catch (error) {
        console.error('[Event Definition] Error running event definition:', error);
        await clearScenarioRunningStatus();
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle running the active scenario
async function handleRunActiveScenario(formData, sendResponse) {
    try {
        console.log('[Event Definition] Handling run active scenario request with form data:', formData);
        console.log('[Event Definition] Message received in background script');
        
        // Get the active scenario ID
        const result = await chrome.storage.sync.get(['active_scenario_id']);
        const activeScenarioId = result.active_scenario_id;
        console.log('[Event Definition] Retrieved active scenario ID from storage:', activeScenarioId);
        
        console.log('[Event Definition] Active scenario ID:', activeScenarioId);
        
        if (!activeScenarioId) {
            console.error('[Event Definition] No active scenario configured');
            sendResponse({
                success: false,
                error: 'No active scenario configured'
            });
            return;
        }
        
        // Re-initialize to ensure integration key is loaded
        await eventProcessor.initialize();
        
        // Get scenario details for the indicator
        const scenarios = eventProcessor.getAvailableScenarios();
        const scenario = scenarios.find(s => s.id === activeScenarioId);
        
        // Set running status with timestamp
        await setScenarioRunningStatus({
            id: activeScenarioId,
            name: scenario ? scenario.name : activeScenarioId,
            progress: 0,
            startTime: Date.now()
        });
        
        // Start the scenario
        console.log('[Event Definition] Running scenario:', activeScenarioId);
        
        // Add more detailed logging
        console.log('[Event Definition] Integration key:', eventProcessor.integrationKey);
        console.log('[Event Definition] Current definition:', eventProcessor.currentDefinition ? 'Loaded' : 'Not loaded');
        
        const success = await eventProcessor.runScenario(activeScenarioId);
        console.log('[Event Definition] Scenario run result:', success);
        
        // Clear running status
        await clearScenarioRunningStatus();
        
        if (success) {
            sendResponse({
                success: true,
                message: `Active scenario ${activeScenarioId} executed successfully`
            });
        } else {
            // Check if integration key is missing
            const keyResult = await chrome.storage.sync.get(['integration_key']);
            const errorMessage = !keyResult.integration_key ?
                'No PagerDuty integration key configured. Please set a key in the extension settings.' :
                'Failed to run active scenario';
                
            sendResponse({
                success: false,
                error: errorMessage
            });
        }
    } catch (error) {
        console.error('[Event Definition] Error running active scenario:', error);
        await clearScenarioRunningStatus();
        sendResponse({
            success: false,
            error: error.message
        });
    }
}


// Handle scenario progress updates
async function handleUpdateScenarioProgress(progress, status, sendResponse) {
    try {
        const result = await chrome.storage.sync.get(['scenario_running']);
        if (result.scenario_running) {
            result.scenario_running.progress = progress;
            result.scenario_running.status = status;
            result.scenario_running.lastUpdate = Date.now();
            
            await chrome.storage.sync.set({ scenario_running: result.scenario_running });
            console.log(`[Background] Updated scenario progress: ${progress}% - ${status}`);
            
            sendResponse({ success: true });
        } else {
            console.warn('[Background] No running scenario to update progress for');
            sendResponse({ success: false, error: 'No running scenario' });
        }
    } catch (error) {
        console.error('[Background] Error updating scenario progress:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle incident creation
async function handleIncidentCreation(formData, sendResponse) {
    try {
        console.log('[PagerDuty Simulator] Creating incident for form data:', formData);
        
        // Get PagerDuty integration key
        const result = await chrome.storage.sync.get(['integration_key']);
        const integrationKey = result.integration_key;
        
        if (!integrationKey) {
            console.error('[PagerDuty Simulator] No integration key configured');
            sendResponse({
                success: false,
                error: 'PagerDuty integration key not configured'
            });
            return;
        }

        // Validate integration key format (32-character alphanumeric)
        if (!isValidIntegrationKey(integrationKey)) {
            console.error('[PagerDuty Simulator] Invalid integration key format');
            sendResponse({
                success: false,
                error: 'Invalid PagerDuty integration key format'
            });
            return;
        }

        // Generate deduplication key
        const dedupKey = generateDedupKey(formData.url, formData.formAction);
        
        // No deduplication - allow sending the same incident multiple times
        console.log('[PagerDuty Simulator] Deduplication disabled, allowing duplicate incidents');

        // Create PagerDuty incident payload
        const payload = createIncidentPayload(formData, integrationKey, dedupKey);
        
        // Send to PagerDuty
        const response = await sendToPagerDuty(payload);
        
        if (response.success) {
            // Store incident for deduplication
            await storeRecentIncident(dedupKey);
            
            // Update last incident timestamp
            await chrome.storage.sync.set({
                last_incident_timestamp: new Date().toISOString()
            });
            
            console.log('[PagerDuty Simulator] Incident created successfully');
            sendResponse({
                success: true,
                incidentId: response.dedup_key || dedupKey
            });
        } else {
            console.error('[PagerDuty Simulator] Failed to create incident:', response.error);
            sendResponse({
                success: false,
                error: response.error
            });
            
            // Show browser notification for API failures
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Incident Injector Error',
                message: `Failed to create incident: ${response.error}`
            });
        }
        
    } catch (error) {
        console.error('[PagerDuty Simulator] Error in handleIncidentCreation:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// Handle test incident creation
async function handleTestIncident(sendResponse) {
    const testData = {
        url: 'https://example.com/test',
        title: 'Test Page - Incident Injector',
        formAction: 'https://example.com/test-form',
        formMethod: 'POST',
        buttonText: 'Test Submit Button',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        referrer: 'Direct'
    };
    
    await handleIncidentCreation(testData, sendResponse);
}

// Validate PagerDuty integration key format
function isValidIntegrationKey(key) {
    if (!key || typeof key !== 'string') return false;
    
    // PagerDuty integration keys are typically 32-character alphanumeric strings
    const keyRegex = /^[a-zA-Z0-9]{32}$/;
    return keyRegex.test(key);
}

// Generate deduplication key with timestamp to ensure uniqueness
function generateDedupKey(url, formAction) {
    const timestamp = Date.now();
    const baseString = `${url}:${formAction}:${timestamp}`;
    return btoa(baseString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

// Create PagerDuty incident payload
function createIncidentPayload(formData, integrationKey, dedupKey) {
    return {
        routing_key: integrationKey,
        event_action: "trigger",
        dedup_key: dedupKey,
        payload: {
            summary: `User Experience Error. Form submission error on ${formData.title} - ${new Date().toLocaleTimeString()}`,
            source: formData.url,
            severity: "error",
            component: "web-form",
            group: "chrome-extension-simulator",
            class: "form-submission",
            custom_details: {
                url: formData.url,
                form_action: formData.formAction,
                form_method: formData.formMethod,
                button_text: formData.buttonText,
                timestamp: formData.timestamp,
                user_agent: formData.userAgent,
                referrer: formData.referrer,
                simulation_source: "chrome-extension"
            }
        }
    };
}

// Send incident to PagerDuty
async function sendToPagerDuty(payload, retryCount = 0) {
    try {
        console.log('[PagerDuty Simulator] Sending payload to PagerDuty:', payload);
        
        const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('[PagerDuty Simulator] PagerDuty response:', result);
        
        return {
            success: true,
            dedup_key: result.dedup_key,
            message: result.message
        };
        
    } catch (error) {
        console.error('[PagerDuty Simulator] PagerDuty API error:', error);
        
        // Retry once after 2-second delay
        if (retryCount === 0) {
            console.log('[PagerDuty Simulator] Retrying API call in 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return sendToPagerDuty(payload, 1);
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Store recent incident for deduplication - now a no-op to disable deduplication
async function storeRecentIncident(dedupKey) {
    // No-op - deduplication disabled
    console.log('[PagerDuty Simulator] Deduplication disabled, not storing incident:', dedupKey);
}

// Get recent incidents for deduplication - now returns empty array to disable deduplication
async function getRecentIncidents() {
    // Return empty array to disable deduplication
    return [];
}

// Handle extension uninstall - clear stored data
chrome.runtime.onSuspend.addListener(() => {
    console.log('[PagerDuty Simulator] Extension suspending');
});

// Handle storage changes for debugging
chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('[PagerDuty Simulator] Storage changed:', changes, namespace);
});

// Notification click handler
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId);
});

// Scenario running status helpers
async function setScenarioRunningStatus(scenarioData) {
    try {
        await chrome.storage.sync.set({ scenario_running: scenarioData });
        console.log('[Background] Set scenario running status:', scenarioData);
    } catch (error) {
        console.error('[Background] Error setting scenario running status:', error);
    }
}

async function clearScenarioRunningStatus() {
    try {
        // Check if there was actually a running scenario before clearing
        const beforeResult = await chrome.storage.sync.get(['scenario_running']);
        if (beforeResult.scenario_running) {
            console.log('[Background] Clearing scenario running status for:', beforeResult.scenario_running.name);
        }
        
        await chrome.storage.sync.remove(['scenario_running']);
        
        // Verify it was actually cleared
        const afterResult = await chrome.storage.sync.get(['scenario_running']);
        if (!afterResult.scenario_running) {
            console.log('[Background] ✅ Scenario running status successfully cleared');
        } else {
            console.error('[Background] ❌ Failed to clear scenario running status - still exists:', afterResult.scenario_running);
        }
    } catch (error) {
        console.error('[Background] Error clearing scenario running status:', error);
    }
}

// Update scenario progress
async function updateScenarioProgress(progress) {
    try {
        const result = await chrome.storage.sync.get(['scenario_running']);
        if (result.scenario_running) {
            result.scenario_running.progress = progress;
            result.scenario_running.lastUpdate = Date.now(); // Add timestamp
            await chrome.storage.sync.set({ scenario_running: result.scenario_running });
            console.log('[Background] Updated scenario progress:', progress);
        }
    } catch (error) {
        console.error('[Background] Error updating scenario progress:', error);
    }
}

// Diagnostic function to check for stuck scenarios
async function checkForStuckScenarios() {
    try {
        const result = await chrome.storage.sync.get(['scenario_running']);
        if (result.scenario_running) {
            const runningTime = Date.now() - (result.scenario_running.startTime || 0);
            const maxRunTime = 10 * 60 * 1000; // 10 minutes max
            
            if (runningTime > maxRunTime) {
                console.warn('[Background] ⚠️ Scenario has been running too long, force clearing:', {
                    name: result.scenario_running.name,
                    runningTime: Math.floor(runningTime / 1000) + 's',
                    maxTime: Math.floor(maxRunTime / 1000) + 's'
                });
                await clearScenarioRunningStatus();
                return true; // Was stuck
            } else {
                console.log('[Background] Scenario still running normally:', {
                    name: result.scenario_running.name,
                    runningTime: Math.floor(runningTime / 1000) + 's'
                });
            }
        } else {
            console.log('[Background] No scenario currently running');
        }
        return false; // Not stuck
    } catch (error) {
        console.error('[Background] Error checking for stuck scenarios:', error);
        return false;
    }
}

// Periodic check for stuck scenarios (every 2 minutes)
setInterval(async () => {
    await checkForStuckScenarios();
}, 2 * 60 * 1000);

// Check for stuck scenarios on startup
chrome.runtime.onStartup.addListener(async () => {
    console.log('[Background] Extension startup - checking for stuck scenarios');
    await checkForStuckScenarios();
});

console.log('[Incident Injector] Background script loaded');