# Writing scenarios

How to add a scenario to the default event definition: alerts, change events, chart images and a runbook. The worked examples are the shipped scenarios in `extension/sample-event-definition.json`: `payments_alert_storm`, `reinvent_scenario` and `data_platform_lock_contention`.

## Where scenarios live

- **`extension/sample-event-definition.json`** is the default. Every scenario is one entry in `event_definitions[]`.
- **Chrome keeps its own copy.** The panel saves the definition in `chrome.storage.local`, and runs read that copy, not the file. After changing the file, reload the extension, refresh the tab and click **Load default** in the panel. Until then you are running the old copy.

## Scenario skeleton

```json
{
  "id": "data_platform_lock_contention",
  "name": "Data platform: orders-db lock contention",
  "description": "One line: what breaks, in what order, and the fix",
  "events": [ ... ]
}
```

- **`id`:** unique, snake_case. Settings and tests refer to it, so don't rename it once shipped.
- **`name`:** what the panel lists.
- **`description`:** say the fix too. Presenters read it.

## Ordering and timing

- **Order:** events are sent strictly in array order, one at a time. Put them in the order you want them to arrive in PagerDuty.
- **`delay`:** `{ "type": "fixed", "value": 10000 }` waits that many milliseconds after the previous event before sending this one. Leave it off the first event.
- **Other delay types:** `random` (`min`, `max`) also works.
- **Pace:** 1s gaps read as an alert storm, 10s gaps read as a story unfolding.

## Alerts (`trigger`)

```json
{
  "type": "trigger",
  "summary": "[Datadog] Postgres blocked sessions on orders-db above 50 - 64 sessions waiting on Lock (critical)",
  "severity": "critical",
  "source": "datadog:monitor:postgresql.blocked_sessions:pg-prod-01.eu-west-1.prod",
  "component": "postgres",
  "group": "database",
  "class": "locks",
  "custom_details": {
    "service": "data-platform",
    "problem": "orders-db-lock-contention",
    "...": "..."
  },
  "links": [ { "href": "https://.../runbook", "text": "Runbook: ..." } ],
  "images": [ { "src": "https://dash.apps.fintonlabs.com/...", "href": "https://dash.apps.fintonlabs.com/...", "alt": "..." } ],
  "delay": { "type": "fixed", "value": 10000 }
}
```

**`summary`:** write it the way the monitoring tool would. Use a `[Tool]` prefix, the metric, the current value and the threshold, not a narrative sentence.

**`severity`:** one of `critical`, `error`, `warning` or `info`. Open with a warning symptom, then escalate to critical.

**`source`, `component`, `group` and `class`:** fill all four. PagerDuty uses them for grouping and display, and `class` is what a runbook often keys on (for example "incident with class `locks`").

**`custom_details`:** the evidence a responder would see. Always include:
- **`service`:** the PagerDuty service name to route to (see Routing).
- **`problem`:** one value shared by every alert in the scenario. It's the key for content-based alert grouping, and the tests use it to pick the scenario's alerts.
- **Owner and context:** an owning team, plus the host, cluster, region and so on.
- **Numbers:** the metric, its current value and the threshold, with real-looking figures. Put the root-cause clues on the critical alert (for example the blocker pid, its state and last query).

**Dedup keys:** every trigger gets a unique `dedup_key` automatically. Only set `dedup_key` yourself if a later `acknowledge` or `resolve` must target this alert. Both of those require it.

## Routing

The account's event orchestration routes on **`custom_details.service`**, looked up by exact service name:

- **Exact name match:** the alert goes to that service.
- **No match:** an alert whose `group` contains `security` goes to **Security**. Everything else goes to **Travelduty-web**.

So, for every `service` value a scenario uses, create a PagerDuty service with exactly that name. All alerts use the one routing key in the panel (`integration_key`).

## Change events (`change`)

```json
{
  "type": "change",
  "routing_key_env": "PD_DATA_PLATFORM_CHANGE_KEY",
  "summary": "Deployed orders-service v5.12.0 to production - runs migration 20261114_add_fulfilment_status (ALTER TABLE orders)",
  "source": "github-actions:data-platform/orders-service",
  "offset_minutes": -9,
  "custom_details": {
    "service": "data-platform",
    "change_type": "schema migration",
    "version": "v5.12.0",
    "previous_version": "v5.11.3",
    "...": "..."
  },
  "links": [ { "href": "https://github.example.com/.../pull/2214", "text": "View Pull Request" } ]
}
```

**Endpoint:** change events go to `/v2/change/enqueue` as real PagerDuty change events, not alerts. They have no severity and no dedup key.

**`offset_minutes`:** backdates the event, so `-9` puts it 9 minutes before the run. This is how you plant the cause ahead of the symptoms: a deploy, a library upgrade, a flag flip, a break-glass access. Put change events first in the array.

**`routing_key_env`:** names a change key in the panel. Only change events use it; alerts ignore it.
- **One name per owning service:** so the change lands on the right service, for example `PD_CLAIMS_CHANGE_KEY` or `PD_DATA_PLATFORM_CHANGE_KEY`.
- **The panel fills in the row:** when a definition loads, it adds an empty row for every name the definition uses. Paste in the change-events integration key from that service.
- **Fallback:** if no key is stored under that name, the event goes to the main routing key and logs a warning.

**`change_type`:** set it in `custom_details` (`library upgrade`, `schema migration`, `privileged access`, `feature flag`, …). Both responders and tests read it.

## Chart images (dash.apps.fintonlabs.com)

PagerDuty shows each entry in `images[]` on the alert. Use dashcall to draw charts from the scenario's numbers.

**URL shape:** `https://dash.apps.fintonlabs.com/<key>.png?<params>`

- **`<key>`:** a unique seed per chart, for example `dp-blocked`. The same key and parameters always give the same pixels, and responses are cached.
- **House look:** add `theme=ink&font=familjen&size=800x400` to every chart so a scenario reads as one set.
- **Time axis:** ten points with `labels=-9m,-8m,...,now`, or `-45m ... now` in 5-minute steps.

| Parameter | Use |
|---|---|
| `style` | `line`, `area`, `bar`, `hbar`, `stacked`, `gauge`, `donut`, `pie`, `heatmap`, `stat`, `table`, … (full list: `/api/styles`) |
| `series` | `1,2,3` for one series. `a:1,2,3;b:4,5,6` for named series. For donut or pie slices: `matched:41870;unmatched:1204`. For a gauge: one value |
| `labels` | Comma list of category or time labels |
| `title` | Chart title. Put the threshold in it ("warn above 2000ms") |
| `target` | Draws the threshold line |
| `min`, `max` | Axis or gauge range |
| `suffix`, `prefix` | Units: `ms`, `%`, `d` |
| `valuelabels=1` | Number on each bar |
| `colors` | Hex list, e.g. `3fb950,f0646b` for healthy green and unhealthy red |

Rules:
- **Encode the query properly.** A bare `%` (for example `suffix=%`) makes the URL invalid, and PagerDuty can drop the image. Build URLs with `urllib.parse.urlencode(q, safe=',:;*')` or the JavaScript equivalent, so `%` becomes `%25`.
- **Make the chart show what the alert says.** The last point should match the summary's current value (latency ending at 3.18s, blocked sessions at 64), with the threshold as `target`.
- **One chart per alert,** with `src` and `href` set to the same URL and an `alt` that says what it shows.
- **Look at every chart before shipping.** Fetch each URL and view it. Long `hbar` labels get cut off, and `hbar` sorts its bars, so it can't show a fixed order.
- **Skip charts on change events.** The deploy or PR link carries them.

## Runbook per scenario

Every scenario gets a runbook, and every alert in it links to that runbook.

1. **Write it** as `docs/runbooks/<scenario-id>.md`, using the template below.
2. **Link it from every alert** in the scenario: `"links": [ { "href": "<runbook URL>", "text": "Runbook: <title>" } ]`. Keep the GitHub or wiki URL the same as the published runbook.
3. **Make the alerts match the runbook.** Monitor names, thresholds, handles and urgencies in `custom_details` should be the ones the runbook names, so a responder can follow it straight from the alert. The `data_platform_lock_contention` scenario is built this way from the orders-db lock contention runbook.

Template:

```markdown
# Runbook: <service> <failure>

## Purpose and service context
When to use it, the usual cause, and how to tell you're in the right place
(which alerts fired, which class, what you see).

| Item | Detail |
|---|---|
| Service | ... |
| Primary host | ... |
| Owning team | ... |
| Failure mode | ... |

## Alerts and severity
| Level | Monitor | Threshold | Handle | Urgency |
|---|---|---|---|---|

## First five minutes
Numbered steps: acknowledge, size the impact, run diagnostics, find the cause.

## Diagnostics
The Automation Action or queries to run, and how to read the output.

## Remediation
| Situation | Action | Why |
|---|---|---|
Safety conditions before anything destructive.

## Verification, rollback and escalation
- [ ] Checks before resolving
Rollback notes. Who to escalate to, and how.
```

## Checklist for a new scenario

1. Write the runbook first. It decides the monitors, thresholds and the fix.
2. Add the scenario to `extension/sample-event-definition.json`: change events first (backdated), then alerts in arrival order with `delay`s.
3. Every alert has `custom_details.service` and the shared `problem`, a chart image, and the runbook link.
4. Create a PagerDuty service for each `service` value. Add a change-events integration for each change key name.
5. Add a test to `test/run.mjs`, copying `shipped scenario: data-platform orders-db lock contention`. It should check event order, change keys, `service` and images. Then run `cd test && npm test`.
6. Release (see **Packaging a release** in `CLAUDE.md`), then **Load default** in the panel.
