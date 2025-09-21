/* game_bootstrap.js — robust start flow with procedural map integration */
(function () {
"use strict";
if (window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };

// ---------- tiny utils ----------
const $  = (s)=> document.querySelector(s);
const bURL = (p)=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };
async function fetchJSON(url){
  try {
    const r = await fetch(bURL(url), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  } catch (e) { warn("fetchJSON failed:", url, e); return null; }
}
async function loadScriptOnce(path){
  return new Promise(resolve=>{
    const s = document.createElement("script");
    s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
    s.async = true;
    s.onload = ()=>resolve(true);
    s.onerror = ()=>resolve(false);
    document.head.appendChild(s);
  });
}

// ---------- loader UI ----------
const Loader = (() => {
  const box  = ()=> $("#loading-box");
  const text = ()=> $("#loading-text");
  const fill = ()=> $("#loading-fill");
  let stepsDone = 0, stepsTotal = 0, queue = [];
  function show(){ const b=box(); if(b) b.style.display="flex"; }
  function hide(){ const b=box(); if(b) b.style.display="none"; }
  function label(s){ const t=text(); if(t) t.textContent=s||""; }
  function draw(){ const f=fill(); if(!f) return; f.style.width = (stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal = queue.length; }
  async function run(){
    show(); draw();
    for(const s of queue){
      label(s.lbl); draw();
      try { await s.fn(); } catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r,100));
    hide();
  }
  return { reset, addStep, run, show, hide, label };
})();

// ---------- state ----------
let engine = null, scene = null, camera = null;
let hemi = null;
let started = false;
let manifest = [];   // [{file, title, def?}]
let mapRoot = null;
let fallbackGround = null;

// ---------- map list / selector ----------
async function loadManifest() {
  let j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) manifest=j;
  else if(j && Array.isArray(j.maps)) manifest=j.maps;
  else manifest=[];

  // Inject procedural map if not already in manifest
  if(!manifest.some(m=>m.file==="procedural_house")){
    manifest.push({
      file: "procedural_house",
      title: "Procedural House",
      def: "procedural_house.config.js"
    });
  }

  populateMapSelector();
}

function populateMapSelector(){
  const sel = $("#map-select");
  if(!sel) return;
  if(!manifest.length){
    sel.innerHTML=`<option value="-1">(no maps found)</option>`;
    return;
  }
  sel.innerHTML = manifest.map((m,i)=> `<option value="${i}">${m.title||m.file}</option>`).join("");
  try {
    const saved = localStorage.getItem("selectedMapIndex");
    if(saved && manifest[+saved]) sel.value = saved;
    else sel.value="0";
  } catch(_){ sel.value="0"; }

  sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch{} };
}

function getSelectedMap(){ 
  const sel = $("#map-select");
  const idx = Math.max(0, Math.min(manifest.length-1, parseInt(sel?.value||"0",10)||0));
  return manifest[idx]; 
}

// ---------- engine + scene ----------
function createEngineScene(){
  if(engine && scene) return;
  const canvas=$("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  if(!window.BABYLON) throw new Error("BABYLON not loaded");

  engine = new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true, stencil:true, antialias:true});
  scene  = new BABYLON.Scene(engine);

  scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

  hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity=0.35;

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ=0.1;
  camera.inputs.clear();

  window.ENGINE=engine; window.SCENE=scene; window.camera=camera;
  engine.runRenderLoop(()=>scene.render());
  window.addEventListener("resize", ()=>engine.resize());
}

// ---------- map loading ----------
async function importSelectedMap(){
  const chosen=getSelectedMap();
  if(!chosen) return;

  try{ if(mapRoot && !mapRoot.isDisposed()) mapRoot.dispose(false,true); mapRoot=null; }catch{}
  try{ if(fallbackGround && !fallbackGround.isDisposed()) fallbackGround.dispose(false,true); fallbackGround=null; }catch{}

  if(chosen.file==="procedural_house"){
    // Generate procedural map dynamically
    if(!window.MapGenerator) await loadScriptOnce("./assets/dev/game/map_generator.js");
    if(window.MapGenerator){
      mapRoot = await window.MapGenerator.generate(scene);
    } else {
      warn("MapGenerator not found, creating fallback ground.");
      createFallbackGround();
    }
  } else {
    // Load standard GLB
    await loadStandardMap(chosen.file);
  }

  enforceSpawn();
}

async function loadStandardMap(file){
  try{
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", bURL("./assets/models/map/"), file, scene);
    mapRoot = res.meshes[0]||null;
    if(mapRoot){
      res.meshes.forEach(m=>{ try{ m.checkCollisions=true; m.receiveShadows=true; }catch{} });
    }
  }catch(e){
    warn("Map import failed:", e);
    createFallbackGround();
  }
}

function createFallbackGround(){
  fallbackGround = BABYLON.MeshBuilder.CreateGround("fallback_ground",{width:50,height:50,subdivisions:1},scene);
  fallbackGround.checkCollisions=true;
  fallbackGround.position.y=0;
  mapRoot = fallbackGround;
}

// ---------- spawn ----------
function enforceSpawn(){
  if(!scene) return;
  const sp = (window.MAP_DEF?.spawn) 
            ? new BABYLON.Vector3(window.MAP_DEF.spawn.x||0, window.MAP_DEF.spawn.y||1.8, window.MAP_DEF.spawn.z||0)
            : new BABYLON.Vector3(0,1.8,0);
  window.__PP_SPAWN = sp;
}

// ---------- pointer lock ----------
function enablePointerLockOnce(){
  const canvas=$("#renderCanvas");
  if(!canvas) return;
  const lock = ()=>{ if(document.pointerLockElement!==canvas){ try{ canvas.requestPointerLock(); }catch{} } };
  canvas.addEventListener("click", lock);
  setTimeout(lock,200);
}

// ---------- startGame ----------
async function startGame(){
  if(started) return;
  started=true;

  $("#title-screen")?.style.display="none";
  log("[bootstrap] Starting game…");

  try{
    Loader.reset();
    Loader.addStep("Preparing engine…", async()=>createEngineScene());
    Loader.addStep("Loading map…", async()=>importSelectedMap());
    Loader.addStep("Loading player rig…", async()=>{
      await loadScriptOnce("./assets/dev/util/player_rig_controller_final.js");
      await new Promise(r=>{
        if(window.PP?.rigReady) return r();
        document.addEventListener("pp:rig-ready", r, {once:true});
      });
      log("[bootstrap] Player rig ready");
    });
    Loader.addStep("Finalizing…", async()=>{
      if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
      enablePointerLockOnce();
    });

    await Loader.run();
    window.dispatchEvent(new CustomEvent("pp:start"));
    log("[bootstrap] Game started successfully.");

    try{$("#renderCanvas")?.focus?.();}catch{}
  }catch(err){
    console.error("[bootstrap] Error starting game:", err);
    started=false;
    $("#title-screen")?.style.display="flex";
    alert("Boot failed. Check console.");
  }
}

// ---------- DOMContentLoaded ----------
document.addEventListener("DOMContentLoaded", ()=>{
  loadManifest().catch(e=>console.error("Failed to load map manifest:", e));
  $("#start-button")?.addEventListener("click", startGame, {once:true});
});
})();
