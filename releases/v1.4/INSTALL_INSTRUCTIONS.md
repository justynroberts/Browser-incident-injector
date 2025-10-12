# Incident Injector Panel Installation Instructions

## Overview
The extension has been successfully converted from a popup to a slide-out panel interface. This provides a better user experience with more space for configuration options and a modern sliding panel design.

## Installation Steps

### 1. Load the Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" 
4. Select the `extension` folder from this project
5. The extension should now be loaded and visible in your extensions list

### 2. Using the Panel
- **Click the extension icon** in the Chrome toolbar to open the slide-out panel
- The panel will slide in from the right side of the screen
- Click the X button or click outside the panel to close it
- All the same functionality from the popup is available in the panel

### 3. Optional: Enable Toggle Button
- In the panel, expand the "PagerDuty Configuration" section
- Check "Show Toggle Button on Pages" to display a floating button on web pages
- This button provides quick access to the panel without clicking the extension icon

## Key Changes from Popup to Panel

### New Features:
- **Slide-out animation**: Smooth transition from the right side of the screen
- **Larger interface**: More space for configuration options
- **Better mobile support**: Responsive design that works on smaller screens
- **Click-outside to close**: Click anywhere outside the panel to close it
- **Modern styling**: Enhanced visual design with better typography and spacing

### Technical Changes:
- `manifest.json`: Removed popup configuration, added web-accessible resources
- `content.js`: Added panel injection and management functionality  
- `panel.html`: New HTML structure optimized for slide-out panel
- `panel.css`: New CSS with slide animations and panel-specific styling
- `panel.js`: New JavaScript adapted from popup.js for panel context
- `background.js`: Added extension icon click handler to toggle panel

## Testing the Panel

### Quick Test:
1. Load the extension following the installation steps above
2. Open any webpage (e.g., google.com)
3. Click the Incident Injector extension icon in the Chrome toolbar
4. The panel should slide in from the right
5. Test closing by clicking the X button or clicking outside the panel

### Functional Test:
1. Open the panel and toggle the "Extension Enabled" switch
2. Expand various sections to ensure they work properly
3. Try entering a test PagerDuty integration key
4. Test the Quick Actions button
5. Enable the toggle button and verify it appears on the page

## Troubleshooting

### Panel Not Appearing:
- Check the browser console for error messages (F12 → Console)
- Ensure the extension is properly loaded and enabled
- Try reloading the extension in chrome://extensions/

### Styling Issues:
- The panel uses Font Awesome and Google Fonts CDNs
- Ensure you have an internet connection for proper styling
- Some corporate networks may block these CDN resources

### JavaScript Errors:
- Check the console for any error messages
- Ensure all files (panel.html, panel.css, panel.js) are properly loaded
- Try reloading the page after making changes

## File Structure
```
extension/
├── manifest.json          # Extension manifest (updated for panel)
├── background.js          # Background script (added panel toggle)
├── content.js            # Content script (added panel injection)
├── panel.html            # Panel HTML structure
├── panel.css             # Panel styles and animations
├── panel.js              # Panel JavaScript functionality
├── popup.html            # Legacy popup (kept for reference)
├── popup.css             # Legacy popup styles
├── popup.js              # Legacy popup script
├── event-processor.js    # Event processing logic
├── sample-event-definition.json
└── icons/               # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development Notes

The panel functionality maintains full compatibility with all existing features:
- PagerDuty integration
- Event scenarios and definitions  
- Form interception
- Click element targeting
- Test functionality
- Storage and settings management

The conversion was designed to be backwards-compatible while providing an enhanced user interface.