// ghost_logic.js
// Ghost movement constrained by procedural map rooms & doors
(function(){
  "use strict";
  if(window.__GhostLogicReady) return;
  window.__GhostLogicReady = true;

  const S = () => window.scene || BABYLON.Engine?.LastCreatedScene;
  const MAP = window.MAP_DEF || {rooms:[], doors:[]};

  const ghost = window.ghost = window.ghost || {};
  ghost.position = ghost.position instanceof BABYLON.Vector3 ? ghost.position : new BABYLON.Vector3(0,0,0);
  ghost.type = ghost.type || "Spirit";
  ghost.mode = ghost.mode || "idle";
  ghost.roomName = ghost.roomName || "";
  ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(0,0,0);
  ghost.nearPlayer = false;
  ghost.visible = false;

  // ---------- Helpers ----------
  const currentRoomName = () => {
    try {
      const cam = S()?.activeCamera;
      if(!cam) return "";
      // determine which room the camera is in
      for(const r of MAP.rooms){
        if(cam.position.x >= r.x && cam.position.x <= r.x+r.w &&
           cam.position.z >= r.y && cam.position.z <= r.y+r.h){
             return r.type;
           }
      }
      return "";
    } catch { return ""; }
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
  const onSaltWalk       = pos => triggerEMF(1, pos);
  const onBookThrow      = pos => { if(!hasEvidence("GhostWriting")) triggerEMF(1 + Math.floor(Math.random()*2), pos); };
  const onBookWrite      = pos => { if(hasEvidence("GhostWriting")) triggerEMF(2 + Math.floor(Math.random()*3), pos); };
  const onPlateThrow     = pos => triggerEMF(2 + Math.floor(Math.random()*2), pos);
  const onCrossBurn      = pos => triggerEMF(3 + Math.floor(Math.random()*2), pos);
  const onBreakerInteract= pos => triggerEMF(4 + Math.floor(Math.random()*2), pos);
  const onObjectInteract = (pos, baseLevel=1) => triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);

  // ---------- Ghost Movement ----------
  let t = 0, nextEvent = 10 + Math.random()*10;
  let radioCooldown = 0;
  let wanderTarget = ghost.roomCenter.clone();

  function isWalkable(pos){
    // Check if pos is inside any room
    for(const r of MAP.rooms){
      if(pos.x >= r.x && pos.x <= r.x+r.w &&
         pos.z >= r.y && pos.z <= r.y+r.h){
           // Check if front door and ghost cannot use
           if(r.type==="Foyer") return false;
           return true;
      }
    }
    return false;
  }

  function pickRandomTarget(){
    // Select random room respecting ghost type rules
    let availableRooms = MAP.rooms.filter(r=>{
      if(r.type==="Foyer") return false;
      if(ghost.type==="Goryo" && r.type !== ghost.favoriteRoom) return false;
      if(ghost.type==="Goryo" && ghost.roomName) return r.type===ghost.roomName;
      return true;
    });
    if(availableRooms.length===0) return ghost.position.clone();
    const room = availableRooms[Math.floor(Math.random()*availableRooms.length)];
    return new BABYLON.Vector3(
      room.x + Math.random()*room.w,
      ghost.position.y,
      room.y + Math.random()*room.h
    );
  }

  function attachLoop(){
    const sc = S();
    if(!sc){ setTimeout(attachLoop,120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;

    sc.onBeforeRenderObservable.add(()=>{
      const dt = (eng?.getDeltaTime?.() || 16.7)/1000;
      t += dt;
      if(radioCooldown>0) radioCooldown -= dt;

      // occasionally pick a new target
      if(Math.random() < 0.01 || wanderTarget.distanceTo(ghost.position)<0.2){
        wanderTarget = pickRandomTarget();
      }

      // Move towards target
      const dir = wanderTarget.subtract(ghost.position);
      dir.y=0;
      const len = dir.length();
      const speed = 0.6;
      if(len>0.01){
        const nextPos = ghost.position.add(dir.normalize().scale(Math.min(len,dt*speed)));
        if(isWalkable(nextPos)) ghost.position.copyFrom(nextPos);
      }

      // Player proximity
      try{
        const cam = sc.activeCamera;
        ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
      } catch{}

      // periodic events
      if(t>=nextEvent){
        t=0; nextEvent=8 + Math.random()*12;
        if(!isShadeAndPlayerInRoom()){
          try{
            const r = Math.random();
            if(r<0.25) window.GhostAudio?.whisper?.();
            else if(r<0.55) window.GhostAudio?.doorCreak?.();
            else if(r<0.80) window.GhostAudio?.doorSlam?.();
            else window.GhostAudio?.toss?.();
          } catch{}
        }
        try{
          const cam = sc.activeCamera;
          const dist = cam ? BABYLON.Vector3.Distance(cam.position,ghost.position) : 999;
          if(dist<6.0) window.EMFAudio?.extend?.(10+Math.random()*5);

          const inRoom = ghost.roomName && currentRoomName()===ghost.roomName;
          const radioChance = inRoom ? 0.45 : 0.12;
          if(radioCooldown<=0 && Math.random()<radioChance){
            window.RadioAudio?.playOnce?.();
            radioCooldown = 20 + Math.random()*20;
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
