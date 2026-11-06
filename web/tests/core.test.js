import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgeRating, MemoryStore, LocalStore, ParentalControl, MockCatalogue, MockLive, MockMyList, MockResume, MockPlayback, MockAuth,
  HomeVM, ShowVM, SearchVM, AllSearchVM, MyListVM, GuideVM, SignInVM, PlayerVM, isFinished, progressOf } from '../js/core.js';

const setup = () => {
  const store = new MemoryStore(), catalogue = new MockCatalogue();
  return { store, catalogue, parental: new ParentalControl(store), myList: new MockMyList(catalogue, store), resume: new MockResume(store), live: new MockLive(), playback: new MockPlayback() };
};
const rp = (episodeId, showId, pos, dur, updatedAt = Date.now()) => ({ episodeId, showId, positionSeconds: pos, durationSeconds: dur, updatedAt });

test('PIN is stored hashed and verified', async () => {
  const { store, parental } = setup();
  assert.equal(parental.hasPin, false);
  await parental.setPin('1234');
  assert.equal(parental.hasPin, true);
  assert.equal(await parental.verify('1234'), true);
  assert.equal(await parental.verify('4321'), false);
  assert.ok(!store.get('parental.pinHash').includes('1234'));
});

test('invalid PINs are rejected', async () => {
  const { parental } = setup();
  for (const bad of ['123', '12345', '12a4', '', null]) await assert.rejects(() => parental.setPin(bad));
});

test('changing the rating limit needs the PIN once one is set', async () => {
  const { parental } = setup();
  await parental.setPin('1111');
  assert.equal(await parental.setMaxRating(AgeRating.PG, '0000'), false);
  assert.equal(parental.maxRating, AgeRating.Eighteen);
  assert.equal(await parental.setMaxRating(AgeRating.PG, '1111'), true);
  assert.equal(parental.isAllowed(AgeRating.PG), true);
  assert.equal(parental.isAllowed(AgeRating.Twelve), false);
});

test('default rating limit is 18 (nothing hidden) until one is saved', () => {
  const { parental } = setup();
  assert.equal(parental.maxRating, AgeRating.Eighteen);
  assert.equal(parental.isAllowed(AgeRating.Eighteen), true);
});

test('resume progress and finished threshold', () => {
  assert.equal(isFinished({ positionSeconds: 43 * 60, durationSeconds: 45 * 60 }), true);
  assert.equal(isFinished({ positionSeconds: 600, durationSeconds: 2700 }), false);
  assert.equal(progressOf({ positionSeconds: 5, durationSeconds: 0 }), 0);
});

test('home hides content above the rating limit', async () => {
  const d = setup(); await d.parental.setMaxRating(AgeRating.PG, '');
  const { rails } = await new HomeVM(d).load();
  assert.ok(rails.length > 0);
  for (const r of rails) for (const i of r.items) assert.ok(i.rating <= AgeRating.PG);
});

test('continue watching lists unfinished episodes only', async () => {
  const d = setup();
  await d.resume.save(rp('show-harbour-s1e1', 'show-harbour', 600, 2700));
  await d.resume.save(rp('show-bake-s1e1', 'show-bake', 2640, 2700));
  const { continueWatching } = await new HomeVM(d).load();
  assert.equal(continueWatching.length, 1);
  assert.equal(continueWatching[0].episode.id, 'show-harbour-s1e1');
});

test('show detail resumes the right episode and toggles My List', async () => {
  const d = setup();
  await d.resume.save(rp('show-harbour-s2e3', 'show-harbour', 300, 2700));
  const vm = new ShowVM(d), v = await vm.load('show-harbour');
  assert.equal(v.nextToWatch.id, 'show-harbour-s2e3');
  assert.equal(v.selectedSeason, 2);
  assert.ok(v.episodesFor(2).every((e) => e.season === 2));
  assert.equal(v.inMyList, false);
  assert.equal(await vm.toggleMyList('show-harbour'), true);
  assert.equal((await d.myList.get()).length, 1);
  assert.equal(await vm.toggleMyList('show-harbour'), false);
});

test('unknown show rejects', async () => {
  await assert.rejects(() => new ShowVM(setup()).load('nope'), /not found/i);
});

test('search: latest query wins over a slow earlier one', async () => {
  const d = setup();
  const slow = { search: async (q) => { if (q === 'slow') await new Promise((r) => setTimeout(r, 80)); return [{ id: q, title: q, rating: 0 }]; } };
  const vm = new SearchVM({ catalogue: slow, parental: d.parental });
  const first = vm.search('slow');
  await new Promise((r) => setTimeout(r, 10));
  const second = await vm.search('fast');
  const firstResult = await first;
  assert.equal(firstResult.stale, true);
  assert.deepEqual(second.results.map((x) => x.id), ['fast']);
});

test('search: empty query clears; parental filter applies', async () => {
  const d = setup();
  const vm = new SearchVM(d);
  assert.ok((await vm.search('bake')).results.length > 0);
  assert.deepEqual((await vm.search('  ')).results, []);
  await d.parental.setMaxRating(AgeRating.Universal, '');
  assert.ok((await vm.search('late')).results.every((i) => i.rating === 0));
});

test('my list view filters by rating', async () => {
  const d = setup(); await d.myList.add('show-lates'); await d.myList.add('show-bake');
  await d.parental.setMaxRating(AgeRating.PG, '');
  assert.deepEqual((await new MyListVM(d).load()).map((i) => i.id), ['show-bake']);
});

test('guide finds now and next', async () => {
  const clock = { now: () => new Date('2026-01-01T12:30:00Z').getTime() };
  const rows = await new GuideVM({ live: new MockLive(), clock }).load(4 * 3600_000);
  assert.equal(rows.length, 2);
  for (const r of rows) { assert.ok(r.onNow); assert.equal(r.next.startMs, r.onNow.endMs); }
});

test('sign-in polls until a session is returned', async () => {
  const auth = new MockAuth({ pollsBeforeSuccess: 3 }); let code = '';
  const result = await new SignInVM({ auth, sleep: async () => {} }).run({ onCode: (c) => { code = c; } });
  assert.equal(result, 'signedIn'); assert.equal(code, 'ABCD-1234'); assert.ok(auth.session);
});

test('sign-in expires when the code times out', async () => {
  const auth = new MockAuth({ pollsBeforeSuccess: 1000 });
  let t = Date.now(); const clock = { now: () => (t += 400_000) };   // jumps past the 10-minute expiry
  assert.equal(await new SignInVM({ auth, clock, sleep: async () => {} }).run(), 'expired');
});

test('sign-in cancels cleanly', async () => {
  const auth = new MockAuth({ pollsBeforeSuccess: 1000 }), ac = new AbortController();
  const p = new SignInVM({ auth }).run({ signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  assert.equal(await p, 'cancelled');
});

test('player resumes and throttles saves; live never saves', async () => {
  const d = setup(); let now = 1_000_000; const clock = { now: () => now };
  const ep = await d.catalogue.getEpisode('show-harbour-s1e1');
  await d.resume.save(rp(ep.id, ep.showId, 720, ep.durationSeconds));
  const vm = await new PlayerVM({ ...d, clock, saveEveryMs: 15_000 }).loadEpisode(ep);
  assert.equal(vm.startAt, 720);
  assert.equal(await vm.report(780, ep.durationSeconds), true);       // saved
  now += 5_000;
  assert.equal(await vm.report(840, ep.durationSeconds), false);     // throttled
  assert.equal((await d.resume.get(ep.id)).positionSeconds, 780);
  assert.equal(await vm.report(840, ep.durationSeconds, true), true); // forced
  assert.equal((await d.resume.get(ep.id)).positionSeconds, 840);

  const d2 = setup(); const live = await new PlayerVM({ ...d2, clock }).loadLive('ch-a');
  assert.equal(await live.report(60, 0, true), false);
  assert.deepEqual(await d2.resume.getAll(), []);
});

test('LocalStore still works when browser storage is unavailable', () => {
  const st = new LocalStore();               // in Node there is no localStorage, like a blocked browser
  assert.equal(st.get('a'), null);
  st.set('a', 1); assert.equal(st.get('a'), '1');
  st.set('a', null); assert.equal(st.get('a'), null);
});

test('my list keeps snapshots across channels and ignores damaged storage', async () => {
  const store = new MemoryStore(), cat = new MockCatalogue();
  const a = new MockMyList(cat, store, 'demo'), b = new MockMyList(cat, store, 'itvx');
  await a.add('show-bake');
  await b.add({ id: 'wk99p9x', title: 'Harbour Detectives', genre: 'Drama', kind: 'show', rating: 4, ratingKnown: false, imageUrl: 'https://ovp.itv.com/x.jpg', junk: 'dropped' });
  const all = await a.get();
  assert.deepEqual(all.map((i) => [i.channelId, i.id]), [['demo', 'show-bake'], ['itvx', 'wk99p9x']]);
  assert.equal(all[1].ratingKnown, false); assert.equal(all[1].junk, undefined); assert.equal(all[1].imageUrl, 'https://ovp.itv.com/x.jpg');
  assert.equal(await a.contains('wk99p9x'), false);               // the same id on another channel is a different item
  assert.equal(await b.contains('wk99p9x'), true);
  await b.add({ id: 'wk99p9x', title: 'again' });                  // no duplicates
  assert.equal((await a.get()).length, 2);
  await b.remove('wk99p9x'); assert.deepEqual((await a.get()).map((i) => i.id), ['show-bake']);
  assert.equal(await a.add('no-such-show'), false); assert.equal(await a.add(null), false);
  store.set('mylist2', '{not json'); assert.deepEqual(await a.get(), []);
  store.set('mylist2', JSON.stringify([{ id: 5 }, null, 'x', { id: 'ok', channelId: 'demo', title: 't' }])); assert.deepEqual((await a.get()).map((i) => i.id), ['ok']);
});

test('my list upgrades the old id-only format once, and keeps at most 200 items', async () => {
  const store = new MemoryStore(), cat = new MockCatalogue(), l = new MockMyList(cat, store, 'demo');
  store.set('mylist', JSON.stringify(['show-bake', 'show-gone', 'show-wild']));
  assert.deepEqual((await l.get()).map((i) => i.id), ['show-bake', 'show-wild']);
  assert.equal(store.get('mylist'), null);
  const big = new MockMyList(cat, new MemoryStore(), 'demo');
  for (let i = 0; i < 205; i++) await big.add({ id: 'id' + i, title: 't' + i });
  const items = await big.get(); assert.equal(items.length, 200); assert.equal(items[199].id, 'id204');
});

test('show view-model adds a snapshot including the picture', async () => {
  const d = setup(), vm = new ShowVM(d);
  assert.equal(await vm.toggleMyList('show-harbour'), true);
  const [item] = await d.myList.get(); assert.equal(item.title, 'Harbour Detectives'); assert.equal(item.channelId, 'demo');
  assert.equal(await vm.toggleMyList('nope-nothing'), false);
});

test('search across channels: grouped, tagged, parental-filtered, one failure does not hide the rest, last request wins', async () => {
  const mk = (id, items, fail) => ({ id, name: id.toUpperCase(), catalogue: { search: async (q) => { if (fail) throw new Error('down'); return items.map((t) => ({ id: t, title: t, rating: t.startsWith('x') ? 4 : 0, kind: 'show' })); } } });
  const parental = new ParentalControl(new MemoryStore());
  const vm = new AllSearchVM({ parental, sources: [mk('a', ['one', 'xtwo']), mk('b', [], true), mk('c', ['three'])] });
  const r = await vm.search('  ab ');
  assert.equal(r.query, 'ab');
  assert.deepEqual(r.groups.map((g) => [g.channelId, g.results.map((i) => i.id)]), [['a', ['one', 'xtwo']], ['c', ['three']]]);
  assert.ok(r.groups.every((g) => g.results.every((i) => i.channelId === g.channelId)));
  assert.deepEqual(r.failures, [{ channelId: 'b', name: 'B', message: 'down' }]);
  await parental.setMaxRating(AgeRating.PG, '');
  assert.deepEqual((await vm.search('ab')).groups[0].results.map((i) => i.id), ['one']);
  assert.deepEqual(await vm.search('   '), { query: '', groups: [], failures: [], stale: false });
  let release; const slow = { id: 's', name: 'S', catalogue: { search: (q) => new Promise((res) => { if (q === 'old') release = () => res([{ id: 'o', title: 'o', rating: 0 }]); else res([]); }) } };
  const vm2 = new AllSearchVM({ parental, sources: [slow] });
  const first = vm2.search('old'); const second = await vm2.search('new'); release();
  assert.equal(second.stale, false); assert.equal((await first).stale, true);
});
