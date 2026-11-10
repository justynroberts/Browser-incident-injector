# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The repo-root `../CLAUDE.md` has the architecture, interception rules, test suite and release steps. Read it first. This file only covers what lives in this folder.

## Files

- `background.js`: the service worker. It handles incidents (`create_incident`) and scenario runs (`run_scenario` from the panel, `run_active_scenario` from an intercept). Both of those go through `runScenarioSet()`.
- `content.js`: runs at `document_start` in every frame. From top to bottom it contains:
  - the Trusted Types helper
  - settings load and `onChanged` sync
  - the interception core (`findTarget`, `trigger`, `replayAction`, the 500 page)
  - panel injection and the postMessage relay handlers (`handle*Request`)
- `panel.html` / `panel.css` / `panel.js`: the slide-out panel. `content.js` fetches `panel.html` and injects the inner `.incident-injector-panel` markup into the page. `panel.js` is loaded as a main-world `<script>`.
- `event-processor.js`: the `PagerDutyEventProcessor` class plus a shared singleton. Scenario runs create their own instances.
- `fonts/`: IBM Plex Sans (400/500/600) and Plex Mono (400). The licence is in `OFL.txt`.

## Panel conventions

- **Scenario list:** scenarios render as `#scenario-list .ii-scn` rows, each with an `input[data-scenario-id]` checkbox. `getSelectedScenarioIds()` reads the selection, and `persistScenarioSelection()` saves `active_scenario_ids` along with `active_scenario_id`.
- **Collapsible sections:** a section head is a `button.toggle-button#toggle-X` that controls `#X-content`. The `collapsed` class toggles both, and `aria-expanded` follows it.
- **`initConsoleUi()`** handles:
  - the armed state (the `ii-armed` class on the panel)
  - section summaries
  - All/None, Format JSON, and the About sheet (the "Made by FintonLabs" info button)
  - the running-state relay (`scenario_running_update`)
- **Result lines:** `.test-result` gets its className replaced wholesale (`test-result success|error|warning`). Don't put extra classes on it.
- **Look:** `../DESIGN.md` defines it: near-black, PagerDuty green `#06AC38` as the only accent, IBM Plex, no shadows, radius ≤ 3px.

## Key settings (`chrome.storage.sync`)

| Key | Purpose |
|---|---|
| `integration_key` | 32-char Events API v2 routing key, used by every alert |
| `extension_enabled` | Master switch, shown as "Injection" in the panel |
| `trigger_on_click_enabled` | Click interception |
| `target_element_texts` | Comma-separated labels to match |
| `show_alert`, `redirect_to_500`, `trigger_crux`, `allow_form_continuation`, `run_scenario_on_submit` | What happens on a match |
| `active_scenario_ids` / `active_scenario_id` | Ticked scenarios / first of them, kept for older readers |
| `run_stagger` | Start ticked scenarios 5s apart instead of together |
| `change_keys` | `[{ name, key }]` change keys; change events pick one with `routing_key_env`. v2.2 used `routing_keys` |
