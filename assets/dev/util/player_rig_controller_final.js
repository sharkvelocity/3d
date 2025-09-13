/* File: assets/dev/util/player_rig_controller_final.js
   Always-visible avatar. In 1st-person, cull head only (look down, see body).
   Fixes: WASD movement in 3P and continuous facing toward camera direction.
   - Uses PP.getMovementFlags() when available
   - Built-in WASD/Arrow fallback so movement works even without bindings
   - Backquote (`) toggles 1P/3P
*/
(function () {
  if (window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----- Config -----------------------------------------------------------
  const AVATAR = {
    file: "./assets/models/player/player.glb",  // update path if different
    eyeY: 1.6,          // camera eye height
    targetHeight: 1.75, // desired avatar height after autoscale
    meshYOffset: 0.0    // lift avatar if feet sink
  };

  // In first person, hide the top fraction of the avatar height (the "head")
  const FIRST_PERSON_HIDE_TOP_FRACTION = 0.23; // tweak to show more/less head

  const CAM3 = { back: 2.8, up: 1.25 }; // 3rd-person boom
  const ROT_SMOOTH = 10.0;               // how fast the avatar turns toward camera (3P)

  const SPEEDS = () => (PP.getSpeeds?.() || { walk: 0.9, run: 1.8 });

  // ----- State ------------------------------------------------------------
  let scene = null, camera = null;
  let body = null;           // capsule/root transform for movement
  let avatarRoot = null;     // imported GLB root (parented to body)
  let avatarMeshes = [];     // flattened mesh list for culling
  let isThird = false;       // start in 1P by default
  let lastPos = null;

  // Built-in fallback keys (WASD/Arrows/Numpad). This is used if modular_bindings
  // is missing or returns no flags set.
  const fallback = {
    forward:false, back:false, left:false, right:false, running:false
  };
  const FALLBACK_KEYS = {
    down:  new Set(['KeyW','ArrowUp','Numpad8','KeyS','ArrowDown','Numpad5','KeyA','ArrowLeft','Numpad4','KeyD','ArrowRight','Numpad6','ShiftLeft','ShiftRight']),
    up:    new Set(['KeyW','ArrowUp','Numpad8','KeyS','ArrowDown','Numpad5','KeyA','ArrowLeft','Numpad4','KeyD','ArrowRight','Numpad6','ShiftLeft','ShiftRight'])
  };
  addEventListener('keydown', (e)=>{
    const c = e.code;
    if (!FALLBACK_KEYS.down.has(c)) return;
    if (c==='KeyW'||c==='ArrowUp'||c==='Numpad8') fallback.forward = true;
    if (c==='KeyS'||c==='ArrowDown'||c==='Numpad5') fallback.back    = true;
    if (c==='KeyA'||c==='ArrowLeft'||c==='Numpad4') fallback.left    = true;
    if (c==='KeyD'||c==='ArrowRight'||c==='Numpad6') fallback.right  = true;
    if (c==='ShiftLeft'||c==='ShiftRight') fallback.running = true;
  }, true);
  addEventListener('keyup', (e)=>{
    const c = e.code;
    if (!FALLBACK_KEYS.up.has(c)) return;
    if (c==='KeyW'||c==='ArrowUp'||c==='Numpad8') fallback.forward = false;
    if (c==='KeyS'||c==='ArrowDown'||c==='Numpad5') fallback.back    = false;
    if (c==='KeyA'||c==='ArrowLeft'||c==='Numpad4') fallback.left    = false;
    if (c==='KeyD'||c==='ArrowRight'||c==='Numpad6') fallback.right  = false;
    if (c==='ShiftLeft'||c==='ShiftRight') fallback.running = false;
  }, true);

  function S(){ return window.__SCENE || window.SCENE || BABYLON.EngineStore?.LastCreatedScene || null; }

  function ensureScene(){
    scene  = S();
    camera = scene?.activeCamera || window.camera || null;
    return !!(scene && camera);
  }

  function makeBody(){
    const n = new BABYLON.TransformNode("player_body", scene);
    n.position = new BABYLON.Vector3(0, AVATAR.eyeY - 0.2, 0);
    PP.rig.body = n;
    scene.__playerBody = n;
    return n;
  }

  function autoscaleAvatar(root){
    try{
      const bb = root.getHierarchyBoundingVectors();
      const h  = bb.max.y - bb.min.y;
      if (h > 0.01){
        const sf = AVATAR.targetHeight / h;
        if (sf > 0.05 && sf < 20) root.scaling.setAll(sf);
      }
    }catch{}
  }

  function collectMeshes(root){
    avatarMeshes.length = 0;
    root.getChildMeshes(false).forEach(m => {
      if (m.isDisposed()) return;
      avatarMeshes.push(m);
    });
  }

  function computeWorldHeightBounds(){
    try {
      const bb = avatarRoot.getHierarchyBoundingVectors();
      return { min: bb.min.y, max: bb.max.y, height: (bb.max.y - bb.min.y) };
    } catch {
      return { min: body.getAbsolutePosition().y-1, max: body.getAbsolutePosition().y+1, height: 2 };
    }
  }

  function applyFirstPersonCulling(){
    if (!avatarRoot) return;
    const { min, height } = computeWorldHeightBounds();
    const cutoffWorldY = min + height * (1.0 - FIRST_PERSON_HIDE_TOP_FRACTION);
    for (const m of avatarMeshes){
      try{
        const b = m.getBoundingInfo().boundingBox;
        const centerY = b.centerWorld.y;
        m.isVisible = centerY <= cutoffWorldY; // hide the head slice
      }catch{}
    }
  }

  function showAllAvatar(){
    for (const m of avatarMeshes){
      try { m.isVisible = true; } catch {}
    }
  }

  async function loadAvatar(){
    if (!AVATAR.file) return;
    try {
      const folder = AVATAR.file.replace(/[^/]+$/, "");
      const name   = AVATAR.file.split("/").pop();
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", folder, name, scene);
      const root = res.meshes[0];
      autoscaleAvatar(root);
      root.parent = body;
      root.position = new BABYLON.Vector3(0, AVATAR.meshYOffset, 0);
      root.rotation = BABYLON.Vector3.Zero();

      // Idle anims if present
      res.animationGroups?.forEach(g => { try { g.start(true); } catch {} });

      avatarRoot = root;
      collectMeshes(root);

      if (isThird) showAllAvatar(); else applyFirstPersonCulling();
    } catch (e) {
      console.warn("[rig] avatar load failed:", e);
    }
  }

  function syncCameraToBody(){
    if (!camera || !body) return;
    if (!isThird){
      // 1P: camera at eyes
      const base = body.getAbsolutePosition();
      camera.position.set(base.x, base.y - (AVATAR.eyeY - 0.2) + AVATAR.eyeY, base.z);
      applyFirstPersonCulling();
    } else {
      // 3P: keep boom behind camera look dir and look at body’s eye height
      const fwd = camera.getDirection(BABYLON.Vector3.Forward());
      const base = body.getAbsolutePosition().clone();
      base.y = base.y - (AVATAR.eyeY - 0.2) + AVATAR.eyeY + CAM3.up;
      const back = fwd.scale(-CAM3.back);
      camera.position.copyFrom(base.add(back));
      camera.setTarget(base);
      showAllAvatar();
    }
  }

  function yawFromForward(f){ return Math.atan2(f.x, f.z); }

  function slerpYaw(current, target, dt, speed){
    // shortest-turn interpolation
    let delta = target - current;
    while (delta >  Math.PI) delta -= 2*Math.PI;
    while (delta < -Math.PI) delta += 2*Math.PI;
    return current + delta * Math.min(1, dt * speed);
  }

  function faceCamera(dt){
    if (!avatarRoot || !camera) return;
    const f = camera.getDirection(BABYLON.Vector3.Forward()); f.y = 0; f.normalize();
    const targetYaw = yawFromForward(f);

    if (avatarRoot.rotationQuaternion){
      // Convert to yaw, lerp, then back
      const eul = avatarRoot.rotationQuaternion.toEulerAngles();
      const newYaw = isThird ? slerpYaw(eul.y, targetYaw, dt, ROT_SMOOTH) : targetYaw;
      avatarRoot.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, newYaw));
    } else {
      avatarRoot.rotation = avatarRoot.rotation || BABYLON.Vector3.Zero();
      const cur = avatarRoot.rotation.y || 0;
      avatarRoot.rotation.y = isThird ? slerpYaw(cur, targetYaw, dt, ROT_SMOOTH) : targetYaw;
    }
  }

  function effectiveFlags(){
    // Prefer modular bindings
    const f = (PP.getMovementFlags?.() || PP.state?.controls || {});
    const anyBound = (f.forward||f.back||f.left||f.right||f.running) !== undefined;
    if (anyBound) {
      return {
        forward: !!f.forward, back: !!f.back, left: !!f.left, right: !!f.right,
        running: !!(PP.state?.running || f.running)
      };
    }
    // Fallback keys
    return {...fallback};
  }

  function moveLoop(){
    if (!ensureScene()) return void setTimeout(moveLoop, 200);

    const dt = (scene.getEngine().getDeltaTime() / 1000);
    const flags = effectiveFlags();
    const run = !!flags.running;
    const spd = (run ? SPEEDS().run : SPEEDS().walk);

    // Move in camera plane using current look
    const f = camera.getDirection(BABYLON.Vector3.Forward());
    const r = camera.getDirection(BABYLON.Vector3.Right());
    f.y = 0; r.y = 0; f.normalize(); r.normalize();

    let dir = new BABYLON.Vector3(0,0,0);
    if (flags.forward) dir.addInPlace(f);
    if (flags.back)    dir.subtractInPlace(f);
    if (flags.left)    dir.subtractInPlace(r);
    if (flags.right)   dir.addInPlace(r);

    if (dir.lengthSquared() > 1e-5){
      dir.normalize();
      dir.scaleInPlace(spd * dt);
      body.position.addInPlace(dir);
    }

    // Rotate avatar to face camera’s yaw (always, smooth in 3P)
    faceCamera(dt);

    // Keep the camera synced with body position
    syncCameraToBody();

    // Simple footsteps by distance
    if (!lastPos) lastPos = body.position.clone();
    const d = BABYLON.Vector3.Distance(lastPos, body.position);
    if (d > 0.6) {
      lastPos.copyFrom(body.position);
      if (typeof window.playStep === 'function') try { window.playStep(0.42); } catch {}
    }

    requestAnimationFrame(moveLoop);
  }

  function toggleView(){
    isThird = !isThird;
    syncCameraToBody();
  }

  function bindToggle(){
    window.addEventListener("keydown", (e)=>{
      if (e.code === "Backquote") { e.preventDefault(); toggleView(); }
    }, true);
  }

  function attachPointerLock(){
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return;
    canvas.addEventListener("click", ()=>{
      try {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      } catch {}
    });
  }

  function start(){
    if (!ensureScene()) { setTimeout(start, 100); return; }
    if (!body) body = makeBody();
    bindToggle();
    attachPointerLock();
    loadAvatar();
    syncCameraToBody();
    moveLoop();
  }

  // Normal start
  window.addEventListener("pp:start", start, { once: true });
  // Late include / hot-reload
  if (window.__PP_ALREADY_STARTED__) start();
})();
