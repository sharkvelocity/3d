/* ghost_logic.js — Babylon.js ghost AI constrained to map */
(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;
const Vec3 = BABYLON.Vector3;

const ghost = window.ghost = window.ghost || {};
ghost.position = ghost.position instanceof Vec3 ? ghost.position : new Vec3(0,0,0);
ghost.room = null; // current room
ghost.type = ghost.type || "Spirit";
ghost.mode = ghost.mode || "idle";
ghost.nearPlayer = false;
ghost.visible = false;

// ---------- Helpers ----------
const distance = (a,b)=> Vec3.Distance(a,b);

function playerPos(){ 
  try { return S()?.activeCamera?.position || new Vec3(0,0,0); }
  catch{return new Vec3(0,0,0);}
}

function pickRoom(){
  const rooms = window.MapGenerator?.rooms || [];
  if(!rooms.length) return null;
  // choose a valid room for this ghost
  return rooms[Math.floor(Math.random()*rooms.length)];
}

// ---------- Wander Loop ----------
let wanderTarget = ghost.position.clone();
let t=0, nextEvent=10;
let radioCooldown=0;

function updateGhost(dt){
  const rooms = window.MapGenerator?.rooms || [];
  if(!rooms.length) return;

  t+=dt;
  if(radioCooldown>0) radioCooldown-=dt;

  // pick room if none
  if(!ghost.room){
    ghost.room = pickRoom();
    wanderTarget = randomInRoom(ghost.room);
    ghost.position.copyFrom(wanderTarget);
  }

  // small wandering
  if(Math.random()<0.01){
    wanderTarget = randomInRoom(ghost.room);
  }

  // move ghost
  const dir = wanderTarget.subtract(ghost.position);
  dir.y=0;
  const L = dir.length();
  const speed = 0.6;
  if(L>0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(L, dt*speed)));

  // near player
  const cam = S()?.activeCamera;
  ghost.nearPlayer = cam ? distance(cam.position, ghost.position)<5 : false;

  // periodic events
  if(t>=nextEvent){
    t=0; nextEvent = 8 + Math.random()*12;
    // play ghost sounds
    if(Math.random()<0.3) window.GhostAudio?.whisper?.();
    else if(Math.random()<0.6) window.GhostAudio?.doorCreak?.();
  }
}

// ---------- Helper ----------
function randomInRoom(room){
  const gsize = MapGenerator?.gridSize||2;
  const x = room.x*gsize + Math.random()*room.w*gsize;
  const z = room.z*gsize + Math.random()*room.d*gsize;
  return new Vec3(x,0,z);
}

// ---------- Attach to Babylon Scene ----------
function attachLoop(){
  const sc = S();
  if(!sc){ setTimeout(attachLoop,100); return; }
  const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;
  sc.onBeforeRenderObservable.add(()=>{
    const dt = (eng?.getDeltaTime?.()||16.7)/1000;
    updateGhost(dt);
  });
}

attachLoop();

// ---------- Expose ----------
window.GhostEvents = {};
})();
