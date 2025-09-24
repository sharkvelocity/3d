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
  return { reset, addStep, run, show, hide, label, addStep };
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
let currentMap=null;
let mapMeshes = []; // meshes loaded by loadMap / generator
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

  engine.runRenderLoop(()=>{ try{ scene.render(); }catch(e){ } });
  window.addEventListener("resize", ()=> engine.resize());
  mark("engine+scene-created");
}

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started = true;
  $("#title-screen")?.style.display = "none";
  log("[bootstrap] Starting game…");

  const STEP_TIMEOUT = 12000;
  function safeStep(label, fn){
    Loader.addStep(label, async ()=>{
      try{
        await Promise.race([
          Promise.resolve().then(()=>fn()),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error("Step timeout: "+label)), STEP_TIMEOUT))
        ]);
      }catch(e){ console.error(`[bootstrap] Step "${label}" failed:`, e); }
    });
  }

  try{
    Loader.reset();

    safeStep("Preparing engine…", async ()=> createEngineScene());
    safeStep("Injecting ghosts & PS5 controller…", async ()=> window.injectGhostsAndPS5?.());
    safeStep("Loading manifest (maps)…", async ()=> loadManifest());
    safeStep("Loading map…", async ()=>{
      const mapData = getSelectedMap();
      await window.loadMap?.(mapData);
      if(camera && scene){
        scene.activeCamera = camera;
        camera.attachControl($("#renderCanvas"), true);
      }
    });
    safeStep("Initializing audio…", async ()=> window.__PP_initAudio?.("Clear"));
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
      window.enablePointerLockOnce?.();
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

// ---------- Populate maps immediately on DOM ready ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadManifest(); // ensures dropdown is populated immediately
  $("#start-button")?.addEventListener("click", ()=> startGame());
  log("[bootstrap] Start button bound");
});
})();
