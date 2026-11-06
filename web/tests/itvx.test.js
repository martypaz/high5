import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItvxCatalogue, mapResult, safeImageUrl, parseIsoDuration, ITVX } from '../js/channels/itvx.js';
import { SearchVM, ParentalControl, MemoryStore } from '../js/core.js';
import { findChannel } from '../js/channels/index.js';

// Invented content in the shape the live service really sends (verified): result = { broadcaster, contentType:'vod', data, entityType, id, score, streamingPlatform }.
const IMG = 'https://ovp.itv.com/images/prXXXXXXX/XXXXXXX/itv_hub/rail/16x9?distributionPartner=d&treatment={treatment}&w={width}&h={height}&q={quality}&blur={blur}&bg={bg}&fallback={fallback}';
const prog = (id, title, extra = {}) => ({ broadcaster: 'ITV', contentType: 'vod', entityType: 'programme', id: 'r' + id, score: 1, streamingPlatform: 'itv_hub',
  data: { programmeCCId: id, programmeTitle: title, synopsis: ' A made-up synopsis. ', genre: ['Drama', 'Crime'], totalAvailableEpisodes: 3, tier: 'FREE',
    latestAvailableEpisode: { episodeCCId: 'e1', imageHref: IMG, tileImageHref: IMG }, variant: { featureSet: [] }, topCast: [], timeDependentTags: [], ...extra } });
const RESPONSE = { tookLongest: 1, tookTotal: 2, maxScore: 3.5, results: [
  prog('wk99p9x', 'Harbour Detectives'),
  { broadcaster: 'ITV', contentType: 'vod', entityType: 'film', id: 'f1', data: { filmCCId: 'lysc9m', filmTitle: 'Orbit Kids: The Movie', synopsis: 'A film.', genre: ['Family'], tier: 'PAID', imageHref: IMG, duration: 'PT1H30M' } },
  { broadcaster: 'ITV', contentType: 'vod', entityType: 'special', id: 's1', data: { specialCCId: 'p99b9tx', specialTitle: 'Wild Britain Special', synopsis: 'A special.', genre: ['Documentary'], tileImageHref: IMG } },
  { contentType: 'live', entityType: 'channel', data: { channelId: 'itv1', channelName: 'ITV1' } },
  { contentType: 'pretx', entityType: 'programme', data: { programmeCCId: 'P1', programmeTitle: 'Not yet' } },
  prog('M1', 'Unknown type', {}) && { ...prog('M1', 'Unknown type'), entityType: 'mystery' },
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
  assert.equal(u.searchParams.get('broadcaster'), 'itv'); assert.equal(u.searchParams.get('pretx'), 'true');       // the two values that made the first attempt 404
  assert.equal(u.searchParams.get('channelType'), 'SIMULCAST');
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

test('mapping details: genres, synopsis, tier, episode count, image fallbacks, and hostile or broken items', () => {
  const c = mapResult(prog('1_1', 'Show', { tier: 'PAID', totalAvailableEpisodes: 1 }));
  assert.equal(c.genre, 'Drama'); assert.deepEqual(c.subgenres, ['Crime', '1 episode available', 'ITVX Premium']);
  assert.equal(c.description, 'A made-up synopsis.');                                       // trimmed
  assert.match(c.imageUrl, /^https:\/\/ovp\.itv\.com\/images\/.*[?&]w=640&h=360&q=80/); assert.ok(!c.imageUrl.includes('{'));   // placeholders filled, empty ones dropped
  assert.equal(mapResult({ contentType: 'vod', entityType: 'programme', data: { programmeCCId: '9_9', brandTitle: 'Brand only' } }).title, 'Brand only');
  assert.equal(mapResult({ contentType: 'vod', entityType: 'programme', data: { programmeCcid: '8_8', programmeTitle: 'Old spelling' } }).id, '8_8');   // the app's own spelling still accepted
  assert.equal(mapResult(prog('1_1', 'X', { genre: 'Comedy' })).genre, 'Comedy');          // a plain string genre is tolerated
  assert.equal(mapResult(prog('1_1', 'X', { genre: undefined })).genre, '');
  const le = (u) => ({ latestAvailableEpisode: { imageHref: u }, imageHref: undefined, tileImageHref: undefined });
  assert.equal(mapResult(prog('1_1', 'X', le('https://evil.example.com/x.jpg'))).imageUrl, null);
  assert.equal(mapResult(prog('1_1', 'X', { latestAvailableEpisode: undefined })).imageUrl, null);
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
  assert.equal(await cat.getShow('wk99p9x'), null);            // nothing searched yet
  await cat.search('harbour');
  const s = await cat.getShow('wk99p9x');
  assert.equal(s.title, 'Harbour Detectives'); assert.equal(s.synopsis, 'A made-up synopsis.'); assert.ok(s.bannerUrl);
  assert.equal(await cat.getShow('nope'), null); assert.equal(await cat.getShow(undefined), null);
  assert.ok(!('_latest' in s));                                                  // internal bookkeeping never leaks into the page
});

test('ITVX show page lists the latest episode and says the rest cannot be read; films and specials list themselves', async () => {
  const cat = new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }); await cat.search('harbour');
  const s = await cat.getShow('wk99p9x');
  assert.equal(s.episodes.length, 1); assert.equal(s.episodes[0].id, 'e1'); assert.equal(s.episodes[0].title, 'Latest episode');
  assert.equal(s.episodes[0].showId, 'wk99p9x'); assert.equal(s.episodes[0].available, true); assert.ok(s.episodes[0].imageUrl);
  assert.match(s.episodesNote, /3 available/);
  const film = await cat.getShow('lysc9m');
  assert.equal(film.episodes.length, 1); assert.equal(film.episodes[0].title, 'Orbit Kids: The Movie'); assert.equal(film.episodes[0].durationSeconds, 5400); assert.equal(film.episodesNote, '');
  const special = await cat.getShow('p99b9tx');
  assert.equal(special.episodes.length, 1); assert.equal(special.episodes[0].title, 'Wild Britain Special');
  const one = new ItvxCatalogue({ fetchFn: fakeFetch({ results: [prog('one1', 'Single', { totalAvailableEpisodes: 1 })] }) }); await one.search('si');
  assert.equal((await one.getShow('one1')).episodesNote, '');
  const none = new ItvxCatalogue({ fetchFn: fakeFetch({ results: [prog('x1', 'NoEp', { latestAvailableEpisode: { episodeCCId: '../bad' } })] }) }); await none.search('no');
  assert.deepEqual((await none.getShow('x1')).episodes, []);                    // unsafe episode id is dropped
});

test('ISO durations parse; junk gives 0', () => {
  assert.equal(parseIsoDuration('PT1H30M'), 5400); assert.equal(parseIsoDuration('PT45M'), 2700); assert.equal(parseIsoDuration('PT30S'), 30);
  for (const b of [undefined, '', 'abc', 'P1D', null]) assert.equal(parseIsoDuration(b), 0);
});

test('registered as a beta, search-only channel and works with the shared view-models', async () => {
  const ch = findChannel('itvx');
  assert.ok(ch.experimental); assert.equal(ch.capabilities.playback, false); assert.equal(ch.capabilities.guide, false);
  const parental = new ParentalControl(new MemoryStore());
  const vm = new SearchVM({ catalogue: new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }), parental });
  assert.equal((await vm.search('harbour')).results.length, 3);
  await parental.setMaxRating(1, '');                                           // any limit below 18 hides everything (no known ratings)
  assert.equal((await new SearchVM({ catalogue: new ItvxCatalogue({ fetchFn: fakeFetch(RESPONSE) }), parental }).search('harbour')).results.length, 0);
});
