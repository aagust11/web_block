const MAX_ATTEMPTS = 5;
const MONITORING_DELAY_MS = 2_000;
const LOG_LIMIT = 20;
const SUPPORTED_LANGUAGES = ['ca', 'es'];
const DEFAULT_LANGUAGE = 'ca';
const STORAGE_KEYS = {
  attempts: 'wb_attempts',
  locked: 'wb_locked',
  lastCode: 'wb_last_code',
  log: 'wb_log',
  lockReason: 'wb_lock_reason',
  language: 'wb_language'
};

const elements = {
  appHeader: document.querySelector('.app-header'),
  monitoringBar: document.getElementById('monitoringBar'),
  monitoringBarMessage: document.getElementById('monitoringBarMessage'),
  monitoringBarExit: document.getElementById('monitoringBarExit'),
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
  fallbackLink: document.getElementById('fallbackLink'),
  languageSelect: document.getElementById('languageSelect')
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
  lockReason: null,
  language: DEFAULT_LANGUAGE,
  messageCache: {}
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

function normaliseDisplayText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
}

function setBadgeText(element, text) {
  if (!element) {
    return;
  }
  const content = normaliseDisplayText(text);
  element.textContent = content;
  element.classList.toggle('hidden', content.length === 0);
}

function setMonitoringMessage(text) {
  const content = normaliseDisplayText(text);
  if (elements.monitorBadge) {
    elements.monitorBadge.textContent = content;
    elements.monitorBadge.classList.toggle('hidden', content.length === 0);
  }
  if (elements.monitoringBarMessage) {
    elements.monitoringBarMessage.textContent = content;
  }
}

function normaliseLanguage(language) {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }

  const normalised = String(language).toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalised)) {
    return normalised;
  }

  const matching = SUPPORTED_LANGUAGES.find((entry) => normalised.startsWith(entry));
  return matching ?? DEFAULT_LANGUAGE;
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

async function loadLanguageMessages(language) {
  const targetLanguage = normaliseLanguage(language);
  if (state.messageCache[targetLanguage]) {
    return state.messageCache[targetLanguage];
  }

  const path = `missatges.${targetLanguage}.json`;
  const messages = await fetchJson(path);
  state.messageCache[targetLanguage] = messages;
  return messages;
}

async function applyLanguage(language, { persist = true } = {}) {
  const targetLanguage = normaliseLanguage(language);
  const messages = await loadLanguageMessages(targetLanguage);

  state.language = targetLanguage;
  if (persist) {
    writeStorage(STORAGE_KEYS.language, targetLanguage);
  }

  document.documentElement.setAttribute('lang', targetLanguage);
  if (elements.languageSelect) {
    elements.languageSelect.value = targetLanguage;
  }

  applyMessages(messages);
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
    const locale = state.language || navigator.language || 'en';
    return date.toLocaleTimeString(locale, {
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
  const banner = messages.banner;

  elements.headerTitle.textContent = ui.headerTitle;
  elements.bannerTitle.textContent = banner.title;
  elements.bannerDescription.textContent = banner.description;
  if (state.locked) {
    setMonitoringMessage(ui.monitorBadgeFallback ?? banner.monitor);
  } else {
    setMonitoringMessage(banner.monitor);
  }
  setBadgeText(elements.lockBadge, state.locked ? banner.locked : banner.unlocked);

  elements.accessTitle.textContent = ui.accessTitle;
  elements.accessDescription.textContent = ui.accessDescription;
  elements.codeLabel.textContent = ui.codeLabel;
  elements.codeInput.setAttribute('placeholder', ui.codePlaceholder);
  elements.submitButton.textContent = ui.submit;
  elements.viewerTitle.textContent = ui.viewerTitle;

  if (elements.monitoringBarExit) {
    const exitLabel = normaliseDisplayText(ui.monitoringBarExit ?? '');
    elements.monitoringBarExit.textContent = exitLabel;
    elements.monitoringBarExit.classList.toggle('hidden', exitLabel.length === 0);
  }

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
  if (state.locked) {
    refreshUnlockForm();
  } else {
    updateUnlockHelp(null);
  }
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
    setBadgeText(elements.lockBadge, state.messages?.banner.locked ?? 'Bloquejat');
    elements.lockOverlay.classList.remove('hidden');
    setMonitoringMessage(state.messages?.ui.monitorBadgeFallback ?? '');
    disableMonitoring();
    refreshUnlockForm();
  } else {
    state.lockReason = null;
    removeStorage(STORAGE_KEYS.locked);
    removeStorage(STORAGE_KEYS.lockReason);
    setBadgeText(elements.lockBadge, state.messages?.banner.unlocked ?? 'Desbloquejat');
    elements.lockOverlay.classList.add('hidden');
    setMonitoringMessage(state.messages?.banner.monitor ?? '');
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
  setMonitoringMessage(state.messages?.banner.monitor ?? '');
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
  const storedLanguage = readStorage(STORAGE_KEYS.language);
  const browserLanguage = navigator?.language;
  const htmlLanguage = document.documentElement.getAttribute('lang');
  const initialLanguage = normaliseLanguage(storedLanguage ?? htmlLanguage ?? browserLanguage ?? DEFAULT_LANGUAGE);
  state.language = initialLanguage;
  document.documentElement.setAttribute('lang', initialLanguage);
  if (elements.languageSelect) {
    elements.languageSelect.value = initialLanguage;
  }

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

async function handleLanguageChange(event) {
  const target = event.target;
  const value = target?.value ?? state.language;
  try {
    await applyLanguage(value);
    clearError();
  } catch (error) {
    showError(error.message);
    if (target) {
      target.value = state.language;
    }
  }
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
  setMonitoringMessage(state.messages.ui.monitorBadgeFallback);
  state.contentReady = false;
  disableMonitoring();
}

function handleFrameLoad() {
  elements.fallback.classList.add('hidden');
  setMonitoringMessage(state.messages.banner.monitor);
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
    setMonitoringMessage(state.messages.banner.monitor);
    elements.contentFrame.focus();
    scheduleMonitoringStart(true);
  }
}

function handleUnlockSubmit(event) {
  event.preventDefault();
  clearUnlockError();

  const inputValue = elements.unlockInput?.value ?? '';
  const trimmedCandidate = inputValue.trim();
  const hasMasterKey = typeof state.masterKey === 'string' && state.masterKey.length > 0;

  if (hasMasterKey && trimmedCandidate === state.masterKey) {
    completeUnlock();
    return;
  }

  const secret = getActiveUnlockSecret();
  if (!secret) {
    showUnlockError(hasMasterKey ? state.messages.ui.overlayUnlockError : state.messages.ui.overlayUnlockUnavailable);
    return;
  }

  let candidate = trimmedCandidate;
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

  setMonitoringMessage(ui.monitorBadgeFallback ?? '');

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
  const active = Boolean(isActive);
  document.body.classList.toggle('viewer-active', active);
  if (elements.monitoringBar) {
    elements.monitoringBar.classList.toggle('hidden', !active);
  }
}

async function init() {
  initialiseState();

  try {
    const codesPromise = fetchJson('codes.json');
    await applyLanguage(state.language, { persist: true });
    state.codes = await codesPromise;
  } catch (error) {
    showError(error.message);
    return;
  }

  state.masterKey = await fetchMasterKey();

  elements.languageSelect?.addEventListener('change', handleLanguageChange);
  elements.accessForm.addEventListener('submit', handleSubmit);
  if (elements.monitoringBarExit) {
    const prepareMonitoringExit = () => {
      if (!state.viewerActive) {
        return;
      }
      disableMonitoring();
    };

    elements.monitoringBarExit.addEventListener('pointerdown', prepareMonitoringExit);
    elements.monitoringBarExit.addEventListener('mousedown', prepareMonitoringExit);
    elements.monitoringBarExit.addEventListener('focus', prepareMonitoringExit);
    elements.monitoringBarExit.addEventListener('click', (event) => {
      event.preventDefault();
      prepareMonitoringExit();
      resetViewer();
    });
  }
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
      setMonitoringMessage(state.messages.ui.monitorBadgeFallback);
      engageLock('visibility');
    } else {
      setMonitoringMessage(state.messages.banner.monitor);
    }
  });

  window.addEventListener('blur', () => {
    updateStatuses();
    if (!isMonitoringActive()) {
      return;
    }
    setMonitoringMessage(state.messages.ui.monitorBadgeFallback);
    engageLock('focus');
  });

  window.addEventListener('focus', () => {
    updateStatuses();
    if (!state.locked && state.viewerActive) {
      setMonitoringMessage(state.messages.banner.monitor);
    }
  });

  document.addEventListener('focusin', () => {
    updateStatuses();
    if (!isMonitoringActive()) {
      return;
    }
    if (document.activeElement === elements.monitoringBarExit) {
      disableMonitoring();
      return;
    }
    if (document.activeElement !== elements.contentFrame) {
      setMonitoringMessage(state.messages.ui.monitorBadgeFallback);
      engageLock('focus-change');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    updateStatuses();
  });

  if (state.locked) {
    setBadgeText(elements.lockBadge, state.messages.banner.locked);
    elements.lockOverlay.classList.remove('hidden');
    refreshUnlockForm();
  } else {
    setBadgeText(elements.lockBadge, state.messages.banner.unlocked);
  }

  elements.codeInput.focus();
}

init();
