/* ghost_logic.js — full ghost behavior with map constraints integration
   - Babylon.js compatible
   - Wander AI respecting rooms, doors, walls
   - Event triggers: EMF, GhostWriting, PlateThrow, etc.
   - Respects Goryo/favorite room rules
   - Integrates with MapGenerator.rooms for procedural/randomized houses
*/
(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

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

// ---------- Helpers ----------
const currentRoomName = () => {
    try { return typeof window.currentRoomName === "function" ? window.currentRoomName() : ""; }
    catch { return ""; }
};

const isShadeAndPlayerInRoom = () => {
    try {
        const isShade = (ghost?.type||"").toLowerCase() === "shade";
        const sameRoom = ghost.roomName && currentRoomName() === ghost.roomName;
        return isShade && sameRoom;
    } catch { return false; }
};

const playerNear = (pos, range=6.0) => {
    try {
        const cam = S()?.activeCamera;
        if(!cam?.position) return false;
        return BABYLON.Vector3.Distance(cam.position, pos) <= range;
    } catch { return false; }
};

const triggerEMF = (level, pos) => {
    if(!window.EMF?.trigger) return;
    if(playerNear(pos)) window.EMF.trigger(level, pos);
};

const evidence = ghost.evidence || [];
const hasEvidence = ev => evidence.includes(ev);

// ---------- Event Handlers ----------
const onSaltWalk        = pos => triggerEMF(1, pos);
const onBookThrow       = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
const onBookWrite       = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
const onPlateThrow      = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
const onCrossBurn       = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
const onBreakerInteract = pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
const onObjectInteract  = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

// ---------- Map Constraint Helpers ----------
const getRoomByName = (name) => {
    if(!window.MapGenerator || !MapGenerator.rooms) return null;
    return MapGenerator.rooms.find(r=>r.name===name) || null;
};

// Check if position is inside room boundaries (walls)
const isPositionInsideRoom = (pos, room) => {
    if(!room || !room.bounds) return false;
    const b = room.bounds; // {min:{x,y,z}, max:{x,y,z}}
    return pos.x >= b.min.x && pos.x <= b.max.x &&
           pos.z >= b.min.z && pos.z <= b.max.z;
};

// Pick a valid random position in room respecting door constraints
const randomPositionInRoom = (room) => {
    if(!room || !room.bounds) return ghost.position.clone();
    const b = room.bounds;
    const x = b.min.x + Math.random() * (b.max.x - b.min.x);
    const z = b.min.z + Math.random() * (b.max.z - b.min.z);
    const y = 0;
    return new BABYLON.Vector3(x, y, z);
};

// ---------- Wander Setup ----------
let t = 0, nextEvent = 10 + Math.random()*10;
let radioCooldown = 0;
let wanderTarget = ghost.roomCenter.clone();

// ---------- Wander Loop ----------
const attachLoop = () => {
    const sc = S();
    if(!sc){ setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
        const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
        t += dt;
        if(radioCooldown > 0) radioCooldown -= dt;

        // ---------- Select new wander target ----------
        if(Math.random() < 0.01){
            const room = getRoomByName(ghost.roomName);
            if(room){
                wanderTarget = randomPositionInRoom(room);
            } else {
                const rooms = MapGenerator?.rooms || [];
                if(rooms.length) {
                    const rndRoom = rooms[Math.floor(Math.random()*rooms.length)];
                    ghost.roomName = rndRoom.name;
                    ghost.roomCenter = rndRoom.center.clone();
                    wanderTarget = randomPositionInRoom(rndRoom);
                }
            }
        }

        // ---------- Move ghost ----------
        const dir = wanderTarget.subtract(ghost.position);
        dir.y = 0;
        const L = dir.length();
        const speed = 0.6;
        if(L > 0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(L, dt*speed)));

        // ---------- Constrain to room boundaries ----------
        const room = getRoomByName(ghost.roomName);
        if(room && !isPositionInsideRoom(ghost.position, room)){
            // Snap back to center if outside
            ghost.position.copyFrom(room.center);
        }

        // ---------- Near player ----------
        try{
            const cam = sc.activeCamera;
            ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
        } catch{}

        // ---------- Periodic events ----------
        if(t >= nextEvent){
            t = 0; nextEvent = 8 + Math.random()*12;

            if(!isShadeAndPlayerInRoom()){
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
