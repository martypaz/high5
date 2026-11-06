import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate, allowedOrigin, safeId, getJson, ratingMapper, str, num } from '../js/channels/kit.js';
import { CHANNELS, findChannel, pickChannel, DEFAULT_CHANNEL } from '../js/channels/index.js';
import { MemoryStore } from '../js/core.js';

test('kit: templates, safe ids, and tolerant scalars', () => {
  assert.equal(fillTemplate('/s/{id}?q={q}&x={x}', { id: 'a b', q: '&' }), '/s/a%20b?q=%26&x=');
  for (const ok of ['123', 'C5254060002', 'a-b_c']) assert.equal(safeId(ok), true);
  for (const bad of ['', '../x', 'a/b', '1?x', null, undefined]) assert.equal(safeId(bad), false);
  assert.equal(str(5, 'd'), 'd'); assert.equal(num('x', 7), 7); assert.equal(num('3'), 3);
});

test('kit: allowedOrigin only accepts https on the listed domains and their subdomains', () => {
  assert.equal(allowedOrigin('https://a.example.com/x', ['example.com']), 'https://a.example.com');
  assert.equal(allowedOrigin('https://example.com', ['example.com']), 'https://example.com');
  for (const bad of ['http://a.example.com', 'https://evil-example.com', 'https://example.com.evil.net', 'https://x.test', 'javascript:alert(1)'])
    assert.throws(() => allowedOrigin(bad, ['example.com']));
});

test('kit: getJson is anonymous and turns failures into readable errors', async () => {
  let seen; const ok = async (u, o) => { seen = o; return { ok: true, status: 200, json: async () => ({ a: 1 }) }; };
  assert.deepEqual(await getJson(ok, 'https://x', 'application/x'), { a: 1 });
  assert.equal(seen.credentials, 'omit'); assert.equal(seen.referrerPolicy, 'no-referrer'); assert.deepEqual(seen.headers, { Accept: 'application/x' });
  await assert.rejects(() => getJson(async () => { throw new TypeError('x'); }, 'https://x'), /Could not reach/);
  await assert.rejects(() => getJson(async () => ({ ok: false, status: 503 }), 'https://x'), /\(503\)/);
  await assert.rejects(() => getJson(async () => ({ ok: true, json: async () => { throw new Error('bad'); } }), 'https://x'), /could not read/);
});

test('kit: ratingMapper fails closed for anything unknown', () => {
  const m = ratingMapper({ G: 0 });
  assert.equal(m('G'), 0); for (const x of ['', undefined, 'toString', '__proto__', 'PG']) assert.equal(m(x), 4);
});

test('registry: every channel has the full contract and works with the shared UI', async () => {
  assert.ok(CHANNELS.length >= 2); assert.equal(new Set(CHANNELS.map((c) => c.id)).size, CHANNELS.length);
  for (const c of CHANNELS) {
    assert.match(c.id, /^[a-z0-9-]+$/); assert.ok(c.name && c.blurb);
    assert.ok(['live', 'demo'].includes(c.kind));
    for (const k of ['search', 'show', 'images', 'home', 'guide', 'playback']) assert.equal(typeof c.capabilities[k], 'boolean', `${c.id}.${k}`);
    const cat = c.create();
    assert.equal(typeof cat.search, 'function'); assert.equal(typeof cat.getShow, 'function');
  }
});

test('registry: channel choice, legacy setting migration and fallbacks', () => {
  const s = new MemoryStore();
  assert.equal(pickChannel(s).id, DEFAULT_CHANNEL);
  s.set('source', 'demo'); assert.equal(pickChannel(s).id, 'demo');
  s.set('source', 'live'); assert.equal(pickChannel(s).id, 'channel5');
  s.set('channel', 'demo'); assert.equal(pickChannel(s).id, 'demo');                    // explicit choice beats the legacy setting
  s.set('channel', 'does-not-exist'); assert.equal(pickChannel(s).id, 'channel5');       // unknown id falls back safely
  assert.equal(pickChannel(new MemoryStore(), 'demo').id, 'demo');                       // preset (preview builds)
  assert.equal(findChannel('nope'), null);
});

test('the demo channel still works end to end through the contract', async () => {
  const cat = findChannel('demo').create();
  const hits = await cat.search('bake'); assert.ok(hits.length);
  const show = await cat.getShow(hits[0].id); assert.ok(show.episodes.length);
});

test('kit: a failed request is explained - blocked by the browser (CORS) vs genuinely unreachable', async () => {
  const calls = [];
  // reachable but cross-origin blocked: the normal request throws, the no-cors repeat succeeds
  const corsBlocked = async (u, o) => { calls.push(o); if (o.mode === 'no-cors') return { type: 'opaque' }; throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => getJson(corsBlocked, 'https://x.test/a'), /blocked the reply.*cross-origin/s);
  assert.equal(calls.length, 2); assert.equal(calls[1].mode, 'no-cors'); assert.equal(calls[1].credentials, 'omit');
  // genuinely unreachable: both throw
  await assert.rejects(() => getJson(async () => { throw new TypeError('x'); }, 'https://x.test/a'), /Could not reach the catalogue/);
  // HTTP errors are NOT re-requested
  let n = 0; await assert.rejects(() => getJson(async () => { n++; return { ok: false, status: 403 }; }, 'https://x.test/a'), /\(403\)/); assert.equal(n, 1);
});
