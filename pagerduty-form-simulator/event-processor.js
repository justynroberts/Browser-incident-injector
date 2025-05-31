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
        // Built-in variables
        const baseVariables = {
            timestamp: () => new Date().toISOString(),
            current_time: () => new Date().toISOString(),
            random_number: () => Math.floor(Math.random() * 10000),
            random_4_digit: () => Math.floor(1000 + Math.random() * 9000),
            incident_id: () => Math.random().toString(36).substr(2, 9).toUpperCase(),
            scheduled_time: () => new Date(Date.now() + 3600000).toISOString() // Current time + 1 hour
        };
        
        // Default values
        const defaultVariables = {
            service_name: "Web Application",
            component_name: "Frontend",
            environment: "Production"
        };
        
        // Custom variables from global config
        const customVariables = this.globalConfig?.variables || {};
        
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
            
            // Store the definition
            this.currentDefinition = definition;
            
            console.log("[Event Processor] Definition loaded, structure:",
                definition.event_definitions ? `${definition.event_definitions.length} event definitions` :
                definition.scenarios ? `${Object.keys(definition.scenarios).length} scenarios` : "Unknown structure");
            
            // Extract schema version if available
            if (definition.schema_version) {
                this.schemaVersion = definition.schema_version;
            }
            
            // Extract global config if available
            if (definition.global_config) {
                this.globalConfig = definition.global_config;
                console.log("[Event Processor] Global config loaded:", this.globalConfig);
            }
            
            // Basic validation - check for event_definitions
            if (definition.event_definitions && definition.event_definitions.length > 0) {
                // New schema format
                console.log(`[Event Processor] Loaded ${definition.event_definitions.length} event definitions`);
            }
            // Backward compatibility with old schema
            else if (definition.scenarios && Object.keys(definition.scenarios).length > 0) {
                console.log(`[Event Processor] Loaded ${Object.keys(definition.scenarios).length} scenarios (legacy format)`);
            }
            else {
                throw new Error("Event definition must contain at least one scenario or event definition");
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
                for (const [key, value] of Object.entries(eventDefinition.variables)) {
                    this.variables[key] = value;
                }
                console.log("[Event Processor] Applied event definition variables:", eventDefinition.variables);
            }
            
            // Process each event in the definition
            const events = eventDefinition.events || [];
            console.log(`[Event Processor] Found ${events.length} events to process`);
            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                console.log(`[Event Processor] Processing event ${i+1}/${events.length}:`, event);
                
                // Apply delay if specified
                const delayMs = this.calculateDelay(event.delay);
                if (delayMs > 0) {
                    console.log(`[Event Processor] Delaying for ${delayMs}ms before sending event`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
                // Send the event
                await this.sendEvent(event);
            }
            
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
                
                // Apply delay if specified
                const delayMs = this.calculateDelay(event.delay);
                if (delayMs > 0) {
                    console.log(`[Event Processor] Delaying for ${delayMs}ms before sending event`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
                // Send the event
                await this.sendEvent(event);
            }
            
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

    // Process template strings with variable substitution
    processTemplate(template) {
        if (typeof template !== 'string') return template;
        
        return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
            const trimmedVar = variable.trim();
            if (this.variables[trimmedVar]) {
                if (typeof this.variables[trimmedVar] === 'function') {
                    return this.variables[trimmedVar]();
                }
                return this.variables[trimmedVar];
            }
            return match; // Return original if variable not found
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
}

// Create singleton instance
const eventProcessor = new PagerDutyEventProcessor();

// Initialize when loaded
eventProcessor.initialize().catch(error => {
    console.error("[Event Processor] Initialization error:", error);
});