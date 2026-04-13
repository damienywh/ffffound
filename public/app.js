// ════════════════════════════════════════════════════════════
// FFFFOUND ARCHIVE — v8
// Multi-source · Are.na + Tumblr · taste engine · infinite scroll
// ════════════════════════════════════════════════════════════

// ── CONFIG — edit these ──────────────────────────────────────
// Replace with your new Tumblr consumer key (read-only, safe in frontend)
const TUMBLR_KEY = window.FFFFOUND_CONFIG?.tumblrKey || 'YOUR_TUMBLR_CONSUMER_KEY';

// Sources: each entry is { type, id/slug, label }
// Add/remove sources here — the engine handles the rest
const SOURCES = [
  // Are.na channels
  { type: 'arena',  slug: 'ffffound-archive',          label: 'ffffound archive' },

  // Tumblr blogs — high-quality image curators, ffffound-adjacent aesthetic
  { type: 'tumblr', blog: 'nevver',                    label: 'this isn\'t happiness' },
  { type: 'tumblr', blog: 'baubauhaus',                label: 'baubauhaus' },
  { type: 'tumblr', blog: 'ilovecreativephotography',  label: 'i love creative photography' },
  { type: 'tumblr', blog: 'itscolossal',               label: 'colossal' },
  { type: 'tumblr', blog: 'cross-connect',             label: 'cross connect' },
  { type: 'tumblr', blog: 'sosuperawesome',            label: 'so super awesome' },
  { type: 'tumblr', blog: 'fer1972',                   label: 'classical art' },
  { type: 'tumblr', blog: 'escapekit',                 label: 'escape kit' },
  { type: 'tumblr', blog: 'asylum-art',                label: 'asylum art' },
];
// ────────────────────────────────────────────────────────────

const DECAY = 0.92;
const STOP = new Set('the and for with from this that into your their have been just only also very about some over more than were then when what will would could there them they like image photo untitled www http https jpeg png jpg gif webp block attachment upload source none null undefined'.split(' '));
const K = { ix: 'ff8-ix', fo: 'ff8-fo', st: 'ff8-st' };

// ── SOURCE STATE ──
// Each source tracks its own cursor independently
const sourceState = SOURCES.map(src => ({
  ...src,
  page: 1,       // Are.na page / Tumblr offset ÷ 20
  offset: 0,     // Tumblr offset
  done: false,
  totalPages: null,
}));
let sourceIdx = 0; // round-robin pointer

// ── APP STATE ──
const S = {
  pool: new Map(),
  rendered: new Set(),
  loading: false,
  hasMore: true,
  ix: ld(K.ix, {}),
  fo: ld(K.fo, {}),
  cfg: ld(K.st, { theme: 'light' }),
  vOpen: false, vIdx: -1, vList: [],
  fb: { enabled: false, auth: null, db: null, user: null }
};

const $ = id => document.getElementById(id);
const feed = $('feed'), sentinel = $('sentinel'), loader = $('loader');

// ── STATUS BAR ──
function updateStatus() {
  let el = document.getElementById('statusBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statusBar';
    el.style.cssText = [
      'position:fixed;bottom:14px;right:16px;z-index:100',
      'font-size:10px;letter-spacing:.07em;color:var(--muted)',
      'opacity:0.65;pointer-events:none;text-align:right',
      'font-family:var(--mono,"SF Mono",monospace)',
      'line-height:1.6'
    ].join(';');
    document.body.appendChild(el);
  }
  const active = sourceState.filter(s => !s.done).map(s => s.label).join(', ');
  const done = sourceState.filter(s => s.done).length;
  el.innerHTML = `${S.pool.size.toLocaleString()} images<br>${done}/${sourceState.length} sources complete`;
}

// ── INIT ──
(async () => {
  applyTheme();
  bind();
  updateStatus();
  await fetchNext();
  observeScroll();
  const cfg = window.FFFFOUND_FIREBASE;
  if (cfg?.enabled && cfg?.config?.apiKey) initFB(cfg);
})();

// ── FETCH DISPATCHER — round-robin across sources ──
async function fetchNext() {
  if (S.loading) return;

  // Find next non-done source (round-robin)
  let attempts = 0;
  while (attempts < sourceState.length) {
    const src = sourceState[sourceIdx % sourceState.length];
    sourceIdx++;
    attempts++;
    if (!src.done) {
      await fetchSource(src);
      return;
    }
  }
  // All sources exhausted
  S.hasMore = false;
  updateStatus();
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
    console.warn(`[${src.label}] fetch failed`, err);
    // Don't mark done on transient errors — will retry next round
  } finally {
    S.loading = false;
    loader.classList.add('off');
  }
  // Re-check if anything left
  if (sourceState.every(s => s.done)) S.hasMore = false;
}

// ── ARE.NA ADAPTER ──
async function fetchArena(src) {
  const url = `https://api.are.na/v2/channels/${src.slug}/contents?page=${src.page}&per=100`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Are.na HTTP ${res.status}`);
  const json = await res.json();

  const meta = json.meta || json;
  if (src.totalPages === null) {
    src.totalPages = meta.total_pages || Math.ceil((meta.length || 0) / 100) || 999;
    console.log(`[Are.na:${src.slug}] ${src.totalPages} pages`);
  }

  const raw = (json.contents || json.data || []).filter(x => x.image);
  if (raw.length === 0 || src.page >= src.totalPages) {
    src.done = true;
    console.log(`[Are.na:${src.slug}] complete`);
    return [];
  }
  src.page++;
  return raw.map(r => {
    const img = r.image || {};
    return {
      id: `arena-${r.id}`,
      thumb: img.display?.url || img.thumb?.url || img.original?.url || '',
      full:  img.original?.url || img.display?.url || '',
      title: r.title || r.generated_title || '',
      desc:  r.description || r.content || '',
      domain: safeDomain(r.source?.url || ''),
      w: img.original?.width  || img.display?.width  || 1000,
      h: img.original?.height || img.display?.height || 1000,
      source: src.label,
    };
  });
}

// ── TUMBLR ADAPTER ──
async function fetchTumblr(src) {
  if (TUMBLR_KEY === 'YOUR_TUMBLR_CONSUMER_KEY') {
    console.warn('Tumblr key not configured — skipping', src.blog);
    src.done = true;
    return [];
  }
  const url = `https://api.tumblr.com/v2/blog/${src.blog}.tumblr.com/posts/photo?api_key=${TUMBLR_KEY}&limit=20&offset=${src.offset}&npf=false`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404 || res.status === 401) { src.done = true; return []; }
    throw new Error(`Tumblr HTTP ${res.status}`);
  }
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
  if (src.offset >= (src.totalPages * 20)) src.done = true;

  const items = [];
  for (const post of posts) {
    // Each Tumblr photo post can have multiple photos
    const photos = post.photos || [];
    if (!photos.length) continue;
    photos.forEach((photo, i) => {
      const sizes = photo.alt_sizes || [];
      // Pick best size ≤1280px wide, fallback to original
      const best = sizes.find(s => s.width <= 1280) || sizes[0] || {};
      const orig = sizes[sizes.length - 1] || {}; // largest
      if (!best.url) return;
      items.push({
        id: `tumblr-${post.id}-${i}`,
        thumb: best.url,
        full:  orig.url || best.url,
        title: post.summary || post.caption?.replace(/<[^>]*>/g, '').slice(0, 80) || '',
        desc:  post.caption?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
        domain: safeDomain(post.post_url || ''),
        w: best.width  || 800,
        h: best.height || 600,
        source: src.label,
        tags: post.tags || [],
      });
    });
  }
  return items;
}

// ── SCORING ──
function buildProfile() {
  const tw = {}, dw = {}, aw = {};
  const entries = Object.entries(S.ix).filter(([, v]) => v.score).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  entries.forEach(([id, v], i) => {
    const item = S.pool.get(id);
    if (!item) return;
    const w = v.score * Math.pow(DECAY, i);
    for (const t of tok(`${item.title} ${item.desc} ${item.domain} ${(item.tags||[]).join(' ')}`)) tw[t] = (tw[t] || 0) + w;
    if (item.domain) dw[item.domain] = (dw[item.domain] || 0) + w;
    const a = aspect(item);
    aw[a] = (aw[a] || 0) + w;
  });
  return { tw, dw, aw };
}

function scoreItem(item, profile) {
  let s = 0;
  for (const t of tok(`${item.title} ${item.desc} ${item.domain} ${(item.tags||[]).join(' ')}`)) s += (profile.tw[t] || 0) * 2.5;
  s += (profile.dw[item.domain] || 0) * 3;
  s += (profile.aw[aspect(item)] || 0) * 3;
  const ix = S.ix[item.id];
  if (ix) s += ix.score * 40;
  if (!ix || !ix.seen) s += 8;
  s += (hashId(item.id) % 100) / 20;
  return s;
}

function hashId(id) { let h = 0; for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0; return Math.abs(h); }

// ── RENDER — APPEND ONLY ──
function appendCards(items) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    if (S.rendered.has(item.id)) continue;
    S.rendered.add(item.id);

    const card = document.createElement('div');
    card.className = 'c';
    card.dataset.id = item.id;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = item.thumb;
    img.alt = '';
    img.onload = () => img.classList.add('ok');
    img.onerror = () => card.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ho';
    const bLike = document.createElement('button');
    bLike.textContent = '♥'; bLike.title = 'Like';
    bLike.onclick = e => { e.stopPropagation(); quickVote(item, 1, card); };
    const bDis = document.createElement('button');
    bDis.textContent = '×'; bDis.title = 'Hide';
    bDis.onclick = e => { e.stopPropagation(); quickVote(item, -1, card); };
    overlay.appendChild(bLike);
    overlay.appendChild(bDis);

    const ix = S.ix[item.id];
    if (ix && ix.score > 0) bLike.classList.add('hl');
    if (ix && ix.score < 0) bDis.classList.add('hd');

    updateBadge(card, item.id);
    card.appendChild(img);
    card.appendChild(overlay);
    card.onclick = () => openViewer(item);
    frag.appendChild(card);
  }
  feed.appendChild(frag);
}

function updateBadge(card, id) {
  let badge = card.querySelector('.badge');
  const ix = S.ix[id];
  if (ix && ix.score > 0) {
    if (!badge) { badge = document.createElement('span'); card.appendChild(badge); }
    badge.className = 'badge bl'; badge.textContent = '♥';
  } else { if (badge) badge.remove(); }
}

// ── QUICK VOTE ──
function quickVote(item, val, card) {
  const ix = S.ix[item.id] || { score: 0, seen: true, ts: Date.now() };
  if (ix.score === val) ix.score = 0;
  else ix.score = clamp(ix.score + val, -3, 5);
  ix.seen = true; ix.ts = Date.now();
  S.ix[item.id] = ix;
  sv(K.ix, S.ix);
  updateBadge(card, item.id);
  const ol = card.querySelector('.ho');
  if (ol) { const btns = ol.querySelectorAll('button'); btns[0].classList.toggle('hl', ix.score > 0); btns[1].classList.toggle('hd', ix.score < 0); }
  if (val > 0) toast('liked');
  else if (val < 0) { toast('hidden from feed'); card.classList.add('killed'); }
  else toast('vote cleared');
  syncPush(item.id);
}

// ── INFINITE SCROLL ──
function observeScroll() {
  new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || S.loading) return;
    if (S.hasMore) await fetchNext();
  }, { rootMargin: '1200px' }).observe(sentinel);
}

// ── VIEWER ──
function openViewer(item) {
  S.vList = [...S.pool.values()].filter(i => { const ix = S.ix[i.id]; return !(ix && ix.score < -1); });
  S.vIdx = S.vList.findIndex(i => i.id === item.id);
  if (S.vIdx < 0) S.vIdx = 0;
  S.vOpen = true; showV();
  $('vw').classList.add('on');
  document.body.style.overflow = 'hidden';
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
  if (ix.score === val) ix.score = 0;
  else ix.score = clamp(ix.score + val, -3, 5);
  ix.seen = true; ix.ts = Date.now();
  S.ix[item.id] = ix; sv(K.ix, S.ix); showV();
  const card = feed.querySelector(`[data-id="${item.id}"]`);
  if (card) {
    updateBadge(card, item.id);
    const ol = card.querySelector('.ho');
    if (ol) { const btns = ol.querySelectorAll('button'); btns[0].classList.toggle('hl', ix.score > 0); btns[1].classList.toggle('hd', ix.score < 0); }
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

// ── SAVE / FOLDERS ──
function openSM() { const item = curV(); if (!item) return; $('sm').classList.add('on'); renderFL(item.id); }
function closeSM() { $('sm').classList.remove('on'); }
function renderFL(iid) {
  const fl = $('fl'); fl.innerHTML = '';
  const names = Object.keys(S.fo).sort();
  if (!names.length) { fl.innerHTML = '<div style="padding:20px 14px;color:var(--muted);font-size:11px;text-align:center">no collections yet</div>'; return; }
  names.forEach(n => {
    const ids = S.fo[n], inf = ids.includes(iid);
    const d = document.createElement('div');
    d.className = 'fi' + (inf ? ' in' : '');
    d.innerHTML = `<span>${esc(n)}</span><span class="ct">${ids.length}${inf ? ' ✓' : ''}</span>`;
    d.onclick = () => { toggleInF(n, iid); renderFL(iid); };
    fl.appendChild(d);
  });
}
function createF() {
  const n = $('nfi').value.trim(); if (!n) return;
  if (S.fo[n]) { toast('exists'); return; }
  S.fo[n] = []; sv(K.fo, S.fo); $('nfi').value = ''; toast(`created "${n}"`);
  const item = curV(); if (item && $('sm').classList.contains('on')) renderFL(item.id);
}
function toggleInF(fn, iid) {
  const ids = S.fo[fn] || [];
  const i = ids.indexOf(iid);
  if (i >= 0) { ids.splice(i, 1); toast('removed'); } else { ids.push(iid); toast(`saved to "${fn}"`); }
  S.fo[fn] = ids; sv(K.fo, S.fo);
}

// ── PANEL ──
let pMode = 'list', pFolder = null;
function openPN() { $('pn').classList.add('on'); pMode = 'list'; pFolder = null; renderPN(); }
function closePN() { $('pn').classList.remove('on'); }
function renderPN() {
  $('pnBk').classList.toggle('off', pMode === 'list');
  const u = S.fb.user;
  $('pnU').innerHTML = u
    ? `<span>${esc(u.displayName || u.email || 'signed in')}</span><button id="soBtn">sign out</button>`
    : `<span>local mode</span>${S.fb.enabled ? '<button id="siBtn">sign in</button>' : ''}`;
  if (u) $('soBtn')?.addEventListener('click', signOut);
  else $('siBtn')?.addEventListener('click', signIn);
  if (pMode === 'list') renderPL(); else renderPF();
}
function renderPL() {
  const pl = $('pl'); pl.innerHTML = '';
  const lc = Object.values(S.ix).filter(v => v.score > 0).length;
  const dc = Object.values(S.ix).filter(v => v.score < 0).length;
  const st = document.createElement('div');
  st.style.cssText = 'padding:12px 16px;font-size:10px;color:var(--muted);letter-spacing:.08em;border-bottom:1px solid var(--line)';
  const srcSummary = sourceState.map(s => `${s.label} (${s.done ? '✓' : '…'})`).join(' · ');
  st.innerHTML = `${lc} liked · ${dc} hidden · ${S.pool.size} loaded<br><span style="opacity:.6">${srcSummary}</span>`;
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
  let ids;
  if (pFolder === '__liked__') ids = Object.entries(S.ix).filter(([, v]) => v.score > 0).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).map(([id]) => id);
  else ids = S.fo[pFolder] || [];
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

// ── EVENTS ──
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
    if (S.vOpen) { if (e.key === 'Escape') closeViewer(); else if (e.key === 'ArrowRight' || e.key === 'j') navV(1); else if (e.key === 'ArrowLeft' || e.key === 'k') navV(-1); else if (e.key === 'f') voteV(1); else if (e.key === 'x') voteV(-1); else if (e.key === 's') openSM(); else if (e.key === 'o') { const i = curV(); if (i) window.open(i.full, '_blank'); } return; }
    if ($('sm').classList.contains('on')) { if (e.key === 'Escape') closeSM(); return; }
    if ($('pn').classList.contains('on')) { if (e.key === 'Escape') closePN(); return; }
  });
  let tx = 0;
  $('vw').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('vw').addEventListener('touchend', e => { if (!S.vOpen) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 60) navV(dx < 0 ? 1 : -1); }, { passive: true });
}
function applyTheme() { document.body.classList.toggle('dark', S.cfg.theme === 'dark'); }

// ── FIREBASE (optional) ──
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
async function signIn() {
  if (!S.fb.auth) return;
  try { await S.fb._A.signInWithPopup(S.fb.auth, new S.fb._A.GoogleAuthProvider()); }
  catch (e) { toast('sign-in failed'); console.error(e); }
}
async function signOut() {
  if (!S.fb.auth) return;
  await S.fb._A.signOut(S.fb.auth); S.fb.user = null; toast('signed out'); renderPN();
}
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

// ── EXPORT / IMPORT ──
function exportP() {
  const b = new Blob([JSON.stringify({ interactions: S.ix, folders: S.fo, settings: S.cfg }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'ffffound-profile.json'; a.click(); URL.revokeObjectURL(u); toast('exported');
}
async function importP(e) {
  const f = e.target.files?.[0]; if (!f) return;
  try { const p = JSON.parse(await f.text());
    if (p.interactions) Object.entries(p.interactions).forEach(([k, v]) => { const c = S.ix[k]; if (!c || (v.ts || 0) > (c.ts || 0)) S.ix[k] = v; });
    if (p.folders) Object.entries(p.folders).forEach(([n, ids]) => { S.fo[n] = [...new Set([...(S.fo[n] || []), ...ids])]; });
    sv(K.ix, S.ix); sv(K.fo, S.fo); toast('imported');
  } catch { toast('import failed'); } e.target.value = '';
}

// ── UTILS ──
function tok(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOP.has(t)); }
function aspect(i) { const r = (i.w || 1) / (i.h || 1); return r < 0.82 ? 'portrait' : r > 1.18 ? 'landscape' : 'square'; }
function safeDomain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sv(k, d) { try { localStorage.setItem(k, JSON.stringify(d)); } catch {} }
function ld(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function toast(m) { const x = document.querySelector('.toast'); if (x) x.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 1600); }
