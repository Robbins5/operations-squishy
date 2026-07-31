# assets/

Reserved for binary assets referenced by the mission experience: audio clips,
images, and fonts. Empty in Phase 1 — the Phase 1 beep system is generated
entirely with the Web Audio API and needs no files here.

Suggested subfolders as later phases add assets:

- `assets/audio/` — sound effects and ambient loops (Phase 5)
- `assets/images/` — dossier imagery, evidence photos (Phase 3–4)
- `assets/fonts/` — custom typefaces, if the system monospace stack isn't enough

Reference everything with relative paths (e.g. `./assets/audio/beep.mp3`) so
the site keeps working under a GitHub Pages project subpath.
