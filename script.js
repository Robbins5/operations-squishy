/* ==========================================================================
   OPERATION SQUISHY — PHASE 1
   Secure terminal landing, initialization, authentication, agent profile,
   and project authorization. See CLAUDE.md for full architecture guidance.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   CONFIGURATION
   Single source of truth for everything a parent should be able to tune
   between missions. Nothing in this object is ever written to the DOM
   verbatim as sensitive data — clearanceCode is compared in memory only.
   -------------------------------------------------------------------------- */
const MISSION_CONFIG = {
  agentName: 'Jace',
  missionName: 'Operation Squishy',
  projectName: 'Project Independence',
  clearanceCode: '08052015', // 8-digit access code — compared in JS only, never rendered
  handlerNames: 'Mom & Dad',
  typingSpeed: 26,           // ms per typed character (before animationSpeed scaling)
  animationSpeed: 1,         // multiplier applied to all scripted delays (1 = normal speed)
  soundEnabled: true,        // master switch for the optional Web Audio beep system
};

/* --------------------------------------------------------------------------
   RUNTIME STATE
   -------------------------------------------------------------------------- */
const STORAGE_KEY = 'operationSquishy.phase1.progress';

const state = {
  authenticated: false,
  isAnimating: false,
  skipAnimations: false,
  soundOn: MISSION_CONFIG.soundEnabled,
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   DOM HELPERS
   -------------------------------------------------------------------------- */
function qs(id) {
  return document.getElementById(id);
}

function clearLines(container) {
  container.innerHTML = '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scaledDelay(ms) {
  return ms * MISSION_CONFIG.animationSpeed;
}

/* --------------------------------------------------------------------------
   PERSISTENCE (sessionStorage) — checkpoints Phase 1 progress so a reload
   or brief backgrounding of the iPad doesn't force a full restart.
   -------------------------------------------------------------------------- */
function saveProgress(screen, extra) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.assign({ screen, authenticated: state.authenticated }, extra || {}))
    );
  } catch (err) {
    /* sessionStorage unavailable (private browsing, etc.) — not mission-critical */
  }
}

function loadProgress() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function clearProgress() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
}

/* --------------------------------------------------------------------------
   AUDIO — optional Web Audio beep system. The AudioContext is only ever
   created/resumed from inside a real user gesture (button click), never
   on page load, so nothing autoplays.
   -------------------------------------------------------------------------- */
let audioCtx = null;

function getAudioContext() {
  if (!MISSION_CONFIG.soundEnabled || !state.soundOn) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function beep(options) {
  const opts = options || {};
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || 'sine';
  osc.frequency.value = opts.freq || 440;
  gain.gain.value = opts.volume != null ? opts.volume : 0.05;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + (opts.duration || 0.08));
}

const sounds = {
  key: () => beep({ freq: 720, duration: 0.03, volume: 0.03 }),
  tick: () => beep({ freq: 300, duration: 0.02, volume: 0.02 }),
  confirm: () => beep({ freq: 540, duration: 0.09, volume: 0.05 }),
  error: () => beep({ freq: 160, duration: 0.22, type: 'sawtooth', volume: 0.06 }),
  success: () => {
    beep({ freq: 660, duration: 0.09, volume: 0.05 });
    setTimeout(() => beep({ freq: 880, duration: 0.12, volume: 0.05 }), 110);
  },
};

/* --------------------------------------------------------------------------
   TYPEWRITER ENGINE
   lines: Array<string | { text, tone?: 'amber'|'red'|'dim', pauseAfter?: number }>
   Honors skip-animation mode and prefers-reduced-motion by rendering
   instantly instead of character-by-character.
   -------------------------------------------------------------------------- */
async function typeLines(container, lines, options) {
  const opts = options || {};
  const instant = state.skipAnimations || prefersReducedMotion || opts.instant;

  for (const raw of lines) {
    const line = typeof raw === 'string' ? { text: raw } : raw;
    const el = document.createElement('div');
    el.className = 'terminal-line' + (line.tone ? ` terminal-line--${line.tone}` : '');
    container.appendChild(el);

    if (instant) {
      el.textContent = line.text;
    } else {
      el.classList.add('terminal-line--typing');
      const charDelay = Math.max(4, MISSION_CONFIG.typingSpeed);
      for (let i = 0; i < line.text.length; i += 1) {
        el.textContent += line.text[i];
        // eslint-disable-next-line no-await-in-loop
        await sleep(scaledDelay(charDelay));
      }
      el.classList.remove('terminal-line--typing');
    }

    const pause = line.pauseAfter != null ? line.pauseAfter : 380;
    await sleep(instant ? 60 : scaledDelay(pause));
  }
}

/* --------------------------------------------------------------------------
   SCREEN / CONNECTION STATUS HELPERS
   -------------------------------------------------------------------------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== `screen-${id}`;
    el.classList.remove('screen--entering');
  });

  const active = qs(`screen-${id}`);
  if (!active) return;

  // restart the glitch-in entrance animation even if the class was already removed this tick
  void active.offsetWidth;
  active.classList.add('screen--entering');

  const heading = active.querySelector('h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function setConnectionStatus(online) {
  const statusEl = qs('connectionStatus');
  const textEl = qs('connectionStatusText');
  statusEl.dataset.state = online ? 'online' : 'offline';
  textEl.textContent = online ? 'SECURE LINE' : 'LINE OFFLINE';
}

/* --------------------------------------------------------------------------
   CONFIG -> DOM
   Populates every element tagged with data-config from MISSION_CONFIG so
   the visible mission/agent/project names always match the config object.
   -------------------------------------------------------------------------- */
function applyConfigToDom() {
  const values = {
    agentName: MISSION_CONFIG.agentName,
    missionName: MISSION_CONFIG.missionName,
    projectName: MISSION_CONFIG.projectName,
    handlerNames: MISSION_CONFIG.handlerNames,
  };
  document.querySelectorAll('[data-config]').forEach((el) => {
    const key = el.getAttribute('data-config');
    if (values[key] !== undefined) {
      el.textContent = String(values[key]).toUpperCase();
    }
  });
}

/* --------------------------------------------------------------------------
   ACTION LOCK — disables the primary action buttons while a sequence is
   running so a double-tap can't skip ahead of an in-progress animation.
   -------------------------------------------------------------------------- */
function setPrimaryButtonsDisabled(disabled) {
  ['btnEstablishConnection', 'btnVerifyCode', 'btnReviewAuthorization', 'btnAcknowledge'].forEach((id) => {
    const btn = qs(id);
    if (btn) btn.disabled = disabled;
  });
}

function withLock(fn) {
  return async (...args) => {
    if (state.isAnimating) return;
    state.isAnimating = true;
    setPrimaryButtonsDisabled(true);
    try {
      await fn(...args);
    } finally {
      state.isAnimating = false;
      setPrimaryButtonsDisabled(false);
    }
  };
}

/* --------------------------------------------------------------------------
   SCENE — INITIALIZATION SEQUENCE
   -------------------------------------------------------------------------- */
async function runInitSequence() {
  showScreen('init');
  setConnectionStatus(false);

  const linesEl = qs('initLines');
  const progressEl = qs('initProgress');
  const fillEl = qs('initProgressFill');
  clearLines(linesEl);
  progressEl.hidden = false;
  progressEl.setAttribute('aria-valuenow', '0');
  fillEl.style.width = '0%';

  const steps = [
    'INITIALIZING SECURE TERMINAL...',
    'ESTABLISHING ENCRYPTED CONNECTION...',
    'DEVICE DETECTED: APPLE iPAD',
    'SCANNING FOR UNAUTHORIZED CIVILIANS...',
    'CONTACTING HEADQUARTERS...',
    'SECURE CONNECTION ESTABLISHED.',
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const isFinal = i === steps.length - 1;
    // eslint-disable-next-line no-await-in-loop
    await typeLines(linesEl, [{ text: steps[i], tone: isFinal ? 'amber' : undefined, pauseAfter: isFinal ? 700 : 420 }]);
    const pct = Math.round(((i + 1) / steps.length) * 100);
    fillEl.style.width = `${pct}%`;
    progressEl.setAttribute('aria-valuenow', String(pct));
    sounds.tick();
  }

  setConnectionStatus(true);
  await sleep(state.skipAnimations || prefersReducedMotion ? 80 : scaledDelay(500));

  saveProgress('auth');
  await runAuthScreen(false);
}

/* --------------------------------------------------------------------------
   SCENE — CLEARANCE-CODE AUTHENTICATION
   -------------------------------------------------------------------------- */
async function runAuthScreen(resume) {
  showScreen('auth');

  const introEl = qs('authIntroLines');
  const feedbackEl = qs('authFeedback');
  const input = qs('clearanceInput');
  const btn = qs('btnVerifyCode');

  clearLines(introEl);
  clearLines(feedbackEl);

  if (!resume) {
    await typeLines(introEl, ['IDENTITY VERIFICATION REQUIRED']);
  }

  input.value = '';
  input.disabled = false;
  btn.disabled = false;
  input.focus();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.isAnimating) return;

  const input = qs('clearanceInput');
  const btn = qs('btnVerifyCode');
  const feedbackEl = qs('authFeedback');
  const code = input.value.trim();

  state.isAnimating = true;
  input.disabled = true;
  btn.disabled = true;
  clearLines(feedbackEl);

  if (code === MISSION_CONFIG.clearanceCode) {
    sounds.success();
    await typeLines(feedbackEl, [
      { text: 'DECRYPTING CREDENTIALS...', pauseAfter: 500 },
      { text: 'COMPARING PERSONNEL RECORDS...', pauseAfter: 500 },
      { text: 'IDENTITY MATCH LOCATED.', pauseAfter: 400 },
      { text: 'ACCESS GRANTED.', tone: 'amber', pauseAfter: 700 },
    ]);
    state.authenticated = true;
    state.isAnimating = false;
    saveProgress('profile');
    await runProfileScreen(false);
  } else {
    sounds.error();
    const screenEl = qs('screen-auth');
    screenEl.classList.add('screen--glitch');
    await typeLines(feedbackEl, [
      { text: 'ACCESS DENIED', tone: 'red', pauseAfter: 260 },
      { text: 'CLEARANCE CODE NOT RECOGNIZED', tone: 'red', pauseAfter: 260 },
      { text: 'VERIFY YOUR PERSONAL RECORDS AND TRY AGAIN.', tone: 'dim', pauseAfter: 260 },
    ]);
    screenEl.classList.remove('screen--glitch');
    input.value = '';
    input.disabled = false;
    btn.disabled = false;
    input.focus();
    state.isAnimating = false;
  }
}

/* --------------------------------------------------------------------------
   SCENE — AGENT IDENTIFICATION / PROFILE
   -------------------------------------------------------------------------- */
async function runProfileScreen(resume) {
  showScreen('profile');
  setConnectionStatus(true);

  const introEl = qs('profileIntroLines');
  const cardEl = qs('profileCard');
  clearLines(introEl);

  if (!resume) {
    await typeLines(introEl, [
      'RETRIEVING CLASSIFIED PERSONNEL FILE...',
      'PERSONNEL FILE LOCATED.',
      { text: `WELCOME, AGENT ${MISSION_CONFIG.agentName.toUpperCase()}.`, tone: 'amber', pauseAfter: 500 },
    ]);
  }

  cardEl.hidden = false;
}

/* --------------------------------------------------------------------------
   SCENE — PROJECT AUTHORIZATION
   -------------------------------------------------------------------------- */
async function runAuthorizationScreen(resume) {
  showScreen('authorization');

  const linesEl = qs('authorizationLines');
  const btn = qs('btnAcknowledge');
  clearLines(linesEl);
  btn.hidden = true;

  const agent = MISSION_CONFIG.agentName;
  await typeLines(
    linesEl,
    [
      { text: MISSION_CONFIG.projectName.toUpperCase(), tone: 'amber', pauseAfter: 600 },
      {
        text: `Following a comprehensive review, Headquarters has determined that Agent ${agent} is eligible for increased operational independence.`,
        pauseAfter: 500,
      },
      { text: 'One piece of classified field equipment has been approved for potential assignment.', pauseAfter: 500 },
      {
        text: `Before the equipment can be issued, Agent ${agent} must successfully complete an investigation and recovery mission.`,
        pauseAfter: 500,
      },
    ],
    { instant: resume }
  );

  btn.hidden = false;
  btn.disabled = false;
}

/* --------------------------------------------------------------------------
   SCENE — TEMPORARY END-OF-PHASE-1 SCREEN
   -------------------------------------------------------------------------- */
async function runPhaseEndScreen(resume) {
  showScreen('phase-end');

  const linesEl = qs('phaseEndLines');
  clearLines(linesEl);
  await typeLines(
    linesEl,
    [
      { text: 'PHASE ONE COMPLETE', tone: 'amber', pauseAfter: 500 },
      { text: 'CLASSIFIED CASE FILE AWAITING DEVELOPMENT', tone: 'dim' },
    ],
    { instant: resume }
  );
}

/* --------------------------------------------------------------------------
   DISCREET PARENT RESET — tap "LEVEL 11" five times within the window.
   -------------------------------------------------------------------------- */
let resetTapCount = 0;
let resetTapTimer = null;

function handleResetTap() {
  resetTapCount += 1;
  clearTimeout(resetTapTimer);
  resetTapTimer = setTimeout(() => {
    resetTapCount = 0;
  }, 2500);

  if (resetTapCount >= 5) {
    resetTapCount = 0;
    performParentReset();
  }
}

function performParentReset() {
  clearProgress();
  sounds.error();
  document.body.classList.add('screen--glitch');
  setTimeout(() => {
    window.location.reload();
  }, 380);
}

/* --------------------------------------------------------------------------
   SKIP / SOUND TOGGLES
   -------------------------------------------------------------------------- */
function handleSkipToggle() {
  state.skipAnimations = !state.skipAnimations;
  const btn = qs('btnSkip');
  btn.setAttribute('aria-pressed', String(state.skipAnimations));
  btn.textContent = state.skipAnimations ? 'ANIMATIONS SKIPPED' : 'SKIP ANIMATIONS (TEST)';
}

function handleSoundToggle() {
  state.soundOn = !state.soundOn;
  const btn = qs('btnSound');
  btn.setAttribute('aria-pressed', String(state.soundOn));
  qs('soundBtnLabel').textContent = state.soundOn ? 'SOUND ON' : 'SOUND OFF';
  if (state.soundOn) {
    getAudioContext();
    sounds.confirm();
  }
}

/* --------------------------------------------------------------------------
   WIRING
   -------------------------------------------------------------------------- */
function wireStaticListeners() {
  qs('btnEstablishConnection').addEventListener(
    'click',
    withLock(async () => {
      getAudioContext(); // unlock audio inside this user gesture
      sounds.confirm();
      await runInitSequence();
    })
  );

  qs('authForm').addEventListener('submit', handleAuthSubmit);

  qs('clearanceInput').addEventListener('input', (event) => {
    const cleaned = event.target.value.replace(/\D/g, '').slice(0, 8);
    if (cleaned !== event.target.value) event.target.value = cleaned;
    sounds.key();
  });

  qs('btnReviewAuthorization').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      saveProgress('authorization');
      await runAuthorizationScreen(false);
    })
  );

  qs('btnAcknowledge').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      saveProgress('phase-end');
      await runPhaseEndScreen(false);
    })
  );

  qs('parentResetTarget').addEventListener('click', handleResetTap);

  qs('btnSkip').addEventListener('click', handleSkipToggle);
  qs('btnSound').addEventListener('click', handleSoundToggle);
}

/* --------------------------------------------------------------------------
   BOOT — restore Phase 1 progress from sessionStorage when available.
   -------------------------------------------------------------------------- */
function boot() {
  applyConfigToDom();
  wireStaticListeners();

  const saved = loadProgress();
  if (!saved || !saved.screen || saved.screen === 'landing') {
    showScreen('landing');
    setConnectionStatus(false);
    return;
  }

  state.authenticated = Boolean(saved.authenticated);

  switch (saved.screen) {
    case 'auth':
      setConnectionStatus(true);
      runAuthScreen(true);
      break;
    case 'profile':
      runProfileScreen(true);
      break;
    case 'authorization':
      setConnectionStatus(true);
      runAuthorizationScreen(true);
      break;
    case 'phase-end':
      setConnectionStatus(true);
      runPhaseEndScreen(true);
      break;
    default:
      showScreen('landing');
      setConnectionStatus(false);
  }
}

document.addEventListener('DOMContentLoaded', boot);
