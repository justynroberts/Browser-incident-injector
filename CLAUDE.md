# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Layout

This repo ships a single Chrome extension (Manifest V3) called **Incident Injector** for incident-response training. The actual extension source lives in `extension/` — that directory has its own `CLAUDE.md` with detailed architecture notes; read it before making code changes.

- `extension/` — extension source (loaded unpacked in Chrome). See `extension/CLAUDE.md`.
- `docs/` — screenshots and `DEVELOPER.md`.
- `releases/` and `extension/releases/` — packaged zip builds per version.
- `scope_css.py` — one-off helper script to scope panel CSS selectors.
- `incident-injector-v1.3.zip` — legacy release archive at repo root.

## Architecture (big picture)

The extension intercepts clicks/form submits on any page and triggers PagerDuty Events API v2 incidents. Four runtime contexts coordinate:

1. **`background.js`** (service worker) — PagerDuty API calls, scenario orchestration, storage of event definitions.
2. **`content.js`** (content script) — matches clicks/submits against `target_element_texts`, injects the slide-out panel iframe, relays messages.
3. **`panel.js`** (runs inside the injected iframe) — UI; when Chrome APIs aren't available in iframe context it falls back to `window.postMessage` relay through `content.js`. `isExtensionContext()` is the gate.
4. **`event-processor.js`** — scenario engine with `{{variable}}` templating, batching (`maxConcurrentEvents: 3`), and retries.

Storage split: `chrome.storage.sync` for user settings, `chrome.storage.local` for event definitions, `localStorage` as a reload-survival fallback.

Event definitions support two schemas — new (`event_definitions[]`) and legacy (`scenarios{}`). Event types: `trigger`, `acknowledge`, `resolve`.

## Development

### Load / reload

```
chrome://extensions/ → Developer mode → Load unpacked → select ./extension
```

Reload via the extensions page after editing `background.js` or `content.js`. Panel-only changes just need the panel closed and reopened.

### Debugging

- Filter console logs by `[Incident Injector]` or `[PagerDuty Simulator]`.
- `window.debugClickInterception()` in the page console inspects interception matching.

### Packaging a release

Releases are plain zips of the `extension/` folder, versioned in `manifest.json` and dropped into `releases/` (e.g. `incident-injector-v1.6.zip`). There is no build step, bundler, lint, or test harness — edits to source files are the shipped artifact.

## Gotchas

- If `target_element_texts` is empty, **nothing is intercepted** — this is intentional for safety. The extension also ships disabled by default.
- `panel.css.backup` exists alongside `panel.css`; edit `panel.css` only.
- Fonts/icons load from Google Fonts + cdnjs with bundled Space Grotesk / Unicode fallbacks when CSP blocks the CDN.
- Auto-save fires on panel close (X) and before running a scenario via `autoSaveAllSettings()` — don't assume a manual save button is the only persistence path.
