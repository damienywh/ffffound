const DEMO_ITEMS = [
  {
    id: 'd1',
    title: 'Glossed object study',
    description: 'Milky reflections, hard flash, studio object.',
    imageUrl: 'https://picsum.photos/id/1068/900/1100',
    thumbUrl: 'https://picsum.photos/id/1068/700/900',
    sourceUrl: 'https://example.com/demo/1',
    domain: 'example.com',
    connectedAt: '2026-04-01T12:00:00Z',
    width: 900,
    height: 1100,
    type: 'Image'
  },
  {
    id: 'd2',
    title: 'Quiet interior',
    description: 'Sparse room, white wall, chair and shadow.',
    imageUrl: 'https://picsum.photos/id/1018/1200/900',
    thumbUrl: 'https://picsum.photos/id/1018/900/700',
    sourceUrl: 'https://example.com/demo/2',
    domain: 'example.com',
    connectedAt: '2026-04-02T12:00:00Z',
    width: 1200,
    height: 900,
    type: 'Image'
  },
  {
    id: 'd3',
    title: 'Poster fragment',
    description: 'Black serif typography on torn paper.',
    imageUrl: 'https://picsum.photos/id/1025/900/1100',
    thumbUrl: 'https://picsum.photos/id/1025/700/900',
    sourceUrl: 'https://example.com/demo/3',
    domain: 'example.com',
    connectedAt: '2026-04-03T12:00:00Z',
    width: 900,
    height: 1100,
    type: 'Image'
  },
  {
    id: 'd4',
    title: 'Rainy neon',
    description: 'Wet signage, blur, reflected colour.',
    imageUrl: 'https://picsum.photos/id/1043/900/1200',
    thumbUrl: 'https://picsum.photos/id/1043/700/900',
    sourceUrl: 'https://example.com/demo/4',
    domain: 'example.com',
    connectedAt: '2026-04-04T12:00:00Z',
    width: 900,
    height: 1200,
    type: 'Image'
  },
  {
    id: 'd5',
    title: 'Concrete rhythm',
    description: 'Brutalist vanishing point and hard edges.',
    imageUrl: 'https://picsum.photos/id/1031/1000/1200',
    thumbUrl: 'https://picsum.photos/id/1031/800/960',
    sourceUrl: 'https://example.com/demo/5',
    domain: 'example.com',
    connectedAt: '2026-04-05T12:00:00Z',
    width: 1000,
    height: 1200,
    type: 'Image'
  },
  {
    id: 'd6',
    title: 'Chrome curve',
    description: 'Minimal object with cold highlights.',
    imageUrl: 'https://picsum.photos/id/1076/1100/900',
    thumbUrl: 'https://picsum.photos/id/1076/900/700',
    sourceUrl: 'https://example.com/demo/6',
    domain: 'example.com',
    connectedAt: '2026-04-06T12:00:00Z',
    width: 1100,
    height: 900,
    type: 'Image'
  }
];

const STORAGE_KEYS = {
  settings: 'private-ffffound-settings-v1',
  interactions: 'private-ffffound-interactions-v1',
  cache: 'private-ffffound-cache-v1'
};

const DEFAULT_SETTINGS = {
  sourceMode: 'direct',
  channelSlug: 'ffffound-archive',
  perPage: 36,
  proxyBase: '',
  seedTerms: '',
  hideSeen: true,
  diversify: true
};

const TABS = [
  { id: 'curated', label: 'Curated' },
  { id: 'latest', label: 'Latest' },
  { id: 'random', label: 'Random' },
  { id: 'liked', label: 'Liked' },
  { id: 'hidden', label: 'Hidden' }
];

const STOPWORDS = new Set([
  'the','and','for','with','from','this','that','into','your','their','have','been','just','only','also','very','about','some','over','more','than','were','then','when','what','will','would','could','there','them','they','like','image','photo','untitled','www','http','https','jpeg','png','jpg','gif','webp'
]);

const state = {
  settings: readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  interactions: readStorage(STORAGE_KEYS.interactions, {}),
  cache: readStorage(STORAGE_KEYS.cache, {}),
  items: [],
  page: 1,
  activeTab: 'curated',
  viewerItem: null,
  hasMore: true,
  loading: false
};

const els = {
  stats: document.getElementById('stats'),
  sourceMode: document.getElementById('sourceMode'),
  channelSlug: document.getElementById('channelSlug'),
  perPage: document.getElementById('perPage'),
  proxyBase: document.getElementById('proxyBase'),
  seedTerms: document.getElementById('seedTerms'),
  hideSeen: document.getElementById('hideSeen'),
  diversify: document.getElementById('diversify'),
  tabs: document.getElementById('tabs'),
  feed: document.getElementById('feed'),
  status: document.getElementById('status'),
  tokenSignals: document.getElementById('tokenSignals'),
  domainSignals: document.getElementById('domainSignals'),
  emptyState: document.getElementById('emptyState'),
  refreshBtn: document.getElementById('refreshBtn'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  resetBtn: document.getElementById('resetBtn'),
  viewer: document.getElementById('viewer'),
  viewerImage: document.getElementById('viewerImage'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerDescription: document.getElementById('viewerDescription'),
  viewerMeta: document.getElementById('viewerMeta'),
  viewerUpvote: document.getElementById('viewerUpvote'),
  viewerDownvote: document.getElementById('viewerDownvote'),
  viewerHide: document.getElementById('viewerHide'),
  viewerLink: document.getElementById('viewerLink')
};

init();

function init() {
  bindControls();
  renderControls();
  renderTabs();
  refreshFeed({ resetPage: true });
}

function bindControls() {
  els.sourceMode.addEventListener('change', updateSettingsFromForm);
  els.channelSlug.addEventListener('change', updateSettingsFromForm);
  els.perPage.addEventListener('change', updateSettingsFromForm);
  els.proxyBase.addEventListener('change', updateSettingsFromForm);
  els.seedTerms.addEventListener('change', updateSettingsFromForm);
  els.hideSeen.addEventListener('change', updateSettingsFromForm);
  els.diversify.addEventListener('change', updateSettingsFromForm);

  els.refreshBtn.addEventListener('click', () => refreshFeed({ resetPage: true, bustCache: true }));
  els.loadMoreBtn.addEventListener('click', () => refreshFeed({ append: true }));
  els.exportBtn.addEventListener('click', exportProfile);
  els.importInput.addEventListener('change', importProfile);
  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Clear likes, dislikes, hidden items, and seen history?')) return;
    state.interactions = {};
    persist();
    renderDerivedUI();
    renderFeed();
    setStatus('Taste profile cleared.');
  });

  els.viewerUpvote.addEventListener('click', () => {
    if (state.viewerItem) vote(state.viewerItem, 1);
  });
  els.viewerDownvote.addEventListener('click', () => {
    if (state.viewerItem) vote(state.viewerItem, -1);
  });
  els.viewerHide.addEventListener('click', () => {
    if (state.viewerItem) hideItem(state.viewerItem);
  });
}

function renderControls() {
  els.sourceMode.value = state.settings.sourceMode;
  els.channelSlug.value = state.settings.channelSlug;
  els.perPage.value = state.settings.perPage;
  els.proxyBase.value = state.settings.proxyBase;
  els.seedTerms.value = state.settings.seedTerms;
  els.hideSeen.checked = state.settings.hideSeen;
  els.diversify.checked = state.settings.diversify;
}

function updateSettingsFromForm() {
  state.settings = {
    sourceMode: els.sourceMode.value,
    channelSlug: els.channelSlug.value.trim() || 'ffffound-archive',
    perPage: clamp(Number(els.perPage.value) || 36, 12, 100),
    proxyBase: els.proxyBase.value.trim().replace(/\/$/, ''),
    seedTerms: els.seedTerms.value.trim(),
    hideSeen: els.hideSeen.checked,
    diversify: els.diversify.checked
  };
  persist();
  refreshFeed({ resetPage: true });
}

function renderTabs() {
  els.tabs.innerHTML = '';
  for (const tab of TABS) {
    const button = document.createElement('button');
    button.className = `pill ${state.activeTab === tab.id ? 'active' : ''}`;
    button.textContent = tab.label;
    button.addEventListener('click', () => {
      state.activeTab = tab.id;
      renderTabs();
      renderFeed();
    });
    els.tabs.appendChild(button);
  }
}

async function refreshFeed({ resetPage = false, append = false, bustCache = false } = {}) {
  if (state.loading) return;
  if (resetPage) state.page = 1;
  if (append && !state.hasMore) {
    setStatus('No more pages available from the current source.');
    return;
  }

  state.loading = true;
  setStatus(append ? 'Loading more…' : 'Loading feed…');

  try {
    let result;
    if (state.settings.sourceMode === 'demo') {
      result = { items: DEMO_ITEMS, hasMore: false };
    } else {
      result = await fetchFeedPage({
        slug: state.settings.channelSlug,
        page: state.page,
        per: state.settings.perPage,
        mode: state.settings.sourceMode,
        proxyBase: state.settings.proxyBase,
        bustCache
      });
    }

    state.items = append ? mergeItems(state.items, result.items) : result.items;
    state.hasMore = Boolean(result.hasMore);
    if (append) state.page += 1;
    else state.page = 2;
    renderDerivedUI();
    renderFeed();
    setStatus(`${state.items.length} items loaded${state.hasMore ? ' · more pages available' : ''}.`);
  } catch (error) {
    console.error(error);
    if (state.settings.sourceMode !== 'demo') {
      state.items = DEMO_ITEMS;
      state.hasMore = false;
      renderDerivedUI();
      renderFeed();
      setStatus('Could not load the source. Demo items are shown instead. If direct mode fails, switch to proxy mode and set your Cloudflare Worker URL.');
    } else {
      setStatus('Could not load demo feed.');
    }
  } finally {
    state.loading = false;
  }
}

async function fetchFeedPage({ slug, page, per, mode, proxyBase, bustCache }) {
  const cacheKey = `${mode}:${proxyBase}:${slug}:${page}:${per}`;
  if (!bustCache && state.cache[cacheKey]) return state.cache[cacheKey];

  let url;
  if (mode === 'proxy') {
    if (!proxyBase) throw new Error('Proxy mode selected without a proxy base URL.');
    url = `${proxyBase}/api/arena/channel?slug=${encodeURIComponent(slug)}&page=${page}&per=${per}`;
  } else {
    url = `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?page=${page}&per=${per}`;
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  const normalized = normalizePage(json);
  state.cache[cacheKey] = normalized;
  persist();
  return normalized;
}

function normalizePage(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.contents)
      ? payload.contents
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  const items = rows
    .map(normalizeItem)
    .filter(item => item.imageUrl || item.thumbUrl || item.sourceUrl);

  const meta = payload.meta || payload;
  return {
    items,
    hasMore: Boolean(meta.has_more_pages || meta.next_page || (meta.current_page && meta.total_pages && meta.current_page < meta.total_pages))
  };
}

function normalizeItem(raw) {
  const imageUrl =
    raw?.image?.original?.url ||
    raw?.image?.display?.url ||
    raw?.image?.thumb?.url ||
    raw?.image_url ||
    raw?.attachment_url ||
    raw?.source?.url ||
    '';

  const thumbUrl =
    raw?.image?.display?.url ||
    raw?.image?.thumb?.url ||
    raw?.image?.square?.url ||
    imageUrl;

  const sourceUrl = raw?.source?.url || raw?.source_url || raw?.url || imageUrl;
  const width = raw?.image?.original?.width || raw?.image?.display?.width || raw?.image_width || 1000;
  const height = raw?.image?.original?.height || raw?.image?.display?.height || raw?.image_height || 1000;

  return {
    id: String(raw?.id || cryptoRandomId()),
    title: raw?.title || raw?.generated_title || raw?.source?.title || 'Untitled',
    description: raw?.description || raw?.content || raw?.source?.description || '',
    imageUrl,
    thumbUrl,
    sourceUrl,
    domain: safeDomain(sourceUrl),
    connectedAt: raw?.connected_at || raw?.updated_at || raw?.created_at || '',
    width,
    height,
    type: raw?.class || raw?.base_class || raw?.kind || 'Block'
  };
}

function renderDerivedUI() {
  const profile = buildProfile();
  renderStats();
  renderSignals(profile);
}

function renderStats() {
  const liked = Object.values(state.interactions).filter(v => v.score > 0).length;
  const disliked = Object.values(state.interactions).filter(v => v.score < 0).length;
  const hidden = Object.values(state.interactions).filter(v => v.hidden).length;
  const seen = Object.values(state.interactions).filter(v => v.seen).length;
  els.stats.innerHTML = [
    statChip(`liked ${liked}`),
    statChip(`downvoted ${disliked}`),
    statChip(`hidden ${hidden}`),
    statChip(`seen ${seen}`)
  ].join('');
}

function renderSignals(profile) {
  const topTokens = Object.entries(profile.tokenWeights).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topDomains = Object.entries(profile.domainWeights).sort((a, b) => b[1] - a[1]).slice(0, 8);

  els.tokenSignals.innerHTML = topTokens.length
    ? topTokens.map(([token, value]) => `<span class="chip">${escapeHtml(token)} · ${value.toFixed(1)}</span>`).join('')
    : `<span class="muted small">Upvote a few things and your dominant visual vocabulary will appear here.</span>`;

  els.domainSignals.innerHTML = topDomains.length
    ? topDomains.map(([domain, value]) => `<span class="chip">${escapeHtml(domain)} · ${value.toFixed(1)}</span>`).join('')
    : `<span class="muted small">No domain preference yet.</span>`;
}

function renderFeed() {
  const ranked = rankItems();
  els.feed.innerHTML = '';
  els.emptyState.classList.toggle('hidden', ranked.length > 0);

  for (const item of ranked) {
    els.feed.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  const image = document.createElement('img');
  image.loading = 'lazy';
  image.src = item.thumbUrl || item.imageUrl;
  image.alt = item.title || 'Archive image';
  image.addEventListener('click', () => openViewer(item));

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = item.title || 'Untitled';

  const copy = document.createElement('p');
  copy.className = 'card-copy';
  copy.textContent = truncate(item.description || item.domain || item.type, 180);

  const meta = document.createElement('div');
  meta.className = 'meta-line';
  meta.textContent = [item.domain, aspectBucket(item), formatDate(item.connectedAt)].filter(Boolean).join(' · ');

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(
    makeButton('↑', () => vote(item, 1)),
    makeButton('↓', () => vote(item, -1)),
    makeButton('Hide', () => hideItem(item)),
    makeButton('Open', () => openItem(item), 'button')
  );

  body.append(title, copy, meta, actions);
  card.append(image, body);
  return card;
}

function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function openItem(item) {
  markSeen(item.id);
  window.open(item.sourceUrl || item.imageUrl, '_blank', 'noopener,noreferrer');
  renderDerivedUI();
}

function openViewer(item) {
  state.viewerItem = item;
  markSeen(item.id);
  els.viewerImage.src = item.imageUrl || item.thumbUrl;
  els.viewerImage.alt = item.title || 'Archive image';
  els.viewerTitle.textContent = item.title || 'Untitled';
  els.viewerDescription.textContent = item.description || 'No caption.';
  els.viewerLink.href = item.sourceUrl || item.imageUrl || '#';
  els.viewerMeta.innerHTML = [
    line(`Domain`, item.domain || 'Unknown'),
    line(`Shape`, aspectBucket(item)),
    line(`Connected`, formatDate(item.connectedAt) || 'Unknown'),
    line(`Type`, item.type || 'Block')
  ].join('');
  if (typeof els.viewer.showModal === 'function') els.viewer.showModal();
  renderDerivedUI();
  renderFeed();
}

function vote(item, value) {
  const existing = state.interactions[item.id] || { score: 0, seen: true, hidden: false };
  existing.score = clamp((existing.score || 0) + value, -3, 5);
  existing.seen = true;
  existing.hidden = false;
  existing.updatedAt = new Date().toISOString();
  state.interactions[item.id] = existing;
  persist();
  renderDerivedUI();
  renderFeed();
}

function hideItem(item) {
  const existing = state.interactions[item.id] || { score: 0, seen: true };
  existing.hidden = true;
  existing.updatedAt = new Date().toISOString();
  state.interactions[item.id] = existing;
  persist();
  renderDerivedUI();
  renderFeed();
  if (els.viewer.open) els.viewer.close();
}

function markSeen(itemId) {
  const existing = state.interactions[itemId] || { score: 0, hidden: false };
  existing.seen = true;
  existing.updatedAt = new Date().toISOString();
  state.interactions[itemId] = existing;
  persist();
}

function rankItems() {
  const profile = buildProfile();
  const seeded = tokenize(state.settings.seedTerms);
  const servedDomains = {};

  let ranked = state.items.map(item => {
    const interaction = state.interactions[item.id] || {};
    if (state.activeTab === 'liked' && !(interaction.score > 0)) return { item, score: -9999 };
    if (state.activeTab === 'hidden' && !interaction.hidden) return { item, score: -9999 };
    if (state.activeTab !== 'hidden' && interaction.hidden) return { item, score: -4000 };
    if (state.settings.hideSeen && state.activeTab === 'curated' && interaction.seen && !(interaction.score > 0)) return { item, score: -2000 };

    let score = 0;
    if (state.activeTab === 'latest') {
      score += Date.parse(item.connectedAt || 0) / 1e10;
    } else if (state.activeTab === 'random') {
      score += Math.random() * 100;
    } else if (state.activeTab === 'hidden') {
      score += 1;
    } else if (state.activeTab === 'liked') {
      score += (interaction.score || 0) * 100;
    } else {
      score += (interaction.score || 0) * 30;
      if (!interaction.seen) score += 8;
      const tokens = tokenize(`${item.title} ${item.description} ${item.domain}`);
      for (const token of tokens) {
        score += (profile.tokenWeights[token] || 0) * 2.7;
      }
      for (const token of seeded) {
        if (tokens.includes(token)) score += 7;
      }
      score += (profile.domainWeights[item.domain] || 0) * 3.5;
      score += (profile.aspectWeights[aspectBucket(item)] || 0) * 4.5;
      if (state.settings.diversify && item.domain) {
        score -= (servedDomains[item.domain] || 0) * 1.8;
      }
      score += Date.parse(item.connectedAt || 0) / 3e11;
      score += Math.random() * 1.2;
    }

    servedDomains[item.domain] = (servedDomains[item.domain] || 0) + 1;
    return { item, score };
  });

  ranked = ranked.filter(entry => entry.score > -3000).sort((a, b) => b.score - a.score);
  return ranked.map(entry => entry.item);
}

function buildProfile() {
  const tokenWeights = {};
  const domainWeights = {};
  const aspectWeights = {};

  for (const item of state.items) {
    const interaction = state.interactions[item.id];
    if (!interaction || !interaction.score) continue;
    const multiplier = interaction.score;
    const tokens = tokenize(`${item.title} ${item.description} ${item.domain}`);
    for (const token of tokens) {
      tokenWeights[token] = (tokenWeights[token] || 0) + multiplier;
    }
    if (item.domain) domainWeights[item.domain] = (domainWeights[item.domain] || 0) + multiplier;
    const bucket = aspectBucket(item);
    aspectWeights[bucket] = (aspectWeights[bucket] || 0) + multiplier;
  }

  return { tokenWeights, domainWeights, aspectWeights };
}

function exportProfile() {
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    interactions: state.interactions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'private-ffffound-profile.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importProfile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (data.interactions) state.interactions = data.interactions;
  persist();
  renderControls();
  renderTabs();
  renderDerivedUI();
  renderFeed();
  setStatus('Profile imported.');
  event.target.value = '';
}

function mergeItems(existing, incoming) {
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token && token.length > 2 && !STOPWORDS.has(token));
}

function aspectBucket(item) {
  const ratio = (item.width || 1) / (item.height || 1);
  if (ratio < 0.82) return 'portrait';
  if (ratio > 1.2) return 'landscape';
  return 'square';
}

function statChip(text) {
  return `<span class="stat-chip">${escapeHtml(text)}</span>`;
}

function line(label, value) {
  return `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
}

function safeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function truncate(text, max) {
  const str = String(text || '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function setStatus(text) {
  els.status.textContent = text;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  localStorage.setItem(STORAGE_KEYS.interactions, JSON.stringify(state.interactions));
  localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(state.cache));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
