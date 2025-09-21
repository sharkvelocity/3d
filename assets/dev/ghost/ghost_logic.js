// ghost_logic.js — Babylon.js compatible ghost wander + constraints
(function(){
  "use strict";
  if(window.__GhostLogicReady) return;
  window.__GhostLogicReady = true;

  const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;
  const mapGen = window.MapGenerator;

  const ghost = window.ghost = window.ghost || {};
  ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
  ghost.type = ghost.type || "Spirit";
  ghost.mode = ghost.mode || "idle";
  ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(2,0,2);
  ghost.roomName = ghost.roomName || "";
  ghost.nearPlayer = false;
  ghost.visible = false;

  const evidence = ghost.evidence || [];
  const hasEvidence = ev => evidence.includes(ev);

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

  // ---------- Event Handlers ----------
  const onSaltWalk       = pos => triggerEMF(1, pos);
  const onBookThrow      = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
  const onBookWrite      = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
  const onPlateThrow     = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
  const onCrossBurn      = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
  const onBreakerInteract= pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
  const onObjectInteract = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

  // ---------- Map & Room Constraints ----------
  function getRoomBounds(roomName){
    if(!mapGen || !mapGen.roomBounds) return null;
    return mapGen.roomBounds[roomName] || null; // {min:Vector3, max:Vector3}
  }

  function clampToRoom(pos, roomName){
    const bounds = getRoomBounds(roomName);
    if(!bounds) return pos;
    return new BABYLON.Vector3(
      Math.min(Math.max(pos.x, bounds.min.x), bounds.max.x),
      pos.y,
      Math.min(Math.max(pos.z, bounds.min.z), bounds.max.z)
    );
  }

  function isValidWanderTarget(pos){
    // Ghost cannot pass through walls
    // Front door is not passable
    if(!mapGen) return true;
    if(mapGen.frontDoorRoom && ghost.type !== "Phantom"){
      if(pos.x >= mapGen.frontDoorRoom.min.x && pos.x <= mapGen.frontDoorRoom.max.x &&
         pos.z >= mapGen.frontDoorRoom.min.z && pos.z <= mapGen.frontDoorRoom.max.z) return false;
    }
    // Optional: check for forbidden rooms for ghost types
    if(ghost.type.toLowerCase() === "goryo"){
      if(pos.x < ghost.roomCenter.x-5 || pos.x > ghost.roomCenter.x+5 ||
         pos.z < ghost.roomCenter.z-5 || pos.z > ghost.roomCenter.z+5) return false;
    }
    return true;
  }

  function generateRandomTarget(){
    let target = ghost.roomCenter.clone();
    if(mapGen){
      const bounds = getRoomBounds(ghost.roomName);
      if(bounds){
        const x = bounds.min.x + Math.random()*(bounds.max.x - bounds.min.x);
        const z = bounds.min.z + Math.random()*(bounds.max.z - bounds.min.z);
        target = new BABYLON.Vector3(x, ghost.position.y, z);
      }
    }
    return isValidWanderTarget(target) ? target : ghost.position.clone();
  }

  // ---------- Wander Loop ----------
  let t = 0, nextEvent = 10 + Math.random()*10;
  let radioCooldown = 0;
  let wanderTarget = generateRandomTarget();

  const attachLoop = () => {
    const sc = S();
    if(!sc){ setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
      const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
      t += dt;
      if(radioCooldown > 0) radioCooldown -= dt;

      // small wandering
      if(Math.random() < 0.01){
        wanderTarget = generateRandomTarget();
      }

      // move ghost
      let dir = wanderTarget.subtract(ghost.position);
      dir.y = 0;
      const L = dir.length();
      const speed = 0.6;
      if(L > 0.01){
        ghost.position = ghost.position.add(dir.normalize().scale(Math.min(L, dt*speed)));
        ghost.position = clampToRoom(ghost.position, ghost.roomName);
      }

      // near player
      try{
        const cam = sc.activeCamera;
        ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
      } catch{}

      // periodic events
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
