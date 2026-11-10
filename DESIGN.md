# DESIGN.md — Incident Injector panel

## v2.0 (2026-11-09): On-call console

Asked for a new font and a PagerDuty look. The panel is a 360px rail injected into
whatever page is under test, so it has to read as a tool, not as part of the site.

| | Choice |
|---|---|
| **Direction** | On-call console: a PagerDuty incident list redrawn as a dense side rail. Near-black ground, hairline rows, no cards |
| **Typeface** | IBM Plex Sans (400/500/600), bundled woff2; IBM Plex Mono only for the JSON, key and URL fields. Same superfamily |
| **Accent** | PagerDuty green `#06AC38`: armed state, ticked scenarios, the Run button, switches that are on. Nothing else is green |
| **State colours** | `#F0646B` for running/triggered and errors, `#E3B450` for warnings. Text and stripes only, never fills |
| **Ground** | `#0C0E0D`, with `#121513` / `#191D1B` as 2–3% shifts for raised rows and hover. Hairlines `#232826` |
| **Grid** | 8px. 16px gutters, 40px section heads, 48px header and arm bar |
| **Shape** | Radius 3px on controls, 2px on boxes and switches. No shadows |
| **Motion** | 140ms ease-out colour/position changes on state change only; panel slide 160ms. Reduced motion respected |

**Recognisable idea:** the arm bar. When injection is on, the bar's bottom rule and
the header mark turn PagerDuty green — the panel reads "armed" from across the room.
Scenarios sit below it as incident-list rows with a 3px left stripe: green when ticked,
red while that scenario is running.

Tokens live on `#incident-injector-panel` in `extension/panel.css`. Every selector is
anchored on that id and a reset block strips host-page CSS, because the panel lives in
the host page's DOM.

House rules: "Made by FintonLabs" sits behind the (i) button in the header; MIT header
comment on `panel.css` and `panel.html`.
