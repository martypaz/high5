# Turning an analysed app into a high5 channel

A **channel** is an adapter that supplies data to high5's shared interface. All channels use the same screens, navigation and stylesheet
(`web/css/app.css`, `web/js/ui.js`). A channel never ships its own UI. If a feature does not fit the shared screens, say so to the user rather than forking the interface.

## Files

| File | What it is |
|---|---|
| `web/js/channels/kit.js` | Shared helpers every channel must use: `fillTemplate`, `allowedOrigin`, `safeId`, `getJson`, `ratingMapper`, `str`, `num` |
| `web/js/channels/<id>.js` | The adapter (one class with `search` and `getShow`, plus mappers and the image-URL builder) |
| `web/js/channels/index.js` | Registry entry: id, name, blurb, kind, capabilities, `create()` |
| `web/tests/<id>.test.js` | Unit tests with **invented** fixtures in the real response shape |
| `docs/analysis/<app>-<version>.md` | The evidence: hosts, endpoints (verified vs inferred), shapes, unknowns |

## Adapter contract

All methods are async. Unsupported optional methods return `[]` or `null`.

```
search(query)  -> Card[]            required
getShow(id)    -> Show | null       required (include episodes)
getEpisode(id) -> Episode | null    optional   getHomeRails()/getGenres()/getByGenre(g) optional
Card    { id, title, genre, kind:'show'|'film', rating:0..4, ratingKnown?:false, imageUrl?, description?, subgenres?, channel? }
Show    Card & { synopsis, bannerUrl?, episodes:Episode[] }
Episode { id, showId, showTitle, title, season, episode, synopsis, durationSeconds, rating, ratingCode?, available,
          availableUntilMs?, imageUrl?, advisory?, hasSubtitles? }
```

Ratings are numbers 0..4 (U, PG, 12, 15, 18). Use `ratingMapper({...})` so any unknown code becomes 4 (fail closed). When a rating is only that safety
default (search results that carry none), set `ratingKnown: false` so the UI does not display it.

`capabilities` tells the shared UI which screens to offer: `search, show, images, home, guide, playback`. Start with `search/show/images` true and the rest false;
a flag becomes true only when the adapter really supports it. The UI then hides or explains the rest automatically.

## Safety rules every adapter keeps (the kit makes these the default)

1. **Anonymous read-only GETs** through `getJson`: no cookies (`credentials:'omit'`), no referrer, only an `Accept` header.
2. **Host allow-list.** Every address taken from a remote config document must pass `allowedOrigin(url, ['<owner-domain>'])`; images too (`buildImageUrl` returns `null` instead of throwing).
3. **Validate ids** with `safeId` before they go into a URL; clamp image sizes to `WxH` digits.
4. **No secrets in the repo.** If the service needs an API key, client id or token, stop: that is the user's decision, and the channel cannot ship that value. Do not read credential files from the APK.
5. **Fail soft.** A missing image template, a malformed item or an unknown field yields "no image" or "unknown", never an exception that blanks the screen.
6. **Be gentle.** Search is debounced in the UI (400 ms) and needs two letters; do not add polling or bulk crawling.
7. **Invented fixtures only.** Tests use made-up titles in the same JSON shape; never paste real catalogue text, artwork or ids.

## Steps

1. Analysis done and written up (SKILL.md steps 1-7), with the user's go-ahead for any live probe.
2. Write `web/js/channels/<id>.js`, modelled on `channel5.js`: read the service's public config document (if there is one) lazily and cache it; build URLs from its templates; map the response to `Card/Show/Episode`.
3. Register it in `index.js` (`kind:'live'`, honest `capabilities`). Nothing else in the UI changes.
4. Tests in `web/tests/<id>.test.js`: URL construction, mapping, fail-closed ratings, host allow-list, error messages, the contract in `channels.test.js` (it iterates every registered channel automatically).
5. Run `npm test` in `web/`, then the opt-in live smoke test once (`node tests/live-smoke.mjs <query> <outdir>` works for any channel set via `localStorage.high5.channel`).
6. Docs: update the analysis note, `web/README.md`, and `Martin Instructions.md` (what is done / not done, and the Drive reminder).
7. Commit; publish with the repo's "Publish web app" workflow if the user wants it live.

## What a channel can and cannot do

* Can: search, show pages with series and episodes, artwork, availability and rating text, a read-only experience on any device.
* Cannot (needs a separate go-ahead, and may be impossible): account features, server-side lists, playback. Playback means licences and DRM; do not remove or work around either.

## Untested channels (when you may not or cannot probe the service)

Sometimes the code tells you enough to build a search-only adapter but you were not cleared to call the service, or the call was refused. That is fine:

* Build it from what the decompiled models and request classes prove; copy field names exactly (Gson/Moshi serialized names, not Kotlin property names).
* Register it with `experimental: true` and an honest blurb. The Channels page shows an **Untested** badge.
* Keep `capabilities` minimal (`search`, `show`, `images`). If episodes need other APIs, `getShow` may return a basic page built from the search result with `episodes: []`.
* Tests use invented fixtures *and* a browser test that stubs the network inside the browser (`web/tests/channels-e2e.mjs`), so nothing leaves your machine.
* Tell the user the first real request will come from their own browser, and ask for a screenshot of any error line under the search box. Adjust the adapter from that.

Worked example: `web/js/channels/itvx.js` (ITVX 17.5.0). The host came from `assets/application.properties`; the request parameters and response fields came from the obfuscated `SearchApi` found with `Decompile.java --contains 'Api.kt */'` and the readable `SearchResponse` models.
