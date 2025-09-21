// ghost_logic.js — integrates with procedural map
(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;
const rooms = window.generatedRooms || []; // from map_generator.js
const doorMeshes = []; // optional: cached meshes for doors if you want physical collision checks

// ---------- Ghost state ----------
const ghost = window.ghost = window.ghost || {};
ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
ghost.type = ghost.type || "Spirit";
ghost.mode = ghost.mode || "idle";
ghost.currentRoom = ghost.currentRoom || null;
ghost.nearPlayer = false;
ghost.visible = false;

// ---------- Helpers ----------
function playerPos(){ return S()?.activeCamera?.position || new BABYLON.Vector3(0,0,0); }
function distance(a,b){ return a.subtract(b).length(); }

// Get room by name
function getRoomByName(name){ return rooms.find(r => r.name === name) || null; }

// Get room containing point
function getRoomContaining(pos){
    for(const r of rooms){
        const halfW = r.size.width/2, halfD = r.size.depth/2;
        const minX = r.position.x - halfW, maxX = r.position.x + halfW;
        const minZ = r.position.z - halfD, maxZ = r.position.z + halfD;
        if(pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) return r;
    }
    return null;
}

// Check if ghost can enter room
function canEnterRoom(room){
    if(!room) return false;
    if(room.name === "FrontDoor") return false; // front door blocked
    // Goryo constraint: only favorite room + nearby
    if(ghost.type.toLowerCase() === "goryo" && ghost.favoriteRoom && room.name !== ghost.favoriteRoom){
        const fav = getRoomByName(ghost.favoriteRoom);
        if(!fav) return false;
        const dist = distance(room.position, fav.position);
        if(dist > 10) return false; // max wander distance
    }
    return true;
}

// Pick a random point inside a room
function randomPointInRoom(room){
    const halfW = room.size.width/2, halfD = room.size.depth/2;
    const x = room.position.x + (Math.random()*room.size.width - halfW);
    const z = room.position.z + (Math.random()*room.size.depth - halfD);
    return new BABYLON.Vector3(x, 0, z);
}

// Get next room to move to through a door
function nextRoomFromCurrent(){
    if(!ghost.currentRoom) return null;
    const doors = ghost.currentRoom.doors || [];
    const valid = doors.map(d => getRoomByName(d.target)).filter(canEnterRoom);
    if(!valid.length) return ghost.currentRoom; // no exits, stay
    return valid[Math.floor(Math.random()*valid.length)];
}

// ---------- Event handlers ----------
function triggerEMF(level,pos){
    if(!window.EMF?.trigger) return;
    if(distance(playerPos(), pos) <= 6) window.EMF.trigger(level, pos);
}
function onSaltWalk(pos){ triggerEMF(1,pos); }
function onBookThrow(pos){ triggerEMF(2,pos); }
function onBookWrite(pos){ triggerEMF(3,pos); }
function onPlateThrow(pos){ triggerEMF(2,pos); }
function onCrossBurn(pos){ triggerEMF(3,pos); }
function onBreakerInteract(pos){ triggerEMF(4,pos); }
function onObjectInteract(pos,base=1){ triggerEMF(base,pos); }

// ---------- Wander Loop ----------
let wanderTarget = ghost.position.clone();
let timeCounter = 0, nextEvent = 5 + Math.random()*5;

function pickNextTarget(){
    // 70% chance to stay in current room, 30% chance to go to next room
    if(Math.random() < 0.3){
        const nextRoom = nextRoomFromCurrent();
        ghost.currentRoom = nextRoom;
        wanderTarget = randomPointInRoom(nextRoom);
    } else if(ghost.currentRoom){
        wanderTarget = randomPointInRoom(ghost.currentRoom);
    } else {
        ghost.currentRoom = getRoomContaining(ghost.position) || rooms[0];
        wanderTarget = randomPointInRoom(ghost.currentRoom);
    }
}

function attachLoop(){
    const sc = S();
    if(!sc){ setTimeout(attachLoop,120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(()=>{
        const dt = (eng?.getDeltaTime?.()||16.7)/1000;
        timeCounter += dt;

        // move ghost
        const dir = wanderTarget.subtract(ghost.position);
        dir.y = 0;
        const len = dir.length();
        const speed = 0.6;
        if(len>0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(len, dt*speed)));

        // near player
        ghost.nearPlayer = distance(playerPos(), ghost.position)<5;

        // periodic events
        if(timeCounter >= nextEvent){
            timeCounter=0; nextEvent = 8 + Math.random()*12;
            try{
                const r = Math.random();
                if(r<0.25) window.GhostAudio?.whisper?.();
                else if(r<0.55) window.GhostAudio?.doorCreak?.();
                else if(r<0.80) window.GhostAudio?.doorSlam?.();
                else window.GhostAudio?.toss?.();
            } catch{}
            pickNextTarget();
        }
    });
}

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
