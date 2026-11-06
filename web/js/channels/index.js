// Channel registry. A channel = an adapter that supplies data (a "catalogue") to the shared interface.
//
// Catalogue contract (all methods async). Unsupported optional methods may return [] / null.
//   search(query)  -> Card[]            required
//   getShow(id)    -> Show | null       required
//   getEpisode(id) -> Episode | null    optional
//   getHomeRails() -> Rail[]            optional   getGenres()/getByGenre(g) optional
// Card    { id, title, genre, kind:'show'|'film', rating:0..4, ratingKnown?:false, imageUrl?, description?, subgenres?, channel? }
// Show    Card & { synopsis, bannerUrl?, episodes:Episode[] }
// Episode { id, showId, showTitle, title, season, episode, synopsis, durationSeconds, rating, ratingCode?, available,
//           availableUntilMs?, imageUrl?, advisory?, hasSubtitles? }
// ratingKnown:false means the rating is only a safety default for the parental lock (fails closed at 4) and must not be shown.
// `experimental: true` marks a channel still in beta (or not yet verified against its live service); the Channels page shows a "Beta" badge.
// Capabilities tell the shared UI which screens make sense for this channel.
import { Channel5Catalogue } from './channel5.js';
import { ItvxCatalogue } from './itvx.js';
import { DemoCatalogue } from './demo.js';

export const CHANNELS = Object.freeze([
  { id: 'channel5', name: 'Channel 5', kind: 'live', blurb: 'Search and show pages from the real catalogue (read-only).',
    capabilities: { search: true, show: true, images: true, home: false, guide: false, playback: false }, create: () => new Channel5Catalogue() },
  { id: 'itvx', name: 'ITVX', kind: 'live', experimental: true,
    blurb: 'Beta: search with pictures and descriptions, and the latest episode of each show. No full episode lists or playback yet.',
    capabilities: { search: true, show: true, images: true, home: false, guide: false, playback: false }, create: () => new ItvxCatalogue() },
  { id: 'demo', name: 'Demo', kind: 'demo', blurb: 'Invented shows. Works offline.',
    capabilities: { search: true, show: true, images: false, home: true, guide: true, playback: true }, create: () => new DemoCatalogue() },
]);

export const DEFAULT_CHANNEL = 'channel5';

export function findChannel(id) { return CHANNELS.find((c) => c.id === id) ?? null; }

/** Picks the saved channel; understands the older 'source' setting (live/demo). */
export function pickChannel(store, preset) {
  const saved = store.get('channel');
  if (findChannel(saved)) return findChannel(saved);
  const legacy = store.get('source');
  if (legacy === 'demo') return findChannel('demo');
  if (legacy === 'live') return findChannel('channel5');
  return findChannel(findChannel(preset) ? preset : DEFAULT_CHANNEL);
}
