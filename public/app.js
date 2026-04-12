// ─── FFFFOUND — Private Visual Browser ───
// Taste-learning infinite image feed over the Are.na FFFFOUND archive

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
import {
  browserLocalPersistence, GoogleAuthProvider, FacebookAuthProvider,
  getAuth, onAuthStateChanged, setPersistence, signInWithPopup, signOut
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, getFirestore,
  serverTimestamp, setDoc, writeBatch, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js';

// ─── CONFIG ───

const CHANNEL = 'ffffound-archive';
const PER_PAGE = 60;
const PRELOAD_THRESHOLD = 1200; // px from bottom to trigger load
const DIVERSITY_PENALTY = 2.5;
const RECENCY_DECAY = 0.92;
const STOPWORDS = new Set([
  'the','and','for','with','from','this','that','into','your','their','have',
  'been','just','only','also','very','about','some','over','more','than','were',
  'then','when','what','will','would','could','there','them','they','like',
  'image','photo','untitled','www','http','https','jpeg','png','jpg','gif',
  'webp','block','attachment','upload','source','none','null','undefined'
]);

// ─── STATE ───

const KEYS = {
  interactions: 'ff-interactions-v5',
  folders: 'ff-folders-v5',
  settings: 'ff-settings-v5',
  cache: 'ff-cache-v5'
};

const state = {
  pool: [],              // all loaded Are.na items
  rendered: [],          // currently rendered item IDs (in DOM order)
  ranked: [],            // scored + sorted items ready to render
  page: 1,
  loading: false,
  hasMore: true,
  renderCursor: 0,       // how far into ranked[] we've rendered
  batchSize: 30,         // items per render batch

  interactions: load(KEYS.interactions, {}),   // { [id]: { score, seen, ts } }
  folders: load(KEYS.folders, {}),             // { [name]: [id, id, ...] }
  settings: load(KEYS.settings, { theme: 'light' }),

  viewerOpen: false,
  viewerIndex: -1,
  viewerItems: [],       // reference to ranked items for nav

  // Firebase
  fb: { enabled: false, app: null, auth: null, db: null, user: null }
};

// ─── ELEMENTS ───

const $ = id => document.getElementById(id);
const el = {
  feed: $('feed'),
  sentinel: $('sentinel'),
  loader: $('loader'),
  viewer: $('viewer'),
  viewerImg: $('viewerImg'),
  viewerBar: $('viewerBar'),
  viewerStatus: $('viewerStatus'),
  vLike: $('vLike'),
  vDislike: $('vDislike'),
  vSave: $('vSave'),
  vDownload: $('vDownload'),
  vPrev: $('vPrev'),
  vNext: $('vNext'),
  saveModal: $('saveModal'),
  folderList: $('folderList'),
  newFolderInput: $('newFolderInput'),
  foldersPanel: $('foldersPanel'),
  panelList: $('panelList'),
  panelBack: $('panelBack'),
};

// ─── INIT ───

(async function init() {
  applyTheme();
  bindEvents();
  await initFirebase();
  await loadPage();
  rankAndRender();
  observeScroll();
})();

// ─── EVENTS ───

function bindEvents() {
  // Theme
  $('btnTheme').onclick = () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persist(KEYS.settings, state.settings);
    applyTheme();
  };

  // Folders panel
  $('btnFolders').onclick = () => openPanel();
  $('panelClose').onclick = () => closePanel();
  $('panelBack').onclick = () => panelShowAll();
  document.querySelector('.panel-backdrop').onclick = () => closePanel();

  // Save modal
  $('saveModalClose').onclick = () => closeSaveModal();
  document.querySelector('.modal-backdrop').onclick = () => closeSaveModal();
  $('newFolderBtn').onclick = () => createFolder();
  el.newFolderInput.addEventListener('keydown', e => { if (e.key === 'Enter') createFolder(); });

  // Viewer controls
  $('viewerBackdrop').onclick = () => closeViewer();
  el.vLike.onclick = () => voteViewer(1);
  el.vDislike.onclick = () => voteViewer(-1);
  el.vSave.onclick = () => openSaveModal();
  el.vPrev.onclick = () => navigateViewer(-1);
  el.vNext.onclick = () => navigateViewer(1);

  // Export / Import
  $('exportBtn').onclick = exportProfile;
  $('importInput').onchange = importProfile;

  // Keyboard
  document.addEventListener('keydown', handleKey);

  // Touch swipe in viewer
  let touchX = 0;
  el.viewer.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  el.viewer.addEventListener('touchend', e => {
    if (!state.viewerOpen) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) navigateViewer(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function handleKey(e) {
  // Viewer open
  if (state.viewerOpen) {
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight' || e.key === 'j') navigateViewer(1);
    else if (e.key === 'ArrowLeft' || e.key === 'k') navigateViewer(-1);
    else if (e.key === 'f') voteViewer(1);
    else if (e.key === 'x') voteViewer(-1);
    else if (e.key === 's') openSaveModal();
    else if (e.key === 'o') { const item = currentViewerItem(); if (item) window.open(item.imageUrl, '_blank'); }
    return;
  }

  // Save modal open
  if (!el.saveModal.classList.contains('hidden')) {
    if (e.key === 'Escape') closeSaveModal();
    return;
  }

  // Panel open
  if (!el.foldersPanel.classList.contains('hidden')) {
    if (e.key === 'Escape') closePanel();
    return;
  }
}

// ─── THEME ───

function applyTheme() {
  document.body.classList.toggle('dark', state.settings.theme === 'dark');
}

// ─── ARE.NA FETCH ───

async function loadPage() {
  if (state.loading || !state.hasMore) return;
  state.loading = true;
  el.loader.classList.remove('hidden');

  try {
    const url = `https://api.are.na/v2/channels/${CHANNEL}/contents?page=${state.page}&per=${PER_PAGE}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const items = (json.contents || []).filter(x => x.image).map(normalizeItem);
    if (items.length < PER_PAGE) state.hasMore = false;

    // Deduplicate
    const existing = new Set(state.pool.map(i => i.id));
    const fresh = items.filter(i => !existing.has(i.id));
    state.pool.push(...fresh);
    state.page++;

    // Preload next page in background
    if (state.hasMore) preloadNext();
  } catch (err) {
    console.error('Feed load failed:', err);
    state.hasMore = false;
  } finally {
    state.loading = false;
    el.loader.classList.add('hidden');
  }
}

async function preloadNext() {
  if (state.loading) return;
  try {
    const url = `https://api.are.na/v2/channels/${CHANNEL}/contents?page=${state.page}&per=${PER_PAGE}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const items = (json.contents || []).filter(x => x.image).map(normalizeItem);
    if (items.length < PER_PAGE) state.hasMore = false;
    const existing = new Set(state.pool.map(i => i.id));
    state.pool.push(...items.filter(i => !existing.has(i.id)));
    state.page++;
  } catch { /* silent */ }
}

function normalizeItem(raw) {
  const img = raw.image || {};
  return {
    id: String(raw.id),
    thumbUrl: img.display?.url || img.thumb?.url || img.original?.url || '',
    imageUrl: img.original?.url || img.display?.url || '',
    title: raw.title || raw.generated_title || '',
    description: raw.description || raw.content || '',
    domain: safeDomain(raw.source?.url || ''),
    sourceUrl: raw.source?.url || '',
    w: img.original?.width || img.display?.width || 1000,
    h: img.original?.height || img.display?.height || 1000,
    connectedAt: raw.connected_at || ''
  };
}

// ─── TASTE PROFILE ───

function buildProfile() {
  const tokenW = {};
  const domainW = {};
  const aspectW = {};
  const entries = Object.entries(state.interactions);

  // Weight recent interactions more
  const sorted = entries
    .filter(([, v]) => v.score !== 0)
    .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));

  sorted.forEach(([id, v], idx) => {
    const item = state.pool.find(i => i.id === id);
    if (!item) return;

    const decay = Math.pow(RECENCY_DECAY, idx);
    const weight = v.score * decay;

    for (const tok of tokenize(`${item.title} ${item.description} ${item.domain}`)) {
      tokenW[tok] = (tokenW[tok] || 0) + weight;
    }

    if (item.domain) {
      domainW[item.domain] = (domainW[item.domain] || 0) + weight;
    }

    const aspect = aspectBucket(item);
    aspectW[aspect] = (aspectW[aspect] || 0) + weight;
  });

  return { tokenW, domainW, aspectW };
}

function scoreItem(item, profile, domainCounts) {
  const interaction = state.interactions[item.id];

  // Hard suppress: downvoted items
  if (interaction && interaction.score < -1) return -9999;

  let s = 0;

  // Token similarity
  const tokens = tokenize(`${item.title} ${item.description} ${item.domain}`);
  for (const tok of tokens) {
    s += (profile.tokenW[tok] || 0) * 2.5;
  }

  // Domain affinity
  s += (profile.domainW[item.domain] || 0) * 3.5;

  // Aspect preference
  s += (profile.aspectW[aspectBucket(item)] || 0) * 4;

  // Direct vote boost
  if (interaction) {
    s += interaction.score * 50;
  }

  // Freshness: unseen items get a bonus
  if (!interaction || !interaction.seen) {
    s += 15;
  }

  // Domain diversity penalty
  const domCount = domainCounts[item.domain] || 0;
  s -= domCount * DIVERSITY_PENALTY;
  domainCounts[item.domain] = domCount + 1;

  // Serendipity noise
  s += Math.random() * 5;

  return s;
}

function rankAndRender(appendMode = false) {
  const profile = buildProfile();
  const domainCounts = {};

  const scored = state.pool
    .map(item => ({ item, score: scoreItem(item, profile, domainCounts) }))
    .filter(x => x.score > -5000)
    .sort((a, b) => b.score - a.score);

  state.ranked = scored.map(x => x.item);
  state.viewerItems = state.ranked;

  if (!appendMode) {
    el.feed.innerHTML = '';
    state.renderCursor = 0;
    state.rendered = [];
  }

  renderBatch();
}

function renderBatch() {
  const end = Math.min(state.renderCursor + state.batchSize, state.ranked.length);
  const fragment = document.createDocumentFragment();

  for (let i = state.renderCursor; i < end; i++) {
    const item = state.ranked[i];
    if (state.rendered.includes(item.id)) continue;

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = item.thumbUrl;
    img.alt = '';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => card.remove();

    card.appendChild(img);

    // Vote badge
    const interaction = state.interactions[item.id];
    if (interaction) {
      const badge = document.createElement('span');
      if (interaction.score > 0) {
        badge.className = 'vote-badge liked';
        badge.textContent = '♥';
        card.appendChild(badge);
      } else if (interaction.score < 0) {
        badge.className = 'vote-badge disliked';
        badge.textContent = '×';
        card.appendChild(badge);
      }
    }

    // Check if saved in any folder
    const inFolder = Object.values(state.folders).some(ids => ids.includes(item.id));
    if (inFolder && !(interaction && interaction.score !== 0)) {
      const badge = document.createElement('span');
      badge.className = 'vote-badge saved';
      badge.textContent = '⊞';
      card.appendChild(badge);
    }

    card.onclick = () => openViewer(item);
    fragment.appendChild(card);
    state.rendered.push(item.id);
  }

  el.feed.appendChild(fragment);
  state.renderCursor = end;
}

// ─── INFINITE SCROLL ───

function observeScroll() {
  const observer = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return;

    // Render more from ranked buffer
    if (state.renderCursor < state.ranked.length) {
      renderBatch();
      return;
    }

    // Load more from Are.na
    if (state.hasMore && !state.loading) {
      await loadPage();
      rankAndRender(false); // re-rank with new items
    }
  }, { rootMargin: `${PRELOAD_THRESHOLD}px` });

  observer.observe(el.sentinel);
}

// ─── VIEWER ───

function openViewer(item) {
  state.viewerOpen = true;
  state.viewerIndex = state.viewerItems.findIndex(i => i.id === item.id);
  if (state.viewerIndex < 0) state.viewerIndex = 0;

  showViewerItem();
  el.viewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  markSeen(item.id);
}

function closeViewer() {
  state.viewerOpen = false;
  el.viewer.classList.add('hidden');
  document.body.style.overflow = '';
}

function navigateViewer(dir) {
  const len = state.viewerItems.length;
  if (len === 0) return;
  state.viewerIndex = (state.viewerIndex + dir + len) % len;
  showViewerItem();
  markSeen(state.viewerItems[state.viewerIndex].id);
}

function showViewerItem() {
  const item = currentViewerItem();
  if (!item) return;

  el.viewerImg.src = item.imageUrl || item.thumbUrl;
  el.vDownload.href = item.imageUrl || item.thumbUrl;

  // Update button states
  const interaction = state.interactions[item.id] || {};
  el.vLike.classList.toggle('active-like', interaction.score > 0);
  el.vDislike.classList.toggle('active-dislike', interaction.score < 0);

  // Status
  const pos = state.viewerIndex + 1;
  const total = state.viewerItems.length;
  el.viewerStatus.textContent = `${pos} / ${total}`;
}

function currentViewerItem() {
  return state.viewerItems[state.viewerIndex] || null;
}

// ─── VOTING ───

function voteViewer(value) {
  const item = currentViewerItem();
  if (!item) return;

  const existing = state.interactions[item.id] || { score: 0, seen: true, ts: Date.now() };

  // Toggle: if already voted same way, undo
  if (existing.score === value) {
    existing.score = 0;
  } else {
    existing.score = clamp(existing.score + value, -3, 5);
  }
  existing.seen = true;
  existing.ts = Date.now();

  state.interactions[item.id] = existing;
  persist(KEYS.interactions, state.interactions);
  showViewerItem();

  if (value > 0) toast('liked');
  else if (value < 0) toast('hidden from feed');
  else toast('vote removed');

  syncIfReady(item.id);

  // Auto-advance on dislike
  if (value < 0) {
    setTimeout(() => navigateViewer(1), 200);
  }
}

function markSeen(id) {
  const existing = state.interactions[id] || { score: 0, ts: Date.now() };
  existing.seen = true;
  if (!existing.ts) existing.ts = Date.now();
  state.interactions[id] = existing;
  persist(KEYS.interactions, state.interactions);
}

// ─── FOLDERS / COLLECTIONS ───

function openSaveModal() {
  const item = currentViewerItem();
  if (!item) return;

  el.saveModal.classList.remove('hidden');
  renderFolderList(item.id);
}

function closeSaveModal() {
  el.saveModal.classList.add('hidden');
}

function renderFolderList(itemId) {
  el.folderList.innerHTML = '';
  const names = Object.keys(state.folders).sort();

  if (names.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px 14px;color:var(--muted);font-size:11px;text-align:center;';
    empty.textContent = 'no collections yet';
    el.folderList.appendChild(empty);
    return;
  }

  names.forEach(name => {
    const ids = state.folders[name];
    const inFolder = ids.includes(itemId);

    const div = document.createElement('div');
    div.className = 'folder-item' + (inFolder ? ' in-folder' : '');
    div.innerHTML = `<span>${esc(name)}</span><span class="count">${ids.length}${inFolder ? ' ✓' : ''}</span>`;
    div.onclick = () => {
      toggleInFolder(name, itemId);
      renderFolderList(itemId);
    };
    el.folderList.appendChild(div);
  });
}

function createFolder() {
  const name = el.newFolderInput.value.trim();
  if (!name) return;
  if (state.folders[name]) { toast('already exists'); return; }

  state.folders[name] = [];
  persist(KEYS.folders, state.folders);
  el.newFolderInput.value = '';
  toast(`created "${name}"`);

  // If save modal is open, re-render list
  const item = currentViewerItem();
  if (item && !el.saveModal.classList.contains('hidden')) {
    renderFolderList(item.id);
  }
}

function toggleInFolder(folderName, itemId) {
  const ids = state.folders[folderName] || [];
  const idx = ids.indexOf(itemId);
  if (idx >= 0) {
    ids.splice(idx, 1);
    toast(`removed from "${folderName}"`);
  } else {
    ids.push(itemId);
    toast(`saved to "${folderName}"`);
  }
  state.folders[folderName] = ids;
  persist(KEYS.folders, state.folders);
}

// ─── FOLDERS PANEL ───

let panelMode = 'list'; // 'list' | 'folder'
let panelFolder = null;

function openPanel() {
  el.foldersPanel.classList.remove('hidden');
  panelMode = 'list';
  panelFolder = null;
  renderPanel();
}

function closePanel() {
  el.foldersPanel.classList.add('hidden');
}

function panelShowAll() {
  panelMode = 'list';
  panelFolder = null;
  renderPanel();
}

function renderPanel() {
  el.panelBack.classList.toggle('hidden', panelMode === 'list');

  if (panelMode === 'list') {
    renderPanelList();
  } else {
    renderPanelFolder();
  }
}

function renderPanelList() {
  el.panelList.innerHTML = '';
  const names = Object.keys(state.folders).sort();

  // Stats
  const likedCount = Object.values(state.interactions).filter(v => v.score > 0).length;
  const dislikedCount = Object.values(state.interactions).filter(v => v.score < 0).length;

  const statsDiv = document.createElement('div');
  statsDiv.style.cssText = 'padding:12px 16px;font-size:10px;color:var(--muted);letter-spacing:0.08em;border-bottom:1px solid var(--line);';
  statsDiv.textContent = `${likedCount} liked · ${dislikedCount} hidden · ${state.pool.length} loaded`;
  el.panelList.appendChild(statsDiv);

  // Liked virtual folder
  if (likedCount > 0) {
    const likedDiv = document.createElement('div');
    likedDiv.className = 'panel-folder';
    likedDiv.innerHTML = `<span>♥ all liked</span><span class="f-count">${likedCount}</span>`;
    likedDiv.onclick = () => {
      panelMode = 'folder';
      panelFolder = '__liked__';
      renderPanel();
    };
    el.panelList.appendChild(likedDiv);
  }

  if (names.length === 0 && likedCount === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:30px 16px;color:var(--muted);font-size:11px;text-align:center;';
    empty.textContent = 'no collections yet — save images from the viewer';
    el.panelList.appendChild(empty);
    return;
  }

  names.forEach(name => {
    const count = state.folders[name].length;
    const div = document.createElement('div');
    div.className = 'panel-folder';

    const label = document.createElement('span');
    label.textContent = name;

    const right = document.createElement('span');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const cnt = document.createElement('span');
    cnt.className = 'f-count';
    cnt.textContent = count;

    const del = document.createElement('button');
    del.className = 'panel-folder-delete';
    del.textContent = 'delete';
    del.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${name}"?`)) {
        delete state.folders[name];
        persist(KEYS.folders, state.folders);
        renderPanel();
      }
    };

    right.appendChild(cnt);
    right.appendChild(del);
    div.appendChild(label);
    div.appendChild(right);

    div.onclick = () => {
      panelMode = 'folder';
      panelFolder = name;
      renderPanel();
    };
    el.panelList.appendChild(div);
  });
}

function renderPanelFolder() {
  el.panelList.innerHTML = '';

  let ids;
  if (panelFolder === '__liked__') {
    ids = Object.entries(state.interactions)
      .filter(([, v]) => v.score > 0)
      .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
      .map(([id]) => id);
  } else {
    ids = state.folders[panelFolder] || [];
  }

  if (ids.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:30px 16px;color:var(--muted);font-size:11px;text-align:center;';
    empty.textContent = 'empty';
    el.panelList.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'panel-images';

  ids.forEach(id => {
    const item = state.pool.find(i => i.id === id);
    if (!item) return;
    const img = document.createElement('img');
    img.src = item.thumbUrl;
    img.loading = 'lazy';
    img.alt = '';
    img.onclick = () => {
      closePanel();
      openViewer(item);
    };
    grid.appendChild(img);
  });

  el.panelList.appendChild(grid);
}

// ─── EXPORT / IMPORT ───

function exportProfile() {
  const payload = {
    exportedAt: new Date().toISOString(),
    interactions: state.interactions,
    folders: state.folders,
    settings: state.settings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ffffound-profile.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('profile exported');
}

async function importProfile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (parsed.interactions) {
      state.interactions = mergeInteractions(state.interactions, parsed.interactions);
    }
    if (parsed.folders) {
      Object.entries(parsed.folders).forEach(([name, ids]) => {
        state.folders[name] = [...new Set([...(state.folders[name] || []), ...ids])];
      });
    }
    persist(KEYS.interactions, state.interactions);
    persist(KEYS.folders, state.folders);
    rankAndRender();
    toast('profile imported');
  } catch (err) {
    console.error(err);
    toast('import failed');
  }
  e.target.value = '';
}

// ─── FIREBASE AUTH ───

async function initFirebase() {
  const cfg = window.FFFFOUND_FIREBASE || {};
  if (!cfg.enabled || !cfg.config?.apiKey) return;

  try {
    state.fb.app = initializeApp(cfg.config);
    state.fb.auth = getAuth(state.fb.app);
    state.fb.db = getFirestore(state.fb.app);
    state.fb.enabled = true;
    await setPersistence(state.fb.auth, browserLocalPersistence);

    onAuthStateChanged(state.fb.auth, async user => {
      state.fb.user = user || null;
      if (user) {
        toast(`synced as ${user.displayName || user.email}`);
        await pullFromCloud();
        rankAndRender();
      }
    });
  } catch (err) {
    console.error('Firebase init failed:', err);
    state.fb.enabled = false;
  }
}

function canSync() {
  return state.fb.enabled && state.fb.db && state.fb.user;
}

let syncTimer = null;
function syncIfReady(itemId) {
  if (!canSync()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToCloud(itemId), 800);
}

async function pushToCloud(itemId) {
  if (!canSync()) return;
  try {
    const uid = state.fb.user.uid;
    // Push interaction
    if (itemId && state.interactions[itemId]) {
      const ref = doc(state.fb.db, 'users', uid, 'interactions', itemId);
      await setDoc(ref, { ...state.interactions[itemId], syncedAt: serverTimestamp() }, { merge: true });
    }
    // Push folders
    const fRef = doc(state.fb.db, 'users', uid, 'private', 'folders');
    await setDoc(fRef, { data: state.folders, syncedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('Sync push failed:', err);
  }
}

async function pullFromCloud() {
  if (!canSync()) return;
  try {
    const uid = state.fb.user.uid;
    // Pull interactions
    const iSnap = await getDocs(collection(state.fb.db, 'users', uid, 'interactions'));
    const remote = {};
    iSnap.forEach(d => { remote[d.id] = d.data(); });
    state.interactions = mergeInteractions(state.interactions, remote);

    // Pull folders
    const fSnap = await getDoc(doc(state.fb.db, 'users', uid, 'private', 'folders'));
    if (fSnap.exists()) {
      const remoteFolders = fSnap.data().data || {};
      Object.entries(remoteFolders).forEach(([name, ids]) => {
        state.folders[name] = [...new Set([...(state.folders[name] || []), ...ids])];
      });
    }

    persist(KEYS.interactions, state.interactions);
    persist(KEYS.folders, state.folders);
  } catch (err) {
    console.error('Sync pull failed:', err);
  }
}

// ─── UTILITIES ───

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function aspectBucket(item) {
  const r = (item.w || 1) / (item.h || 1);
  if (r < 0.82) return 'portrait';
  if (r > 1.18) return 'landscape';
  return 'square';
}

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mergeInteractions(a, b) {
  const merged = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    const curr = merged[k];
    if (!curr) { merged[k] = v; continue; }
    if ((v.ts || 0) > (curr.ts || 0)) merged[k] = v;
  }
  return merged;
}

function persist(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function toast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}
