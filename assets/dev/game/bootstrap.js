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
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator" },
      { file: "Abandoned_House2.glb", title: "Abandoned House 2", def:"" },
      { file: "farm_house.glb", title: "Farm House", def:"" }
    ];
  }

  populateMapSelector();
}

function populateMapSelector(){
  const sel = $("#map-select");
  if(!sel) return;
  if(!PP.manifest.length){
    sel.innerHTML = `<option value="-1">(no maps found)</option>`;
    return;
  }
  sel.innerHTML = PP.manifest.map((m,i)=>{
    return `<option value="${i}">${m.title || m.file || ("map#"+i)}</option>`;
  }).join("");

  try{
    const saved = localStorage.getItem("selectedMapIndex");
    if(saved && PP.manifest[+saved]) sel.value = saved;
    else sel.value = "0";
  }catch(_){ sel.value = "0"; }

  sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){} };
}

function getSelectedMap(){
  const sel = $("#map-select");
  const idx = Math.max(0, Math.min((PP.manifest||[]).length-1, parseInt(sel?.value||"0",10)));
  return PP.manifest[idx];
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

// ---------- ProHouse Generator (grid) ----------
window.ProHouseGenerator = window.ProHouseGenerator || (function(){
  const PG = {
    GRID_W: 10, GRID_D: 10, CELL_SIZE: 6,
    rooms: [], roomMeshes: [], doorMeshes: [], lights: [], switches: [],
    async loadPrefab(prefab, scene){ return await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/prefabs/", prefab, scene); },
    generate(seed=Date.now()){ /* same as original code */ },
    async spawn(scene, seed){ /* same as original code */ },
    clear(scene){ /* same as original code */ },
    getVanRoom(){ return this.rooms.find(r=>r.type==="van" || r.name==="Van") || null; },
    getRoomCenter(name){ const r = this.rooms.find(x=>x.name===name); if(!r) return null; return new BABYLON.Vector3(r.gx*this.CELL_SIZE, 0, r.gz*this.CELL_SIZE); }
  };
  return PG;
})();

// ---------- Helpers ----------
function clearMap(){ /* same as original */ }
function spawnPlayer(){ /* same as original */ }
function enablePointerLockOnce(){ /* same as original */ }
async function injectGhostsAndPS5(){ /* same as original */ }
async function loadMap(mapData){ /* same as original */ }

// ---------- Audio & Weather ----------
(function(){ /* same as original bootstrap code, including __PP_initAudio */ })();

// ---------- Logger ----------
window.GameLogger = window.GameLogger || (function(){ /* same as original */ })();

// ---------- Player rig ----------
(async function(){ /* same as original rig code */ })();

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
    safeStep("Loading map…", async ()=>{
      const mapData = getSelectedMap();
      await loadMap(mapData);

      // <<< FIX: attach camera to canvas to render properly >>>
      if(camera && scene){
        scene.activeCamera = camera;
        camera.attachControl($("#renderCanvas"), true);
      }
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
