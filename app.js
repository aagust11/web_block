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
  language: 'wb_language',
  peerStatus: 'wb_peer_status',
  peerId: 'wb_peer_id',
  name: 'wb_name'
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
  nameLabel: document.getElementById('nameLabel'),
  nameInput: document.getElementById('nameInput'),
  nameHelp: document.getElementById('nameHelp'),
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
  connectionStatus: document.getElementById('connectionStatus'),
  lockStateStatus: document.getElementById('lockStateStatus'),
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
  messageCache: {},
  peer: null,
  peerConnection: null,
  peerCall: null,
  peerStream: null,
  peerId: null,
  peerStatus: 'idle',
  peerError: null,
  displaySurface: 'unknown',
  displaySurfaceMonitor: null,
  name: ''
};

const ADMIN_PEER_ID = 'contrOwl-admin';
const PEER_STATUS = {
  idle: 'idle',
  connecting: 'connecting',
  connected: 'connected',
  error: 'error',
  unavailable: 'unavailable'
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

function normaliseStreamLockDetails(details = {}) {
  if (!details || typeof details !== 'object') {
    return { reason: 'ended' };
  }

  const result = {};
  if (typeof details.reason === 'string' && details.reason.trim().length > 0) {
    result.reason = details.reason.trim();
  } else {
    result.reason = 'ended';
  }

  if (typeof details.trackKind === 'string' && details.trackKind.trim().length > 0) {
    result.trackKind = details.trackKind.trim();
  }

  if (typeof details.trackLabel === 'string' && details.trackLabel.trim().length > 0) {
    result.trackLabel = details.trackLabel.trim();
  }

  if (typeof details.trackId === 'string' && details.trackId.trim().length > 0) {
    result.trackId = details.trackId.trim();
  }

  return result;
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
  if (type === 'stream') {
    const streamDetails = normaliseStreamLockDetails(details);
    return { id: safeId, type, timestamp, details: streamDetails };
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
  if (type === 'stream-ended') {
    return { type, details: normaliseStreamLockDetails(details) };
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
  let resolvedDetails = {};
  if (type === 'monitoring') {
    resolvedDetails = { reasons: normaliseMonitoringReasons(details.reasons) };
  } else if (type === 'stream') {
    resolvedDetails = normaliseStreamLockDetails(details);
  }

  const entry = {
    id: Date.now(),
    type,
    timestamp: new Date().toISOString(),
    details: resolvedDetails
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
  if (entry.type === 'stream') {
    return ui.overlayLogStream ?? ui.overlayLogMonitoringGeneric ?? '';
  }
  if (entry.type === 'stream-required') {
    return ui.overlayLogStreamRequired ?? ui.overlayLogMonitoringGeneric ?? '';
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
  } else if (reasonType === 'stream-ended') {
    elements.lockTitle.textContent = ui.overlayLockedStreamTitle ?? ui.overlayLockedTitle ?? '';
    elements.lockDescription.textContent = ui.overlayLockedStreamDescription ?? ui.overlayLockedDescription ?? '';
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
  if (elements.nameLabel) {
    elements.nameLabel.textContent = ui.nameLabel ?? '';
  }
  if (elements.nameInput) {
    const placeholder = normaliseDisplayText(ui.namePlaceholder ?? '');
    elements.nameInput.setAttribute('placeholder', placeholder);
  }
  if (elements.nameHelp) {
    const helpText = normaliseDisplayText(ui.nameHelp ?? '');
    elements.nameHelp.textContent = helpText;
    elements.nameHelp.classList.toggle('hidden', helpText.length === 0);
  }
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

function canUsePeer() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}

function getPeerStatusLabel(ui) {
  if (!ui) {
    return state.peerStatus;
  }
  switch (state.peerStatus) {
    case PEER_STATUS.connected:
      return ui.statusPeerConnected ?? 'Connectada';
    case PEER_STATUS.connecting:
      return ui.statusPeerConnecting ?? 'Connectant';
    case PEER_STATUS.error:
      return ui.statusPeerError ?? 'Error';
    case PEER_STATUS.unavailable:
      return ui.statusPeerUnavailable ?? 'No disponible';
    case PEER_STATUS.idle:
    default:
      return ui.statusPeerIdle ?? 'Inactiva';
  }
}

function updateConnectionStatusText() {
  if (!elements.connectionStatus) {
    return;
  }

  const ui = state.messages?.ui ?? {};
  const label = ui.statusPeer ?? 'Connexió';
  const value = getPeerStatusLabel(ui);
  elements.connectionStatus.textContent = `${label}: ${value}`;
}

function updateLockStateStatusText() {
  if (!elements.lockStateStatus) {
    return;
  }

  const ui = state.messages?.ui ?? {};
  const label = ui.statusLockState ?? 'Bloqueig';
  const value = state.locked
    ? ui.statusLockStateLocked ?? 'Actiu'
    : ui.statusLockStateUnlocked ?? 'Inactiu';
  elements.lockStateStatus.textContent = `${label}: ${value}`;
}

function setPeerStatus(status, error = null) {
  state.peerStatus = status;
  state.peerError = error ?? null;

  if (status === PEER_STATUS.idle) {
    removeStorage(STORAGE_KEYS.peerStatus);
  } else {
    writeStorage(STORAGE_KEYS.peerStatus, status);
  }

  if (status === PEER_STATUS.connected && state.peerId) {
    writeStorage(STORAGE_KEYS.peerId, state.peerId);
  }

  updateConnectionStatusText();
}

function handlePeerData(data) {
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'lock' && typeof data.locked === 'boolean') {
    const desiredState = Boolean(data.locked);
    if (desiredState === state.locked) {
      broadcastPeerStatus({ event: 'lock-confirmed' });
      return;
    }
    const context = data.context ?? {
      type: 'remote',
      details: {
        source: 'admin',
        reason: data.reason ?? null
      }
    };
    setLocked(desiredState, context);
  }
}

function broadcastPeerStatus(extra = {}) {
  if (!state.peerConnection || !state.peerConnection.open) {
    return;
  }
  try {
    state.peerConnection.send({
      type: 'status',
      locked: state.locked,
      viewerActive: state.viewerActive,
      peerId: state.peerId,
      code: state.activeCode,
      name: state.name,
      status: state.peerStatus,
      displaySurface: state.displaySurface,
      ...extra
    });
  } catch (error) {
    console.warn('No s\'ha pogut enviar l\'estat al canal de dades', error);
  }
}

function normaliseDisplaySurface(surface) {
  if (typeof surface !== 'string') {
    return 'unknown';
  }
  const value = surface.toLowerCase();
  if (value === 'monitor' || value === 'window' || value === 'browser') {
    return value;
  }
  return 'unknown';
}

function setDisplaySurface(surface) {
  const normalised = normaliseDisplaySurface(surface);
  if (state.displaySurface === normalised) {
    return;
  }
  state.displaySurface = normalised;
  if (state.peerConnection && state.peerConnection.open) {
    broadcastPeerStatus({ event: 'surface-change' });
  }
}

function stopDisplaySurfaceMonitor() {
  const monitor = state.displaySurfaceMonitor;
  if (!monitor) {
    return;
  }
  monitor.events.forEach((eventName) => {
    try {
      monitor.track.removeEventListener(eventName, monitor.handler);
    } catch (error) {
      console.warn('No es pot desregistrar l\'observador de la superfície compartida', error);
    }
  });
  if (monitor.intervalId) {
    window.clearInterval(monitor.intervalId);
  }
  state.displaySurfaceMonitor = null;
}

function startDisplaySurfaceMonitor(track) {
  stopDisplaySurfaceMonitor();
  if (!track) {
    setDisplaySurface('unknown');
    return;
  }

  const events = ['mute', 'unmute', 'overconstrained'];
  const handler = () => {
    try {
      const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
      if (settings && typeof settings.displaySurface === 'string') {
        setDisplaySurface(settings.displaySurface);
        return;
      }
    } catch (error) {
      console.warn('No es pot llegir la superfície compartida', error);
    }
    setDisplaySurface('unknown');
  };

  events.forEach((eventName) => {
    try {
      track.addEventListener(eventName, handler);
    } catch (error) {
      console.warn('No es pot observar els canvis de la superfície compartida', error);
    }
  });

  let intervalId = null;
  try {
    intervalId = window.setInterval(handler, 2000);
  } catch (error) {
    console.warn('No es pot iniciar el seguiment periòdic de la superfície compartida', error);
  }

  state.displaySurfaceMonitor = { track, handler, events, intervalId };
  handler();
}

async function requestScreenStream() {
  if (!navigator?.mediaDevices?.getDisplayMedia) {
    throw new Error('display-media-unavailable');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: false
  });

  const [videoTrack] = stream.getVideoTracks();
  if (videoTrack) {
    startDisplaySurfaceMonitor(videoTrack);
    videoTrack.addEventListener('ended', () => {
      const details = {
        reason: 'track-ended',
        trackKind: videoTrack.kind ?? 'video',
        trackLabel: videoTrack.label ?? '',
        trackId: videoTrack.id ?? ''
      };
      stopDisplaySurfaceMonitor();
      setDisplaySurface('unknown');
      const lockContext = { type: 'stream-ended', details };
      addLockLogEntry('stream', details);
      setLocked(true, lockContext);
      broadcastPeerStatus({ event: 'stream-ended', context: lockContext });
      destroyPeerSession(PEER_STATUS.error, lockContext);
    });
  } else {
    setDisplaySurface('unknown');
  }

  return stream;
}

async function initialisePeerSession() {
  if (!state.viewerActive) {
    return null;
  }

  if (!canUsePeer()) {
    setPeerStatus(PEER_STATUS.unavailable);
    return null;
  }

  const shouldAnnounceStreamFailure = () => {
    const accessHidden = elements.accessScreen ? elements.accessScreen.classList.contains('hidden') : false;
    return state.viewerActive && accessHidden;
  };

  if (state.peer) {
    destroyPeerSession(null);
  }

  setPeerStatus(PEER_STATUS.connecting);

  const peer = new window.Peer(undefined, { debug: 0 });
  state.peer = peer;

  peer.on('close', () => {
    setPeerStatus(PEER_STATUS.idle);
    state.peer = null;
    state.peerId = null;
    removeStorage(STORAGE_KEYS.peerId);
  });

  peer.on('disconnected', () => {
    setPeerStatus(PEER_STATUS.error);
  });

  const peerId = await new Promise((resolve, reject) => {
    const handleOpen = (id) => {
      cleanup();
      resolve(id);
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      if (typeof peer.off === 'function') {
        peer.off('open', handleOpen);
        peer.off('error', handleError);
      }
    };
    peer.on('open', handleOpen);
    peer.on('error', handleError);
  }).catch((error) => {
    setPeerStatus(PEER_STATUS.error, error);
    destroyPeerSession(PEER_STATUS.error, state.lockReason);
    throw error;
  });

  state.peerId = peerId;
  writeStorage(STORAGE_KEYS.peerId, peerId);

  let stream;
  try {
    stream = await requestScreenStream();
  } catch (error) {
    setPeerStatus(PEER_STATUS.error, error);
    destroyPeerSession(PEER_STATUS.error, state.lockReason);
    throw error;
  }

  state.peerStream = stream;

  const call = peer.call(ADMIN_PEER_ID, stream, {
    metadata: {
      code: state.activeCode,
      peerId,
      name: state.name,
      locked: state.locked,
      displaySurface: state.displaySurface
    }
  });
  state.peerCall = call;

  call.on('error', (error) => {
    setPeerStatus(PEER_STATUS.error, error);
    state.peerCall = null;
    state.peerStream = null;
    destroyPeerSession(PEER_STATUS.error, state.lockReason);
    if (shouldAnnounceStreamFailure()) {
      handleStreamRequirementFailure(error);
    }
  });

  call.on('close', () => {
    state.peerCall = null;
    state.peerStream = null;
    if (state.peerStatus !== PEER_STATUS.idle) {
      destroyPeerSession(PEER_STATUS.error, state.lockReason);
      if (shouldAnnounceStreamFailure()) {
        handleStreamRequirementFailure(new Error('peer-call-closed'));
      }
    }
  });

  const connection = peer.connect(ADMIN_PEER_ID, {
    metadata: {
      code: state.activeCode,
      peerId,
      name: state.name,
      displaySurface: state.displaySurface
    }
  });
  state.peerConnection = connection;

  const connectionReady = new Promise((resolve, reject) => {
    const handleOpen = () => {
      setPeerStatus(PEER_STATUS.connected);
      broadcastPeerStatus({ event: 'open' });
      resolve();
    };
    const handleError = (error) => {
      state.peerConnection = null;
      setPeerStatus(PEER_STATUS.error, error);
      destroyPeerSession(PEER_STATUS.error, state.lockReason);
      if (shouldAnnounceStreamFailure()) {
        handleStreamRequirementFailure(error);
      }
      reject(error);
    };
    const handleClose = () => {
      state.peerConnection = null;
      if (state.peerStatus !== PEER_STATUS.idle) {
        destroyPeerSession(PEER_STATUS.error, state.lockReason);
        if (shouldAnnounceStreamFailure()) {
          handleStreamRequirementFailure(new Error('peer-connection-closed'));
        }
      }
      reject(new Error('peer-connection-closed'));
    };
    connection.on('open', handleOpen);
    connection.on('error', handleError);
    connection.on('close', handleClose);
  });

  connection.on('data', handlePeerData);

  await connectionReady;

  return { peerId, stream };
}

function destroyPeerSession(nextStatus = PEER_STATUS.idle, lockContext = null) {
  const resolvedContext = normaliseLockContext(lockContext);
  if (resolvedContext) {
    if (!state.locked || state.lockReason?.type !== resolvedContext.type) {
      setLocked(true, resolvedContext);
    } else {
      state.lockReason = resolvedContext;
      writeJsonStorage(STORAGE_KEYS.lockReason, resolvedContext);
    }
  }

  const closingContext = resolvedContext ?? state.lockReason ?? null;
  if (state.peerConnection && state.peerConnection.open) {
    broadcastPeerStatus({ event: 'closing', context: closingContext });
  }

  stopDisplaySurfaceMonitor();
  state.displaySurface = 'unknown';

  if (state.peerCall) {
    try {
      state.peerCall.close();
    } catch (error) {
      console.warn('No es pot tancar la trucada de PeerJS', error);
    }
    state.peerCall = null;
  }

  if (state.peerConnection) {
    try {
      state.peerConnection.close();
    } catch (error) {
      console.warn('No es pot tancar la connexió de dades', error);
    }
    state.peerConnection = null;
  }

  if (state.peerStream) {
    state.peerStream.getTracks().forEach((track) => {
      track.stop();
    });
    state.peerStream = null;
  }

  if (state.peer) {
    try {
      state.peer.destroy();
    } catch (error) {
      console.warn('No es pot destruir la instància de PeerJS', error);
    }
    state.peer = null;
  }

  state.peerId = null;
  removeStorage(STORAGE_KEYS.peerId);
  if (nextStatus) {
    setPeerStatus(nextStatus);
  }
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
    const shouldHideOverlay = normalisedContext?.type === 'stream-required' && !state.viewerActive;
    if (shouldHideOverlay) {
      elements.lockOverlay.classList.add('hidden');
    } else {
      elements.lockOverlay.classList.remove('hidden');
    }
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
  updateStatuses();
  broadcastPeerStatus({ event: 'lock-change', context: state.lockReason });
}

function resetViewer() {
  state.viewerActive = false;
  destroyPeerSession();
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

  updateConnectionStatusText();
  updateLockStateStatusText();
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

  const storedPeerStatus = readStorage(STORAGE_KEYS.peerStatus);
  if (storedPeerStatus && Object.values(PEER_STATUS).includes(storedPeerStatus)) {
    state.peerStatus = storedPeerStatus;
  }

  const storedPeerId = readStorage(STORAGE_KEYS.peerId);
  if (storedPeerId) {
    state.peerId = storedPeerId;
  }

  if (!canUsePeer()) {
    state.peerStatus = PEER_STATUS.unavailable;
  }

  const storedName = readStorage(STORAGE_KEYS.name);
  const normalisedName = normaliseDisplayText(storedName ?? '');
  state.name = normalisedName;
  if (normalisedName && elements.nameInput) {
    elements.nameInput.value = normalisedName;
  }

  const storedCode = readStorage(STORAGE_KEYS.lastCode);
  if (storedCode) {
    elements.codeInput.value = storedCode;
  }

  updateAttemptsInfo();
  updateConnectionStatusText();
  updateLockStateStatusText();
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

async function handleSubmit(event) {
  event.preventDefault();
  clearError();

  if (state.locked && state.lockReason?.type !== 'stream-required') {
    showError(state.messages.ui.errorLocked);
    return;
  }

  const nameValue = normaliseDisplayText(elements.nameInput?.value ?? '');
  if (!nameValue) {
    const errorMessage = state.messages.ui.errorNameMissing ?? state.messages.ui.errorInvalid;
    showError(errorMessage);
    elements.nameInput?.focus();
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

  state.name = nameValue;
  if (elements.nameInput) {
    elements.nameInput.value = nameValue;
  }
  state.activeCode = code;
  state.viewerActive = true;
  state.attemptsLeft = MAX_ATTEMPTS;
  persistAttempts();
  updateAttemptsInfo();
  writeStorage(STORAGE_KEYS.lastCode, code);
  writeStorage(STORAGE_KEYS.name, state.name);
  state.contentReady = false;

  const ui = state.messages?.ui;
  if (ui?.waitingStream) {
    showError(ui.waitingStream);
  }

  if (elements.submitButton) {
    elements.submitButton.disabled = true;
  }

  try {
    await initialisePeerSession();
  } catch (error) {
    handleStreamRequirementFailure(error);
    if (elements.submitButton) {
      elements.submitButton.disabled = false;
    }
    return;
  }

  if (elements.submitButton) {
    elements.submitButton.disabled = false;
  }

  elements.contentFrame.setAttribute('src', match.link);
  elements.fallbackLink.setAttribute('href', match.link);
  elements.accessScreen.classList.add('hidden');
  elements.viewer.classList.remove('hidden');
  disableMonitoring();
  elements.appHeader?.classList.add('hidden');

  applyViewerLayout(true);

  setLocked(false);

  clearError();
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

function handleStreamRequirementFailure(error = null) {
  if (error) {
    console.warn('La sessió requereix reprendre la compartició de pantalla', error);
  }
  if (state.lockReason?.type === 'stream-ended') {
    return;
  }

  state.viewerActive = false;
  state.contentReady = false;
  disableMonitoring();
  applyViewerLayout(false);

  elements.viewer.classList.add('hidden');
  elements.accessScreen.classList.remove('hidden');
  elements.appHeader?.classList.remove('hidden');
  elements.contentFrame.setAttribute('src', 'about:blank');
  elements.fallback.classList.add('hidden');
  elements.fallbackLink.setAttribute('href', '#');

  const monitorMessage = state.messages?.banner.monitor ?? '';
  setMonitoringMessage(monitorMessage);

  const ui = state.messages?.ui;
  if (ui) {
    const message = ui.errorStreamRequired ?? '';
    if (message) {
      showError(message);
    }
  }

  if (state.lockReason?.type !== 'stream-required') {
    addLockLogEntry('stream-required');
  }

  setLocked(true, { type: 'stream-required' });

  elements.codeInput.focus();
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
  if (state.lockReason?.type === 'stream-required' && !state.viewerActive) {
    elements.unlockForm.classList.add('hidden');
    clearUnlockError();
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

  window.addEventListener('beforeunload', () => {
    destroyPeerSession(null);
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
