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
  };
}

export class ItvxCatalogue {
  constructor({ fetchFn = (...a) => globalThis.fetch(...a), source = ITVX } = {}) {
    Object.assign(this, { fetchFn, source });
    this._seen = new Map();             // id -> Card from recent searches (search results are the only data this adapter has)
  }

  async search(query) {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];
    const s = this.source;
    const params = new URLSearchParams({ featureSet: s.featureSet.join(','), platform: 'mobile', query: q, size: String(s.size), onlyFree: 'false', channelType: 'SIMULCAST', broadcaster: s.broadcaster, pretx: s.pretx });
    const base = allowedOrigin(s.searchBase, s.domains);
    const data = await getJson(this.fetchFn, `${base}${s.searchPath}?${params}`);
    const cards = (Array.isArray(data?.results) ? data.results : []).map(mapResult).filter(Boolean);
    for (const c of cards) this._seen.set(c.id, c);
    return cards;
  }

  /** Minimal show page built from the search result; episodes need other APIs this adapter does not use yet. */
  async getShow(id) {
    const c = this._seen.get(String(id ?? ''));
    if (!c) return null;
    return { ...c, synopsis: c.description || 'More details are not available for this channel yet.', bannerUrl: c.imageUrl, ratingKnown: false, episodes: [] };
  }

  async getEpisode() { return null; }
  async getHomeRails() { return []; }
  async getGenres() { return []; }
  async getByGenre() { return []; }
}
