// High5 web - logic layer (no DOM). Mirrors the behaviour of the tested C# core in src/High5.Core.
// Everything here runs in the browser and in Node (for the unit tests).

export const AgeRating = Object.freeze({ Universal: 0, PG: 1, Twelve: 2, Fifteen: 3, Eighteen: 4 });
export const RATING_LABELS = ['U', 'PG', '12', '15', '18'];

// ---------- storage ----------
export class MemoryStore {
  constructor() { this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  set(k, v) { if (v == null) this.m.delete(k); else this.m.set(k, String(v)); }
}
/** localStorage with an in-memory fallback, so the app still works (for the session) when storage is blocked
 *  (private windows, sandboxed previews, cleared site data). */
export class LocalStore {
  constructor() { this.mem = new Map(); }
  get(k) {
    try { const v = localStorage.getItem('high5.' + k); if (v !== null) return v; } catch { /* blocked */ }
    return this.mem.has(k) ? this.mem.get(k) : null;
  }
  set(k, v) {
    if (v == null) this.mem.delete(k); else this.mem.set(k, String(v));
    try { if (v == null) localStorage.removeItem('high5.' + k); else localStorage.setItem('high5.' + k, String(v)); } catch { /* blocked */ }
  }
}

export const systemClock = { now: () => Date.now() };

// ---------- parental control ----------
async function sha256Base64(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  // Fallback for insecure (http) contexts without SubtleCrypto. A 4-digit PIN is weak either way; this is a
  // family-friendly lock, not a security boundary.
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'x' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

export class ParentalControl {
  constructor(store) { this.store = store; }
  get hasPin() { return !!this.store.get('parental.pinHash'); }
  get maxRating() {
    const raw = this.store.get('parental.maxRating');
    if (raw == null || raw === '') return AgeRating.Eighteen;          // no limit saved yet (Number(null) would be 0!)
    const v = Number(raw);
    return Number.isInteger(v) && v >= 0 && v <= 4 ? v : AgeRating.Eighteen;
  }
  async setPin(pin) {
    if (!/^\d{4}$/.test(pin ?? '')) throw new Error('PIN must be exactly 4 digits.');
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.store.set('parental.pinSalt', salt);
    this.store.set('parental.pinHash', await sha256Base64(salt + ':' + pin));
  }
  async verify(pin) {
    const salt = this.store.get('parental.pinSalt'), hash = this.store.get('parental.pinHash');
    if (!salt || !hash || typeof pin !== 'string') return false;
    return (await sha256Base64(salt + ':' + pin)) === hash;
  }
  clearPin() { this.store.set('parental.pinHash', null); this.store.set('parental.pinSalt', null); }
  async setMaxRating(rating, pin) {
    if (this.hasPin && !(await this.verify(pin))) return false;
    this.store.set('parental.maxRating', rating);
    return true;
  }
  isAllowed(rating) { return rating <= this.maxRating; }
}

// ---------- resume points ----------
export function progressOf(rp) { return rp.durationSeconds <= 0 ? 0 : Math.min(1, rp.positionSeconds / rp.durationSeconds); }
export function isFinished(rp) { return progressOf(rp) >= 0.95; }

// ---------- mock services (invented demo content; no real Channel 5 titles or artwork) ----------
function makeShow(id, title, genre, rating, seasons, perSeason, synopsis) {
  const episodes = [];
  for (let s = 1; s <= seasons; s++) for (let e = 1; e <= perSeason; e++)
    episodes.push({ id: `${id}-s${s}e${e}`, showId: id, showTitle: title, title: `Episode ${e}`, season: s, episode: e,
      synopsis: `${title} - series ${s}, episode ${e}.`, durationSeconds: 45 * 60, rating });
  return { id, title, genre, rating, synopsis, episodes };
}
const card = (s) => ({ id: s.id, title: s.title, genre: s.genre, rating: s.rating, kind: 'show' });

export class MockCatalogue {
  constructor() {
    this.shows = [
      makeShow('show-harbour', 'Harbour Detectives', 'Crime', AgeRating.Twelve, 2, 4, 'Two officers police a seaside town.'),
      makeShow('show-bake', 'The Great Village Bake', 'Food', AgeRating.Universal, 1, 5, 'Amateur bakers compete for the golden whisk.'),
      makeShow('show-space', 'Orbit Kids', 'Kids', AgeRating.Universal, 3, 3, 'Pocket-sized astronauts explore the solar system.'),
      makeShow('show-night', 'Night Shift ER', 'Drama', AgeRating.Fifteen, 2, 4, "A hospital's busiest hours."),
      makeShow('show-wild', 'Wild Britain', 'Documentary', AgeRating.PG, 1, 6, 'Seasons across the British Isles.'),
      makeShow('show-lates', 'Late Night Laughs', 'Comedy', AgeRating.Eighteen, 1, 4, "Stand-up from the capital's best clubs."),
    ];
  }
  async getHomeRails() {
    return [
      { id: 'popular', title: 'Popular now', items: this.shows.map(card) },
      { id: 'new', title: 'New this week', items: this.shows.slice(0, 3).map(card) },
      { id: 'family', title: 'For the family', items: this.shows.filter((s) => s.rating <= AgeRating.PG).map(card) },
    ];
  }
  async getGenres() { return [...new Set(this.shows.map((s) => s.genre))].sort(); }
  async getByGenre(g) { return this.shows.filter((s) => s.genre.toLowerCase() === String(g).toLowerCase()).map(card); }
  async getShow(id) { return this.shows.find((s) => s.id === id) ?? null; }
  async getEpisode(id) { for (const s of this.shows) { const e = s.episodes.find((x) => x.id === id); if (e) return e; } return null; }
  async search(q) {
    q = String(q ?? '').trim().toLowerCase();
    if (!q) return [];
    return this.shows.filter((s) => s.title.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q)).map(card);
  }
}

export class MockLive {
  async getChannels() { return [{ id: 'ch-a', name: 'Channel A' }, { id: 'ch-b', name: 'Channel B' }]; }
  async getGuide(channelId, fromMs, toMs) {
    const titles = ['Morning Magazine', 'Daytime Docs', 'Harbour Detectives', 'Wild Britain', 'Evening Bulletin'];
    const hour = 3600_000, out = [];
    const start = Math.floor(fromMs / hour) * hour;
    for (let i = 0; start + i * hour < toMs; i++)
      out.push({ channelId, title: titles[(i + channelId.length) % titles.length], description: 'Demo schedule entry.', startMs: start + i * hour, endMs: start + (i + 1) * hour });
    return out;
  }
}

export class MockMyList {
  constructor(catalogue, store) { this.cat = catalogue; this.store = store; }
  _ids() { try { return JSON.parse(this.store.get('mylist') ?? '[]'); } catch { return []; } }
  async get() { const out = []; for (const id of this._ids()) { const s = await this.cat.getShow(id); if (s) out.push(card(s)); } return out; }
  async contains(id) { return this._ids().includes(id); }
  async add(id) { const ids = this._ids(); if (!ids.includes(id)) { ids.push(id); this.store.set('mylist', JSON.stringify(ids)); } }
  async remove(id) { this.store.set('mylist', JSON.stringify(this._ids().filter((x) => x !== id))); }
}

export class MockResume {
  constructor(store) { this.store = store; }
  _all() { try { return JSON.parse(this.store.get('resume') ?? '{}'); } catch { return {}; } }
  async getAll() { return Object.values(this._all()).sort((a, b) => b.updatedAt - a.updatedAt); }
  async get(episodeId) { return this._all()[episodeId] ?? null; }
  async getForShow(showId) { return (await this.getAll()).filter((r) => r.showId === showId); }
  async save(rp) { const all = this._all(); all[rp.episodeId] = rp; this.store.set('resume', JSON.stringify(all)); }
}

// Public Big Buck Bunny test stream, so the player can be exercised without Channel 5's servers.
const DEMO_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
export class MockPlayback {
  async getEpisode() { return { manifestUrl: DEMO_STREAM, drm: 'none', licenceUrl: null, title: 'Demo stream', isLive: false }; }
  async getLive() { return { manifestUrl: DEMO_STREAM, drm: 'none', licenceUrl: null, title: 'Demo live', isLive: true }; }
}

export class MockAuth {
  constructor({ pollsBeforeSuccess = 2, pollMs = 3000 } = {}) { this.pollsBeforeSuccess = pollsBeforeSuccess; this.pollMs = pollMs; this.session = null; this._polls = 0; }
  async startActivation() { this._polls = 0; return { code: 'ABCD-1234', expiresAtMs: Date.now() + 10 * 60_000, pollMs: this.pollMs }; }
  async pollActivation() {
    if (++this._polls < this.pollsBeforeSuccess) return null;
    this.session = { userId: 'demo', displayName: 'Demo viewer', accessToken: 'demo-token' };
    return this.session;
  }
  async signOut() { this.session = null; }
}

// ---------- view-models ----------
export class HomeVM {
  constructor({ catalogue, resume, parental }) { Object.assign(this, { catalogue, resume, parental }); }
  async load() {
    const rails = [];
    for (const r of await this.catalogue.getHomeRails()) {
      const items = r.items.filter((i) => this.parental.isAllowed(i.rating));
      if (items.length) rails.push({ ...r, items });
    }
    const continueWatching = [];
    for (const rp of (await this.resume.getAll()).filter((r) => !isFinished(r))) {
      const ep = await this.catalogue.getEpisode(rp.episodeId);
      if (ep && this.parental.isAllowed(ep.rating)) continueWatching.push({ episode: ep, point: rp, caption: `${ep.showTitle} - S${ep.season}:E${ep.episode}` });
    }
    return { rails, continueWatching };
  }
}

export class ShowVM {
  constructor({ catalogue, myList, resume }) { Object.assign(this, { catalogue, myList, resume }); }
  async load(showId) {
    const show = await this.catalogue.getShow(showId);
    if (!show) throw new Error('Show not found.');
    const inMyList = await this.myList.contains(showId);
    const points = (await this.resume.getForShow(showId)).filter((r) => !isFinished(r)).sort((a, b) => b.updatedAt - a.updatedAt);
    const resumeEp = points.length ? show.episodes.find((e) => e.id === points[0].episodeId) : null;
    const sorted = [...show.episodes].sort((a, b) => a.season - b.season || a.episode - b.episode);
    const nextToWatch = resumeEp ?? sorted[0] ?? null;
    const seasons = [...new Set(show.episodes.map((e) => e.season))].sort((a, b) => a - b);
    return { show, inMyList, seasons, nextToWatch, selectedSeason: nextToWatch?.season ?? seasons[0] ?? 1,
      episodesFor: (s) => sorted.filter((e) => e.season === s) };
  }
  async toggleMyList(showId) {
    if (await this.myList.contains(showId)) { await this.myList.remove(showId); return false; }
    await this.myList.add(showId); return true;
  }
}

/** Last request wins: a slow earlier response can never overwrite a newer one. */
export class SearchVM {
  constructor({ catalogue, parental }) { Object.assign(this, { catalogue, parental }); this._seq = 0; }
  async search(query) {
    const seq = ++this._seq;
    if (!String(query ?? '').trim()) return { query: '', results: [], stale: false };
    const found = await this.catalogue.search(query);
    if (seq !== this._seq) return { query, results: [], stale: true };
    return { query, results: found.filter((i) => this.parental.isAllowed(i.rating)), stale: false };
  }
}

export class MyListVM {
  constructor({ myList, parental }) { Object.assign(this, { myList, parental }); }
  async load() { return (await this.myList.get()).filter((i) => this.parental.isAllowed(i.rating)); }
}

export class GuideVM {
  constructor({ live, clock = systemClock }) { Object.assign(this, { live, clock }); }
  async load(windowMs) {
    const now = this.clock.now(), rows = [];
    for (const channel of await this.live.getChannels()) {
      const slots = (await this.live.getGuide(channel.id, now, now + windowMs)).sort((a, b) => a.startMs - b.startMs);
      rows.push({ channel, slots, onNow: slots.find((s) => now >= s.startMs && now < s.endMs) ?? null, next: slots.find((s) => s.startMs > now) ?? null });
    }
    return rows;
  }
}

/** Device-code sign-in: show a code, poll until the user enters it elsewhere. */
export class SignInVM {
  constructor({ auth, clock = systemClock, sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); res(); }); }) }) {
    Object.assign(this, { auth, clock, sleep });
  }
  /** @returns {'signedIn'|'expired'|'cancelled'|'error'} - calls onCode(code) as soon as the code is known. */
  async run({ signal, onCode } = {}) {
    let pin;
    try { pin = await this.auth.startActivation(); } catch (e) { this.error = e.message; return 'error'; }
    onCode?.(pin.code);
    while (!signal?.aborted) {
      if (this.clock.now() >= pin.expiresAtMs) return 'expired';
      try {
        const session = await this.auth.pollActivation(pin);
        if (session) return 'signedIn';
      } catch (e) { this.error = e.message; return 'error'; }
      await this.sleep(pin.pollMs, signal);
    }
    return 'cancelled';
  }
}

/** Resume bookkeeping for the player; the UI feeds it position ticks. */
export class PlayerVM {
  constructor({ playback, resume, clock = systemClock, saveEveryMs = 15_000 }) { Object.assign(this, { playback, resume, clock, saveEveryMs }); this._last = -Infinity; this.episode = null; this.info = null; this.startAt = 0; }
  async loadEpisode(episode) {
    this.episode = episode; this.info = await this.playback.getEpisode(episode.id);
    const rp = await this.resume.get(episode.id);
    this.startAt = rp && !isFinished(rp) ? rp.positionSeconds : 0;
    return this;
  }
  async loadLive(channelId) { this.episode = null; this.startAt = 0; this.info = await this.playback.getLive(channelId); return this; }
  async report(positionSeconds, durationSeconds, force = false) {
    if (!this.episode || !this.info || this.info.isLive) return false;   // live streams have no resume point
    const now = this.clock.now();
    if (!force && now - this._last < this.saveEveryMs) return false;
    this._last = now;
    await this.resume.save({ episodeId: this.episode.id, showId: this.episode.showId, positionSeconds, durationSeconds, updatedAt: now });
    return true;
  }
}

export function createServices(store, { catalogue = new MockCatalogue() } = {}) {
  return {
    store, catalogue, live: new MockLive(), auth: new MockAuth(), parental: new ParentalControl(store),
    myList: new MockMyList(catalogue, store), resume: new MockResume(store), playback: new MockPlayback(),
  };
}
