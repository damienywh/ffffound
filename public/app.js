
let items=[],page=1,loading=false,index=0;

const grid=document.getElementById("grid");
const viewer=document.getElementById("viewer");
const viewerImg=document.getElementById("viewerImg");
const foldersUI=document.getElementById("folders");

const state=JSON.parse(localStorage.getItem("v4")||"{\"votes\":{},\"folders\":{}}");

function save(){localStorage.setItem("v4",JSON.stringify(state));}

async function load(){
 if(loading) return;
 loading=true;
 const res=await fetch(`https://api.are.na/v2/channels/ffffound-archive/contents?page=${page}&per=50`);
 const data=await res.json();
 const imgs=data.contents.filter(x=>x.image);
 items=[...items,...imgs];
 loading=false;
 render();
 preload(); // preload next page
}

async function preload(){
 if(loading) return;
 const next=page+1;
 const res=await fetch(`https://api.are.na/v2/channels/ffffound-archive/contents?page=${next}&per=50`);
 const data=await res.json();
 const imgs=data.contents.filter(x=>x.image);
 items=[...items,...imgs];
 page=next;
}

function score(i){
 let s=Math.random();
 if(state.votes[i.id]==="up") s+=6;
 if(state.votes[i.id]==="down") s-=12;
 return s;
}

function render(){
 grid.innerHTML="";
 items
  .map(i=>({i,s:score(i)}))
  .filter(x=>x.s>-8)
  .sort((a,b)=>b.s-a.s)
  .forEach(({i})=>{
    const d=document.createElement("div");
    d.className="card";
    const img=document.createElement("img");
    img.src=i.image.display.url;
    d.onclick=()=>open(i);
    d.appendChild(img);
    grid.appendChild(d);
  });
}

function open(i){
 viewer.classList.remove("hidden");
 viewerImg.src=i.image.original.url;
 index=items.findIndex(x=>x.id===i.id);
 document.getElementById("download").href=i.image.original.url;
}

function next(){index=(index+1)%items.length;open(items[index]);}

document.getElementById("like").onclick=()=>{
 state.votes[items[index].id]="up";save();next();
};
document.getElementById("dislike").onclick=()=>{
 state.votes[items[index].id]="down";save();next();
};

document.getElementById("save").onclick=()=>{
 const f=prompt("folder?");
 if(!f) return;
 state.folders[f]=state.folders[f]||[];
 state.folders[f].push(items[index].id);
 save();
};

document.getElementById("folderBtn").onclick=()=>{
 foldersUI.classList.toggle("hidden");
 foldersUI.innerHTML=Object.keys(state.folders).map(f=>`<div>${f} (${state.folders[f].length})</div>`).join("");
};

document.addEventListener("keydown",e=>{
 if(viewer.classList.contains("hidden")) return;
 if(e.key==="j") next();
 if(e.key==="f") document.getElementById("like").click();
 if(e.key==="x") document.getElementById("dislike").click();
 if(e.key==="Escape") viewer.classList.add("hidden");
});

window.addEventListener("scroll",()=>{
 if(window.innerHeight+window.scrollY>document.body.offsetHeight-800){
  page++;load();
 }
});

document.getElementById("themeToggle").onclick=()=>{
 document.body.classList.toggle("light");
};

load();
