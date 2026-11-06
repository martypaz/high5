import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveCatalogue, fillTemplate, ratingFromCode, mapEpisode, mapShowCard, buildImageUrl, SOURCE } from '../js/live.js';
import { SearchVM, ShowVM, ParentalControl, MemoryStore, MockMyList, MockResume } from '../js/core.js';

// Invented content, shaped like the real responses (field names from the official app's data).
const CONFIG = { dataServiceSettings: {
  platformId: 'plat-x', coronaBaseUri: 'https://corona.channel5.com',
  coronaShowQueryTemplateUri: '/shows/search.json?platform={platformId}&genre={genre}&query={query}',
  coronaShowTemplateUri: '/shows/{showId}.json?platform={platformId}',
  coronaAllEpisodesByShowTemplateUri: '/shows/{showId}/episodes.json?platform={platformId}',
  ednaImagesTemplateUri: 'https://api-images.channel5.com/otis/images/{type}/{id}/{resolution}.{fmt}?overlay={overlayType}&updated_at={time}&master={master}' } };
const SEARCH = { size: 2, shows: [
  { id: '111', title: 'Harbour Detectives', genre: 'Crime', child_directed: false, vod_subgenres: ['Drama'], chan: 'C5', s_desc: 'Two officers police a seaside town.', img_upd: 1, use_title_img: true },
  { id: '222', title: 'Orbit Kids', genre: 'Kids', child_directed: true, vod_subgenres: [], chan: 'C5', s_desc: 'Tiny astronauts.', img_upd: 1, use_title_img: true } ] };
const SHOW = { id: '111', title: 'Harbour Detectives', genre: 'Crime', child_directed: false, vod_subgenres: ['Drama'], chan: 'C5', chan_name: '5', m_desc: 'Long description.', s_desc: 'Short.' };
const NOW = 1_800_000_000_000;
const ep = (id, sea, n, extra = {}) => ({ id, title: `Episode ${n}`, sh_id: '111', sh_title: 'Harbour Detectives', sea_num: String(sea), ep_num: n, s_desc: `s${sea}e${n}`, adv: '', len: 2_700_000, vod_s: NOW / 1000 - 1000, vod_e: NOW / 1000 + 1000, vod_ad: false, vod_sub: true, rat: 'G', ...extra });
const EPISODES = { size: 3, episodes: [ep('e3', 2, 1), ep('e1', 1, 2), ep('e2', 1, 1, { rat: 'G+' })] };

function fakeFetch(routes, log = []) {
  return async (url, opts) => {
    log.push({ url, opts });
    for (const [needle, body, status = 200] of routes) if (url.includes(needle)) return { ok: status < 400, status, json: async () => body };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}
const routes = [['config.json', CONFIG], ['/shows/search.json', SEARCH], ['/shows/111/episodes.json', EPISODES], ['/shows/111.json', SHOW]];
const make = (r = routes, log = []) => new LiveCatalogue({ fetchFn: fakeFetch(r, log), now: () => NOW });

test('fillTemplate encodes values and blanks unused placeholders', () => {
  assert.equal(fillTemplate('/s?q={query}&g={genre}', { query: 'a b&c' }), '/s?q=a%20b%26c&g=');
});

test('ratings: G -> Universal, G+ -> PG, anything unknown fails closed at 18', () => {
  assert.equal(ratingFromCode('G'), 0); assert.equal(ratingFromCode('G+'), 1);
  for (const x of ['PG', '18', '', undefined, 'constructor', '__proto__']) assert.equal(ratingFromCode(x), 4);
});

test('search reads the config first, builds the URL from its template, and maps results', async () => {
  const log = []; const cat = make(routes, log);
  const r = await cat.search('harbour & co');
  assert.equal(log[0].url, `${SOURCE.configUrl}?label=${SOURCE.configLabel}`);
  assert.equal(log[1].url, 'https://corona.channel5.com/shows/search.json?platform=plat-x&genre=&query=harbour%20%26%20co');
  assert.deepEqual(r.map((x) => x.title), ['Harbour Detectives', 'Orbit Kids']);
  assert.equal(r[0].rating, 4); assert.equal(r[1].rating, 1);              // kids' content PG at most, else fail closed
  assert.equal(r[0].kind, 'show');
});

test('requests are anonymous, header-light and never send cookies or referrers', async () => {
  const log = []; await make(routes, log).search('ab');
  for (const { opts } of log) { assert.equal(opts.credentials, 'omit'); assert.equal(opts.referrerPolicy, 'no-referrer'); assert.deepEqual(Object.keys(opts.headers), ['Accept']); }
});

test('settings are fetched once and cached; a failed fetch is retried next time', async () => {
  const log = []; const cat = make(routes, log);
  await cat.search('ab'); await cat.search('cd');
  assert.equal(log.filter((l) => l.url.includes('config.json')).length, 1);
  let calls = 0; const flaky = new LiveCatalogue({ fetchFn: async (u) => { calls++; if (calls === 1) throw new Error('net'); return { ok: true, status: 200, json: async () => (u.includes('config.json') ? CONFIG : SEARCH) }; } });
  await assert.rejects(() => flaky.search('ab'), /Could not reach/);
  assert.equal((await flaky.search('ab')).length, 2);
});

test('very short queries do not hit the network', async () => {
  const log = []; const cat = make(routes, log);
  assert.deepEqual(await cat.search(' a '), []); assert.deepEqual(await cat.search(''), []); assert.equal(log.length, 0);
});

test('show page combines show + episodes, sorted, with availability and the strictest rating', async () => {
  const s = await make().getShow('111');
  assert.equal(s.title, 'Harbour Detectives'); assert.equal(s.synopsis, 'Long description.'); assert.equal(s.channel, '5');
  assert.deepEqual(s.episodes.map((e) => e.id), ['e2', 'e1', 'e3']);          // s1e1, s1e2, s2e1
  assert.equal(s.episodes[0].durationSeconds, 2700); assert.equal(s.episodes[0].available, true);
  assert.equal(s.rating, 1);                                                  // max(G+ = PG, G) = PG
});

test('availability window is respected', () => {
  const past = mapEpisode(ep('x', 1, 1, { vod_s: 1, vod_e: 2 }), NOW), future = mapEpisode(ep('y', 1, 1, { vod_s: NOW / 1000 + 10, vod_e: NOW / 1000 + 20 }), NOW);
  assert.equal(past.available, false); assert.equal(future.available, false);
});

test('a show with an unrecognised episode rating is treated as 18', async () => {
  const r = [['config.json', CONFIG], ['/shows/111/episodes.json', { episodes: [ep('a', 1, 1, { rat: 'PG' }), ep('b', 1, 2)] }], ['/shows/111.json', SHOW]];
  assert.equal((await make(r).getShow('111')).rating, 4);
});

test('bad ids, 404s and missing shows return null/throw cleanly', async () => {
  const cat = make();
  assert.equal(await cat.getShow('../etc'), null); assert.equal(await cat.getShow(''), null);
  assert.equal(await make([['config.json', CONFIG], ['/shows/999', {}, 200], ['/shows/999/episodes.json', { episodes: [] }]]).getShow('999'), null);
  await assert.rejects(() => make([['config.json', CONFIG], ['/shows/search.json', {}, 503]]).search('ab'), /error \(503\)/);
});

test('rejects a config that points somewhere other than channel5.com, or is malformed', async () => {
  const evil = { dataServiceSettings: { ...CONFIG.dataServiceSettings, coronaBaseUri: 'https://evil.example.com' } };
  await assert.rejects(() => make([['config.json', evil]]).search('ab'), /Unexpected catalogue address/);
  await assert.rejects(() => make([['config.json', { dataServiceSettings: {} }]]).search('ab'), /expected format/);
  const http = { dataServiceSettings: { ...CONFIG.dataServiceSettings, coronaBaseUri: 'http://corona.channel5.com' } };
  await assert.rejects(() => make([['config.json', http]]).search('ab'), /Unexpected catalogue address/);
});

test('unreadable or failing responses give friendly errors', async () => {
  const bad = new LiveCatalogue({ fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
  await assert.rejects(() => bad.search('ab'), /could not read/);
  const down = new LiveCatalogue({ fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => down.search('ab'), /Could not reach the catalogue/);
});

test('works with the existing view-models: search with parental filter, show page, My List', async () => {
  const cat = make(), store = new MemoryStore(), parental = new ParentalControl(store);
  const res = await new SearchVM({ catalogue: cat, parental }).search('harbour');
  assert.equal(res.results.length, 2);
  await parental.setMaxRating(1, '');                                          // PG: only the kids' show survives
  assert.deepEqual((await new SearchVM({ catalogue: cat, parental }).search('harbour')).results.map((r) => r.id), ['222']);
  const v = await new ShowVM({ catalogue: cat, myList: new MockMyList(cat, store), resume: new MockResume(store) }).load('111');
  assert.equal(v.show.title, 'Harbour Detectives'); assert.equal(v.nextToWatch.id, 'e2');
  assert.ok(v.episodesFor(1).length === 2);
});

test('card mapping tolerates missing fields', () => {
  const c = mapShowCard({ id: 5 }); assert.equal(c.title, ''); assert.deepEqual(c.subgenres, []); assert.equal(c.rating, 4);
});

const IMG_T = CONFIG.dataServiceSettings.ednaImagesTemplateUri;

test('image URLs come from the config template, drop empty parameters and keep the cache-buster', () => {
  assert.equal(buildImageUrl(IMG_T, { type: 'show', id: '111', resolution: '423x238', updated: 1700 }),
    'https://api-images.channel5.com/otis/images/show/111/423x238.jpg?updated_at=1700');
  assert.equal(buildImageUrl(IMG_T, { type: 'episode', id: 'C5254060002', resolution: '1024x576' }),
    'https://api-images.channel5.com/otis/images/episode/C5254060002/1024x576.jpg');
});

test('image URLs are refused (null) for unexpected types, ids, sizes, templates and hosts', () => {
  const ok = { type: 'show', id: '111', resolution: '423x238' };
  assert.equal(buildImageUrl(IMG_T, { ...ok, type: 'channel' }), null);
  assert.equal(buildImageUrl(IMG_T, { ...ok, id: '../x' }), null);
  assert.equal(buildImageUrl(IMG_T, { ...ok, id: '1?x=2' }), null);
  assert.equal(buildImageUrl(IMG_T, { ...ok, resolution: 'big' }), null);
  assert.equal(buildImageUrl('', ok), null); assert.equal(buildImageUrl(undefined, ok), null);
  assert.equal(buildImageUrl('https://evil.example.com/{type}/{id}/{resolution}.{fmt}', ok), null);
  assert.equal(buildImageUrl('http://api-images.channel5.com/{type}/{id}/{resolution}.{fmt}', ok), null);
  assert.equal(buildImageUrl('javascript:alert(1)//{id}', ok), null);
});

test('search results and show pages carry image URLs', async () => {
  const cat = make();
  const r = await cat.search('harbour');
  assert.match(r[0].imageUrl, /\/show\/111\/423x238\.jpg/);
  const s = await cat.getShow('111');
  assert.match(s.bannerUrl, /\/show\/111\/1024x576\.jpg/);
  assert.match(s.episodes[0].imageUrl, /\/episode\/e2\/423x238\.jpg/);
});

test('no image template in the config means no images, not an error', async () => {
  const noImg = { dataServiceSettings: { ...CONFIG.dataServiceSettings, ednaImagesTemplateUri: undefined } };
  const cat = make([['config.json', noImg], ['/shows/search.json', SEARCH]]);
  const r = await cat.search('harbour');
  assert.equal(r[0].imageUrl, null);
});

test('an image template on a foreign host is ignored without breaking search', async () => {
  const bad = { dataServiceSettings: { ...CONFIG.dataServiceSettings, ednaImagesTemplateUri: 'https://evil.example.com/{type}/{id}/{resolution}.{fmt}' } };
  const r = await make([['config.json', bad], ['/shows/search.json', SEARCH]]).search('harbour');
  assert.equal(r.length, 2); assert.equal(r[0].imageUrl, null);
});

test('ratings that are only a safety default are flagged as unknown so the UI does not display them', async () => {
  const cat = make(); const r = await cat.search('harbour');
  assert.equal(r[0].ratingKnown, false); assert.equal(r[0].rating, 4);          // still fails closed for the parental lock
  assert.equal((await cat.getShow('111')).ratingKnown, true);                    // known once every episode has a recognised rating
  const unknown = [['config.json', CONFIG], ['/shows/111/episodes.json', { episodes: [ep('a', 1, 1, { rat: 'PG' })] }], ['/shows/111.json', SHOW]];
  assert.equal((await make(unknown).getShow('111')).ratingKnown, false);
});
