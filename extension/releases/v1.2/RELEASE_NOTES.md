# Incident Injector v1.2 Release Notes

## Release Date: January 2025

## Overview
Version 1.2 represents a major UI overhaul and usability enhancement of the Incident Injector Chrome extension. This release focuses on improving the user experience through a modern slide-out panel interface, comprehensive state persistence, and numerous quality-of-life improvements.

## Key Features

### 🎨 Major UI Overhaul
- **Slide-out Panel**: Replaced the traditional popup with a modern slide-out panel that appears from the right side of the browser
- **Non-intrusive Design**: The panel overlays the current page without disrupting workflow
- **Responsive Layout**: Optimized for various screen sizes and resolutions

### 💾 Enhanced Persistence
- **Complete State Preservation**: All settings, configurations, and custom scenarios are preserved across:
  - Tab switches
  - Page reloads
  - Browser restarts
  - Extension context invalidation
- **Auto-save Functionality**: Event definitions and scenario selections save automatically as you type
- **Robust Fallback System**: Message relay ensures persistence even when Chrome APIs are unavailable

### 🎯 Improved User Experience
- **Consolidated Save Buttons**: Single "Save All Settings" button reduces UI clutter
- **Auto-collapsing Sections**: Configuration sections minimize automatically after saving
- **Minimized Default View**: All sections start collapsed for a clean, organized interface
- **Smart Section Management**: Sections remember their state between sessions

### 🔒 CSP Compliance
- **Font Awesome Removal**: Eliminated external font dependencies to avoid CSP violations
- **Unicode Fallback Icons**: All icons now use Unicode characters for universal compatibility
- **Self-contained Resources**: No external dependencies required

### 🛠 Technical Improvements
- **Chrome API Fallbacks**: Robust error handling with automatic fallback to message relay system
- **Extension Context Recovery**: Graceful handling of extension context invalidation
- **Improved Error Messages**: Clear, actionable error messages for better troubleshooting
- **Enhanced Logging**: Comprehensive debug logging for easier issue diagnosis

## Bug Fixes
- Fixed sections reverting to expanded state after initialization
- Resolved missing expand/minimize carets on collapsible sections
- Fixed settings not persisting across tab switches
- Corrected Chrome API access errors in various contexts
- Fixed status section display issues

## Breaking Changes
- The popup interface has been completely removed in favor of the slide-out panel
- Debug files and test utilities have been removed from the distribution

## Installation
1. Download `incident-injector-v1.2.zip` from this release
2. Extract the ZIP file to a local directory
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder
6. The extension icon will appear in your browser toolbar

## Upgrade Notes
Users upgrading from v1.1 or earlier:
- Your existing settings will be preserved
- The new panel interface will automatically replace the popup
- No reconfiguration required

## Known Issues
- None identified in this release

## Credits
Developed and maintained by the Browser Incident Injector team.

## Support
For issues or questions, please visit our [GitHub repository](https://github.com/justynroberts/Browser-incident-injector).

---

**Download:** [incident-injector-v1.2.zip](incident-injector-v1.2.zip)