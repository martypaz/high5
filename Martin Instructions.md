# Martin Instructions

Everything about **high5** (the unofficial Xbox app modelled on My5): what's done, what you need, and what to do next.
Written so you can follow it **from a phone**.

> **Personal use only.** Use your own My5 account, in the UK. Don't publish it as an app. Not affiliated with Channel 5.

---

## 1. Where things stand

| Thing | Status |
|---|---|
| Analysis of the My5 Android app (7.26.6) | Done - `docs/analysis/my5-7.26.6.md` |
| **Web version (runs in the Xbox's Edge browser - NO Developer Mode)** | **Built and tested here** (17 unit tests + a keyboard-driven browser test with screenshots). Not tried on a real Xbox yet |
| Xbox app version (UWP) | Builds and packages on GitHub's Windows machines, but installing it needs Xbox **Developer Mode** - see section 4 (I don't recommend it, given what happened last time) |
| **Live search + show pages (read-only)** | **Built and tested in a real browser.** Real shows, series, episodes, lengths, ratings, availability dates. GET requests only, no account. Used in the web version |
| Live sign-in, My List sync, resume sync | Written and unit-tested against a fake server only. Never run against the real service (the web version doesn't use them) |
| Home rails, TV guide, images, **video playback** | **Not done.** Home shows a simple page in live mode; episodes list details but can't be played |
| Your Microsoft developer account | Authorised - **only needed for section 4**, nothing more to buy |

**What you'll see today:** in **Live** mode, search finds real shows (try "999") and each show page lists its series and episodes with
details. You can't play anything yet. The phone preview in this chat uses **Demo** mode, because its sandbox blocks outside websites; to
try Live you need the hosted version (section 2a). In Demo mode everything is invented.

---

## 2. Recommended: the web version (safe - nothing installed on your Xbox)

It's an ordinary web page that opens in the Xbox's **Microsoft Edge**. No Dev Mode, no resets, nothing to uninstall.
Controls: **D-pad / left stick** moves, **A** selects, **B** goes back.

### 2a. It needs to live at a web address
The Xbox has to reach the page, so it must be hosted. Pick one (all free, none need a PC):

**Option 1 - GitHub Pages from this repo** (easiest, *if* your GitHub plan allows Pages on private repos)
1. On your phone: github.com/martypaz/high5 > **Settings** > **Pages** > Source: **GitHub Actions**.
   If GitHub says Pages needs an upgrade for private repos, use Option 2.
2. **Actions** tab > **Publish web app** > **Run workflow** (choose the branch `ccr-52cad7bd-nxyfdf`).
3. When it finishes it shows the address, normally `https://martypaz.github.io/high5/`.

**Option 2 - a small separate public repo** (free on any plan; the site only contains demo data, no keys)
1. Create a new **public** repo on GitHub called `high5-web` (empty).
2. Tell me. I'll attach it, push the `web` folder there, and give you the Pages steps (one switch in Settings > Pages).
   The address will be `https://martypaz.github.io/high5-web/`.

### 2b. Open it on the Xbox
1. Xbox **Microsoft Edge** > type the address (a controller keyboard is slow - try it on your **phone first** to check it works, then
   use Edge's bookmark/pin so you only type it once; or cast/"send to console" from your phone if you have the Xbox app).
2. The first screen is the sign-in screen; with demo data it signs itself in after a few seconds.
3. Use the D-pad. Tell me anything that feels wrong (focus jumping, can't reach a button, text too small) - **a photo from the TV is perfect**.

> **Honest caveat:** I tested it in a desktop browser with a keyboard, not on an Xbox. Xbox Edge also has its own mouse-style cursor
> mode; the page is built so both work, but I haven't confirmed it on your console. Protected (PlayReady) video isn't implemented in
> the web version yet.

---

## 3. Getting the app files yourself (optional)
GitHub builds everything automatically: github.com/martypaz/high5 > **Actions** > newest green **CI** run > **Artifacts**.
* `high5-xbox-sideload` - the Xbox (UWP) package, only useful for section 4.
* If a run shows a red cross, tell me - I can read the log and fix it.

---

## 4. Optional: the Xbox app version (needs Developer Mode)

You told me Developer Mode killed your Xbox last time and needed a reset. **I would not repeat that** unless the web version
turns out to be unusable. I can't promise the same thing wouldn't happen; Developer Mode is an official Microsoft feature but
I can't test it on your console. If you ever decide to try:
* back up anything you care about first and make sure the console has all system updates;
* your Microsoft developer account is already authorised, so there is no fee or sign-up;
* the steps would be: Dev Mode Activation app > Dev Home > enable Device Portal > from your phone open `https://<xbox-ip>:11443` >
  upload the three files in `Dependencies/x64` first, then `High5.Xbox_0.1.0.0_x64.appx`.
* I haven't tested that install on a console. Tell me before you start and we'll go step by step.

---

## 5. What the live mode does, and what's next

You approved **read-only search and show pages**. That is what's built:
* It reads the same public config document the official Android app downloads at start-up, then asks the catalogue for searches,
  show details and episode lists. Plain GET requests, no login, no cookies, nothing written. The addresses come from that config at
  run time; the only address fixed in the code is where to find the config.
* A built-in check refuses any catalogue address that isn't on channel5.com, and search waits briefly between keystrokes so it doesn't
  hammer their servers.
* Parental lock: the catalogue only gives `G` / `G+` ratings on episodes and none on search results, so unknown ratings count as 18.
  (If you set a low limit, live search results will mostly be hidden. That is deliberate.)
* Things you should still know: this is a third party's service used without a partner agreement, so Channel 5 could change or block it,
  and their terms may not allow it. Keep it personal and low-volume.

**Not done, and each needs your separate go-ahead:**
1. **Images** (poster pictures from the catalogue's image service).
2. **Home rails and the TV guide** (more catalogue calls).
3. **Anything with your My5 account** (sign-in, My List sync, resume sync). That means acting as the official app on their servers.
4. **Video playback.** Needs licences and protected streams (PlayReady on Xbox). I will not remove DRM or get around the UK-only/VPN checks.
The legitimate alternative to all of this is asking Channel 5 about partner access.

---

## 6. Where everything is

| Path | What it is |
|---|---|
| `Martin Instructions.md` | This file |
| `web/` | **The web version** (static HTML/JS) - start here |
| `src/High5.Core`, `src/High5.Xbox` | The Xbox (UWP) version and its tested logic |
| `docs/analysis/my5-7.26.6.md` | What the reverse-engineering found |
| `.github/workflows/` | `ci.yml` builds + tests everything; `pages.yml` publishes the web version |

## 7. Checklist

- [ ] Pick a hosting option in 2a (or tell me which you prefer) - this is the next blocker
- [ ] Open the web version on your phone, then on the Xbox Edge, and send me what you see
- [ ] Decide what to do about section 5 (real data)
- [ ] Switch off the **link sharing** on the My5 APK file in your Google Drive (it could be opened without a login)
- [ ] Section 4 only if you ever want to - not needed
