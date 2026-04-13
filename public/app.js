// ════════════════════════════════════════════════════════════
// FFFFOUND ARCHIVE — v8.1
// Multi-source · Are.na + Tumblr · taste engine · infinite scroll
// ════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
// Set your Tumblr consumer key in firebase-config.js as:
//   window.FFFFOUND_CONFIG = { tumblrKey: 'your_key_here' }
const TUMBLR_KEY = window.FFFFOUND_CONFIG?.tumblrKey || '';

// ── SOURCES ──────────────────────────────────────────────────
// Add/remove entries freely. type: 'arena' or 'tumblr'.
// All 404/gone blogs are skipped gracefully at runtime.
const SOURCES = [
  // ── Are.na ──
  { type: 'arena',  slug: 'ffffound-archive',        label: 'ffffound archive' },

  // ── Tumblr — verified large image-curation blogs ──
  // ~106k photo posts — the spiritual successor to ffffound
  { type: 'tumblr', blog: 'nevver',                  label: 'this isn\'t happiness' },
  // ~50k — fine art, illustration, surrealism
// REMOVED: cross-connect 404
  // ~80k — classical & modern painting
  { type: 'tumblr', blog: 'fer1972',                 label: 'fine art' },
  // ~30k — design, craft, illustration
  { type: 'tumblr', blog: 'sosuperawesome',          label: 'so super awesome' },
  // ~25k — graphic design, typography, branding
  { type: 'tumblr', blog: 'visualgraphc',            label: 'visual graphic' },
  // ~20k — moody photography, dark aesthetic
// REMOVED: darksilenceinsuburbia 404
  // ~15k — architecture & maps
  { type: 'tumblr', blog: 'archimaps',               label: 'archimaps' },
  // ~40k — eclectic art & photography curation
// REMOVED: likeafieldmouse 404
  // ~10k — photography & design escape kit
  { type: 'tumblr', blog: 'escapekit',               label: 'escape kit' },
  // ~20k — photography, nature, art
// REMOVED: foxesinbreeches 404
  // ~15k — lensblr photography network
  { type: 'tumblr', blog: 'lensblr-network',         label: 'lensblr' },
  // ~8k — floating memos, design/art
  { type: 'tumblr', blog: 'floatingmemos',           label: 'floating memos' },
  // ~12k — books, paper, scissors — design/typography
  { type: 'tumblr', blog: 'bookspaperscissors',      label: 'books paper scissors' },
  // ~6k — jjjjound aesthetic (if accessible)
  { type: 'tumblr', blog: 'jjjjound',                label: 'jjjjound' },

  // NEW: Mid-century modern
  { type: 'tumblr', blog: 'midcenturymoderndesign', label: 'MCM design' },
  { type: 'tumblr', blog: 'mid-20c-blog',           label: 'mid-20c blog' },
  { type: 'tumblr', blog: 'midcenturymodernfreak',  label: 'MCM freak' },
  { type: 'tumblr', blog: 'midcenturymoderns',     label: 'MCM moderns' },
  { type: 'tumblr', blog: 'vintageeveryday',       label: 'vintage everyday' },
  // NEW: Design/typography
  { type: 'tumblr', blog: 'thegraphicsideof',      label: 'graphics side' },
  { type: 'tumblr', blog: 'vignellicenter',       label: 'vignelli center' },
  { type: 'tumblr', blog: 'vintagebooksdesign',   label: 'vintage books' },
];
// ─────────────────────────────────────────────────────────────

const DECAY = 0.92;
const STOP = new Set('the and for with from this that into your their have been just only also very about some over more than were then when what will would could there them they like image photo untitled www http https jpeg png jpg gif webp block attachment upload source none null undefined'.split(' '));
const K = { ix: 'ff8-ix', fo: 'ff8-fo', st: 'ff8-st' };

// ── PER-SOURCE STATE ──────────────────────────────────────────
const sourceState = SOURCES.map(src => ({
  ...src,
  page: 1,
  offset: 0,
  done: false,
  totalPages: null,
  error: false,
}));
let sourceIdx = 0;

// ── APP STATE ─────────────────────────────────────────────────
const S = {
  pool: new Map(),
  rendered: new Set(),
  loading: false,
  hasMore: true,
  ix: ld(K.ix, {}),
  fo: ld(K.fo, {}),
  cfg: ld(K.st, { theme: 'light' }),
  vOpen: false, vIdx: -1, vList: [],
  fb: { enabled: false, auth: null, db: null, user: null },
};

const $ = id => document.getElementById(id);
const feed = $('feed'), sentinel = $('sentinel'), loader = $('loader');

// ── STATUS BAR ───────────────────────────────────────────────
function updateStatus() {
  let el = document.getElementById('statusBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statusBar';
    el.style.cssText = [
      'position:fixed;bottom:14px;right:16px;z-index:100',
      'font-size:10px;letter-spacing:.07em;color:var(--muted)',
      'opacity:0.6;pointer-events:none;text-align:right',
      'font-family:var(--mono,"SF Mono",ui-monospace,monospace)',
      'line-height:1.7',
    ].join(';');
    document.body.appendChild(el);
  }
  const done = sourceState.filter(s => s.done).length;
  const active = sourceState.filter(s => !s.done && !s.error).map(s => s.label).join(' · ');
  const endMsg = !S.hasMore && done === sourceState.length 
    ? '<br><span style="opacity:.4;font-style:italic">...you\'ve reached the bottom of the abyss. Refresh to keep going.</span>' 
    : '';
  el.innerHTML =
    `${S.pool.size.toLocaleString()} images · ${done}/${sourceState.length} sources` +
    (active ? `<br><span style="opacity:.5">${active}</span>` : '') +
    endMsg;
}

// ── INIT ─────────────────────────────────────────────────────
(async () => {
  applyTheme();
  bind();
  updateStatus();
  await fetchNext();
  observeScroll();
  
  // Manual load more button
  const loadMoreBtn = document.getElementById('loadMore');
  loadMoreBtn.onclick = async () => {
    loadMoreBtn.classList.add('hidden');
    await fetchNext();
  };
  
  // Show/hide load more button based on state
  const origUpdateStatus = updateStatus;
  window.updateStatus = function() {
    origUpdateStatus();
    setTimeout(() => {
      loadMoreBtn.classList.toggle('hidden', !S.hasMore || S.loading);
    }, 100);
  };
  
  const cfg = window.FFFFOUND_FIREBASE;
  if (cfg?.enabled && cfg?.config?.apiKey) initFB(cfg);
})();

// ── FETCH DISPATCHER — round-robin ───────────────────────────
async function fetchNext() {
  if (S.loading) return;
  // Keep fetching from available sources while they return items
  let fetchedAny = false;
  do {
    let attempts = 0;
    let foundWork = false;
    while (attempts < sourceState.length) {
      const src = sourceState[sourceIdx % sourceState.length];
      sourceIdx++;
      attempts++;
      if (!src.done) { 
        await fetchSource(src);
        foundWork = true;
        // If this source returned items, try another one
        break;
      }
    }
    fetchedAny = foundWork;
    // Stop if all sources are done
    if (sourceState.every(s => s.done)) break;
  } while (fetchedAny && S.hasMore);
  
  if (sourceState.every(s => s.done)) {
    S.hasMore = false;
    updateStatus();
  }
}

async function fetchSource(src) {
  S.loading = true;
  loader.classList.remove('off');
  try {
    let items = [];
    if (src.type === 'arena')  items = await fetchArena(src);
    if (src.type === 'tumblr') items = await fetchTumblr(src);
    if (items.length > 0) {
      const profile = buildProfile();
      const batch = [];
      for (const item of items) {
        if (S.pool.has(item.id)) continue;
        S.pool.set(item.id, item);
        const ix = S.ix[item.id];
        if (ix && ix.score < -1) continue;
        item._score = scoreItem(item, profile);
        batch.push(item);
      }
      batch.sort((a, b) => b._score - a._score);
      appendCards(batch);
    }
    updateStatus();
  } catch (err) {
    console.warn(`[${src.label}] fetch error`, err);
    src.error = true;
    // Don't permanently mark done — will retry on next scroll
  } finally {
    S.loading = false;
    loader.classList.add('off');
  }
  if (sourceState.every(s => s.done)) S.hasMore = false;
}

// ── ARE.NA ADAPTER ───────────────────────────────────────────
async function fetchArena(src) {
  // First call: get channel length to calculate real page count
  if (src.totalPages === null) {
    try {
      const infoRes = await fetch(`https://api.are.na/v2/channels/${src.slug}`, { headers: { Accept: 'application/json' } });
      if (infoRes.ok) {
        const infoJson = await infoRes.json();
        const realLength = infoJson.length || 0;
        src.totalPages = realLength > 0 ? Math.ceil(realLength / 100) : 99;
        console.log(`[Are.na:${src.slug}] ${realLength} items, ${src.totalPages} pages`);
      } else {
        src.totalPages = 99; // fallback
      }
    } catch (e) {
      src.totalPages = 99; // fallback
    }
  }

  const url = `https://api.are.na/v2/channels/${src.slug}/contents?page=${src.page}&per=100`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Are.na ${res.status}`);
  const json = await res.json();

  const raw = (json.contents || json.data || []).filter(x => x.image);
  if (raw.length === 0 || src.page > src.totalPages) {
    src.done = true;
    console.log(`[Are.na:${src.slug}] complete at page ${src.page}`);
    return [];
  }
  src.page++;

  return raw.map(r => {
    const img = r.image || {};
    return {
      id:     `arena-${r.id}`,
      thumb:  img.display?.url || img.thumb?.url || img.original?.url || '',
      full:   img.original?.url || img.display?.url || '',
      title:  r.title || r.generated_title || '',
      desc:   r.description || r.content || '',
      domain: safeDomain(r.source?.url || ''),
      w:      img.original?.width  || img.display?.width  || 1000,
      h:      img.original?.height || img.display?.height || 1000,
      source: src.label,
      tags:   [],
    };
  });
}

// ── TUMBLR ADAPTER ───────────────────────────────────────────
async function fetchTumblr(src) {
  if (!TUMBLR_KEY) {
    console.warn('[Tumblr] No key configured — set window.FFFFOUND_CONFIG.tumblrKey');
    src.done = true;
    return [];
  }

  const url = `https://api.tumblr.com/v2/blog/${src.blog}.tumblr.com/posts/photo` +
    `?api_key=${TUMBLR_KEY}&limit=20&offset=${src.offset}&npf=false`;
  const res = await fetch(url);

  if (res.status === 404) {
    console.warn(`[Tumblr:${src.blog}] 404 — blog not found or moved, skipping`);
    src.done = true; return [];
  }
  if (res.status === 401 || res.status === 403) {
    console.warn(`[Tumblr:${src.blog}] auth error ${res.status}, skipping`);
    src.done = true; return [];
  }
  if (!res.ok) throw new Error(`Tumblr ${res.status}`);

  const json = await res.json();
  const resp = json.response || {};

  if (src.totalPages === null) {
    const total = resp.total_posts || resp.blog?.total_posts || 0;
    src.totalPages = Math.ceil(total / 20);
    console.log(`[Tumblr:${src.blog}] ~${total} photo posts, ${src.totalPages} pages`);
  }

  const posts = resp.posts || [];
  if (posts.length === 0) { src.done = true; return []; }

  src.offset += 20;
  // Tumblr API won't return beyond offset 20000 (their hard cap)
  if (src.offset >= Math.min(src.totalPages * 20, 20000)) src.done = true;

  const items = [];
  for (const post of posts) {
    const photos = post.photos || [];
    if (!photos.length) continue;
    photos.forEach((photo, i) => {
      const sizes = photo.alt_sizes || [];
      if (!sizes.length) return;
      // Best display size ≤ 1280px wide
      const best = sizes.find(s => s.width <= 1280) || sizes[0];
      // Largest for full view
      const orig = [...sizes].sort((a, b) => b.width - a.width)[0];
      if (!best?.url) return;
      const caption = (post.caption || '').replace(/<[^>]*>/g, '').trim();
      items.push({
        id:     `tumblr-${post.id}-${i}`,
        thumb:  best.url,
        full:   orig?.url || best.url,
        title:  post.summary || caption.slice(0, 80) || '',
        desc:   caption.slice(0, 200),
        domain: safeDomain(post.post_url || `${src.blog}.tumblr.com`),
        w:      best.width  || 800,
        h:      best.height || 600,
        source: src.label,
        tags:   post.tags || [],
      });
    });
  }
  return items;
}

// ── SCORING ──────────────────────────────────────────────────
function buildProfile() {
  const tw = {}, dw = {}, aw = {};
  const entries = Object.entries(S.ix)
    .filter(([, v]) => v.score)
    .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  entries.forEach(([id, v], i) => {
    const item = S.pool.get(id);
    if (!item) return;
    const w = v.score * Math.pow(DECAY, i);
    const text = `${item.title} ${item.desc} ${item.domain} ${(item.tags || []).join(' ')}`;
    for (const t of tok(text)) tw[t] = (tw[t] || 0) + w;
    if (item.domain) dw[item.domain] = (dw[item.domain] || 0) + w;
    aw[aspect(item)] = (aw[aspect(item)] || 0) + w;
  });
  return { tw, dw, aw };
}

function scoreItem(item, profile) {
  let s = 0;
  const text = `${item.title} ${item.desc} ${item.domain} ${(item.tags || []).join(' ')}`;
  for (const t of tok(text)) s += (profile.tw[t] || 0) * 2.5;
  s += (profile.dw[item.domain] || 0) * 3;
  s += (profile.aw[aspect(item)] || 0) * 3;
  const ix = S.ix[item.id];
  if (ix) s += ix.score * 40;
  if (!ix || !ix.seen) s += 8;
  s += (hashId(item.id) % 100) / 20;
  return s;
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── RENDER ───────────────────────────────────────────────────
function appendCards(items) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    if (S.rendered.has(item.id)) continue;
    S.rendered.add(item.id);
    const card = document.createElement('div');
    card.className = 'c'; card.dataset.id = item.id;
    const img = document.createElement('img');
    img.loading = 'lazy'; img.src = item.thumb; img.alt = '';
    img.onload = () => img.classList.add('ok');
    img.onerror = () => card.remove();
    const overlay = document.createElement('div'); overlay.className = 'ho';
    const bLike = document.createElement('button');
    bLike.textContent = '♥'; bLike.title = 'Like';
    bLike.onclick = e => { e.stopPropagation(); quickVote(item, 1, card); };
    const bDis = document.createElement('button');
    bDis.textContent = '×'; bDis.title = 'Hide';
    bDis.onclick = e => { e.stopPropagation(); quickVote(item, -1, card); };
    overlay.appendChild(bLike); overlay.appendChild(bDis);
    const ix = S.ix[item.id];
    if (ix?.score > 0) bLike.classList.add('hl');
    if (ix?.score < 0) bDis.classList.add('hd');
    updateBadge(card, item.id);
    card.appendChild(img); card.appendChild(overlay);
    card.onclick = () => openViewer(item);
    frag.appendChild(card);
  }
  feed.appendChild(frag);
}

function updateBadge(card, id) {
  let b = card.querySelector('.badge');
  const ix = S.ix[id];
  if (ix?.score > 0) {
    if (!b) { b = document.createElement('span'); card.appendChild(b); }
    b.className = 'badge bl'; b.textContent = '♥';
  } else if (b) b.remove();
}

// ── VOTE ─────────────────────────────────────────────────────
function quickVote(item, val, card) {
  const ix = S.ix[item.id] || { score: 0, seen: true, ts: Date.now() };
  ix.score = ix.score === val ? 0 : clamp(ix.score + val, -3, 5);
  ix.seen = true; ix.ts = Date.now();
  S.ix[item.id] = ix; sv(K.ix, S.ix);
  updateBadge(card, item.id);
  const ol = card.querySelector('.ho');
  if (ol) { const b = ol.querySelectorAll('button'); b[0].classList.toggle('hl', ix.score > 0); b[1].classList.toggle('hd', ix.score < 0); }
  if (val > 0) toast('liked');
  else if (val < 0) { toast('hidden from feed'); card.classList.add('killed'); }
  else toast('vote cleared');
  syncPush(item.id);
}

// ── SCROLL ───────────────────────────────────────────────────
function observeScroll() {
  let scrollTimeout;
  const checkAndFetch = async () => {
    if (S.loading || !S.hasMore) return;
    const sentinel = document.getElementById('sentinel');
    if (!sentinel) return;
    const rect = sentinel.getBoundingClientRect();
    // Only trigger when sentinel is visible and within 100px of viewport bottom
    if (rect.top <= window.innerHeight && rect.top >= window.innerHeight - 100) {
      await fetchNext();
    }
  };
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(checkAndFetch, 500);
  }, { passive: true });
}

// ── VIEWER ───────────────────────────────────────────────────
function openViewer(item) {
  S.vList = [...S.pool.values()].filter(i => { const ix = S.ix[i.id]; return !(ix?.score < -1); });
  S.vIdx = Math.max(0, S.vList.findIndex(i => i.id === item.id));
  S.vOpen = true; showV();
  $('vw').classList.add('on'); document.body.style.overflow = 'hidden';
  markSeen(item.id);
}
function closeViewer() { S.vOpen = false; $('vw').classList.remove('on'); document.body.style.overflow = ''; }
function navV(d) { const l = S.vList.length; if (!l) return; S.vIdx = (S.vIdx + d + l) % l; showV(); markSeen(S.vList[S.vIdx].id); }
function showV() {
  const item = S.vList[S.vIdx]; if (!item) return;
  $('vwImg').src = item.full || item.thumb;
  $('vO').href = item.full || item.thumb;
  const ix = S.ix[item.id] || {};
  $('vL').classList.toggle('al', ix.score > 0);
  $('vD').classList.toggle('ad', ix.score < 0);
  $('vwSt').textContent = `${S.vIdx + 1} / ${S.vList.length}`;
}
function curV() { return S.vList[S.vIdx] || null; }

function voteV(val) {
  const item = curV(); if (!item) return;
  const ix = S.ix[item.id] || { score: 0, seen: true, ts: Date.now() };
  ix.score = ix.score === val ? 0 : clamp(ix.score + val, -3, 5);
  ix.seen = true; ix.ts = Date.now();
  S.ix[item.id] = ix; sv(K.ix, S.ix); showV();
  const card = feed.querySelector(`[data-id="${item.id}"]`);
  if (card) {
    updateBadge(card, item.id);
    const ol = card.querySelector('.ho');
    if (ol) { const b = ol.querySelectorAll('button'); b[0].classList.toggle('hl', ix.score > 0); b[1].classList.toggle('hd', ix.score < 0); }
    if (ix.score < -1) card.classList.add('killed');
  }
  if (val > 0) toast('liked');
  else if (val < 0) { toast('hidden from feed'); setTimeout(() => navV(1), 200); }
  else toast('vote cleared');
  syncPush(item.id);
}

function markSeen(id) {
  const ix = S.ix[id] || { score: 0, ts: Date.now() };
  ix.seen = true; if (!ix.ts) ix.ts = Date.now();
  S.ix[id] = ix; sv(K.ix, S.ix);
}

// ── FOLDERS / PANEL ──────────────────────────────────────────
function openSM() { const i = curV(); if (!i) return; $('sm').classList.add('on'); renderFL(i.id); }
function closeSM() { $('sm').classList.remove('on'); }
function renderFL(iid) {
  const fl = $('fl'); fl.innerHTML = '';
  const names = Object.keys(S.fo).sort();
  if (!names.length) { fl.innerHTML = '<div style="padding:20px 14px;color:var(--muted);font-size:11px;text-align:center">no collections yet</div>'; return; }
  names.forEach(n => {
    const ids = S.fo[n], inf = ids.includes(iid);
    const d = document.createElement('div'); d.className = 'fi' + (inf ? ' in' : '');
    d.innerHTML = `<span>${esc(n)}</span><span class="ct">${ids.length}${inf ? ' ✓' : ''}</span>`;
    d.onclick = () => { toggleInF(n, iid); renderFL(iid); };
    fl.appendChild(d);
  });
}
function createF() {
  const n = $('nfi').value.trim(); if (!n) return;
  if (S.fo[n]) { toast('exists'); return; }
  S.fo[n] = []; sv(K.fo, S.fo); $('nfi').value = ''; toast(`created "${n}"`);
  const i = curV(); if (i && $('sm').classList.contains('on')) renderFL(i.id);
}
function toggleInF(fn, iid) {
  const ids = S.fo[fn] || []; const i = ids.indexOf(iid);
  if (i >= 0) { ids.splice(i, 1); toast('removed'); } else { ids.push(iid); toast(`saved to "${fn}"`); }
  S.fo[fn] = ids; sv(K.fo, S.fo);
}

let pMode = 'list', pFolder = null;
function openPN() { $('pn').classList.add('on'); pMode = 'list'; pFolder = null; renderPN(); }
function closePN() { $('pn').classList.remove('on'); }
function renderPN() {
  $('pnBk').classList.toggle('off', pMode === 'list');
  const u = S.fb.user;
  $('pnU').innerHTML = u
    ? `<span>${esc(u.displayName || u.email || 'signed in')}</span><button id="soBtn">sign out</button>`
    : `<span>local mode</span>${S.fb.enabled ? '<button id="siBtn">sign in</button>' : ''}`;
  $('soBtn')?.addEventListener('click', signOut);
  $('siBtn')?.addEventListener('click', signIn);
  if (pMode === 'list') renderPL(); else renderPF();
}
function renderPL() {
  const pl = $('pl'); pl.innerHTML = '';
  const lc = Object.values(S.ix).filter(v => v.score > 0).length;
  const dc = Object.values(S.ix).filter(v => v.score < 0).length;
  const st = document.createElement('div');
  st.style.cssText = 'padding:12px 16px;font-size:10px;color:var(--muted);letter-spacing:.08em;border-bottom:1px solid var(--line)';
  const srcLines = sourceState.map(s => `${s.done ? '✓' : s.error ? '!' : '…'} ${s.label}`).join('  ');
  st.innerHTML = `${lc} liked · ${dc} hidden · ${S.pool.size.toLocaleString()} loaded<br><span style="opacity:.55;font-size:9px">${srcLines}</span>`;
  pl.appendChild(st);
  if (lc > 0) { const d = document.createElement('div'); d.className = 'pf'; d.innerHTML = `<span>♥ all liked</span><span class="fc">${lc}</span>`; d.onclick = () => { pMode = 'folder'; pFolder = '__liked__'; renderPN(); }; pl.appendChild(d); }
  const names = Object.keys(S.fo).sort();
  if (!names.length && !lc) { pl.innerHTML += '<div style="padding:30px 16px;color:var(--muted);font-size:11px;text-align:center">save images from the viewer</div>'; return; }
  names.forEach(n => {
    const d = document.createElement('div'); d.className = 'pf';
    const l = document.createElement('span'); l.textContent = n;
    const r = document.createElement('span'); r.style.cssText = 'display:flex;align-items:center;gap:8px';
    const c = document.createElement('span'); c.className = 'fc'; c.textContent = S.fo[n].length;
    const del = document.createElement('button'); del.className = 'pfd'; del.textContent = 'delete';
    del.onclick = e => { e.stopPropagation(); if (confirm(`Delete "${n}"?`)) { delete S.fo[n]; sv(K.fo, S.fo); renderPN(); } };
    r.appendChild(c); r.appendChild(del); d.appendChild(l); d.appendChild(r);
    d.onclick = () => { pMode = 'folder'; pFolder = n; renderPN(); };
    pl.appendChild(d);
  });
}
function renderPF() {
  const pl = $('pl'); pl.innerHTML = '';
  const ids = pFolder === '__liked__'
    ? Object.entries(S.ix).filter(([, v]) => v.score > 0).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).map(([id]) => id)
    : (S.fo[pFolder] || []);
  if (!ids.length) { pl.innerHTML = '<div style="padding:30px 16px;color:var(--muted);font-size:11px;text-align:center">empty</div>'; return; }
  const g = document.createElement('div'); g.className = 'pgrid';
  ids.forEach(id => {
    const item = S.pool.get(id); if (!item) return;
    const img = document.createElement('img'); img.src = item.thumb; img.loading = 'lazy'; img.alt = '';
    img.onclick = () => { closePN(); openViewer(item); };
    g.appendChild(img);
  });
  pl.appendChild(g);
}

// ── EVENTS ───────────────────────────────────────────────────
function bind() {
  $('bTheme').onclick = () => { S.cfg.theme = S.cfg.theme === 'dark' ? 'light' : 'dark'; sv(K.st, S.cfg); applyTheme(); };
  $('bFold').onclick = openPN;
  $('pnX').onclick = closePN;
  $('pnBk').onclick = () => { pMode = 'list'; pFolder = null; renderPN(); };
  document.querySelector('.pnBg').onclick = closePN;
  $('smX').onclick = closeSM;
  document.querySelector('.mbg').onclick = closeSM;
  $('nfb').onclick = createF;
  $('nfi').onkeydown = e => { if (e.key === 'Enter') createF(); };
  $('vwBg').onclick = closeViewer;
  $('vL').onclick = () => voteV(1);
  $('vD').onclick = () => voteV(-1);
  $('vS').onclick = openSM;
  $('vP').onclick = () => navV(-1);
  $('vN').onclick = () => navV(1);
  $('expB').onclick = exportP;
  $('impI').onchange = importP;
  document.addEventListener('keydown', e => {
    if (S.vOpen) {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowRight' || e.key === 'j') navV(1);
      else if (e.key === 'ArrowLeft'  || e.key === 'k') navV(-1);
      else if (e.key === 'f') voteV(1);
      else if (e.key === 'x') voteV(-1);
      else if (e.key === 's') openSM();
      else if (e.key === 'o') { const i = curV(); if (i) window.open(i.full, '_blank'); }
      return;
    }
    if ($('sm').classList.contains('on')) { if (e.key === 'Escape') closeSM(); return; }
    if ($('pn').classList.contains('on')) { if (e.key === 'Escape') closePN(); return; }
  });
  let tx = 0;
  $('vw').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('vw').addEventListener('touchend', e => {
    if (!S.vOpen) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 60) navV(dx < 0 ? 1 : -1);
  }, { passive: true });
}
function applyTheme() { document.body.classList.toggle('dark', S.cfg.theme === 'dark'); }

// ── FIREBASE ─────────────────────────────────────────────────
async function initFB(cfg) {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js');
    const A = await import('https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js');
    const D = await import('https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js');
    const app = initializeApp(cfg.config);
    S.fb.auth = A.getAuth(app); S.fb.db = D.getFirestore(app); S.fb.enabled = true;
    S.fb._A = A; S.fb._D = D;
    await A.setPersistence(S.fb.auth, A.browserLocalPersistence);
    A.onAuthStateChanged(S.fb.auth, async u => {
      S.fb.user = u || null;
      if (u) { toast(`synced as ${u.displayName || u.email}`); await pullCloud(); }
    });
  } catch (e) { console.error('Firebase failed', e); }
}
async function signIn() { try { await S.fb._A.signInWithPopup(S.fb.auth, new S.fb._A.GoogleAuthProvider()); } catch (e) { toast('sign-in failed'); } }
async function signOut() { await S.fb._A.signOut(S.fb.auth); S.fb.user = null; toast('signed out'); renderPN(); }

let syncT = null;
function syncPush(iid) {
  if (!S.fb.user || !S.fb.db) return;
  clearTimeout(syncT);
  syncT = setTimeout(async () => {
    const { doc, setDoc, serverTimestamp } = S.fb._D;
    try {
      if (iid && S.ix[iid]) await setDoc(doc(S.fb.db, 'users', S.fb.user.uid, 'interactions', iid), { ...S.ix[iid], syncedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(S.fb.db, 'users', S.fb.user.uid, 'private', 'folders'), { data: S.fo, syncedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.error('sync error', e); }
  }, 800);
}
async function pullCloud() {
  if (!S.fb.user || !S.fb.db) return;
  const { collection, doc, getDoc, getDocs } = S.fb._D;
  try {
    const uid = S.fb.user.uid;
    const snap = await getDocs(collection(S.fb.db, 'users', uid, 'interactions'));
    snap.forEach(d => { const v = d.data(); const c = S.ix[d.id]; if (!c || (v.ts || 0) > (c.ts || 0)) S.ix[d.id] = v; });
    const fs = await getDoc(doc(S.fb.db, 'users', uid, 'private', 'folders'));
    if (fs.exists()) { const rf = fs.data().data || {}; Object.entries(rf).forEach(([n, ids]) => { S.fo[n] = [...new Set([...(S.fo[n] || []), ...ids])]; }); }
    sv(K.ix, S.ix); sv(K.fo, S.fo);
  } catch (e) { console.error('pull error', e); }
}

// ── EXPORT / IMPORT ──────────────────────────────────────────
function exportP() {
  const b = new Blob([JSON.stringify({ interactions: S.ix, folders: S.fo, settings: S.cfg }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = u; a.download = 'ffffound-profile.json'; a.click(); URL.revokeObjectURL(u); toast('exported');
}
async function importP(e) {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (p.interactions) Object.entries(p.interactions).forEach(([k, v]) => { const c = S.ix[k]; if (!c || (v.ts || 0) > (c.ts || 0)) S.ix[k] = v; });
    if (p.folders) Object.entries(p.folders).forEach(([n, ids]) => { S.fo[n] = [...new Set([...(S.fo[n] || []), ...ids])]; });
    sv(K.ix, S.ix); sv(K.fo, S.fo); toast('imported');
  } catch { toast('import failed'); }
  e.target.value = '';
}

// ── UTILS ────────────────────────────────────────────────────
function tok(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOP.has(t)); }
function aspect(i) { const r = (i.w || 1) / (i.h || 1); return r < 0.82 ? 'portrait' : r > 1.18 ? 'landscape' : 'square'; }
function safeDomain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sv(k, d) { try { localStorage.setItem(k, JSON.stringify(d)); } catch {} }
function ld(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function toast(m) { const x = document.querySelector('.toast'); if (x) x.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 1600); }
