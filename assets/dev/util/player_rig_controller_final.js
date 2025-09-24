/* bootstrap.js — unified bootstrap (engine, maps, player rig, movement, pointer lock) */
(function(){
"use strict";

if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log = (...a)=>console.log("[bootstrap]", ...a);
const $ = s => document.querySelector(s);

window.PP = window.PP || {};
PP.manifest = PP.manifest || [];

// ---------- Engine & Scene ----------
let engine = null, scene = null, camera = null;
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

// ---------- Map ----------
async function fetchJSON(url){
  try{ return await (await fetch(url,{cache:"no-store"})).json(); }
  catch(e){ console.warn("fetchJSON failed:", url,e); return null; }
}

async function loadManifest(){
  const j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest=j;
  else if(j && Array.isArray(j.maps)) PP.manifest=j.maps;
  if(!PP.manifest || !PP.manifest.length){
    PP.manifest=[{file:"Abandoned_House.glb",title:"Abandoned House"}];
  }
  const sel = $("#map-select");
  if(sel){
    sel.innerHTML = PP.manifest.map((m,i)=>`<option value="${i}">${m.title||m.file||"map#"+i}</option>`).join("");
    sel.value = localStorage.getItem("selectedMapIndex")||0;
    sel.onchange = ()=> localStorage.setItem("selectedMapIndex", sel.value);
  }
}

function getSelectedMap(){
  const sel=$("#map-select"); const idx=Number(sel?.value);
  return PP.manifest[idx]||PP.manifest[0];
}

// ---------- Player Rig ----------
let input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
let mouse = { dx:0, dy:0, locked:false };
let isThird=false;

async function startPlayerRig(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;
  if(!scene) throw new Error("Scene not initialized");

  // Havok physics
  const havok = await HavokPhysics();
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));

  // Capsule
  const body = BABYLON.MeshBuilder.CreateCapsule("player_capsule",{height:1.75,radius:0.35},scene);
  body.isVisible=false;
  body.position.set(0,1.6,0);
  body.physicsImpostor = new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
  PP.rig = { body };

  // Load avatar
  const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
  const root = res.meshes[0];
  root.scaling.setAll(1);
  root.position.y = 0;
  root.parent = body;
  PP.rig.avatar = root;

  setupInput();
  moveLoop();
  log("Player rig ready");
  document.dispatchEvent(new Event("pp:rig-ready"));
}

// ---------- Input ----------
function setupInput(){
  // Keyboard
  const keysDown = {};
  const defaultKeys = { forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"], left:["KeyA","ArrowLeft"], right:["KeyD","ArrowRight"], sprint:["ShiftLeft","ShiftRight"], crouch:["KeyC"], toggleCamera:["Backquote"] };
  
  addEventListener("keydown",(e)=>{
    keysDown[e.code]=true;
    if(defaultKeys.forward.includes(e.code)) input.forward=true;
    if(defaultKeys.back.includes(e.code)) input.back=true;
    if(defaultKeys.left.includes(e.code)) input.left=true;
    if(defaultKeys.right.includes(e.code)) input.right=true;
    if(defaultKeys.sprint.includes(e.code)) input.run=true;
    if(defaultKeys.crouch.includes(e.code)) input.crouch=!input.crouch;
    if(defaultKeys.toggleCamera.includes(e.code)){ isThird=!isThird; e.preventDefault(); }
  },true);

  addEventListener("keyup",(e)=>{
    keysDown[e.code]=false;
    if(defaultKeys.forward.includes(e.code)) input.forward=false;
    if(defaultKeys.back.includes(e.code)) input.back=false;
    if(defaultKeys.left.includes(e.code)) input.left=false;
    if(defaultKeys.right.includes(e.code)) input.right=false;
    if(defaultKeys.sprint.includes(e.code)) input.run=false;
  },true);

  // Mouse
  const canvas=$("#renderCanvas");
  if(canvas){
    canvas.addEventListener("click",()=>{ if(!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
    document.addEventListener("pointerlockchange",()=>{ mouse.locked=(document.pointerLockElement===canvas); });
    document.addEventListener("mousemove",(e)=>{
      if(!mouse.locked) return;
      mouse.dx=e.movementX; mouse.dy=e.movementY;
    });
  }
}

// ---------- Movement loop ----------
function moveLoop(){
  if(!scene || !PP.rig?.body){ requestAnimationFrame(moveLoop); return; }

  const dt = engine.getDeltaTime()/1000;
  const speed = input.crouch?1:input.run?3.5:1.8;
  const body = PP.rig.body;

  // Directions
  const forward = camera.getDirection(BABYLON.Vector3.Forward()).normalize();
  const right = camera.getDirection(BABYLON.Vector3.Right()).normalize();
  let move = new BABYLON.Vector3.Zero();

  if(input.forward) move.addInPlace(forward);
  if(input.back) move.subtractInPlace(forward);
  if(input.left) move.subtractInPlace(right);
  if(input.right) move.addInPlace(right);
  if(move.lengthSquared()>0.001){
    move.normalize().scaleInPlace(speed);
    body.physicsImpostor.applyImpulse(move, body.getAbsolutePosition());
  }

  // Camera sync
  const pos = body.position;
  if(!isThird) camera.position.set(pos.x,pos.y+1.6,pos.z);
  else{
    const eye = new BABYLON.Vector3(pos.x,pos.y+1.6,pos.z);
    const back = camera.getDirection(BABYLON.Vector3.Forward()).scale(-2.8);
    camera.position.copyFrom(eye.add(new BABYLON.Vector3(0,1.25,0)).add(back));
    camera.setTarget(eye);
  }

  requestAnimationFrame(moveLoop);
}

// ---------- Start Game ----------
let started = false;
async function startGame(){
  if(started) return;
  started = true;

  $("#title-screen")?.style.display="none";
  log("Starting game…");

  createEngineScene();
  await loadManifest();

  // Load map
  const mapData = getSelectedMap();
  if(typeof PP.mapManager?.loadMap==="function") await PP.mapManager.loadMap(mapData);

  // Start player rig
  await startPlayerRig();

  // Focus canvas
  $("#renderCanvas")?.focus();
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
window.startGame=startGame;
window.startPlayerRig=startPlayerRig;
})();
