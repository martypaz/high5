// Browser test of channel switching and the ITVX channel UI. The network is stubbed INSIDE the browser (nothing leaves this machine),
// so it uses invented data and never contacts a real service.  node tests/channels-e2e.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '/tmp/high5-channels'; mkdirSync(out, { recursive: true });
const PORT = 8125;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const external = []; const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Any non-local request is answered here. Record it; never let it out.
await page.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), async (route) => {
  const url = route.request().url(); external.push(route.request().method() + ' ' + new URL(url).host + new URL(url).pathname);
  if (url.includes('textsearch.prd.oasvc.itv.com/search')) {
    const mk = (id, t, extra = {}) => ({ contentType: 'vod', entityType: 'programme', data: { programmeCCId: id, programmeTitle: t, synopsis: 'A made-up synopsis.', genre: ['Drama'], totalAvailableEpisodes: 4, tier: 'FREE', latestAvailableEpisode: { imageHref: 'https://ovp.itv.com/images/prXXXXXXX/XXXXXXX/itv_hub/rail/16x9?w={width}&h={height}&q={quality}' }, ...extra } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: [mk('1_1', 'Harbour Detectives'), mk('1_2', 'Orbit Kids', { tier: 'PAID' }), { contentType: 'live', entityType: 'channel', data: { channelName: 'Live One' } }] }) });
  }
  if (route.request().resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
  return route.fulfill({ status: 404, body: 'blocked in test' });
});
await page.addInitScript(() => { try { if (!sessionStorage.getItem('h5init')) { sessionStorage.setItem('h5init', '1'); localStorage.setItem('high5.channel', 'demo'); } } catch {} });   // start on Demo once, then let the test switch
try {
  await page.goto(`http://127.0.0.1:${PORT}/#/channels`); await page.waitForSelector('button.tile');
  const names = await page.locator('button.tile .t').allInnerTexts();
  assert.deepEqual(names, ['Channel 5', 'ITVX', 'Demo']); assert.match(await page.locator('#channel-link').innerText(), /Channel: Demo/);
  assert.match(await page.locator('button.tile', { hasText: 'ITVX' }).innerText(), /Beta/);
  await page.screenshot({ path: `${out}/c1-channels.png` });
  await page.locator('button.tile', { hasText: 'ITVX' }).click(); await page.waitForLoadState('load'); await page.waitForSelector('#channel-link');
  await page.waitForFunction(() => /Channel: ITVX/.test(document.querySelector('#channel-link')?.textContent ?? ''));
  assert.equal(await page.evaluate(() => localStorage.getItem('high5.channel')), 'itvx');
  await page.goto(`http://127.0.0.1:${PORT}/#/search`); await page.waitForSelector('input[type=search]');
  assert.match(await page.locator('main').innerText(), /search ITVX/i);
  await page.locator('input[type=search]').fill('harbour'); await page.waitForSelector('.grid .tile');
  assert.deepEqual(await page.locator('.grid .tile .t').allInnerTexts(), ['Harbour Detectives', 'Orbit Kids']);   // the live channel item is dropped
  assert.equal(await page.locator('.tile .badge').count(), 0);                                                      // unknown ratings are not displayed
  await page.waitForFunction(() => [...document.querySelectorAll('.tile img.poster')].some((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: `${out}/c2-itvx-search.png` });
  await page.locator('.grid .tile').first().click(); await page.waitForSelector('h1');
  assert.match(await page.locator('h1').innerText(), /Harbour Detectives/); assert.match(await page.locator('main').innerText(), /No episodes are listed|4 episodes available/); assert.match(await page.locator('main').innerText(), /A made-up synopsis/);
  assert.match(await page.locator('main').innerText(), /Playback is not available/);
  await page.screenshot({ path: `${out}/c3-itvx-show.png` });
  assert.ok(external.some((r) => r.startsWith('GET textsearch.prd.oasvc.itv.com/search')), 'the search request was made (and answered by the stub)');
  assert.ok(external.every((r) => r.startsWith('GET ')), 'only GET requests: ' + external.join(', '));
  // Scenario 2: what a CORS-blocked request looks like to the page: the normal fetch() fails, but a plain "no-cors" repeat of the same
  // GET goes through (the server is reachable; the browser just refuses to hand over the reply). We tell the two requests apart by their
  // Accept header: the app's JSON request sends `application/json`, the reachability check sends none.
  const p2 = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await p2.addInitScript(() => { try { localStorage.setItem('high5.channel', 'itvx'); } catch {} });
  await p2.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (route) =>
    (route.request().headers()['accept'] ?? '').includes('application/json') ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'text/plain', body: 'opaque' }));
  await p2.goto(`http://127.0.0.1:${PORT}/#/search`); await p2.waitForSelector('input[type=search]');
  await p2.locator('input[type=search]').fill('harbour');
  await p2.waitForFunction(() => /blocked the reply/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 15000 });
  await p2.screenshot({ path: `${out}/c4-cors-explained.png` });
  console.log('cors scenario: the app explained that the browser blocked the reply');
  assert.deepEqual(errors, [], errors.join('|'));
  console.log('CHANNELS E2E PASSED\nrequests (all answered by the in-browser stub):\n  ' + external.join('\n  '));
} catch (e) { await page.screenshot({ path: `${out}/c-FAIL.png` }).catch(() => {}); console.error('CHANNELS E2E FAILED:', e.message, '\nrequests:', external, '\nerrors:', errors); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
