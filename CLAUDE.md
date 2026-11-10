# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Layout

This repo ships a single Chrome extension (Manifest V3) called **Incident Injector** for incident-response training. The extension source lives in `extension/`, which has its own `CLAUDE.md` with more detail.

- `extension/`: extension source, loaded unpacked in Chrome. There is no build step, so these files are the shipped artifact.
- `test/`: end-to-end suite (puppeteer-core plus Chrome for Testing). See **Testing**.
- `DESIGN.md`: panel design direction and tokens. Read it before touching `panel.css` or `panel.html`.
- `docs/`: screenshots and `DEVELOPER.md`.
- `releases/`: one unpacked `vX.Y/` folder and one `incident-injector-vX.Y.zip` per version.
- `scope_css.py`: one-off helper script, now obsolete. `panel.css` is scoped by hand on `#incident-injector-panel`.

## Architecture (big picture)

The extension intercepts clicks and form submits on any page, then sends PagerDuty Events API v2 events. Four runtime contexts coordinate:

1. **`background.js`** (service worker). Sends PagerDuty incidents. `runScenarioSet()` runs one or more scenarios at once, each on its own `PagerDutyEventProcessor` instance so template variables don't collide. It writes coalesced progress to `chrome.storage.local.scenario_running` (`runs[]` holds per-scenario state), and pings an extension API every 20s so the worker isn't idled out mid-run.
2. **`content.js`** (content script, `document_start`, `all_frames`).
   - **Interception core:** one path, `findTarget` → `trigger`.
   - **Panel host:** injects the panel into the top frame's DOM (not an iframe) and relays `window.postMessage` traffic between panel and background.
3. **`panel.js`** runs in the page's **main world**, so it normally has no `chrome.*` access. Everything goes through the postMessage relay in `content.js` (the `*_request` and `*_response` actions). `isExtensionContext()` is the gate.
4. **`event-processor.js`**: scenario engine. Handles `{{variable}}` templating, batching (`maxConcurrentEvents: 3`) and retries. Scenarios are looked up by id or name first, and by numeric index only for pure-digit ids.

### Storage

- `chrome.storage.sync` holds user settings, including `active_scenario_ids[]`. `active_scenario_id` mirrors the first entry for old readers.
- `chrome.storage.local` holds `event_definition`, `scenario_running` and `last_incident_time`.
- Page `localStorage` is only a fallback, accessed through `safeStorage`, which never throws.
- Keep high-frequency writes out of sync: it allows about 120 writes a minute, shared with every settings save.

### Event definitions

Two schemas are supported: new (`event_definitions[]`) and legacy (`scenarios{}`). Event types are `trigger`, `acknowledge` and `resolve`.

### Interception rules (content.js)

These are deliberate. The test suite covers each one.

- **Listener setup:** listeners are attached once on `window` in the capture phase at `document_start`, ahead of the page's own listeners. Handlers read the live settings on each event. Don't remove and re-add listeners on settings changes, because that queues them behind the page's.
- **Finding the target:** `event.composedPath()` resolves it, which covers open shadow DOM. Real controls are checked first (button, `a[href]`, `role=button`, submit inputs). Short-text div and span "buttons" near the click are the fallback.
- **Text matching:** whitespace and nbsp are normalised. A label matches if it equals the target exactly, or contains it as a whole phrase and is at most 12 characters longer ("Checkout (3)").
- **Synthetic clicks:** clicks with `isTrusted === false` are ignored. That's what keeps continuation replays (`replayAction`) from looping.
- **No double counting:** when a click on a submit button has already been handled and let through, the submit that follows isn't counted again (`lastTrigger`, 1.5s window).
- **Blocking:** the action is blocked only when the alert or the 500 page is on, or continuation is off. When an alert blocks it and continuation is on, a blocked form is replayed with `requestSubmit`, so the site's own `onsubmit` still runs.
- **Iframes:** frames hand the 500 page to the top window via `postMessage`. Only the top frame answers `toggle_panel`.
- **Orphaned scripts:** a content script left over from an extension reload detaches itself (`teardownIfOrphaned`).

## Development

### Load / reload

```
chrome://extensions/ → Developer mode → Load unpacked → select ./extension
```

Reload the extension after editing `background.js` or `content.js`, then **refresh open tabs**: old content scripts detach and won't re-arm. Panel-only changes just need the panel closed and reopened.

### Testing

```
cd test && npm install && npm test        # full suite, ~1 min
npm test -- shadow                        # tests whose name contains "shadow"
HEADFUL=1 npm test                        # watch it
EXT_DIR=/path/to/old/extension npm test   # run against another build (baseline)
```

How the suite works:

- `run.mjs` loads `../extension` into Chrome for Testing. It looks in `~/.cache/puppeteer/chrome`, or uses `CHROME_PATH`. Branded Chrome ignores `--load-extension`.
- `events.pagerduty.com` is mapped to a local HTTPS mock that records every event. `*.test` hosts are mapped to a page server serving `pages.mjs`.
- Each page counts what the site's own handlers saw (`window.__site`), so the tests can tell blocked, passed-through and looped actions apart.
- Screenshots of the panel land in `test/out/`.

To add a site behaviour, add a page to `pages.mjs` and a `test(...)` to `run.mjs`.

### Debugging

- Filter console logs by `[Incident Injector]`.
- `debugClickInterception()` is defined in the content script's isolated world. Pick the extension's context in the DevTools console dropdown to call it.

### Packaging a release

A release is one commit titled `Release vX.Y: <summary>` (see `git log` for the pattern) that does three things:

1. Bumps `version` in `extension/manifest.json`.
2. Copies only the runtime files into `releases/vX.Y/`: `manifest.json`, `background.js`, `content.js`, `event-processor.js`, `panel.{html,css,js}`, `sample-event-definition.json`, `fonts/` and `icons/`. Leave out `CLAUDE.md`, `CHANGES.md`, `INSTALL_INSTRUCTIONS.md`, `panel.css.backup` and `releases/`.
3. Zips the folder from inside `releases/`, so the archive's top-level entry is `vX.Y/`: `cd releases && zip -r incident-injector-vX.Y.zip vX.Y`

`extension/releases/` and the root `incident-injector-v1.3.zip` are stale leftovers.

## Gotchas

- **Empty match list:** if `target_element_texts` is empty, **nothing is intercepted**. This is intentional.
- **Install defaults:** `onInstalled` also fires on every update and reload. It must only fill keys that are `undefined`. Writing the whole defaults object used to wipe user settings on every reload.
- **Dedup keys:** they must be unique per incident (`generateDedupKey`). A shared key makes PagerDuty fold repeat triggers into the first open alert.
- **Panel CSS:** the panel lives in the host page's DOM. Every selector in `panel.css` is anchored on `#incident-injector-panel`, and a reset block strips host CSS. Edit `panel.css` only, not `panel.css.backup`.
- **Fonts and icons:** IBM Plex is bundled in `fonts/` and declared in `panel.css`. Icons are inline SVG. Nothing loads from Google Fonts or cdnjs.
- **Strict CSP:**
  - Every `innerHTML` or `document.write` goes through `toTrustedHTML()`.
  - Injected markup has no inline `<script>` and no `on*=` attributes. Use `data-ii-action` plus `wireUp500Page()` instead.
  - If the Trusted Types policy is refused, `render500PageDom()` builds the 500 page with DOM APIs.
- **Settings persistence:**
  - `autoSaveAllSettings()` sends a **partial** payload: a key goes in only if its DOM element exists. The scenario selection is included only once the list is rendered.
  - Defaults apply only when the stored value is `undefined`.
- **Scenario runs:** a scenario runs on intercept only when `run_scenario_on_submit` is on. With it on, every ticked scenario runs. `run_stagger` starts them 5s apart.
- **Exposed relay:** the postMessage relay is reachable by any script on a page where the panel has been opened. That includes `load_settings_request`, which returns the integration key. Moving the panel into an extension-origin iframe would close this.
