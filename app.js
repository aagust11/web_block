const MAX_ATTEMPTS = 5;
const STORAGE_KEYS = {
  attempts: 'wb_attempts',
  locked: 'wb_locked',
  lastCode: 'wb_last_code'
};

const elements = {
  lockOverlay: document.getElementById('lockOverlay'),
  lockTitle: document.getElementById('lockTitle'),
  lockDescription: document.getElementById('lockDescription'),
  unlockButton: document.getElementById('unlockButton'),
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
  activeCode: null
};

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

  updateStatuses();
  updateAttemptsInfo();
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

function setLocked(isLocked) {
  state.locked = isLocked;
  if (isLocked) {
    writeStorage(STORAGE_KEYS.locked, 'true');
    elements.lockBadge.textContent = state.messages?.banner.locked ?? 'Bloquejat';
    elements.lockOverlay.classList.remove('hidden');
  } else {
    removeStorage(STORAGE_KEYS.locked);
    elements.lockBadge.textContent = state.messages?.banner.unlocked ?? 'Desbloquejat';
    elements.lockOverlay.classList.add('hidden');
  }
  updateAttemptsInfo();
}

function resetViewer() {
  state.viewerActive = false;
  state.activeCode = null;
  elements.viewer.classList.add('hidden');
  elements.accessScreen.classList.remove('hidden');
  elements.contentFrame.setAttribute('src', 'about:blank');
  elements.fallback.classList.add('hidden');
  elements.fallbackLink.setAttribute('href', '#');
  removeStorage(STORAGE_KEYS.lastCode);
  clearError();
  elements.codeInput.focus();
}

function engageLock(reason = '') {
  if (!state.viewerActive || state.locked) {
    return;
  }
  console.warn('Activant bloqueig per', reason);
  setLocked(true);
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
      setLocked(true);
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

  if (match.unlock) {
    setLocked(false);
  }

  elements.contentFrame.focus();
}

function handleFrameError() {
  elements.fallback.classList.remove('hidden');
  elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
}

function handleFrameLoad() {
  elements.fallback.classList.add('hidden');
  elements.monitorBadge.textContent = state.messages.banner.monitor;
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

  elements.accessForm.addEventListener('submit', handleSubmit);
  elements.unlockButton.addEventListener('click', () => {
    setLocked(false);
    state.attemptsLeft = MAX_ATTEMPTS;
    persistAttempts();
    updateAttemptsInfo();
    resetViewer();
  });

  elements.contentFrame.addEventListener('error', handleFrameError);
  elements.contentFrame.addEventListener('load', handleFrameLoad);

  document.addEventListener('visibilitychange', () => {
    updateStatuses();
    if (document.visibilityState !== 'visible') {
      elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
      engageLock('visibility');
    } else {
      elements.monitorBadge.textContent = state.messages.banner.monitor;
    }
  });

  window.addEventListener('blur', () => {
    updateStatuses();
    elements.monitorBadge.textContent = state.messages.ui.monitorBadgeFallback;
    engageLock('focus');
  });

  window.addEventListener('focus', () => {
    updateStatuses();
    if (!state.locked) {
      elements.monitorBadge.textContent = state.messages.banner.monitor;
    }
  });

  document.addEventListener('fullscreenchange', () => {
    updateStatuses();
    if (!document.fullscreenElement) {
      engageLock('fullscreen');
    }
  });

  if (state.locked) {
    elements.lockBadge.textContent = state.messages.banner.locked;
    elements.lockOverlay.classList.remove('hidden');
  } else {
    elements.lockBadge.textContent = state.messages.banner.unlocked;
  }

  elements.codeInput.focus();
}

init();
