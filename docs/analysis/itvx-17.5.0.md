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

## Status in high5
`web/js/channels/itvx.js`: **experimental, search only**, built from the above and tested only with invented fixtures and an in-browser network stub. Programme pages with episodes, home rails, playback and accounts are not implemented.
Next step is for the owner to try it from their own browser and report any error shown under the search box.

## First real attempt (owner's phone browser, 2026-11-06)
The ITVX channel's first search from a web page failed with the app's generic "could not reach the catalogue" message. A browser cannot say why: a down
network and a server that does not allow web pages to read its replies (CORS) look identical to the page. The app now repeats the failed GET once in
`no-cors` mode to tell them apart and shows a specific message. If it reports a blocked reply, ITVX cannot work as a pure web page (the native app is not
subject to that rule); the options are a native client, a proxy (needs the owner's explicit go-ahead and has terms implications), or leaving the channel out.
