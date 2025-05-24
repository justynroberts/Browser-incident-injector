# Incident Injector

A Chrome extension that injects realistic incidents by intercepting form submissions and creating PagerDuty alerts. Perfect for testing incident response procedures and training teams.

## Features

- 🚨 Intercepts all form submissions on any website
- 📧 Creates detailed PagerDuty incidents with form context
- ⚙️ Customizable alert messages and behavior
- 🔄 Supports AJAX and single-page application forms
- 🛡️ Prevents duplicate incidents (5-minute deduplication window)
- 🎯 Smart form detection (ignores search forms, newsletters)
- 📱 Clean, intuitive popup interface

## Installation

### Option 1: Load Unpacked Extension (Development)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `pagerduty-form-simulator` folder
5. The extension icon should appear in your toolbar

### Option 2: Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store once published.

## Setup

### 1. Get Your PagerDuty Integration Key

1. Log into your PagerDuty account
2. Go to **Services** → Select your service → **Integrations**
3. Click **Add Integration**
4. Choose **Events API v2**
5. Give it a name like "Chrome Extension Simulator"
6. Copy the **Integration Key** (32-character alphanumeric string)

### 2. Configure the Extension

1. Click the extension icon in your Chrome toolbar
2. Paste your PagerDuty Integration Key
3. Customize the alert message if desired
4. Enable the extension toggle
5. Test with the "Send Test Incident" button

## Usage

Once configured and enabled:

1. Navigate to any website with forms
2. Fill out and submit any form
3. The extension will:
   - Show an error alert
   - Create a PagerDuty incident with form details
   - Optionally allow the form to continue submitting

## Configuration Options

### Extension Settings

- **Extension Enabled**: Master on/off toggle
- **Integration Key**: Your PagerDuty Events API v2 integration key
- **Custom Alert Message**: Customize the error message shown to users
- **Allow Form Continuation**: Let forms submit normally after showing the alert

### Incident Details

Each incident includes:

- Page URL and title
- Form action URL and method
- Button text that was clicked
- Timestamp and user agent
- Referrer information
- Custom simulation metadata

## Advanced Features

### Form Detection

The extension intelligently detects and handles:

- Standard HTML form submissions
- AJAX requests (fetch and XMLHttpRequest)
- Single-page application forms
- Dynamic forms added after page load

### Smart Filtering

Automatically ignores:

- Search forms (GET requests to search URLs)
- Newsletter signup forms
- Forms submitted within 5 seconds of each other

### Deduplication

- Prevents spam incidents from the same form
- Uses URL + form action for dedup key generation
- 5-minute deduplication window

## Security & Privacy

- Integration keys are stored securely in Chrome's sync storage
- No form data is transmitted (only metadata)
- Works entirely client-side
- Respects Content Security Policy restrictions

## Browser Compatibility

- ✅ Chrome (Manifest V3)
- ✅ Edge (Chromium-based)
- ❌ Firefox (different extension format)
- ❌ Safari (different extension format)

## Development

### Project Structure

```
pagerduty-form-simulator/
├── manifest.json          # Extension manifest
├── background.js          # Service worker for API calls
├── content.js            # Form interception logic
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── popup.css             # Popup styling
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

### Key Components

1. **Content Script** (`content.js`): Intercepts form submissions and extracts data
2. **Background Script** (`background.js`): Handles PagerDuty API communication
3. **Popup Interface** (`popup.html/js/css`): User configuration and testing

### Testing

Test the extension on various websites:

- GitHub (form submissions)
- Gmail (compose/send)
- E-commerce checkout forms
- Contact forms
- Single-page applications

## Troubleshooting

### Common Issues

**Extension not working:**
- Check that it's enabled in the popup
- Verify your integration key is correct (32 characters)
- Check browser console for errors

**No incidents created:**
- Verify your PagerDuty integration key
- Check network connectivity
- Look for API errors in the background script console

**Alerts not showing:**
- Some sites block `alert()` with Content Security Policy
- Check for custom notification in top-right corner
- Look for console messages as fallback

### Debug Mode

Enable debug logging by opening browser console and looking for messages prefixed with `[PagerDuty Simulator]`.

## API Reference

### PagerDuty Events API v2

The extension uses PagerDuty's Events API v2:

- **Endpoint**: `https://events.pagerduty.com/v2/enqueue`
- **Method**: POST
- **Authentication**: Integration Key in payload
- **Documentation**: [PagerDuty Events API](https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTgw-events-api-v2-overview)

### Incident Payload Structure

```json
{
  "routing_key": "YOUR_INTEGRATION_KEY",
  "event_action": "trigger",
  "dedup_key": "GENERATED_DEDUP_KEY",
  "payload": {
    "summary": "Simulated form submission error on Page Title",
    "source": "https://example.com/page",
    "severity": "error",
    "component": "web-form",
    "group": "chrome-extension-simulator",
    "class": "form-submission",
    "custom_details": {
      "url": "https://example.com/page",
      "form_action": "https://example.com/submit",
      "form_method": "POST",
      "button_text": "Submit",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "user_agent": "Mozilla/5.0...",
      "referrer": "https://example.com/previous",
      "simulation_source": "chrome-extension"
    }
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review browser console for error messages
3. Create an issue on GitHub with details

## Changelog

### Version 1.0
- Initial release
- Form interception and PagerDuty integration
- Popup configuration interface
- AJAX form support
- Deduplication and smart filtering
