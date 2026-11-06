// High5 web - channel: ITVX (ITV). EXPERIMENTAL, SEARCH ONLY.
//
// Built from static analysis of the Android app (ITVX 17.5.0): its bundled application.properties names the text-search host, and the
// decompiled SearchApi/SearchService/SearchResponse classes give the request parameters and the response fields. It has NOT been run
// against the live service from here. The first real request is made by the user's own browser; if the service wants a key, a header or
// different parameters, the app shows the error and nothing else happens.
//
// Not implemented: programme pages with episodes (the app uses other APIs for that), home rails, playback, accounts.
// Read-only and anonymous. No keys, tokens or client ids are used or stored.
import { fillTemplate, allowedOrigin, str, num, getJson, safeId, ratingMapper } from './kit.js';

export const ITVX = Object.freeze({
  searchBase: 'https://textsearch.prd.oasvc.itv.com',          // from the app's bundled application.properties (text_search_url)
  searchPath: '/search',
  domains: ['itv.com', 'itvstatic.com'],
  size: 21,                                                     // the app asks for 21
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
  if (entity === 'programme') { id = str(d.programmeCcid); title = str(d.programmeTitle) || str(d.brandTitle); }
  else if (entity === 'film') { id = str(d.filmCCId); title = str(d.filmTitle); kind = 'film'; }
  else if (entity === 'special') { id = str(d.specialCcid); title = str(d.specialTitle); }
  else return null;
  if (!safeId(id) || !title) return null;
  const eps = num(d.totalAvailableEpisodes, 0);
  const tier = str(d.tier) || str(d.latestAvailableEpisode?.tier);
  const bits = [eps > 0 ? `${eps} episode${eps === 1 ? '' : 's'} available` : '', tier.toUpperCase() === 'PAID' ? 'ITVX Premium' : '', str(d.channelName)].filter(Boolean);
  return {
    id, title, kind, genre: str(d.channelName), channel: str(d.channelName), subgenres: [],
    description: bits.join(' · '),
    imageUrl: safeImageUrl(d.imageHref) || safeImageUrl(d.image) || safeImageUrl(d.latestAvailableEpisode?.imageHref),
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
    const params = new URLSearchParams({ featureSet: s.featureSet.join(','), platform: 'mobile', query: q, size: String(s.size), onlyFree: 'false', channelType: 'SIMULCAST', pretx: 'false' });
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
