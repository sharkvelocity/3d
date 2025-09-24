/* ./assets/dev/game/bootstrap.js — unified bootstrap (engine, maps, prohouse, audio, rig, UI) */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };

const $ = s => document.querySelector(s);
const bURL = p => { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };

async function fetchJSON(url){
  try{
    const r = await fetch(bURL(url), { cache: "no-store" });
    if(!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url, e); return null; }
}

// Load script once
function loadScriptOnce(path){
  return new Promise(resolve=>{
    if(document.querySelector(`script[src="${path}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
    s.async = true;
    s.onload = ()=>resolve(true);
    s.onerror = ()=>{ warn("Failed loading", path); resolve(false); };
    document.head.appendChild(s);
  });
}

// ---------- Loader UI ----------
const Loader = (()=>{
  const box = ()=>$("#loading-box");
  const text = ()=>$("#loading-text");
  const fill = ()=>$("#loading-fill");
  let stepsDone=0, stepsTotal=0, queue=[];
  function show(){ const b=box(); if(b) b.style.display="flex"; }
  function hide(){ const b=box(); if(b) b.style.display="none"; }
  function label(s){ const t=text(); if(t) t.textContent = s||""; }
  function draw(){ const f=fill(); if(f) f.style.width = (stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl,fn}); stepsTotal=queue.length; }
  async function run(){
    show(); draw();
    for(const s of queue){
      label(s.lbl); draw();
      try{ await s.fn(); }catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r,100));
    hide();
  }
  return { reset, addStep, run, show, hide, label, addStep };
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
window.PP = window.PP || {};
PP.manifest = PP.manifest || [];

// ---------- Map Manifest / Selector ----------
async function loadManifest(){
  const j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest = j;
  else if(j && Array.isArray(j.maps)) PP.manifest = j.maps;

  if(!PP.manifest || !PP.manifest.length){
    PP.manifest = [
      { file: "Abandoned_House.glb", title: "Abandoned House", def:"" },
      { file: "furnished_house.glb", title: "Furnished House", def:"" },
      { file: "jailhouse.glb", title: "Jailhouse", def:"" },
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator" },
      { file: "Abandoned_House2.glb", title: "Abandoned House 2", def:"" },
      { file: "farm_house.glb", title: "Farm House", def:"" }
    ];
  }

  populateMapSelector();
}

function populateMapSelector() {
  const sel = document.querySelector("#map-select");
  if (!sel) return;

  const manifest = window.PP?.manifest || [];
  if (!manifest.length) {
    sel.innerHTML = `<option value="-1">(no maps found)</option>`;
    return;
  }

  sel.innerHTML = manifest.map((m,i)=>{
    const title = m.title || m.file || ("map#" + i);
    return `<option value="${i}">${title}</option>`;
  }).join("");

  let saved = parseInt(localStorage.getItem("selectedMapIndex"));
  if (isNaN(saved) || saved < 0 || saved >= manifest.length) saved = 0;
  sel.value = saved;

  sel.onchange = () => {
    const idx = parseInt(sel.value);
    if (!isNaN(idx)) localStorage.setItem("selectedMapIndex", idx);
  };
}

function getSelectedMap() {
  const sel = document.querySelector("#map-select");
  const manifest = window.PP?.manifest || [];
  const idx = Number(sel?.value);
  if (isNaN(idx) || idx < 0 || idx >= manifest.length) return manifest[0];
  return manifest[idx];
}

// ---------- Engine & Scene ----------
function createEngineScene(){
  if(engine && scene) return;
  const canvas = $("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  if(!window.BABYLON) throw new Error("BABYLON is not loaded");

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
  scene  = new BABYLON.Scene(engine);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

  hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.35;

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ = 0.1;
  try{ camera.inputs.clear(); }catch(e){}

  const ground = BABYLON.MeshBuilder.CreateGround("pp_ground", {width:200, height:200}, scene);
  ground.isVisible = false;
  ground.checkCollisions = true;
  ground.receiveShadows = true;
  ground.metadata = { isGround:true };

  window.ENGINE = engine; window.SCENE = scene; window.camera = camera;

  engine.runRenderLoop(()=>{ try{ if(scene) scene.render(); }catch(e){ } });
  window.addEventListener("resize", ()=> engine.resize());
}

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started = true;

  const titleScreen = document.querySelector("#title-screen");
  if(titleScreen) titleScreen.style.display = "none";

  log("[bootstrap] Starting game…");

  Loader.reset();

  // ---------- Steps ----------
  Loader.addStep("Preparing engine…", async ()=> createEngineScene());
  Loader.addStep("Loading manifest (maps)…", async ()=> loadManifest());
  Loader.addStep("Loading map…", async ()=>{
    const mapData = getSelectedMap();
    if(typeof window.PP?.mapManager?.loadMap === 'function'){
      await window.PP.mapManager.loadMap(mapData);
    } else {
      console.warn("MapManager not ready");
    }
  });
  Loader.addStep("Loading player rig…", async ()=>{
    if(typeof window.startPlayerRig === "function"){
      await window.startPlayerRig();
    } else {
      console.warn("Player rig function not ready");
    }
  });
  Loader.addStep("Finalizing…", async ()=>{
    if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
    log("[bootstrap] Game fully initialized!");
  });

  await Loader.run();
  window.dispatchEvent(new CustomEvent("pp:start"));
  try{ $("#renderCanvas")?.focus?.(); }catch(e){}
}

// ----- Bind Start Button -----
document.addEventListener("DOMContentLoaded", ()=>{
  const startBtn = document.getElementById("start-button");
  if(startBtn) startBtn.addEventListener("click", async ()=> {
    try{ await startGame(); }catch(e){ console.error("startGame failed:", e); }
  });

  // Populate maps immediately
  loadManifest();
  log("[bootstrap] Start button bound");
});

// ----- Expose Start ----------
window.startGame = startGame;

})();
