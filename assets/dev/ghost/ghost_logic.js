// ghost_logic.js
// Minimal, deterministic-safe ghost wander + events, integrates with EMF/DOTS/SpiritBox etc.

(function(){
  'use strict';
  if (window.__GhostLogicReady) return; window.__GhostLogicReady = true;

  const S = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  const ghost = (window.ghost = window.ghost || {});
  if (!(ghost.position instanceof BABYLON.Vector3)) ghost.position = new BABYLON.Vector3(0, 0, 0);
  ghost.type = ghost.type || 'Spirit';
  ghost.mode = ghost.mode || 'idle';
  ghost.roomCenter = ghost.roomCenter || new BABYLON.Vector3(2,0,2);
  ghost.nearPlayer = false;
  ghost.visible = false;

  function currentRoomName(){
    try{
      if (typeof window.currentRoomName==='function') return window.currentRoomName();
    }catch(_){}
    return '';
  }

  function isShadeAndPlayerInRoom(){
    try{
      const isShade = ((ghost?.type||'').toLowerCase()==='shade');
      const same = !!ghost.roomName && currentRoomName()===ghost.roomName;
      return isShade && same;
    }catch(_){ return false; }
  }

  let t=0, nextEvent=10+Math.random()*10;
  let radioCooldown = 0;
  let wanderTarget = ghost.roomCenter.clone();

  // proximity helper for EMF
  function playerNear(pos, range=6.0){
    try{
      const sc = S();
      const cam = sc?.activeCamera;
      if (!cam || !cam.position) return false;
      return BABYLON.Vector3.Distance(cam.position, pos) <= range;
    }catch(_){ return false; }
  }

  // EMF trigger
  function triggerEMF(level, pos){
    if (!window.EMF || typeof window.EMF.trigger !== 'function') return;
    if (!playerNear(pos)) return;
    window.EMF.trigger(level, pos);
  }

  // Track ghost evidence
  const evidence = ghost.evidence || [];
  function hasEvidence(ev){ return evidence.includes(ev); }

  // ---------- Event handlers ----------
  function onSaltWalk(pos){
    triggerEMF(1, pos);
  }

  function onBookThrow(pos){
    if (!hasEvidence('GhostWriting')) triggerEMF(1 + Math.floor(Math.random()*2), pos); // level 1-2
  }

  function onBookWrite(pos){
    if (hasEvidence('GhostWriting')) triggerEMF(2 + Math.floor(Math.random()*3), pos); // level 2-4
  }

  function onPlateThrow(pos){
    triggerEMF(2 + Math.floor(Math.random()*2), pos); // level 2-3
  }

  function onCrossBurn(pos){
    triggerEMF(3 + Math.floor(Math.random()*2), pos); // level 3-4
  }

  function onBreakerInteract(pos){
    triggerEMF(4 + Math.floor(Math.random()*2), pos); // level 4-5
  }

  // generic object interaction
  function onObjectInteract(pos, baseLevel=1){
    triggerEMF(baseLevel + Math.floor(Math.random()*2), pos);
  }

  // ---------- main loop ----------
  function attachLoop(){
    const sc=S(); if (!sc) { setTimeout(attachLoop, 120); return; }
    const eng = sc.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;
    sc.onBeforeRenderObservable.add(()=>{
      const dt = ((eng?.getDeltaTime?.()||16.7)/1000);

      t += dt;
      if (radioCooldown>0) radioCooldown -= dt;

      // target drift
      if (Math.random() < 0.01) {
        const dx=(Math.random()-0.5)*4, dz=(Math.random()-0.5)*4;
        wanderTarget = ghost.roomCenter.add(new BABYLON.Vector3(dx,0,dz));
      }

      // move
      const dir = wanderTarget.subtract(ghost.position); dir.y=0;
      const L = dir.length();
      const speed = 0.6;
      if (L>0.01) ghost.position = ghost.position.add(dir.normalize().scale(Math.min(L, dt*speed)));

      try{
        const cam = sc.activeCamera;
        ghost.nearPlayer = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) < 5.0 : false;
      }catch(_){}

      // Periodic ghost events
      if (t >= nextEvent){
        t = 0; nextEvent = 8 + Math.random()*12;

        if (!isShadeAndPlayerInRoom()){
          try{
            const r = Math.random();
            if (r < 0.25) window.GhostAudio?.whisper?.();
            else if (r < 0.55) window.GhostAudio?.doorCreak?.();
            else if (r < 0.80) window.GhostAudio?.doorSlam?.();
            else window.GhostAudio?.toss?.();
          }catch(_){}
        }

        try{
          const cam = sc.activeCamera;
          const d = cam ? BABYLON.Vector3.Distance(cam.position, ghost.position) : 999;
          if (d<6.0) window.EMFAudio?.extend?.(10+Math.random()*5);

          const inRoom = (currentRoomName() && ghost.roomName && currentRoomName()===ghost.roomName);
          const radioChance = inRoom ? 0.45 : 0.12;
          if (radioCooldown<=0 && Math.random()<radioChance){
            window.RadioAudio?.playOnce?.();
            radioCooldown = 20 + Math.random()*20;
          }
        }catch(_){}
      }
    });
  }
  attachLoop();

  // ---------- Expose EMF triggers ----------
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
