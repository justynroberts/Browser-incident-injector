# Incident Injector - PagerDuty Form Simulator

A Chrome extension that intercepts form submissions and user interactions to trigger PagerDuty incidents, helping teams test and practice incident response procedures.

## Features

### Basic Incident Triggering
- Intercept form submissions on any website
- Intercept clicks on specific text elements
- Send PagerDuty incidents via Events API v2
- Show customizable error alerts (always shown when extension is enabled)
- Optionally redirect to a 500 error page
- Multiple incidents can be triggered in succession

### NEW: Floating Toggle Button
- Quick access to extension settings from any webpage
- Configurable visibility (can be hidden if desired)
- Visual indicator of extension status

### PagerDuty Event Definition System
- Define complex incident scenarios using JSON
- Orchestrate realistic PagerDuty event sequences
- Support for multiple event types:
  - **Trigger Events**: Create new incidents
  - **Resolve Events**: Close incidents
  - **Acknowledge Events**: Simulate team acknowledgment
  - **Change Events**: Document planned modifications
- Sophisticated timing controls between events
- Variable templates for dynamic content
- Dry-run capability for testing
- Scenarios automatically triggered on form submissions when extension is enabled

## Installation

### Developer Mode
1. Download/clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `pagerduty-form-simulator` folder
6. Extension icon should appear in toolbar

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Search for "Incident Injector"
3. Click "Add to Chrome"
4. Confirm the installation

## Setup

### PagerDuty Configuration
1. Log into PagerDuty
2. Go to **Services** → Your Service → **Integrations**
3. Add a new "Events API v2" integration
4. Copy the Integration Key (32 characters)
5. Click the extension icon in Chrome toolbar
6. Paste the Integration Key in the "Integration Key" field
7. Enable the extension toggle

### Extension Configuration Options
- **Extension Enabled**: Master toggle to enable/disable all functionality
- **Custom Alert Message**: Customize the error message shown to users (always shown when extension is enabled)
- **Run Scenario**: Automatically run the selected scenario when a form is submitted
- **Add 500 Error**: Redirect to a simulated 500 error page after form submission
- **Continue to Destination**: Allow the form to submit normally after triggering the incident
- **Element Text to Hook**: Comma-separated list of text to match on clickable elements
- **Show Toggle Button**: Display a floating button on webpages for quick access to the extension

### Scenario Configuration
1. Navigate to the "Event Definition System" section
2. Either:
   - The sample definition will be automatically loaded on first use
   - Or paste your own JSON event definition
3. Select a scenario from the dropdown
4. Optionally enable "Dry Run Mode" to test without sending actual alerts
5. Click "Run Scenario" to execute manually, or enable "Run Scenario" in the trigger options to run automatically on form submissions

## Basic Usage

### Form Interception
- Enable the extension
- Configure the integration key
- Submit any form on a website
- A PagerDuty incident will be created
- A custom alert message will be shown
- If configured, the extension will redirect to a 500 error page
- If an active scenario is selected, it will be automatically triggered

### Element Text Targeting
- Enter comma-separated text in "Element Text to Hook" field
- Any clickable element containing that text will trigger incidents
- Example: "submit,login,checkout"
- When clicked, these elements will trigger both incidents and scenarios

### Using the Toggle Button
- A floating button appears on webpages when the extension is enabled
- The button color indicates the extension status (green = enabled, gray = disabled)
- Click the button to open the extension popup
- You can hide the button in the extension settings if desired

## Event Definition System Usage

The Event Definition System allows you to create complex, multi-step incident scenarios that unfold automatically with proper timing and realistic patterns.

### Creating Event Definitions

1. Click the extension icon
2. Scroll to the "Event Definition System" section
3. The sample definition will be automatically loaded on first use
4. Or enter your own JSON definition in the textarea
5. Select a scenario from the dropdown
6. Click "Run Scenario" to execute manually

### Saving and Loading Scenario Sets

You can save your custom scenario definitions to JSON files and load them later:

1. **Save to File**: After creating or modifying a scenario definition, click "Save to File" to download it as a JSON file
2. **Load from File**: Click "Load from File" to import a previously saved scenario definition
3. The loaded scenario will be automatically validated and saved to local storage
4. Your loaded scenarios will persist between browser sessions

### Automatic Scenario Execution

When the extension is enabled and a scenario is selected:
1. The scenario will automatically run whenever a form is submitted
2. The scenario will also run when clicking on elements matching your target text
3. This allows for testing complex incident response workflows with minimal effort

### Event Definition Format

```json
{
  "scenarios": {
    "scenario_id": {
      "name": "Human-readable name",
      "description": "Scenario description",
      "events": [
        {
          "type": "trigger|resolve|acknowledge|change",
          "summary": "Event summary",
          "severity": "critical|error|warning|info",
          "component": "affected component",
          "details": { 
            "custom_field": "value",
            "another_field": "value"
          },
          "delay": {
            "type": "fixed|random",
            "value": 10000,
            "min": 5000,
            "max": 15000
          }
        }
      ]
    }
  }
}
```

### Variable Substitution

You can use these variables in your event definitions:

- `{{timestamp}}` - Current ISO timestamp
- `{{random_number}}` - Random number
- `{{incident_id}}` - Generated incident ID

### Example Scenarios

The extension includes sample scenarios for:
- Database outage with cascading effects
- Failed deployment with rollback
- Multi-service cascading failure

### Advanced Event Definitions

For advanced users who want to create custom event definitions, please refer to the [Developer Documentation](DEVELOPER.md) which provides detailed information about:

- Complete schema reference
- API field documentation
- Advanced timing configurations
- Complex scenario examples
- Best practices for realistic incident simulation

## Troubleshooting

- **No incidents created**: Verify integration key format (32 alphanumeric characters)
- **Alerts not showing**: Some sites block alerts with Content Security Policy. The extension attempts to create a custom alert div as a fallback.
- **Extension not working**: Check browser console for errors (F12 > Console tab)
- **Toggle button not appearing**: Some sites may block content scripts. Try refreshing the page or check if the "Show Toggle Button" option is enabled.
- **Scenarios not triggering**: Ensure you have selected a scenario from the dropdown and that the extension is enabled.
- **Delays not working between events**: Check that the event-processor.js file is properly calculating delays from the event definition.
- **500 error page not showing**: Some sites have strict Content Security Policies that prevent page modifications.

## Advanced Configuration

### Custom Event Definitions

For advanced users, you can create your own event definitions with complex logic:

```json
{
  "schema_version": "1.0",
  "event_definitions": [
    {
      "id": "database_outage",
      "name": "Database Outage Scenario",
      "description": "Simulates a database failure with cascading effects",
      "variables": {
        "service_name": "PostgreSQL Database",
        "component_name": "Primary DB Cluster"
      },
      "events": [
        {
          "type": "trigger",
          "summary": "{{service_name}} connection timeout",
          "severity": "critical",
          "component": "{{component_name}}",
          "delay": {
            "type": "fixed",
            "value": 10000
          }
        },
        {
          "type": "trigger",
          "summary": "API latency increased by 500%",
          "severity": "error",
          "component": "API Gateway",
          "delay": {
            "type": "fixed",
            "value": 10000
          }
        },
        {
          "type": "acknowledge",
          "summary": "DBA team investigating",
          "dedup_key": "{{incident_id}}",
          "delay": {
            "type": "fixed",
            "value": 10000
          }
        }
      ]
    }
  ]
}
```

### Browser Compatibility

The extension has been tested with:
- Google Chrome (version 100+)
- Microsoft Edge (version 100+)
- Brave Browser (version 1.40+)

## License

MIT License