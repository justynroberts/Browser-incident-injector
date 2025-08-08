# Incident Injector v1.1

## Chrome Extension for PagerDuty Incident Testing

### Overview
Incident Injector is a defensive security tool designed to test incident response procedures by simulating realistic failure scenarios. It intercepts form submissions and user interactions to create PagerDuty incidents, helping teams practice their incident response workflows.

### Key Features
- **Click Interception**: Automatically intercepts clicks on common buttons (sign in, checkout, submit, etc.)
- **Custom Alert Messages**: Display realistic error messages during simulated failures
- **500 Error Pages**: Redirect to professional-looking server error pages with incident tracking
- **PagerDuty Integration**: Creates real incidents in PagerDuty for authentic testing
- **Scenario System**: Support for complex, multi-step incident scenarios
- **Enhanced UI**: Improved visual indicators and debugging capabilities

### Installation
1. Download and extract the extension files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" and select the extension folder
5. Configure your PagerDuty integration key in the extension popup

### Configuration
1. **PagerDuty Setup**: Add your Events API v2 integration key
2. **Alert Settings**: Enable custom alerts and configure messages
3. **Click Targets**: Customize which button texts trigger incidents
4. **500 Error Pages**: Enable realistic server error simulations

### Version 1.1 Improvements
- ✅ Fixed click interception race condition
- ✅ Enhanced scenario running indicators
- ✅ Improved 500 error page realism
- ✅ Better error handling and debug logging
- ✅ Auto-configuration of default target texts
- ✅ Comprehensive testing and bug fixes

### Safety & Ethics
This tool is designed for **defensive security purposes only**:
- ✅ Incident response training
- ✅ Resilience testing
- ✅ Team preparation exercises
- ❌ Not for malicious use or unauthorized testing

### Support
For issues or questions, please refer to the GitHub repository or contact your security team.

---
**Version**: 1.1  
**Build Date**: December 8, 2024  
**Compatibility**: Chrome Manifest v3