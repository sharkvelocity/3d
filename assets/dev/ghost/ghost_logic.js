// ghost_logic.js — full integrated ghost system for PhasmaPhoney
(function(){
  "use strict";
  if(window.__GhostLogicReady) return;
  window.__GhostLogicReady = true;

  const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;

  // ---------- Ghost object ----------
  const ghost = window.ghost = window.ghost || {};
  ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
  ghost.type = ghost.type || "Spirit";
  ghost.mode = ghost.mode || "idle";
  ghost.roomName = ghost.roomName || "";
  ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(2,0,2);
  ghost.nearPlayer = false;
  ghost.visible = false;

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

  const triggerEMF = (level, pos) => {
    if(!window.EMF?.trigger) return;
    if(playerNear(pos)) window.EMF.trigger(level, pos);
  };

  const evidence = ghost.evidence || [];
  const hasEvidence = ev => evidence.includes(ev);

  // ---------- Event Handlers ----------
  const onSaltWalk       = pos => triggerEMF(1, pos);
  const onBookThrow      = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
  const onBookWrite      = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
  const onPlateThrow     = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
  const onCrossBurn      = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
  const onBreakerInteract= pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
  const onObjectInteract = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

  // ---------- Map constraints ----------
  const MAP = window.MAP_DEF || {};
  const getRoomByName = (name) => MAP.rooms?.find(r=>r.name===name) || null;

  const getRoomBounds = (room) => {
    if(!room || !room.center || !room.size) return null;
    const half = {x: room.size.x/2, z: room.size.z/2};
    return {
      minX: room.center.x - half.x,
      maxX: room.center.x + half.x,
      minZ: room.center.z - half.z,
      maxZ: room.center.z + half.z
    };
  };

  const pointInsideRoom = (point, room) => {
    const b = getRoomBounds(room);
    if(!b) return false;
    return point.x >= b.minX && point.x <= b.maxX && point.z >= b.minZ && point.z <= b.maxZ;
  };

  const nearestDoorOrOpening = (pos, room) => {
    if(!room || !room.doors) return null;
    let best = null, bestDist = Infinity;
    for(const d of room.doors){
      const dp = d.position ? new BABYLON.Vector3(d.position.x, pos.y, d.position.z) : null;
      if(!dp) continue;
      const dist = BABYLON.Vector3.Distance(pos, dp);
      if(dist < bestDist){ bestDist = dist; best = dp; }
    }
    return best;
  };

  // ---------- Wander ----------
  let wanderTarget = ghost.roomCenter.clone();
  let t = 0, nextEvent = 10 + Math.random()*10;
  let radioCooldown = 0;

  const pickRandomWanderPoint = () => {
    const room = getRoomByName(ghost.roomName) || {center: ghost.roomCenter, size:{x:4,z:4}};
    const halfX = room.size?.x/2 || 2;
    const halfZ = room.size?.z/2 || 2;
    const px = room.center.x + (Math.random()-0.5)*halfX*2;
    const pz = room.center.z + (Math.random()-0.5)*halfZ*2;
    const candidate = new BABYLON.Vector3(px, ghost.position.y, pz);

    // snap to nearest door if too close to wall
    const doorPos = nearestDoorOrOpening(candidate, room);
    if(doorPos && Math.random()<0.2) return doorPos;

    return candidate;
  };

  // ---------- Main Loop ----------
  const attachLoop = () => {
    const sc = S();
    if(!sc){ setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
      const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
      t += dt;
      if(radioCooldown>0) radioCooldown-=dt;

      // pick a new wander target occasionally
      if(Math.random()<0.01 || BABYLON.Vector3.Distance(ghost.position, wanderTarget)<0.3){
        wanderTarget = pickRandomWanderPoint();
      }

      // move ghost toward target
      const dir = wanderTarget.subtract(ghost.position);
      dir.y = 0;
      const L = dir.length();
      const speed = 0.6;
      if(L>0.01) ghost.position.addInPlace(dir.normalize().scale(Math.min(L, dt*speed)));

      // enforce room boundaries
      const room = getRoomByName(ghost.roomName);
      if(room){
        const bounds = getRoomBounds(room);
        if(bounds){
          ghost.position.x = Math.min(bounds.maxX, Math.max(bounds.minX, ghost.position.x));
          ghost.position.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, ghost.position.z));
        }
      }

      // near player
      try{
        const cam = sc.activeCamera;
        ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position)<5.0 : false;
      } catch{}

      // periodic events
      if(t>=nextEvent){
        t=0;
        nextEvent = 8 + Math.random()*12;

        try {
          const r = Math.random();
          if(r<0.25) window.GhostAudio?.whisper?.();
          else if(r<0.55) window.GhostAudio?.doorCreak?.();
          else if(r<0.80) window.GhostAudio?.doorSlam?.();
          else window.GhostAudio?.toss?.();
        } catch{}

        try {
          const cam = sc.activeCamera;
          const dist = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) : 999;
          if(dist<6.0) window.EMFAudio?.extend?.(10 + Math.random()*5);

          const inRoom = ghost.roomName && currentRoomName()===ghost.roomName;
          const radioChance = inRoom ? 0.45 : 0.12;
          if(radioCooldown<=0 && Math.random()<radioChance){
            window.RadioAudio?.playOnce?.();
            radioCooldown = 20 + Math.random()*20;
          }
        } catch{}
      }
    });
  };

  attachLoop();

  // ---------- Expose events ----------
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
