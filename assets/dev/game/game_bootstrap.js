/* game_bootstrap.js — robust start flow with procedural map integration */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };

// ---------- tiny utils ----------
const $ = s=>document.querySelector(s);
const bURL = p=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };
async function fetchJSON(url){
  try {
    const r = await fetch(bURL(url), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  } catch (e) { warn("fetchJSON failed:", url, e); return null; }
}

// ---------- Loader ----------
const Loader = (() => {
  const box  = ()=> $("#loading-box");
  const text = ()=> $("#loading-text");
  const fill = ()=> $("#loading-fill");
  let stepsDone = 0, stepsTotal = 0, queue = [];
  function show(){ const b=box(); if (b) b.style.display="flex"; }
  function hide(){ const b=box(); if (b) b.style.display="none"; }
  function label(s){ const t=text(); if (t) t.textContent = s || ""; }
  function draw(){ const f=fill(); if (!f) return; f.style.width = (stepsTotal? (stepsDone/stepsTotal)*100 : 0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal = queue.length; }
  async function run(){
    show(); draw();
    for (const s of queue){
      label(s.lbl); draw();
      try { await s.fn(); } catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r, 100));
    hide();
  }
  return { reset, addStep, run, show, hide, label };
})();

// ---------- state ----------
let engine = null, scene = null, camera = null;
let hemi = null;
let started = false;
let mapRoot = null;
let fallbackGround = null;

// ---------- engine + scene ----------
function createEngineScene(){
  if(engine && scene) return;
  const canvas = $("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  engine = new BABYLON.Engine(canvas,true,{ preserveDrawingBuffer:true, stencil:true, antialias:true });
  scene = new BABYLON.Scene(engine);

  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

  hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.35;

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ = 0.1;
  camera.inputs.clear();

  window.ENGINE = engine; window.SCENE = scene; window.camera = camera;
  engine.runRenderLoop(()=>scene.render());
  window.addEventListener("resize", ()=>engine.resize());
}

// ---------- spawn ----------
function enforceSpawn(){
  if(!scene) return;
  const sp = {x:0,y:1.8,z:0};
  if(window.MapGenerator?.rooms?.length){
    const foyer = window.MapGenerator.rooms.find(r=>r.type==="Foyer");
    if(foyer){
      sp.x = foyer.x + foyer.w; sp.y = 1.8; sp.z = foyer.z + foyer.d/2;
    }
  }
  window.__PP_SPAWN = new BABYLON.Vector3(sp.x,sp.y,sp.z);
}

// ---------- import procedural map ----------
async function importProceduralMap(){
  if(!scene) return;

  // generate
  window.MapGenerator.generate(Date.now());

  // create simple ground for demo if needed
  const sizeX = window.MapGenerator.bounds.x*window.MapGenerator.gridSize;
  const sizeZ = window.MapGenerator.bounds.z*window.MapGenerator.gridSize;
  const ground = BABYLON.MeshBuilder.CreateGround("ground",{width:sizeX,height:sizeZ,subdivisions:1},scene);
  ground.checkCollisions = true;
  ground.position.y = 0;
  ground.receiveShadows = true;

  mapRoot = ground;
  enforceSpawn();
}

// ---------- pointer lock ----------
function enablePointerLockOnce(){
  const canvas = $("#renderCanvas");
  if(!canvas) return;
  const lock = ()=>{ if(document.pointerLockElement!==canvas){ try{ canvas.requestPointerLock(); } catch{} } };
  canvas.addEventListener("click", lock);
  setTimeout(lock,200);
}

// ---------- start game ----------
async function startGame(){
  if(started) return;
  started = true;

  $("#title-screen")?.remove();
  console.log("[bootstrap] Starting game…");

  try{
    Loader.reset();
    Loader.addStep("Preparing engine…", async ()=>createEngineScene());
    Loader.addStep("Generating map…", async ()=>importProceduralMap());

    Loader.addStep("Loading player rig…", async ()=>{
      await loadScriptOnce("./assets/dev/util/player_rig_controller_final.js");
      await new Promise(r=>{ if(window.PP?.rigReady) return r(); document.addEventListener("pp:rig-ready",r,{once:true}); });
      console.log("[bootstrap] Player rig ready");
    });

    Loader.addStep("Initializing player physics & movement…", async ()=>{
      const body = window.PP?.rig?.body;
      if(!body) return;

      if(!body.physicsImpostor){
        body.physicsImpostor = new BABYLON.PhysicsImpostor(
          body,BABYLON.PhysicsImpostor.CapsuleImpostor,
          { mass:80, restitution:0, friction:0.5 },scene
        );
      }

      if(camera && body){
        camera.parent = body;
        camera.position.set(0,1.6,0);
      }

      if(window.PP?.rig?.controller?.enable){
        window.PP.rig.controller.enable(scene);
      }
    });

    Loader.addStep("Finalizing…", async ()=>{
      if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
      enablePointerLockOnce();
    });

    await Loader.run();
    window.dispatchEvent(new CustomEvent("pp:start"));
    $("#renderCanvas")?.focus?.();

  }catch(err){
    console.error("[bootstrap] Start failed:", err);
    started=false;
    alert("Boot failed. Check console.");
  }
}

// ---------- load helper ----------
function loadScriptOnce(path){
  return new Promise(resolve=>{
    const s = document.createElement("script");
    s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
    s.async=true;
    s.onload = ()=>resolve(true);
    s.onerror = ()=>resolve(false);
    document.head.appendChild(s);
  });
}

// ---------- attach start ----------
document.addEventListener("DOMContentLoaded", ()=>{
  $("#start-button")?.addEventListener("click", startGame,{once:true});
});
})();
