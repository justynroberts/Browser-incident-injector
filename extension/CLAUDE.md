# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Incident Injector is a Chrome extension (Manifest V3) for incident response training. It intercepts form submissions and button clicks on websites to trigger PagerDuty alerts, display custom error pages, and simulate realistic incident scenarios.

## Architecture

### Core Components

- **background.js** - Service worker handling extension lifecycle, PagerDuty API calls, and scenario execution orchestration
- **content.js** - Injected into web pages; handles click/form interception, panel injection, and communicates with background via `chrome.runtime.sendMessage`
- **panel.js** - Slide-out panel UI logic; manages settings, scenario selection, and triggers. Runs in an iframe context with message relay for Chrome API access
- **event-processor.js** - PagerDuty event scenario engine; processes event definitions, handles variable templating (`{{variable}}`), and sends events to PagerDuty Events API v2
- **panel.html/panel.css** - Panel UI structure and styling

### Key Communication Patterns

1. **Panel ↔ Content Script**: Uses `window.postMessage` with `source: 'incident-injector-panel'` or `source: 'incident-injector-content'` for settings relay when Chrome APIs unavailable in iframe context
2. **Content ↔ Background**: Uses `chrome.runtime.sendMessage` with action-based routing (`create_incident`, `run_scenario`, `run_active_scenario`, etc.)
3. **Settings Storage**: `chrome.storage.sync` for user preferences, `chrome.storage.local` for event definitions. localStorage used as fallback for persistence across extension reloads

### Event Definition Schema

Supports two formats:
- **New schema** (v1.0): `event_definitions` array with `id`, `name`, `description`, `variables`, and `events`
- **Legacy schema**: `scenarios` object keyed by scenario ID

Events support types: `trigger`, `acknowledge`, `resolve` with template variables and configurable delays.

## Development

### Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this `extension` folder

### Testing Changes

- Reload extension via chrome://extensions after modifying background.js or content.js
- For panel changes, close and reopen the panel
- Use browser console for debugging (filter logs by `[Incident Injector]` or `[PagerDuty Simulator]`)
- Debug click interception: `window.debugClickInterception()` in page console

### Key Settings

Settings stored in `chrome.storage.sync`:
- `integration_key` - 32-char PagerDuty Events API v2 key
- `extension_enabled` - Master on/off toggle
- `trigger_on_click_enabled` - Click interception toggle
- `target_element_texts` - Comma-separated button texts to intercept
- `show_alert`, `redirect_to_500`, `trigger_crux`, `allow_form_continuation` - Trigger behaviors
- `active_scenario_id` - Currently selected scenario

## Important Patterns

### Extension Context Detection

Panel.js uses `isExtensionContext()` to detect if Chrome APIs are available. When running in page context (iframe), it falls back to message relay through content.js.

### Click & Form Interception

Content.js matches clicked elements and form submit buttons against `targetElementTexts` (case-insensitive). When matched:
1. Prevents default action (unless `allow_form_continuation` enabled)
2. Optionally shows alert, runs scenario, redirects to 500 page, or triggers Crux event
3. Creates PagerDuty incident via background script

**Important**: If `targetElementTexts` is configured, ONLY elements/buttons matching those texts will trigger incidents. If empty, no interception occurs.

### Scenario Execution

Event processor sends events in batches (`maxConcurrentEvents: 3`) with retries (`maxRetries: 3`). Progress updates sent via `updateScenarioProgress` action.

### Auto-save Behavior

Settings are automatically saved:
- When closing the panel (X button)
- Before running a scenario
- Uses `autoSaveAllSettings()` in panel.js

### Font & Icon Loading

- **DM Sans** font loaded from Google Fonts CDN
- **Font Awesome 6** loaded from cdnjs CDN
- Fallback to bundled Space Grotesk and Unicode icons if CDN blocked by CSP
