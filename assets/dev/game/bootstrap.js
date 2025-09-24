/* bootstrap.js — unified bootstrap (engine, maps, player rig, physics, pointer lock) */
(function(){
"use strict";

if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log = (...a)=>console.log("[bootstrap]", ...a);
const $ = s => document.querySelector(s);

window.PP = window.PP || {};
PP.manifest = PP.manifest || [];

let engine = null, scene = null, camera = null;
let started = false;

// ---------- Map manifest ----------
async function fetchJSON(url){
  try{
    const r = await fetch(url, {cache:"no-store"});
    return await r.json();
  }catch(e){ console.warn("fetchJSON failed:", url, e); return null; }
}

async function loadManifest(){
  const j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest = j;
  else if(j && Array.isArray(j.maps)) PP.manifest = j.maps;

  if(!PP.manifest || !PP.manifest.length){
    PP.manifest = [
      { file: "Abandoned_House.glb", title: "Abandoned House" },
      { file: "furnished_house.glb", title: "Furnished House" },
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator" }
    ];
  }

  const sel = $("#map-select");
  if(sel){
    sel.innerHTML = PP.manifest.map((m,i)=>`<option value="${i}">${m.title||m.file||"map#"+i}</option>`).join("");
    sel.value = localStorage.getItem("selectedMapIndex")||0;
    sel.onchange = ()=> localStorage.setItem("selectedMapIndex", sel.value);
  }
}

function getSelectedMap(){ 
  const sel = $("#map-select");
  const idx = Number(sel?.value);
  return PP.manifest[idx] || PP.manifest[0];
}

// ---------- Engine & scene ----------
function createEngineScene(){
  if(engine && scene) return;
  const canvas = $("#renderCanvas");
  if(!canvas) throw new Error("#renderCanvas missing");
  engine = new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,antialias:true});
  scene = new BABYLON.Scene(engine);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ = 0.1;
  try{ camera.inputs.clear(); }catch{}

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.35;

  engine.runRenderLoop(()=>{ if(scene) scene.render(); });
  window.addEventListener("resize", ()=> engine.resize());

  window.ENGINE = engine; window.SCENE = scene; window.camera = camera;
  log("Engine and scene created");
}

// ---------- Player Rig ----------
async function startPlayerRig(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  if(!scene) throw new Error("Scene not initialized");

  // Physics init
  const havok = await HavokPhysics();
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));

  // Capsule body
  const body = BABYLON.MeshBuilder.CreateCapsule("player_capsule",{ height:1.75, radius:0.35 },scene);
  body.isVisible = false;
  body.position.set(0,1.6,0);
  body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
  PP.rig = { body };

  // Load avatar
  const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
  const root = res.meshes[0];
  root.scaling.setAll(1);
  root.position.y = 0;
  root.parent = body;
  PP.rig.avatar = root;

  log("Player rig ready");
  document.dispatchEvent(new Event("pp:rig-ready"));
}

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started = true;

  const titleScreen = $("#title-screen");
  if(titleScreen) titleScreen.style.display = "none";
  log("Starting game…");

  createEngineScene();
  await loadManifest();

  // Load map
  const mapData = getSelectedMap();
  if(typeof PP.mapManager?.loadMap === "function"){
    await PP.mapManager.loadMap(mapData);
  }

  // Initialize player rig
  await startPlayerRig();

  // Pointer lock safe: only after click
  const canvas = $("#renderCanvas");
  if(canvas){
    canvas.addEventListener("click", ()=> {
      if(canvas.requestPointerLock) canvas.requestPointerLock();
    });
  }

  // Focus canvas
  canvas?.focus();
  log("Game fully initialized");
}

// ---------- Start button ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadManifest();
  const startBtn = $("#start-button");
  if(startBtn) startBtn.addEventListener("click", ()=> startGame());
  log("Start button bound");
});

// Expose
window.startGame = startGame;
window.startPlayerRig = startPlayerRig;

})();
