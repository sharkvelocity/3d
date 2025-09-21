/* ghost_logic.js — deterministic-safe ghost wander + events
   - Integrated with map boundaries, doors, walls
   - Respects ghost behavior rules (room preferences, distance limits)
*/
(function(){
"use strict";
if(window.__GhostLogicReady) return;
window.__GhostLogicReady = true;

const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;
const ghost = window.ghost = window.ghost || {};
ghost.position   = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
ghost.type       = ghost.type || "Spirit";
ghost.mode       = ghost.mode || "idle";
ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(2,0,2);
ghost.roomName   = ghost.roomName || "";
ghost.nearPlayer = false;
ghost.visible    = false;

// ---------- Helpers ----------
const currentRoomName = () => { try { return typeof window.currentRoomName === "function" ? window.currentRoomName() : ""; } catch { return ""; } };
const isShadeAndPlayerInRoom = () => { try { return (ghost.type||"").toLowerCase()==="shade" && ghost.roomName && currentRoomName()===ghost.roomName; } catch { return false; } };
const playerNear = (pos, range=6.0) => { try { const cam=S()?.activeCamera; return cam && cam.position ? BABYLON.Vector3.Distance(cam.position,pos)<=range : false; } catch { return false; } };
const triggerEMF = (level,pos) => { if(window.EMF?.trigger && playerNear(pos)) window.EMF.trigger(level,pos); };

const evidence = ghost.evidence||[];
const hasEvidence = ev => evidence.includes(ev);

// ---------- Event Handlers ----------
const onSaltWalk       = pos => triggerEMF(1,pos);
const onBookThrow      = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2),pos); };
const onBookWrite      = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3),pos); };
const onPlateThrow     = pos => triggerEMF(2 + Math.floor(Math.random()*2),pos);
const onCrossBurn      = pos => triggerEMF(3 + Math.floor(Math.random()*2),pos);
const onBreakerInteract= pos => triggerEMF(4 + Math.floor(Math.random()*2),pos);
const onObjectInteract = (pos,baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2),pos);

// ---------- Wander Loop ----------
let t=0, nextEvent=10+Math.random()*10, radioCooldown=0;
let wanderTarget = ghost.roomCenter.clone();

const clampToRoom = (target) => {
    if(!window.MAP_DEF || !MAP_DEF.rooms) return target;
    const room = MAP_DEF.rooms.find(r => r.name===ghost.roomName);
    if(!room) return target;
    const min = room.bounds.min, max=room.bounds.max;
    return new BABYLON.Vector3(
        Math.max(min.x,Math.min(max.x,target.x)),
        target.y,
        Math.max(min.z,Math.min(max.z,target.z))
    );
};

const attachLoop = () => {
    const sc = S();
    if(!sc){ setTimeout(attachLoop,120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
        const dt=(eng?.getDeltaTime?.()||16.7)/1000;
        t+=dt;
        if(radioCooldown>0) radioCooldown-=dt;

        // small wandering
        if(Math.random()<0.01){
            const dx=(Math.random()-0.5)*4, dz=(Math.random()-0.5)*4;
            wanderTarget = clampToRoom(ghost.roomCenter.add(new BABYLON.Vector3(dx,0,dz)));
        }

        // move ghost
        const dir = wanderTarget.subtract(ghost.position);
        dir.y=0;
        const L = dir.length();
        const speed = 0.6;
        if(L>0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(L,dt*speed)));

        // near player
        try{
            const cam = sc.activeCamera;
            ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position,ghost.position)<5.0 : false;
        }catch{}

        // periodic events
        if(t>=nextEvent){
            t=0; nextEvent=8+Math.random()*12;
            if(!isShadeAndPlayerInRoom()){
                try{
                    const r=Math.random();
                    if(r<0.25) window.GhostAudio?.whisper?.();
                    else if(r<0.55) window.GhostAudio?.doorCreak?.();
                    else if(r<0.80) window.GhostAudio?.doorSlam?.();
                    else window.GhostAudio?.toss?.();
                }catch{}
            }
            try{
                const cam = sc.activeCamera;
                const dist = cam ? BABYLON.Vector3.Distance(cam.position,ghost.position) : 999;
                if(dist<6.0) window.EMFAudio?.extend?.(10 + Math.random()*5);

                const inRoom = ghost.roomName && currentRoomName()===ghost.roomName;
                const radioChance = inRoom ? 0.45 : 0.12;
                if(radioCooldown<=0 && Math.random()<radioChance){
                    window.RadioAudio?.playOnce?.();
                    radioCooldown=20 + Math.random()*20;
                }
            }catch{}
        }
    });
};

attachLoop();

// ---------- Expose ----------
window.GhostEvents = { onSaltWalk,onBookThrow,onBookWrite,onPlateThrow,onCrossBurn,onBreakerInteract,onObjectInteract };
