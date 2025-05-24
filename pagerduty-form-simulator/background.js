// Incident Injector - Background Script
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Incident Injector] Extension installed');
    
    // Set default values
    chrome.storage.sync.set({
        extension_enabled: true,
        show_alert: true,
        allow_form_continuation: false,
        redirect_to_500: false,
        custom_alert_message: "🚨 Error: Form submission failed! PagerDuty incident created.",
        target_element_texts: "" // No defaults - user must configure
    });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'create_incident') {
        handleIncidentCreation(request.data, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'test_incident') {
        handleTestIncident(sendResponse);
        return true;
    }
});

// Handle incident creation
async function handleIncidentCreation(formData, sendResponse) {
    try {
        console.log('[PagerDuty Simulator] Creating incident for form data:', formData);
        
        // Get PagerDuty integration key
        const result = await chrome.storage.sync.get(['pagerduty_integration_key']);
        const integrationKey = result.pagerduty_integration_key;
        
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
        
        // Check if we've sent this incident recently (deduplication)
        const recentIncidents = await getRecentIncidents();
        if (recentIncidents.includes(dedupKey)) {
            console.log('[PagerDuty Simulator] Incident deduplicated:', dedupKey);
            sendResponse({
                success: true,
                incidentId: 'deduplicated',
                message: 'Incident deduplicated (sent within last 5 minutes)'
            });
            return;
        }

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

// Generate deduplication key
function generateDedupKey(url, formAction) {
    const baseString = `${url}:${formAction}`;
    return btoa(baseString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

// Create PagerDuty incident payload
function createIncidentPayload(formData, integrationKey, dedupKey) {
    return {
        routing_key: integrationKey,
        event_action: "trigger",
        dedup_key: dedupKey,
        payload: {
            summary: `User Experience Error. Form submission error on ${formData.title}`,
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

// Store recent incident for deduplication
async function storeRecentIncident(dedupKey) {
    const result = await chrome.storage.local.get(['recent_incidents']);
    const recentIncidents = result.recent_incidents || {};
    
    // Clean up old incidents (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const cleanedIncidents = {};
    
    for (const [key, timestamp] of Object.entries(recentIncidents)) {
        if (timestamp > fiveMinutesAgo) {
            cleanedIncidents[key] = timestamp;
        }
    }
    
    // Add new incident
    cleanedIncidents[dedupKey] = Date.now();
    
    await chrome.storage.local.set({ recent_incidents: cleanedIncidents });
}

// Get recent incidents for deduplication
async function getRecentIncidents() {
    const result = await chrome.storage.local.get(['recent_incidents']);
    const recentIncidents = result.recent_incidents || {};
    
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentKeys = [];
    
    for (const [key, timestamp] of Object.entries(recentIncidents)) {
        if (timestamp > fiveMinutesAgo) {
            recentKeys.push(key);
        }
    }
    
    return recentKeys;
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

console.log('[Incident Injector] Background script loaded');