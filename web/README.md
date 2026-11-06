# High5 web app (no Dev Mode needed)

A plain HTML/JS version of the app that runs in the **Xbox's built-in Microsoft Edge** - nothing to install on the console
and no Developer Mode. It has the same screens and behaviour as the UWP app (home rails + Continue watching, show detail,
search, My List, TV guide, parental PIN/rating limit, device-code sign-in screen, player with resume).

* No build step: it is static files (`index.html`, `css/`, `js/`).
* `js/core.js` = logic (unit tested: `npm test`), `js/ui.js` = screens, D-pad/gamepad navigation and the player.
* **Channels** (top bar, or `#/channels`): every channel uses the same screens and styling; a channel only supplies data. Built in: **Channel 5** (live, read-only), **ITVX** (beta, search only), **Demo** (invented, offline). Adding one is documented in `.claude/skills/read-apk-from-drive/references/channel-adapter.md`.
* **Channel 5 and Demo in more detail** (this was the original data-source switch): **Live catalogue (read-only)** - real search and show pages, no account, GET requests only;
  and **Demo data** - invented shows, fully offline. Live is the default; the preview artifact uses demo because its sandbox blocks other hosts.
* Live mode shows poster images (from the catalogue's image host) but does **not** include: browse rails, TV guide, sign-in, server-side My List/resume, or playback.
* Navigation: D-pad / left stick / arrow keys move focus (spatial navigation), A / Enter selects, B / Esc goes back.

Run locally: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.
Smoke tests (need Playwright + Chromium): `node tests/e2e.mjs` (demo data, offline) and `node tests/channels-e2e.mjs` (channel switching and ITVX UI; the network is stubbed inside the browser).
`node tests/live-smoke.mjs [query]` is an opt-in check of the live catalogue and makes a few real requests - run it sparingly.

Not verified on a real Xbox yet. Protected (PlayReady) streams are not implemented in the web app.
The live catalogue belongs to a third party: personal use only, keep request volume low (search is debounced).
