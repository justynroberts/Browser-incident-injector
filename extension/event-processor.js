// PagerDuty Event Definition Processor
// Handles processing and execution of PagerDuty event definition scenarios

class PagerDutyEventProcessor {
    constructor() {
        this.currentDefinition = null;
        this.currentScenario = null;
        this.isRunning = false;
        this.eventQueue = [];
        this.variables = {};
        this.dryRun = false;
        this.globalConfig = {};
        this.schemaVersion = "1.0";
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        this.maxConcurrentEvents = 3;
        this.failedEvents = [];
    }

    // Initialize the processor with configuration
    async initialize() {
        console.log("[Event Processor] Initializing event processor");
        
        // Load integration key from storage
        const result = await chrome.storage.sync.get(['pagerduty_integration_key']);
        this.integrationKey = result.pagerduty_integration_key;
        console.log("[Event Processor] Integration key loaded:", this.integrationKey ? "Present" : "Not configured");
        
        // Check if we have a current definition
        console.log("[Event Processor] Current definition:", this.currentDefinition ? "Loaded" : "Not loaded");
        
        // Initialize variables that can be used in templates
        this.resetVariables();
        
        console.log("[Event Processor] Initialization complete");
        return true;
    }

    // Reset template variables
    resetVariables() {
        // Built-in variables with improved formatting and validation
        const baseVariables = {
            timestamp: () => {
                try {
                    return new Date().toISOString();
                } catch (e) {
                    console.error("[Event Processor] Error generating timestamp:", e);
                    return new Date().toUTCString();
                }
            },
            current_time: () => {
                try {
                    return new Date().toISOString();
                } catch (e) {
                    console.error("[Event Processor] Error generating current_time:", e);
                    return new Date().toUTCString();
                }
            },
            random_number: () => {
                try {
                    // Keep random_number distinct from random_4_digit by using a different range
                    return Math.floor(Math.random() * 100000).toString();
                } catch (e) {
                    console.error("[Event Processor] Error generating random_number:", e);
                    return '0';
                }
            },
            random_4_digit: () => {
                try {
                    // Ensure exactly 4 digits by using padStart
                    const num = Math.floor(Math.random() * 10000);
                    return num.toString().padStart(4, '0');
                } catch (e) {
                    console.error("[Event Processor] Error generating random_4_digit:", e);
                    return '0000';
                }
            },
            incident_id: () => {
                try {
                    return Math.random().toString(36).substr(2, 9).toUpperCase();
                } catch (e) {
                    console.error("[Event Processor] Error generating incident_id:", e);
                    return 'INCIDENT0';
                }
            },
            scheduled_time: () => {
                try {
                    return new Date(Date.now() + 3600000).toISOString();
                } catch (e) {
                    console.error("[Event Processor] Error generating scheduled_time:", e);
                    return new Date(Date.now() + 3600000).toUTCString();
                }
            }
        };
        
        // Default values
        const defaultVariables = {
            service_name: "Web Application",
            component_name: "Frontend",
            environment: "Production"
        };
        
        // Custom variables from global config with validation
        let customVariables = {};
        if (this.globalConfig?.variables) {
            try {
                // Ensure all custom variables are strings or simple values
                customVariables = Object.entries(this.globalConfig.variables).reduce((acc, [key, value]) => {
                    if (value !== null && typeof value !== 'undefined') {
                        acc[key] = String(value);
                    }
                    return acc;
                }, {});
            } catch (e) {
                console.error("[Event Processor] Error processing custom variables:", e);
            }
        }
        
        // Combine all variables
        this.variables = {
            ...baseVariables,
            ...defaultVariables,
            ...customVariables
        };
        
        console.log("[Event Processor] Variables initialized:",
            Object.keys(this.variables).filter(key => typeof this.variables[key] !== 'function'));
    }

    // Load and validate an event definition
    loadEventDefinition(definitionJson) {
        try {
            console.log("[Event Processor] Loading event definition:",
                typeof definitionJson === 'string' ? 'String JSON' : 'Object');
            
            // Parse JSON if string is provided
            const definition = typeof definitionJson === 'string'
                ? JSON.parse(definitionJson)
                : definitionJson;
            
            // Validate schema version
            if (!definition.schema_version) {
                console.warn("[Event Processor] No schema version specified, defaulting to 1.0");
                definition.schema_version = "1.0";
            }
            this.schemaVersion = definition.schema_version;
            
            // Extract and validate global config
            if (definition.global_config) {
                if (typeof definition.global_config !== 'object') {
                    throw new Error("Global config must be an object");
                }
                this.globalConfig = definition.global_config;
                console.log("[Event Processor] Global config loaded:", this.globalConfig);
            }
            
            // Validate event definitions structure
            if (definition.event_definitions && Array.isArray(definition.event_definitions)) {
                // Validate each event definition
                definition.event_definitions.forEach((eventDef, index) => {
                    if (!eventDef.id) {
                        throw new Error(`Event definition at index ${index} must have an id`);
                    }
                    if (!eventDef.events || !Array.isArray(eventDef.events)) {
                        throw new Error(`Event definition '${eventDef.id}' must have an events array`);
                    }
                    if (eventDef.events.length === 0) {
                        throw new Error(`Event definition '${eventDef.id}' must have at least one event`);
                    }
                    if (eventDef.events.length > 50) {
                        console.warn(`[Event Processor] Warning: Event definition '${eventDef.id}' has ${eventDef.events.length} events. Large numbers of events may impact performance.`);
                    }
                    
                    // Validate each event in the definition
                    eventDef.events.forEach((event, eventIndex) => {
                        if (!event.type) {
                            throw new Error(`Event ${eventIndex} in definition '${eventDef.id}' must have a type`);
                        }
                        if (!event.summary) {
                            throw new Error(`Event ${eventIndex} in definition '${eventDef.id}' must have a summary`);
                        }
                    });
                });
                
                console.log(`[Event Processor] Loaded ${definition.event_definitions.length} event definitions`);
                this.currentDefinition = definition;
            }
            // Backward compatibility with old schema
            else if (definition.scenarios && typeof definition.scenarios === 'object') {
                // Validate each scenario
                Object.entries(definition.scenarios).forEach(([id, scenario]) => {
                    if (!Array.isArray(scenario.events)) {
                        throw new Error(`Scenario '${id}' must have an events array`);
                    }
                    if (scenario.events.length === 0) {
                        throw new Error(`Scenario '${id}' must have at least one event`);
                    }
                    if (scenario.events.length > 50) {
                        console.warn(`[Event Processor] Warning: Scenario '${id}' has ${scenario.events.length} events. Large numbers of events may impact performance.`);
                    }
                    
                    // Validate each event in the scenario
                    scenario.events.forEach((event, eventIndex) => {
                        if (!event.type) {
                            throw new Error(`Event ${eventIndex} in scenario '${id}' must have a type`);
                        }
                        if (!event.summary) {
                            throw new Error(`Event ${eventIndex} in scenario '${id}' must have a summary`);
                        }
                    });
                });
                
                console.log(`[Event Processor] Loaded ${Object.keys(definition.scenarios).length} scenarios (legacy format)`);
                this.currentDefinition = definition;
            }
            else {
                throw new Error("Event definition must contain either event_definitions array or scenarios object");
            }
            
            // Reset variables with new global config
            this.resetVariables();
            
            console.log("[Event Processor] Event definition loaded successfully");
            return true;
        } catch (error) {
            console.error("[Event Processor] Failed to load event definition:", error);
            return false;
        }
    }

    // Get list of available scenarios or event definitions
    getAvailableScenarios() {
        if (!this.currentDefinition) {
            return [];
        }
        
        // Check if we're using the new schema format
        if (this.currentDefinition.event_definitions && this.currentDefinition.event_definitions.length > 0) {
            // New schema format
            return this.currentDefinition.event_definitions.map((def, index) => ({
                id: def.id || index.toString(),
                name: def.name || `Event Definition ${index + 1}`,
                description: def.description || "",
                eventCount: (def.events && def.events.length) || 0
            }));
        }
        // Backward compatibility with old schema
        else if (this.currentDefinition.scenarios) {
            return Object.keys(this.currentDefinition.scenarios).map(key => ({
                id: key,
                name: this.currentDefinition.scenarios[key].name || key,
                description: this.currentDefinition.scenarios[key].description || "",
                eventCount: this.currentDefinition.scenarios[key].events.length || 0
            }));
        }
        
        return [];
    }

    // Run a specific scenario or event definition
    async runScenario(scenarioNameOrIndex) {
        console.log("[Event Processor] runScenario called with:", scenarioNameOrIndex);
        
        if (!this.currentDefinition) {
            console.error("[Event Processor] No event definition loaded");
            return false;
        }

        // Check if integration key is available
        if (!this.integrationKey) {
            console.error("[Event Processor] No integration key configured. Please set a PagerDuty integration key in the extension settings.");
            return false;
        }
        
        console.log("[Event Processor] Current definition schema:",
            this.currentDefinition.event_definitions ? "New schema" :
            this.currentDefinition.scenarios ? "Legacy schema" : "Unknown schema");

        // Check if we're using the new schema format
        if (this.currentDefinition.event_definitions) {
            // New schema format - scenarioNameOrIndex should be an index or name
            let eventDefinition;
            
            // If it's a number, use it as an index
            if (!isNaN(parseInt(scenarioNameOrIndex))) {
                const index = parseInt(scenarioNameOrIndex);
                eventDefinition = this.currentDefinition.event_definitions[index];
                if (!eventDefinition) {
                    console.error(`[Event Processor] Event definition at index ${index} not found`);
                    return false;
                }
            } else {
                // Otherwise, look it up by name or id
                eventDefinition = this.currentDefinition.event_definitions.find(
                    def => def.name === scenarioNameOrIndex || def.id === scenarioNameOrIndex
                );
                if (!eventDefinition) {
                    console.error(`[Event Processor] Event definition '${scenarioNameOrIndex}' not found`);
                    return false;
                }
            }
            
            console.log(`[Event Processor] Running event definition: ${eventDefinition.name || 'unnamed'}`);
            console.log(`[Event Processor] Event definition details:`, {
                id: eventDefinition.id,
                name: eventDefinition.name,
                eventCount: eventDefinition.events ? eventDefinition.events.length : 0
            });
            
            // Reset variables for this run
            this.resetVariables();
            
            // Apply event definition variables if any
            if (eventDefinition.variables) {
                try {
                    // Validate and process event definition variables
                    const processedVars = Object.entries(eventDefinition.variables).reduce((acc, [key, value]) => {
                        // Skip null/undefined values
                        if (value === null || value === undefined) {
                            console.warn(`[Event Processor] Skipping null/undefined variable: ${key}`);
                            return acc;
                        }
                        
                        // Convert to string if not a function
                        if (typeof value !== 'function') {
                            acc[key] = String(value);
                        } else {
                            acc[key] = value;
                        }
                        return acc;
                    }, {});
                    
                    // Merge with existing variables, preserving built-in functions
                    this.variables = {
                        ...this.variables,
                        ...processedVars
                    };
                    
                    console.log("[Event Processor] Applied event definition variables:",
                        Object.fromEntries(
                            Object.entries(processedVars)
                                .filter(([_, v]) => typeof v !== 'function')
                        )
                    );
                } catch (error) {
                    console.error("[Event Processor] Error applying event definition variables:", error);
                }
            }
            
            // Process each event in the definition with improved handling
            const events = eventDefinition.events || [];
            console.log(`[Event Processor] Found ${events.length} events to process`);
            
            // Process events in batches to control concurrency
            for (let i = 0; i < events.length; i += this.maxConcurrentEvents) {
                const batch = events.slice(i, i + this.maxConcurrentEvents);
                console.log(`[Event Processor] Processing batch of ${batch.length} events (${i + 1}-${Math.min(i + batch.length, events.length)} of ${events.length})`);
                
                const batchPromises = batch.map(async (event, batchIndex) => {
                    const eventIndex = i + batchIndex;
                    console.log(`[Event Processor] Processing event ${eventIndex + 1}/${events.length}:`, event);
                    
                    // Update progress before processing this event
                    const progress = Math.round((eventIndex / events.length) * 100);
                    this.updateProgress(progress, `Processing event ${eventIndex + 1}/${events.length}`);
                    
                    // Apply delay if specified
                    const delayMs = this.calculateDelay(event.delay);
                    if (delayMs > 0) {
                        console.log(`[Event Processor] Delaying for ${delayMs}ms before sending event`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                    
                    // Send event with retries
                    let lastError;
                    for (let retry = 0; retry < this.maxRetries; retry++) {
                        try {
                            const result = await this.sendEvent(event);
                            if (result.success) {
                                return result;
                            }
                            lastError = new Error(result.error || 'Unknown error');
                        } catch (error) {
                            lastError = error;
                            if (retry < this.maxRetries - 1) {
                                console.log(`[Event Processor] Retry ${retry + 1}/${this.maxRetries} for event ${eventIndex + 1} after ${this.retryDelay}ms`);
                                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                            }
                        }
                    }
                    
                    // If all retries failed, record the failure but continue processing
                    this.failedEvents.push({ event, error: lastError });
                    console.error(`[Event Processor] Failed to process event ${eventIndex + 1} after ${this.maxRetries} attempts:`, lastError);
                    return { success: false, error: lastError.message };
                });
                
                // Wait for current batch to complete before processing next batch
                await Promise.all(batchPromises);
            }
            
            // Report any failures after all events are processed
            if (this.failedEvents.length > 0) {
                console.warn(`[Event Processor] Completed with ${this.failedEvents.length} failed events:`, this.failedEvents);
            }
            
            // Mark as 100% complete
            this.updateProgress(100, 'Scenario completed successfully');
            
            console.log(`[Event Processor] Event definition '${eventDefinition.name || 'unnamed'}' completed`);
            return true;
        }
        // Backward compatibility with old schema
        else if (this.currentDefinition.scenarios) {
            const scenario = this.currentDefinition.scenarios[scenarioNameOrIndex];
            if (!scenario) {
                console.error(`[Event Processor] Scenario '${scenarioNameOrIndex}' not found`);
                return false;
            }

            console.log(`[Event Processor] Running scenario: ${scenarioNameOrIndex} (legacy format)`, scenario);
            
            // Reset variables for this run
            this.resetVariables();
            
            // Process each event in the scenario
            for (let i = 0; i < scenario.events.length; i++) {
                const event = scenario.events[i];
                console.log(`[Event Processor] Processing event ${i+1}/${scenario.events.length}:`, event);
                
                // Update progress
                const progress = Math.round((i / scenario.events.length) * 100);
                this.updateProgress(progress, `Processing event ${i + 1}/${scenario.events.length}`);
                
                // Apply delay if specified
                const delayMs = this.calculateDelay(event.delay);
                if (delayMs > 0) {
                    console.log(`[Event Processor] Delaying for ${delayMs}ms before sending event`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
                // Send the event
                await this.sendEvent(event);
            }
            
            // Mark as complete
            this.updateProgress(100, 'Scenario completed successfully');
            
            console.log(`[Event Processor] Scenario '${scenarioNameOrIndex}' completed`);
            return true;
        }
        
        console.error("[Event Processor] No valid scenarios or event definitions found");
        return false;
    }

    // Start executing a scenario
    async startScenario(scenarioId, options = {}) {
        if (this.isRunning) {
            console.warn("[Event Processor] Cannot start scenario, processor is already running");
            return false;
        }
        
        // Set options
        this.dryRun = options.dryRun || false;
        console.log(`[Event Processor] Dry run mode: ${this.dryRun ? 'ENABLED' : 'DISABLED'}`);
        
        // Run the scenario
        this.isRunning = true;
        try {
            await this.runScenario(scenarioId);
            return true;
        } catch (error) {
            console.error("[Event Processor] Error running scenario:", error);
            return false;
        } finally {
            this.isRunning = false;
        }
    }

    // Stop the current scenario execution
    stopScenario() {
        if (!this.isRunning) {
            return false;
        }
        
        this.isRunning = false;
        this.eventQueue = [];
        this.currentScenario = null;
        console.log("[Event Processor] Scenario execution stopped");
        return true;
    }

    // Process the next event in the queue
    async processNextEvent() {
        if (!this.isRunning || this.eventQueue.length === 0) {
            this.isRunning = false;
            console.log("[Event Processor] Scenario execution completed - no more events in queue");
            return;
        }
        
        // Get the next event
        const event = this.eventQueue.shift();
        console.log(`[Event Processor] Processing event ${this.currentScenario.events.length - this.eventQueue.length} of ${this.currentScenario.events.length + 1}:`, event);
        
        try {
            // Calculate delay before sending
            const delayMs = this.calculateDelay(event.delay);
            
            if (delayMs > 0) {
                console.log(`[Event Processor] Waiting for ${delayMs}ms before sending event`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            // Process the event based on type
            console.log(`[Event Processor] Sending event to PagerDuty...`);
            const result = await this.sendEvent(event);
            console.log(`[Event Processor] Event sent with result:`, result);
            
            // Process next event if there are more
            if (this.eventQueue.length > 0) {
                console.log(`[Event Processor] ${this.eventQueue.length} events remaining in queue. Processing next event...`);
                await this.processNextEvent();
            } else {
                this.isRunning = false;
                console.log("[Event Processor] Scenario execution completed - all events processed");
            }
        } catch (error) {
            console.error("[Event Processor] Error processing event:", error);
            this.isRunning = false;
        }
    }

    // Calculate delay based on delay configuration
    calculateDelay(delayConfig) {
        if (!delayConfig) return 0;
        
        if (typeof delayConfig === 'number') {
            // Fixed delay in milliseconds
            return delayConfig;
        } else if (delayConfig.type === 'fixed') {
            // Fixed delay specified with type
            return delayConfig.value || 0;
        } else if (delayConfig.type === 'random') {
            // Random delay within a range
            const min = delayConfig.min || 0;
            const max = delayConfig.max || 5000;
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        
        return 0;
    }

    // Process template strings with variable substitution and improved validation
    processTemplate(template) {
        if (typeof template !== 'string') return template;
        
        return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
            try {
                const trimmedVar = variable.trim();
                
                // Check if variable exists
                if (!this.variables.hasOwnProperty(trimmedVar)) {
                    console.warn(`[Event Processor] Variable not found: ${trimmedVar}`);
                    return match;
                }
                
                // Handle dynamic (function) variables
                if (typeof this.variables[trimmedVar] === 'function') {
                    try {
                        const value = this.variables[trimmedVar]();
                        console.log(`[Event Processor] Processed dynamic variable ${trimmedVar}:`, value);
                        return value;
                    } catch (funcError) {
                        console.error(`[Event Processor] Error executing dynamic variable ${trimmedVar}:`, funcError);
                        // Provide fallback values for built-in variables
                        switch (trimmedVar) {
                            case 'timestamp':
                            case 'current_time':
                                return new Date().toUTCString();
                            case 'random_number':
                            case 'random_4_digit':
                                return '0000';
                            case 'incident_id':
                                return 'INCIDENT0';
                            case 'scheduled_time':
                                return new Date(Date.now() + 3600000).toUTCString();
                            default:
                                return match;
                        }
                    }
                }
                
                // Handle static variables
                const value = this.variables[trimmedVar];
                if (value === null || value === undefined) {
                    console.warn(`[Event Processor] Variable ${trimmedVar} has null/undefined value`);
                    return match;
                }
                
                console.log(`[Event Processor] Processed static variable ${trimmedVar}:`, value);
                return String(value);
            } catch (error) {
                console.error(`[Event Processor] Error processing template variable ${variable}:`, error);
                return match; // Return original on error
            }
        });
    }

    // Process all templates in an object recursively
    processTemplates(obj) {
        if (obj === null || typeof obj !== 'object') {
            return this.processTemplate(obj);
        }
        
        const result = Array.isArray(obj) ? [] : {};
        
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = this.processTemplates(obj[key]);
            }
        }
        
        return result;
    }

    // Send an event to PagerDuty
    async sendEvent(event) {
        console.log("[Event Processor] sendEvent called with event:", event);
        
        if (!event || !event.type) {
            console.error("[Event Processor] Invalid event: missing type");
            throw new Error("Invalid event: missing type");
        }
        
        if (!this.integrationKey && !event.routing_key) {
            console.error("[Event Processor] No integration key configured");
            throw new Error("No integration key configured");
        }
        
        console.log("[Event Processor] Integration key available:", this.integrationKey ? "Yes" : "No");
        
        // Create payload based on event type
        let payload;
        
        switch (event.type.toLowerCase()) {
            case 'trigger':
                // If this is a change event (indicated by class="change"), use createChangePayload
                if (event.class === 'change') {
                    payload = this.createChangePayload(event);
                } else {
                    payload = this.createTriggerPayload(event);
                }
                break;
            case 'resolve':
                payload = this.createResolvePayload(event);
                break;
            case 'acknowledge':
                payload = this.createAcknowledgePayload(event);
                break;
            default:
                throw new Error(`Unsupported event type: ${event.type} (must be one of: trigger, acknowledge, resolve)`);
        }
        
        // Process templates in payload
        payload = this.processTemplates(payload);
        
        // Log the payload
        console.log(`[Event Processor] Sending ${event.type} event:`, payload);
        
        // In dry run mode, don't actually send the event
        if (this.dryRun) {
            console.log("[Event Processor] DRY RUN - Event not sent to PagerDuty");
            return { success: true, dryRun: true };
        }
        
        // Send to PagerDuty
        return await this.sendToPagerDuty(payload);
    }

    // Create payload for trigger event
    createTriggerPayload(event) {
        return {
            routing_key: event.routing_key || this.integrationKey,
            event_action: "trigger",
            dedup_key: event.dedup_key || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            payload: {
                summary: event.summary || "Incident triggered from Event Definition",
                source: event.source || "chrome-extension",
                severity: event.severity || "error",
                component: event.component || "web-application",
                group: event.group || "chrome-extension-simulator",
                class: event.class || "event-definition",
                custom_details: event.custom_details || {
                    simulation_source: "chrome-extension-event-definition"
                }
            }
        };
    }

    // Create payload for resolve event
    createResolvePayload(event) {
        if (!event.dedup_key) {
            throw new Error("Resolve event requires a dedup_key");
        }
        
        return {
            routing_key: event.routing_key || this.integrationKey,
            event_action: "resolve",
            dedup_key: event.dedup_key,
            payload: {
                summary: event.summary || "Incident resolved from Event Definition",
                source: event.source || "chrome-extension",
                severity: event.severity || "info", // Added severity field
                component: event.component || "web-application",
                group: event.group || "chrome-extension-simulator",
                class: event.class || "event-definition",
                custom_details: event.custom_details || {
                    resolution_notes: "Automatically resolved by event definition scenario",
                    simulation_source: "chrome-extension-event-definition"
                }
            }
        };
    }

    // Create payload for acknowledge event
    createAcknowledgePayload(event) {
        if (!event.dedup_key) {
            throw new Error("Acknowledge event requires a dedup_key");
        }
        
        return {
            routing_key: event.routing_key || this.integrationKey,
            event_action: "acknowledge",
            dedup_key: event.dedup_key,
            payload: {
                summary: event.summary || "Incident acknowledged from Event Definition",
                source: event.source || "chrome-extension",
                severity: event.severity || "info", // Added severity field
                component: event.component || "web-application",
                group: event.group || "chrome-extension-simulator",
                class: event.class || "event-definition",
                custom_details: event.custom_details || {
                    acknowledged_by: "Event Definition Processor",
                    simulation_source: "chrome-extension-event-definition"
                }
            }
        };
    }

    // Create payload for change event (using trigger event type with change context)
    createChangePayload(event) {
        return {
            routing_key: event.routing_key || this.integrationKey,
            event_action: "trigger", // Using trigger instead of change
            dedup_key: event.dedup_key || `change-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            payload: {
                summary: event.summary || "Change event from Event Definition",
                source: event.source || "chrome-extension",
                severity: event.severity || "info", // Added severity field
                component: event.component || "change-management",
                group: event.group || "chrome-extension-simulator",
                class: "change", // Indicate this is a change event
                custom_details: event.custom_details || {
                    change_type: event.change_type || "deployment",
                    simulation_source: "chrome-extension-event-definition"
                }
            }
        };
    }

    // Send payload to PagerDuty
    async sendToPagerDuty(payload) {
        console.log("[Event Processor] Sending payload to PagerDuty:", payload);
        
        try {
            console.log("[Event Processor] Making API request to PagerDuty");
            const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            console.log("[Event Processor] PagerDuty API response status:", response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log("[Event Processor] PagerDuty response:", result);
            
            return {
                success: true,
                dedup_key: result.dedup_key,
                message: result.message
            };
            
        } catch (error) {
            console.error("[Event Processor] PagerDuty API error:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update progress for the current scenario
    updateProgress(progress, status = '') {
        try {
            console.log(`[Event Processor] Progress update: ${progress}% - ${status}`);
            
            // Send progress update to background script
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'updateScenarioProgress',
                    progress: progress,
                    status: status
                }).catch(error => {
                    console.warn('[Event Processor] Failed to send progress update:', error);
                });
            }
        } catch (error) {
            console.warn('[Event Processor] Error updating progress:', error);
        }
    }
}

// Create singleton instance
const eventProcessor = new PagerDutyEventProcessor();

// Initialize when loaded
eventProcessor.initialize().catch(error => {
    console.error("[Event Processor] Initialization error:", error);
});