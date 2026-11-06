// OPT-IN smoke test of the LIVE read-only catalogue. It makes a handful of real requests to a third party's servers
// (config, one search, one show, one episode list), so run it sparingly:  node tests/live-smoke.mjs [query] [outDir] [channel: channel5|itvx]
// Needs Playwright + Chromium. Honours HTTPS_PROXY if set.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const query = process.argv[2] ?? '999', out = process.argv[3] ?? '/tmp/high5-live', channel = process.argv[4] ?? 'channel5'; mkdirSync(out, { recursive: true });
const HOSTS = { channel5: /^GET https:\/\/(cassie|corona|api-images)\.channel5\.com\//, itvx: /^GET https:\/\/(textsearch\.prd\.oasvc|ovp)\.itv\.com\// }[channel];
const PORT = 8124;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
const browser = await chromium.launch({ proxy });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: !!proxy })).newPage();
await page.addInitScript((c) => { try { localStorage.setItem('high5.channel', c); } catch {} }, channel);
const requests = []; page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) requests.push(r.method() + ' ' + r.url().replace(/\?.*/, '?…')); });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${PORT}/#/search`);
  await page.waitForSelector('input[type=search]');
  await page.locator('input[type=search]').fill(query);
  await page.waitForSelector('.grid .tile', { timeout: 20000 });
  const titles = await page.locator('.grid .tile .t').allInnerTexts();
  console.log('search results:', titles.join(' | '));
  const loaded = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((i) => i.complete && i.naturalWidth > 0).length, sel);
  await page.waitForFunction(() => document.querySelectorAll('.tile img.poster').length > 0 && [...document.querySelectorAll('.tile img.poster')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
  console.log('poster images loaded in results:', await loaded('.tile img.poster'));
  await page.screenshot({ path: `${out}/live-1-search.png` });
  await page.locator('.grid .tile').first().click();
  if (channel === 'channel5') await page.waitForSelector('.ep', { timeout: 20000 }); else await page.waitForSelector('main h1', { timeout: 20000 });
  const heading = await page.locator('h1').innerText(), n = await page.locator('.ep').count();
  console.log(`show page: "${heading}" with ${n} episode(s) in the first series`);
  await page.waitForFunction(() => [...document.querySelectorAll('img.banner, img.thumb')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
  console.log('banner/thumbnail images loaded on show page:', await loaded('img.banner, img.thumb'));
  console.log('synopsis shown:', (await page.locator('main p').allInnerTexts()).some((t) => t.length > 40));
  await page.screenshot({ path: `${out}/live-2-show.png` });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, 'no sideways scroll on a phone, overflow=' + overflow);
  await page.screenshot({ path: `${out}/live-3-show-phone.png` });
  assert.ok(titles.length > 0 && (channel !== 'channel5' || n > 0));
  assert.ok(requests.every((r) => r.startsWith('GET ')), 'only GET requests: ' + requests.join(', '));
  assert.ok(requests.every((r) => HOSTS.test(r)), 'only expected hosts: ' + requests.join(', '));
  assert.deepEqual(errors, []);
  console.log('requests made:\n  ' + requests.join('\n  '));
  console.log('LIVE SMOKE PASSED');
} catch (e) { await page.screenshot({ path: `${out}/live-FAIL.png` }).catch(() => {}); console.error('LIVE SMOKE FAILED:', e.message, '\nrequests:', requests, '\nerrors:', errors); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
