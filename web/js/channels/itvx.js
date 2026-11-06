// High5 web - channel: ITVX (ITV). BETA, SEARCH ONLY.
//
// The request and response shapes come from static analysis of the Android app (ITVX 17.5.0) and were then checked against the live search
// service with a handful of anonymous GETs (the service answers with an open cross-origin header, so a web page can read it).
// The first attempt failed with 404 because two parameters differed from the app's: `broadcaster` is always sent (a logged-out user gets "itv")
// and `pretx` is "true". Those two values are the app's own defaults, not credentials.
//
// Not implemented: programme pages with episodes (other APIs), home rails, playback, accounts. Read-only and anonymous; no keys or tokens.
import { fillTemplate, allowedOrigin, str, num, getJson, safeId, ratingMapper } from './kit.js';

export const ITVX = Object.freeze({
  searchBase: 'https://textsearch.prd.oasvc.itv.com',          // from the app's bundled application.properties (text_search_url)
  searchPath: '/search',
  domains: ['itv.com', 'itvstatic.com'],
  size: 21,                                                     // the app asks for 21
  broadcaster: 'itv',                                           // the app's default for a logged-out user (enum BroadcasterName: itv, stv, utv)
  pretx: 'true',                                                // constant the app sends (verified in bytecode)
  // Feature names the app sends for non-HD mobile playback (VariantFeature enum, without the HD / single-track entries).
  featureSet: ['mpeg-dash', 'widevine', 'widevine-download', 'inband-ttml', 'inband-webvtt', 'outband-webvtt', 'inband-audio-description'],
});

// ITVX search results carry no age rating. Every item fails closed for the parental lock and the rating is never displayed.
export const itvxRatingFromCode = ratingMapper({});

/** Accepts an image link only if it is https on an ITV domain; fills the size placeholders the app's image builder uses. */
export function safeImageUrl(raw, width = 640, height = 360) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const filled = fillTemplate(raw, { width, height, w: width, h: height, quality: 80, q: 80 });
    const u = new URL(filled);
    allowedOrigin(u.href, ITVX.domains);
    for (const [k, v] of [...u.searchParams]) if (v === '') u.searchParams.delete(k);   // drop unused placeholders
    return u.href;
  } catch { return null; }
}

/** "PT1H30M" -> 5400 seconds; anything unparseable -> 0. */
export function parseIsoDuration(v) {
  const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)$/.exec(String(v ?? ''));
  return m ? Math.round(num(m[1]) * 3600 + num(m[2]) * 60 + num(m[3])) : 0;
}

/** Maps one search result to a Card, or null for results we do not show (live channels, pre-transmission items, unknown types). */
export function mapResult(r) {
  const d = r?.data; if (!d || typeof d !== 'object') return null;
  const contentType = str(r.contentType).toLowerCase(), entity = str(r.entityType).toLowerCase();
  if (contentType === 'live' || contentType === 'pretx') return null;
  let id, title, kind = 'show';
  // Field names as the live service sends them (note the capital "CC" in the ids); the lower-case spellings are what the app's own models use.
  if (entity === 'programme') { id = str(d.programmeCCId) || str(d.programmeCcid); title = str(d.programmeTitle) || str(d.brandTitle); }
  else if (entity === 'film') { id = str(d.filmCCId); title = str(d.filmTitle); kind = 'film'; }
  else if (entity === 'special') { id = str(d.specialCCId) || str(d.specialCcid); title = str(d.specialTitle); }
  else return null;
  if (!safeId(id) || !title) return null;
  const genres = (Array.isArray(d.genre) ? d.genre : [d.genre]).filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim());
  const eps = num(d.totalAvailableEpisodes, 0);
  const tier = str(d.tier) || str(d.latestAvailableEpisode?.tier);
  const extras = [eps > 0 ? `${eps} episode${eps === 1 ? '' : 's'} available` : '', tier.toUpperCase() === 'PAID' ? 'ITVX Premium' : ''].filter(Boolean);
  const le = d.latestAvailableEpisode ?? {};
  return {
    id, title, kind, genre: genres[0] ?? '', channel: 'ITVX', subgenres: [...genres.slice(1), ...extras],
    description: str(d.synopsis).trim(),
    imageUrl: safeImageUrl(d.imageHref) || safeImageUrl(d.tileImageHref) || safeImageUrl(le.imageHref) || safeImageUrl(le.tileImageHref) || safeImageUrl(d.image),
    rating: itvxRatingFromCode(undefined), ratingKnown: false,
    // Kept for the show page: the search result is all the data a web page can get (see getShow).
    _latest: { episodeId: str(le.episodeCCId), total: eps, kind, durationSeconds: parseIsoDuration(d.duration), imageUrl: safeImageUrl(le.tileImageHref) || safeImageUrl(le.imageHref) },
  };
}

export const SEEN_MAX = 50;

/** Re-checks a card read back from storage: right shapes, safe ids, picture links only on ITV domains. */
export function revive(c) {
  if (!c || typeof c !== 'object' || !safeId(c.id) || !str(c.title)) return null;
  const img = (u) => { try { return typeof u === 'string' && u ? allowedOrigin(u, ITVX.domains) && u : null; } catch { return null; } };
  const l = c._latest && typeof c._latest === 'object' ? c._latest : {};
  return { id: String(c.id), title: str(c.title), kind: c.kind === 'film' ? 'film' : 'show', genre: str(c.genre), channel: 'ITVX',
    subgenres: Array.isArray(c.subgenres) ? c.subgenres.map(str).filter(Boolean).slice(0, 6) : [], description: str(c.description),
    imageUrl: img(c.imageUrl), rating: itvxRatingFromCode(undefined), ratingKnown: false,
    _latest: { episodeId: safeId(l.episodeId) ? String(l.episodeId) : '', total: num(l.total, 0), kind: l.kind === 'film' ? 'film' : 'show', durationSeconds: num(l.durationSeconds, 0), imageUrl: img(l.imageUrl) } };
}

export class ItvxCatalogue {
  /** `persist` = { load(): Card[], save(Card[]) } lets show pages survive a reload or a channel switch (see rememberSearches). */
  constructor({ fetchFn = (...a) => globalThis.fetch(...a), source = ITVX, persist = null } = {}) {
    Object.assign(this, { fetchFn, source, persist });
    this._seen = new Map();             // id -> Card from recent searches (search results are the only data this adapter has)
    this._loaded = false;
  }

  _restore() {
    if (this._loaded) return; this._loaded = true;
    let saved = []; try { saved = this.persist?.load() ?? []; } catch { /* storage blocked */ }
    for (const c of Array.isArray(saved) ? saved : []) { const k = revive(c); if (k && !this._seen.has(k.id)) this._seen.set(k.id, k); }
  }

  _remember(cards) {
    this._restore();
    for (const c of cards) { this._seen.delete(c.id); this._seen.set(c.id, c); }
    while (this._seen.size > SEEN_MAX) this._seen.delete(this._seen.keys().next().value);
    try { this.persist?.save([...this._seen.values()]); } catch { /* storage blocked or full */ }
  }

  async search(query) {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];
    const s = this.source;
    const params = new URLSearchParams({ featureSet: s.featureSet.join(','), platform: 'mobile', query: q, size: String(s.size), onlyFree: 'false', channelType: 'SIMULCAST', broadcaster: s.broadcaster, pretx: s.pretx });
    const base = allowedOrigin(s.searchBase, s.domains);
    const data = await getJson(this.fetchFn, `${base}${s.searchPath}?${params}`);
    const cards = (Array.isArray(data?.results) ? data.results : []).map(mapResult).filter(Boolean);
    this._remember(cards);
    return cards.map(({ _latest, ...card }) => card);
  }

  /**
   * Show page built from the search result. ITVX keeps its full episode lists behind a GraphQL service that answers a browser's permission
   * check with 404 (no CORS), so a web page cannot read them. What the search result does carry is the newest episode and the episode count,
   * so that is what we list, with a note saying so.
   */
  async getShow(id) {
    this._restore();
    const c = this._seen.get(String(id ?? ''));
    if (!c) return null;
    const { _latest: l, ...card } = c;
    const total = l?.total ?? 0;
    let episodes = [], note = '';
    if (l?.kind === 'film' || (!l?.episodeId && total === 0)) {
      episodes = [{ id: card.id, showId: card.id, showTitle: card.title, title: card.title, season: 1, episode: 1, synopsis: card.description, durationSeconds: l?.durationSeconds ?? 0,
        rating: card.rating, available: true, imageUrl: card.imageUrl, hasSubtitles: false }];
    } else if (safeId(l?.episodeId)) {
      episodes = [{ id: l.episodeId, showId: card.id, showTitle: card.title, title: 'Latest episode', season: 1, episode: 1,
        synopsis: total > 1 ? `The newest of ${total} available episodes.` : 'The only available episode.', durationSeconds: 0, rating: card.rating, available: true, imageUrl: l.imageUrl || card.imageUrl }];
      if (total > 1) note = `Only the latest episode is listed. ITVX has ${total} available; its full episode list cannot be read from a web page.`;
    }
    return { ...card, synopsis: card.description || 'More details are not available for this channel yet.', bannerUrl: card.imageUrl, ratingKnown: false, episodes, episodesNote: note };
  }

  async getEpisode() { return null; }
  async getHomeRails() { return []; }
  async getGenres() { return []; }
  async getByGenre() { return []; }
}
