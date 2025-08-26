/* fp_tp_sync.js — keep first-person & third-person perfectly in sync
   - Single rig: rigRoot -> yaw -> head
   - Camera changes (by any legacy script) are mirrored back to the rig
   - Toggle view with "V" (hold Shift+V to cycle distance)
*/
(function(){
  if (window.__FP_TP_SYNC_READY__) return; window.__FP_TP_SYNC_READY__ = true;

  const log  = (...a)=>{ try{ console.log("[fp/tp]", ...a);}catch(_){} };
  const warn = (...a)=>{ try{ console.warn("[fp/tp]", ...a);}catch(_){} };
  const toRad = d => d * Math.PI / 180;
  const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));

  // Wait for scene/camera
  function getScene(){ return window.scene || (BABYLON.Engine && BABYLON.Engine.LastCreatedScene) || null; }
  function getCam(){ const s=getScene(); return s && s.activeCamera; }

  // Shared state
  const S = {
    rigRoot:null, yaw:null, head:null,
    mode: "fp",             // "fp" or "tp"
    tpDistIdx: 1,           // 0..N-1
    tpDists: [2.6, 3.6, 4.8, 6.0],
    pitch: 0,               // up/down in radians
    yawRad: 0,              // left/right in radians
    lastCamPos: null,
    lastCamRot: null,       // euler snapshot when detached
    running:false
  };

  function ensureRig(scene){
    if (S.rigRoot && S.yaw && S.head) return;

    const cam = scene.activeCamera;
    const start = cam?.position?.clone?.() || new BABYLON.Vector3(0,1.8,0);

    const rigRoot = new BABYLON.TransformNode("rigRoot", scene);
    rigRoot.position.copyFrom(start);

    const yaw = new BABYLON.TransformNode("rigYaw", scene);
    yaw.parent = rigRoot;

    const head = new BABYLON.TransformNode("rigHead", scene);
    head.parent = yaw;
    head.position = new BABYLON.Vector3(0, 1.6, 0);

    // If you have a character mesh, parent it under yaw here:
    // const body = scene.getMeshByName("player_capsule") || null;
    // if (body) body.parent = yaw;

    S.rigRoot = rigRoot; S.yaw = yaw; S.head = head;

    // Initialize yaw/pitch from current camera
    if (cam && cam.rotation) {
      S.pitch = cam.rotation.x || 0;
      S.yawRad = (cam.rotation.y || 0);
    }
    yaw.rotation = new BABYLON.Vector3(0, S.yawRad, 0);

    log("Rig created at", start.toString());
  }

  function attachFirstPerson(scene){
    const cam = scene.activeCamera;
    if (!cam) return;
    // Parent to head; camera local transform at (0,0,0)
    cam.parent = S.head;
    cam.position.set(0,0,0);
    cam.rotation.set(S.pitch, 0, 0); // yaw lives on S.yaw
    cam.fov = 0.9;
    S.mode = "fp";
  }

  function attachThirdPerson(scene){
    const cam = scene.activeCamera;
    if (!cam) return;
    // Detach parent, place behind head, look at head
    cam.parent = null;

    const dist = S.tpDists[S.tpDistIdx] || 3.6;
    const off = new BABYLON.Vector3(0, 0.2, dist);

    // Position camera in world behind head (relative to yaw)
    const yaw = S.yawRad;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const back = new BABYLON.Vector3(
      off.x * cos - off.z * sin,
      off.y,
      off.x * sin + off.z * cos
    );

    const headWS = S.head.getAbsolutePosition();
    const camPos = headWS.add(back.negate());
    cam.position.copyFrom(camPos);
    cam.setTarget(headWS);
    cam.fov = 0.9;
    S.mode = "tp";
  }

  function toggleView(scene, cycleOnly){
    if (S.mode === "tp" && cycleOnly){
      S.tpDistIdx = (S.tpDistIdx + 1) % S.tpDists.length;
      attachThirdPerson(scene);
      return;
    }
    if (S.mode === "fp") attachThirdPerson(scene);
    else attachFirstPerson(scene);
  }

  // If any script moves the camera, we reflect that into the rig,
  // then re-apply our camera placement from the rig, so they never diverge.
  function reconcileCameraToRig(scene){
    const cam = scene.activeCamera; if (!cam) return;
    if (!S.lastCamPos) S.lastCamPos = cam.position.clone();
    if (!S.lastCamRot) S.lastCamRot = cam.rotation ? cam.rotation.clone() : new BABYLON.Vector3();

    // Did someone move the camera world position (legacy WASD)?
    const moved = !cam.position.equals(S.lastCamPos);

    // If FP and parented, world pos isn't directly comparable; we’ll check parented delta in TP only
    if (S.mode === "tp" && moved){
      const delta = cam.position.subtract(S.lastCamPos);
      S.rigRoot.position.addInPlace(delta);
    }

    // Did someone rotate the camera?
    if (cam.rotation && (cam.rotation.x !== S.lastCamRot.x || cam.rotation.y !== S.lastCamRot.y)) {
      // Update pitch/yaw from camera euler
      S.pitch = clamp(cam.rotation.x, -toRad(89), toRad(89));
      S.yawRad = cam.rotation.y;
      S.yaw.rotation.y = S.yawRad;
    }

    S.lastCamPos.copyFrom(cam.position);
    if (cam.rotation) S.lastCamRot.copyFrom(cam.rotation);
  }

  // After we absorb deltas into the rig, place the camera *from* the rig
  function placeCameraFromRig(scene){
    const cam = scene.activeCamera; if (!cam) return;

    if (S.mode === "fp"){
      // Make sure we’re parented and aligned
      if (cam.parent !== S.head) attachFirstPerson(scene);
      S.yaw.rotation.y = S.yawRad;
      cam.rotation.set(S.pitch, 0, 0);
    } else {
      if (cam.parent) cam.parent = null;
      const dist = S.tpDists[S.tpDistIdx] || 3.6;
      const headWS = S.head.getAbsolutePosition();
      const yaw = S.yawRad;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const back = new BABYLON.Vector3(-sin * dist, 0.25, -cos * dist);
      const desired = headWS.add(back);
      cam.position.copyFrom(desired);
      cam.setTarget(headWS);
    }
  }

  function hookPointer(scene){
    // Use existing camera inputs for mouse, but redirect yaw/pitch into our rig
    const cam = scene.activeCamera; if (!cam) return;

    // Normalize camera inputs
    try{
      cam.inputs.clear();
      const mouse = new BABYLON.FreeCameraMouseInput();
      const kbd   = new BABYLON.FreeCameraKeyboardMoveInput();
      cam.inputs.add(mouse);
      cam.inputs.add(kbd);
    }catch(e){}

    // Capture mousemove to update our pitch/yaw (don’t fight existing inputs; we *absorb* them)
    scene.onPointerObservable.add((pointerInfo)=>{
      if (document.pointerLockElement !== (scene.getEngine().getInputElement() || scene.getEngine().getRenderingCanvas())) return;
      if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERMOVE) return;
      const ev = pointerInfo.event;
      const dx = ev.movementX || ev.mozMovementX || ev.webkitMovementX || 0;
      const dy = ev.movementY || ev.mozMovementY || ev.webkitMovementY || 0;

      const sensX = 0.0027, sensY = 0.0022;
      S.yawRad += dx * sensX;
      S.pitch  = clamp(S.pitch + dy * sensY, -toRad(89), toRad(89));
      S.yaw.rotation.y = S.yawRad;

      // Keep camera rotations in sync for any legacy readers
      if (cam.rotation) cam.rotation.set(S.pitch, S.yawRad, 0);
    }, BABYLON.PointerEventTypes.POINTERMOVE);
  }

  function hookKeys(scene){
    window.addEventListener("keydown", (e)=>{
      if (e.code === "KeyV"){
        toggleView(scene, e.shiftKey);
        e.preventDefault();
      }
    }, {passive:false});
  }

  function startLoop(scene){
    if (S.running) return; S.running = true;
    ensureRig(scene);
    // Start in FP; you can change default to TP here
    attachFirstPerson(scene);
    hookPointer(scene);
    hookKeys(scene);

    // If PP.cfg.spawnWS exists, place rig there (from your bootstrap)
    try{
      const p = window.PP?.cfg?.spawnWS;
      if (p) S.rigRoot.position.copyFrom(p);
    }catch(_){}

    // Keep HUD XYZ meaningful (rig position)
    const hud = document.getElementById("hud-xyz");
    scene.onBeforeRenderObservable.add(()=>{
      try{
        const cam = scene.activeCamera;
        if (!cam) return;
        // Absorb any external camera changes into the rig
        reconcileCameraToRig(scene);
        // Then place camera from rig
        placeCameraFromRig(scene);

        // HUD readout from camera world position (unchanged)
        if (hud && hud.style.display !== "none"){
          document.getElementById("hud-x").textContent = cam.position.x.toFixed(2);
          document.getElementById("hud-y").textContent = cam.position.y.toFixed(2);
          document.getElementById("hud-z").textContent = cam.position.z.toFixed(2);
        }
      }catch(e){ warn("loop err", e); }
    });
  }

  // Boot once scene exists
  function boot(){
    const s = getScene();
    if (!s || !s.activeCamera){ setTimeout(boot, 120); return; }
    startLoop(s);
    log("Sync online (mode:", S.mode, ")");
  }
  boot();
})();
