/* bootstrap.js — unified game bootstrap with player rig + maps + audio + controls */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

const $ = s => document.querySelector(s);

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

window.PP = window.PP || {};
PP.manifest = PP.manifest || [];
PP.rig = PP.rig || {};
PP.state = PP.state || {};
PP.controls = PP.controls || {};

// ---------- Map Manifest / Selector ----------
async function fetchJSON(url){
  try{
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url,e); return null; }
}

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

  const sel = $("#map-select");
  if(sel){
    sel.innerHTML = PP.manifest.map((m,i)=>`<option value="${i}">${m.title||m.file||("map#"+i)}</option>`).join("");
    let saved = parseInt(localStorage.getItem("selectedMapIndex"));
    if(isNaN(saved)||saved<0||saved>=PP.manifest.length) saved=0;
    sel.value=saved;
    sel.onchange=()=>{ localStorage.setItem("selectedMapIndex", sel.value); };
  }
}

function getSelectedMap(){
  const sel = $("#map-select");
  const idx = Number(sel?.value);
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

  hemi=new BABYLON.HemisphericLight("hemi",new BABYLON.Vector3(0,1,0),scene);
  hemi.intensity=0.35;

  camera=new BABYLON.UniversalCamera("playerCam",new BABYLON.Vector3(0,1.8,0),scene);
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

// ---------- Player Rig ----------
const AVATAR = { file:"./assets/models/player/player.glb", eyeY:1.6, targetHeight:1.75, meshYOffset:0.0 };
const CAM3 = { back:2.8, up:1.25 };
const SPEEDS = { walk:1.8, run:3.5, crouch:1.0 };
const MAX_SLOPE=45;
let body=null, avatarRoot=null, avatarMeshes=[], isThird=false;
let animations={idle:null,walk:null,crouchWalk:null}, currentAnim=null;

const input={forward:false,back:false,left:false,right:false,run:false,crouch:false};
let lastCrouchPressed=false;
const keysDown={};
const mouse={dx:0,dy:0,locked:false};
const gamepad={axes:[0,0],buttons:[]};
const defaultKeys = {
  forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"],
  left:["KeyA","ArrowLeft"], right:["KeyD","ArrowRight"],
  sprint:["ShiftLeft","ShiftRight"], crouch:["KeyC"],
  toggleCamera:["Backquote"], slots:["Digit1","Digit2","Digit3","Digit4"],
  notebook:["KeyN"], use:["KeyE"], openDoor:["KeyF"],
  flash:["KeyQ"], uv:["KeyU"], ir:["KeyI"],
  lightToggle:["KeyL"], powerToggle:["KeyP"], minimap:["KeyM"]
};

function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name,{detail})); }catch{} }
function has(arr,code){ return Array.isArray(arr)&&arr.includes(code); }
function uiBusy(){ const ae=document.activeElement; return ae&&(ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.isContentEditable); }
function selectSlot(n){ n=Math.max(1,Math.min(3,n|0)); const prev=PP.state.selectedSlot; if(prev===n){ emit("pp:slot:confirm",{slot:n}); return; } PP.state.selectedSlot=n; emit("pp:slot:change",{prev,next:n}); }

addEventListener("keydown",(e)=>{
  if(uiBusy()) return;
  keysDown[e.code]=true;
  if(has(defaultKeys.forward,e.code)) input.forward=true;
  if(has(defaultKeys.back,e.code)) input.back=true;
  if(has(defaultKeys.left,e.code)) input.left=true;
  if(has(defaultKeys.right,e.code)) input.right=true;
  if(has(defaultKeys.sprint,e.code)) input.run=true;
  if(has(defaultKeys.crouch,e.code)) input.crouch=!input.crouch;
  if(has(defaultKeys.toggleCamera,e.code)) { isThird=!isThird; e.preventDefault(); }
  if(has(defaultKeys.slots,e.code)){ const n=parseInt(e.code.replace(/\D/g,""))||0; if(n>=1&&n<=3) selectSlot(n); }
},true);

addEventListener("keyup",(e)=>{
  keysDown[e.code]=false;
  if(has(defaultKeys.forward,e.code)) input.forward=false;
  if(has(defaultKeys.back,e.code)) input.back=false;
  if(has(defaultKeys.left,e.code)) input.left=false;
  if(has(defaultKeys.right,e.code)) input.right=false;
  if(has(defaultKeys.sprint,e.code)) input.run=false;
},true);

const canvas=document.querySelector("canvas");
if(canvas){
  canvas.addEventListener("click",()=>{ if(!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
  document.addEventListener("pointerlockchange",()=>{ mouse.locked=(document.pointerLockElement===canvas); });
  document.addEventListener("mousemove",(e)=>{
    if(!mouse.locked) return;
    mouse.dx=e.movementX; mouse.dy=e.movementY;
    emit("pp:mouseMove",{dx:mouse.dx,dy:mouse.dy});
  });
}

// Gamepad
function pollGamepad(){
  const pads=navigator.getGamepads?.(); if(!pads) return;
  const pad=pads[0]; if(!pad) return;
  gamepad.axes=[pad.axes[0],pad.axes[1]];
  gamepad.buttons=pad.buttons.map(b=>b.pressed);
  input.left=gamepad.axes[0]<-0.2; input.right=gamepad.axes[0]>0.2;
  input.forward=gamepad.axes[1]<-0.2; input.back=gamepad.axes[1]>0.2;
  input.run=gamepad.buttons[0];
  if(gamepad.buttons[1] && !lastCrouchPressed) input.crouch=!input.crouch;
  lastCrouchPressed=gamepad.buttons[1];
  requestAnimationFrame(pollGamepad);
}
pollGamepad();

// Physics helpers
function getSpawnPosition(){ return window.__PP_SPAWN?.clone()||new BABYLON.Vector3(0,AVATAR.eyeY,0); }
function makeBody(){
  body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule",{ height:AVATAR.targetHeight, radius:0.35 },scene);
  body.isVisible=false;
  body.position.copyFrom(getSpawnPosition());
  body.physicsImpostor=new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
  PP.rig.body=body;
  return body;
}
async function loadAvatar(){
  const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
  const root=res.meshes[0];
  root.scaling.setAll(1);
  const bb=root.getHierarchyBoundingVectors();
  const scale=AVATAR.targetHeight/(bb.max.y-bb.min.y);
  root.scaling.setAll(scale);
  const bb2=root.getHierarchyBoundingVectors();
  root.position.y-=bb2.min.y;
  avatarRoot=root;
  avatarMeshes=root.getChildMeshes();
  avatarRoot.parent=body;

  res.animationGroups.forEach(g=>{
    if(/Idle/i.test(g.name)) animations.idle=g;
    if(/Walk/i.test(g.name)) animations.walk=g;
    if(/Crouch/i.test(g.name)) animations.crouchWalk=g;
  });
  playAnim("idle");
}

function playAnim(name){
  if(currentAnim===animations[name]) return;
  Object.values(animations).forEach(g=>g?.stop());
  animations[name]?.start(true);
  currentAnim=animations[name];
}

function syncCamera(){
  if(!camera||!body) return;
  const pos=body.position;
  if(!isThird) camera.position.set(pos.x,pos.y+AVATAR.eyeY,pos.z);
  else{
    const eye=new BABYLON.Vector3(pos.x,pos.y+AVATAR.eyeY,pos.z);
    const back=camera.getDirection(BABYLON.Vector3.Forward()).scale(-CAM3.back);
    camera.position.copyFrom(eye.add(new BABYLON.Vector3(0,CAM3.up,0)).add(back));
    camera.setTarget(eye);
  }
}

function stickToGround(moveDir){
  if(!body||!scene) return moveDir||BABYLON.Vector3.Zero();
  const origin=body.position.add(new BABYLON.Vector3(0,1,0));
  const ray=new BABYLON.Ray(origin,BABYLON.Axis.Y.scale(-1),4);
  const pick=scene.pickWithRay(ray,m=>m.isPickable && m.name.toLowerCase().includes("ground"));
  if(!pick.hit) return moveDir||BABYLON.Vector3.Zero();
  const groundPoint=pick.pickedPoint;
  const groundNormal=pick.getNormal(true);
  body.position.y=groundPoint.y+AVATAR.targetHeight/2;
  if(moveDir&&moveDir.lengthSquared()>0.001){
    const slopeAngle=BABYLON.Vector3.GetAngleBetweenVectors(BABYLON.Axis.Y,groundNormal,BABYLON.Vector3.Forward())*(180/Math.PI);
    if(slopeAngle<=MAX_SLOPE) return moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir,groundNormal))).normalize();
    else return BABYLON.Vector3.Zero();
  }
  return moveDir||BABYLON.Vector3.Zero();
}

// Footsteps
const footstepState={lastPos:null,acc:0};
function handleFootsteps(moveVec){
  if(!moveVec||moveVec.lengthSquared()<0.001||!body) return;
  if(!footstepState.lastPos) footstepState.lastPos=body.position.clone();
  const dist=BABYLON.Vector3.Distance(footstepState.lastPos,body.position);
  footstepState.acc+=dist;
  const stride=input.crouch?0.3:input.run?0.8:0.5;
  if(footstepState.acc>=stride){
    footstepState.acc=0;
    footstepState.lastPos.copyFrom(body.position);
    if(typeof window.playStep==="function") try{ window.playStep(0.42); }catch{}
  }
}

// Movement loop
function moveLoop(){
  if(!scene||!body||!camera){ requestAnimationFrame(moveLoop); return; }
  const dt=scene.getEngine().getDeltaTime()/1000;
  const forward=camera.getDirection(BABYLON.Vector3.Forward()).normalize();
  const right=camera.getDirection(BABYLON.Vector3.Right()).normalize();
  let move=new BABYLON.Vector3(0,0,0);
  if(input.forward) move.addInPlace(forward);
  if(input.back) move.subtractInPlace(forward);
  if(input.left) move.subtractInPlace(right);
  if(input.right) move.addInPlace(right);

  if(move.lengthSquared()>0.001){
    move.normalize();
    const speed=input.crouch?SPEEDS.crouch:(input.run?SPEEDS.run:SPEEDS.walk);
    const slopeMove=stickToGround(move);
    if(slopeMove.lengthSquared()>0.001) body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());
    playAnim(input.crouch?"crouchWalk":"walk");
    handleFootsteps(slopeMove);
  } else playAnim("idle");

  stickToGround();
  syncCamera();
  requestAnimationFrame(moveLoop);
}

// Start player rig
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
  Loader.addStep("Loading manifest…", async ()=>loadManifest());
  Loader.addStep("Loading map…", async ()=>{
    const mapData=getSelectedMap();
    if(typeof PP.mapManager?.loadMap==="function") await PP.mapManager.loadMap(mapData);
  });
  Loader.addStep("Starting player rig…", async ()=>await startPlayerRig());
  await Loader.run();

  $("#renderCanvas")?.focus();
  log("Game fully initialized");
}

// Bind start button
document.addEventListener("DOMContentLoaded",()=>{
  const startBtn=$("#start-button");
  if(startBtn) startBtn.addEventListener("click",()=>startGame());
});
window.startGame=startGame;

})();
