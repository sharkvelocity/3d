/* bootstrap.js — unified bootstrap with player rig + WASD + mouse + gamepad + physics */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const $ = s => document.querySelector(s);

// ----- Loader UI -----
const Loader = {
  steps: [],
  addStep(label, fn){ this.steps.push({label, fn}); },
  async run(){
    for(const s of this.steps){
      console.log("[bootstrap] Step:", s.label);
      try{ await s.fn(); }catch(e){ console.warn("[bootstrap] step failed:", s.label, e); }
    }
    this.steps = [];
  }
};

// ----- State -----
let engine=null, scene=null, camera=null;
window.PP = window.PP || {};
PP.manifest = PP.manifest || [];

// ----- Maps -----
async function loadManifest(){
  const data = await fetch("./assets/models/map/maps.json").then(r=>r.json()).catch(()=>null);
  PP.manifest = Array.isArray(data) ? data : data?.maps || [];
  if(!PP.manifest.length){
    PP.manifest = [
      { file: "Abandoned_House.glb", title: "Abandoned House" },
      { file: "furnished_house.glb", title: "Furnished House" },
      { title: "Procedural ProHouse", def: "prohouse_generator" }
    ];
  }
  const sel = $("#map-select");
  if(sel){
    sel.innerHTML = PP.manifest.map((m,i)=>{
      const title = m.title || m.file || `Map #${i}`;
      return `<option value="${i}">${title}</option>`;
    }).join("");
    sel.value = localStorage.getItem("selectedMapIndex") || 0;
    sel.onchange = ()=> localStorage.setItem("selectedMapIndex", sel.value);
  }
}

function getSelectedMap(){
  const sel = $("#map-select");
  const idx = Number(sel?.value || 0);
  return PP.manifest[idx] || PP.manifest[0];
}

// ----- Engine & Scene -----
function createEngineScene(){
  if(engine && scene) return;
  const canvas = $("#renderCanvas");
  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
  scene  = new BABYLON.Scene(engine);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.35;

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ = 0.1;
  try{ camera.inputs.clear(); }catch(e){}

  engine.runRenderLoop(()=> scene.render());
  window.addEventListener("resize", ()=> engine.resize());

  window.ENGINE = engine;
  window.SCENE = scene;
  window.camera = camera;
}

// ----- Player Rig -----
async function startPlayerRig(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const AVATAR = { file:"./assets/models/player/player.glb", eyeY:1.6, targetHeight:1.75 };
  const SPEEDS = { walk:1.8, run:3.5, crouch:1.0 };
  const PP = window.PP;
  PP.rig = {};
  PP.state = PP.state || {};
  const input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
  let mouse = { dx:0, dy:0, locked:false };
  let lastCrouchPressed=false;

  // ----- Scene & Camera -----
  const scene = window.SCENE;
  const camera = window.camera;

  // ----- Physics + Capsule -----
  const body = BABYLON.MeshBuilder.CreateCapsule("player_capsule",{ height:AVATAR.targetHeight, radius:0.35 },scene);
  body.isVisible = false;
  body.position.set(0, AVATAR.eyeY, 0);
  const havok = await HavokPhysics();
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));
  body.physicsImpostor = new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
  PP.rig.body = body;

  // ----- Avatar -----
  const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
  const root = res.meshes[0];
  root.scaling.setAll(1);
  const bb = root.getHierarchyBoundingVectors();
  root.scaling.setAll(AVATAR.targetHeight / (bb.max.y - bb.min.y));
  root.position.y -= root.getHierarchyBoundingVectors().min.y;
  root.parent = body;
  PP.rig.avatar = root;

  // ----- Keyboard -----
  document.addEventListener("keydown",(e)=>{
    if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
    switch(e.code){
      case "KeyW": case "ArrowUp": input.forward=true; break;
      case "KeyS": case "ArrowDown": input.back=true; break;
      case "KeyA": case "ArrowLeft": input.left=true; break;
      case "KeyD": case "ArrowRight": input.right=true; break;
      case "ShiftLeft": case "ShiftRight": input.run=true; break;
      case "KeyC": if(!lastCrouchPressed){ input.crouch=!input.crouch; lastCrouchPressed=true; } break;
    }
  });
  document.addEventListener("keyup",(e)=>{
    switch(e.code){
      case "KeyW": case "ArrowUp": input.forward=false; break;
      case "KeyS": case "ArrowDown": input.back=false; break;
      case "KeyA": case "ArrowLeft": input.left=false; break;
      case "KeyD": case "ArrowRight": input.right=false; break;
      case "ShiftLeft": case "ShiftRight": input.run=false; break;
      case "KeyC": lastCrouchPressed=false; break;
    }
  });

  // ----- Mouse -----
  const canvas = $("#renderCanvas");
  canvas.addEventListener("click",()=>{ if(canvas.requestPointerLock) canvas.requestPointerLock(); });
  document.addEventListener("pointerlockchange",()=>{ mouse.locked=document.pointerLockElement===canvas; });
  document.addEventListener("mousemove",(e)=>{ if(!mouse.locked) return; mouse.dx=e.movementX; mouse.dy=e.movementY; });

  // ----- Gamepad -----
  function pollGamepad(){
    const pads = navigator.getGamepads?.(); if(!pads) return;
    const pad = pads[0]; if(!pad) return;
    input.left = pad.axes[0]<-0.2; input.right = pad.axes[0]>0.2;
    input.forward = pad.axes[1]<-0.2; input.back = pad.axes[1]>0.2;
    input.run = pad.buttons[0];
    if(pad.buttons[1] && !lastCrouchPressed) input.crouch = !input.crouch;
    lastCrouchPressed = pad.buttons[1];
    requestAnimationFrame(pollGamepad);
  }
  pollGamepad();

  // ----- Movement loop -----
  function moveLoop(){
    if(!scene || !body) return requestAnimationFrame(moveLoop);
    const dt = scene.getEngine().getDeltaTime()/1000;
    const forward = camera.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right = camera.getDirection(BABYLON.Vector3.Right()).normalize();

    let move = new BABYLON.Vector3(0,0,0);
    if(input.forward) move.addInPlace(forward);
    if(input.back) move.subtractInPlace(forward);
    if(input.left) move.subtractInPlace(right);
    if(input.right) move.addInPlace(right);

    if(move.lengthSquared() > 0.001){
      move.normalize();
      const speed = input.crouch ? SPEEDS.crouch : input.run ? SPEEDS.run : SPEEDS.walk;
      body.physicsImpostor.applyImpulse(move.scale(speed), body.getAbsolutePosition());
    }

    // Camera follows capsule
    camera.position.set(body.position.x, body.position.y+AVATAR.eyeY, body.position.z);

    requestAnimationFrame(moveLoop);
  }
  moveLoop();

  // ✅ Signal rig ready
  PP.rigReady = true;
  document.dispatchEvent(new Event("pp:rig-ready"));
}

// ----- Start Game -----
async function startGame(){
  const titleScreen = $("#title-screen");
  if(titleScreen) titleScreen.style.display="none";

  createEngineScene();
  await loadManifest();

  const mapData = getSelectedMap();
  if(typeof PP.mapManager?.loadMap==="function") await PP.mapManager.loadMap(mapData);

  await startPlayerRig();
  $("#renderCanvas")?.focus();
  log("Game fully initialized");
}

// ----- Start Button -----
const startBtn = $("#start-button");
if(startBtn) startBtn.addEventListener("click", ()=> startGame());

// Expose globally
window.startGame = startGame;
})();
