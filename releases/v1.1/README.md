# Incident Injector

A Chrome extension for incident response testing and resilience training.

## Overview

Incident Injector is a defensive security tool designed to help organizations test and improve their incident response procedures. The extension simulates realistic failure scenarios by intercepting user interactions and creating corresponding PagerDuty incidents, enabling teams to practice their response workflows in a controlled environment.

## Getting Started

### Prerequisites

- Google Chrome browser (version 88 or higher)
- PagerDuty Events API v2 integration key
- Administrative access to install browser extensions

### Installation from Releases

1. **Download the latest release**
   - Navigate to the [Releases](../../releases) page
   - Download `incident-injector-v1.1.zip`
   - Extract the ZIP file to a local directory

2. **Install in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" using the toggle in the top right corner
   - Click "Load unpacked" and select the extracted `v1.1` folder
   - The extension icon should appear in your browser toolbar

3. **Initial Configuration**
   - Click the extension icon to open the configuration panel
   - Enter your PagerDuty Events API v2 integration key
   - Configure your preferred incident simulation settings

### Configuration

#### PagerDuty Integration

1. Obtain an Events API v2 integration key from your PagerDuty service
2. In the extension popup, navigate to "PagerDuty Configuration"
3. Enter your integration key and save

#### Simulation Settings

- **Custom Alert Messages**: Configure error messages displayed during simulated failures
- **500 Error Pages**: Enable realistic server error page redirects with incident tracking
- **Click Interception**: Customize which button texts trigger incident simulations
- **Scenario Testing**: Load and execute complex multi-step incident scenarios

## Features

### Core Functionality

- **Automated Incident Creation**: Generates PagerDuty incidents based on user interactions
- **Realistic Error Simulation**: Displays professional error pages mimicking production failures
- **Click Interception**: Monitors and responds to specific user interface elements
- **Scenario-Based Testing**: Supports complex, multi-step incident response scenarios

### Advanced Capabilities

- **Template Variables**: Dynamic incident details using configurable variables
- **Batch Event Processing**: Efficient handling of multiple incident events
- **Debug Logging**: Comprehensive logging for troubleshooting and verification
- **Visual Indicators**: Clear UI feedback during active simulations

## Usage

### Basic Incident Simulation

1. Navigate to any website with form elements
2. Ensure the extension is active (green indicator in toolbar)
3. Click on configured target elements (buttons, forms, etc.)
4. Monitor PagerDuty for generated incidents

### Scenario Testing

1. Load a scenario definition file via the extension popup
2. Select the desired scenario from the dropdown menu
3. Click "Test Current Scenario" to execute
4. Monitor scenario progress through visual indicators

### Event Definitions

The extension supports JSON-formatted event definition files containing:

- Multiple incident scenarios
- Configurable delay patterns
- Custom incident details and metadata
- Template variable substitution

## Version History

### Version 1.1

**Release Date**: August 2025

**Improvements:**
- Resolved click interception race condition
- Enhanced scenario execution indicators
- Improved error page authenticity
- Comprehensive error handling implementation
- Automatic target element configuration
- Extended debugging capabilities

### Version 1.0

**Release Date**: December 2024

- Initial release with core functionality
- Basic PagerDuty integration
- Simple click interception
- Foundation scenario system

## Security Considerations

### Intended Use

This extension is designed exclusively for **defensive security purposes**:

- Incident response training and preparation
- System resilience testing
- Team readiness assessment
- Workflow validation exercises

### Restrictions

- **Authorized Testing Only**: Use only on systems you own or have explicit permission to test
- **No Malicious Intent**: This tool must not be used for unauthorized testing or malicious purposes
- **Data Protection**: Ensure compliance with organizational data protection policies

## Support

For technical support, bug reports, or feature requests:

1. Check the [GitHub Issues](../../issues) page for existing discussions
2. Create a new issue with detailed information about your concern
3. Contact your security team for organization-specific support

## Technical Specifications

- **Platform**: Google Chrome (Manifest v3)
- **Dependencies**: None (standalone extension)
- **API Integration**: PagerDuty Events API v2
- **File Size**: ~50KB (compressed distribution)
- **Permissions**: Storage, Active Tab, Notifications

---

**Incident Injector v1.1** | [GitHub Repository](../../) | [Report Issues](../../issues)