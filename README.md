# high5

An unofficial **Xbox (UWP) client modelled on the My5 / Channel 5 Android app**.
**Personal use only** - not for distribution or the Microsoft Store. Sign in with your own My5 account.

## Ground rules
- No original app binaries, artwork or secrets are committed (`.gitignore`; see `docs/analysis`).
- No DRM circumvention, no geo-restriction or VPN-check bypass. Playback is UK-only, as in the official app.
- The official app's client identifiers/keys are not reused here (see "Going live" below).

## What exists
| Part | State |
|---|---|
| `web/` - static HTML/JS version for the **Xbox Edge browser** (no Developer Mode): same screens/logic, D-pad + gamepad navigation | **Built and tested** (17 unit tests, keyboard-driven browser test). Not tried on a real Xbox |
| `src/High5.Core` - models, service interfaces, view-models, parental PIN, resume logic, HTTP client for the known paths | **Built and tested** (31 xunit tests, `dotnet test High5.Core.sln`) |
| `src/High5.Xbox` - UWP XAML shell (sign-in, home, show, search, My List, TV guide, settings, player) | **Compiles and packages in GitHub Actions** (Windows runner); never run on a real Xbox yet. See `Martin Instructions.md` |
| Data | Mock catalogue (invented titles) and a public test stream. Real back end not wired up. |
| `docs/analysis/my5-7.26.6.md` | Static analysis of the reference Android app |

## Features mapped from My5 7.26.6
Sign-in via TV **device code** (`activationPins`), home rails + Continue watching (resume points), browse/search,
show detail with seasons, My List (favourites), live TV guide with now/next, parental PIN + max age rating,
player with resume and PlayReady hook. Not included: push notifications, Chromecast, ad-tech/analytics SDKs, kids mode ("Milkshake").

## Run the tests
```
dotnet test High5.Core.sln
```

## Going live (later, personal use)
1. Implement `ICatalogueService`, `IAuthService`, `IMyListService`, `IResumeService`, `IPlaybackService` against the real
   services (paths in `High5.Core.Api.UserServiceEndpoints`; hosts come from the app's remote config, request/response bodies are still unverified).
2. Swap them in `App.Services` (`src/High5.Xbox/App.xaml.cs`).
3. Authentication needs the official app's identifiers, which this repo deliberately does not contain - decide how to
   handle that (own account only, or ask Channel 5 for partner access) before doing so.
