// High5 web - channel: Channel 5 (My5). READ-ONLY live catalogue (search + show pages + images).
//
// How it works (from the official Android app 7.26.6, see docs/analysis):
//   1. The app downloads a public config document at start-up. It is served without login and with CORS "*".
//   2. That config holds the catalogue host and URL templates. We read the host/platform/templates from it at run
//      time, so none of them are hard-coded here except where to find the config itself.
//   3. Search -> GET <base>/shows/search.json?...   Show -> GET <base>/shows/{id}.json   Episodes -> .../episodes.json
//
// Not implemented on purpose: sign-in, anything that writes, playback / licences, region or VPN workarounds.
// Personal use only; this talks to a third party's servers - keep request volume low (search is debounced in the UI).

import { fillTemplate, allowedOrigin, safeId, str, num, getJson, ratingMapper } from './kit.js';
export { fillTemplate };

export const SOURCE = Object.freeze({
  configUrl: 'https://cassie.channel5.com/platform/my5androidng/config.json',
  configLabel: '7.26.6',
});

// The data only showed "G" and "G+" (observed on a handful of shows). Their exact meaning is not documented, so
// "G" is treated as Universal, "G+" as PG, and ANY other/unknown code as 18 (fail closed for the parental lock).
const RATING_BY_CODE = { G: 0, 'G+': 1 };
export const ratingFromCode = ratingMapper(RATING_BY_CODE);

const C5_DOMAINS = ['channel5.com'];
const allowedHost = (url) => allowedOrigin(url, C5_DOMAINS);

/** Builds a poster URL from the config's image template. Returns null (no image) for anything unexpected. */
export function buildImageUrl(template, { type, id, resolution, updated } = {}) {
  if (typeof template !== 'string' || !template) return null;
  if (!['show', 'episode'].includes(type) || !safeId(id) || !/^\d{2,4}x\d{2,4}$/.test(String(resolution ?? ''))) return null;
  try {
    const u = new URL(fillTemplate(template, { type, id, resolution, fmt: 'jpg', time: updated || '', overlayType: '', master: '' }));
    allowedHost(u.href);
    for (const [k, v] of [...u.searchParams]) if (v === '') u.searchParams.delete(k);   // drop unused placeholders
    return u.href;
  } catch { return null; }
}


export function mapShowCard(s, img = () => null) {
  return {
    imageUrl: img('show', s.id, '423x238', s.img_upd),
    id: str(s.id), title: str(s.title), genre: str(s.genre), kind: 'show', channel: str(s.chan),
    subgenres: Array.isArray(s.vod_subgenres) ? s.vod_subgenres.map(String) : [],
    description: str(s.s_desc),
    // Search results carry no rating: kids' shows count as PG at most, everything else fails closed at 18.
    rating: s.child_directed === true ? 1 : 4,
    ratingKnown: false,          // the rating above is only a safety default for the parental lock, not real data: don't display it
  };
}

export function mapEpisode(e, nowMs, img = () => null) {
  const from = num(e.vod_s) * 1000, until = num(e.vod_e) * 1000;
  return {
    id: str(e.id), showId: str(e.sh_id), showTitle: str(e.sh_title), title: str(e.title), imageUrl: img('episode', e.id, '423x238', e.img_upd),
    season: num(e.sea_num, 1), episode: num(e.ep_num), synopsis: str(e.s_desc), advisory: str(e.adv),
    durationSeconds: Math.round(num(e.len) / 1000), rating: ratingFromCode(e.rat), ratingCode: str(e.rat),
    availableFromMs: from, availableUntilMs: until, available: from <= nowMs && (until === 0 || nowMs < until),
    hasAds: e.vod_ad === true, hasSubtitles: e.vod_sub === true,
  };
}

export class Channel5Catalogue {
  constructor({ fetchFn = (...a) => globalThis.fetch(...a), source = SOURCE, now = () => Date.now() } = {}) {
    Object.assign(this, { fetchFn, source, now });
    this._settings = null;
  }

  settings() {
    if (!this._settings) {
      this._settings = (async () => {
        const url = `${this.source.configUrl}?label=${encodeURIComponent(this.source.configLabel)}`;
        const cfg = await this._json(url);
        const ds = cfg?.dataServiceSettings ?? {};
        const need = ['coronaBaseUri', 'platformId', 'coronaShowQueryTemplateUri', 'coronaShowTemplateUri', 'coronaAllEpisodesByShowTemplateUri'];
        for (const k of need) if (typeof ds[k] !== 'string' || !ds[k]) throw new Error('The catalogue settings are not in the expected format.');
        return { base: allowedHost(ds.coronaBaseUri), platform: ds.platformId, query: ds.coronaShowQueryTemplateUri, show: ds.coronaShowTemplateUri, episodes: ds.coronaAllEpisodesByShowTemplateUri, images: typeof ds.ednaImagesTemplateUri === 'string' ? ds.ednaImagesTemplateUri : '' };
      })().catch((e) => { this._settings = null; throw e; });
    }
    return this._settings;
  }

  _json(url) { return getJson(this.fetchFn, url); }

  async _img() {
    const { images } = await this.settings();
    return (type, id, resolution, updated) => buildImageUrl(images, { type, id: String(id ?? ''), resolution, updated });
  }

  async _get(templateKey, params) {
    const s = await this.settings();
    return this._json(s.base + fillTemplate(s[templateKey], { platformId: s.platform, ...params }));
  }

  async search(query) {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];
    const data = await this._get('query', { query: q, genre: '' });
    const img = await this._img();
    return (Array.isArray(data?.shows) ? data.shows : []).map((x) => mapShowCard(x, img));
  }

  async getShow(id) {
    if (!safeId(id)) return null;
    const [show, eps] = await Promise.all([this._get('show', { showId: id }), this._get('episodes', { showId: id })]);
    if (!show?.id) return null;
    const now = this.now(), img = await this._img();
    const episodes = (Array.isArray(eps?.episodes) ? eps.episodes : []).map((e) => mapEpisode(e, now, img))
      .sort((a, b) => a.season - b.season || a.episode - b.episode);
    const card = mapShowCard(show, img);
    const known = episodes.filter((e) => e.ratingCode in RATING_BY_CODE);
    return { ...card, bannerUrl: img('show', show.id, '1024x576', show.img_upd), synopsis: str(show.m_desc) || card.description, channel: str(show.chan_name) || card.channel,
      ratingKnown: !!episodes.length && known.length === episodes.length,
      rating: known.length === episodes.length && episodes.length ? Math.max(...episodes.map((e) => e.rating)) : card.rating, episodes };
  }

  // Not available in this read-only build.
  async getEpisode() { return null; }
  async getHomeRails() { return []; }
  async getGenres() { return []; }
  async getByGenre() { return []; }
}

/** Backwards-compatible name. */
export const LiveCatalogue = Channel5Catalogue;
