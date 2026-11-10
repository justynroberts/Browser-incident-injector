// Incident Injector - Content Script
(function() {
    'use strict';

    // Page localStorage throws in sandboxed frames and on opaque origins;
    // never let that abort the script. chrome.storage.sync stays the source of truth.
    const safeStorage = {
        get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
        set(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
    };
    
    // Prevent multiple executions of the content script
    if (window.incidentInjectorLoaded) {
        console.log('[Incident Injector] Content script already loaded, skipping');
        return;
    }
    window.incidentInjectorLoaded = true;

    // Trusted Types policy — some sites (incl. ServiceNow, Google) enforce
    // `require-trusted-types-for 'script'`, which rejects raw string
    // assignments to innerHTML/outerHTML and string args to document.write.
    // We create a pass-through policy; all HTML we assign is extension-owned,
    // so there's no injection risk from user-controlled input here.
    const trustedHTMLPolicy = (() => {
        try {
            if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
                return window.trustedTypes.createPolicy('incident-injector', {
                    createHTML: (s) => s,
                    createScriptURL: (s) => s,
                    createScript: (s) => s
                });
            }
        } catch (e) {
            console.warn('[Incident Injector] Could not create TrustedTypes policy, falling back:', e.message);
        }
        return null;
    })();
    function toTrustedHTML(html) {
        return trustedHTMLPolicy ? trustedHTMLPolicy.createHTML(html) : html;
    }

    // Attach button handlers + auto-refresh to the injected 500 page.
    // The page uses data-ii-action attributes instead of inline onclick= /
    // <script> so that sites with strict CSP (e.g. `script-src 'self'`) don't
    // block the button actions.
    function wireUp500Page() {
        try {
            document.querySelectorAll('[data-ii-action="reload"]').forEach((btn) => {
                btn.addEventListener('click', () => window.location.reload());
            });
            document.querySelectorAll('[data-ii-action="back"]').forEach((btn) => {
                btn.addEventListener('click', () => history.back());
            });
            setTimeout(() => {
                const refreshBtn = document.querySelector('[data-ii-action="reload"]');
                if (refreshBtn) {
                    refreshBtn.textContent = '🔄 Auto-refreshing...';
                    refreshBtn.disabled = true;
                }
                setTimeout(() => window.location.reload(), 2000);
            }, 30000);
        } catch (e) {
            console.warn('[Incident Injector] Could not wire up 500 page actions:', e.message);
        }
    }

    // Debug function for users to check click interception status
    window.debugClickInterception = function() {
        console.log('🔧 Click Interception Debug Info:');
        console.log('Extension Enabled:', extensionEnabled);
        console.log('Trigger On Click Enabled:', triggerOnClickEnabled);
        console.log('Target Element Texts:', targetElementTexts);
        console.log('Target Element Texts Length:', targetElementTexts.length);
        console.log('Click Listener Active:', triggerOnClickEnabled && targetElementTexts.length > 0);
        
        if (!extensionEnabled) {
            console.log('❌ Extension is disabled. Enable it in the panel.');
        } else if (!triggerOnClickEnabled) {
            console.log('❌ Click interception is disabled. Enable it in the panel under "Trigger on Click".');
        } else if (targetElementTexts.length === 0) {
            console.log('❌ No target element texts configured. Add some in the panel under "Trigger on Click".');
        } else {
            console.log('✅ Click interception should be working! Try clicking buttons with text like:', targetElementTexts.slice(0, 3));
        }
        
        return {
            extensionEnabled,
            triggerOnClickEnabled,
            targetElementTexts,
            active: extensionEnabled && triggerOnClickEnabled && targetElementTexts.length > 0
        };
    };
    
    // Helper function to safely send messages to background script
    function safeRuntimeSendMessage(message, callback = null) {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            console.error('[Content] Chrome runtime API not available');
            const errorResponse = { success: false, error: 'Chrome runtime API not available' };
            if (callback) {
                callback(errorResponse);
                return;
            }
            return Promise.resolve(errorResponse);
        }
        
        if (callback) {
            return chrome.runtime.sendMessage(message, callback);
        } else {
            return chrome.runtime.sendMessage(message);
        }
    }
    console.log('[Incident Injector] Loading content script...');

    // Check localStorage for persisted state before applying defaults
    const savedExtensionEnabled = safeStorage.get('incident_injector_extension_enabled');
    const savedTriggerOnClick = safeStorage.get('incident_injector_trigger_on_click');

    // Use saved state if available, otherwise default to true (enabled for immediate use)
    let extensionEnabled = savedExtensionEnabled !== null ? savedExtensionEnabled === 'true' : true;
    let showAlert = false; // Default to false - user must opt-in
    let allowFormContinuation = false;
    let redirectTo500 = false;
    let runScenarioOnSubmit = false;
    let triggerCrux = false; // Default to false - user must opt-in
    let cruxUrl = ''; // Crux event URL
    let customAlertMessage = "Error: UX Failure - Our team are working on it now.";
    let targetElementTexts = []; // Will be loaded from storage with sensible defaults
    let triggerOnClickEnabled = savedTriggerOnClick !== null ? savedTriggerOnClick === 'true' : true; // Use saved state or default to true

    // Load extension settings
    chrome.storage.sync.get([
        'extension_enabled',
        'show_alert',
        'allow_form_continuation',
        'redirect_to_500',
        'trigger_crux',
        'crux_url',
        'run_scenario_on_submit',
        'custom_alert_message',
        'target_element_texts',
        'active_scenario_id',
        'trigger_on_click_enabled'
    ], (result) => {
        // Check if chrome.storage has a value, if not use localStorage, if not use true
        if (result.extension_enabled !== undefined) {
            extensionEnabled = result.extension_enabled;
            // Save to localStorage for persistence
            safeStorage.set('incident_injector_extension_enabled', extensionEnabled.toString());
        } else if (savedExtensionEnabled === null) {
            // No stored value anywhere, use true as default (enabled)
            extensionEnabled = true;
            safeStorage.set('incident_injector_extension_enabled', 'true');
        }
        // Otherwise keep the localStorage value we loaded initially
        showAlert = result.show_alert === true; // Default to false - must be explicitly enabled
        allowFormContinuation = result.allow_form_continuation || false;
        redirectTo500 = result.redirect_to_500 || false;
        triggerCrux = result.trigger_crux === true; // Default to false - must be explicitly enabled
        cruxUrl = result.crux_url || '';
        
        // Only enable run_scenario_on_submit if there's an active scenario
        const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
        // Default run_scenario_on_submit to true if not explicitly set to false
        const shouldRunScenario = result.run_scenario_on_submit !== false;
        runScenarioOnSubmit = hasActiveScenario && shouldRunScenario;
        
        console.log('[PagerDuty Simulator] 🔧 Initial settings loaded:', {
            extensionEnabled,
            showAlert,
            allowFormContinuation,
            redirectTo500,
            triggerCrux,
            cruxUrl: cruxUrl ? `${cruxUrl.length} chars` : 'empty',
            hasActiveScenario,
            shouldRunScenario,
            runScenarioOnSubmit,
            activeScenarioId: result.active_scenario_id,
            triggerOnClickEnabled,
            targetElementTexts,
            targetElementTextsLength: targetElementTexts.length
        });
        
        customAlertMessage = result.custom_alert_message || customAlertMessage;
        
        console.log('[PagerDuty Simulator] 🔍 Target texts raw:', result.target_element_texts);
        
        if (result.target_element_texts && result.target_element_texts.trim()) {
            targetElementTexts = result.target_element_texts.split(',').map(text => text.trim().toLowerCase());
            console.log('[PagerDuty Simulator] ✅ Target texts parsed:', targetElementTexts);
        } else {
            // If no target texts are configured, leave the array empty
            console.log('[PagerDuty Simulator] ⚠️ No target texts configured, click interception will be disabled');
            targetElementTexts = [];
        }
        
        // Load toggle button visibility setting (default to false - user must opt-in)
        
        // Load click interception setting
        if (result.trigger_on_click_enabled !== undefined) {
            triggerOnClickEnabled = result.trigger_on_click_enabled;
            // Save to localStorage for persistence
            safeStorage.set('incident_injector_trigger_on_click', triggerOnClickEnabled.toString());
        } else if (savedTriggerOnClick === null) {
            // No stored value anywhere, use true as default (enabled with sensible defaults)
            triggerOnClickEnabled = true;
            safeStorage.set('incident_injector_trigger_on_click', 'true');
        }
        // Otherwise keep the localStorage value we loaded initially
        
        // Debug logging for click interception settings
        console.log('[PagerDuty Simulator] 🔧 Click interception settings:', {
            triggerOnClickEnabled: triggerOnClickEnabled,
            rawValue: result.trigger_on_click_enabled,
            targetElementTextsLength: targetElementTexts.length,
            targetElementTexts: targetElementTexts
        });
        
        // Reinitialize listeners after all settings are loaded
        console.log('[PagerDuty Simulator] 🔄 Settings loaded, reinitializing listeners...');
        reinitializeListeners();
    });

    // Listen for messages from background script (for panel toggle)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'toggle_panel') {
            // all_frames: only the top frame owns the panel
            if (window.top !== window) return false;
            console.log('[Incident Injector] Received panel toggle message');
            
            Promise.resolve()
                .then(() => togglePanel())
                .then(() => sendResponse({ success: true }))
                .catch(error => {
                    console.error('[Incident Injector] Error handling panel toggle:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Keep message channel open for async response
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if (changes.extension_enabled) {
                const wasEnabled = extensionEnabled;
                extensionEnabled = changes.extension_enabled.newValue;
                // Save to localStorage for persistence
                safeStorage.set('incident_injector_extension_enabled', extensionEnabled.toString());
                
                // Reinitialize listeners when extension state changes
                if (wasEnabled !== extensionEnabled) {
                    console.log(`[PagerDuty Simulator] Extension state changed: ${wasEnabled} -> ${extensionEnabled}`);
                    reinitializeListeners();
                }
            }
            if (changes.show_alert) {
                showAlert = changes.show_alert.newValue;
            }
            if (changes.allow_form_continuation) {
                allowFormContinuation = changes.allow_form_continuation.newValue;
            }
            if (changes.redirect_to_500) {
                redirectTo500 = changes.redirect_to_500.newValue;
            }
            if (changes.trigger_crux) {
                triggerCrux = changes.trigger_crux.newValue;
                console.log('[PagerDuty Simulator] Crux trigger updated:', triggerCrux);
            }
            if (changes.crux_url) {
                cruxUrl = changes.crux_url.newValue;
                console.log('[PagerDuty Simulator] Crux URL updated:', cruxUrl ? `${cruxUrl.length} chars` : 'empty');
            }

            // Handle changes to run_scenario_on_submit or active_scenario_id
            let updateRunScenario = false;
            let runScenarioValue = runScenarioOnSubmit;
            let activeScenarioValue = null;
            
            if (changes.run_scenario_on_submit) {
                runScenarioValue = changes.run_scenario_on_submit.newValue;
                updateRunScenario = true;
            }
            
            if (changes.active_scenario_id) {
                activeScenarioValue = changes.active_scenario_id.newValue;
                updateRunScenario = true;
            }
            
            // If either value changed, we need to update runScenarioOnSubmit
            if (updateRunScenario) {
                // If active_scenario_id wasn't in the changes, get its current value
                if (activeScenarioValue === null) {
                    chrome.storage.sync.get(['active_scenario_id', 'run_scenario_on_submit'], (result) => {
                        const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
                        const shouldRunScenario = result.run_scenario_on_submit !== false; // Default to true if not explicitly set
                        runScenarioOnSubmit = hasActiveScenario && shouldRunScenario;
                        console.log('[PagerDuty Simulator] Updated runScenarioOnSubmit:', runScenarioOnSubmit,
                            'hasActiveScenario:', hasActiveScenario, 'shouldRunScenario:', shouldRunScenario);
                    });
                } else {
                    // We have both values, update directly
                    const hasActiveScenario = activeScenarioValue && activeScenarioValue.trim() !== '';
                    // If run_scenario_on_submit wasn't in the changes, get its current value
                    if (changes.run_scenario_on_submit) {
                        runScenarioOnSubmit = hasActiveScenario && changes.run_scenario_on_submit.newValue;
                    } else {
                        chrome.storage.sync.get(['run_scenario_on_submit'], (result) => {
                            const shouldRunScenario = result.run_scenario_on_submit !== false; // Default to true if not explicitly set
                            runScenarioOnSubmit = hasActiveScenario && shouldRunScenario;
                        });
                    }
                    console.log('[PagerDuty Simulator] Updated runScenarioOnSubmit:', runScenarioOnSubmit,
                        'hasActiveScenario:', hasActiveScenario, 'activeScenarioValue:', activeScenarioValue);
                }
            }
            
            if (changes.custom_alert_message) {
                customAlertMessage = changes.custom_alert_message.newValue;
            }
            if (changes.target_element_texts) {
                const newValue = changes.target_element_texts.newValue;
                if (newValue && newValue.trim()) {
                    targetElementTexts = newValue.split(',').map(text => text.trim().toLowerCase());
                } else {
                    targetElementTexts = [];
                }
                
                // Reinitialize listeners when target texts change
                console.log('[Incident Injector] Target texts changed, reinitializing...');
                reinitializeListeners();
            }
            // toggle_button_visible removed
            if (changes.trigger_on_click_enabled) {
                triggerOnClickEnabled = changes.trigger_on_click_enabled.newValue;
                // Save to localStorage for persistence
                safeStorage.set('incident_injector_trigger_on_click', triggerOnClickEnabled.toString());
                console.log('[Incident Injector] Click interception toggled:', triggerOnClickEnabled);
                // Reinitialize listeners to respect the new setting
                reinitializeListeners();
            }
        }
    });

    // Reinitialize listeners (remove old ones and add new ones)
    // Kept for the many call sites that run after a settings change. The
    // listeners themselves are attached once at document_start and read the
    // live settings on every event, so nothing is removed and re-added
    // (re-adding would queue us behind the page's own window listeners).
    function reinitializeListeners() {
        initializeListeners();
    }

    // Debounce function to prevent rapid submissions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // =====================================================================
    // Interception core
    //
    // One path for every trigger. Clicks are caught on `window` in the capture
    // phase (before site handlers on document/body), targets are resolved
    // through event.composedPath() so open shadow DOM works, and synthetic
    // clicks (`isTrusted === false`) are ignored so our own replays can never
    // loop. A submit that follows a click we already handled is not counted
    // twice.
    // =====================================================================

    const CLICKABLE_SELECTOR = [
        'button', 'a[href]', 'input[type="submit"]', 'input[type="button"]', 'input[type="image"]',
        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', 'summary'
    ].join(',');
    const LOOSE_TAGS = new Set(['DIV', 'SPAN', 'LI', 'TD', 'P', 'LABEL', 'IMG', 'SVG']);
    const MATCH_SLACK = 12;           // "Checkout (3)", "Place order →", "Sign in now"
    let lastTrigger = { el: null, time: 0 };
    const replaySubmits = new WeakSet();

    function contextAlive() {
        try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
    }

    // A content script left behind by an extension reload still has its
    // listeners but can no longer talk to the extension. Detach it so it
    // stops swallowing clicks on that tab.
    function teardownIfOrphaned() {
        if (contextAlive()) return false;
        window.removeEventListener('click', handleElementClick, true);
        window.removeEventListener('submit', handleFormSubmission, true);
        console.warn('[Incident Injector] Extension was reloaded — refresh this tab to re-arm it.');
        return true;
    }

    function normaliseText(text) {
        return (text || '').replace(/[\s ​]+/g, ' ').trim().toLowerCase();
    }

    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Visible label of a control: value for inputs, rendered text otherwise,
    // falling back to aria-label/title for icon-only buttons.
    function labelOf(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.tagName === 'INPUT') {
            return normaliseText(el.value || el.getAttribute('aria-label') || el.getAttribute('alt') || el.title);
        }
        const visible = normaliseText(typeof el.innerText === 'string' ? el.innerText : el.textContent);
        return visible || normaliseText(el.getAttribute('aria-label') || el.title || el.getAttribute('alt'));
    }

    // Exact match, or the target as a whole phrase inside a short label.
    function labelMatches(label) {
        if (!label) return null;
        for (const raw of targetElementTexts) {
            const target = normaliseText(raw);
            if (!target) continue;
            if (label === target) return raw;
            if (label.length <= target.length + MATCH_SLACK &&
                new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(target)}($|[^\\p{L}\\p{N}])`, 'u').test(label)) {
                return raw;
            }
        }
        return null;
    }

    function isInsideOwnUi(path) {
        return path.some(n => n && n.id && (n.id === 'incident-injector-panel' || n.id === 'pagerduty-simulator-alert'));
    }

    // Resolve the control the user actually clicked. Prefer real controls
    // (button, link, role=button, submit input) anywhere in the composed path;
    // fall back to short-text div/span "buttons" near the click target, which
    // many SPAs use without a role.
    function findTarget(event) {
        const path = (event.composedPath ? event.composedPath() : [event.target]).filter(n => n && n.nodeType === 1);
        if (!path.length || isInsideOwnUi(path)) return null;

        for (const el of path) {
            if (el === document.body || el === document.documentElement) break;
            if (el.matches && el.matches(CLICKABLE_SELECTOR)) {
                if (el.tagName === 'INPUT' && !/^(submit|button|image)$/i.test(el.type)) continue;
                const matched = labelMatches(labelOf(el));
                if (matched) return { el, matched };
                return null; // the user clicked a different control
            }
        }
        for (const el of path.slice(0, 4)) {
            if (!LOOSE_TAGS.has(el.tagName.toUpperCase())) continue;
            const matched = labelMatches(labelOf(el));
            if (matched) return { el, matched };
        }
        return null;
    }

    function shouldIgnoreForm(form, submitter) {
        if (!form) return false;
        if (form.getAttribute('role') === 'search') return true;
        const name = labelOf(submitter);
        return /^(search|subscribe)$/.test(name);
    }

    function extractFormData(form, clickedElement) {
        const element = clickedElement || form;
        return {
            url: window.location.href,
            title: document.title,
            formAction: form ? (form.action || window.location.href) : (element && element.href) || window.location.href,
            formMethod: form ? (form.method || 'GET') : 'click',
            buttonText: labelOf(element) || 'Unknown Element',
            elementType: element ? element.tagName.toLowerCase() : 'unknown',
            frame: window.top === window ? 'top' : 'iframe',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            referrer: document.referrer || 'Direct'
        };
    }

    function createIncident(formData) {
        safeRuntimeSendMessage({ action: 'create_incident', data: formData }, (response) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.error('[Incident Injector] Error sending incident:', chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                console.log('[Incident Injector] Incident created:', response.incidentId || response.dedupKey || '');
            } else {
                console.error('[Incident Injector] Failed to create incident:', response?.error);
            }
        });
    }

    function runActiveScenarios(elementData) {
        safeRuntimeSendMessage({ action: 'run_active_scenario', data: elementData }, (response) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.error('[Incident Injector] Error running scenarios:', chrome.runtime.lastError.message);
                return;
            }
            console.log('[Incident Injector] Scenario run:', response?.message || response?.error);
        });
    }

    // Native alert() is blocked in sandboxed frames and suppressed on some
    // sites; a DOM toast always works.
    function showAlertMessage(message) {
        try {
            alert(message);
        } catch (e) {
            createCustomAlert(message);
        }
    }

    function createCustomAlert(message) {
        document.getElementById('pagerduty-simulator-alert')?.remove();
        const alertDiv = document.createElement('div');
        alertDiv.id = 'pagerduty-simulator-alert';
        Object.assign(alertDiv.style, {
            position: 'fixed', top: '16px', right: '16px', zIndex: '2147483646',
            background: '#0c0e0d', color: '#e8ecea', borderLeft: '3px solid #f0646b',
            padding: '12px 16px', maxWidth: '320px',
            font: '500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        });
        alertDiv.textContent = message;
        (document.body || document.documentElement).appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    function triggerCruxEvent() {
        if (!triggerCrux || !cruxUrl) {
            console.log('[Incident Injector] Crux not configured or not enabled');
            return;
        }

        console.log('[Incident Injector] Triggering Crux event:', cruxUrl);

        fetch(cruxUrl, {
            method: 'GET',
            mode: 'no-cors' // Allow cross-origin requests
        }).then(() => {
            console.log('[Incident Injector] ✅ Crux event triggered successfully');
        }).catch(error => {
            console.log('[Incident Injector] ⚠️ Crux event trigger failed:', error.message);
        });
    }

    // Re-run the action we blocked (only used when an alert paused it and the
    // user wants the action to continue afterwards).
    function replayAction(el, form) {
        try {
            const isSubmitter = form && el && (el.type === 'submit' || el.type === 'image' ||
                (el.tagName === 'BUTTON' && !el.getAttribute('type')));
            if (form && (isSubmitter || !el)) {
                replaySubmits.add(form);
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit(isSubmitter ? el : undefined); // runs the site's own onsubmit
                } else {
                    form.submit();
                }
                return;
            }
            if (el && typeof el.click === 'function') {
                el.click(); // synthetic: isTrusted === false, so we ignore it
            }
        } catch (e) {
            console.warn('[Incident Injector] Could not continue original action:', e.message);
        }
    }

    function trigger(event, el, form, source, matched) {
        if (teardownIfOrphaned()) return;
        lastTrigger = { el, time: Date.now() };

        const block = showAlert || redirectTo500 || !allowFormContinuation;
        if (block) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        const elementData = extractFormData(form, el);
        elementData.matchedText = matched;
        elementData.trigger = source;
        console.log(`[Incident Injector] ${source} matched "${matched}" (${block ? 'blocked' : 'passing through'})`, elementData);

        createIncident(elementData);
        if (triggerCrux && cruxUrl) triggerCruxEvent();
        if (runScenarioOnSubmit) runActiveScenarios(elementData);
        if (showAlert) showAlertMessage(customAlertMessage);

        if (redirectTo500) {
            setTimeout(show500Page, showAlert ? 300 : 100);
        } else if (block && allowFormContinuation) {
            setTimeout(() => replayAction(el, form), showAlert ? 300 : 50);
        }
    }

    function handleElementClick(event) {
        if (!extensionEnabled || !triggerOnClickEnabled || targetElementTexts.length === 0) return;
        if (!event.isTrusted) return;
        if (event.button !== undefined && event.button !== 0) return;
        if (teardownIfOrphaned()) return;

        const hit = findTarget(event);
        if (!hit) return;
        const form = hit.el.form || hit.el.closest?.('form') || null;
        trigger(event, hit.el, form, 'click', hit.matched);
    }

    function handleFormSubmission(event) {
        if (!extensionEnabled || targetElementTexts.length === 0) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (replaySubmits.has(form)) {        // our own continuation
            replaySubmits.delete(form);
            return;
        }
        if (teardownIfOrphaned()) return;

        // Enter-key submits have no submitter; use the form's default button.
        const submitter = event.submitter ||
            form.querySelector('button[type="submit"], input[type="submit"], input[type="image"], button:not([type])');
        if (!submitter) return;
        // Already handled as a click a moment ago (and let through)
        if (lastTrigger.el === submitter && Date.now() - lastTrigger.time < 1500) return;
        if (shouldIgnoreForm(form, submitter)) return;

        const matched = labelMatches(labelOf(submitter));
        if (!matched) return;
        trigger(event, submitter, form, 'submit', matched);
    }

    // Frames hand the 500 page to the top window so it covers the whole tab.
    function show500Page() {
        if (window.top !== window) {
            try {
                window.top.postMessage({ source: 'incident-injector-frame', action: 'show_500' }, '*');
                return;
            } catch (e) { /* fall through: render in the frame */ }
        }
        render500Page();
    }

    function build500Html() {
        return `
                        <!DOCTYPE html>
                        <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Service Unavailable - CloudTech Services</title>
                                <link rel="icon" type="image/x-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌐</text></svg>">
                                <style>
                                    * { margin: 0; padding: 0; box-sizing: border-box; }
                                    body {
                                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                        background-color: #f5f7fa;
                                        color: #2c3e50;
                                        line-height: 1.6;
                                        min-height: 100vh;
                                    }
                                    .header {
                                        background: #ffffff;
                                        border-bottom: 1px solid #e1e8ed;
                                        padding: 0 20px;
                                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                                    }
                                    .header-content {
                                        max-width: 1200px;
                                        margin: 0 auto;
                                        display: flex;
                                        align-items: center;
                                        justify-content: space-between;
                                        height: 70px;
                                    }
                                    .logo {
                                        display: flex;
                                        align-items: center;
                                        font-size: 24px;
                                        font-weight: 600;
                                        color: #1e40af;
                                        text-decoration: none;
                                    }
                                    .logo-icon {
                                        width: 32px;
                                        height: 32px;
                                        background: linear-gradient(135deg, #3b82f6, #1e40af);
                                        border-radius: 6px;
                                        margin-right: 12px;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        color: white;
                                        font-size: 18px;
                                    }
                                    .support-link {
                                        color: #6b7280;
                                        text-decoration: none;
                                        font-size: 14px;
                                        transition: color 0.2s;
                                    }
                                    .support-link:hover {
                                        color: #1e40af;
                                    }
                                    .main-content {
                                        max-width: 800px;
                                        margin: 80px auto;
                                        padding: 0 20px;
                                        text-align: center;
                                    }
                                    .error-code {
                                        font-size: 72px;
                                        font-weight: 700;
                                        color: #ef4444;
                                        margin-bottom: 24px;
                                        letter-spacing: -2px;
                                    }
                                    .error-title {
                                        font-size: 36px;
                                        font-weight: 600;
                                        color: #111827;
                                        margin-bottom: 16px;
                                    }
                                    .error-subtitle {
                                        font-size: 20px;
                                        color: #6b7280;
                                        margin-bottom: 40px;
                                        font-weight: 400;
                                    }
                                    .status-card {
                                        background: #ffffff;
                                        border: 1px solid #e5e7eb;
                                        border-radius: 12px;
                                        padding: 32px;
                                        margin: 40px 0;
                                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                                        text-align: left;
                                    }
                                    .status-header {
                                        display: flex;
                                        align-items: center;
                                        margin-bottom: 20px;
                                    }
                                    .status-icon {
                                        width: 20px;
                                        height: 20px;
                                        background: #fbbf24;
                                        border-radius: 50%;
                                        margin-right: 12px;
                                        animation: pulse 2s infinite;
                                    }
                                    .status-title {
                                        font-size: 18px;
                                        font-weight: 600;
                                        color: #111827;
                                    }
                                    .status-message {
                                        color: #6b7280;
                                        font-size: 16px;
                                        margin-bottom: 24px;
                                    }
                                    .incident-details {
                                        background: #f9fafb;
                                        border: 1px solid #e5e7eb;
                                        border-radius: 8px;
                                        padding: 20px;
                                    }
                                    .incident-details h4 {
                                        color: #374151;
                                        font-size: 14px;
                                        font-weight: 600;
                                        margin-bottom: 12px;
                                        text-transform: uppercase;
                                        letter-spacing: 0.5px;
                                    }
                                    .detail-row {
                                        display: flex;
                                        justify-content: space-between;
                                        margin-bottom: 8px;
                                        font-size: 14px;
                                    }
                                    .detail-label {
                                        color: #6b7280;
                                        font-weight: 500;
                                    }
                                    .detail-value {
                                        color: #111827;
                                        font-family: 'Monaco', 'Consolas', monospace;
                                        font-size: 13px;
                                    }
                                    .actions {
                                        display: flex;
                                        gap: 16px;
                                        justify-content: center;
                                        margin-top: 40px;
                                    }
                                    .btn {
                                        padding: 12px 24px;
                                        border-radius: 8px;
                                        font-size: 16px;
                                        font-weight: 500;
                                        text-decoration: none;
                                        transition: all 0.2s;
                                        cursor: pointer;
                                        border: none;
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 8px;
                                    }
                                    .btn-primary {
                                        background: #3b82f6;
                                        color: white;
                                    }
                                    .btn-primary:hover {
                                        background: #2563eb;
                                    }
                                    .btn-secondary {
                                        background: #f3f4f6;
                                        color: #374151;
                                        border: 1px solid #d1d5db;
                                    }
                                    .btn-secondary:hover {
                                        background: #e5e7eb;
                                    }
                                    .footer {
                                        text-align: center;
                                        padding: 40px 20px;
                                        color: #9ca3af;
                                        font-size: 14px;
                                        border-top: 1px solid #e5e7eb;
                                        margin-top: 80px;
                                        background: #ffffff;
                                    }
                                    .footer a {
                                        color: #6b7280;
                                        text-decoration: none;
                                        margin: 0 12px;
                                    }
                                    .footer a:hover {
                                        color: #1e40af;
                                    }
                                    @keyframes pulse {
                                        0%, 100% { opacity: 1; }
                                        50% { opacity: 0.5; }
                                    }
                                    @media (max-width: 768px) {
                                        .header-content {
                                            flex-direction: column;
                                            height: auto;
                                            padding: 16px 0;
                                        }
                                        .main-content {
                                            margin: 40px auto;
                                            padding: 0 16px;
                                        }
                                        .error-code { font-size: 48px; }
                                        .error-title { font-size: 28px; }
                                        .error-subtitle { font-size: 18px; }
                                        .status-card { padding: 24px 16px; }
                                        .actions {
                                            flex-direction: column;
                                            align-items: stretch;
                                        }
                                        .detail-row {
                                            flex-direction: column;
                                            margin-bottom: 12px;
                                        }
                                        .detail-value {
                                            margin-top: 4px;
                                            word-break: break-all;
                                        }
                                    }
                                </style>
                            </head>
                            <body>
                                <header class="header">
                                    <div class="header-content">
                                        <a href="#" class="logo">
                                            <div class="logo-icon">🌐</div>
                                            CloudTech Services
                                        </a>
                                        <a href="#" class="support-link">Need help? Contact Support</a>
                                    </div>
                                </header>
                                
                                <main class="main-content">
                                    <div class="error-code">500</div>
                                    <h1 class="error-title">Service Temporarily Unavailable</h1>
                                    <p class="error-subtitle">We're experiencing some technical difficulties. Our engineering team has been notified and is working to resolve this issue.</p>
                                    
                                    <div class="status-card">
                                        <div class="status-header">
                                            <div class="status-icon"></div>
                                            <div class="status-title">Incident Status: Under Investigation</div>
                                        </div>
                                        <p class="status-message">
                                            Our monitoring systems have detected an issue affecting service availability. 
                                            We're actively investigating the root cause and working on a resolution.
                                        </p>
                                        
                                        <div class="incident-details">
                                            <h4>Incident Details</h4>
                                            <div class="detail-row">
                                                <span class="detail-label">Incident ID:</span>
                                                <span class="detail-value">INC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Started:</span>
                                                <span class="detail-value">${new Date().toLocaleString('en-US', { 
                                                    year: 'numeric', 
                                                    month: 'short', 
                                                    day: '2-digit', 
                                                    hour: '2-digit', 
                                                    minute: '2-digit',
                                                    timeZoneName: 'short'
                                                })}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Status:</span>
                                                <span class="detail-value">🔍 Investigating</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Affected Service:</span>
                                                <span class="detail-value">${window.location.hostname} (Production)</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Error Code:</span>
                                                <span class="detail-value">HTTP 500 • Database Connection Timeout</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Response Time:</span>
                                                <span class="detail-value">${(Math.random() * 30 + 15).toFixed(1)}s (normal: 0.2s)</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="actions">
                                        <button class="btn btn-primary" data-ii-action="reload">
                                            🔄 Try Again
                                        </button>
                                        <button class="btn btn-secondary" data-ii-action="back">
                                            ← Go Back
                                        </button>
                                    </div>
                                </main>
                                
                                <footer class="footer">
                                    <p>
                                        © 2024 CloudTech Services • 
                                        <a href="#">Status Page</a> • 
                                        <a href="#">Support</a> • 
                                        <a href="#">Documentation</a>
                                    </p>
                                    <p style="margin-top: 8px; font-size: 12px;">
                                        If this issue persists, please contact our support team with the incident ID above.
                                    </p>
                                </footer>
                                
                            </body>
                        </html>
                    `;
    }

    function render500Page() {
        // With Trusted Types enforced and our policy refused (sites that only
        // allow named policies), document.write would throw after
        // document.open() had already wiped the page. Build with DOM APIs then.
        const ttBlocked = !!window.trustedTypes && !trustedHTMLPolicy && (() => {
            try { document.createElement('div').innerHTML = '<b></b>'; return false; } catch (e) { return true; }
        })();
        if (!ttBlocked) {
            try {
                const html = toTrustedHTML(build500Html());
                document.open();
                document.write(html);
                document.close();
                wireUp500Page();
                return;
            } catch (e) {
                console.warn('[Incident Injector] document.write blocked, building 500 page with DOM APIs:', e.message);
            }
        }
        render500PageDom();
    }

    function render500PageDom() {
        const el = (tag, styles, text) => {
            const node = document.createElement(tag);
            if (styles) Object.assign(node.style, styles);
            if (text) node.textContent = text;
            return node;
        };
        const root = el('div', {
            position: 'fixed', inset: '0', zIndex: '2147483646', background: '#f5f7fa', color: '#1f2933',
            font: '16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
            padding: '24px', textAlign: 'center'
        });
        root.append(
            el('div', { fontSize: '72px', fontWeight: '700', color: '#d64545' }, '500'),
            el('h1', { fontSize: '28px', margin: '0' }, 'Service Temporarily Unavailable'),
            el('p', { maxWidth: '560px', color: '#52606d', margin: '0' },
                "We're experiencing technical difficulties. Our engineering team has been notified."),
            el('p', { font: '13px Menlo, monospace', color: '#52606d', margin: '0' },
                `Incident INC-${Date.now().toString().slice(-6)} · ${window.location.hostname} · HTTP 500`)
        );
        const actions = el('div', { display: 'flex', gap: '12px' });
        const again = el('button', { padding: '10px 20px', background: '#1f6feb', color: '#fff', border: '0', cursor: 'pointer' }, 'Try again');
        again.dataset.iiAction = 'reload';
        const back = el('button', { padding: '10px 20px', background: '#fff', border: '1px solid #cbd2d9', cursor: 'pointer' }, 'Go back');
        back.dataset.iiAction = 'back';
        actions.append(again, back);
        root.append(actions);
        try { window.stop(); } catch (e) { /* ignore */ }
        if (document.body) {
            document.body.replaceChildren(root);
        } else {
            document.documentElement.appendChild(root);
        }
        document.title = '500 Internal Server Error';
        wireUp500Page();
    }

    if (window.top === window) {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.source === 'incident-injector-frame' && event.data.action === 'show_500' && redirectTo500) {
                render500Page();
            }
        });
    }

    // Initialize event listeners
    function initializeListeners() {
        if (!contextAlive()) return;
        window.addEventListener('submit', handleFormSubmission, true);  // idempotent
        window.addEventListener('click', handleElementClick, true);
        console.log('[Incident Injector] Listening', {
            extensionEnabled, triggerOnClickEnabled, targets: targetElementTexts
        });
    }



    // Panel management variables
    let panelInstance = null;
    
    // Create and inject the panel
    // Resolves with the panel once it is in the DOM. A panel left behind by an
    // older build (different version, or markup without the scenario list) is
    // replaced instead of reused.
    let panelReadyPromise = null;
    function ensurePanel() {
        const existing = document.getElementById('incident-injector-panel');
        let version = '';
        try { version = chrome.runtime.getManifest().version; } catch (e) { /* orphaned */ }
        if (existing && (existing.dataset.version !== version || !existing.querySelector('#scenario-list'))) {
            if (!panelReadyPromise || existing.dataset.version !== version) {
                console.log('[Incident Injector] Replacing panel from an older build');
                existing.remove();
                panelReadyPromise = null;
            }
        }
        if (document.getElementById('incident-injector-panel') && panelReadyPromise) return panelReadyPromise;
        if (!panelReadyPromise) {
            panelReadyPromise = new Promise(resolve => { resolvePanelReady = resolve; });
            createPanel();
        }
        return panelReadyPromise;
    }
    let resolvePanelReady = () => {};

    function createPanel() {
        
        console.log('[Incident Injector] Creating new panel...');
        
        // Load CSS first before creating panel
        loadPanelCSS();
        
        // Create panel container
        const panel = document.createElement('div');
        panel.id = 'incident-injector-panel';
        panel.className = 'incident-injector-panel';
        try { panel.dataset.version = chrome.runtime.getManifest().version; } catch (e) { /* orphaned */ }
        panel.style.display = 'none';
        
        // Load panel HTML
        fetch(chrome.runtime.getURL('panel.html'))
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(html => {
                // Extract just the content inside the panel div
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = toTrustedHTML(html);
                const panelContent = tempDiv.querySelector('.incident-injector-panel');
                if (panelContent) {
                    panel.innerHTML = toTrustedHTML(panelContent.innerHTML);
                } else {
                    console.warn('[Incident Injector] Panel content not found in HTML, using full content');
                    panel.innerHTML = toTrustedHTML(html);
                }
                
                // Add panel to page
                (document.body || document.documentElement).appendChild(panel);
                resolvePanelReady(panel);
                
                // Initialize panel functionality with longer delay to ensure all CSS is loaded
                setTimeout(() => {
                    console.log('[Incident Injector] Initializing panel with full resources...');
                    
                    initializePanelEventListeners();
                    
                    console.log('[Incident Injector] Panel fully initialized with compact styles and fonts');
                }, 500);
                
                console.log('[Incident Injector] Panel created and initialized');
            })
            .catch(error => {
                console.error('[Incident Injector] Error loading panel HTML:', error);
                
                // Fallback: create a minimal panel structure
                panel.innerHTML = toTrustedHTML(`
                    <div class="panel-header">
                        <div class="panel-title"><span>Incident Injector</span></div>
                        <button id="panel-close" class="panel-close" aria-label="Close panel">×</button>
                    </div>
                    <div class="panel-content">
                        <div class="status-indicator">
                            <span class="status-dot inactive"></span>
                            <span>Error loading panel - Please reload page</span>
                        </div>
                    </div>
                `);
                
                // Add minimal styles with compact dimensions
                panel.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: -340px;
                    width: 320px;
                    height: 100vh;
                    background: #0f0f0f;
                    color: white;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    font-size: 13px;
                    transition: right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    display: flex;
                    flex-direction: column;
                `;
                
                (document.body || document.documentElement).appendChild(panel);
                resolvePanelReady(panel);
                // Ensure CSS and fonts are loaded even in fallback
                loadPanelCSS();
                setTimeout(() => {
                    initializePanelEventListeners();
                }, 200);
            });
        
        panelInstance = panel;
        return panel;
    }
    
    // The panel runs in the page's main world and can't see chrome.storage,
    // so forward scenario progress to it.
    function relayScenarioRunning() {
        if (!contextAlive()) return;
        chrome.storage.local.get(['scenario_running'], (result) => {
            window.postMessage({
                action: 'scenario_running_update',
                source: 'incident-injector-content',
                scenarioRunning: result.scenario_running || null
            }, '*');
        });
    }
    if (window.top === window) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.scenario_running && document.getElementById('incident-injector-panel')) {
                window.postMessage({
                    action: 'scenario_running_update',
                    source: 'incident-injector-content',
                    scenarioRunning: changes.scenario_running.newValue || null
                }, '*');
            }
        });
    }

    // Show/hide panel
    function togglePanel() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel || !panel.querySelector('#scenario-list') || !panel.dataset.version) {
            return ensurePanel().then(() => showPanel());
        }
        
        const isVisible = panel.classList.contains('visible');
        console.log('[Incident Injector] Panel visible state:', isVisible);
        if (isVisible) {
            hidePanel();
        } else {
            showPanel();
        }
    }
    
    async function showPanel() {
        const panel = document.getElementById('incident-injector-panel');
        if (panel) {
            await loadPanelCSS();
            panel.style.display = 'flex';
            
            // Force a reflow to ensure display change is processed
            panel.offsetHeight;
            
            // Add visible class to trigger CSS transition
            setTimeout(() => {
                panel.classList.add('visible');
                console.log('[Incident Injector] Added visible class - panel should slide in');
            }, 10);
            
            console.log('[Incident Injector] Panel show initiated');
        } else {
            console.error('[Incident Injector] Panel element not found for showing');
        }
    }
    
    function hidePanel() {
        const panel = document.getElementById('incident-injector-panel');
        if (panel) {
            // Trigger auto-save before hiding (for click-outside-to-close)
            const panelIframe = panel.querySelector('iframe');
            if (panelIframe) {
                try {
                    panelIframe.contentWindow.postMessage({
                        action: 'auto_save_settings',
                        source: 'incident-injector-content'
                    }, '*');
                } catch (error) {
                    console.log('[Incident Injector] Could not send auto-save message to panel:', error.message);
                }
            }

            panel.classList.remove('visible', 'animate-in');
            // Wait for animation to complete before hiding
            setTimeout(() => {
                panel.style.display = 'none';
            }, 400);
            console.log('[Incident Injector] Panel hidden');
        }
    }
    
    // Initialize panel event listeners
    function initializePanelEventListeners() {
        const panel = document.getElementById('incident-injector-panel');
        if (!panel) return;
        
        // Close button
        const closeButton = panel.querySelector('#panel-close');
        if (closeButton) {
            closeButton.addEventListener('click', hidePanel);
        }
        
        // Click outside panel to close
        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                hidePanel();
            }
        });
        
        // Listen for messages from panel
        window.addEventListener('message', (event) => {
            if (event.data.source === 'incident-injector-panel') {
                if (event.data.action === 'hide_panel') {
                    hidePanel();
                } else if (event.data.action === 'load_sample_definition') {
                    handleLoadSampleDefinition();
                } else if (event.data.action === 'request_status') {
                    handleStatusRequest();
                } else if (event.data.action === 'run_scenario_request') {
                    handleScenarioRunRequest(event.data);
                } else if (event.data.action === 'save_key_request') {
                    handleSaveKeyRequest(event.data);
                } else if (event.data.action === 'save_crux_url_request') {
                    handleSaveCruxUrlRequest(event.data);
                } else if (event.data.action === 'load_settings_request') {
                    handleLoadSettingsRequest(event.data);
                } else if (event.data.action === 'load_local_settings_request') {
                    handleLoadLocalSettingsRequest(event.data);
                } else if (event.data.action === 'update_click_config') {
                    handleClickConfigUpdate(event.data);
                } else if (event.data.action === 'save_target_elements_request') {
                    handleSaveTargetElementsRequest(event.data);
                } else if (event.data.action === 'save_alert_message_request') {
                    handleSaveAlertMessageRequest(event.data);
                } else if (event.data.action === 'save_trigger_options_request') {
                    handleSaveTriggerOptionsRequest(event.data);
                } else if (event.data.action === 'save_all_settings_request') {
                    handleSaveAllSettingsRequest(event.data);
                } else if (event.data.action === 'save_event_definition_request') {
                    handleSaveEventDefinitionRequest(event.data);
                } else if (event.data.action === 'save_scenario_selection_request') {
                    handleSaveScenarioSelectionRequest(event.data);
                } else if (event.data.action === 'request_scenario_running') {
                    relayScenarioRunning();
                }
            }
        });
        
        // Load and initialize the panel script
        loadPanelScript();
        
        console.log('[Incident Injector] Panel event listeners initialized');
    }
    
    // Load panel.css (fonts + icons live inside it). Versioned so a panel
    // stylesheet left in the page by an older build is replaced, and returns a
    // promise so the panel only slides in once it is styled.
    let panelCssReady = null;
    function loadPanelCSS() {
        if (!contextAlive()) return Promise.resolve(false);
        const version = chrome.runtime.getManifest().version;
        const current = document.getElementById('incident-injector-css');
        if (current && current.dataset.version === version && panelCssReady) return panelCssReady;

        // Drop stylesheets from older builds (they used an unversioned URL).
        document.querySelectorAll('link[href*="panel.css"]').forEach(l => l.remove());

        const link = document.createElement('link');
        link.id = 'incident-injector-css';
        link.rel = 'stylesheet';
        link.dataset.version = version;
        link.href = chrome.runtime.getURL('panel.css') + '?v=' + encodeURIComponent(version);
        panelCssReady = new Promise(resolve => {
            link.onload = () => resolve(true);
            link.onerror = () => { console.error('[Incident Injector] panel.css failed to load'); resolve(false); };
            setTimeout(() => resolve(false), 2000); // never block opening on a slow sheet
        });
        (document.head || document.documentElement).appendChild(link);
        return panelCssReady;
    }

    
    // Handle sample definition loading request from panel
    async function handleLoadSampleDefinition() {
        try {
            const response = await fetch(chrome.runtime.getURL('sample-event-definition.json'));
            const sampleData = await response.json();
            
            // Use the new format directly - no conversion needed
            const sampleDefinition = JSON.stringify(sampleData, null, 2);
            
            // Send back to panel
            window.postMessage({
                action: 'sample_definition_loaded',
                source: 'incident-injector-content',
                success: true,
                definition: sampleDefinition
            }, '*');
            
            console.log('[Incident Injector] Sample definition sent to panel');
            
        } catch (error) {
            console.error('[Incident Injector] Error loading sample definition:', error);
            
            // Send error back to panel
            window.postMessage({
                action: 'sample_definition_loaded',
                source: 'incident-injector-content',
                success: false,
                error: error.message
            }, '*');
        }
    }
    
    // Handle status request from panel
    async function handleStatusRequest() {
        try {
            console.log('[Incident Injector] Handling status request from panel...');
            
            const result = await chrome.storage.sync.get(['integration_key', 'extension_enabled']);
            const hasKey = result.integration_key && result.integration_key.length === 32;
            const enabled = result.extension_enabled !== false;
            
            let dotClass, text;
            if (!enabled) {
                dotClass = 'inactive';
                text = 'Disabled';
            } else if (!hasKey) {
                dotClass = 'warning';
                text = 'No Integration Key';
            } else {
                dotClass = 'active';
                text = 'Ready';
            }
            
            // Get last incident time
            const localResult = await chrome.storage.local.get(['last_incident_time']);
            let lastIncident = 'Never';
            if (localResult.last_incident_time) {
                const date = new Date(localResult.last_incident_time);
                lastIncident = date.toLocaleString();
            }
            
            // Send status back to panel
            window.postMessage({
                action: 'status_update',
                source: 'incident-injector-content',
                status: {
                    dotClass: dotClass,
                    text: text,
                    lastIncident: lastIncident
                }
            }, '*');
            
            console.log('[Incident Injector] Status sent to panel:', text);
            
        } catch (error) {
            console.error('[Incident Injector] Error getting status:', error);
            
            // Send error status back to panel
            window.postMessage({
                action: 'status_update',
                source: 'incident-injector-content',
                status: {
                    dotClass: 'warning',
                    text: 'Status Error',
                    lastIncident: 'Unknown'
                }
            }, '*');
        }
    }

    // Handle scenario run request from panel
    async function handleScenarioRunRequest(requestData) {
        try {
            console.log('[Content] Relaying scenario run request to background script:', requestData);
            
            // Send to background script
            const response = await safeRuntimeSendMessage({
                action: 'run_scenario',
                scenarioId: requestData.scenarioId,
                scenarioIds: requestData.scenarioIds,
                options: requestData.options
            });
            
            console.log('[Content] Background script response:', response);
            
            // Send response back to panel
            window.postMessage({
                action: 'scenario_run_response',
                source: 'incident-injector-content',
                response: response
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error relaying scenario run request:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'scenario_run_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Handle save key request from panel
    async function handleSaveKeyRequest(requestData) {
        try {
            console.log('[Content] Saving integration key, length:', requestData.key?.length);
            console.log('[Content] Key value to save:', requestData.key); // Debug log
            
            // Save to Chrome storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({ integration_key: requestData.key }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log('[Content] Integration key saved to storage successfully');
                        resolve();
                    }
                });
            });
            
            // Verify it was saved by reading it back
            const verification = await chrome.storage.sync.get(['integration_key']);
            console.log('[Content] Verification - stored key length:', verification.integration_key?.length);
            console.log('[Content] Verification - stored key value:', verification.integration_key);
            
            // Send success response back to panel
            window.postMessage({
                action: 'key_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    verified: verification.integration_key === requestData.key
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving integration key:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'key_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Handle save Crux URL request from panel
    async function handleSaveCruxUrlRequest(requestData) {
        try {
            console.log('[Content] Saving Crux URL, length:', requestData.cruxUrl?.length);

            // Save to Chrome storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({ crux_url: requestData.cruxUrl }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log('[Content] Crux URL saved to storage successfully');
                        resolve();
                    }
                });
            });

            // Update local variable
            cruxUrl = requestData.cruxUrl;

            // Send success response back to panel
            window.postMessage({
                action: 'crux_url_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true
                }
            }, '*');

        } catch (error) {
            console.error('[Content] Error saving Crux URL:', error);

            // Send error response back to panel
            window.postMessage({
                action: 'crux_url_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Handle load settings request from panel
    async function handleLoadSettingsRequest(requestData) {
        try {
            console.log('[Content] Loading settings from storage...');
            
            // Load all settings from storage
            const result = await chrome.storage.sync.get([
                'integration_key',
                'extension_enabled',
                'show_alert',
                'custom_alert_message',
                'allow_form_continuation',
                'redirect_to_500',
                'trigger_crux',
                'crux_url',
                'target_element_texts',
                'trigger_on_click_enabled',
                'run_scenario_on_submit',
                'active_scenario_id',
                'active_scenario_ids',
                'run_stagger',
                'routing_keys'
            ]);
            
            console.log('[Content] Loaded settings:', result);
            console.log('[Content] Integration key in storage:', result.integration_key ? `${result.integration_key.length} chars` : 'not set');
            console.log('[Content] Crux settings:', {
                trigger_crux: result.trigger_crux,
                crux_url: result.crux_url ? `${result.crux_url.length} chars` : 'not set'
            });
            
            // Send settings back to panel
            window.postMessage({
                action: 'settings_load_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    settings: result
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error loading settings:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'settings_load_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }
    
    // Load local storage settings handler
    async function handleLoadLocalSettingsRequest(requestData) {
        try {
            console.log('[Content] Loading local storage settings...');
            
            // Load settings from local storage
            const result = await chrome.storage.local.get(['event_definition']);
            
            console.log('[Content] Loaded local settings:', result);
            
            // Send settings back to panel
            window.postMessage({
                action: 'load_local_settings_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    settings: result
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error loading local settings:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'load_local_settings_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }
    
    // Handle click configuration updates from panel
    function handleClickConfigUpdate(data) {
        console.log('[Content] Updating click configuration:', {
            enabled: data.enabled,
            targetElements: data.targetElements
        });

        const prevEnabled = triggerOnClickEnabled;
        const prevTargets = targetElementTexts.join(',');

        // Update the global variables
        triggerOnClickEnabled = data.enabled;
        if (data.targetElements && data.targetElements.trim()) {
            targetElementTexts = data.targetElements.split(',').map(text => text.trim()).filter(text => text);
        } else {
            targetElementTexts = [];
        }

        console.log('[Content] Click configuration updated:', {
            triggerOnClickEnabled: triggerOnClickEnabled,
            targetElementTexts: targetElementTexts
        });

        // Reattach listeners so DOM state matches the new config.
        if (prevEnabled !== triggerOnClickEnabled || prevTargets !== targetElementTexts.join(',')) {
            reinitializeListeners();
        }
    }
    
    // Handle save target elements request from panel
    async function handleSaveTargetElementsRequest(requestData) {
        try {
            console.log('[Content] Saving target elements:', requestData.targetElements);
            
            // Save to storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({ target_element_texts: requestData.targetElements }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            // Update local variables
            if (requestData.targetElements && requestData.targetElements.trim()) {
                targetElementTexts = requestData.targetElements.split(',').map(text => text.trim()).filter(text => text);
            } else {
                targetElementTexts = [];
            }
            
            console.log('[Content] Target elements saved and updated:', targetElementTexts);

            // Verify it was saved by reading it back
            const verification = await chrome.storage.sync.get(['target_element_texts']);
            console.log('[Content] 🔍 Verification - stored target elements:', verification.target_element_texts);

            // Send success response back to panel
            window.postMessage({
                action: 'target_elements_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    targetElements: requestData.targetElements,
                    verified: verification.target_element_texts === requestData.targetElements
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving target elements:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'target_elements_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }
    
    // Handle save alert message request from panel
    async function handleSaveAlertMessageRequest(requestData) {
        try {
            console.log('[Content] Saving alert message:', requestData.alertMessage);
            
            // Save to storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({ custom_alert_message: requestData.alertMessage }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            // Update local variable
            customAlertMessage = requestData.alertMessage;
            
            console.log('[Content] Alert message saved successfully');
            
            // Send success response back to panel
            window.postMessage({
                action: 'alert_message_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    alertMessage: requestData.alertMessage
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving alert message:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'alert_message_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }
    
    // Handle save trigger options request from panel
    async function handleSaveTriggerOptionsRequest(requestData) {
        try {
            console.log('[Content] Saving trigger options:', requestData.options);
            
            // Save to storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set({
                    show_alert: requestData.options.show_alert,
                    run_scenario_on_submit: requestData.options.run_scenario_on_submit,
                    redirect_to_500: requestData.options.redirect_to_500,
                    allow_form_continuation: requestData.options.allow_form_continuation
                }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            // Update local variables
            showAlert = requestData.options.show_alert;
            runScenarioOnSubmit = requestData.options.run_scenario_on_submit;
            redirectTo500 = requestData.options.redirect_to_500;
            allowFormContinuation = requestData.options.allow_form_continuation;
            
            console.log('[Content] Trigger options saved successfully');
            
            // Send success response back to panel
            window.postMessage({
                action: 'trigger_options_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    options: requestData.options
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving trigger options:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'trigger_options_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Handle save all settings request from panel
    async function handleSaveAllSettingsRequest(requestData) {
        try {
            console.log('[Content] Saving all settings:', requestData.settings);
            
            // Save sync settings to storage
            await new Promise((resolve, reject) => {
                chrome.storage.sync.set(requestData.settings, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            // Save local settings (event definition) if provided
            if (requestData.localSettings && chrome.storage.local) {
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(requestData.localSettings, () => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });
                console.log('[Content] Event definition saved to local storage');
            }
            
            // Update local variables only for keys actually present in the payload.
            // This lets callers send partial updates (e.g. just extension_enabled)
            // without clobbering unrelated globals with undefined.
            const s = requestData.settings || {};
            const has = (k) => Object.prototype.hasOwnProperty.call(s, k);
            let listenerStateChanged = false;

            if (has('extension_enabled')) {
                if (extensionEnabled !== s.extension_enabled) listenerStateChanged = true;
                extensionEnabled = s.extension_enabled;
                safeStorage.set('incident_injector_extension_enabled', extensionEnabled.toString());
            }
            if (has('custom_alert_message')) customAlertMessage = s.custom_alert_message;
            if (has('show_alert')) showAlert = s.show_alert;
            if (has('run_scenario_on_submit')) runScenarioOnSubmit = s.run_scenario_on_submit;
            if (has('redirect_to_500')) redirectTo500 = s.redirect_to_500;
            if (has('trigger_crux')) triggerCrux = s.trigger_crux || false;
            if (has('crux_url')) cruxUrl = s.crux_url || '';
            if (has('allow_form_continuation')) allowFormContinuation = s.allow_form_continuation;
            if (has('trigger_on_click_enabled')) {
                if (triggerOnClickEnabled !== s.trigger_on_click_enabled) listenerStateChanged = true;
                triggerOnClickEnabled = s.trigger_on_click_enabled;
                safeStorage.set('incident_injector_trigger_on_click', triggerOnClickEnabled.toString());
            }

            // Update target elements
            if (has('target_element_texts')) {
                const prev = targetElementTexts.join(',');
                if (s.target_element_texts && s.target_element_texts.trim()) {
                    targetElementTexts = s.target_element_texts.split(',').map(text => text.trim()).filter(text => text);
                } else {
                    targetElementTexts = [];
                }
                if (prev !== targetElementTexts.join(',')) listenerStateChanged = true;
            }

            // If anything that affects listener attachment changed, reattach now
            // rather than waiting for the indirect chrome.storage.onChanged path.
            if (listenerStateChanged) {
                console.log('[Content] Listener-relevant settings changed, reinitializing listeners');
                reinitializeListeners();
            }

            console.log('[Content] All settings saved successfully');
            console.log('[Content] Updated variables:', {
                extensionEnabled,
                showAlert,
                runScenarioOnSubmit,
                redirectTo500,
                triggerCrux,
                cruxUrl: cruxUrl ? `${cruxUrl.length} chars` : 'empty',
                allowFormContinuation,
                triggerOnClickEnabled,
                targetElementTexts
            });
            
            // Send success response back to panel
            window.postMessage({
                action: 'save_all_settings_response',
                source: 'incident-injector-content',
                response: {
                    success: true,
                    settings: requestData.settings
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving all settings:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'save_all_settings_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Handle save event definition request from panel
    async function handleSaveEventDefinitionRequest(requestData) {
        try {
            console.log('[Content] Saving event definition to local storage');
            
            // Save to local storage
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ event_definition: requestData.eventDefinition }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            console.log('[Content] Event definition saved successfully');
            
            // Send success response back to panel
            window.postMessage({
                action: 'event_definition_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving event definition:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'event_definition_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }
    
    // Save scenario selection handler
    async function handleSaveScenarioSelectionRequest(requestData) {
        try {
            console.log('[Content] Saving scenario selection:', requestData.scenarioId);
            
            // Save to sync storage
            await new Promise((resolve, reject) => {
                const ids = Array.isArray(requestData.scenarioIds)
                    ? requestData.scenarioIds
                    : (requestData.scenarioId ? [requestData.scenarioId] : []);
                chrome.storage.sync.set({ active_scenario_id: ids[0] || '', active_scenario_ids: ids }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            console.log('[Content] Scenario selection saved successfully');
            
            // Send success response back to panel (optional - panel doesn't wait for response)
            window.postMessage({
                action: 'scenario_selection_save_response',
                source: 'incident-injector-content',
                response: {
                    success: true
                }
            }, '*');
            
        } catch (error) {
            console.error('[Content] Error saving scenario selection:', error);
            
            // Send error response back to panel
            window.postMessage({
                action: 'scenario_selection_save_response',
                source: 'incident-injector-content',
                response: {
                    success: false,
                    error: error.message
                }
            }, '*');
        }
    }

    // Load panel JavaScript functionality
    function loadPanelScript() {
        // Import panel.js functionality for the panel
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('panel.js');
        script.onload = () => {
            console.log('[Incident Injector] Panel script loaded');
        };
        script.onerror = (error) => {
            console.error('[Incident Injector] Error loading panel script:', error);
        };
        document.head.appendChild(script);
    }

    // Toggle button functionality completely removed
    
    // Toggle button functionality removed
    
    // Initialize the content script
    function initialize() {
        console.log('[Incident Injector] 🚀 Initializing content script...');
        console.log('[Incident Injector] 🔍 Current settings:', {
            extensionEnabled,
            triggerOnClickEnabled,
            targetElementTexts,
            targetElementTextsLength: targetElementTexts.length,
            showAlert,
            runScenarioOnSubmit,
            redirectTo500
        });
        
        try {
            // Use the reinitialize function to set up listeners properly
            // Listeners live on window (capture), so SPA navigation and
            // late-rendered forms need no re-attachment.
            reinitializeListeners();
        } catch (error) {
            console.error('[Incident Injector] Error during initialization:', error);
        }
        
        // Toggle button functionality removed
        
        console.log('[Incident Injector] Content script initialized');
    }



    // Attach before the page's scripts run (manifest: document_start).
    initializeListeners();

    // Start the extension
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();