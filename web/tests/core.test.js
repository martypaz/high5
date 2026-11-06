import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgeRating, MemoryStore, LocalStore, ParentalControl, MockCatalogue, MockLive, MockMyList, MockResume, MockPlayback, MockAuth,
  HomeVM, ShowVM, SearchVM, MyListVM, GuideVM, SignInVM, PlayerVM, isFinished, progressOf } from '../js/core.js';

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
