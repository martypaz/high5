import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItvxCatalogue, mapResult, safeImageUrl, ITVX } from '../js/channels/itvx.js';
import { SearchVM, ParentalControl, MemoryStore } from '../js/core.js';
import { findChannel } from '../js/channels/index.js';

// Invented content. Field names are the ones in the app's search models (SearchResponse / ResultsItem / SearchResultItemData).
const prog = (id, title, extra = {}) => ({ contentType: 'programme', entityType: 'programme', data: { programmeCcid: id, programmeTitle: title, brandTitle: title + ' (brand)', totalAvailableEpisodes: 3, tier: 'FREE', channelName: 'Channel X', imageHref: 'https://ovp.itv.com/v2/images/programme/abc/itv_hub/c/16x9?w={width}&h={height}&q={quality}&blur={blur}', ...extra } });
const RESPONSE = { results: [
  prog('10_0001', 'Harbour Detectives'),
  { contentType: 'film', entityType: 'film', data: { filmCCId: 'F100', filmTitle: 'Orbit Kids: The Movie', tier: 'PAID', image: 'https://itvstatic.com/img/x.jpg' } },
  { contentType: 'special', entityType: 'special', data: { specialCcid: 'S100', specialTitle: 'Wild Britain Special', totalAvailableEpisodes: 1 } },
  { contentType: 'live', entityType: 'channel', data: { channelId: 'itv1', channelName: 'ITV1' } },
  { contentType: 'pretx', entityType: 'programme', data: { programmeCcid: 'P1', programmeTitle: 'Not yet' } },
  { contentType: 'programme', entityType: 'mystery', data: { programmeCcid: 'M1', programmeTitle: 'Unknown type' } },
  prog('../evil', 'Bad id'), prog('10_0002', '', { brandTitle: '' }), null, { data: null },
] };
const fakeFetch = (body, log = [], status = 200) => async (url, opts) => { log.push({ url, opts }); return { ok: status < 400, status, json: async () => body }; };

test('search builds the request the app uses and returns only displayable results', async () => {
  const log = []; const cat = new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE, log) });
  const r = await cat.search('harbour & co');
  const u = new URL(log[0].url);
  assert.equal(u.origin, 'https://textsearch.prd.oasvc.itv.com'); assert.equal(u.pathname, '/search');
  assert.equal(u.searchParams.get('query'), 'harbour & co'); assert.equal(u.searchParams.get('platform'), 'mobile');
  assert.equal(u.searchParams.get('size'), '21'); assert.equal(u.searchParams.get('onlyFree'), 'false');
  assert.equal(u.searchParams.get('featureSet'), ITVX.featureSet.join(','));
  assert.ok(!u.searchParams.get('featureSet').includes('hd'));
  assert.deepEqual(r.map((x) => x.title), ['Harbour Detectives', 'Orbit Kids: The Movie', 'Wild Britain Special']);
  assert.deepEqual(r.map((x) => x.kind), ['show', 'film', 'show']);
});

test('requests are anonymous GETs with no credentials, cookies or custom headers', async () => {
  const log = []; await new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE, log) }).search('ab');
  assert.equal(log.length, 1); assert.equal(log[0].opts.credentials, 'omit'); assert.equal(log[0].opts.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(log[0].opts.headers), ['Accept']);
});

test('short queries make no request', async () => {
  const log = []; const cat = new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE, log) });
  assert.deepEqual(await cat.search(' a '), []); assert.deepEqual(await cat.search(''), []); assert.equal(log.length, 0);
});

test('ratings are never displayed and always fail closed', async () => {
  const r = await new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }).search('ab');
  for (const c of r) { assert.equal(c.rating, 4); assert.equal(c.ratingKnown, false); }
});

test('images: only https on ITV domains, size placeholders filled, empty params dropped', () => {
  assert.equal(safeImageUrl('https://ovp.itv.com/v2/images/p/x/16x9?w={width}&h={height}&q={quality}&blur={blur}', 320, 180),
    'https://ovp.itv.com/v2/images/p/x/16x9?w=320&h=180&q=80');
  for (const bad of ['http://ovp.itv.com/a.jpg', 'https://evil.example.com/a.jpg', 'https://itv.com.evil.net/a.jpg', 'javascript:alert(1)', '', null, undefined, 42]) assert.equal(safeImageUrl(bad), null);
});

test('mapping details: tier, episode count, fallbacks, and hostile or broken items', () => {
  const c = mapResult(prog('1_1', 'Show', { tier: 'PAID', totalAvailableEpisodes: 1 }));
  assert.match(c.description, /1 episode available/); assert.match(c.description, /ITVX Premium/); assert.equal(c.genre, 'Channel X');
  assert.equal(mapResult({ contentType: 'programme', entityType: 'programme', data: { programmeCcid: '9_9', brandTitle: 'Brand only' } }).title, 'Brand only');
  assert.equal(mapResult(prog('1_1', 'X', { imageHref: 'https://evil.example.com/x.jpg', image: 'https://itvstatic.com/ok.jpg' })).imageUrl, 'https://itvstatic.com/ok.jpg');
  assert.equal(mapResult(prog('1_1', 'X', { imageHref: undefined, image: undefined })).imageUrl, null);
  for (const bad of [null, undefined, {}, { data: 5 }, { entityType: 'programme', data: {} }]) assert.equal(mapResult(bad), null);
});

test('malformed bodies and failures give friendly errors or empty results', async () => {
  assert.deepEqual(await new ItvxCatalogue({ fetchFn: fakeFetch({ results: 'nope' }) }).search('ab'), []);
  assert.deepEqual(await new ItvxCatalogue({ fetchFn: fakeFetch({}) }).search('ab'), []);
  await assert.rejects(() => new ItvxCatalogue({ fetchFn: fakeFetch({}, [], 401) }).search('ab'), /error \(401\)/);
  await assert.rejects(() => new ItvxCatalogue({ fetchFn: async () => { throw new TypeError('x'); } }).search('ab'), /Could not reach/);
});

test('a source pointing at a non-ITV host is refused before any request is made', async () => {
  const log = [];
  await assert.rejects(() => new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE, log), source: { ...ITVX, searchBase: 'https://evil.example.com' } }).search('ab'), /Unexpected address/);
  assert.equal(log.length, 0);
});

test('show page is built from the search result; unknown ids give null', async () => {
  const cat = new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) });
  assert.equal(await cat.getShow('10_0001'), null);            // nothing searched yet
  await cat.search('harbour');
  const s = await cat.getShow('10_0001');
  assert.equal(s.title, 'Harbour Detectives'); assert.deepEqual(s.episodes, []); assert.match(s.synopsis, /3 episodes available/);
  assert.equal(await cat.getShow('nope'), null); assert.equal(await cat.getShow(undefined), null);
});

test('registered as an experimental, search-only channel and works with the shared view-models', async () => {
  const ch = findChannel('itvx');
  assert.ok(ch.experimental); assert.equal(ch.capabilities.playback, false); assert.equal(ch.capabilities.guide, false);
  const parental = new ParentalControl(new MemoryStore());
  const vm = new SearchVM({ catalogue: new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }), parental });
  assert.equal((await vm.search('harbour')).results.length, 3);
  await parental.setMaxRating(1, '');                                           // any limit below 18 hides everything (no known ratings)
  assert.equal((await new SearchVM({ catalogue: new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }), parental }).search('harbour')).results.length, 0);
});
