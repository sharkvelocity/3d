// ghost_logic.js
// Full deterministic-safe ghost logic for PhasmaPhoney
// Includes: wander, event triggers, map constraints, room-aware movement

(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

// ---------- Scene Helper ----------
const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;

// ---------- Ghost Base ----------
const ghost = window.ghost = window.ghost || {};
ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
ghost.type = ghost.type || "Spirit";
ghost.mode = ghost.mode || "idle";
ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(2,0,2);
ghost.roomName = ghost.roomName || "";
ghost.nearPlayer = false;
ghost.visible = false;

// ---------- Map & Room Helpers ----------
const currentRoomName = () => {
    try { return typeof window.currentRoomName === "function" ? window.currentRoomName() : ""; }
    catch { return ""; }
};

// Check if ghost can occupy position based on walls and doors
function isValidPosition(pos){
    if(!window.MAP_DEF || !window.MAP_DEF.rooms) return true;
    try {
        // Ghost cannot go outside rooms' boundaries
        for(const room of MAP_DEF.rooms){
            if(!room.bounds) continue;
            const b = room.bounds; // {min:{x,y,z}, max:{x,y,z}}
            if(pos.x >= b.min.x && pos.x <= b.max.x &&
               pos.y >= b.min.y && pos.y <= b.max.y &&
               pos.z >= b.min.z && pos.z <= b.max.z){
                // Found containing room
                if(room.type === "frontDoor") return false; // front door not open for ghost
                return true;
            }
        }
        return false;
    } catch { return true; }
}

// ---------- Player Proximity ----------
const playerNear = (pos, range=6.0) => {
    try {
        const cam = S()?.activeCamera;
        if(!cam?.position) return false;
        return BABYLON.Vector3.Distance(cam.position, pos) <= range;
    } catch { return false; }
};

// ---------- Evidence / Event Triggers ----------
const triggerEMF = (level, pos) => {
    if(!window.EMF?.trigger) return;
    if(playerNear(pos)) window.EMF.trigger(level, pos);
};

const evidence = ghost.evidence || [];
const hasEvidence = ev => evidence.includes(ev);

const onSaltWalk        = pos => triggerEMF(1, pos);
const onBookThrow       = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
const onBookWrite       = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
const onPlateThrow      = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
const onCrossBurn       = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
const onBreakerInteract = pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
const onObjectInteract  = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

// ---------- Wander Loop ----------
let t = 0, nextEvent = 10 + Math.random()*10;
let radioCooldown = 0;
let wanderTarget = ghost.roomCenter.clone();

// Choose a random position within the ghost's allowed rooms
function pickWanderTarget(){
    if(!window.MAP_DEF?.rooms) return ghost.roomCenter.clone();
    const rooms = MAP_DEF.rooms.filter(r => r.type !== "frontDoor");
    if(!rooms.length) return ghost.roomCenter.clone();
    const room = rooms[Math.floor(Math.random()*rooms.length)];
    const b = room.bounds;
    let attempt = 0;
    let pos = new BABYLON.Vector3();
    do {
        pos.x = b.min.x + Math.random() * (b.max.x - b.min.x);
        pos.y = b.min.y; // ground-level
        pos.z = b.min.z + Math.random() * (b.max.z - b.min.z);
        attempt++;
    } while(!isValidPosition(pos) && attempt < 20);
    ghost.roomName = room.name || "";
    ghost.roomCenter = new BABYLON.Vector3(
        (b.min.x+b.max.x)/2,
        (b.min.y+b.max.y)/2,
        (b.min.z+b.max.z)/2
    );
    return pos;
}

const attachLoop = () => {
    const sc = S();
    if(!sc){ setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
        const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
        t += dt;
        if(radioCooldown > 0) radioCooldown -= dt;

        // small wandering
        if(Math.random() < 0.01 || BABYLON.Vector3.Distance(wanderTarget, ghost.position) < 0.1){
            wanderTarget = pickWanderTarget();
        }

        // move ghost toward wanderTarget
        const dir = wanderTarget.subtract(ghost.position);
        dir.y = 0;
        const L = dir.length();
        const speed = 0.6;
        if(L > 0.01){
            const step = dir.normalize().scale(Math.min(L, dt*speed));
            const nextPos = ghost.position.add(step);
            if(isValidPosition(nextPos)) ghost.position.copyFrom(nextPos);
        }

        // near player
        try{
            const cam = sc.activeCamera;
            ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
        } catch{}

        // periodic events
        if(t >= nextEvent){
            t = 0; nextEvent = 8 + Math.random()*12;

            if(!((ghost?.type||"").toLowerCase() === "shade" && currentRoomName() === ghost.roomName)){
                try{
                    const r = Math.random();
                    if(r < 0.25) window.GhostAudio?.whisper?.();
                    else if(r < 0.55) window.GhostAudio?.doorCreak?.();
                    else if(r < 0.80) window.GhostAudio?.doorSlam?.();
                    else window.GhostAudio?.toss?.();
                } catch{}
            }

            try{
                const cam = sc.activeCamera;
                const dist = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) : 999;
                if(dist < 6.0) window.EMFAudio?.extend?.(10 + Math.random()*5);

                const inRoom = ghost.roomName && currentRoomName() === ghost.roomName;
                const radioChance = inRoom ? 0.45 : 0.12;
                if(radioCooldown <= 0 && Math.random() < radioChance){
                    window.RadioAudio?.playOnce?.();
                    radioCooldown = 20 + Math.random()*20;
                }
            } catch{}
        }
    });
};

attachLoop();

// ---------- Expose ----------
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
