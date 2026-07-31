# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Current state: pre-scaffold.** This repo currently contains only `README.md` and this file — no HTML/CSS/JS exists yet. Do not assume any file structure, config file, or module exists until you've verified it with a file listing. This document defines the target architecture and standards that all future code in this repo must follow, starting from Phase 1 (see Milestone Plan below).

## What This Project Is

**Operation Squishy** (codename: **Project Independence**) is a premium, cinematic, interactive web experience built as a birthday gift for a real child, **Agent Jace**, turning 11. It is delivered by scanning a QR code (printed in a birthday card) on an iPad.

This is **not a website in the traditional sense** — it is a single-page, story-driven "classified terminal" simulation. The user should feel like they've accidentally connected to a real government system, not like they're reading a webpage. There are no "pages" and no "Next" buttons — every screen demands an interaction (authenticate, decrypt, investigate, guess, confirm) before the mission advances.

### The story

Headquarters has determined Agent Jace has earned a higher level of independence. As part of "Project Independence," HQ has authorized one new piece of classified field equipment — **a cell phone** — but the experience must never say this outright. It's revealed only through investigation. The flow is:

1. Authenticate into Headquarters
2. Access classified mission files
3. Investigate evidence
4. Correctly identify the classified equipment (without being told)
5. Complete a physical scavenger hunt
6. Recover the hidden equipment (the actual phone, hidden in the real world)

### Tone

Treat Agent Jace seriously — this is not a kids' cartoon. Inspiration: Mission Impossible, CIA/classified terminal UIs, S.H.I.E.L.D., escape rooms, AAA game HUDs, secure military systems. Humor comes from subtle in-family jokes embedded in mission text, never from cartoonish UI. Every screen should leave the user wondering "what happens next?"

## Architecture Philosophy

The whole experience is one continuous "terminal session" — a **scene-driven state machine**, not a multi-page site.

- **Mission Controller (core):** a single central controller owns "what screen/scene is active" and the ordered list of mission steps. Screens never navigate each other directly — they request a transition from the controller (e.g. `missionController.completeStep('auth')`), which decides what comes next. This keeps the mission sequence defined in one place instead of scattered across screens.
- **Scenes/screens as isolated modules:** each screen (auth terminal, file browser, evidence viewer, equipment guess, scavenger hunt clue, recovery confirmation) is its own ES module exposing a consistent mount/unmount-style interface, and knows nothing about other screens.
- **Config is data, logic is code:** all parent-customizable values (see Parent Customization below) live in one dedicated config module, imported by the controller and screens — never hardcoded inline in screen logic.
- **Persistence:** progress should be checkpointed (e.g. `localStorage`) keyed to the mission, so backgrounding the iPad or an accidental reload doesn't force a restart from zero. Treat this as a required Phase 1 concern, not a nice-to-have — this is a real physical event with a real kid holding a real iPad.
- **No frameworks, no build step.** Plain HTML/CSS/vanilla JS using native ES modules (`<script type="module">`, `import`/`export`). Because native ES modules don't load over `file://`, local development requires serving the directory over HTTP (see Commands below).
- **Relative paths only**, everywhere (imports, asset URLs, links) — this ships on GitHub Pages, which may serve from a project subpath (`username.github.io/operations-squishy/`), so root-absolute paths (`/js/main.js`) will break.

### Suggested structure (create as Phase 1 scaffolding lands)

```
index.html                   # entry point, boots the mission
config/
  mission.config.js          # single source of truth for all parent-customizable values
css/
  tokens.css                 # design tokens: color, type scale, spacing, motion timing
  base.css                   # reset + global element styles
  components/                # reusable UI (terminal frame, buttons, HUD, scanlines)
  screens/                   # per-screen styles
js/
  core/                      # mission controller, state machine, persistence, event bus
  screens/                   # one module per screen/scene
  components/                # reusable interactive widgets (typewriter, decrypt fx, glitch)
  audio/                     # sound manager (respects reduced-motion/mute prefs)
  main.js                    # entry point — wires config + controller + first screen
assets/
  audio/
  images/
  fonts/
```

Don't build this all at once — follow the Milestone Plan phases below.

## Parent Customization

All of the following must live in **one clearly documented config module** (`config/mission.config.js` or equivalent) — not scattered as magic strings through screen code:

- Agent name, mission name, project name
- Authentication code
- Handler name(s)
- Physical scavenger hunt clues (ordered list)
- Final hiding location / recovery confirmation text
- Typing speed, animation speed
- Sound effects (on/off, volume, individual clip references)

Every field should have an inline comment explaining what it controls and its expected format/type, since a non-developer parent may edit this file directly next year for a different occasion.

## UX & Interaction Principles

- Never a plain "Next" button. Every transition is framed as an in-fiction action: authenticate, decrypt, scan, unlock, accept objective, confirm recovery, etc.
- Information is **revealed through interaction**, not printed as static prose — the user should feel like they're extracting classified data, not reading a story.
- Every screen should build anticipation toward "what happens next."
- Mobile-first, tuned specifically for iPad (touch-friendly targets, no hover-dependent interactions), responsive beyond that, fast, minimal load time.

## Animation Philosophy

Animation must serve the storytelling, not decorate it. Use purposefully: typewriter text with blinking cursor, loading/decryption bars, screen glitches, scanlines, flickering terminal, holographic UI accents, animated mission-status updates, classified-file transition effects. Timing (typing speed, animation speed) is parent-configurable via the config module, not hardcoded per-screen.

## Accessibility

Non-negotiable, not a Phase 5 afterthought bolted on later — but polish/testing of it is scheduled for Phase 5:

- Full keyboard navigation for every interactive element
- Honor `prefers-reduced-motion` — glitch/scanline/flicker effects need a reduced-motion fallback that still conveys state changes
- Sufficient contrast even within the dark cinematic theme
- Real semantic HTML (buttons are `<button>`, etc.) — don't fake interactivity with styled `<div>`s
- Visible focus states styled to match the terminal aesthetic (don't strip `outline` without replacing it)
- Readable typography at the sizes actually used on an iPad screen

## Coding Standards

- Vanilla JS, ES modules, no bundler/framework/dependency manager. Don't introduce npm, webpack, React, etc. — if a task seems to need one, flag it instead of silently adding it.
- Keep the mission sequence/state logic in `core/`, presentation in `screens/` and `components/`, and tunable values in `config/` — don't let screens read/write mission state directly, go through the controller.
- CSS: design tokens (color, spacing, type scale, motion durations) as CSS custom properties in one place, reused everywhere — no ad hoc hex colors or magic timing numbers inside component/screen stylesheets.
- No inline styles, no inline `onclick=` handlers — wire events in JS via `addEventListener`, use `data-*` attributes as JS hooks when needed.
- Comment the *why* (especially in the config file, and around any non-obvious timing/animation-sequencing logic), not the *what*.

## Commands

No build step exists or is planned (no framework, no bundler). Because native ES module imports are blocked over `file://`, always develop against a local static server, e.g. from the repo root:

```
npx serve .
# or
python -m http.server
```

Then open the served `localhost` URL (not the file directly) in a browser/iPad simulator. Deployment is simply pushing to the branch GitHub Pages serves — there is no separate build/publish step to run.

There is no test suite defined for this project (a vanilla, no-framework, event-driven UI). Verify changes by running the mission flow end-to-end in a browser at iPad viewport size after each change.

## Milestone Plan

Work in phases; don't jump ahead of the current phase without checking with the user.

1. **Phase 1 — Project architecture and foundation.** Scaffold the structure above: config module, design tokens, mission controller/state machine, persistence, entry point, base terminal shell.
2. **Phase 2 — Terminal experience and authentication.** Boot sequence, auth screen/code entry, first "connected to HQ" moment.
3. **Phase 3 — Mission flow and clue investigation.** File browser/evidence screens, the investigation sequence that builds toward identifying the equipment.
4. **Phase 4 — Equipment identification and scavenger hunt.** The guess mechanic, transition into the physical scavenger hunt clue sequence, recovery confirmation screen.
5. **Phase 5 — Animations, sounds, polish, accessibility, and cinematic effects.** Sound design, glitch/scanline/decrypt polish, reduced-motion fallbacks, full accessibility pass, performance/load-time pass.
