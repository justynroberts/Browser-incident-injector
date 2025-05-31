// Incident Injector - Content Script
(function() {
    'use strict';

    let extensionEnabled = true;
    let showAlert = true;
    let allowFormContinuation = false;
    let redirectTo500 = false;
    let runScenarioOnSubmit = false;
    let customAlertMessage = "Oops ⛓️‍💥 Error: UX Failure -  Our team are Working on it now.";
    let targetElementTexts = []; // No defaults - user must configure
    let lastSubmissionTime = 0;
    const SUBMISSION_COOLDOWN = 0; // No cooldown - allow immediate resubmission
    let lastProcessedElement = null;
    let lastProcessedTime = 0;
    let toggleButtonVisible = true; // Control visibility of the toggle button

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
        'toggle_button_visible'
    ], (result) => {
        extensionEnabled = result.extension_enabled !== false; // Default to true
        showAlert = result.show_alert !== false; // Default to true
        allowFormContinuation = result.allow_form_continuation || false;
        redirectTo500 = result.redirect_to_500 || false;
        
        // Only enable run_scenario_on_submit if there's an active scenario
        const hasActiveScenario = result.active_scenario_id && result.active_scenario_id.trim() !== '';
        // Default run_scenario_on_submit to true if not explicitly set to false
        const shouldRunScenario = result.run_scenario_on_submit !== false;
        runScenarioOnSubmit = hasActiveScenario && shouldRunScenario;
        
        console.log('[PagerDuty Simulator] Initial settings loaded:', {
            extensionEnabled,
            showAlert,
            allowFormContinuation,
            redirectTo500,
            hasActiveScenario,
            shouldRunScenario,
            runScenarioOnSubmit,
            activeScenarioId: result.active_scenario_id
        });
        
        customAlertMessage = result.custom_alert_message || customAlertMessage;
        if (result.target_element_texts && result.target_element_texts.trim()) {
            targetElementTexts = result.target_element_texts.split(',').map(text => text.trim().toLowerCase());
        }
        
        // Load toggle button visibility setting (default to true if not set)
        toggleButtonVisible = result.toggle_button_visible !== false;
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if (changes.extension_enabled) {
                extensionEnabled = changes.extension_enabled.newValue;
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
        if (!extensionEnabled) return;

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

        // Show alert if extension is enabled
        if (extensionEnabled) {
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

        // Show alert if extension is enabled
        if (extensionEnabled) {
            showAlertMessage(customAlertMessage);
        }

        // Handle post-alert actions
        const delay = showAlert ? 1000 : 100; // Shorter delay if no alert
        setTimeout(() => {
            console.log('[PagerDuty Simulator] Post-alert actions - redirectTo500:', redirectTo500, 'allowFormContinuation:', allowFormContinuation);
            
            if (redirectTo500) {
                // Redirect to a 500 error page
                console.log('[PagerDuty Simulator] Redirecting to 500 error page...');
                try {
                    // Simple approach - redirect to a basic error page
                    document.open();
                    document.write(`
                        <html>
                            <head>
                                <title>500 Internal Server Error</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <style>
                                    * { margin: 0; padding: 0; box-sizing: border-box; }
                                    body {
                                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                        min-height: 100vh;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        color: #333;
                                    }
                                    .error-container {
                                        background: rgba(255, 255, 255, 0.95);
                                        backdrop-filter: blur(10px);
                                        border-radius: 20px;
                                        padding: 60px 40px;
                                        text-align: center;
                                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                                        max-width: 600px;
                                        width: 90%;
                                        border: 1px solid rgba(255, 255, 255, 0.2);
                                    }
                                    .error-icon {
                                        font-size: 80px;
                                        margin-bottom: 20px;
                                        color: #ff6b6b;
                                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                                    }
                                    .error-code {
                                        font-size: 120px;
                                        font-weight: 800;
                                        color: #ff6b6b;
                                        margin-bottom: 10px;
                                        text-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                                        letter-spacing: -2px;
                                    }
                                    h1 {
                                        font-size: 32px;
                                        color: #2c3e50;
                                        margin-bottom: 20px;
                                        font-weight: 600;
                                    }
                                    .error-message {
                                        font-size: 18px;
                                        color: #7f8c8d;
                                        margin-bottom: 30px;
                                        line-height: 1.6;
                                    }
                                    .status-box {
                                        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                                        color: white;
                                        padding: 20px;
                                        border-radius: 12px;
                                        margin: 30px 0;
                                        font-weight: 500;
                                        box-shadow: 0 8px 16px rgba(79, 172, 254, 0.3);
                                    }
                                    .status-icon {
                                        font-size: 24px;
                                        margin-right: 10px;
                                        vertical-align: middle;
                                    }
                                    .details {
                                        background: #f8f9fa;
                                        border-radius: 12px;
                                        padding: 25px;
                                        margin: 25px 0;
                                        text-align: left;
                                        border-left: 4px solid #ff6b6b;
                                    }
                                    .details h3 {
                                        color: #2c3e50;
                                        margin-bottom: 15px;
                                        font-size: 18px;
                                    }
                                    .details p {
                                        margin: 8px 0;
                                        color: #5a6c7d;
                                        font-size: 14px;
                                    }
                                    .details strong {
                                        color: #2c3e50;
                                        font-weight: 600;
                                    }
                                    .timestamp {
                                        color: #95a5a6;
                                        font-family: 'Monaco', 'Menlo', monospace;
                                        font-size: 12px;
                                    }
                                    .back-button {
                                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                        color: white;
                                        border: none;
                                        padding: 15px 30px;
                                        border-radius: 25px;
                                        font-size: 16px;
                                        font-weight: 600;
                                        cursor: pointer;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                                        margin-top: 20px;
                                    }
                                    .back-button:hover {
                                        transform: translateY(-2px);
                                        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
                                    }
                                    @media (max-width: 768px) {
                                        .error-container { padding: 40px 20px; }
                                        .error-code { font-size: 80px; }
                                        h1 { font-size: 24px; }
                                        .error-message { font-size: 16px; }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="error-container">
                                    <div class="error-icon">⚠️</div>
                                    <div class="error-code">500</div>
                                    <h1>Internal Server Error</h1>
                                    <p class="error-message">We're experiencing technical difficulties and our team has been automatically notified.</p>
                                    
                                    <div class="status-box">
                                        <span class="status-icon">🔧</span>
                                        We are working now on solving this issue
                                    </div>
                                    
                                    <div class="details">
                                        <h3>Technical Information</h3>
                                        <p><strong>Error Code:</strong> HTTP 500 Internal Server Error</p>
                                        <p><strong>Timestamp:</strong> <span class="timestamp">${new Date().toLocaleString()}</span></p>
                                        <p><strong>Request URL:</strong> ${window.location.href}</p>
                                        <p><strong>Incident ID:</strong> #${Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                                    </div>
                                    
                                    <p style="color: #7f8c8d; margin-bottom: 20px;">Please try again in a few minutes or contact support if the problem persists.</p>
                                    
                                    <button class="back-button" onclick="history.back()">← Go Back</button>
                                </div>
                            </body>
                        </html>
                    `);
                    document.close();
                } catch (e) {
                    console.error('[PagerDuty Simulator] Error creating 500 page:', e);
                    // Fallback - just replace the body content
                    document.body.innerHTML = `
                        <div style="
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0;
                            padding: 20px;
                            box-sizing: border-box;
                        ">
                            <div style="
                                background: rgba(255, 255, 255, 0.95);
                                backdrop-filter: blur(10px);
                                border-radius: 20px;
                                padding: 60px 40px;
                                text-align: center;
                                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                                max-width: 600px;
                                width: 100%;
                            ">
                                <div style="font-size: 80px; margin-bottom: 20px;">⚠️</div>
                                <div style="font-size: 120px; font-weight: 800; color: #ff6b6b; margin-bottom: 10px; text-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">500</div>
                                <h1 style="font-size: 32px; color: #2c3e50; margin-bottom: 20px; font-weight: 600;">Internal Server Error</h1>
                                <p style="font-size: 18px; color: #7f8c8d; margin-bottom: 30px;">We're experiencing technical difficulties and our team has been automatically notified.</p>
                                <div style="
                                    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                                    color: white;
                                    padding: 20px;
                                    border-radius: 12px;
                                    margin: 30px 0;
                                    font-weight: 500;
                                    box-shadow: 0 8px 16px rgba(79, 172, 254, 0.3);
                                ">
                                    <span style="font-size: 24px; margin-right: 10px;">🔧</span>
                                    We are working now on solving this issue
                                </div>
                                <p style="color: #7f8c8d; margin-bottom: 20px;">Please try again in a few minutes or contact support if the problem persists.</p>
                                <p style="color: #95a5a6; font-size: 12px;">Incident ID: #${Math.random().toString(36).substr(2, 9).toUpperCase()} | ${new Date().toLocaleString()}</p>
                                <button onclick="history.back()" style="
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    border: none;
                                    padding: 15px 30px;
                                    border-radius: 25px;
                                    font-size: 16px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    margin-top: 20px;
                                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                                ">← Go Back</button>
                            </div>
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
        console.log('[PagerDuty Simulator] Click event detected on element:', event.target.tagName,
            event.target.textContent ? event.target.textContent.substring(0, 20) + '...' : '(no text)');
            
        if (!extensionEnabled) {
            console.log('[PagerDuty Simulator] Extension disabled, ignoring click');
            return;
        }
        
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
        console.log('[PagerDuty Simulator] Initializing event listeners with extension enabled:', extensionEnabled);
        console.log('[PagerDuty Simulator] Target texts:', targetElementTexts);
        
        // Remove any existing listeners first to prevent duplicates
        document.removeEventListener('submit', handleFormSubmission, true);
        document.removeEventListener('click', handleElementClick, true);
        
        // Always add form submission listener
        document.addEventListener('submit', handleFormSubmission, true);
        console.log('[PagerDuty Simulator] Form submit listener added');
        
        // Always add click listener, even if no target texts are configured yet
        document.addEventListener('click', handleElementClick, true);
        console.log('[PagerDuty Simulator] Click listener added',
            targetElementTexts.length > 0 ? `for target texts: ${targetElementTexts}` : '(no target texts configured yet)');

        console.log('[PagerDuty Simulator] Event listeners initialized');
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
                    showAlertMessage(customAlertMessage);
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
                showAlertMessage(customAlertMessage);
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
        console.log('[Incident Injector] Initializing content script...');
        
        // Use the reinitialize function to set up listeners properly
        reinitializeListeners();
        observeFormChanges();
        interceptAjaxSubmissions();
        
        // Create toggle button if enabled
        if (toggleButtonVisible) {
            // Wait a short time for the page to fully load
            setTimeout(() => {
                createToggleButton();
            }, 500);
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