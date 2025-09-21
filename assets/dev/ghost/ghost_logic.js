/* ghost_logic.js — deterministic-safe ghost wander + events, integrated with MapGenerator, EMF, DOTS, SpiritBox, etc. */
(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;

// ---------- Ghost Object ----------
const ghost = window.ghost = window.ghost || {};
ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
ghost.type = ghost.type || "Spirit";
ghost.mode = ghost.mode || "idle";
ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(0,0,0);
ghost.roomName = ghost.roomName || "";
ghost.nearPlayer = false;
ghost.visible = false;

ghost.favoriteRoom = ghost.favoriteRoom || null; // For ghosts like Goryo

// ---------- Helpers ----------
const currentRoomName = () => {
  try { return typeof window.currentRoomName === "function" ? window.currentRoomName() : ""; }
  catch { return ""; }
};

const playerNear = (pos, range=6.0) => {
  try {
    const cam = S()?.activeCamera;
    if(!cam?.position) return false;
    return BABYLON.Vector3.Distance(cam.position, pos) <= range;
  } catch { return false; }
};

const triggerEMF = (level,pos) => {
  if(!window.EMF?.trigger) return;
  if(playerNear(pos)) window.EMF.trigger(level,pos);
};

const evidence = ghost.evidence || [];
const hasEvidence = ev => evidence.includes(ev);

// ---------- Event Handlers ----------
const onSaltWalk        = pos => triggerEMF(1,pos);
const onBookThrow       = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
const onBookWrite       = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
const onPlateThrow      = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
const onCrossBurn       = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
const onBreakerInteract = pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
const onObjectInteract  = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

// ---------- Wander & Pathfinding Helpers ----------
function isGhostAllowedInRoom(roomName){
  if(!roomName) return false;
  // Garage and front door restrictions
  if(roomName.toLowerCase() === "garage") return false;
  if(roomName.toLowerCase() === "foyer") return false;
  // Bedrooms cannot go to garage
  if(ghost.type === "Goryo" && ghost.favoriteRoom) return roomName === ghost.favoriteRoom;
  return true;
}

function getValidAdjacentPositions(){
  const mg = window.MapGenerator;
  if(!mg) return [ghost.position.clone()];
  const currentRoom = ghost.roomName;
  const roomCenter = mg.getRoomCenter(currentRoom) || ghost.position.clone();
  let positions = [];

  // Sample positions inside room, respecting walls
  for(let i=0;i<6;i++){
    const offset = new BABYLON.Vector3((Math.random()-0.5)*4,0,(Math.random()-0.5)*4);
    const candidate = roomCenter.add(offset);
    if(mg.isPositionInsideRoom(candidate,currentRoom)) positions.push(candidate);
  }
  if(positions.length===0) positions.push(roomCenter.clone());
  return positions;
}

// ---------- Wander Loop ----------
let t = 0, nextEvent = 10 + Math.random()*10;
let radioCooldown = 0;
let wanderTarget = ghost.roomCenter.clone();

const attachLoop = () => {
  const sc = S();
  if(!sc){ setTimeout(attachLoop,120); return; }
  const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

  sc.onBeforeRenderObservable.add(() => {
    const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
    t += dt;
    if(radioCooldown > 0) radioCooldown -= dt;

    // Select new wander target occasionally
    if(Math.random() < 0.015){
      const candidates = getValidAdjacentPositions();
      wanderTarget = candidates[Math.floor(Math.random()*candidates.length)];
    }

    // Move ghost toward target
    let dir = wanderTarget.subtract(ghost.position);
    dir.y = 0;
    const L = dir.length();
    const speed = 0.6;
    if(L > 0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(L, dt*speed)));

    // Check player proximity
    try{
      const cam = sc.activeCamera;
      ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
    } catch{}

    // Periodic ghost events
    if(t >= nextEvent){
      t=0; nextEvent=8 + Math.random()*12;

      try {
        const r = Math.random();
        if(r<0.25) window.GhostAudio?.whisper?.();
        else if(r<0.55) window.GhostAudio?.doorCreak?.();
        else if(r<0.80) window.GhostAudio?.doorSlam?.();
        else window.GhostAudio?.toss?.();
      } catch{}

      try{
        const cam = sc.activeCamera;
        const dist = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) : 999;
        if(dist < 6.0) window.EMFAudio?.extend?.(10 + Math.random()*5);

        const inRoom = ghost.roomName && currentRoomName()===ghost.roomName;
        const radioChance = inRoom ? 0.45 : 0.12;
        if(radioCooldown <=0 && Math.random()<radioChance){
          window.RadioAudio?.playOnce?.();
          radioCooldown = 20 + Math.random()*20;
        }
      } catch{}
    }
  });
};

attachLoop();

// ---------- Expose Event Handlers ----------
window.GhostEvents = {
  onSaltWalk,
  onBookThrow,
  onBookWrite,
  onPlateThrow,
  onCrossBurn,
  onBreakerInteract,
  onObjectInteract
};
})();
