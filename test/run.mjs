// End-to-end tests for the Incident Injector extension.
//
// Loads ../extension unpacked into Chrome for Testing, maps events.pagerduty.com
// to a local HTTPS mock and *.test origins to a local page server, then drives
// real (trusted) clicks through CDP.
//
//   cd test && npm install && npm test            # all
//   npm test -- shadow                            # tests whose name contains "shadow"
//   HEADFUL=1 npm test                            # watch it run
//
// Needs Chrome for Testing (npx @puppeteer/browsers install chrome@stable) or
// CHROME_PATH. Branded Google Chrome ignores --load-extension.

import puppeteer from 'puppeteer-core';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pages } from './pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, process.env.EXT_DIR || '../extension');
const OUT = path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] || '';
const KEY = 'a'.repeat(32);

// ---------------------------------------------------------------- chrome
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache/puppeteer/chrome');
  const builds = fs.existsSync(root) ? fs.readdirSync(root).sort().reverse() : [];
  for (const b of builds) {
    const mac = path.join(root, b, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    const macx = path.join(root, b, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    const linux = path.join(root, b, 'chrome-linux64/chrome');
    for (const p of [mac, macx, linux]) if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome for Testing not found; set CHROME_PATH');
}

// ---------------------------------------------------------------- PagerDuty mock
const certDir = path.join(here, '.cert');
if (!fs.existsSync(path.join(certDir, 'key.pem'))) {
  fs.mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
    '-subj', '/CN=events.pagerduty.com', '-keyout', path.join(certDir, 'key.pem'), '-out', path.join(certDir, 'cert.pem')],
    { stdio: 'ignore' });
}
const events = [];
const pd = https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let json = {};
    try { json = JSON.parse(body); } catch (e) { /* keep raw */ }
    events.push({ t: Date.now(), path: req.url, json });
    res.writeHead(202, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ status: 'success', message: 'Event processed', dedup_key: json.dedup_key || 'mock' }));
  });
});

// ---------------------------------------------------------------- page server
const site = http.createServer((req, res) => {
  const page = pages[req.url.split('?')[0]];
  if (!page) { res.writeHead(404); return res.end('nope'); }
  const { headers = {}, body } = typeof page === 'string' ? { body: page } : page;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
});

const listen = (srv) => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const pdPort = await listen(pd);
const sitePort = await listen(site);

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: !process.env.HEADFUL,
  pipe: true,
  protocolTimeout: 20000,
  enableExtensions: [EXT],
  args: [
    `--host-resolver-rules=MAP events.pagerduty.com 127.0.0.1:${pdPort}, MAP *.test 127.0.0.1:${sitePort}`,
    '--ignore-certificate-errors',
    '--no-first-run',
    '--window-size=1280,860',
  ],
  defaultViewport: { width: 1280, height: 860 },
});

let swTarget = null;
async function getWorker() {
  const old = swTarget;
  swTarget = await browser.waitForTarget(t => t !== old && t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
  return swTarget.worker();
}
let worker = await getWorker();
const sw = (fn, ...args) => worker.evaluate(fn, ...args);
// Let onInstalled finish writing first-install defaults before tests set their own.
for (let i = 0; i < 50; i++) {
  const s = await sw(() => chrome.storage.sync.get(['active_scenario_ids']));
  if (s.active_scenario_ids) break;
  await new Promise(r => setTimeout(r, 100));
}

const BASE = {
  integration_key: KEY,
  extension_enabled: true,
  trigger_on_click_enabled: true,
  target_element_texts: 'Login, Place order, Checkout',
  show_alert: false,
  allow_form_continuation: true,
  redirect_to_500: false,
  run_scenario_on_submit: false,
  trigger_crux: false,
  active_scenario_id: '',
  active_scenario_ids: [],
  run_stagger: false,
  change_keys: [],
  routing_keys: [],
};
async function settings(over = {}) {
  await sw(o => chrome.storage.sync.set(o), { ...BASE, ...over });
}

const DEFINITION = {
  event_definitions: [
    { id: 'decoy', name: 'Decoy (index 0)', events: [{ type: 'trigger', summary: 'DECOY should not run', severity: 'info' }] },
    { id: '1-db-outage', name: 'DB outage', description: 'id starts with a digit', events: [
      { type: 'trigger', summary: 'DB primary down', severity: 'critical', delay: { type: 'fixed', value: 300 } },
      { type: 'trigger', summary: 'DB replica lag', severity: 'warning', delay: { type: 'fixed', value: 300 } } ] },
    { id: 'api_latency', name: 'API latency', events: [
      { type: 'trigger', summary: 'API p95 high', severity: 'warning', delay: { type: 'fixed', value: 300 } },
      { type: 'trigger', summary: 'API errors', severity: 'error', delay: { type: 'fixed', value: 300 } } ] },
  ],
};

// ---------------------------------------------------------------- helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(url, wait = 'load') {
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(url, { waitUntil: wait });
  await sleep(250); // content script settings load
  return page;
}
async function clickIn(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 5000 });
  await el.click();
}
const site$ = page => page.evaluate(() => window.__site);

const results = [];
async function test(name, fn) {
  if (filter && !name.includes(filter)) return;
  events.length = 0;
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
    console.log(`  pass  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - start, err: e.message });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  } finally {
    for (const p of (await browser.pages()).slice(1)) await p.close().catch(() => {});
  }
}
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);
function eq(actual, expected, what) {
  if (canon(actual) !== canon(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const triggers = () => events.filter(e => e.json?.event_action === 'trigger');

// ---------------------------------------------------------------- tests
const A = 'http://site-a.test';

await test('button: one incident, site handler runs once, no replay loop', async () => {
  await settings();
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(1500);
  eq(triggers().length, 1, 'incidents');
  eq((await site$(p)).clicks, 1, 'site clicks');
});

await test('form: click on submit button fires once (no click+submit double)', async () => {
  await settings();
  const p = await open(`${A}/form`);
  await clickIn(p, '#b');
  await sleep(1500);
  eq(triggers().length, 1, 'incidents');
  eq((await site$(p)).submits, 1, 'site onsubmit');
});

await test('form: Enter key submit is caught', async () => {
  await settings();
  const p = await open(`${A}/form`);
  await clickIn(p, 'input[name=q]');
  await p.keyboard.press('Enter');
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
  eq((await site$(p)).submits, 1, 'site onsubmit');
});

await test('link: one incident, navigation proceeds', async () => {
  await settings();
  const p = await open(`${A}/link`);
  await clickIn(p, '#a');
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
  eq(await p.evaluate(() => location.hash), '#done', 'hash');
});

await test('text variants: newline, nbsp, svg icon, input submit, role=button, bare div, badge', async () => {
  await settings();
  const p = await open(`${A}/variants`);
  for (const sel of ['#v1', '#v2', '#v3path', '#v4', '#v5', '#v6', '#v7']) {
    await clickIn(p, sel);
    await sleep(250);
  }
  await sleep(1000);
  eq(triggers().length, 7, 'incidents');
});

await test('negatives: nav aria-label, text input value, long paragraph, other submit button', async () => {
  await settings();
  const p = await open(`${A}/negatives`);
  for (const sel of ['#n1', '#n2', '#n3', '#n4']) {
    await clickIn(p, sel);
    await sleep(250);
  }
  await sleep(800);
  eq(triggers().length, 0, 'false-positive incidents');
  await clickIn(p, '#n4ok');
  await sleep(1000);
  eq(triggers().length, 1, 'incidents after the right button');
});

await test('shadow DOM button', async () => {
  await settings();
  const p = await open(`${A}/shadow`);
  const btn = await p.evaluateHandle(() => document.querySelector('#host').shadowRoot.querySelector('#sb'));
  await btn.click();
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
});

await test('iframes: same-origin and cross-origin', async () => {
  await settings();
  const p = await open(`${A}/frames`);
  await sleep(500);
  for (const id of ['same', 'cross']) {
    const frame = await (await p.$(`#${id}`)).contentFrame();
    await (await frame.waitForSelector('#b')).click();
    await sleep(400);
  }
  await sleep(1000);
  eq(triggers().length, 2, 'incidents');
});

await test('site that stops clicks at window capture', async () => {
  await settings();
  const p = await open(`${A}/stopper`);
  await clickIn(p, '#b');
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
});

await test('late-rendered button (SPA)', async () => {
  await settings();
  const p = await open(`${A}/late`);
  await clickIn(p, '#b');
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
});

await test('dedup keys unique per incident and per page', async () => {
  await settings();
  const p = await open(`${A}/button`);
  for (let i = 0; i < 3; i++) { await clickIn(p, '#b'); await sleep(300); }
  const q = await open(`${A}/link`);
  await clickIn(q, '#a');
  await sleep(1200);
  const keys = triggers().map(e => e.json.dedup_key);
  eq(keys.length, 4, 'incidents');
  eq(new Set(keys).size, 4, 'unique dedup keys');
});

await test('block mode: action cancelled, site handler never runs', async () => {
  await settings({ allow_form_continuation: false });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(1200);
  eq(triggers().length, 1, 'incidents');
  eq((await site$(p)).clicks, 0, 'site clicks');
});

await test('alert then continue: action replays exactly once', async () => {
  await settings({ show_alert: true, allow_form_continuation: true });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(1500);
  eq(triggers().length, 1, 'incidents');
  eq((await site$(p)).clicks, 1, 'site clicks');
  const f = await open(`${A}/form`);
  events.length = 0;
  await clickIn(f, '#b');
  await sleep(1500);
  eq(triggers().length, 1, 'form incidents');
  eq((await site$(f)).submits, 1, 'site onsubmit (via requestSubmit)');
});

await test('500 page on a normal site', async () => {
  await settings({ redirect_to_500: true });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(1200);
  const text = await p.evaluate(() => document.body.innerText);
  if (!/500/.test(text)) throw new Error('500 page not shown: ' + text.slice(0, 80));
});

await test('500 page on a Trusted Types site that refuses our policy', async () => {
  await settings({ redirect_to_500: true });
  const p = await open(`${A}/tt`);
  await clickIn(p, '#b');
  await sleep(1200);
  const text = await p.evaluate(() => document.body ? document.body.innerText : '(no body)');
  if (!/500/.test(text)) throw new Error('500 page not shown: ' + text.slice(0, 80));
});

await test('500 from a cross-origin iframe covers the top page', async () => {
  await settings({ redirect_to_500: true });
  const p = await open(`${A}/frame500`);
  const frame = await (await p.$('#cross')).contentFrame();
  await (await frame.waitForSelector('#b')).click();
  await sleep(1500);
  const text = await p.evaluate(() => document.body.innerText);
  if (!/500/.test(text) || /Original top page/.test(text)) throw new Error('top page not replaced: ' + text.slice(0, 80));
});

await test('disabled extension intercepts nothing', async () => {
  await settings({ extension_enabled: false });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(1000);
  eq(triggers().length, 0, 'incidents');
  eq((await site$(p)).clicks, 1, 'site clicks');
});

await test('settings change applies to an open tab without reload', async () => {
  await settings({ target_element_texts: 'Nothing here' });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(600);
  eq(triggers().length, 0, 'before');
  await settings();
  await sleep(300);
  await clickIn(p, '#b');
  await sleep(1000);
  eq(triggers().length, 1, 'after');
});

await test('multiple scenarios fire together on an intercepted click', async () => {
  await sw(d => chrome.storage.local.set({ event_definition: JSON.stringify(d) }), DEFINITION);
  await settings({ run_scenario_on_submit: true, active_scenario_ids: ['1-db-outage', 'api_latency'], active_scenario_id: '1-db-outage' });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(3000);
  const summaries = triggers().map(e => e.json.payload.summary);
  for (const s of ['DB primary down', 'DB replica lag', 'API p95 high', 'API errors']) {
    if (!summaries.includes(s)) throw new Error(`missing "${s}" in ${JSON.stringify(summaries)}`);
  }
  if (summaries.some(s => s.includes('DECOY'))) throw new Error('digit-leading id resolved to index 0');
  const db = events.find(e => e.json?.payload?.summary === 'DB primary down').t;
  const api = events.find(e => e.json?.payload?.summary === 'API p95 high').t;
  if (Math.abs(db - api) > 250) throw new Error(`scenarios not concurrent (${Math.abs(db - api)}ms apart)`);
});

await test('stagger: second scenario starts ~5s after the first', async () => {
  await sw(d => chrome.storage.local.set({ event_definition: JSON.stringify(d) }), DEFINITION);
  await settings({ run_scenario_on_submit: true, run_stagger: true, active_scenario_ids: ['1-db-outage', 'api_latency'], active_scenario_id: '1-db-outage' });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  await sleep(7000);
  const db = events.find(e => e.json?.payload?.summary === 'DB primary down')?.t;
  const api = events.find(e => e.json?.payload?.summary === 'API p95 high')?.t;
  if (!db || !api) throw new Error('scenario events missing');
  if (api - db < 4500) throw new Error(`not staggered (${api - db}ms)`);
});

await test('shipped scenarios: DDoS + payments storm, real change events', async () => {
  await sw(async () => {
    const text = await (await fetch(chrome.runtime.getURL('sample-event-definition.json'))).text();
    await chrome.storage.local.set({ event_definition: text });
  });
  const DEPLOY_KEY = 'd'.repeat(32);
  await settings({ run_scenario_on_submit: true, active_scenario_ids: ['ddos_attack', 'payments_alert_storm'], active_scenario_id: 'ddos_attack',
    change_keys: [{ name: 'PD_DEPLOY_ROUTING_KEY', key: DEPLOY_KEY }, { name: 'PD_FLAG_ROUTING_KEY', key: '' }] });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  const scenarioAlerts = () => triggers().filter(e => !String(e.json.payload.source).startsWith('http'));
  for (let i = 0; i < 80 && scenarioAlerts().length < 14; i++) await sleep(500);
  const changes = events.filter(e => e.path === '/v2/change/enqueue');
  eq(changes.length, 2, 'change events on /v2/change/enqueue');
  const deploy = changes.find(e => e.json.payload.summary.startsWith('Deployed payment-processor'));
  if (!deploy) throw new Error('deploy change missing');
  if ('event_action' in deploy.json || 'severity' in deploy.json.payload) throw new Error('change payload has trigger-only fields');
  const ago = (Date.now() - Date.parse(deploy.json.payload.timestamp)) / 60000;
  if (ago < 185 || ago > 195) throw new Error(`deploy timestamp ${ago.toFixed(1)} min ago, want ~190`);
  eq(deploy.json.links.length, 2, 'deploy links');
  eq(deploy.json.routing_key, DEPLOY_KEY, 'deploy uses PD_DEPLOY_ROUTING_KEY');
  const flag = changes.find(e => e.json.payload.summary.startsWith('Feature flag'));
  eq(flag.json.routing_key, KEY, 'flag key not set, falls back to main key');
  if (triggers().some(e => e.json.routing_key !== KEY)) throw new Error('an alert did not use the routing key');
  const t = scenarioAlerts();
  eq(t.length, 14, 'alerts (1 DDoS + 13 storm)');
  // Events go out strictly in definition order: every other service first,
  // then the payment-api CrashLoopBackOff, then the rest of payment-api.
  const storm = t.filter(e => e.json.payload.class !== 'ddos-attack');
  const svc = e => e.json.payload.custom_details?.service;
  const firstApi = storm.findIndex(e => svc(e) === 'payment-api');
  if (!storm[firstApi].json.payload.summary.includes('CrashLoopBackOff in namespace production - payment-api'))
    throw new Error(`first payment-api alert was "${storm[firstApi].json.payload.summary}"`);
  if (storm.slice(firstApi).some(e => svc(e) !== 'payment-api')) throw new Error('another service alerted after payment-api started');
  if (t.some(e => e.path !== '/v2/enqueue')) throw new Error('alert sent to wrong endpoint');
  // Every storm alert carries one dashcall chart in the top-level images field
  const bad = storm.filter(e => e.json.images?.length !== 1 || !/^https:\/\/dash\.apps\.fintonlabs\.com\/.+\.png\?/.test(e.json.images[0].src) || !e.json.images[0].alt);
  if (bad.length) throw new Error(`${bad.length} storm alerts missing a chart image, e.g. "${bad[0].json.payload.summary}"`);
  const ddos = t.find(e => e.json.payload.class === 'ddos-attack');
  eq([ddos.json.payload.source, ddos.json.payload.custom_details.service, ddos.json.payload.custom_details.requests_per_second],
     ['cloudflare-security', 'Security', 45000], 'DDoS payload');
  eq(new Set(t.map(e => e.json.dedup_key)).size, 14, 'unique dedup keys');
});

await test('shipped scenario: Reinvent (library upgrade change, then node memory cascade in order)', async () => {
  await sw(async () => {
    const text = await (await fetch(chrome.runtime.getURL('sample-event-definition.json'))).text();
    await chrome.storage.local.set({ event_definition: text });
  });
  const DEPLOY_KEY = 'd'.repeat(32);
  await settings({ run_scenario_on_submit: true, active_scenario_ids: ['reinvent_scenario'], active_scenario_id: 'reinvent_scenario',
    change_keys: [{ name: 'PD_CLAIMS_CHANGE_KEY', key: DEPLOY_KEY }] });
  const p = await open(`${A}/button`);
  await clickIn(p, '#b');
  const alerts = () => triggers().filter(e => e.json.payload.custom_details?.problem === 'claims-node-memory');
  for (let i = 0; i < 40 && alerts().length < 9; i++) await sleep(500);
  const changes = events.filter(e => e.path === '/v2/change/enqueue');
  eq(changes.length, 1, 'one change event');
  eq(changes[0].json.routing_key, DEPLOY_KEY, 'library upgrade uses PD_CLAIMS_CHANGE_KEY');
  eq(changes[0].json.payload.custom_details.change_type, 'library upgrade', 'change type');
  const ago = (Date.now() - Date.parse(changes[0].json.payload.timestamp)) / 60000;
  if (ago < 415 || ago > 425) throw new Error(`upgrade timestamp ${ago.toFixed(1)} min ago, want ~420`);
  eq(alerts().map(e => e.json.payload.custom_details.service), ['claims-reconciliation', 'kubernetes-platform', 'patient-portal',
    'patient-portal', 'appointment-scheduling', 'claims-reconciliation', 'claims-submission', 'claims-submission', 'compliance'],
    'alert order by service');
});

await test('panel: opens, new font renders, multi-select run', async () => {
  await sw(d => chrome.storage.local.set({ event_definition: JSON.stringify(d) }), DEFINITION);
  await settings({ active_scenario_ids: ['1-db-outage'], active_scenario_id: '1-db-outage' });
  const p = await open(`${A}/blank`);
  await p.bringToFront();
  await sw(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://site-a.test/blank' });
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle_panel' });
  });
  await p.waitForSelector('#incident-injector-panel.visible', { timeout: 5000 });
  await p.waitForSelector('#scenario-list input[data-scenario-id]', { timeout: 5000 });
  await sleep(600);

  const font = await p.evaluate(async () => {
    await document.fonts.ready;
    const panel = document.getElementById('incident-injector-panel');
    return { family: getComputedStyle(panel).fontFamily, loaded: document.fonts.check('13px "II Plex Sans"'), right: panel.getBoundingClientRect().right, width: panel.getBoundingClientRect().width };
  });
  if (!font.family.includes('II Plex Sans') || !font.loaded) throw new Error('font not active: ' + JSON.stringify(font));
  if (Math.round(font.right) !== 1280 || Math.round(font.width) !== 360) throw new Error('panel geometry ' + JSON.stringify(font));

  const ticked = await p.$$eval('#scenario-list input:checked', els => els.map(e => e.dataset.scenarioId));
  eq(ticked, ['1-db-outage'], 'restored selection');
  await p.click('.ii-scn[data-scenario-row="api_latency"]');
  eq(await p.$eval('#run-scenario-label', e => e.textContent), 'Run 2 scenarios', 'run label');
  await p.screenshot({ path: path.join(OUT, 'panel.png') });

  await p.click('#run-scenario-quick');
  await p.waitForFunction(() => /scenarios sent|events sent/.test(document.querySelector('#quick-action-result').textContent), { timeout: 10000 });
  const summaries = triggers().map(e => e.json.payload.summary).sort();
  eq(summaries, ['API errors', 'API p95 high', 'DB primary down', 'DB replica lag'], 'scenario events');
  const stored = await sw(() => chrome.storage.sync.get(['active_scenario_ids']));
  eq(stored.active_scenario_ids, ['1-db-outage', 'api_latency'], 'saved selection');
  await p.screenshot({ path: path.join(OUT, 'panel-after-run.png') });

  // expand sections + about sheet for a visual record
  for (const id of ['#toggle-alert-config', '#toggle-target-config']) await p.click(id);
  await p.screenshot({ path: path.join(OUT, 'panel-sections.png') });
  await p.click('#about-button');
  const about = await p.$eval('#about-dialog', el => getComputedStyle(el).display);
  eq(about, 'block', 'about sheet');
  await p.keyboard.press('Escape');
  eq(await p.$eval('#about-dialog', el => el.style.display), 'none', 'about closes on Escape');
});

async function togglePanelOn(urlPath) {
  return sw(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    return chrome.tabs.sendMessage(tab.id, { action: 'toggle_panel' });
  }, `http://site-a.test${urlPath}`);
}
async function assertPanelOnScreen(p) {
  await p.waitForSelector('#incident-injector-panel.visible #scenario-list', { timeout: 8000 });
  await sleep(400);
  const r = await p.evaluate(() => {
    const b = document.getElementById('incident-injector-panel').getBoundingClientRect();
    return { right: Math.round(b.right), width: Math.round(b.width), vw: innerWidth };
  });
  if (r.right !== r.vw || r.width !== 360) throw new Error('panel not on screen: ' + JSON.stringify(r));
}

await test('panel: change key rows from definition, saved to storage', async () => {
  const def = { event_definitions: [{ id: 'chg', name: 'Change', events: [
    { type: 'change', routing_key_env: 'PD_DEPLOY_ROUTING_KEY', summary: 'deploy' },
    { type: 'trigger', routing_key_env: 'ALERT_SHOULD_NOT_GET_A_ROW', summary: 'alert', severity: 'error' }] }] };
  await sw(d => chrome.storage.local.set({ event_definition: JSON.stringify(d) }), def);
  await settings({ change_keys: [{ name: 'EXISTING', key: 'e'.repeat(32) }] });
  const p = await open(`${A}/blank`);
  await p.bringToFront();
  await sw(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://site-a.test/blank' });
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle_panel' });
  });
  await p.waitForSelector('#incident-injector-panel.visible', { timeout: 5000 });
  await p.waitForSelector('#routing-key-list .ii-rk', { timeout: 5000 });
  await sleep(500);
  const names = await p.$$eval('#routing-key-list .ii-rk-name', els => els.map(e => e.value));
  eq(names.sort(), ['EXISTING', 'PD_DEPLOY_ROUTING_KEY'], 'rows');
  await p.click('#toggle-pagerduty-config');
  const keyInputs = await p.$$('#routing-key-list .ii-rk-key');
  const idx = (await p.$$eval('#routing-key-list .ii-rk-name', els => els.map(e => e.value))).indexOf('PD_DEPLOY_ROUTING_KEY');
  await keyInputs[idx].type('f'.repeat(32));
  await p.keyboard.press('Tab');
  await sleep(500);
  const stored = (await sw(() => chrome.storage.sync.get(['change_keys']))).change_keys;
  eq(stored, [{ name: 'EXISTING', key: 'e'.repeat(32) }, { name: 'PD_DEPLOY_ROUTING_KEY', key: 'f'.repeat(32) }], 'stored keys');
  if (!(await p.$eval('#key-summary', e => e.textContent)).includes('2 change')) throw new Error('summary missing named key count');
  await p.screenshot({ path: path.join(OUT, 'panel-routing-keys.png') }).catch(() => {});
});

await test('panel opens on first click on a busy page (no 200ms race)', async () => {
  await settings();
  const p = await open(`${A}/busy`);
  await p.bringToFront();
  const resp = await togglePanelOn('/busy');
  eq(resp, { success: true }, 'toggle response');
  await assertPanelOnScreen(p);
});

await test('stale panel from an older build is replaced', async () => {
  await settings();
  const p = await open(`${A}/stale`);
  await p.bringToFront();
  await togglePanelOn('/stale');
  await assertPanelOnScreen(p);
  eq(await p.$$eval('#incident-injector-panel', els => els.length), 1, 'panel count');
});

await test('panel toggles closed and open again', async () => {
  await settings();
  const p = await open(`${A}/blank`);
  await p.bringToFront();
  await togglePanelOn('/blank');
  await assertPanelOnScreen(p);
  await togglePanelOn('/blank');
  await sleep(600);
  eq(await p.$eval('#incident-injector-panel', el => el.classList.contains('visible')), false, 'closed');
  await togglePanelOn('/blank');
  await assertPanelOnScreen(p);
});

await test('extension reload keeps user settings (onInstalled no longer resets)', async () => {
  await settings({ target_element_texts: 'Zebra crossing', show_alert: true, active_scenario_ids: ['api_latency'] });
  await sw(() => { setTimeout(() => chrome.runtime.reload(), 50); });
  worker = await getWorker();
  await sleep(1000);
  await sleep(500);
  const s = await sw(() => chrome.storage.sync.get(['target_element_texts', 'show_alert', 'active_scenario_ids']));
  eq(s, { target_element_texts: 'Zebra crossing', show_alert: true, active_scenario_ids: ['api_latency'] }, 'settings after reload');
});

// ---------------------------------------------------------------- report
await browser.close();
pd.close();
site.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
