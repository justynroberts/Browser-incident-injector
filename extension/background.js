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
    
    // onInstalled also fires on every update and developer reload, so only
    // fill keys that have never been set. (Writing the whole defaults object
    // here used to reset the match list, scenario selection and trigger
    // options every time the extension was reloaded.)
    const defaults = {
        extension_enabled: true,
        trigger_on_click_enabled: true,
        show_alert: false,
        allow_form_continuation: true,
        redirect_to_500: false,
        run_scenario_on_submit: false,
        trigger_crux: false,
        crux_url: "",
        custom_alert_message: "Error: UX Failure - Our team are working on it now.",
        target_element_texts: "Login",
        active_scenario_id: "",
        active_scenario_ids: []
    };
    const existing = await chrome.storage.sync.get(Object.keys(defaults));
    const missing = Object.fromEntries(Object.entries(defaults).filter(([k]) => existing[k] === undefined));
    if (Object.keys(missing).length) {
        await chrome.storage.sync.set(missing);
    }
    // Scenario progress moved from sync to local storage in v2.0
    chrome.storage.sync.remove('scenario_running');
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
        const ids = Array.isArray(request.scenarioIds) && request.scenarioIds.length
            ? request.scenarioIds
            : [request.scenarioId];
        handleRunScenario(ids, request.options, sendResponse);
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

// ---------------------------------------------------------------------------
// Scenario runs. Every run — panel button or intercepted click — goes through
// runScenarioSet(), which can fire several scenarios together. Each scenario
// gets its own PagerDutyEventProcessor so template variables ({{incident_id}}
// etc.) and the isRunning guard never collide between concurrent runs.
// ---------------------------------------------------------------------------

const STAGGER_MS = 5000;
let activeRunSet = null;          // { runs, startTime } while anything is running
let runningWriteTimer = null;

function scenarioRunningSnapshot() {
    if (!activeRunSet) return null;
    const runs = activeRunSet.runs;
    const progress = runs.reduce((sum, r) => sum + (r.state === 'running' || r.state === 'queued' ? (r.progress || 0) : 100), 0) / runs.length;
    const live = runs.filter(r => r.state === 'running' || r.state === 'queued').length;
    return {
        id: runs.map(r => r.id).join(','),
        name: runs.length === 1 ? runs[0].name : `${runs.length} scenarios`,
        status: live ? `${runs.length - live}/${runs.length} complete` : 'complete',
        progress: Math.round(progress),
        runs: runs.map(({ id, name, progress, state }) => ({ id, name, progress, state })),
        startTime: activeRunSet.startTime,
        lastUpdate: Date.now()
    };
}

// Coalesce progress writes: chrome.storage writes are rate-limited and the
// panel only needs a few updates a second.
function scheduleRunningWrite(immediate = false) {
    if (immediate) {
        clearTimeout(runningWriteTimer);
        runningWriteTimer = null;
        return setScenarioRunningStatus(scenarioRunningSnapshot());
    }
    if (runningWriteTimer) return;
    runningWriteTimer = setTimeout(() => {
        runningWriteTimer = null;
        setScenarioRunningStatus(scenarioRunningSnapshot());
    }, 400);
}

async function loadDefinitionObject(definitionJson) {
    let raw = definitionJson;
    if (!raw) {
        const stored = await chrome.storage.local.get(['event_definition']);
        raw = stored.event_definition;
    }
    if (!raw) throw new Error('No event definition loaded');
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function runScenarioSet(scenarioIds, options = {}) {
    const ids = [...new Set((scenarioIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return { success: false, error: 'No scenario selected' };

    const { integration_key, routing_keys } = await chrome.storage.sync.get(['integration_key', 'routing_keys']);
    const key = (integration_key || '').trim();
    // Named keys for events that say "routing_key_env": "NAME"
    const namedKeys = {};
    (Array.isArray(routing_keys) ? routing_keys : []).forEach(k => {
        const v = (k?.key || '').trim();
        if (k?.name && isValidIntegrationKey(v)) namedKeys[k.name] = v;
    });
    if (!isValidIntegrationKey(key)) {
        return { success: false, error: 'Valid PagerDuty integration key required (32 characters).' };
    }

    let definition;
    try {
        definition = await loadDefinitionObject(options.eventDefinition);
    } catch (e) {
        return { success: false, error: e instanceof SyntaxError ? 'Invalid event definition JSON' : e.message };
    }

    // Keep the shared processor in sync for anything else that reads it.
    eventProcessor.loadEventDefinition(definition);
    const known = eventProcessor.getAvailableScenarios();
    const missing = ids.filter(id => !known.some(s => s.id === id));
    if (missing.length === ids.length) {
        return { success: false, error: `Scenario not found: ${missing.join(', ')}` };
    }
    const runnable = ids.filter(id => !missing.includes(id));

    const runs = runnable.map(id => ({
        id,
        name: known.find(s => s.id === id)?.name || id,
        progress: 0,
        state: 'queued'
    }));

    // A new set joins whatever is already running so the panel shows everything.
    if (!activeRunSet) activeRunSet = { runs: [], startTime: Date.now() };
    activeRunSet.runs.push(...runs);
    await scheduleRunningWrite(true);

    // MV3 service workers idle out after ~30s without extension events; long
    // scenario delays would be killed mid-run. Any extension API call resets
    // the idle timer, so ping one while runs are in flight.
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

    const stagger = options.stagger === true;
    const results = await Promise.allSettled(runs.map(async (run, index) => {
        if (stagger && index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * STAGGER_MS));
        }
        const processor = new PagerDutyEventProcessor();
        processor.integrationKey = key;
        processor.routingKeys = namedKeys;
        processor.dryRun = options.dryRun === true;
        if (!processor.loadEventDefinition(definition)) throw new Error('Definition failed validation');
        processor.updateProgress = (progress) => {
            run.progress = progress;
            scheduleRunningWrite();
        };
        run.state = 'running';
        scheduleRunningWrite();
        const ok = await processor.runScenario(run.id);
        run.state = ok && processor.failedEvents.length === 0 ? 'done' : 'failed';
        run.progress = 100;
        run.failed = processor.failedEvents.length;
        scheduleRunningWrite();
        if (!ok) throw new Error(`Scenario ${run.name} failed`);
        return run;
    }));

    clearInterval(keepAlive);
    results.forEach((r, i) => { if (r.status === 'rejected') runs[i].state = 'failed'; });

    // Clear the indicator once every run in the active set has finished.
    if (activeRunSet && activeRunSet.runs.every(r => r.state === 'done' || r.state === 'failed')) {
        await scheduleRunningWrite(true);
        activeRunSet = null;
        setTimeout(() => { if (!activeRunSet) clearScenarioRunningStatus(); }, 1500);
    } else {
        scheduleRunningWrite();
    }

    const failed = runs.filter(r => r.state === 'failed');
    const sent = runs.length - failed.length;
    const parts = [];
    if (sent) parts.push(runs.length === 1 ? `${runs[0].name}: events sent` : `${sent} of ${runs.length} scenarios sent`);
    if (failed.length) parts.push(`failed: ${failed.map(f => f.name).join(', ')}`);
    if (missing.length) parts.push(`not found: ${missing.join(', ')}`);
    return {
        success: failed.length === 0,
        partial: failed.length > 0 && sent > 0,
        message: parts.join(' · '),
        error: failed.length ? parts.join(' · ') : undefined,
        runs: runs.map(({ id, name, state, failed }) => ({ id, name, state, failedEvents: failed || 0 }))
    };
}

// Panel "Run" button: explicit ids (or a single legacy id)
async function handleRunScenario(scenarioIds, options, sendResponse) {
    try {
        sendResponse(await runScenarioSet(scenarioIds, options || {}));
    } catch (error) {
        console.error('[Background] Error running scenarios:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Intercepted click / submit: run every ticked scenario
async function handleRunActiveScenario(formData, sendResponse) {
    try {
        const { active_scenario_ids, active_scenario_id, run_stagger } =
            await chrome.storage.sync.get(['active_scenario_ids', 'active_scenario_id', 'run_stagger']);
        const ids = Array.isArray(active_scenario_ids) && active_scenario_ids.length
            ? active_scenario_ids
            : (active_scenario_id ? [active_scenario_id] : []);
        if (!ids.length) {
            sendResponse({ success: false, error: 'No active scenario configured' });
            return;
        }
        sendResponse(await runScenarioSet(ids, { stagger: run_stagger === true }));
    } catch (error) {
        console.error('[Background] Error running active scenarios:', error);
        sendResponse({ success: false, error: error.message });
    }
}


// Handle scenario progress updates
async function handleUpdateScenarioProgress(progress, status, sendResponse) {
    try {
        const result = await chrome.storage.local.get(['scenario_running']);
        if (result.scenario_running) {
            result.scenario_running.progress = progress;
            result.scenario_running.status = status;
            result.scenario_running.lastUpdate = Date.now();
            
            await chrome.storage.local.set({ scenario_running: result.scenario_running });
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
            
            // Last-incident time for the panel status line. Local, not sync:
            // sync allows ~120 writes/min shared with every settings save.
            await chrome.storage.local.set({
                last_incident_time: new Date().toISOString()
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
// The old version base64'd `url:action:timestamp` and kept the first 32 chars,
// which only covered the URL prefix — every incident from one host shared a
// dedup_key, so PagerDuty folded repeat triggers into the first open alert.
function generateDedupKey(url, formAction) {
    const id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '')
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    let host = 'page';
    try { host = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '') || host; } catch (e) { /* keep default */ }
    return `ii-${host}-${id}`.slice(0, 255);
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
        await chrome.storage.local.set({ scenario_running: scenarioData });
        console.log('[Background] Set scenario running status:', scenarioData);
    } catch (error) {
        console.error('[Background] Error setting scenario running status:', error);
    }
}

async function clearScenarioRunningStatus() {
    try {
        // Check if there was actually a running scenario before clearing
        const beforeResult = await chrome.storage.local.get(['scenario_running']);
        if (beforeResult.scenario_running) {
            console.log('[Background] Clearing scenario running status for:', beforeResult.scenario_running.name);
        }
        
        await chrome.storage.local.remove(['scenario_running']);
        
        // Verify it was actually cleared
        const afterResult = await chrome.storage.local.get(['scenario_running']);
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
        const result = await chrome.storage.local.get(['scenario_running']);
        if (result.scenario_running) {
            result.scenario_running.progress = progress;
            result.scenario_running.lastUpdate = Date.now(); // Add timestamp
            await chrome.storage.local.set({ scenario_running: result.scenario_running });
            console.log('[Background] Updated scenario progress:', progress);
        }
    } catch (error) {
        console.error('[Background] Error updating scenario progress:', error);
    }
}

// Diagnostic function to check for stuck scenarios
async function checkForStuckScenarios() {
    try {
        const result = await chrome.storage.local.get(['scenario_running']);
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