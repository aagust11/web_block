const SUPPORTED_LANGUAGES = ['ca', 'es'];
const DEFAULT_LANGUAGE = 'ca';
const STORAGE_KEYS = {
  language: 'wb_language'
};
const ADMIN_PEER_ID = 'contrOwl-admin';

const state = {
  language: DEFAULT_LANGUAGE,
  messages: null,
  peer: null,
  peerStatus: 'offline',
  peerError: null,
  peerId: null,
  entries: new Map(),
  messageCache: new Map(),
  layoutMode: 'grid',
  focusedPeerId: null
};

const elements = {
  title: document.getElementById('adminTitle'),
  description: document.getElementById('adminDescription'),
  languageSelect: document.getElementById('adminLanguageSelect'),
  peerId: document.getElementById('adminPeerId'),
  connectionStatus: document.getElementById('adminConnectionStatus'),
  lockStatus: document.getElementById('adminLockStatus'),
  streamsCount: document.getElementById('adminStreamsCount'),
  grid: document.getElementById('adminGrid'),
  emptyState: document.getElementById('adminEmptyState'),
  layoutControls: document.getElementById('adminLayoutControls'),
  layoutGridButton: document.getElementById('adminLayoutGrid'),
  layoutFocusButton: document.getElementById('adminLayoutFocus'),
  focus: document.getElementById('adminFocus'),
  focusContent: document.getElementById('adminFocusContent'),
  focusEmpty: document.getElementById('adminFocusEmpty'),
  focusTitle: document.getElementById('adminFocusTitle'),
  focusName: document.getElementById('adminFocusName'),
  focusMeta: document.getElementById('adminFocusMeta'),
  focusStatus: document.getElementById('adminFocusStatus'),
  focusSurface: document.getElementById('adminFocusSurface'),
  focusSurfaceIcon: document.getElementById('adminFocusSurfaceIcon'),
  focusSurfaceText: document.getElementById('adminFocusSurfaceText'),
  focusVideo: document.getElementById('adminFocusVideo'),
  focusLock: document.getElementById('adminFocusLock'),
  focusUnlock: document.getElementById('adminFocusUnlock'),
  focusBack: document.getElementById('adminFocusBack'),
  focusCapture: document.getElementById('adminFocusCapture')
};

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

function normaliseLanguage(language) {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }
  const candidate = String(language).toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(candidate)) {
    return candidate;
  }
  const match = SUPPORTED_LANGUAGES.find((entry) => candidate.startsWith(entry));
  return match ?? DEFAULT_LANGUAGE;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No es pot carregar ${path}`);
  }
  return response.json();
}

async function loadMessages(language) {
  const cached = state.messageCache.get(language);
  if (cached) {
    return cached;
  }
  const messages = await fetchJson(`missatges.${language}.json`);
  state.messageCache.set(language, messages);
  return messages;
}

function setPeerStatus(status, error = null) {
  state.peerStatus = status;
  state.peerError = error;
  updateGlobalStatuses();
}

function updatePeerIdDisplay() {
  if (!elements.peerId) {
    return;
  }
  const adminMessages = state.messages?.admin;
  if (state.peerId && adminMessages?.peerId) {
    elements.peerId.textContent = adminMessages.peerId.replace('{id}', state.peerId);
    elements.peerId.classList.remove('hidden');
  } else {
    elements.peerId.textContent = '';
    elements.peerId.classList.add('hidden');
  }
}

function getConnectionLabel() {
  const adminMessages = state.messages?.admin ?? {};
  switch (state.peerStatus) {
    case 'ready':
      return adminMessages.statusReady ?? 'Servidor preparat';
    case 'error':
      return adminMessages.statusError ?? 'Error de connexió';
    case 'offline':
    default:
      return adminMessages.statusOffline ?? 'Connectant…';
  }
}

function updateGlobalStatuses() {
  if (elements.connectionStatus) {
    elements.connectionStatus.textContent = getConnectionLabel();
  }

  const adminMessages = state.messages?.admin ?? {};
  const lockedCount = Array.from(state.entries.values()).filter((entry) => entry.locked === true).length;
  const lockedTemplate = adminMessages.lockedCount ?? 'Bloquejos actius: {count}';
  if (elements.lockStatus) {
    elements.lockStatus.textContent = lockedTemplate.replace('{count}', String(lockedCount));
  }

  const streamsTemplate = adminMessages.streamsCount ?? 'Participants actius: {count}';
  if (elements.streamsCount) {
    elements.streamsCount.textContent = streamsTemplate.replace('{count}', String(state.entries.size));
  }

  updatePeerIdDisplay();
}

function updateEmptyState() {
  if (!elements.emptyState) {
    return;
  }
  const adminMessages = state.messages?.admin ?? {};
  const message = adminMessages.empty ?? 'Encara no hi ha transmissions actives.';
  elements.emptyState.textContent = message;
  elements.emptyState.classList.toggle('hidden', state.entries.size > 0);
}

function getFocusedEntry() {
  if (!state.focusedPeerId) {
    return null;
  }
  return state.entries.get(state.focusedPeerId) ?? null;
}

function updateLayoutControls() {
  const adminMessages = state.messages?.admin ?? {};
  if (elements.layoutControls && adminMessages.layoutLabel) {
    elements.layoutControls.setAttribute('aria-label', adminMessages.layoutLabel);
  }
  if (elements.layoutGridButton) {
    elements.layoutGridButton.textContent = adminMessages.layoutGrid ?? 'Vista en graella';
    elements.layoutGridButton.setAttribute('aria-pressed', state.layoutMode === 'grid' ? 'true' : 'false');
  }
  if (elements.layoutFocusButton) {
    elements.layoutFocusButton.textContent = adminMessages.layoutFocus ?? 'Vista enfocada';
    elements.layoutFocusButton.setAttribute('aria-pressed', state.layoutMode === 'focus' ? 'true' : 'false');
  }
  if (elements.focusBack) {
    elements.focusBack.textContent = adminMessages.focusBack ?? 'Torna a la graella';
  }
}

function updateFocusSurface(entry) {
  if (!elements.focusSurface || !elements.focusSurfaceIcon || !elements.focusSurfaceText) {
    return;
  }
  const hasSurface = entry.surfaceEl && !entry.surfaceEl.classList.contains('hidden');
  if (!hasSurface) {
    elements.focusSurface.classList.add('hidden');
    elements.focusSurfaceIcon.innerHTML = '';
    elements.focusSurfaceText.textContent = '';
    return;
  }

  const config = DISPLAY_SURFACE_VARIANTS[entry.displaySurface] ?? DISPLAY_SURFACE_VARIANTS.unknown;
  const adminMessages = state.messages?.admin ?? {};
  const label = entry.surfaceLabelEl?.textContent ?? adminMessages[config.messageKey] ?? config.fallback;
  elements.focusSurfaceText.textContent = label;
  elements.focusSurfaceIcon.innerHTML = '';
  try {
    const icon = config.createIcon();
    elements.focusSurfaceIcon.appendChild(icon);
  } catch (error) {
    console.warn('No es pot renderitzar la icona de la vista enfocada', error);
  }
  elements.focusSurface.classList.remove('hidden');
}

function updateFocusView() {
  updateLayoutControls();

  const adminMessages = state.messages?.admin ?? {};
  if (elements.focusEmpty) {
    elements.focusEmpty.textContent = adminMessages.focusEmpty ?? "Selecciona un participant per veure'l en focus.";
  }

  const isFocusMode = state.layoutMode === 'focus';
  const focusedEntry = getFocusedEntry();

  if (document.body) {
    document.body.classList.toggle('admin--focus-mode', isFocusMode);
    document.body.classList.toggle('admin--focus-active', isFocusMode && Boolean(focusedEntry));
  }

  if (!elements.focus) {
    return;
  }

  elements.focus.classList.toggle('admin-focus--visible', isFocusMode);

  if (!isFocusMode) {
    elements.focusContent?.classList.add('hidden');
    if (elements.focusEmpty) {
      elements.focusEmpty.classList.remove('hidden');
    }
    if (elements.focusVideo && elements.focusVideo.srcObject) {
      elements.focusVideo.srcObject = null;
    }
    if (elements.focusCapture) {
      elements.focusCapture.textContent = '';
      elements.focusCapture.classList.add('hidden');
    }
    return;
  }

  const hasEntry = Boolean(focusedEntry);
  elements.focusContent?.classList.toggle('hidden', !hasEntry);
  if (elements.focusEmpty) {
    elements.focusEmpty.classList.toggle('hidden', hasEntry);
  }

  if (!hasEntry) {
    if (elements.focusTitle) {
      elements.focusTitle.textContent = '';
    }
    if (elements.focusName) {
      elements.focusName.textContent = '';
    }
    if (elements.focusMeta) {
      elements.focusMeta.textContent = '';
    }
    if (elements.focusStatus) {
      elements.focusStatus.textContent = '';
    }
    if (elements.focusSurface) {
      elements.focusSurface.classList.add('hidden');
    }
    if (elements.focusVideo && elements.focusVideo.srcObject) {
      elements.focusVideo.srcObject = null;
    }
    if (elements.focusCapture) {
      elements.focusCapture.textContent = '';
      elements.focusCapture.classList.add('hidden');
    }
    return;
  }

  const entry = focusedEntry;
  if (elements.focusTitle) {
    elements.focusTitle.textContent = entry.titleEl?.textContent ?? '';
  }
  if (elements.focusName) {
    elements.focusName.textContent = entry.nameEl?.textContent ?? '';
  }
  if (elements.focusMeta) {
    elements.focusMeta.textContent = entry.metaEl?.textContent ?? '';
  }
  if (elements.focusStatus) {
    elements.focusStatus.textContent = entry.statusEl?.textContent ?? '';
  }

  updateFocusSurface(entry);

  if (elements.focusVideo) {
    if (entry.stream) {
      if (elements.focusVideo.srcObject !== entry.stream) {
        elements.focusVideo.srcObject = entry.stream;
      }
      elements.focusVideo.play?.().catch(() => {});
    } else if (elements.focusVideo.srcObject) {
      elements.focusVideo.srcObject = null;
    }
  }

  const adminLockLabel = adminMessages.tileActionLock ?? 'Bloqueja';
  const adminUnlockLabel = adminMessages.tileActionUnlock ?? 'Desbloqueja';

  if (elements.focusLock) {
    elements.focusLock.textContent = adminLockLabel;
    const canLock = entry.connection?.open === true && entry.locked !== true;
    elements.focusLock.disabled = !canLock;
  }
  if (elements.focusUnlock) {
    elements.focusUnlock.textContent = adminUnlockLabel;
    const canUnlock = entry.connection?.open === true && entry.locked === true;
    elements.focusUnlock.disabled = !canUnlock;
  }

  if (elements.focusCapture) {
    const captureText = entry.captureEl?.textContent ?? '';
    const shouldHide = !captureText || entry.captureEl?.classList.contains('hidden');
    elements.focusCapture.textContent = captureText;
    elements.focusCapture.classList.toggle('hidden', shouldHide);
  }
}

function setLayoutMode(mode) {
  const target = mode === 'focus' ? 'focus' : 'grid';
  if (state.layoutMode !== target) {
    state.layoutMode = target;
  }
  updateFocusView();
}

function setFocusedPeerId(peerId) {
  if (!peerId || !state.entries.has(peerId)) {
    state.focusedPeerId = null;
    updateFocusView();
    return;
  }
  state.focusedPeerId = peerId;
  if (state.layoutMode !== 'focus') {
    state.layoutMode = 'focus';
  }
  updateFocusView();
}

function formatTime(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  try {
    return date.toLocaleTimeString(state.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return date.toLocaleTimeString();
  }
}

function canUsePeer() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createLucideIcon(parts) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('admin-tile__surface-icon-image');

  parts.forEach((part) => {
    const element = document.createElementNS(SVG_NS, part.tag);
    Object.entries(part.attrs).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    svg.appendChild(element);
  });

  return svg;
}

const DISPLAY_SURFACE_VARIANTS = {
  monitor: {
    messageKey: 'tileSurfaceMonitor',
    fallback: 'Monitor',
    createIcon: () =>
      createLucideIcon([
        { tag: 'rect', attrs: { x: '2', y: '3', width: '20', height: '14', rx: '2', ry: '2' } },
        { tag: 'line', attrs: { x1: '8', y1: '21', x2: '16', y2: '21' } },
        { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '21' } }
      ])
  },
  window: {
    messageKey: 'tileSurfaceWindow',
    fallback: 'Window',
    createIcon: () =>
      createLucideIcon([
        { tag: 'path', attrs: { d: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z' } },
        { tag: 'path', attrs: { d: 'M2 10h20' } },
        { tag: 'path', attrs: { d: 'M6 6v4' } }
      ])
  },
  browser: {
    messageKey: 'tileSurfaceBrowser',
    fallback: 'Browser',
    createIcon: () =>
      createLucideIcon([
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
        { tag: 'path', attrs: { d: 'M2 12h20' } },
        { tag: 'path', attrs: { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z' } }
      ])
  },
  unknown: {
    messageKey: 'tileSurfaceUnknown',
    fallback: 'Unknown source',
    createIcon: () =>
      createLucideIcon([
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
        { tag: 'path', attrs: { d: 'M9.09 9a3 3 0 1 1 5.82 1c0 1.5-3 2-3 2' } },
        { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12.01', y2: '17' } }
      ])
  }
};

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

function renderEntrySurface(entry) {
  if (!entry?.surfaceEl) {
    return;
  }

  const surface = normaliseDisplaySurface(entry.displaySurface);
  entry.displaySurface = surface;
  const config = DISPLAY_SURFACE_VARIANTS[surface] ?? DISPLAY_SURFACE_VARIANTS.unknown;

  if (entry.surfaceIconEl) {
    const currentIcon = entry.surfaceIconEl.dataset.icon ?? '';
    if (currentIcon !== surface) {
      entry.surfaceIconEl.dataset.icon = surface;
      while (entry.surfaceIconEl.firstChild) {
        entry.surfaceIconEl.removeChild(entry.surfaceIconEl.firstChild);
      }
      try {
        const icon = config.createIcon();
        entry.surfaceIconEl.appendChild(icon);
      } catch (error) {
        console.warn('No es pot renderitzar la icona de la superfície compartida', error);
      }
    }
  }

  if (entry.surfaceLabelEl) {
    const adminMessages = state.messages?.admin ?? {};
    const label = adminMessages[config.messageKey] ?? config.fallback;
    entry.surfaceLabelEl.textContent = label;
  }

  entry.surfaceEl.classList.remove('hidden');

  if (state.focusedPeerId === entry.id) {
    updateFocusSurface(entry);
  }
}

function setEntrySurface(entry, surface) {
  if (!entry) {
    return;
  }
  entry.displaySurface = normaliseDisplaySurface(surface);
  renderEntrySurface(entry);
}

function getOrCreateEntry(peerId, metadata = {}) {
  let entry = state.entries.get(peerId);
  if (entry) {
    if (typeof metadata.code === 'string' && metadata.code.length > 0) {
      entry.code = metadata.code;
    }
    if (typeof metadata.locked === 'boolean') {
      entry.locked = metadata.locked;
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'name')) {
      if (typeof metadata.name === 'string') {
        const trimmedName = metadata.name.trim();
        entry.name = trimmedName;
      } else {
        entry.name = '';
      }
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'displaySurface')) {
      setEntrySurface(entry, metadata.displaySurface);
    }
    updateEntryTexts(entry);
    return entry;
  }

  const container = document.createElement('article');
  container.className = 'admin-tile';
  container.dataset.peerId = peerId;
  container.tabIndex = 0;
  container.setAttribute('role', 'group');

  const header = document.createElement('header');
  header.className = 'admin-tile__header';

  const title = document.createElement('h2');
  title.className = 'admin-tile__title';
  header.appendChild(title);

  const name = document.createElement('p');
  name.className = 'admin-tile__name';
  header.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'admin-tile__meta';
  header.appendChild(meta);

  const surface = document.createElement('p');
  surface.className = 'admin-tile__surface';
  const surfaceIcon = document.createElement('span');
  surfaceIcon.className = 'admin-tile__surface-icon';
  surface.appendChild(surfaceIcon);
  const surfaceLabel = document.createElement('span');
  surfaceLabel.className = 'admin-tile__surface-text';
  surface.appendChild(surfaceLabel);
  header.appendChild(surface);

  const status = document.createElement('p');
  status.className = 'admin-tile__status';
  header.appendChild(status);

  const media = document.createElement('div');
  media.className = 'admin-tile__media';

  const video = document.createElement('video');
  video.className = 'admin-tile__video';
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  media.appendChild(video);

  const canvas = document.createElement('canvas');
  canvas.className = 'admin-tile__canvas hidden';
  canvas.setAttribute('aria-hidden', 'true');
  media.appendChild(canvas);

  const footer = document.createElement('footer');
  footer.className = 'admin-tile__footer';

  const hint = document.createElement('p');
  hint.className = 'admin-tile__hint';
  footer.appendChild(hint);

  const actions = document.createElement('div');
  actions.className = 'admin-tile__actions';

  const lockButton = document.createElement('button');
  lockButton.type = 'button';
  lockButton.className = 'admin-tile__action admin-tile__action--lock';
  actions.appendChild(lockButton);

  const unlockButton = document.createElement('button');
  unlockButton.type = 'button';
  unlockButton.className = 'admin-tile__action admin-tile__action--unlock';
  actions.appendChild(unlockButton);

  footer.appendChild(actions);

  const capture = document.createElement('p');
  capture.className = 'admin-tile__capture';
  footer.appendChild(capture);

  container.appendChild(header);
  container.appendChild(media);
  container.appendChild(footer);

  entry = {
    id: peerId,
    code: metadata.code ?? null,
    locked: metadata.locked ?? null,
    name: typeof metadata.name === 'string' ? metadata.name.trim() : '',
    container,
    header,
    titleEl: title,
    nameEl: name,
    metaEl: meta,
    surfaceEl: surface,
    surfaceIconEl: surfaceIcon,
    surfaceLabelEl: surfaceLabel,
    displaySurface: normaliseDisplaySurface(metadata.displaySurface),
    statusEl: status,
    video,
    canvas,
    hintEl: hint,
    actionsEl: actions,
    lockButtonEl: lockButton,
    unlockButtonEl: unlockButton,
    captureEl: capture,
    call: null,
    connection: null,
    stream: null,
    lastCapture: null,
    lastMessageKey: null
  };

  const activateEntry = () => {
    if (state.layoutMode === 'focus') {
      setFocusedPeerId(peerId);
    } else {
      triggerLock(entry);
    }
  };

  container.addEventListener('click', (event) => {
    if (event.defaultPrevented) {
      return;
    }
    activateEntry();
  });

  container.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateEntry();
    }
  });

  lockButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    triggerLock(entry);
  });

  unlockButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    triggerUnlock(entry);
  });

  state.entries.set(peerId, entry);
  elements.grid?.appendChild(container);
  updateEntryTexts(entry);
  updateEmptyState();
  updateGlobalStatuses();

  return entry;
}

function removeEntry(peerId) {
  const entry = state.entries.get(peerId);
  if (!entry) {
    return;
  }
  if (entry.stream) {
    entry.stream.getTracks().forEach((track) => track.stop());
  }
  entry.video.srcObject = null;
  entry.canvas.classList.add('hidden');
  entry.container.remove();
  state.entries.delete(peerId);
  if (state.focusedPeerId === peerId) {
    state.focusedPeerId = null;
  }
  updateEmptyState();
  updateGlobalStatuses();
  updateFocusView();
}

function updateEntryTexts(entry) {
  const adminMessages = state.messages?.admin ?? {};
  entry.container.classList.toggle('admin-tile--locked', entry.locked === true);

  const titleTemplate = adminMessages.tileTitle ?? 'Participant {name}';
  const unknownTitleTemplate = adminMessages.tileTitleUnknown ?? 'Participant {id} · {name}';
  const unknownName = adminMessages.tileNameUnknown ?? 'Nom no assignat';
  const resolvedName = typeof entry.name === 'string' ? entry.name.trim() : '';
  const hasName = resolvedName.length > 0;
  const titleText = (hasName ? titleTemplate : unknownTitleTemplate)
    .replace('{name}', hasName ? resolvedName : unknownName)
    .replace('{id}', entry.id);
  entry.titleEl.textContent = titleText;

  if (entry.nameEl) {
    if (entry.name && entry.name.length > 0) {
      const nameTemplate = adminMessages.tileName ?? 'Nom: {name}';
      entry.nameEl.textContent = nameTemplate.replace('{name}', entry.name);
    } else {
      entry.nameEl.textContent = adminMessages.tileNameUnknown ?? 'Nom no assignat';
    }
  }

  if (entry.code) {
    const codeTemplate = adminMessages.tileCode ?? 'Codi: {code}';
    entry.metaEl.textContent = codeTemplate.replace('{code}', entry.code);
  } else {
    entry.metaEl.textContent = adminMessages.tileCodeUnknown ?? 'Codi no assignat';
  }

  let statusText;
  if (entry.locked === true) {
    statusText = adminMessages.tileStatusLocked ?? 'Bloqueig actiu';
  } else if (entry.locked === false) {
    statusText = adminMessages.tileStatusUnlocked ?? 'Monitoratge actiu';
  } else {
    statusText = adminMessages.tileStatusUnknown ?? 'Sense estat';
  }

  if (entry.lockButtonEl) {
    entry.lockButtonEl.textContent = adminMessages.tileActionLock ?? 'Bloqueja';
    const canLock = entry.connection?.open === true && entry.locked !== true;
    entry.lockButtonEl.disabled = !canLock;
  }

  if (entry.unlockButtonEl) {
    entry.unlockButtonEl.textContent = adminMessages.tileActionUnlock ?? 'Desbloqueja';
    const canUnlock = entry.connection?.open === true && entry.locked === true;
    entry.unlockButtonEl.disabled = !canUnlock;
  }

  if (entry.lastMessageKey) {
    const message = adminMessages[entry.lastMessageKey];
    if (message) {
      statusText = `${statusText} · ${message}`;
    }
  }

  entry.statusEl.textContent = statusText;
  if (entry.hintEl) {
    entry.hintEl.textContent = '';
    entry.hintEl.classList.add('hidden');
  }

  renderEntrySurface(entry);

  if (entry.lastCapture) {
    const captureTemplate = adminMessages.tileCapture ?? 'Darrera captura: {time}';
    entry.captureEl.textContent = captureTemplate.replace('{time}', formatTime(entry.lastCapture));
    entry.captureEl.classList.remove('hidden');
    entry.canvas.classList.remove('hidden');
  } else {
    entry.captureEl.textContent = adminMessages.tileCaptureEmpty ?? 'Encara no s\'ha capturat cap fotograma.';
    entry.captureEl.classList.remove('hidden');
    entry.canvas.classList.add('hidden');
  }

  if (state.focusedPeerId === entry.id) {
    updateFocusView();
  }
}

function captureFrame(entry, options = {}) {
  const { captureBlob = false } = options;
  const video = entry.video;
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return captureBlob ? Promise.resolve(null) : null;
  }
  const canvas = entry.canvas;
  const context = canvas.getContext('2d');
  if (!context) {
    return captureBlob ? Promise.resolve(null) : null;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  entry.lastCapture = new Date();
  updateEntryTexts(entry);
  if (!captureBlob) {
    return null;
  }
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob ?? null);
      }, 'image/png');
    });
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const [header, data] = dataUrl.split(',');
    if (!header || !data) {
      return Promise.resolve(null);
    }
    const mimeMatch = header.match(/data:(.*);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = window.atob(data);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return Promise.resolve(new Blob([bytes], { type: mimeType }));
  } catch (error) {
    console.warn('No es pot serialitzar la captura', error);
    return Promise.resolve(null);
  }
}

function buildCaptureFilename(entry) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const sanitizeSegment = (value, fallback) => {
    if (typeof value !== 'string') {
      return fallback;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    const safe = trimmed
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return safe.length > 0 ? safe : fallback;
  };
  const codePart = sanitizeSegment(entry.code, 'unknown-code');
  const namePart = sanitizeSegment(entry.name, 'unknown-name');
  return `${datePart}_${codePart}_${namePart}.png`;
}

async function triggerLock(entry) {
  const blobPromise = captureFrame(entry, { captureBlob: true });
  if (entry.connection && entry.connection.open) {
    try {
      entry.connection.send({ type: 'lock', locked: true, reason: 'admin-click' });
      entry.lastMessageKey = 'lockSent';
    } catch (error) {
      console.warn('No es pot enviar l\'ordre de bloqueig', error);
    }
  }
  const blob = await blobPromise;
  if (blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildCaptureFilename(entry);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
  updateEntryTexts(entry);
}

function triggerUnlock(entry) {
  if (entry.connection && entry.connection.open) {
    try {
      entry.connection.send({ type: 'lock', locked: false, reason: 'admin-unlock', restartMonitoring: true });
      entry.lastMessageKey = 'unlockSent';
    } catch (error) {
      console.warn('No es pot enviar l\'ordre de desbloqueig', error);
    }
  }
  updateEntryTexts(entry);
}

function handleEntryData(entry, payload) {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  if (payload.type !== 'status') {
    return;
  }

  if (typeof payload.locked === 'boolean') {
    entry.locked = payload.locked;
  }

  if (typeof payload.code === 'string' && payload.code.length > 0) {
    entry.code = payload.code;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    if (typeof payload.name === 'string') {
      entry.name = payload.name.trim();
    } else {
      entry.name = '';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'displaySurface')) {
    setEntrySurface(entry, payload.displaySurface);
  }

  if (payload.event === 'lock-change') {
    entry.lastMessageKey = null;
  }

  updateEntryTexts(entry);
  updateGlobalStatuses();
}

function handleIncomingCall(call) {
  const peerId = call.peer;
  const entry = getOrCreateEntry(peerId, call.metadata ?? {});
  entry.call = call;
  if (call.metadata && Object.prototype.hasOwnProperty.call(call.metadata, 'displaySurface')) {
    setEntrySurface(entry, call.metadata.displaySurface);
  }

  call.answer();
  call.on('stream', (stream) => {
    if (entry.stream && entry.stream !== stream) {
      entry.stream.getTracks().forEach((track) => track.stop());
    }
    entry.stream = stream;
    entry.video.srcObject = stream;
    entry.video.play().catch(() => {});
    updateEntryTexts(entry);
  });

  const cleanup = () => {
    if (entry.stream) {
      entry.stream.getTracks().forEach((track) => track.stop());
    }
    entry.stream = null;
    entry.video.srcObject = null;
    entry.call = null;
    updateEntryTexts(entry);
    if (!entry.connection) {
      removeEntry(peerId);
    }
    updateGlobalStatuses();
  };

  call.on('close', cleanup);
  call.on('error', (error) => {
    console.warn('Error en la trucada entrant', error);
    cleanup();
  });
}

function handleDataConnection(connection) {
  const peerId = connection.peer;
  const entry = getOrCreateEntry(peerId, connection.metadata ?? {});
  entry.connection = connection;

  connection.on('data', (payload) => {
    handleEntryData(entry, payload);
  });

  connection.on('close', () => {
    entry.connection = null;
    if (!entry.call) {
      removeEntry(peerId);
    } else {
      updateEntryTexts(entry);
      updateGlobalStatuses();
    }
  });

  connection.on('error', (error) => {
    console.warn('Error al canal de dades', error);
    entry.connection = null;
    if (!entry.call) {
      removeEntry(peerId);
    }
  });
}

async function applyLanguage(language, { persist = true } = {}) {
  const targetLanguage = normaliseLanguage(language);
  const messages = await loadMessages(targetLanguage);
  state.language = targetLanguage;
  state.messages = messages;
  document.documentElement.setAttribute('lang', targetLanguage);
  elements.languageSelect.value = targetLanguage;
  if (persist) {
    writeStorage(STORAGE_KEYS.language, targetLanguage);
  }

  const adminMessages = messages.admin ?? {};
  elements.title.textContent = adminMessages.title ?? 'contrOwl · Administració';
  elements.description.textContent = adminMessages.description ?? '';

  updateGlobalStatuses();
  updateEmptyState();
  updatePeerIdDisplay();

  state.entries.forEach((entry) => {
    updateEntryTexts(entry);
  });

  updateFocusView();
}

function initialiseLanguage() {
  const storedLanguage = readStorage(STORAGE_KEYS.language);
  const htmlLanguage = document.documentElement.getAttribute('lang');
  const browserLanguage = navigator?.language;
  const initialLanguage = normaliseLanguage(storedLanguage ?? htmlLanguage ?? browserLanguage ?? DEFAULT_LANGUAGE);
  state.language = initialLanguage;
  document.documentElement.setAttribute('lang', initialLanguage);
  if (elements.languageSelect) {
    elements.languageSelect.value = initialLanguage;
  }
}

function initialisePeer() {
  if (!canUsePeer()) {
    setPeerStatus('error');
    return;
  }

  const peer = new window.Peer(ADMIN_PEER_ID, { debug: 0 });
  state.peer = peer;
  setPeerStatus('offline');

  peer.on('open', (id) => {
    state.peerId = id;
    setPeerStatus('ready');
    updatePeerIdDisplay();
  });

  peer.on('call', handleIncomingCall);
  peer.on('connection', handleDataConnection);

  peer.on('close', () => {
    state.peerId = null;
    setPeerStatus('offline');
    updatePeerIdDisplay();
  });

  peer.on('disconnected', () => {
    setPeerStatus('offline');
    peer.reconnect();
  });

  peer.on('error', (error) => {
    console.warn('Error de PeerJS', error);
    state.peerId = null;
    setPeerStatus('error', error);
  });
}

async function init() {
  initialiseLanguage();
  try {
    await applyLanguage(state.language, { persist: false });
  } catch (error) {
    console.error('No es poden carregar els missatges', error);
  }

  updateFocusView();

  elements.languageSelect?.addEventListener('change', async (event) => {
    const value = event.target?.value ?? state.language;
    try {
      await applyLanguage(value);
    } catch (error) {
      console.error('No es pot aplicar l\'idioma', error);
      event.target.value = state.language;
    }
  });

  elements.layoutGridButton?.addEventListener('click', (event) => {
    event.preventDefault();
    setLayoutMode('grid');
  });

  elements.layoutFocusButton?.addEventListener('click', (event) => {
    event.preventDefault();
    setLayoutMode('focus');
  });

  elements.focusBack?.addEventListener('click', (event) => {
    event.preventDefault();
    setLayoutMode('grid');
  });

  elements.focusLock?.addEventListener('click', (event) => {
    event.preventDefault();
    const entry = getFocusedEntry();
    if (entry) {
      triggerLock(entry);
    }
  });

  elements.focusUnlock?.addEventListener('click', (event) => {
    event.preventDefault();
    const entry = getFocusedEntry();
    if (entry) {
      triggerUnlock(entry);
    }
  });

  initialisePeer();
}

init();
