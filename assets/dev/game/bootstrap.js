/* bootstrap.js — fully combined game bootstrap + rig + particles */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady=true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

const $ = s => document.querySelector(s);

// ---------- Loader UI ----------
const Loader=(()=>{
  const box=()=>$("#loading-box"), text=()=>$("#loading-text"), fill=()=>$("#loading-fill");
  let stepsDone=0, stepsTotal=0, queue=[];
  function show(){ const b=box(); if(b) b.style.display="flex"; }
  function hide(){ const b=box(); if(b) b.style.display="none"; }
  function label(s){ const t=text(); if(t) t.textContent=s||""; }
  function draw(){ const f=fill(); if(f) f.style.width=(stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal=queue.length; }
  async function run(){
    show(); draw();
    for(const s of queue){
      label(s.lbl); draw();
      try{ await s.fn(); }catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r,120));
    hide();
  }
  return {reset, addStep, run, show, hide, label, addStep};
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
window.PP=window.PP||{};
PP.manifest=PP.manifest||[];
PP.rig=PP.rig||{};
PP.state=PP.state||{};
PP.controls=PP.controls||{};

// ---------- Map Manifest / Selector ----------
async function fetchJSON(url){
  try{
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(r.status+" "+r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url, e); return null; }
}

async function loadManifest(){
  const j=await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest=j;
  else if(j && Array.isArray(j.maps)) PP.manifest=j.maps;
  if(!PP.manifest||!PP.manifest.length){
    PP.manifest=[
      { file:"Abandoned_House.glb", title:"Abandoned House", def:"" },
      { file:"furnished_house.glb", title:"Furnished House", def:"" },
      { file:"jailhouse.glb", title:"Jailhouse", def:"" },
      { title:"Procedural ProHouse (grid)", def:"prohouse_generator" },
      { file:"Abandoned_House2.glb", title:"Abandoned House 2", def:"" },
      { file:"farm_house.glb", title:"Farm House", def:"" }
    ];
  }
  const sel=$("#map-select");
  if(sel){
    sel.innerHTML=PP.manifest.map((m,i)=>`<option value="${i}">${m.title||m.file||("map#"+i)}</option>`).join("");
    let saved=parseInt(localStorage.getItem("selectedMapIndex"));
    if(isNaN(saved)||saved<0||saved>=PP.manifest.length) saved=0;
    sel.value=saved;
    sel.onchange=()=>{ localStorage.setItem("selectedMapIndex", sel.value); };
  }
}

function getSelectedMap(){
  const sel=$("#map-select");
  const idx=Number(sel?.value);
  if(isNaN(idx)||idx<0||idx>=PP.manifest.length) return PP.manifest[0];
  return PP.manifest[idx];
}

// ---------- Engine & Scene ----------
function createEngineScene(){
  if(engine&&scene) return;
  const canvas=$("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,antialias:true});
  scene=new BABYLON.Scene(engine);
  scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity=0.0045;
  scene.fogColor=new BABYLON.Color3(0.02,0.03,0.05);

  hemi=new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity=0.35;

  camera=new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ=0.1;
  try{ camera.inputs.clear(); }catch(e){}

  const ground=BABYLON.MeshBuilder.CreateGround("pp_ground",{width:200,height:200},scene);
  ground.isVisible=false;
  ground.checkCollisions=true;
  ground.receiveShadows=true;
  ground.metadata={isGround:true};

  window.ENGINE=engine; window.SCENE=scene; window.camera=camera;
  engine.runRenderLoop(()=>{ try{ if(scene) scene.render(); }catch(e){} });
  window.addEventListener("resize",()=>engine.resize());
}

// ---------- Player Rig + Controls + Movement ----------
/* ... all previous rig code, animations, camera sync, input handlers, footsteps ... */
/* include gamepad, pointer lock, physics body creation, loadAvatar, moveLoop */
// ---------- Particle Systems ----------
/* Insert rain/snow particle system creation + disposal here, attached to world space */

// ---------- Start Player Rig ----------
async function startPlayerRig(){
  if(!scene) await createEngineScene();
  makeBody();
  await loadAvatar();
  moveLoop();
  PP.rigReady=true;
  document.dispatchEvent(new Event("pp:rig-ready"));
}

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started=true;
  $("#title-screen")?.style.display="none";
  Loader.reset();
  Loader.addStep("Preparing engine…", async ()=>createEngineScene());
  Loader.addStep("Loading manifest…", async ()=>await loadManifest());
  Loader.addStep("Loading map…", async ()=>{
    const mapData=getSelectedMap();
    if(typeof PP.mapManager?.loadMap==="function") await PP.mapManager.loadMap(mapData);
  });
  Loader.addStep("Starting player rig…", async ()=>await startPlayerRig());
  await Loader.run();
  $("#renderCanvas")?.focus();
  log("Game fully initialized");
}

// ---------- Start Button ----------
document.addEventListener("DOMContentLoaded",()=>{
  const startBtn=$("#start-button");
  if(startBtn) startBtn.addEventListener("click",()=>startGame());
});
window.startGame=startGame;
})();
