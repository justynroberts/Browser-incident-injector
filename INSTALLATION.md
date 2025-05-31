# Installation Guide - Incident Injector

## Quick Start

### 1. Install the Extension

**Option A: Load Unpacked (Development)**
1. Download/clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `pagerduty-form-simulator` folder
6. Extension icon should appear in toolbar

**Option B: Chrome Web Store (Coming Soon)**
- Will be available once published

### 2. Get PagerDuty Integration Key

1. Log into PagerDuty
2. Go to **Services** → Your Service → **Integrations**
3. Click **Add Integration**
4. Select **Events API v2**
5. Name it "Incident Injector"
6. Copy the **Integration Key** (32 characters)

### 3. Configure Extension

1. Click extension icon in Chrome toolbar
2. Paste Integration Key
3. Enable the extension toggle
4. Click "Send Test Incident" to verify setup

### 4. Test It

1. Open `test-page.html` in Chrome
2. Submit any form
3. Should see alert + PagerDuty incident created

## Troubleshooting

**Extension not loading:**
- Check Chrome version (requires Chrome 88+)
- Ensure all files are present
- Check for errors in `chrome://extensions/`

**No incidents created:**
- Verify integration key (32 alphanumeric characters)
- Check PagerDuty service is active
- Look for errors in browser console

**Alerts not showing:**
- Some sites block alerts with CSP
- Look for custom notification in top-right
- Check console for fallback messages

## File Structure

```
pagerduty-form-simulator/
├── manifest.json          # Extension configuration
├── background.js          # PagerDuty API handler
├── content.js            # Form interception
├── popup.html/js/css     # User interface
├── test-page.html        # Testing page
├── README.md             # Full documentation
├── INSTALLATION.md       # This file
└── icons/                # Extension icons
```

## Next Steps

1. Test on various websites
2. Customize alert messages
3. Configure form continuation behavior
4. Monitor PagerDuty incidents

For detailed documentation, see [README.md](README.md).