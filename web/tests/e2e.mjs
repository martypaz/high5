// End-to-end smoke test driven only by keyboard (like a D-pad). Needs Playwright + Chromium (not an npm dependency of the project).
// Usage: node tests/e2e.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] ?? '/tmp/high5-shots'; mkdirSync(out, { recursive: true });
const PORT = 8123;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('high5.source', 'demo'); } catch {} });   // never hit real servers from this test
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(60); } };
const text = () => page.locator('body').innerText();
const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 60));
let step = 0; const shot = (n) => page.screenshot({ path: `${out}/${String(++step).padStart(2, '0')}-${n}.png` });

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('.code');
  assert.match(await text(), /ABCD-1234/); await shot('signin');
  await page.waitForURL('**/#/home', { timeout: 15000 });
  await page.waitForSelector('.tile');
  assert.match(await text(), /Popular now/); await shot('home');

  // D-pad: down from the nav bar should land on the first tile; Enter opens it.
  await key('ArrowDown');
  const first = await focused(); assert.ok(first && first.length > 0, 'something is focused');
  await key('ArrowRight'); await key('ArrowLeft');
  await key('Enter'); await page.waitForSelector('h1');
  assert.match(page.url(), /#\/show\//); await shot('show');
  assert.match(await text(), /Series 1|Episode 1/);

  // Add to My List with the keyboard
  for (let i = 0; i < 6 && !(await focused())?.includes('My List'); i++) await key('ArrowRight');
  await key('Enter'); assert.match(await text(), /Remove from My List/);

  // Play (first focusable in .row is the Play link)
  await page.locator('.row a.btn.primary').focus(); await key('Enter');
  await page.waitForSelector('video'); assert.match(page.url(), /#\/play\//); await shot('player');
  await key('Escape'); await page.waitForTimeout(300);
  assert.match(page.url(), /#\/show\//);

  // My List
  await page.goto(`http://127.0.0.1:${PORT}/#/mylist`); await page.waitForSelector('.tile');
  assert.match(await text(), /My List/); await shot('mylist');

  // Search (latest wins; typed via keyboard)
  await page.goto(`http://127.0.0.1:${PORT}/#/search`); await page.waitForSelector('input[type=search]');
  await page.locator('input[type=search]').focus(); await page.keyboard.type('bake', { delay: 40 });
  await page.waitForSelector('.grid .tile'); assert.match(await text(), /The Great Village Bake/); await shot('search');

  // TV guide
  await page.goto(`http://127.0.0.1:${PORT}/#/guide`); await page.waitForSelector('table.guide');
  assert.match(await text(), /Now/); await shot('guide');

  // Parental controls: set PIN, limit to PG, verify an 18 show disappears, and the PIN is required to change it back
  await page.goto(`http://127.0.0.1:${PORT}/#/settings`); await page.waitForSelector('select[aria-label="Maximum age rating"]');
  await page.locator('input[type=password]').fill('1234');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('PIN saved'));
  await page.locator('select[aria-label="Maximum age rating"]').selectOption('1');              // PG - PIN still typed? field was cleared, so this must be refused
  await page.waitForFunction(() => document.body.innerText.includes('Enter your PIN'));
  await page.locator('input[type=password]').fill('1234');
  await page.locator('select[aria-label="Maximum age rating"]').selectOption('1');
  await page.waitForFunction(() => document.body.innerText.includes('Rating limit updated')); await shot('settings');
  await page.goto(`http://127.0.0.1:${PORT}/#/home`); await page.waitForSelector('.tile');
  const home = await text();
  assert.ok(!home.includes('Late Night Laughs') && !home.includes('Night Shift ER'), 'restricted titles hidden');
  assert.ok(home.includes('Orbit Kids'), 'family titles still shown'); await shot('home-restricted');

  assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('E2E PASSED - screenshots in', out);
} catch (e) {
  await shot('FAILURE').catch(() => {});
  console.error('E2E FAILED:', e.message, '\nerrors:', errors); process.exitCode = 1;
} finally { await browser.close(); server.kill(); }
