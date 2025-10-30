const MAX_ATTEMPTS = 5;
const MONITORING_DELAY_MS = 2_000;
const LOG_LIMIT = 20;
const STORAGE_KEYS = {
  attempts: 'wb_attempts',
  locked: 'wb_locked',
  lastCode: 'wb_last_code',
  log: 'wb_log',
  lockReason: 'wb_lock_reason'
};

const elements = {
  appHeader: document.querySelector('.app-header'),
  lockOverlay: document.getElementById('lockOverlay'),
  lockTitle: document.getElementById('lockTitle'),
  lockDescription: document.getElementById('lockDescription'),
  unlockButton: document.getElementById('unlockButton'),
  unlockForm: document.getElementById('unlockForm'),
  unlockLabel: document.getElementById('unlockLabel'),
  unlockInput: document.getElementById('unlockInput'),
  unlockSubmit: document.getElementById('unlockSubmit'),
  unlockError: document.getElementById('unlockError'),
  unlockHelp: document.getElementById('unlockHelp'),
  lockLog: document.getElementById('lockLog'),
  lockLogTitle: document.getElementById('lockLogTitle'),
  lockLogList: document.getElementById('lockLogList'),
  headerTitle: document.getElementById('headerTitle'),
  bannerTitle: document.getElementById('bannerTitle'),
  bannerDescription: document.getElementById('bannerDescription'),
  monitorBadge: document.getElementById('monitorBadge'),
  lockBadge: document.getElementById('lockBadge'),
  errorRegion: document.getElementById('errorRegion'),
  accessScreen: document.getElementById('accessScreen'),
  accessTitle: document.getElementById('accessTitle'),
  accessDescription: document.getElementById('accessDescription'),
  codeLabel: document.getElementById('codeLabel'),
  codeInput: document.getElementById('codeInput'),
  attemptsInfo: document.getElementById('attemptsInfo'),
  submitButton: document.getElementById('submitButton'),
  accessForm: document.getElementById('accessForm'),
  viewer: document.getElementById('viewer'),
  viewerTitle: document.getElementById('viewerTitle'),
  visibilityStatus: document.getElementById('visibilityStatus'),
  focusStatus: document.getElementById('focusStatus'),
  fullscreenStatus: document.getElementById('fullscreenStatus'),
  contentFrame: document.getElementById('contentFrame'),
  fallback: document.getElementById('fallback'),
  fallbackTitle: document.getElementById('fallbackTitle'),
  fallbackDescription: document.getElementById('fallbackDescription'),
  fallbackLink: document.getElementById('fallbackLink')
};

const state = {
  messages: null,
  codes: {},
  attemptsLeft: MAX_ATTEMPTS,
  locked: false,
  viewerActive: false,
  activeCode: null,
  contentReady: false,
  monitoringEnabled: false,
  monitoringTimer: null,
  masterKey: null,
  log: [],
  lockReason: null
};

async function fetchMasterKey() {
  try {
    const response = await fetch('master_k', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    console.warn('No es pot carregar la clau mestra', error);
    return null;
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No es pot carregar ${path}`);
  }
  return response.json();
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('No es pot llegir el magatzem local', error);
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('No es pot escriure al magatzem local', error);
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('No es pot esborrar el valor del magatzem local', error);
  }
}

function readJsonStorage(key) {
  const rawValue = readStorage(key);
  if (!rawValue) {
    return null;
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('No es pot analitzar el contingut JSON del magatzem local', error);
    return null;
  }
}

function writeJsonStorage(key, value) {
  let serialised;
  try {
    serialised = JSON.stringify(value);
  } catch (error) {
    console.warn('No es pot serialitzar el contingut abans de desar-lo', error);
    return;
  }
  writeStorage(key, serialised);
}

function normaliseMonitoringReasons(input) {
  if (!input) {
    return [];
  }
  const raw = Array.isArray(input) ? input : String(input).split('+');
  const cleaned = raw
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value.length > 0);
  return Array.from(new Set(cleaned));
}

function sanitiseLogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const { id, type, timestamp, details = {} } = entry;
  if (typeof type !== 'string' || typeof timestamp !== 'string') {
    return null;
  }
  const safeId = Number.isFinite(id) ? id : Date.now();
  if (type === 'monitoring') {
    const reasons = normaliseMonitoringReasons(details.reasons);
    return { id: safeId, type, timestamp, details: { reasons } };
  }
  return { id: safeId, type, timestamp, details: {} };
}

function normaliseLockContext(context) {
  if (!context || typeof context !== 'object') {
    return null;
  }
  const { type, details = {} } = context;
  if (typeof type !== 'string') {
    return null;
  }
  if (type === 'monitoring') {
    return { type, details: { reasons: normaliseMonitoringReasons(details.reasons) } };
  }
  return { type, details: {} };
}

function loadStoredLog() {
  const parsed = readJsonStorage(STORAGE_KEYS.log);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((entry) => sanitiseLogEntry(entry))
    .filter((entry) => entry != null)
    .slice(-LOG_LIMIT);
}

function persistLog() {
  writeJsonStorage(STORAGE_KEYS.log, state.log);
}

function addLockLogEntry(type, details = {}) {
  const entry = {
    id: Date.now(),
    type,
    timestamp: new Date().toISOString(),
    details: type === 'monitoring' ? { reasons: normaliseMonitoringReasons(details.reasons) } : {}
  };
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) {
    state.log = state.log.slice(-LOG_LIMIT);
  }
  persistLog();
  if (state.messages) {
    renderLockLog();
  }
  return entry;
}

function formatLogTimestamp(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleTimeString(navigator.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return date.toISOString();
  }
}

function getMonitoringMessages(reasons) {
  const ui = state.messages?.ui;
  if (!ui) {
    return [];
  }
  const dictionary = {
    visibility: ui.overlayLogMonitoringVisibility,
    'visibility-check': ui.overlayLogMonitoringVisibility,
    focus: ui.overlayLogMonitoringFocus,
    'focus-check': ui.overlayLogMonitoringFocus,
    'focus-change': ui.overlayLogMonitoringFocusChange,
    'frame-focus-check': ui.overlayLogMonitoringFrame,
    'monitoring-check': ui.overlayLogMonitoringGeneric
  };

  const resolved = [];
  reasons.forEach((reason) => {
    const message = dictionary[reason] ?? ui.overlayLogMonitoringGeneric;
    if (message) {
      resolved.push(message);
    }
  });

  if (resolved.length === 0 && ui.overlayLogMonitoringGeneric) {
    resolved.push(ui.overlayLogMonitoringGeneric);
  }

  return Array.from(new Set(resolved));
}

function getLogMessageForEntry(entry) {
  const ui = state.messages?.ui;
  if (!ui || !entry) {
    return '';
  }
  if (entry.type === 'attempts') {
    return ui.overlayLogAttempts ?? '';
  }
  if (entry.type === 'monitoring') {
    const reasons = Array.isArray(entry.details?.reasons)
      ? entry.details.reasons
      : [];
    return getMonitoringMessages(reasons).join(' · ');
  }
  return ui.overlayLogMonitoringGeneric ?? '';
}

function renderLockLog() {
  if (!elements.lockLogList || !state.messages) {
    return;
  }

  const { ui } = state.messages;
  if (elements.lockLogTitle) {
    elements.lockLogTitle.textContent = ui.overlayLogTitle ?? '';
  }
  elements.lockLogList.innerHTML = '';

  const entries = [...state.log].sort((a, b) => b.id - a.id);
  if (entries.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'lock-overlay__log-empty';
    emptyItem.textContent = ui.overlayLogEmpty ?? '';
    elements.lockLogList.append(emptyItem);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'lock-overlay__log-entry';

    const timestamp = document.createElement('span');
    timestamp.className = 'lock-overlay__log-timestamp';
    timestamp.textContent = formatLogTimestamp(entry.timestamp);

    const message = document.createElement('span');
    message.className = 'lock-overlay__log-message';
    message.textContent = getLogMessageForEntry(entry);

    item.append(timestamp, message);
    elements.lockLogList.append(item);
  });
}

function updateLockOverlayContent() {
  if (!state.messages) {
    return;
  }

  const ui = state.messages.ui;
  const reasonType = state.lockReason?.type;
  if (reasonType === 'attempts') {
    elements.lockTitle.textContent = ui.overlayLockedAttemptsTitle ?? ui.overlayLockedTitle;
    elements.lockDescription.textContent = ui.overlayLockedAttemptsDescription ?? ui.overlayLockedDescription;
  } else {
    elements.lockTitle.textContent = ui.overlayLockedTitle ?? '';
    elements.lockDescription.textContent = ui.overlayLockedDescription ?? '';
  }

  renderLockLog();
}

function applyMessages(messages) {
  state.messages = messages;
  const ui = messages.ui;

  elements.headerTitle.textContent = ui.headerTitle;
  elements.bannerTitle.textContent = messages.banner.title;
  elements.bannerDescription.textContent = messages.banner.description;
  elements.monitorBadge.textContent = messages.banner.monitor;
  elements.lockBadge.textContent = messages.banner.locked;

  elements.accessTitle.textContent = ui.accessTitle;
  elements.accessDescription.textContent = ui.accessDescription;
  elements.codeLabel.textContent = ui.codeLabel;
  elements.codeInput.setAttribute('placeholder', ui.codePlaceholder);
  elements.submitButton.textContent = ui.submit;
  elements.viewerTitle.textContent = ui.viewerTitle;

  elements.fallbackTitle.textContent = ui.fallbackTitle;
  elements.fallbackDescription.textContent = ui.fallbackDescription;
  elements.fallbackLink.textContent = ui.fallbackLink;

  elements.lockTitle.textContent = ui.overlayLockedTitle;
  elements.lockDescription.textContent = ui.overlayLockedDescription;
  elements.unlockButton.textContent = ui.overlayUnlockCta;
  if (elements.unlockLabel) {
    elements.unlockLabel.textContent = ui.overlayUnlockLabel;
  }
  if (elements.unlockInput) {
    elements.unlockInput.setAttribute('placeholder', ui.overlayUnlockPlaceholder);
  }
  if (elements.unlockSubmit) {
    elements.unlockSubmit.textContent = ui.overlayUnlockSubmit;
  }
  updateStatuses();
  updateAttemptsInfo();
  updateUnlockHelp(state.locked ? getActiveUnlockSecret() : null);
  updateLockOverlayContent();
}

function updateAttemptsInfo() {
  if (!state.messages) return;
  const ui = state.messages.ui;

  if (state.locked && state.attemptsLeft <= 0) {
    elements.attemptsInfo.textContent = ui.attemptsLocked;
    return;
  }

  elements.attemptsInfo.textContent = ui.attempts.replace('{count}', state.attemptsLeft);
}

function showError(message) {
  elements.errorRegion.textContent = message;
  elements.errorRegion.classList.remove('hidden');
}

function clearError() {
  elements.errorRegion.textContent = '';
  elements.errorRegion.classList.add('hidden');
}

function disableMonitoring() {
  state.monitoringEnabled = false;
  if (state.monitoringTimer) {
    window.clearTimeout(state.monitoringTimer);
    state.monitoringTimer = null;
  }
}

function scheduleMonitoringStart(immediate = false) {
  disableMonitoring();
  if (!state.viewerActive || !state.contentReady) {
    return;
  }

  if (immediate) {
    state.monitoringEnabled = true;
    enforceMonitoringState();
    return;
  }

  state.monitoringTimer = window.setTimeout(() => {
    state.monitoringEnabled = true;
    state.monitoringTimer = null;
    enforceMonitoringState();
  }, MONITORING_DELAY_MS);
}

function setLocked(isLocked, context = null) {
  state.locked = isLocked;
  if (isLocked) {
    const normalisedContext = normaliseLockContext(context);
    state.lockReason = normalisedContext;
    writeStorage(STORAGE_KEYS.locked, 'true');
    if (normalisedContext) {
      writeJsonStorage(STORAGE_KEYS.lockReason, normalisedContext);
    } else {
      removeStorage(STORAGE_KEYS.lockReason);
    }
    elements.lockBadge.textContent = state.messages?.banner.locked ?? 'Bloquejat';
    elements.lockOverlay.classList.remove('hidden');
    elements.monitorBadge.textContent = state.messages?.ui.monitorBadgeFallback ?? elements.monitorBadge.textContent;
    disableMonitoring();
    refreshUnlockForm();
  } else {
    state.lockReason = null;
    removeStorage(STORAGE_KEYS.locked);
    removeStorage(STORAGE_KEYS.lockReason);
    elements.lockBadge.textContent = state.messages?.banner.unlocked ?? 'Desbloquejat';
    elements.lockOverlay.classList.add('hidden');
    elements.monitorBadge.textContent = state.messages?.banner.monitor ?? elements.monitorBadge.textContent;
    clearUnlockError();
    if (state.viewerActive) {
      scheduleMonitoringStart();
    }
  }
  updateUnlockHelp(state.locked ? getActiveUnlockSecret() : null);
  updateAttemptsInfo();
  updateLockOverlayContent();
}

function resetViewer() {
  state.viewerActive = false;
  state.activeCode = null;
  state.contentReady = false;
  applyViewerLayout(false);
  elements.viewer.classList.add('hidden');
  elements.accessScreen.classList.remove('hidden');
  elements.contentFrame.setAttribute('src', 'about:blank');
  elements.fallback.classList.add('hidden');
  elements.fallbackLink.setAttribute('href', '#');
  removeStorage(STORAGE_KEYS.lastCode);
  disableMonitoring();
  clearError();
  elements.appHeader?.classList.remove('hidden');
  elements.codeInput.focus();
}

function engageLock(reason = '') {
  if (!state.viewerActive || state.locked || !state.monitoringEnabled) {
    return;
  }
  const reasons = normaliseMonitoringReasons(reason);
  console.warn('Activant bloqueig per', reason);
  addLockLogEntry('monitoring', { reasons });
  setLocked(true, { type: 'monitoring', details: { reasons } });
}

function updateStatuses() {
  if (!state.messages) return;
  const ui = state.messages.ui;

  const visibilityState = document.visibilityState === 'visible' ? ui.statusVisibilityVisible : ui.statusVisibilityHidden;
  elements.visibilityStatus.textContent = `${ui.statusVisibility}: ${visibilityState}`;

  const hasFocus = document.hasFocus();
  elements.focusStatus.textContent = `${ui.statusFocus}: ${hasFocus ? ui.statusFocusActive : ui.statusFocusLost}`;

  const fullscreenActive = document.fullscreenElement != null;
  elements.fullscreenStatus.textContent = `${ui.statusFullscreen}: ${fullscreenActive ? ui.statusFullscreenOn : ui.statusFullscreenOff}`;
}

function initialiseState() {
  state.log = loadStoredLog();
  const storedLockReason = normaliseLockContext(readJsonStorage(STORAGE_KEYS.lockReason));
  if (storedLockReason) {
    state.lockReason = storedLockReason;
  }

  const storedAttempts = Number.parseInt(readStorage(STORAGE_KEYS.attempts) ?? '', 10);
  if (!Number.isNaN(storedAttempts) && storedAttempts >= 0 && storedAttempts <= MAX_ATTEMPTS) {
    state.attemptsLeft = storedAttempts;
  }

  const storedLocked = readStorage(STORAGE_KEYS.locked);
  if (storedLocked === 'true') {
    state.locked = true;
    elements.lockOverlay.classList.remove('hidden');
  }

  const storedCode = readStorage(STORAGE_KEYS.lastCode);
  if (storedCode) {
    elements.codeInput.value = storedCode;
  }

  updateAttemptsInfo();
}

function persistAttempts() {
  writeStorage(STORAGE_KEYS.attempts, String(state.attemptsLeft));
}

function handleSubmit(event) {
  event.preventDefault();
  clearError();

  if (state.locked) {
    showError(state.messages.ui.errorLocked);
    return;
  }

  const code = elements.codeInput.value.trim().toUpperCase();
  if (!code) {
    showError(state.messages.ui.errorInvalid);
    return;
  }

  const match = state.codes[code];
  if (!match) {
    state.attemptsLeft = Math.max(0, state.attemptsLeft - 1);
    persistAttempts();
    updateAttemptsInfo();
    if (state.attemptsLeft <= 0) {
      showError(state.messages.ui.errorAttempts);
      addLockLogEntry('attempts');
      setLocked(true, { type: 'attempts' });
    } else {
      showError(state.messages.ui.errorInvalid);
    }
    return;
  }

  state.activeCode = code;
  state.viewerActive = true;
  state.attemptsLeft = MAX_ATTEMPTS;
  persistAttempts();
  updateAttemptsInfo();
  writeStorage(STORAGE_KEYS.lastCode, code);

  elements.contentFrame.setAttribute('src', match.link);
  elements.fallbackLink.setAttribute('href', match.link);
  elements.accessScreen.classList.add('hidden');
  elements.viewer.classList.remove('hidden');
  state.contentReady = false;
  disableMonitoring();
  elements.appHeader?.classList.add('hidden');

  setLocked(false);

  applyViewerLayout(true);
  elements.contentFrame.focus();
}

function handleFrameError() {
  elements.fallback.classList.remove('hidden');
  elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
  state.contentReady = false;
  disableMonitoring();
}

function handleFrameLoad() {
  elements.fallback.classList.add('hidden');
  elements.monitorBadge.textContent = state.messages.banner.monitor;
  state.contentReady = true;
  scheduleMonitoringStart();
}

function getActiveUnlockSecret() {
  if (!state.activeCode) {
    return null;
  }
  const record = state.codes[state.activeCode];
  if (!record) {
    return null;
  }
  const { unlock } = record;
  if (typeof unlock === 'string') {
    const trimmed = unlock.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (unlock === true) {
    return state.activeCode;
  }
  return null;
}

function unlockUsesAccessCode() {
  if (!state.activeCode) {
    return false;
  }
  const record = state.codes[state.activeCode];
  return record?.unlock === true;
}

function updateUnlockHelp(secret) {
  if (!elements.unlockHelp || !state.messages) {
    return;
  }

  if (!state.locked) {
    elements.unlockHelp.textContent = '';
    elements.unlockHelp.classList.add('hidden');
    return;
  }

  const ui = state.messages.ui;
  const segments = [];

  if (ui.overlayUnlockLogIntro) {
    segments.push(ui.overlayUnlockLogIntro);
  }

  if (secret) {
    if (unlockUsesAccessCode()) {
      if (ui.overlayUnlockLogCode) {
        segments.push(ui.overlayUnlockLogCode);
      }
    } else if (ui.overlayUnlockLogSecret) {
      segments.push(ui.overlayUnlockLogSecret);
    }
  }

  const message = segments.join(' ').trim();

  if (message) {
    elements.unlockHelp.textContent = message;
    elements.unlockHelp.classList.remove('hidden');
  } else {
    elements.unlockHelp.textContent = '';
    elements.unlockHelp.classList.add('hidden');
  }
}

function clearUnlockError() {
  if (!elements.unlockError) return;
  elements.unlockError.textContent = '';
  elements.unlockError.classList.add('hidden');
}

function showUnlockError(message) {
  if (!elements.unlockError) return;
  elements.unlockError.textContent = message;
  elements.unlockError.classList.remove('hidden');
}

function refreshUnlockForm() {
  if (!elements.unlockForm || !state.messages) {
    return;
  }
  const secret = getActiveUnlockSecret();
  elements.unlockForm.classList.remove('hidden');
  updateUnlockHelp(secret);
  if (elements.unlockInput) {
    elements.unlockInput.value = '';
  }
  clearUnlockError();
  if (!elements.unlockForm.classList.contains('hidden')) {
    elements.unlockInput?.focus();
  }
}

function completeUnlock() {
  setLocked(false);
  if (state.viewerActive) {
    elements.monitorBadge.textContent = state.messages.banner.monitor;
    elements.contentFrame.focus();
    scheduleMonitoringStart(true);
  }
}

function handleUnlockSubmit(event) {
  event.preventDefault();
  clearUnlockError();

  const rawCandidate = elements.unlockInput.value.trim();
  if (rawCandidate && state.masterKey && rawCandidate === state.masterKey) {
    completeUnlock();
    return;
  }

  const secret = getActiveUnlockSecret();
  if (!secret) {
    showUnlockError(state.messages.ui.overlayUnlockUnavailable);
    return;
  }

  let candidate = rawCandidate;
  if (unlockUsesAccessCode()) {
    candidate = candidate.toUpperCase();
  }
  if (candidate !== secret) {
    showUnlockError(state.messages.ui.overlayUnlockError);
    return;
  }

  completeUnlock();
}

function isMonitoringActive() {
  return state.viewerActive && state.monitoringEnabled && !state.locked;
}

function enforceMonitoringState() {
  if (!isMonitoringActive()) {
    return;
  }

  updateStatuses();

  const ui = state.messages?.ui;
  if (!ui) {
    return;
  }

  const tabVisible = document.visibilityState === 'visible';
  const windowFocused = document.hasFocus();
  const activeElement = document.activeElement;
  const frameFocused = activeElement === elements.contentFrame || document.fullscreenElement === elements.contentFrame;

  if (tabVisible && windowFocused && frameFocused) {
    return;
  }

  elements.monitorBadge.textContent = ui.monitorBadgeFallback ?? elements.monitorBadge.textContent;

  const reasons = [];
  if (!tabVisible) {
    reasons.push('visibility-check');
  }
  if (!windowFocused) {
    reasons.push('focus-check');
  }
  if (!frameFocused) {
    reasons.push('frame-focus-check');
  }

  engageLock(reasons.join('+') || 'monitoring-check');
}

function applyViewerLayout(isActive) {
  document.body.classList.toggle('viewer-active', Boolean(isActive));
}

async function init() {
  initialiseState();

  try {
    const [messages, codes] = await Promise.all([fetchJson('missatges.json'), fetchJson('codes.json')]);
    state.codes = codes;
    applyMessages(messages);
  } catch (error) {
    showError(error.message);
    return;
  }

  state.masterKey = await fetchMasterKey();

  elements.accessForm.addEventListener('submit', handleSubmit);
  elements.unlockButton?.addEventListener('click', (event) => {
    event.preventDefault();
    if (elements.unlockInput && !elements.unlockForm?.classList.contains('hidden')) {
      elements.unlockInput.focus();
    }
  });
  elements.unlockForm?.addEventListener('submit', handleUnlockSubmit);

  elements.contentFrame.addEventListener('error', handleFrameError);
  elements.contentFrame.addEventListener('load', handleFrameLoad);

  document.addEventListener('visibilitychange', () => {
    updateStatuses();
    if (!isMonitoringActive()) {
      return;
    }
    if (document.visibilityState !== 'visible') {
      elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
      engageLock('visibility');
    } else {
      elements.monitorBadge.textContent = state.messages.banner.monitor;
    }
  });

  window.addEventListener('blur', () => {
    updateStatuses();
    if (!isMonitoringActive()) {
      return;
    }
    elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
    engageLock('focus');
  });

  window.addEventListener('focus', () => {
    updateStatuses();
    if (!state.locked && state.viewerActive) {
      elements.monitorBadge.textContent = state.messages.banner.monitor;
    }
  });

  document.addEventListener('focusin', () => {
    updateStatuses();
    if (!isMonitoringActive()) {
      return;
    }
    if (document.activeElement !== elements.contentFrame) {
      elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
      engageLock('focus-change');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    updateStatuses();
  });

  if (state.locked) {
    elements.lockBadge.textContent = state.messages.banner.locked;
    elements.lockOverlay.classList.remove('hidden');
    refreshUnlockForm();
  } else {
    elements.lockBadge.textContent = state.messages.banner.unlocked;
  }

  elements.codeInput.focus();
}

init();
