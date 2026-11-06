# ITVX for Android 17.5.0 - static analysis

Source: a split-APK bundle the owner extracted from their phone and put in their Google Drive (base.apk SHA-256 recorded locally).
Method: the `read-apk-from-drive` skill (`.claude/skills/read-apk-from-drive`). **Static only: nothing was executed and no request was
sent to ITV's servers.** Credential values found in the app are deliberately not recorded; they are mentioned by name only.

## Identity
| | |
|---|---|
| Package | `air.ITVMobilePlayer` |
| Version | 17.5.0 (code 1301705000) |
| min / target SDK | 24 / 35 |
| Own code | `com.candyspace.itvplayer` (readable names, ~1,200 classes); networking classes are R8-obfuscated (`Ff.a`, `Xg.b`...) |
| SDKs | Braze, AppsFlyer, Conviva, LaunchDarkly, Firebase, Media3/ExoPlayer, Google Play billing, Amazon IAP, a third-party browser SDK (`com.kindred.browser_sdk`) |
| Deep links | `itvplayer://`, `https://itvx.onelink.me/...` |

## Where the addresses live
Unlike My5 (remote config) ITVX bundles them: `assets/application.properties` and `assets/release/application.properties`. Non-credential entries seen:

```
text_search_url                https://textsearch.prd.oasvc.itv.com            <- search
muninn_base_url                https://content-inventory.prd.oasvc.itv.com/discovery   <- "discovery" catalogue
shortform_base_url             https://shortform.prd.shows.itv.com/graphql
channels_metadata_base_url     https://nownext.oasvc.itv.com/
thumbnails_base_url (release)  https://thumbnails.cloudfront.content.itv.com/
http.app_config_url            https://www.itvstatic.com/assets/android/itv_android_app_config.json
promoted_content_service_base_url https://promoted.hubsvc.itv.com/promoted/itvonline/mobile/
auth / profile / entitlement / my-list / recommendations / device-registry ...  (*.prd.user.itv.com, *.prd.perso.itv.com, *.bde.itv.com)
```
Credential-like entries exist for some services (`recommendations_api_key`, `playlist.shared_key`, analytics keys, and `assets/api_key.txt`). They were **not opened or recorded**.
Whether the search host needs any of them is **unknown**: it has not been called.

## Search (inferred from the decompiled code, not verified live)
Retrofit interface `SearchApi` (obfuscated as `Xg.b`): `GET search` with a query map, no `@Headers` override.
Parameters set by `SearchServiceImpl`: `featureSet` (comma list of feature names, see below), `platform=mobile`, `query`, `broadcaster` (supplied by the caller; value unknown),
`size=21`, `onlyFree=false`, `channelType=SIMULCAST`, `pretx` (constant).
Feature names (enum `VariantFeature`): `hd`, `single-track`, `mpeg-dash`, `widevine`, `widevine-download`, `inband-ttml`, `inband-webvtt`, `outband-webvtt`, `inband-audio-description`
(the app's non-HD set omits `hd` and `single-track`).

Response (readable model classes, Gson serialized names): `{ results:[ { contentType, entityType, data:{ brandTitle, brandingMetadata{partnership,contentOwner}, channelId, channelName, channelType,
startDateAndTime, endDateAndTime, filmCCId, filmTitle, image, imageHref, latestAvailableEpisode{imageHref, legacyId{officialFormat}, tier}, legacyId{officialFormat}, productionId,
programmeCcid, programmeTitle, specialCcid, specialTitle, tier, timeDependentTags[{label}], totalAvailableEpisodes } } ] }`.
`entityType` is `programme`, `special` or `film`; `contentType` includes `live` and `pretx` (the app handles them separately).

## Other API interfaces found (names only, via `compiled from: *Api.kt`)
MostPopularApi (`GET programmes/mostpopular`, header `Accept: application/vnd.itv.hubsvc.programme.v3+hal+json`), MyListApi (needs an `Authorization` header), SearchApi, PlaylistApi (playback),
ThumbnailApi, PesApi / PesValidatorApi, UserProfileApi, RegistrationServicesApi, RecommendationsApi / HeroRecommendationsApi, PreTxRemindMeApi, InitializerApi, CptApi.
The programme page also uses compiled GraphQL operations (`brands`, `titles`, `collections`, `homepage`, ...); the GraphQL endpoint address was not found in plain strings.

## Playback (recorded, not touched)
Widevine DRM with MPEG-DASH; playlist media types `application/vnd.itv.vod.playlist.v4+json`. Error strings reference device DRM support. Nothing here was investigated further.

## Status in high5 (superseded by the resolution below)
`web/js/channels/itvx.js`: **experimental, search only**, built from the above and tested only with invented fixtures and an in-browser network stub. Programme pages with episodes, home rails, playback and accounts are not implemented.
Next step is for the owner to try it from their own browser and report any error shown under the search box.

## First real attempt (owner's phone browser, 2026-11-06)
The ITVX channel's first search from a web page failed with the app's generic "could not reach the catalogue" message. A browser cannot say why: a down
network and a server that does not allow web pages to read its replies (CORS) look identical to the page. The app now repeats the failed GET once in
`no-cors` mode to tell them apart and shows a specific message. If it reports a blocked reply, ITVX cannot work as a pure web page (the native app is not
subject to that rule); the options are a native client, a proxy (needs the owner's explicit go-ahead and has terms implications), or leaving the channel out.

## Diagnostic probes (2026-11-06, approved by the owner; anonymous GETs, nothing else)
Question: is the web channel failing because of the User-Agent? The same search request was sent four ways: curl's default UA, a plain `High5/1.0`, a stock mobile Chrome UA,
and Chrome UA plus `Origin: https://martypaz.github.io`.
Result: **all four got an identical `404 Not found`** (plain text, 9 bytes; `server: istio-envoy`, fronted by CloudFront). No `access-control-*` headers on any of them.
Conclusions: the User-Agent makes no difference; the failure the owner saw in a browser is a 404 without CORS headers (which a page can only report as a failed request), not a block on browsers.
Static findings that rule out hidden requirements: the app builds the search client from the *plain* `OkHttpClientProvider.a()` (cookie jar only, **no header interceptor, no api key**),
sets the base URL to `text_search_url` and calls `GET search`. Other services use an `apikey` header or a custom User-Agent; search does not.
So the address and path match the app. What differs is unknown: a parameter value or format (the `featureSet` separator, the `broadcaster` value, `pretx`), the sandbox's region (probes came from a US data centre), or the service has moved.
Next: with the owner's go-ahead, at most a few variants of the parameters; or the owner reports what their UK phone gets.

## Update: also "Not found" from the owner's UK phone
The same search URL opened directly in the owner's UK phone browser (no web page, so no CORS) also returned `Not found`. So it is **not** region, not the User-Agent (five identical probes
including an Xbox-Edge-style request), not CORS. The request built from the app's code is not what the service expects.
Checked statically and ruled out: a header or api key on the search client (plain client, no interceptor); a different base address from the remote app config (that file carries feature flags such as `amplitude-sdk`,
`firebase-analytics`, not URLs); a different path (Retrofit `GET search`). Still unknown: the real value/format of `featureSet` and `broadcaster`, or whether another route or version prefix is used in practice.
Guessing variants against a live third-party service is not something to do without the owner's say-so each time. The reliable next step would be to capture the app's actual request (not possible without a proxy on a device
that trusts it) or to find another, documented route. Status: **ITVX channel paused.**

## Resolution (2026-11-06): ITVX search works
Two parallel static-analysis agents read the exact request values from bytecode:
* `featureSet` = comma-joined representations, no spaces/brackets (confirmed; already what was sent).
* `pretx` = **`true`** (JADX had mis-resolved the constant to an unrelated static field `com.amazon...`; I had sent `false`).
* `broadcaster` is **always sent**; for a logged-out user it is the `BroadcasterName` default **`itv`** (stored in the SharedPreference `sharedPreferenceBroadcaster`; enum values itv/stv/utv; it normally comes from the login token). I had omitted it.
* `size=21`, `onlyFree=false`, `channelType=SIMULCAST` as before.
With `broadcaster=itv&pretx=true` the service answered **HTTP 200 JSON with `access-control-allow-origin: *`**, so a web page can call it. (The missing parameter made the gateway return `404 Not found`,
which has no CORS headers, hence the earlier browser errors.)

Verified response shape (field names; no catalogue text recorded):
`{ tookLongest, tookTotal, maxScore, results:[ { broadcaster, contentType:'vod', entityType:'programme'|'film'|'special', id, score, streamingPlatform, data:{ ... } } ] }`
* programme `data`: `programmeCCId` (capital CC), `programmeTitle`, `synopsis`, `genre[]`, `tier`, `totalAvailableEpisodes`, `latestAvailableEpisode{episodeCCId,imageHref,tileImageHref,legacyId}`, `legacyId{apiEncoded,officialFormat}`, `topCast[{familyName,givenName,ranking}]`, `variant{featureSet}`, `platform`, `productionId`, `popularityIndex/Rank`, `timeDependentTags[]`, optional `brandingMetadata`.
* film `data`: `filmCCId`, `filmTitle`, `duration`, `imageHref`, `tileImageHref`, plus the common fields. special `data`: `specialCCId`, `specialTitle`, `imageHref`, `tileImageHref`, optional `specialProgramme`.
* Artwork links are templates on `ovp.itv.com` (`.../itv_hub/<class>/16x9?...&w={width}&h={height}&q={quality}&blur={blur}&bg={bg}&treatment={treatment}&fallback={fallback}`); fill width/height/quality and drop the rest.

Probe log (all anonymous GETs, approved by the owner): 5 identity variants (404), 1 corrected request (200), plus two browser runs of the smoke test (search + artwork). Status: **beta, search only**; programme pages/episodes, home, playback and accounts are not implemented.

### Programme pages (static finding from the third agent, not probed)
* Search needs **no second lookup**: `SearchResponse.results[]` goes straight to tiles; tapping a tile opens a programme page.
* The programme page uses the `muninn_base_url` (`.../discovery`) **Apollo GraphQL** client (POST only; operations `ProgrammePage`, `Production`, `TitlesOrBrandByCCIdOrLegacy`, `PreTx`, `Categories`, `CollectionRails`, ... with variables `$broadcaster`, `$features`, `$ccid`, `$titleLegacyId`, `$brandLegacyId`).
  That client sends `User-Agent: ITV_Player_(Android)`, i.e. the official app's identity. A JSON POST from a web page also triggers a CORS pre-flight that the service may not allow.
* Consequence: episodes/programme details are a different and harder problem than search. Using the official User-Agent would be impersonating the app, which this project does not do. Not attempted.
* The shortform GraphQL client (`shortform_base_url`) serves `Homepage`, `Clip` and category rails (video clips, not the catalogue).
