// Incident Injector - Content Script
(function() {
    'use strict';

    let extensionEnabled = true;
    let showAlert = false; // Default to false - user must opt-in
    let allowFormContinuation = false;
    let redirectTo500 = false;
    let runScenarioOnSubmit = false;
    let customAlertMessage = "Error: UX Failure - Our team are working on it now.";
    let targetElementTexts = []; // No defaults - user must configure
    let lastSubmissionTime = 0;
    const SUBMISSION_COOLDOWN = 0; // No cooldown - allow immediate resubmission
    let lastProcessedElement = null;
    let lastProcessedTime = 0;
    let toggleButtonVisible = false; // Control visibility of the toggle button - default to false (opt-in)
    let triggerOnClickEnabled = true; // Control click interception functionality - default to true

    // Load extension settings
    chrome.storage.sync.get([
        'extension_enabled',
        'show_alert',
        'allow_form_continuation',
        'redirect_to_500',
        'run_scenario_on_submit',
        'custom_alert_message',
        'target_element_texts',
        'active_scenario_id',
        'toggle_button_visible',
        'trigger_on_click_enabled'
    ], (result) => {
        extensionEnabled = result.extension_enabled !== false; // Default to true
        showAlert = result.show_alert === true; // Default to false - must be explicitly enabled
        allowFormContinuation = result.allow_form_continuation || false;
        redirectTo500 = result.redirect_to_500 || false;
        
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
            // If no target texts are configured, set defaults
            console.log('[PagerDuty Simulator] ⚡ No target texts configured, applying defaults...');
            const defaultTargets = "sign in, login, submit, checkout, buy now, purchase, order, register, sign up";
            targetElementTexts = defaultTargets.split(',').map(text => text.trim().toLowerCase());
            
            // Update storage with defaults
            chrome.storage.sync.set({
                target_element_texts: defaultTargets
            });
            console.log('[PagerDuty Simulator] ✅ Default target texts applied:', targetElementTexts);
        }
        
        // Load toggle button visibility setting (default to false - user must opt-in)
        toggleButtonVisible = result.toggle_button_visible === true;
        
        // Load click interception setting (default to true)
        triggerOnClickEnabled = result.trigger_on_click_enabled !== false;
        
        // Reinitialize listeners after all settings are loaded
        console.log('[PagerDuty Simulator] 🔄 Settings loaded, reinitializing listeners...');
        reinitializeListeners();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if (changes.extension_enabled) {
                const wasEnabled = extensionEnabled;
                extensionEnabled = changes.extension_enabled.newValue;
                
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
            if (changes.toggle_button_visible) {
                toggleButtonVisible = changes.toggle_button_visible.newValue;
                // Update toggle button visibility
                updateToggleButtonVisibility();
            }
            if (changes.trigger_on_click_enabled) {
                triggerOnClickEnabled = changes.trigger_on_click_enabled.newValue;
                console.log('[Incident Injector] Click interception toggled:', triggerOnClickEnabled);
                // Reinitialize listeners to respect the new setting
                reinitializeListeners();
            }
        }
    });

    // Reinitialize listeners (remove old ones and add new ones)
    function reinitializeListeners() {
        // Remove existing listeners
        document.removeEventListener('submit', handleFormSubmission, true);
        document.removeEventListener('click', handleElementClick, true);
        
        // Add listeners based on current configuration
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

    // Check if form should be ignored
    function shouldIgnoreForm(form) {
        if (!form) return true;
        
        // Ignore search forms
        if (form.method && form.method.toLowerCase() === 'get') {
            const action = form.action || '';
            if (action.includes('search') || action.includes('query') || action.includes('find')) {
                return true;
            }
        }

        // Ignore newsletter signup forms (basic detection)
        const formHTML = form.innerHTML.toLowerCase();
        if (formHTML.includes('newsletter') || formHTML.includes('subscribe')) {
            return true;
        }

        return false;
    }

    // Extract element/form data
    function extractFormData(form, clickedElement) {
        const element = clickedElement || form;
        const elementType = element ? element.tagName.toLowerCase() : 'unknown';
        const elementText = element ? (element.textContent || element.value || element.alt || 'Unknown Element') : 'Unknown';
        
        const elementData = {
            url: window.location.href,
            title: document.title,
            formAction: form ? (form.action || window.location.href) : (element && element.href) || window.location.href,
            formMethod: form ? (form.method || 'GET') : 'click',
            buttonText: elementText,
            elementType: elementType,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            referrer: document.referrer || 'Direct'
        };

        console.log('[Incident Injector] Element data extracted:', elementData);
        return elementData;
    }

    // Create incident via background script
    function createIncident(formData) {
        const now = Date.now();
        if (now - lastSubmissionTime < SUBMISSION_COOLDOWN) {
            console.log('[PagerDuty Simulator] Submission ignored due to cooldown');
            return;
        }
        lastSubmissionTime = now;

        chrome.runtime.sendMessage({
            action: "create_incident",
            data: formData
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[PagerDuty Simulator] Error sending message:', chrome.runtime.lastError);
                return;
            }
            
            if (response && response.success) {
                console.log('[PagerDuty Simulator] Incident created successfully:', response.incidentId);
            } else {
                console.error('[PagerDuty Simulator] Failed to create incident:', response?.error);
            }
        });
    }

    // Show alert with fallback for CSP restrictions
    function showAlertMessage(message) {
        try {
            alert(message);
        } catch (e) {
            // Fallback for sites with strict CSP
            console.warn('[PagerDuty Simulator] Alert blocked by CSP, using console message');
            console.log(`%c${message}`, 'color: red; font-size: 16px; font-weight: bold;');
            
            // Try to create a custom modal as fallback
            createCustomAlert(message);
        }
    }

    // Custom alert modal for CSP-restricted sites
    function createCustomAlert(message) {
        const existingAlert = document.getElementById('pagerduty-simulator-alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alertDiv = document.createElement('div');
        alertDiv.id = 'pagerduty-simulator-alert';
        
        // Set styles individually to avoid CSP issues
        alertDiv.style.position = 'fixed';
        alertDiv.style.top = '20px';
        alertDiv.style.right = '20px';
        alertDiv.style.background = '#ff4444';
        alertDiv.style.color = 'white';
        alertDiv.style.padding = '15px';
        alertDiv.style.borderRadius = '5px';
        alertDiv.style.zIndex = '999999';
        alertDiv.style.fontFamily = 'Arial, sans-serif';
        alertDiv.style.fontSize = '14px';
        alertDiv.style.maxWidth = '300px';
        alertDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        alertDiv.style.border = '1px solid #cc0000';
        alertDiv.style.fontWeight = 'bold';
        
        alertDiv.textContent = message;

        try {
            document.body.appendChild(alertDiv);
        } catch (e) {
            // If even this fails, just log to console
            console.error('[PagerDuty Simulator] Could not create alert due to CSP:', e);
            console.log(`%c${message}`, 'color: red; font-size: 16px; font-weight: bold;');
            return;
        }

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }

    // Handle form submission
    function handleFormSubmission(event, clickedElement) {
        // Exit early if extension is not enabled - don't process anything
        if (!extensionEnabled) {
            console.log('[PagerDuty Simulator] Extension disabled, allowing normal form submission');
            return;
        }

        const form = event.target.closest('form') || event.target;
        
        // Always handle form submissions, even if target texts are configured
        console.log('[PagerDuty Simulator] Processing form submission');
        
        // For forms, check if we should ignore them
        if (form && shouldIgnoreForm(form)) {
            console.log('[PagerDuty Simulator] Form ignored');
            return;
        }

        // Prevent default action
        event.preventDefault();
        event.stopPropagation();

        // Extract and send data
        const elementData = extractFormData(form, clickedElement);
        createIncident(elementData);
        
        // Always check for active scenario if extension is enabled
        // Double-check that there's an active scenario before attempting to run it
        chrome.storage.sync.get(['active_scenario_id'], (result) => {
            const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
            
            if (hasActiveScenario) {
                console.log('[PagerDuty Simulator] Running active scenario on form submission:', result.active_scenario_id);
                console.log('[PagerDuty Simulator] Sending message to background script with data:', elementData);
                chrome.runtime.sendMessage({
                    action: "run_active_scenario",
                    data: elementData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[PagerDuty Simulator] Error running scenario:', chrome.runtime.lastError);
                        return;
                    }
                    
                    if (response && response.success) {
                        console.log('[PagerDuty Simulator] Scenario executed successfully');
                    } else {
                        console.error('[PagerDuty Simulator] Failed to run scenario:', response?.error);
                    }
                });
            } else {
                console.log('[PagerDuty Simulator] No active scenario defined, skipping scenario execution');
            }
        });

        // Show alert only if both extension is enabled AND user has enabled alerts
        if (extensionEnabled && showAlert) {
            showAlertMessage(customAlertMessage);
        }

        // Continue with original action if allowed
        if (allowFormContinuation) {
            setTimeout(() => {
                if (form && form.submit) {
                    form.removeEventListener('submit', handleFormSubmission);
                    form.submit();
                    setTimeout(() => {
                        form.addEventListener('submit', handleFormSubmission);
                    }, 100);
                }
            }, 1000);
        }
    }

    // Handle element click incidents
    function handleElementIncident(event, element) {
        // Exit early if extension is not enabled
        if (!extensionEnabled) return;

        // Prevent default action (form submission or link navigation)
        event.preventDefault();
        event.stopPropagation();

        // Extract and send data
        const form = element.closest('form');
        const elementData = extractFormData(form, element);
        createIncident(elementData);
        
        // Always check for active scenario if extension is enabled
        console.log('[PagerDuty Simulator] Checking for active scenario on element click');
        // Double-check that there's an active scenario before attempting to run it
        chrome.storage.sync.get(['active_scenario_id'], (result) => {
            const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
            
            if (hasActiveScenario) {
                console.log('[PagerDuty Simulator] Running active scenario on element click:', result.active_scenario_id);
                console.log('[PagerDuty Simulator] Sending message to background script with data:', elementData);
                chrome.runtime.sendMessage({
                    action: "run_active_scenario",
                    data: elementData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[PagerDuty Simulator] Error running scenario:', chrome.runtime.lastError);
                        return;
                    }
                    
                    if (response && response.success) {
                        console.log('[PagerDuty Simulator] Scenario executed successfully');
                    } else {
                        console.error('[PagerDuty Simulator] Failed to run scenario:', response?.error);
                    }
                });
            } else {
                console.log('[PagerDuty Simulator] No active scenario defined, skipping scenario execution');
            }
        });

        // Show alert only if both extension is enabled AND user has enabled alerts
        console.log('[PagerDuty Simulator] 🔍 Debug - Click Alert check:', {
            extensionEnabled,
            showAlert,
            customAlertMessage: customAlertMessage?.substring(0, 30) + '...'
        });
        
        if (extensionEnabled && showAlert) {
            console.log('[PagerDuty Simulator] ✅ Showing custom alert message on click');
            showAlertMessage(customAlertMessage);
        } else {
            console.log('[PagerDuty Simulator] ❌ Not showing alert on click - extensionEnabled:', extensionEnabled, 'showAlert:', showAlert);
        }

        // Handle post-alert actions
        const delay = showAlert ? 1000 : 100; // Shorter delay if no alert
        setTimeout(() => {
            console.log('[PagerDuty Simulator] 🔍 Debug - Post-click actions:', {
                redirectTo500,
                allowFormContinuation,
                extensionEnabled
            });
            
            if (redirectTo500) {
                // Redirect to a 500 error page
                console.log('[PagerDuty Simulator] ✅ 500 Error option enabled - Redirecting to professional 500 error page...');
                try {
                    // Professional approach - redirect to a realistic corporate error page
                    document.open();
                    document.write(`
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
                                        <button class="btn btn-primary" onclick="window.location.reload()">
                                            🔄 Try Again
                                        </button>
                                        <button class="btn btn-secondary" onclick="history.back()">
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
                                
                                <script>
                                    // Auto-refresh every 30 seconds
                                    setTimeout(() => {
                                        const refreshBtn = document.querySelector('.btn-primary');
                                        if (refreshBtn) {
                                            refreshBtn.innerHTML = '🔄 Auto-refreshing...';
                                            refreshBtn.disabled = true;
                                        }
                                        setTimeout(() => {
                                            window.location.reload();
                                        }, 2000);
                                    }, 30000);
                                </script>
                            </body>
                        </html>
                    `);
                    document.close();
                } catch (e) {
                    console.error('[PagerDuty Simulator] Error creating 500 page:', e);
                    // Fallback - professional inline styles
                    document.body.innerHTML = `
                        <div style="
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #f5f7fa;
                            color: #2c3e50;
                            margin: 0;
                            padding: 0;
                            min-height: 100vh;
                        ">
                            <header style="
                                background: #ffffff;
                                border-bottom: 1px solid #e1e8ed;
                                padding: 20px;
                                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                            ">
                                <div style="display: flex; align-items: center; justify-content: space-between; max-width: 1200px; margin: 0 auto;">
                                    <div style="display: flex; align-items: center; font-size: 24px; font-weight: 600; color: #1e40af;">
                                        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #1e40af); border-radius: 6px; margin-right: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;">🌐</div>
                                        CloudTech Services
                                    </div>
                                    <a href="#" style="color: #6b7280; text-decoration: none; font-size: 14px;">Need help? Contact Support</a>
                                </div>
                            </header>
                            
                            <main style="max-width: 800px; margin: 80px auto; padding: 0 20px; text-align: center;">
                                <div style="font-size: 72px; font-weight: 700; color: #ef4444; margin-bottom: 24px; letter-spacing: -2px;">500</div>
                                <h1 style="font-size: 36px; font-weight: 600; color: #111827; margin-bottom: 16px;">Service Temporarily Unavailable</h1>
                                <p style="font-size: 20px; color: #6b7280; margin-bottom: 40px; font-weight: 400;">We're experiencing some technical difficulties. Our engineering team has been notified and is working to resolve this issue.</p>
                                
                                <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; margin: 40px 0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: left;">
                                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                                        <div style="width: 20px; height: 20px; background: #fbbf24; border-radius: 50%; margin-right: 12px;"></div>
                                        <div style="font-size: 18px; font-weight: 600; color: #111827;">Incident Status: Under Investigation</div>
                                    </div>
                                    <p style="color: #6b7280; font-size: 16px; margin-bottom: 24px;">Our monitoring systems have detected an issue affecting service availability. We're actively investigating the root cause and working on a resolution.</p>
                                    
                                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                                        <h4 style="color: #374151; font-size: 14px; font-weight: 600; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Incident Details</h4>
                                        <div style="margin-bottom: 8px;"><span style="color: #6b7280;">Incident ID:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">INC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}</span></div>
                                        <div style="margin-bottom: 8px;"><span style="color: #6b7280;">Started:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">${new Date().toLocaleString('en-US', { 
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: '2-digit', 
                                            hour: '2-digit', 
                                            minute: '2-digit',
                                            timeZoneName: 'short'
                                        })}</span></div>
                                        <div style="margin-bottom: 8px;"><span style="color: #6b7280;">Status:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">🔍 Investigating</span></div>
                                        <div style="margin-bottom: 8px;"><span style="color: #6b7280;">Affected Service:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">${window.location.hostname} (Production)</span></div>
                                        <div style="margin-bottom: 8px;"><span style="color: #6b7280;">Error Code:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">HTTP 500 • Database Connection Timeout</span></div>
                                        <div><span style="color: #6b7280;">Response Time:</span> <span style="color: #111827; font-family: Monaco, Consolas, monospace; font-size: 13px;">${(Math.random() * 30 + 15).toFixed(1)}s (normal: 0.2s)</span></div>
                                    </div>
                                </div>
                                
                                <div style="display: flex; gap: 16px; justify-content: center; margin-top: 40px;">
                                    <button onclick="window.location.reload()" style="padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; border: none; background: #3b82f6; color: white; transition: all 0.2s;">🔄 Try Again</button>
                                    <button onclick="history.back()" style="padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;">← Go Back</button>
                                </div>
                            </main>
                            
                            <footer style="text-align: center; padding: 40px 20px; color: #9ca3af; font-size: 14px; border-top: 1px solid #e5e7eb; margin-top: 80px; background: #ffffff;">
                                <p>© 2024 CloudTech Services • Status Page • Support • Documentation</p>
                                <p style="margin-top: 8px; font-size: 12px;">If this issue persists, please contact our support team with the incident ID above.</p>
                            </footer>
                        </div>
                    `;
                }
            } else if (allowFormContinuation) {
                // Continue with original action if allowed
                if (form && element.type === 'submit') {
                    // Handle form submission
                    form.removeEventListener('submit', handleFormSubmission);
                    if (form.submit) {
                        form.submit();
                    }
                    setTimeout(() => {
                        form.addEventListener('submit', handleFormSubmission);
                    }, 100);
                } else if (element.tagName.toLowerCase() === 'a' && element.href) {
                    // Handle link navigation
                    window.location.href = element.href;
                } else if (element.click) {
                    // Handle other clickable elements
                    element.click();
                }
            }
        }, delay);
    }

    // Handle element clicks (buttons and links)
    function handleElementClick(event) {
        // Exit early if extension is not enabled - don't process anything
        if (!extensionEnabled) {
            return;
        }
        
        console.log('[PagerDuty Simulator] Click event detected on element:', event.target.tagName,
            event.target.textContent ? event.target.textContent.substring(0, 20) + '...' : '(no text)');
        
        // If no target texts are configured, just log and return
        if (targetElementTexts.length === 0) {
            console.log('[PagerDuty Simulator] Click detected but no target texts configured');
            return;
        }
        
        console.log('[PagerDuty Simulator] Checking click against target texts:', targetElementTexts);

        // No cooldown check - allow rapid-fire triggering
        const now = Date.now();

        let element = event.target;
        let matchingElement = null;
        let matchedText = '';
        
        // Check the clicked element and its parents up to 3 levels (reduced from 5)
        for (let i = 0; i < 3 && element && element !== document; i++) {
            // Skip non-interactive elements
            const tagName = element.tagName.toLowerCase();
            if (i === 0 && !['a', 'button', 'input', 'span', 'div'].includes(tagName)) {
                element = element.parentElement;
                continue;
            }
            
            // Get element text for matching (case-insensitive)
            const elementText = (element.textContent || element.value || '').toLowerCase().trim();
            
            // Skip elements with too much text (likely containers)
            if (elementText.length > 100) {
                element = element.parentElement;
                continue;
            }
            
            // Check if element text matches any of the target texts (exact match or contains)
            const matchesTargetText = targetElementTexts.some(targetText => {
                const lowerTargetText = targetText.toLowerCase().trim();
                
                // More strict matching - either exact match or element text is short and contains target
                const exactMatch = elementText === lowerTargetText;
                const containsMatch = elementText.length <= 50 && elementText.includes(lowerTargetText);
                const attributeMatch = element.getAttribute('aria-label')?.toLowerCase().includes(lowerTargetText) ||
                                     element.title?.toLowerCase().includes(lowerTargetText) ||
                                     element.getAttribute('alt')?.toLowerCase().includes(lowerTargetText);
                
                // Log matching attempts for debugging
                if (exactMatch || containsMatch || attributeMatch) {
                    console.log(`[PagerDuty Simulator] Element text "${elementText}" matched target "${lowerTargetText}"`,
                        { exactMatch, containsMatch, attributeMatch });
                }
                
                return exactMatch || containsMatch || attributeMatch;
            });

            if (matchesTargetText) {
                matchingElement = element;
                matchedText = elementText;
                break;
            }
            
            element = element.parentElement;
        }

        // Handle any element that matches target text
        if (matchingElement) {
            // Allow processing the same element immediately
            // No duplicate prevention
            
            lastProcessedElement = matchingElement;
            lastProcessedTime = now;
            
            const elementType = matchingElement.tagName.toLowerCase();
            console.log(`[PagerDuty Simulator] Element intercepted: "${matchedText}" (${elementType})`);
            
            // Create incident for any matching element (links, buttons, etc.)
            handleElementIncident(event, matchingElement);
        }
    }

    // Initialize event listeners
    function initializeListeners() {
        console.log('[PagerDuty Simulator] 🎯 Initializing event listeners...');
        console.log('[PagerDuty Simulator] 🔍 Listener config:', {
            extensionEnabled,
            triggerOnClickEnabled,
            targetElementTexts,
            targetElementTextsLength: targetElementTexts.length
        });
        
        // Remove any existing listeners first to prevent duplicates
        document.removeEventListener('submit', handleFormSubmission, true);
        document.removeEventListener('click', handleElementClick, true);
        
        // Only add listeners if extension is enabled
        if (extensionEnabled) {
            // Always add form submission listener when extension is enabled
            document.addEventListener('submit', handleFormSubmission, true);
            console.log('[PagerDuty Simulator] Form submit listener added');
            
            // Add click listener only if click interception is enabled AND target texts are configured
            if (triggerOnClickEnabled && targetElementTexts.length > 0) {
                document.addEventListener('click', handleElementClick, true);
                console.log('[PagerDuty Simulator] Click listener added for target texts:', targetElementTexts);
            } else if (triggerOnClickEnabled && targetElementTexts.length === 0) {
                console.log('[PagerDuty Simulator] Click interception enabled but no target texts configured');
            } else {
                console.log('[PagerDuty Simulator] Click interception disabled');
            }
        } else {
            console.log('[PagerDuty Simulator] Extension disabled, no listeners added');
        }

        console.log('[PagerDuty Simulator] Event listeners initialized, extension enabled:', extensionEnabled);
    }

    // Handle dynamic content with MutationObserver
    function observeFormChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if new forms were added
                        const newForms = node.querySelectorAll ? node.querySelectorAll('form') : [];
                        if (newForms.length > 0) {
                            console.log('[PagerDuty Simulator] New forms detected:', newForms.length);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    // Intercept AJAX submissions
    function interceptAjaxSubmissions() {
        // Intercept fetch
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [url, options] = args;
            if (options && options.method && options.method.toLowerCase() === 'post') {
                console.log('[PagerDuty Simulator] AJAX POST detected via fetch:', url);
                
                if (extensionEnabled) {
                    const formData = {
                        url: window.location.href,
                        title: document.title,
                        formAction: url,
                        formMethod: 'POST',
                        buttonText: 'AJAX Submit',
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent,
                        referrer: document.referrer || 'Direct'
                    };
                    
                    createIncident(formData);
                    if (showAlert) {
                        showAlertMessage(customAlertMessage);
                    }
                }
            }
            
            return originalFetch.apply(this, args);
        };

        // Intercept XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._method = method;
            this._url = url;
            return originalXHROpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
            if (this._method && this._method.toLowerCase() === 'post' && extensionEnabled) {
                console.log('[PagerDuty Simulator] AJAX POST detected via XMLHttpRequest:', this._url);
                
                const formData = {
                    url: window.location.href,
                    title: document.title,
                    formAction: this._url,
                    formMethod: 'POST',
                    buttonText: 'AJAX Submit',
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    referrer: document.referrer || 'Direct'
                };
                
                createIncident(formData);
                if (showAlert) {
                    showAlertMessage(customAlertMessage);
                }
            }
            
            return originalXHRSend.apply(this, arguments);
        };
    }

    // Create and add the toggle button to open the extension popup
    function createToggleButton() {
        // Check if button already exists
        const existingButton = document.getElementById('pagerduty-toggle-button');
        if (existingButton) {
            return existingButton;
        }
        
        // Create the button element
        const toggleButton = document.createElement('div');
        toggleButton.id = 'pagerduty-toggle-button';
        
        // Set styles individually to avoid CSP issues
        toggleButton.style.position = 'fixed';
        toggleButton.style.bottom = '20px';
        toggleButton.style.right = '20px';
        toggleButton.style.width = '50px';
        toggleButton.style.height = '50px';
        toggleButton.style.borderRadius = '50%';
        toggleButton.style.backgroundColor = extensionEnabled ? '#06ac38' : '#ccc';
        toggleButton.style.color = 'white';
        toggleButton.style.display = 'flex';
        toggleButton.style.alignItems = 'center';
        toggleButton.style.justifyContent = 'center';
        toggleButton.style.fontSize = '24px';
        toggleButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.zIndex = '999999';
        toggleButton.style.transition = 'all 0.3s ease';
        toggleButton.style.border = 'none';
        toggleButton.style.fontFamily = 'Arial, sans-serif';
        
        // Set button content
        toggleButton.textContent = '🚨';
        
        // Add hover effect
        toggleButton.addEventListener('mouseover', () => {
            toggleButton.style.transform = 'scale(1.1)';
            toggleButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
        });
        
        toggleButton.addEventListener('mouseout', () => {
            toggleButton.style.transform = 'scale(1)';
            toggleButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        });
        
        // Add click handler to open the extension popup
        toggleButton.addEventListener('click', () => {
            // Send message to background script to open the popup
            chrome.runtime.sendMessage({
                action: 'open_popup'
            });
        });
        
        // Add to the page
        document.body.appendChild(toggleButton);
        
        return toggleButton;
    }
    
    // Update toggle button visibility
    function updateToggleButtonVisibility() {
        const toggleButton = document.getElementById('pagerduty-toggle-button');
        
        if (toggleButtonVisible) {
            // Create button if it doesn't exist
            if (!toggleButton) {
                createToggleButton();
            } else {
                toggleButton.style.display = 'flex';
            }
        } else {
            // Hide button if it exists
            if (toggleButton) {
                toggleButton.style.display = 'none';
            }
        }
    }
    
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
            reinitializeListeners();
            observeFormChanges();
            interceptAjaxSubmissions();
        } catch (error) {
            console.error('[Incident Injector] Error during initialization:', error);
        }
        
        // Only create toggle button if explicitly enabled by user
        if (toggleButtonVisible) {
            // Wait a short time for the page to fully load
            setTimeout(() => {
                createToggleButton();
            }, 500);
        } else {
            console.log('[Incident Injector] Toggle button disabled by user preference');
        }
        
        console.log('[Incident Injector] Content script initialized');
    }

    // Re-initialize on page changes (for SPAs)
    function reinitialize() {
        console.log('[PagerDuty Simulator] Re-initializing for page change...');
        setTimeout(() => {
            initialize();
        }, 100); // Small delay to let page settle
    }

    // Watch for page changes in SPAs
    function watchForPageChanges() {
        // Watch for URL changes
        let currentUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('[PagerDuty Simulator] URL changed to:', currentUrl);
                reinitialize();
            }
        });
        
        urlObserver.observe(document, { subtree: true, childList: true });
        
        // Also listen for popstate events (back/forward navigation)
        window.addEventListener('popstate', reinitialize);
        
        // Listen for pushstate/replacestate (programmatic navigation)
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            reinitialize();
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            reinitialize();
        };
    }

    // Start the extension
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    // Start watching for page changes
    watchForPageChanges();
})();