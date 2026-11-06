# High5 web app (no Dev Mode needed)

A plain HTML/JS version of the app that runs in the **Xbox's built-in Microsoft Edge** - nothing to install on the console
and no Developer Mode. It has the same screens and behaviour as the UWP app (home rails + Continue watching, show detail,
search, My List, TV guide, parental PIN/rating limit, device-code sign-in screen, player with resume).

* No build step: it is static files (`index.html`, `css/`, `js/`).
* `js/core.js` = logic (unit tested: `npm test`), `js/ui.js` = screens, D-pad/gamepad navigation and the player.
* Data is mock/demo today. Real My5 data needs the values described in `Martin Instructions.md`, section 5.
* Navigation: D-pad / left stick / arrow keys move focus (spatial navigation), A / Enter selects, B / Esc goes back.

Run locally: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.
Smoke test (needs Playwright + Chromium): `node tests/e2e.mjs`.

Not verified on a real Xbox yet. Protected (PlayReady) streams are not implemented in the web app.
