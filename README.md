# high5

An unofficial Xbox (UWP/WinUI) client modelled on the My5 (Channel 5) Android app.

Status: **analysis phase**. See `docs/analysis/my5-7.26.6.md` for what has been
learned about the reference app, and `scripts/analyse-apk.sh` for how to reproduce it.

Ground rules
- No original app binaries or assets are committed (see `.gitignore`).
- Users sign in with their own My5 account; no credentials are stored in this repo.
- No DRM circumvention and no geo-restriction bypass.
