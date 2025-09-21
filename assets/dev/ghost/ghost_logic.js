// ghost_logic.js — Babylon.js safe ghost wander with map constraints
(function(){
  "use strict";
  if(window.__GhostLogicReady) return;
  window.__GhostLogicReady = true;

  const S = () => window.SCENE || BABYLON.EngineStore.LastCreatedScene;
  const rng = () => Math.random();

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
  const onBookThrow      = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(rng()*2), pos); };
  const onBookWrite      = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(rng()*3), pos); };
  const onPlateThrow     = pos => triggerEMF(2 + Math.floor(rng()*2), pos);
  const onCrossBurn      = pos => triggerEMF(3 + Math.floor(rng()*2), pos);
  const onBreakerInteract= pos => triggerEMF(4 + Math.floor(rng()*2), pos);
  const onObjectInteract = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(rng()*2), pos);

  // ---------- Wander Logic ----------
  let t = 0, nextEvent = 10 + rng()*10;
  let radioCooldown = 0;
  let wanderTarget = ghost.roomCenter.clone();

  function clampPositionToRoom(pos, roomName){
    const bounds = window.MapGenerator?.roomBounds?.[roomName];
    if(!bounds) return pos;
    return new BABYLON.Vector3(
      Math.min(bounds.max.x, Math.max(bounds.min.x, pos.x)),
      pos.y,
      Math.min(bounds.max.z, Math.max(bounds.min.z, pos.z))
    );
  }

  function randomPointInRoom(roomName){
    const bounds = window.MapGenerator?.roomBounds?.[roomName];
    if(!bounds) return ghost.roomCenter.clone();
    return new BABYLON.Vector3(
      rng()*(bounds.max.x - bounds.min.x) + bounds.min.x,
      ghost.position.y,
      rng()*(bounds.max.z - bounds.min.z) + bounds.min.z
    );
  }

  function attachLoop(){
    const sc = S();
    if(!sc){ setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(() => {
      const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
      t += dt;
      if(radioCooldown > 0) radioCooldown -= dt;

      // --- wandering ---
      if(rng() < 0.01){
        wanderTarget = randomPointInRoom(ghost.roomName || "Living");
      }

      // --- move ghost ---
      const dir = wanderTarget.subtract(ghost.position);
      dir.y = 0;
      const L = dir.length();
      const speed = 0.6;
      if(L > 0.01){
        ghost.position.addInPlace(dir.normalize().scale(Math.min(L, dt*speed)));
        ghost.position = clampPositionToRoom(ghost.position, ghost.roomName);
      }

      // --- near player ---
      try{
        const cam = sc.activeCamera;
        ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
      } catch{}

      // --- periodic events ---
      if(t >= nextEvent){
        t = 0; nextEvent = 8 + rng()*12;

        try{
          const cam = sc.activeCamera;
          const dist = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) : 999;
          if(dist < 6.0) window.EMFAudio?.extend?.(10 + rng()*5);

          const inRoom = ghost.roomName && currentRoomName() === ghost.roomName;
          const radioChance = inRoom ? 0.45 : 0.12;
          if(radioCooldown <= 0 && rng() < radioChance){
            window.RadioAudio?.playOnce?.();
            radioCooldown = 20 + rng()*20;
          }
        } catch{}
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
