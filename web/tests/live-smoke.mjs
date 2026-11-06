// OPT-IN smoke test of the LIVE read-only catalogue. It makes a handful of real requests to a third party's servers
// (config, one search, one show, one episode list), so run it sparingly:  node tests/live-smoke.mjs [query] [outDir]
// Needs Playwright + Chromium. Honours HTTPS_PROXY if set.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const query = process.argv[2] ?? '999', out = process.argv[3] ?? '/tmp/high5-live'; mkdirSync(out, { recursive: true });
const PORT = 8124;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
const browser = await chromium.launch({ proxy });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: !!proxy })).newPage();
await page.addInitScript(() => { try { localStorage.setItem('high5.source', 'live'); } catch {} });
const requests = []; page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) requests.push(r.method() + ' ' + r.url().replace(/\?.*/, '?…')); });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${PORT}/#/search`);
  await page.waitForSelector('input[type=search]');
  await page.locator('input[type=search]').fill(query);
  await page.waitForSelector('.grid .tile', { timeout: 20000 });
  const titles = await page.locator('.grid .tile .t').allInnerTexts();
  console.log('search results:', titles.join(' | '));
  await page.screenshot({ path: `${out}/live-1-search.png` });
  await page.locator('.grid .tile').first().click();
  await page.waitForSelector('.ep', { timeout: 20000 });
  const heading = await page.locator('h1').innerText(), n = await page.locator('.ep').count();
  console.log(`show page: "${heading}" with ${n} episode(s) in the first series`);
  await page.screenshot({ path: `${out}/live-2-show.png` });
  assert.ok(titles.length > 0 && n > 0);
  assert.ok(requests.every((r) => r.startsWith('GET ')), 'only GET requests: ' + requests.join(', '));
  assert.deepEqual(errors, []);
  console.log('requests made:\n  ' + requests.join('\n  '));
  console.log('LIVE SMOKE PASSED');
} catch (e) { await page.screenshot({ path: `${out}/live-FAIL.png` }).catch(() => {}); console.error('LIVE SMOKE FAILED:', e.message, '\nrequests:', requests, '\nerrors:', errors); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
