const CHANNEL='ffffound-archive',PER_PAGE=60,PRELOAD_THRESHOLD=1200,DIVERSITY_PENALTY=2.5,RECENCY_DECAY=0.92;
const STOPWORDS=new Set(['the','and','for','with','from','this','that','into','your','their','have','been','just','only','also','very','about','some','over','more','than','were','then','when','what','will','would','could','there','them','they','like','image','photo','untitled','www','http','https','jpeg','png','jpg','gif','webp','block','attachment','upload','source','none','null','undefined']);
const KEYS={interactions:'ff-interactions-v5',folders:'ff-folders-v5',settings:'ff-settings-v5'};
const state={pool:[],rendered:[],ranked:[],page:1,loading:false,hasMore:true,renderCursor:0,batchSize:30,
  interactions:load(KEYS.interactions,{}),folders:load(KEYS.folders,{}),settings:load(KEYS.settings,{theme:'light'}),
  viewerOpen:false,viewerIndex:-1,viewerItems:[],fb:{enabled:false,app:null,auth:null,db:null,user:null},authReady:false,localMode:false};
const $=id=>document.getElementById(id);
const el={loginGate:$('loginGate'),loginStatus:$('loginStatus'),feed:$('feed'),sentinel:$('sentinel'),loader:$('loader'),viewer:$('viewer'),viewerImg:$('viewerImg'),viewerBar:$('viewerBar'),viewerStatus:$('viewerStatus'),vLike:$('vLike'),vDislike:$('vDislike'),vSave:$('vSave'),vDownload:$('vDownload'),vPrev:$('vPrev'),vNext:$('vNext'),saveModal:$('saveModal'),folderList:$('folderList'),newFolderInput:$('newFolderInput'),foldersPanel:$('foldersPanel'),panelList:$('panelList'),panelBack:$('panelBack'),panelUser:$('panelUser'),btnUser:$('btnUser')};

// Demo data
const DEMO_SEEDS=[[1,900,600,'landscape warm golden','flickr.com'],[10,800,1100,'misty forest moody','tumblr.com'],[11,1000,700,'architecture concrete brutalist','archdaily.com'],[13,700,1000,'nature detail macro','flickr.com'],[14,900,900,'portrait shadow dramatic','500px.com'],[15,1100,700,'industrial urban texture','tumblr.com'],[16,800,1200,'minimal white object','minimalissimo.com'],[17,1000,650,'coastal ocean aerial','unsplash.com'],[18,750,1000,'interior design midcentury','dwell.com'],[19,1000,750,'typography print poster','itsnicethat.com'],[20,900,1300,'street photography night','flickr.com'],[21,1100,800,'botanical green organic','tumblr.com'],[22,800,800,'geometric abstract pattern','dribbble.com'],[24,950,700,'desert landscape arid','unsplash.com'],[25,700,1050,'animal portrait nature','flickr.com'],[26,1000,680,'sky clouds dramatic','500px.com'],[27,800,1100,'vintage film grain','lomography.com'],[28,1100,750,'modern architecture glass','archdaily.com'],[29,900,900,'food styling minimal','kinfolk.com'],[30,750,1100,'fashion editorial studio','vframed.com'],[31,1000,700,'concrete rhythm form','tumblr.com'],[32,800,1000,'dark moody still','flickr.com'],[33,1100,800,'mountain landscape epic','unsplash.com'],[34,900,1200,'neon night urban','500px.com'],[35,1000,700,'texture rust decay','tumblr.com'],[36,700,1000,'sculpture art marble','artsy.net'],[37,1100,750,'water reflection calm','flickr.com'],[38,850,1100,'portrait soft film','vsco.co'],[39,1000,680,'road journey horizon','unsplash.com'],[40,800,800,'pattern tile geometric','itsnicethat.com']];
function generateDemoPage(p){const per=30,start=(p-1)*per,out=[];for(let i=0;i<per;i++){const b=DEMO_SEEDS[(start+i)%DEMO_SEEDS.length],w=b[1]+(p*7+i*3)%50,h=b[2]+(p*11+i*5)%50;out.push({id:`demo-${p}-${i}`,thumbUrl:`https://picsum.photos/id/${b[0]}/${w}/${h}`,imageUrl:`https://picsum.photos/id/${b[0]}/${w+400}/${h+300}`,title:b[3],description:b[3],domain:b[4],sourceUrl:`https://${b[4]}`,w,h,connectedAt:new Date(Date.now()-(start+i)*864e5).toISOString()});}return out;}
let useDemo=false;

(async function init(){
  applyTheme();bindEvents();
  // No Firebase in preview — go straight to local mode
  state.localMode=true;state.authReady=true;
  await loadPage();rankAndRender();observeScroll();updateAuthUI();
})();

function bindEvents(){
  $('btnTheme').onclick=()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';persist(KEYS.settings,state.settings);applyTheme();};
  $('btnFolders').onclick=()=>openPanel();
  $('panelClose').onclick=()=>closePanel();
  $('panelBack').onclick=()=>panelShowAll();
  document.querySelector('.panel-backdrop').onclick=()=>closePanel();
  $('saveModalClose').onclick=()=>closeSaveModal();
  document.querySelector('.modal-backdrop').onclick=()=>closeSaveModal();
  $('newFolderBtn').onclick=()=>createFolder();
  el.newFolderInput.addEventListener('keydown',e=>{if(e.key==='Enter')createFolder();});
  $('viewerBackdrop').onclick=()=>closeViewer();
  el.vLike.onclick=()=>voteViewer(1);
  el.vDislike.onclick=()=>voteViewer(-1);
  el.vSave.onclick=()=>openSaveModal();
  el.vPrev.onclick=()=>navigateViewer(-1);
  el.vNext.onclick=()=>navigateViewer(1);
  $('exportBtn').onclick=exportProfile;
  $('importInput').onchange=importProfile;
  $('loginLocal').onclick=()=>{};
  $('loginGoogle').onclick=()=>{};
  el.btnUser.onclick=()=>openPanel();
  document.addEventListener('keydown',handleKey);
  let touchX=0;
  el.viewer.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;},{passive:true});
  el.viewer.addEventListener('touchend',e=>{if(!state.viewerOpen)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>60)navigateViewer(dx<0?1:-1);},{passive:true});
}

function handleKey(e){
  if(state.viewerOpen){if(e.key==='Escape')closeViewer();else if(e.key==='ArrowRight'||e.key==='j')navigateViewer(1);else if(e.key==='ArrowLeft'||e.key==='k')navigateViewer(-1);else if(e.key==='f')voteViewer(1);else if(e.key==='x')voteViewer(-1);else if(e.key==='s')openSaveModal();else if(e.key==='o'){const item=currentViewerItem();if(item)window.open(item.imageUrl,'_blank');}return;}
  if(!el.saveModal.classList.contains('hidden')){if(e.key==='Escape')closeSaveModal();return;}
  if(!el.foldersPanel.classList.contains('hidden')){if(e.key==='Escape')closePanel();return;}
}
function applyTheme(){document.body.classList.toggle('dark',state.settings.theme==='dark');}

function updateAuthUI(){
  const user=state.fb.user;
  if(user&&user.photoURL){el.btnUser.innerHTML=`<img src="${user.photoURL}" alt="">`;el.btnUser.classList.add('signed-in');}
  else if(user){el.btnUser.textContent=(user.displayName||user.email||'?')[0].toUpperCase();el.btnUser.classList.add('signed-in');}
  else{el.btnUser.textContent='·';el.btnUser.classList.remove('signed-in');}
  if(user){
    const name=user.displayName||user.email||'Signed in';
    el.panelUser.innerHTML=`<div class="panel-user-info">${user.photoURL?`<img src="${user.photoURL}" alt="">`:''}
    <span><span class="sync-dot"></span>${esc(name)}</span></div><button id="btnSignOut">sign out</button>`;
  }else{
    el.panelUser.innerHTML=`<div class="panel-user-info"><span><span class="sync-dot off"></span><span class="mode-label">${state.localMode?'local mode — browser only':'not signed in'}</span></span></div>`;
  }
}

async function loadPage(){
  if(state.loading||!state.hasMore)return;state.loading=true;el.loader.classList.remove('hidden');
  if(useDemo){const items=generateDemoPage(state.page);const existing=new Set(state.pool.map(i=>i.id));state.pool.push(...items.filter(i=>!existing.has(i.id)));state.page++;if(state.page>8)state.hasMore=false;state.loading=false;el.loader.classList.add('hidden');return;}
  try{const url=`https://api.are.na/v2/channels/${CHANNEL}/contents?page=${state.page}&per=${PER_PAGE}`;const res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const json=await res.json();const items=(json.contents||[]).filter(x=>x.image).map(normalizeItem);if(items.length<PER_PAGE)state.hasMore=false;const existing=new Set(state.pool.map(i=>i.id));state.pool.push(...items.filter(i=>!existing.has(i.id)));state.page++;if(state.hasMore)preloadNext();}
  catch(err){console.warn('Are.na unavailable, using demo');useDemo=true;const items=generateDemoPage(state.page);state.pool.push(...items);state.page++;}
  finally{state.loading=false;el.loader.classList.add('hidden');}
}
async function preloadNext(){if(state.loading||useDemo)return;try{const url=`https://api.are.na/v2/channels/${CHANNEL}/contents?page=${state.page}&per=${PER_PAGE}`;const res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});if(!res.ok)return;const json=await res.json();const items=(json.contents||[]).filter(x=>x.image).map(normalizeItem);if(items.length<PER_PAGE)state.hasMore=false;const existing=new Set(state.pool.map(i=>i.id));state.pool.push(...items.filter(i=>!existing.has(i.id)));state.page++;}catch{}}
function normalizeItem(raw){const img=raw.image||{};return{id:String(raw.id),thumbUrl:img.display?.url||img.thumb?.url||img.original?.url||'',imageUrl:img.original?.url||img.display?.url||'',title:raw.title||raw.generated_title||'',description:raw.description||raw.content||'',domain:safeDomain(raw.source?.url||''),sourceUrl:raw.source?.url||'',w:img.original?.width||img.display?.width||1000,h:img.original?.height||img.display?.height||1000,connectedAt:raw.connected_at||''};}

function buildProfile(){const tokenW={},domainW={},aspectW={};const entries=Object.entries(state.interactions).filter(([,v])=>v.score!==0).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));entries.forEach(([id,v],idx)=>{const item=state.pool.find(i=>i.id===id);if(!item)return;const decay=Math.pow(RECENCY_DECAY,idx),weight=v.score*decay;for(const tok of tokenize(`${item.title} ${item.description} ${item.domain}`))tokenW[tok]=(tokenW[tok]||0)+weight;if(item.domain)domainW[item.domain]=(domainW[item.domain]||0)+weight;const a=aspectBucket(item);aspectW[a]=(aspectW[a]||0)+weight;});return{tokenW,domainW,aspectW};}
function scoreItem(item,profile,dc){const interaction=state.interactions[item.id];if(interaction&&interaction.score<-1)return-9999;let s=0;for(const tok of tokenize(`${item.title} ${item.description} ${item.domain}`))s+=(profile.tokenW[tok]||0)*2.5;s+=(profile.domainW[item.domain]||0)*3.5;s+=(profile.aspectW[aspectBucket(item)]||0)*4;if(interaction)s+=interaction.score*50;if(!interaction||!interaction.seen)s+=15;const d=dc[item.domain]||0;s-=d*DIVERSITY_PENALTY;dc[item.domain]=d+1;s+=Math.random()*5;return s;}
function rankAndRender(append=false){const profile=buildProfile();const dc={};const scored=state.pool.map(item=>({item,score:scoreItem(item,profile,dc)})).filter(x=>x.score>-5000).sort((a,b)=>b.score-a.score);state.ranked=scored.map(x=>x.item);state.viewerItems=state.ranked;if(!append){el.feed.innerHTML='';state.renderCursor=0;state.rendered=[];}renderBatch();}
function renderBatch(){const end=Math.min(state.renderCursor+state.batchSize,state.ranked.length);const frag=document.createDocumentFragment();for(let i=state.renderCursor;i<end;i++){const item=state.ranked[i];if(state.rendered.includes(item.id))continue;const card=document.createElement('div');card.className='card';card.dataset.id=item.id;const img=document.createElement('img');img.loading='lazy';img.src=item.thumbUrl;img.alt='';img.onload=()=>img.classList.add('loaded');img.onerror=()=>card.remove();card.appendChild(img);const interaction=state.interactions[item.id];if(interaction&&interaction.score!==0){const badge=document.createElement('span');badge.className=interaction.score>0?'vote-badge liked':'vote-badge disliked';badge.textContent=interaction.score>0?'♥':'×';card.appendChild(badge);}const inFolder=Object.values(state.folders).some(ids=>ids.includes(item.id));if(inFolder&&!(interaction&&interaction.score!==0)){const badge=document.createElement('span');badge.className='vote-badge saved';badge.textContent='⊞';card.appendChild(badge);}card.onclick=()=>openViewer(item);frag.appendChild(card);state.rendered.push(item.id);}el.feed.appendChild(frag);state.renderCursor=end;}
function observeScroll(){const observer=new IntersectionObserver(async entries=>{if(!entries[0].isIntersecting)return;if(state.renderCursor<state.ranked.length){renderBatch();return;}if(state.hasMore&&!state.loading){await loadPage();rankAndRender(false);}},{rootMargin:`${PRELOAD_THRESHOLD}px`});observer.observe(el.sentinel);}

function openViewer(item){state.viewerOpen=true;state.viewerIndex=state.viewerItems.findIndex(i=>i.id===item.id);if(state.viewerIndex<0)state.viewerIndex=0;showViewerItem();el.viewer.classList.remove('hidden');document.body.style.overflow='hidden';markSeen(item.id);}
function closeViewer(){state.viewerOpen=false;el.viewer.classList.add('hidden');document.body.style.overflow='';}
function navigateViewer(dir){const len=state.viewerItems.length;if(!len)return;state.viewerIndex=(state.viewerIndex+dir+len)%len;showViewerItem();markSeen(state.viewerItems[state.viewerIndex].id);}
function showViewerItem(){const item=currentViewerItem();if(!item)return;el.viewerImg.src=item.imageUrl||item.thumbUrl;el.vDownload.href=item.imageUrl||item.thumbUrl;const interaction=state.interactions[item.id]||{};el.vLike.classList.toggle('active-like',interaction.score>0);el.vDislike.classList.toggle('active-dislike',interaction.score<0);el.viewerStatus.textContent=`${state.viewerIndex+1} / ${state.viewerItems.length}`;}
function currentViewerItem(){return state.viewerItems[state.viewerIndex]||null;}

function voteViewer(value){const item=currentViewerItem();if(!item)return;const existing=state.interactions[item.id]||{score:0,seen:true,ts:Date.now()};if(existing.score===value)existing.score=0;else existing.score=clamp(existing.score+value,-3,5);existing.seen=true;existing.ts=Date.now();state.interactions[item.id]=existing;persist(KEYS.interactions,state.interactions);showViewerItem();if(value>0)toast('liked');else if(value<0)toast('hidden from feed');else toast('vote removed');if(value<0)setTimeout(()=>navigateViewer(1),200);}
function markSeen(id){const existing=state.interactions[id]||{score:0,ts:Date.now()};existing.seen=true;if(!existing.ts)existing.ts=Date.now();state.interactions[id]=existing;persist(KEYS.interactions,state.interactions);}

function openSaveModal(){const item=currentViewerItem();if(!item)return;el.saveModal.classList.remove('hidden');renderFolderList(item.id);}
function closeSaveModal(){el.saveModal.classList.add('hidden');}
function renderFolderList(itemId){el.folderList.innerHTML='';const names=Object.keys(state.folders).sort();if(!names.length){el.folderList.innerHTML='<div style="padding:20px 14px;color:var(--muted);font-size:11px;text-align:center;">no collections yet</div>';return;}names.forEach(name=>{const ids=state.folders[name],inFolder=ids.includes(itemId);const div=document.createElement('div');div.className='folder-item'+(inFolder?' in-folder':'');div.innerHTML=`<span>${esc(name)}</span><span class="count">${ids.length}${inFolder?' ✓':''}</span>`;div.onclick=()=>{toggleInFolder(name,itemId);renderFolderList(itemId);};el.folderList.appendChild(div);});}
function createFolder(){const name=el.newFolderInput.value.trim();if(!name)return;if(state.folders[name]){toast('already exists');return;}state.folders[name]=[];persist(KEYS.folders,state.folders);el.newFolderInput.value='';toast(`created "${name}"`);const item=currentViewerItem();if(item&&!el.saveModal.classList.contains('hidden'))renderFolderList(item.id);}
function toggleInFolder(fn,itemId){const ids=state.folders[fn]||[];const idx=ids.indexOf(itemId);if(idx>=0){ids.splice(idx,1);toast(`removed from "${fn}"`);}else{ids.push(itemId);toast(`saved to "${fn}"`);}state.folders[fn]=ids;persist(KEYS.folders,state.folders);}

let panelMode='list',panelFolder=null;
function openPanel(){el.foldersPanel.classList.remove('hidden');panelMode='list';panelFolder=null;renderPanel();}
function closePanel(){el.foldersPanel.classList.add('hidden');}
function panelShowAll(){panelMode='list';panelFolder=null;renderPanel();}
function renderPanel(){el.panelBack.classList.toggle('hidden',panelMode==='list');updateAuthUI();if(panelMode==='list')renderPanelList();else renderPanelFolder();}
function renderPanelList(){el.panelList.innerHTML='';const names=Object.keys(state.folders).sort();const likedCount=Object.values(state.interactions).filter(v=>v.score>0).length;const dislikedCount=Object.values(state.interactions).filter(v=>v.score<0).length;const s=document.createElement('div');s.style.cssText='padding:12px 16px;font-size:10px;color:var(--muted);letter-spacing:.08em;border-bottom:1px solid var(--line);';s.textContent=`${likedCount} liked · ${dislikedCount} hidden · ${state.pool.length} loaded`;el.panelList.appendChild(s);if(likedCount>0){const d=document.createElement('div');d.className='panel-folder';d.innerHTML=`<span>♥ all liked</span><span class="f-count">${likedCount}</span>`;d.onclick=()=>{panelMode='folder';panelFolder='__liked__';renderPanel();};el.panelList.appendChild(d);}if(!names.length&&!likedCount){el.panelList.innerHTML+='<div style="padding:30px 16px;color:var(--muted);font-size:11px;text-align:center;">no collections yet — save images from the viewer</div>';return;}names.forEach(name=>{const count=state.folders[name].length;const div=document.createElement('div');div.className='panel-folder';const label=document.createElement('span');label.textContent=name;const right=document.createElement('span');right.style.cssText='display:flex;align-items:center;gap:8px;';const cnt=document.createElement('span');cnt.className='f-count';cnt.textContent=count;const del=document.createElement('button');del.className='panel-folder-delete';del.textContent='delete';del.onclick=e=>{e.stopPropagation();if(confirm(`Delete "${name}"?`)){delete state.folders[name];persist(KEYS.folders,state.folders);renderPanel();}};right.appendChild(cnt);right.appendChild(del);div.appendChild(label);div.appendChild(right);div.onclick=()=>{panelMode='folder';panelFolder=name;renderPanel();};el.panelList.appendChild(div);});}
function renderPanelFolder(){el.panelList.innerHTML='';let ids;if(panelFolder==='__liked__')ids=Object.entries(state.interactions).filter(([,v])=>v.score>0).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0)).map(([id])=>id);else ids=state.folders[panelFolder]||[];if(!ids.length){el.panelList.innerHTML='<div style="padding:30px 16px;color:var(--muted);font-size:11px;text-align:center;">empty</div>';return;}const grid=document.createElement('div');grid.className='panel-images';ids.forEach(id=>{const item=state.pool.find(i=>i.id===id);if(!item)return;const img=document.createElement('img');img.src=item.thumbUrl;img.loading='lazy';img.alt='';img.onclick=()=>{closePanel();openViewer(item);};grid.appendChild(img);});el.panelList.appendChild(grid);}

function exportProfile(){const payload={exportedAt:new Date().toISOString(),interactions:state.interactions,folders:state.folders,settings:state.settings};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ffffound-profile.json';a.click();URL.revokeObjectURL(url);toast('profile exported');}
async function importProfile(e){const file=e.target.files?.[0];if(!file)return;try{const raw=await file.text();const parsed=JSON.parse(raw);if(parsed.interactions)Object.entries(parsed.interactions).forEach(([k,v])=>{const curr=state.interactions[k];if(!curr||(v.ts||0)>(curr.ts||0))state.interactions[k]=v;});if(parsed.folders)Object.entries(parsed.folders).forEach(([name,ids])=>{state.folders[name]=[...new Set([...(state.folders[name]||[]),...ids])];});persist(KEYS.interactions,state.interactions);persist(KEYS.folders,state.folders);rankAndRender();toast('profile imported');}catch{toast('import failed');}e.target.value='';}

function tokenize(text){return String(text||'').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).map(t=>t.trim()).filter(t=>t.length>2&&!STOPWORDS.has(t));}
function aspectBucket(item){const r=(item.w||1)/(item.h||1);return r<0.82?'portrait':r>1.18?'landscape':'square';}
function safeDomain(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}}
function clamp(v,min,max){return Math.min(max,Math.max(min,v));}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function persist(key,data){try{localStorage.setItem(key,JSON.stringify(data));}catch{}}
function load(key,fallback){try{const r=localStorage.getItem(key);return r?JSON.parse(r):fallback;}catch{return fallback;}}
function toast(msg){const ex=document.querySelector('.toast');if(ex)ex.remove();const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),1600);}
