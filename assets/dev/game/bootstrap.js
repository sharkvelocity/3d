/* ./assets/dev/game/bootstrap.js — unified bootstrap (engine, maps, prohouse, audio, rig, UI) */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

const $ = s => document.querySelector(s);
const bURL = p => { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };

async function fetchJSON(url){
  try{
    const r = await fetch(bURL(url), { cache: "no-store" });
    if(!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url, e); return null; }
}

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
    await new Promise(r=>setTimeout(r,120));
    hide();
  }
  return { reset, addStep, run, show, hide, label };
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
let currentMap=null;
let mapMeshes = []; // meshes loaded by loadMap / generator
window.PP = window.PP || {};
PP.manifest = PP.manifest || []; // map manifest

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
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator", procedural:true },
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

  // Fill dropdown with indices
  sel.innerHTML = manifest.map((m,i)=>`<option value="${i}">${m.title || m.file || "map#"+i}</option>`).join("");

  // Restore saved index
  let saved = localStorage.getItem("selectedMapIndex");
  saved = Number(saved);
  if (isNaN(saved) || saved < 0 || saved >= manifest.length) saved = 0;
  sel.value = saved;

  // Save on change
  sel.onchange = ()=> {
    const idx = Number(sel.value);
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

  engine.runRenderLoop(()=>{ try{ scene.render(); }catch(e){ /* swallow render errors */ }});
  window.addEventListener("resize", ()=> engine.resize());
  mark("engine+scene-created");
}

// ---------- Load Map ----------
async function loadMap(mapData){
  if(!scene) throw new Error("Scene not created");

  // Clear previous
  mapMeshes.forEach(m=>m.dispose());
  mapMeshes = [];

  if(mapData.procedural){
    log("[bootstrap] Generating procedural map:", mapData.title || mapData.def);
    if(!window.ProHouseGenerator) throw new Error("ProHouseGenerator not loaded");
    await window.ProHouseGenerator.clear(scene);
    const genData = await window.ProHouseGenerator.spawn(scene);
    mapMeshes.push(...genData.meshes || []);
    currentMap = mapData;

    // --- Set camera spawn to van room if exists ---
    const van = window.ProHouseGenerator.getVanRoom?.();
    if(van && camera){
      camera.position.set(van.gx*window.ProHouseGenerator.CELL_SIZE, 1.8, van.gz*window.ProHouseGenerator.CELL_SIZE);
      camera.setTarget(camera.position.add(new BABYLON.Vector3(0,0,1)));
      camera.attachControl($("#renderCanvas"), true);
    }

    return genData;
  }

  // Static GLB
  const path = "./assets/models/map/";
  const file = mapData.file;
  const res = await BABYLON.SceneLoader.AppendAsync(path, file, scene);
  mapMeshes.push(...res.meshes);
  currentMap = mapData;

  // Ensure camera attached
  if(camera) camera.attachControl($("#renderCanvas"), true);

  return res;
}

// ---------- ProHouse Generator (grid) ----------
window.ProHouseGenerator = window.ProHouseGenerator || (function(){
  const PG = {
    CELL_SIZE:6, rooms:[], roomMeshes:[], doorMeshes:[],
    async loadPrefab(prefab, scene){ return await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/prefabs/", prefab, scene); },
    async spawn(scene, seed=Date.now()){
      // Call your procedural generator
      if(!window.ProHouseGenerator?.generateMap) throw new Error("generateMap() missing");
      const mapData = await window.ProHouseGenerator.generateMap(scene);
      this.rooms = mapData.rooms;
      this.roomMeshes = mapData.meshes;
      return mapData;
    },
    clear(scene){ this.rooms=[]; this.roomMeshes=[]; this.doorMeshes=[]; },
    getVanRoom(){ return this.rooms.find(r=>r.type==="van" || r.name==="Van") || null; },
    getRoomCenter(name){ const r = this.rooms.find(x=>x.name===name); if(!r) return null; return new BABYLON.Vector3(r.gx*this.CELL_SIZE, 0, r.gz*this.CELL_SIZE); }
  };
  return PG;
})();

// ---------- Helpers ----------
function clearMap(){ mapMeshes.forEach(m=>m.dispose()); mapMeshes=[]; }
function spawnPlayer(){ /* spawn logic */ }
function enablePointerLockOnce(){ /* pointer lock */ }
async function injectGhostsAndPS5(){ /* ghost & controller */ }

// ---------- Audio & Weather ----------
(function(){ if(typeof window.__PP_initAudio==="function") window.__PP_initAudio("Clear"); })();

// ---------- Logger ----------
window.GameLogger = window.GameLogger || (function(){ /* logging */ })();

// ---------- Player rig ----------
(async function(){ /* rig setup & physics */ })();

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started = true;
  $("#title-screen")?.style.display = "none";
  log("[bootstrap] Starting game…");

  const STEP_TIMEOUT = 12000;
  function safeStep(label, fn){ Loader.addStep(label, async ()=>{ try{ await Promise.race([Promise.resolve().then(()=>fn()), new Promise((_,rej)=>setTimeout(()=>rej(new Error("Step timeout: "+label)),STEP_TIMEOUT)]); }catch(e){ console.error(`[bootstrap] Step "${label}" failed:`, e); } }); }

  try{
    Loader.reset();

    safeStep("Preparing engine…", async ()=> createEngineScene());
    safeStep("Injecting ghosts & PS5 controller…", async ()=> injectGhostsAndPS5());
    safeStep("Loading manifest (maps)…", async ()=> loadManifest());
    safeStep("Loading map…", async ()=> {
      const mapData = getSelectedMap();
      await loadMap(mapData);
    });
    safeStep("Initializing audio…", async ()=>{ if(typeof window.__PP_initAudio === "function") window.__PP_initAudio("Clear"); });
    safeStep("Loading player rig…", async ()=>{
      await new Promise(r=>{
        if(window.PP?.rigReady) return r();
        const timeout = setTimeout(()=> { console.warn("rig ready timeout"); r(); }, STEP_TIMEOUT);
        document.addEventListener("pp:rig-ready", ()=> { clearTimeout(timeout); r(); }, { once:true });
      });
      log("[bootstrap] Player rig ready");
    });
    safeStep("Initializing player physics & movement…", async ()=>{
      const body = window.PP?.rig?.body;
      if(body && !body.physicsImpostor){
        try{ body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.CapsuleImpostor, { mass:80, restitution:0, friction:0.5 }, scene); }catch(e){}
      }
      if(camera && window.PP?.rig?.body){ try{ camera.parent = window.PP.rig.body; camera.position.set(0,1.6,0); }catch(e){} }
    });
    safeStep("Finalizing…", async ()=>{
      if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
      enablePointerLockOnce();
    });

    await Loader.run();
    window.dispatchEvent(new CustomEvent("pp:start"));
    log("[bootstrap] Game started successfully.");
    try{ $("#renderCanvas")?.focus?.(); }catch(e){}
  }catch(err){
    console.error("[bootstrap] Error starting game:", err);
  }
}

// ---------- Expose Start ----------
window.startGame = startGame;

// ---------- Bind Start Button ----------
document.addEventListener("DOMContentLoaded", ()=>{
  $("#start-button")?.addEventListener("click", ()=> startGame());
  log("[bootstrap] Start button bound");
});

})();
