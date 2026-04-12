
const grid = document.getElementById('grid');
const focus = document.getElementById('focus');
const focusImg = document.getElementById('focusImg');
const modeBtn = document.getElementById('modeBtn');
const resetBtn = document.getElementById('resetBtn');

let items = [];
let index = 0;
let focusMode = false;

const interactions = JSON.parse(localStorage.getItem('ffffound-v2') || "{}");

function save() {
  localStorage.setItem('ffffound-v2', JSON.stringify(interactions));
}

async function load() {
  const res = await fetch("https://api.are.na/v2/channels/ffffound-archive/contents?per=50");
  const data = await res.json();
  items = data.contents.filter(x => x.image);
  render();
}

function score(item) {
  const id = item.id;
  const state = interactions[id];

  if (state === "down") return -100;

  let s = 0;
  if (state === "up") s += 50;

  if (item.title) {
    if (item.title.toLowerCase().includes("type")) s += 5;
    if (item.title.toLowerCase().includes("graphic")) s += 5;
  }

  return s + Math.random()*5;
}

function render() {
  grid.innerHTML = "";

  items
    .map(i => ({i, s: score(i)}))
    .sort((a,b)=>b.s-a.s)
    .forEach(({i})=>{
      const el = document.createElement('div');
      el.className = "card";

      const img = document.createElement('img');
      img.src = i.image.display.url;

      el.onclick = ()=>openFocus(i);

      el.appendChild(img);
      grid.appendChild(el);
    });
}

function openFocus(item) {
  focusMode = true;
  focus.classList.remove("hidden");
  focusImg.src = item.image.original.url;
  index = items.findIndex(i=>i.id===item.id);
}

function closeFocus() {
  focusMode = false;
  focus.classList.add("hidden");
}

function vote(type) {
  const item = items[index];
  interactions[item.id] = type;
  save();
  next();
}

function next() {
  index++;
  if (index >= items.length) index = 0;
  focusImg.src = items[index].image.original.url;
}

function prev() {
  index--;
  if (index < 0) index = items.length-1;
  focusImg.src = items[index].image.original.url;
}

document.addEventListener("keydown", (e)=>{
  if (!focusMode) return;

  if (e.key === "j") next();
  if (e.key === "k") prev();
  if (e.key === "f") vote("up");
  if (e.key === "x") vote("down");
  if (e.key === "Escape") closeFocus();
});

modeBtn.onclick = ()=>{
  focusMode = !focusMode;
  if (focusMode) openFocus(items[0]);
  else closeFocus();
};

resetBtn.onclick = ()=>{
  localStorage.removeItem("ffffound-v2");
  location.reload();
};

load();
