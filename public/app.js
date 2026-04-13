// ════════════════════════════════════════════════════════════
// FFFFOUND ARCHIVE — v6
// Append-only masonry · taste engine · infinite scroll
// ════════════════════════════════════════════════════════════

const SLUG = 'ffffound-archive';
const PER = 100; // max allowed by Are.na
const MAX_PAGES = 2000; // estimated ~200k items / 100 per page
const DECAY = 0.92;
const STOP = new Set('the and for with from this that into your their have been just only also very about some over more than were then when what will would could there them they like image photo untitled www http https jpeg png jpg gif webp block attachment upload source none null undefined'.split(' '));
const K = { ix: 'ff6-ix', fo: 'ff6-fo', st: 'ff6-st' };

// ── STATE ──
const S = {
  pool: new Map(),       // id → item (all loaded items)
  rendered: new Set(),   // ids already in DOM
  page: 0,              // current page being fetched
  loading: false,
  hasMore: true,
  ix: ld(K.ix, {}),     // interactions: { [id]: { score, seen, ts } }
  fo: ld(K.fo, {}),     // folders: { [name]: [id...] }
  cfg: ld(K.st, { theme: 'light' }),
  vOpen: false, vIdx: -1, vList: [], // viewer state
  fb: { enabled: false, auth: null, db: null, user: null }
};

const $ = id => document.getElementById(id);
const feed = $('feed'), sentinel = $('sentinel'), loader = $('loader');

// ── INIT ──
(async () => {
  applyTheme();
  bind();

  // Random start page for variety on each visit
  S.page = 1 + Math.floor(Math.random() * Math.min(MAX_PAGES, 1500));

  await fetchPage();
  observeScroll();

  // Try Firebase if configured
  const cfg = window.FFFFOUND_FIREBASE;
  if (cfg?.enabled && cfg?.config?.apiKey) initFB(cfg);
})();

// ── ARE.NA FETCH — APPEND ONLY ──
async function fetchPage() {
  if (S.loading || !S.hasMore) return;
  S.loading = true;
  loader.classList.remove('off');

  try {
    // Try v2 first (widely supported), fall back to demo
    const url = `https://api.are.na/v2/channels/${SLUG}/contents?page=${S.page}&per=${PER}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const raw = (json.contents || json.data || []).filter(x => x.image);
    if (raw.length === 0) {
      // Might have hit empty page in the middle — try wrapping around
      if (S.page > 1) { S.page = 1; S.loading = false; loader.classList.add('off'); await fetchPage(); return; }
      S.hasMore = false;
    } else {
      const profile = buildProfile();
      const batch = [];
      for (const r of raw) {
        const item = normalize(r);
        if (S.pool.has(item.id)) continue; // skip dupes
        S.pool.set(item.id, item);
        // Skip items the user has strongly disliked
        const ix = S.ix[item.id];
        if (ix && ix.score < -1) continue;
        item._score = scoreItem(item, profile);
        batch.push(item);
      }
      // Sort batch by score, then append
      batch.sort((a, b) => b._score - a._score);
      appendCards(batch);
      S.page++;
      // Check pagination meta
      const meta = json.meta || json;
      if (meta.has_more_pages === false || meta.current_page >= meta.total_pages) {
        // wrap around to page 1 if we started from a random page
        if (S.page > 2) { S.page = 1; }
        else S.hasMore = false;
      }
    }
  } catch (err) {
    console.warn('Are.na unavailable, loading demo images', err);
    loadDemo();
  } finally {
    S.loading = false;
    loader.classList.add('off');
  }
}

function normalize(r) {
  const img = r.image || {};
  return {
    id: String(r.id),
    thumb: img.display?.url || img.thumb?.url || img.original?.url || '',
    full: img.original?.url || img.display?.url || '',
    title: r.title || r.generated_title || '',
    desc: r.description || r.content || '',
    domain: safeDomain(r.source?.url || ''),
    w: img.original?.width || img.display?.width || 1000,
    h: img.original?.height || img.display?.height || 1000,
  };
}

// ── SCORING ──
function buildProfile() {
  const tw = {}, dw = {}, aw = {};
  const entries = Object.entries(S.ix).filter(([, v]) => v.score).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  entries.forEach(([id, v], i) => {
    const item = S.pool.get(id);
    if (!item) return;
    const w = v.score * Math.pow(DECAY, i);
    for (const t of tok(`${item.title} ${item.desc} ${item.domain}`)) tw[t] = (tw[t] || 0) + w;
    if (item.domain) dw[item.domain] = (dw[item.domain] || 0) + w;
    const a = aspect(item);
    aw[a] = (aw[a] || 0) + w;
  });
  return { tw, dw, aw };
}

function scoreItem(item, profile) {
  let s = 0;
  for (const t of tok(`${item.title} ${item.desc} ${item.domain}`)) s += (profile.tw[t] || 0) * 2.5;
  s += (profile.dw[item.domain] || 0) * 3;
  s += (profile.aw[aspect(item)] || 0) * 3;
  const ix = S.ix[item.id];
  if (ix) s += ix.score * 40;
  if (!ix || !ix.seen) s += 8;
  // Deterministic noise per item (stable across re-renders)
  s += (hashId(item.id) % 100) / 20;
  return s;
}

// Simple string hash for stable per-item noise
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

    // Hover overlay with like/dislike
    const overlay = document.createElement('div');
    overlay.className = 'ho';
    const bLike = document.createElement('button');
    bLike.textContent = '♥';
    bLike.title = 'Like';
    bLike.onclick = e => { e.stopPropagation(); quickVote(item, 1, card); };
    const bDis = document.createElement('button');
    bDis.textContent = '×';
    bDis.title = 'Hide';
    bDis.onclick = e => { e.stopPropagation(); quickVote(item, -1, card); };
    overlay.appendChild(bLike);
    overlay.appendChild(bDis);

    // Update overlay button states
    const ix = S.ix[item.id];
    if (ix && ix.score > 0) bLike.classList.add('hl');
    if (ix && ix.score < 0) bDis.classList.add('hd');

    // Badge
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
    badge.className = 'badge bl';
    badge.textContent = '♥';
  } else if (ix && ix.score < 0) {
    if (badge) badge.remove();
  } else {
    if (badge) badge.remove();
  }
}

// ── QUICK VOTE (from hover) ──
function quickVote(item, val, card) {
  const ix = S.ix[item.id] || { score: 0, seen: true, ts: Date.now() };
  if (ix.score === val) ix.score = 0; // toggle off
  else ix.score = clamp(ix.score + val, -3, 5);
  ix.seen = true;
  ix.ts = Date.now();
  S.ix[item.id] = ix;
  sv(K.ix, S.ix);

  // Update card visually in-place
  updateBadge(card, item.id);
  const ol = card.querySelector('.ho');
  if (ol) {
    const btns = ol.querySelectorAll('button');
    btns[0].classList.toggle('hl', ix.score > 0);
    btns[1].classList.toggle('hd', ix.score < 0);
  }

  if (val > 0) toast('liked');
  else if (val < 0) {
    toast('hidden from feed');
    card.classList.add('killed'); // hide from grid
  } else toast('vote cleared');

  syncPush(item.id);
}

// ── INFINITE SCROLL ──
function observeScroll() {
  new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || S.loading) return;
    if (S.hasMore) await fetchPage();
  }, { rootMargin: '1200px' }).observe(sentinel);
}

// ── VIEWER ──
function openViewer(item) {
  // Build viewer list from all rendered items that aren't killed
  S.vList = [...S.pool.values()].filter(i => {
    const ix = S.ix[i.id];
    return !(ix && ix.score < -1);
  });
  S.vIdx = S.vList.findIndex(i => i.id === item.id);
  if (S.vIdx < 0) S.vIdx = 0;
  S.vOpen = true;
  showV();
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
  S.ix[item.id] = ix;
  sv(K.ix, S.ix);
  showV();

  // Update the card in the grid too
  const card = feed.querySelector(`[data-id="${item.id}"]`);
  if (card) {
    updateBadge(card, item.id);
    const ol = card.querySelector('.ho');
    if (ol) {
      const btns = ol.querySelectorAll('button');
      btns[0].classList.toggle('hl', ix.score > 0);
      btns[1].classList.toggle('hd', ix.score < 0);
    }
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
  S.ix[id] = ix;
  sv(K.ix, S.ix);
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
  if (i >= 0) { ids.splice(i, 1); toast(`removed`); } else { ids.push(iid); toast(`saved to "${fn}"`); }
  S.fo[fn] = ids; sv(K.fo, S.fo);
}

// ── PANEL ──
let pMode = 'list', pFolder = null;
function openPN() { $('pn').classList.add('on'); pMode = 'list'; pFolder = null; renderPN(); }
function closePN() { $('pn').classList.remove('on'); }
function renderPN() {
  $('pnBk').classList.toggle('off', pMode === 'list');
  // User info
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
  st.textContent = `${lc} liked · ${dc} hidden · ${S.pool.size} loaded`;
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

// ── DEMO FALLBACK ──
const DEMO = [[1,900,600,'warm golden landscape','flickr.com'],[10,800,1100,'forest moody green','tumblr.com'],[11,1000,700,'concrete brutalist arch','archdaily.com'],[13,700,1000,'macro nature detail','flickr.com'],[14,900,900,'dramatic portrait shadow','500px.com'],[15,1100,700,'urban industrial texture','tumblr.com'],[16,800,1200,'minimal white object','minimalissimo.com'],[17,1000,650,'aerial ocean coastal','unsplash.com'],[18,750,1000,'midcentury interior','dwell.com'],[19,1000,750,'poster typography print','itsnicethat.com'],[20,900,1300,'night street photo','flickr.com'],[21,1100,800,'botanical organic green','tumblr.com'],[22,800,800,'abstract geometric','dribbble.com'],[24,950,700,'arid desert warm','unsplash.com'],[25,700,1050,'animal portrait','flickr.com'],[26,1000,680,'dramatic sky clouds','500px.com'],[27,800,1100,'film grain vintage','lomography.com'],[28,1100,750,'glass modern arch','archdaily.com'],[29,900,900,'minimal food styling','kinfolk.com'],[30,750,1100,'editorial fashion','vsco.co']];
let demoP = 0;
function loadDemo() {
  demoP++;
  const profile = buildProfile(), batch = [];
  for (let i = 0; i < 30; i++) {
    const b = DEMO[(demoP * 7 + i) % DEMO.length];
    const w = b[1] + (demoP * 11 + i * 3) % 60, h = b[2] + (demoP * 7 + i * 5) % 60;
    const item = { id: `d${demoP}-${i}`, thumb: `https://picsum.photos/id/${b[0]}/${w}/${h}`, full: `https://picsum.photos/id/${b[0]}/${w + 400}/${h + 300}`, title: b[3], desc: b[3], domain: b[4], w, h };
    if (S.pool.has(item.id)) continue;
    S.pool.set(item.id, item);
    item._score = scoreItem(item, profile);
    batch.push(item);
  }
  batch.sort((a, b) => b._score - a._score);
  appendCards(batch);
  if (demoP > 8) S.hasMore = false;
}

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
