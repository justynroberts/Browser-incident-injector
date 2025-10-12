# Incident Injector v1.4 Release Notes

**Release Date:** October 12, 2025
**Version:** 1.4

## 🎨 Typography Update

This release features a complete typography overhaul with the modern **Space Grotesk** font, replacing the previous Grandstander font throughout the extension panel interface.

## ✨ What's New

### Font System Improvements
- **Modern Typography**: Replaced Grandstander with Space Grotesk for a cleaner, more professional appearance
- **Bundled Fonts**: All font files are now bundled within the extension (42-48KB woff2 files)
- **No External Requests**: Zero CDN dependencies - all fonts served from extension origin
- **CSP Compliant**: Fonts load without Content Security Policy violations
- **Optimized Performance**: WOFF2 format provides excellent compression and broad browser support

### Technical Enhancements
- **Robust Error Handling**: Added comprehensive error handling for extension context invalidation
- **Font Loading**: Improved font loading via `chrome.runtime.getURL()` with fallbacks
- **Better Compatibility**: Works across all websites regardless of their CSP policies

## 📦 What's Included

### Font Files (4 variants)
- `SpaceGrotesk-Regular.woff2` (42KB) - Weight 400
- `SpaceGrotesk-Medium.woff2` (42KB) - Weight 500
- `SpaceGrotesk-Bold.woff2` (41KB) - Weight 700
- `SpaceGrotesk-Variable.woff2` (48KB) - Variable font

### Core Files
- Slide-out panel interface with improved typography
- PagerDuty Events API v2 integration
- Scenario-based testing system
- Comprehensive configuration options
- Unicode fallback icons (CSP-safe)

## 🔧 Installation

### Quick Install
1. Download `incident-injector-v1.4.zip`
2. Extract to a local directory
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder

### First Time Setup
⚠️ **Important**: Extension starts disabled by default for security.

1. Click the extension icon in your toolbar
2. Toggle "Extension Enabled" switch
3. Enter your PagerDuty integration key
4. Configure trigger options as needed

## 📊 File Size

**Total Package Size:** ~239KB (compressed)
**Installed Size:** ~400KB

Includes:
- Extension core files
- 4 Space Grotesk font variants
- Sample event definitions
- Documentation

## 🔄 Upgrading from v1.3

All settings and configurations are preserved when upgrading. Simply:
1. Remove the old version from `chrome://extensions/`
2. Install v1.4 following the installation steps above
3. Your saved settings will be restored automatically

## 📝 Breaking Changes

None. This release is fully compatible with v1.3 configurations.

## 🐛 Known Issues

None reported for v1.4.

## 📚 Documentation

- **Installation Guide**: See `INSTALL_INSTRUCTIONS.md`
- **Change Log**: See `CHANGES.md`
- **Developer Guide**: Available in main repository

## 🔒 Security

- Extension disabled by default
- No hardcoded click targets
- User-controlled configuration
- Intended for authorized testing only

## 📸 Screenshots

See the main [README](../../README.md#screenshots) for screenshots showcasing the Space Grotesk typography.

## 🙏 Credits

**Space Grotesk Font**
Designed by Florian Karsten
Licensed under SIL Open Font License 1.1
https://github.com/floriankarsten/space-grotesk

---

**Incident Injector v1.4** - Modern typography for professional incident response training
