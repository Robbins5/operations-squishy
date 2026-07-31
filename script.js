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
  typingSpeed: 42,           // ms per typed character (before animationSpeed scaling) — tuned for a younger/less confident reader
  animationSpeed: 1,         // multiplier applied to all scripted delays (1 = normal speed)
  soundEnabled: true,        // master switch for the optional Web Audio beep system
  defaultLinePauseMs: 900,   // minimum pause after any typed line with no explicit pauseAfter
  longLinePauseMs: 2200,     // minimum pause after any typed line longer than longLineCharThreshold
  longLineCharThreshold: 90, // character count above which longLinePauseMs applies
};

/* --------------------------------------------------------------------------
   PHYSICAL RECOVERY — ZONE DELAY
   Gives the player time to walk into the recovery area before Headquarters
   "detects" the equipment and begins the signal acquisition sequence.
   -------------------------------------------------------------------------- */
const RECOVERY_ZONE_DELAY_MS = 20000;

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

const investigationState = {
  briefIndex: 1, // 1-based index of the most recently decrypted intelligence brief
};

const recoveryState = {
  stage: 'directive-1', // 'directive-1' | 'directive-2' | 'directive-3' | 'signal'
};

const clearanceReviewState = {
  selectedItems: [], // values of currently-checked checklist items
  submitted: false,  // whether SUBMIT EVALUATION has been pressed
  approved: false,   // whether the evaluation sequence has fully completed
};

const INTELLIGENCE_BRIEFS = [
  'Its usefulness depends less on its physical size than on the systems and information it can access.',
  'This equipment is commonly issued when an agent begins operating with greater independence.',
  'It will recognize its assigned agent through facial recognition before granting access.',
  'This equipment continuously reports its location, allowing Headquarters to assist its assigned agent if needed.',
  'It serves several purposes, although communication with Headquarters is among the most important.',
  'It can securely store photographs, messages, schedules, entertainment, and intelligence.',
];

const RECOVERY_DIRECTIVE_1 = [
  { text: 'HEADQUARTERS', tone: 'amber', pauseAfter: 400 },
  { text: 'Our records indicate the equipment never left your residence.', pauseAfter: 500 },
  { text: 'Begin by searching the area where the agent gets dressed each day.', pauseAfter: 500 },
  { text: 'Report back if the equipment cannot be located.', pauseAfter: 600 },
];

const RECOVERY_DIRECTIVE_2 = [
  { text: 'HEADQUARTERS', tone: 'amber', pauseAfter: 400 },
  { text: 'Negative.', tone: 'red', pauseAfter: 400 },
  {
    text: 'A secondary review of surveillance indicates the equipment was relocated after initial placement.',
    pauseAfter: 500,
  },
  {
    text: 'The most recent activity suggests movement toward the primary operations area where agents eat.',
    pauseAfter: 500,
  },
  { text: 'Continue your search.', pauseAfter: 600 },
];

const RECOVERY_DIRECTIVE_3 = [
  { text: 'HEADQUARTERS', tone: 'amber', pauseAfter: 400 },
  { text: 'No visual confirmation.', tone: 'red', pauseAfter: 400 },
  { text: 'Stand by...', tone: 'dim', pauseAfter: 500 },
  { text: 'Reviewing additional data...', tone: 'dim', pauseAfter: 500 },
  {
    text: 'Recent movement indicates the equipment was handled near an area used for watching TV.',
    pauseAfter: 600,
  },
];

const RECOVERY_SAFETY_MESSAGE = [
  { text: 'HEADQUARTERS', tone: 'amber', pauseAfter: 400 },
  { text: 'Unexpected result.', tone: 'red', pauseAfter: 400 },
  { text: 'Headquarters expected the equipment to be located elsewhere.', pauseAfter: 500 },
  { text: 'Continue your search.', pauseAfter: 600 },
];

const ACCEPTED_EQUIPMENT_ANSWERS = new Set(['phone', 'cell phone', 'cellphone', 'mobile phone', 'smartphone', 'iphone']);

const EQUIPMENT_WRONG_MESSAGES = [
  'THE AVAILABLE INTELLIGENCE DOES NOT SUPPORT THAT CONCLUSION.',
  'EQUIPMENT IDENTIFICATION INCORRECT.',
  'HEADQUARTERS RECOMMENDS REVIEWING THE AVAILABLE INTELLIGENCE.',
  'THE CLASSIFIED EQUIPMENT HAS NOT YET BEEN IDENTIFIED.',
];

let wrongEquipmentGuessCount = 0;

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
function resolveLinePause(line) {
  const explicitOrDefault = line.pauseAfter != null ? line.pauseAfter : MISSION_CONFIG.defaultLinePauseMs;
  const minimumRequired =
    line.text.length > MISSION_CONFIG.longLineCharThreshold
      ? MISSION_CONFIG.longLinePauseMs
      : MISSION_CONFIG.defaultLinePauseMs;
  // Never let an explicitly-authored pause undercut the reading-time floor,
  // but always preserve one that's already longer than that floor.
  return Math.max(explicitOrDefault, minimumRequired);
}

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

    const pause = resolveLinePause(line);
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
  [
    'btnEstablishConnection',
    'btnVerifyCode',
    'btnReviewAuthorization',
    'btnAcknowledge',
    'btnBeginInvestigation',
    'btnRequestIntel',
    'btnTransmitId',
    'btnAcceptRecovery',
    'btnEquipmentLocated',
    'btnEquipmentNotLocated',
    'btnEquipmentRecovered',
    'btnViewAssignment',
  ].forEach((id) => {
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
   SCENE — LEVEL 11 CLEARANCE REVIEW
   -------------------------------------------------------------------------- */
async function runClearanceReviewScreen(resume) {
  showScreen('clearance-review');
  setConnectionStatus(true);

  const introEl = qs('clearanceIntroLines');
  const formEl = qs('clearanceForm');
  const resultEl = qs('clearanceResultLines');
  const stampEl = qs('clearanceApprovedStamp');
  const viewBtn = qs('btnViewAssignment');

  clearLines(introEl);
  clearLines(resultEl);
  stampEl.hidden = true;
  viewBtn.hidden = true;
  formEl.hidden = true;
  formEl.classList.remove('is-disabled');

  await typeLines(
    introEl,
    [
      { text: 'LEVEL 11 CLEARANCE REVIEW', tone: 'amber', pauseAfter: 500 },
      { text: 'AGENT READINESS EVALUATION', tone: 'dim', pauseAfter: 300 },
      { text: 'Headquarters requires confirmation of the following operational capabilities.', pauseAfter: 600 },
    ],
    { instant: resume }
  );

  if (clearanceReviewState.submitted) {
    // Already submitted (e.g. after a refresh) — show the approved result
    // instantly instead of replaying the full evaluation sequence.
    await runClearanceEvaluationSequence(true);
    return;
  }

  formEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = clearanceReviewState.selectedItems.includes(input.value);
    input.disabled = false;
  });
  qs('btnSubmitEvaluation').disabled = false;

  formEl.hidden = false;
}

async function runClearanceEvaluationSequence(instant) {
  const formEl = qs('clearanceForm');
  const resultEl = qs('clearanceResultLines');
  const stampEl = qs('clearanceApprovedStamp');
  const viewBtn = qs('btnViewAssignment');

  formEl.hidden = true;
  clearLines(resultEl);
  stampEl.hidden = true;
  viewBtn.hidden = true;

  await typeLines(
    resultEl,
    [
      { text: 'PROCESSING EVALUATION...', pauseAfter: 500 },
      { text: 'VERIFYING OPERATIONAL READINESS...', pauseAfter: 500 },
      { text: 'REVIEWING PERSONNEL RECORD...', pauseAfter: 500 },
      { text: 'CLEARANCE BOARD DECISION...', pauseAfter: 1100 },
    ],
    { instant }
  );

  await typeLines(
    resultEl,
    [
      { text: 'RESPONSIBILITY REVIEW', tone: 'amber', pauseAfter: 300 },
      { text: 'COMPLETE', tone: 'amber', pauseAfter: 400 },
      { text: 'RESULT:', tone: 'dim', pauseAfter: 200 },
      { text: 'PASS', tone: 'amber', pauseAfter: 700 },
    ],
    { instant }
  );

  if (!instant) sounds.success();

  await typeLines(
    resultEl,
    [
      { text: 'LEVEL 11 CLEARANCE', tone: 'amber', pauseAfter: 300 },
      { text: 'AUTHORIZED', tone: 'amber', pauseAfter: 400 },
      { text: 'STATUS:', tone: 'dim', pauseAfter: 200 },
      { text: 'MISSION READY', tone: 'amber', pauseAfter: 600 },
    ],
    { instant }
  );

  stampEl.hidden = false;

  const agent = MISSION_CONFIG.agentName;
  await typeLines(
    resultEl,
    [
      { text: `Welcome, Agent ${agent}.`, pauseAfter: 600 },
      {
        text: `Headquarters has determined that you have demonstrated the responsibility required to begin ${MISSION_CONFIG.projectName}.`,
        pauseAfter: 600,
      },
      { text: 'Your first official assignment is now available.', pauseAfter: 600 },
    ],
    { instant }
  );

  clearanceReviewState.approved = true;
  saveProgress('clearance-review', {
    started: true,
    selectedItems: clearanceReviewState.selectedItems,
    submitted: true,
    approved: true,
  });

  viewBtn.hidden = false;
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
   SCENE — CASE FILE (investigation briefing)
   -------------------------------------------------------------------------- */
async function runCaseFileScreen(resume) {
  showScreen('case-file');

  const linesEl = qs('caseFileLines');
  const btn = qs('btnBeginInvestigation');
  clearLines(linesEl);
  btn.hidden = true;

  await typeLines(
    linesEl,
    [
      { text: 'CASE FILE 011', tone: 'amber', pauseAfter: 500 },
      { text: MISSION_CONFIG.missionName.toUpperCase(), pauseAfter: 500 },
      { text: 'OBJECTIVE:', tone: 'dim', pauseAfter: 200 },
      { text: 'IDENTIFY THE CLASSIFIED FIELD EQUIPMENT AUTHORIZED FOR ASSIGNMENT.', pauseAfter: 500 },
      { text: 'INTELLIGENCE BRIEFS AVAILABLE:', tone: 'dim', pauseAfter: 200 },
      { text: '6', pauseAfter: 500 },
      { text: 'STATUS:', tone: 'dim', pauseAfter: 200 },
      { text: 'CLASSIFIED', tone: 'amber', pauseAfter: 700 },
    ],
    { instant: resume }
  );

  btn.hidden = false;
}

/* --------------------------------------------------------------------------
   SCENE — INVESTIGATION (intelligence briefs + equipment identification)
   -------------------------------------------------------------------------- */
async function renderCurrentBrief(instant) {
  const progressLinesEl = qs('briefProgressLines');
  const progressEl = qs('briefProgress');
  const fillEl = qs('briefProgressFill');
  const linesEl = qs('briefLines');
  const actionsEl = qs('briefActions');
  const requestBtn = qs('btnRequestIntel');

  const index = investigationState.briefIndex;

  clearLines(progressLinesEl);
  clearLines(linesEl);
  actionsEl.hidden = true;

  progressEl.hidden = false;
  progressEl.setAttribute('aria-valuenow', String(index));
  fillEl.style.width = `${Math.round((index / INTELLIGENCE_BRIEFS.length) * 100)}%`;

  await typeLines(
    progressLinesEl,
    [
      { text: 'INTELLIGENCE BRIEFS DECRYPTED', tone: 'dim', pauseAfter: 150 },
      { text: `${index} / ${INTELLIGENCE_BRIEFS.length}`, tone: 'amber', pauseAfter: 400 },
    ],
    { instant }
  );

  const briefBlock = [
    { text: `BRIEF 0${index}`, tone: 'amber', pauseAfter: 300 },
    { text: INTELLIGENCE_BRIEFS[index - 1], pauseAfter: 500 },
  ];
  if (index >= INTELLIGENCE_BRIEFS.length) {
    briefBlock.push(
      { text: 'FINAL INTELLIGENCE REPORT', tone: 'amber', pauseAfter: 400 },
      { text: 'THIS DEVICE MAY RING, BUT IT IS NOT A BELL.', pauseAfter: 500 }
    );
  }
  if (index === 1) {
    briefBlock.push(
      { text: 'HEADQUARTERS DIRECTIVE', tone: 'amber', pauseAfter: 400 },
      { text: 'Agent Jace,', pauseAfter: 400 },
      {
        text: 'Based on the available intelligence, determine whether sufficient evidence exists to identify the classified field equipment.',
        pauseAfter: 450,
      },
      { text: 'If additional information is required, unlock the next intelligence brief.', pauseAfter: 450 },
      { text: 'If you believe the equipment has been identified, submit your response to Headquarters.', pauseAfter: 600 }
    );
  }
  await typeLines(linesEl, briefBlock, { instant });

  requestBtn.hidden = index >= INTELLIGENCE_BRIEFS.length;
  actionsEl.hidden = false;
}

async function runInvestigationScene(resume) {
  showScreen('investigation');

  qs('identifyForm').hidden = true;
  qs('identifyInput').value = '';
  clearLines(qs('identifyIntroLines'));
  clearLines(qs('identifyFeedback'));

  await renderCurrentBrief(resume);
}

function normalizeEquipmentGuess(raw) {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.replace(/^(a|an|the)\s+/, '');
}

async function handleIdentifySubmit(event) {
  event.preventDefault();
  if (state.isAnimating) return;

  const input = qs('identifyInput');
  const btn = qs('btnSubmitIdentification');
  const feedback = qs('identifyFeedback');
  const guess = normalizeEquipmentGuess(input.value);
  const isCorrect = ACCEPTED_EQUIPMENT_ANSWERS.has(guess);

  state.isAnimating = true;
  input.disabled = true;
  btn.disabled = true;
  clearLines(feedback);

  sounds.confirm();
  await typeLines(feedback, [
    { text: 'TRANSMITTING RESPONSE...', pauseAfter: 450 },
    { text: 'ESTABLISHING SECURE LINK...', pauseAfter: 450 },
    { text: 'HEADQUARTERS REVIEWING SUBMISSION...', pauseAfter: 800 },
  ]);

  if (isCorrect) {
    sounds.success();
    await typeLines(feedback, [
      { text: 'ANALYZING IDENTIFICATION...', pauseAfter: 500 },
      { text: 'COMPARING EQUIPMENT SPECIFICATIONS...', pauseAfter: 500 },
      { text: 'IDENTIFICATION CONFIRMED.', tone: 'amber', pauseAfter: 700 },
    ]);
    state.isAnimating = false;
    saveProgress('equipment', { briefIndex: investigationState.briefIndex });
    runEquipmentScene();
  } else {
    sounds.error();
    const message = EQUIPMENT_WRONG_MESSAGES[wrongEquipmentGuessCount % EQUIPMENT_WRONG_MESSAGES.length];
    wrongEquipmentGuessCount += 1;
    await typeLines(feedback, [{ text: message, tone: 'red' }]);
    input.value = '';
    input.disabled = false;
    btn.disabled = false;
    input.focus();
    state.isAnimating = false;
  }
}

/* --------------------------------------------------------------------------
   SCENE — EQUIPMENT IDENTIFICATION CONFIRMED
   -------------------------------------------------------------------------- */
function runEquipmentScene() {
  showScreen('equipment');
  qs('equipmentCard').hidden = false;
}

/* --------------------------------------------------------------------------
   SCENE — PHYSICAL RECOVERY MISSION
   Three Headquarters directives (each choosing EQUIPMENT LOCATED / EQUIPMENT
   NOT LOCATED) followed by an automatic, timed signal acquisition sequence.
   Kept modular: one small render function per stage, dispatched by
   recoveryState.stage so each directive's behavior stays independent.
   -------------------------------------------------------------------------- */
async function runRecoveryDirective1(instant) {
  const linesEl = qs('recoveryPendingLines');
  const actionsEl = qs('recoveryActions');
  qs('btnEquipmentRecovered').hidden = true;

  clearLines(linesEl);
  actionsEl.hidden = true;
  await typeLines(linesEl, RECOVERY_DIRECTIVE_1, { instant });
  actionsEl.hidden = false;
}

async function runRecoveryDirective2(instant) {
  const linesEl = qs('recoveryPendingLines');
  const actionsEl = qs('recoveryActions');
  qs('btnEquipmentRecovered').hidden = true;

  clearLines(linesEl);
  actionsEl.hidden = true;
  await typeLines(linesEl, RECOVERY_DIRECTIVE_2, { instant });
  actionsEl.hidden = false;
}

async function runRecoveryDirective3(instant) {
  const linesEl = qs('recoveryPendingLines');
  const actionsEl = qs('recoveryActions');
  actionsEl.hidden = true;
  qs('btnEquipmentRecovered').hidden = true;

  clearLines(linesEl);
  await typeLines(linesEl, RECOVERY_DIRECTIVE_3, { instant });

  // No buttons here — Headquarters silently begins the signal acquisition
  // sequence after RECOVERY_ZONE_DELAY_MS. This real-world wait is
  // intentionally independent of the typing/instant-resume state above,
  // since its purpose is real-world walking time, not UI pacing.
  await sleep(state.skipAnimations ? 600 : RECOVERY_ZONE_DELAY_MS);

  recoveryState.stage = 'signal';
  saveProgress('recovery-pending', {
    briefIndex: investigationState.briefIndex,
    recoveryStage: 'signal',
  });
  await runSignalAcquisitionSequence(false);
}

async function runSignalAcquisitionSequence(resume) {
  const linesEl = qs('recoveryPendingLines');
  const actionsEl = qs('recoveryActions');
  const recoveredBtn = qs('btnEquipmentRecovered');

  actionsEl.hidden = true;
  recoveredBtn.hidden = true;
  clearLines(linesEl);

  await typeLines(
    linesEl,
    [
      { text: 'HEADQUARTERS', tone: 'amber', pauseAfter: 400 },
      { text: `Excellent work, Agent ${MISSION_CONFIG.agentName}.`, tone: 'amber', pauseAfter: 500 },
      { text: 'Your investigation has narrowed the search to the immediate recovery zone.', pauseAfter: 600 },
      { text: 'Stand by...', tone: 'dim', pauseAfter: 500 },
      { text: 'Attempting secure communication with the authorized equipment...', pauseAfter: 600 },
      { text: 'Searching...', tone: 'dim', pauseAfter: 500 },
      { text: 'Searching...', tone: 'dim', pauseAfter: 700 },
      { text: 'SIGNAL STRENGTH', tone: 'amber', pauseAfter: 300 },
    ],
    { instant: resume }
  );

  const signalReadings = ['12%', '31%', '64%', '89%'];
  for (let i = 0; i < signalReadings.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await typeLines(linesEl, [{ text: signalReadings[i], pauseAfter: 350 }], { instant: resume });
    if (!resume) sounds.tick();
  }

  if (!resume) sounds.success();
  await typeLines(
    linesEl,
    [
      { text: 'SIGNAL ACQUIRED.', tone: 'amber', pauseAfter: 600 },
      { text: 'Initiating encrypted location ping.', pauseAfter: 500 },
      { text: 'Listen carefully.', tone: 'amber' },
    ],
    { instant: resume }
  );

  // Intentionally does not auto-continue — remains on this screen until
  // the player presses EQUIPMENT RECOVERED.
  recoveredBtn.hidden = false;
}

async function runRecoveryPendingScene(resume) {
  showScreen('recovery-pending');

  switch (recoveryState.stage) {
    case 'directive-2':
      await runRecoveryDirective2(resume);
      break;
    case 'directive-3':
      await runRecoveryDirective3(resume);
      break;
    case 'signal':
      await runSignalAcquisitionSequence(resume);
      break;
    case 'directive-1':
    default:
      await runRecoveryDirective1(resume);
      break;
  }
}

/* --------------------------------------------------------------------------
   SCENE — MISSION COMPLETE
   -------------------------------------------------------------------------- */
async function runMissionCompleteScene(resume) {
  showScreen('mission-complete');

  const linesEl = qs('missionCompleteLines');
  clearLines(linesEl);

  if (!resume) sounds.success();

  await typeLines(
    linesEl,
    [
      { text: 'VERIFYING RECOVERY...', pauseAfter: 500 },
      { text: 'SCANNING EQUIPMENT...', pauseAfter: 500 },
      { text: 'SIGNAL DETECTED...', pauseAfter: 500 },
      { text: 'DEVICE REGISTRATION CONFIRMED...', pauseAfter: 500 },
      { text: 'MISSION SUCCESSFUL.', tone: 'amber', pauseAfter: 700 },

      { text: MISSION_CONFIG.missionName.toUpperCase(), tone: 'amber', pauseAfter: 300 },
      { text: 'STATUS:', tone: 'dim', pauseAfter: 200 },
      { text: 'COMPLETE', tone: 'amber', pauseAfter: 600 },

      { text: MISSION_CONFIG.projectName.toUpperCase(), tone: 'amber', pauseAfter: 300 },
      { text: 'STATUS:', tone: 'dim', pauseAfter: 200 },
      { text: 'ACTIVATED', tone: 'amber', pauseAfter: 700 },

      { text: `Congratulations, Agent ${MISSION_CONFIG.agentName}.`, pauseAfter: 600 },
      { text: 'You successfully completed your first mission.', pauseAfter: 600 },
      { text: 'Your first piece of authorized field equipment has now been issued.', pauseAfter: 600 },
      { text: 'Use it wisely.', pauseAfter: 500 },
      { text: 'Respond when Headquarters contacts you.', pauseAfter: 600 },
      { text: 'With greater independence comes greater responsibility.', pauseAfter: 900 },

      { text: 'HAPPY 11TH BIRTHDAY!', tone: 'amber', pauseAfter: 600 },
      { text: '— YOUR HANDLERS', pauseAfter: 300 },
      { text: MISSION_CONFIG.handlerNames.toUpperCase(), pauseAfter: 800 },

      { text: 'MISSION STATUS', tone: 'dim', pauseAfter: 200 },
      { text: 'COMPLETE', tone: 'amber' },
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
      clearanceReviewState.selectedItems = [];
      clearanceReviewState.submitted = false;
      clearanceReviewState.approved = false;
      saveProgress('clearance-review', { started: true, selectedItems: [], submitted: false, approved: false });
      await runClearanceReviewScreen(false);
    })
  );

  qs('clearanceForm').addEventListener('change', (event) => {
    if (event.target.name !== 'clearanceItem') return;
    const value = event.target.value;
    if (event.target.checked) {
      if (!clearanceReviewState.selectedItems.includes(value)) {
        clearanceReviewState.selectedItems.push(value);
      }
    } else {
      clearanceReviewState.selectedItems = clearanceReviewState.selectedItems.filter((v) => v !== value);
    }
    saveProgress('clearance-review', {
      started: true,
      selectedItems: clearanceReviewState.selectedItems,
      submitted: false,
      approved: false,
    });
  });

  qs('clearanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.isAnimating) return;
    state.isAnimating = true;
    setPrimaryButtonsDisabled(true);

    const formEl = qs('clearanceForm');
    formEl.classList.add('is-disabled');
    formEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.disabled = true;
    });
    qs('btnSubmitEvaluation').disabled = true;

    clearanceReviewState.submitted = true;
    saveProgress('clearance-review', {
      started: true,
      selectedItems: clearanceReviewState.selectedItems,
      submitted: true,
      approved: false,
    });

    sounds.confirm();
    await runClearanceEvaluationSequence(false);

    state.isAnimating = false;
    setPrimaryButtonsDisabled(false);
  });

  qs('btnViewAssignment').addEventListener(
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
      saveProgress('case-file');
      await runCaseFileScreen(false);
    })
  );

  qs('btnBeginInvestigation').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      investigationState.briefIndex = 1;
      saveProgress('investigation', { briefIndex: 1 });
      await runInvestigationScene(false);
    })
  );

  qs('btnRequestIntel').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      if (investigationState.briefIndex < INTELLIGENCE_BRIEFS.length) {
        investigationState.briefIndex += 1;
      }
      saveProgress('investigation', { briefIndex: investigationState.briefIndex });

      // Close the response-entry area if it was left open. This never reads
      // or submits the input's current value — it only resets the panel.
      qs('identifyForm').hidden = true;
      qs('identifyInput').value = '';
      clearLines(qs('identifyIntroLines'));
      clearLines(qs('identifyFeedback'));

      await renderCurrentBrief(false);
    })
  );

  qs('btnTransmitId').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();

      // Only opens the response-entry area — UNLOCK NEXT INTELLIGENCE BRIEF
      // must remain available so the agent can back out to another brief.
      const introEl = qs('identifyIntroLines');
      clearLines(introEl);
      await typeLines(introEl, [
        { text: 'HEADQUARTERS REQUEST', tone: 'amber', pauseAfter: 400 },
        { text: 'Agent Jace,', pauseAfter: 400 },
        { text: 'Based on the available intelligence...', pauseAfter: 450 },
        { text: 'Identify the classified field equipment.', pauseAfter: 500 },
      ]);

      qs('identifyForm').hidden = false;
      qs('identifyInput').value = '';
      qs('identifyInput').focus();
    })
  );

  qs('identifyForm').addEventListener('submit', handleIdentifySubmit);

  qs('btnAcceptRecovery').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      recoveryState.stage = 'directive-1';
      saveProgress('recovery-pending', { briefIndex: investigationState.briefIndex, recoveryStage: 'directive-1' });
      await runRecoveryPendingScene(false);
    })
  );

  qs('btnEquipmentNotLocated').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      if (recoveryState.stage === 'directive-1') {
        recoveryState.stage = 'directive-2';
      } else if (recoveryState.stage === 'directive-2') {
        recoveryState.stage = 'directive-3';
      }
      saveProgress('recovery-pending', {
        briefIndex: investigationState.briefIndex,
        recoveryStage: recoveryState.stage,
      });
      await runRecoveryPendingScene(false);
    })
  );

  qs('btnEquipmentLocated').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      // Safety-net path only — keeps the mission from breaking if the
      // player reports the equipment located too early. Does not advance
      // recoveryState, so progress is unaffected.
      const linesEl = qs('recoveryPendingLines');
      const actionsEl = qs('recoveryActions');
      actionsEl.hidden = true;
      await typeLines(linesEl, RECOVERY_SAFETY_MESSAGE);
      actionsEl.hidden = false;
    })
  );

  qs('btnEquipmentRecovered').addEventListener(
    'click',
    withLock(async () => {
      sounds.confirm();
      saveProgress('mission-complete', { briefIndex: investigationState.briefIndex });
      await runMissionCompleteScene(false);
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
    case 'clearance-review':
      clearanceReviewState.selectedItems = Array.isArray(saved.selectedItems) ? saved.selectedItems : [];
      clearanceReviewState.submitted = Boolean(saved.submitted);
      clearanceReviewState.approved = Boolean(saved.approved);
      runClearanceReviewScreen(true);
      break;
    case 'authorization':
      setConnectionStatus(true);
      runAuthorizationScreen(true);
      break;
    case 'case-file':
      setConnectionStatus(true);
      runCaseFileScreen(true);
      break;
    case 'investigation':
      setConnectionStatus(true);
      investigationState.briefIndex = saved.briefIndex || 1;
      runInvestigationScene(true);
      break;
    case 'equipment':
      setConnectionStatus(true);
      investigationState.briefIndex = saved.briefIndex || INTELLIGENCE_BRIEFS.length;
      runEquipmentScene();
      break;
    case 'recovery-pending':
      setConnectionStatus(true);
      investigationState.briefIndex = saved.briefIndex || INTELLIGENCE_BRIEFS.length;
      recoveryState.stage = saved.recoveryStage || 'directive-1';
      runRecoveryPendingScene(true);
      break;
    case 'mission-complete':
      setConnectionStatus(true);
      investigationState.briefIndex = saved.briefIndex || INTELLIGENCE_BRIEFS.length;
      runMissionCompleteScene(true);
      break;
    default:
      showScreen('landing');
      setConnectionStatus(false);
  }
}

document.addEventListener('DOMContentLoaded', boot);
