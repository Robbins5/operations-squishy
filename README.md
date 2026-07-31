# operations-squishy

Project Independence — Classified Birthday Mission

**Operation Squishy** is a premium, cinematic, interactive "classified terminal"
experience delivered by scanning a QR code on an iPad. It is not a slideshow —
every screen requires an in-fiction interaction (authenticate, decrypt,
investigate) before the mission advances. Full vision, architecture
philosophy, and coding standards live in [`CLAUDE.md`](./CLAUDE.md).

## Current development phase

**Phase 1 — Project architecture and foundation.** Implemented so far:

1. Secure terminal landing screen
2. Initialization sequence (typed status lines + fake progress bar)
3. Clearance-code authentication
4. Agent identification
5. Agent profile and Project Independence authorization
6. Temporary end-of-Phase-1 screen ("classified case file awaiting development")

Not yet built: the equipment investigation, the equipment-guessing mechanic,
the physical scavenger hunt, and the final phone reveal. See `CLAUDE.md` →
Milestone Plan for Phases 2–5.

## File structure

```
index.html          # Markup for all Phase 1 screens (single-page terminal shell)
styles.css           # Design tokens + cinematic terminal styling
script.js            # Config, state machine, typewriter engine, audio, scene logic
assets/              # Reserved for audio/image/font assets (empty until later phases)
CLAUDE.md            # Governing architecture/vision doc for all future work
README.md            # This file
```

## Parent configuration

All parent-tunable values live in **one config object at the top of
`script.js`** (`MISSION_CONFIG`):

- `agentName`, `missionName`, `projectName`, `handlerNames`
- `clearanceCode` — the 8-digit code required at the authentication screen.
  It is only ever compared in JavaScript and is never rendered anywhere in
  the page.
- `typingSpeed` — ms per typed character
- `animationSpeed` — multiplier applied to all scripted pauses
- `soundEnabled` — master switch for the optional Web Audio beep system

Edit the values in that object directly; every screen reads from it (via
`data-config` attributes in the HTML, or directly in `script.js`) so nothing
needs to be changed in more than one place.

## Running locally

This is a static site with no build step, but native ES-module-style
`<script>` loading and `fetch`-based behavior generally require serving over
HTTP rather than opening `index.html` directly via `file://`. From the repo
root, run either:

```
npx serve .
```

or

```
python -m http.server
```

then open the printed `localhost` URL in a browser. For the closest preview
to the real experience, open dev tools' device toolbar and simulate an iPad
in both portrait and landscape.

## Publishing via GitHub Pages

1. Push this repository to GitHub (if not already).
2. In the repo's **Settings → Pages**, set the source to the branch you
   deploy from (e.g. `main`) and the root (`/`) folder.
3. GitHub Pages will publish at `https://<username>.github.io/<repo>/`. All
   asset/script references in this project use relative paths, so it works
   correctly whether it's served from a domain root or a project subpath.
4. Generate a QR code pointing at the published URL for the birthday card.

## Testing checklist

- [ ] Landing screen shows mission/project text and the **ESTABLISH SECURE
      CONNECTION** button; no clearance code is visible anywhere in the DOM
      or rendered page.
- [ ] Tapping **ESTABLISH SECURE CONNECTION** runs the full initialization
      sequence (typed lines + progress bar) and lands on the authentication
      screen.
- [ ] Entering an incorrect 8-digit code shows **ACCESS DENIED** and allows
      unlimited retries without losing the ability to submit again.
- [ ] Entering the correct code (`08052015` by default) plays the
      decrypt/match/access-granted sequence, then transitions to the agent
      profile screen.
- [ ] The agent profile screen shows the full dossier and a **REVIEW PROJECT
      AUTHORIZATION** button.
- [ ] Tapping that button reveals the Project Independence authorization text
      and an **ACKNOWLEDGE BRIEFING** button.
- [ ] Acknowledging shows the temporary **PHASE ONE COMPLETE** screen.
- [ ] Reloading the page mid-mission resumes from the last completed screen
      instead of restarting (via `sessionStorage`); closing the tab and
      reopening starts fresh.
- [ ] Tapping "LEVEL 11" on the agent profile five times in quick succession
      triggers the discreet parent reset (clears progress, reloads to the
      landing screen).
- [ ] **SKIP ANIMATIONS (TEST)** in the footer makes all typed sequences
      render instantly, for fast iteration while developing.
- [ ] With OS-level "reduce motion" enabled, typing/progress/flicker/glitch
      effects are minimized or removed automatically.
- [ ] All primary action buttons are disabled while their sequence is
      animating, and double-tapping a button never skips or repeats a step.
- [ ] Full keyboard navigation works: every control is reachable via Tab,
      has a visible focus state, and the auth form can be submitted with
      Enter.
- [ ] No sound plays before the first user interaction; the **SOUND ON/OFF**
      toggle in the footer mutes/unmutes the beep system.
- [ ] Layout is touch-friendly and legible in both portrait and landscape at
      iPad viewport sizes.
