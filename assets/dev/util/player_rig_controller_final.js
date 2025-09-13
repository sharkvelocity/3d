/* File: assets/dev/util/player_rig_controller_final.js
   Always-visible avatar. 1P hides only the head slice so you can look down.
   Fix: strong autoscale to target height + feet anchoring => no “giant body”.
   Also: 3P & 1P movement with WASD/Arrows fallback, ` toggles 1P/3P.
*/
(function () {
  if (window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----- Config -----------------------------------------------------------
  const AVATAR = {
    file: "./assets/models/player/player.glb",  // update if different
    eyeY: 1.6,            // camera eye height above feet
    targetHeight: 1.75,   // final avatar height (meters)
    meshYOffset: 0.0      // manual tweak if needed
  };
  const FIRST_PERSON_HIDE_TOP_FRACTION = 0.23; // hide this top fraction as “head”
  const CAM3 = { back: 2.8, up: 1.25 };
  const ROT_SMOOTH = 10.0;
  const SPEEDS = () => (PP.getSpeeds?.() || { walk: 0.9, run: 1.8 });

  // ----- State ------------------------------------------------------------
  let scene = null, camera = null;
  let body = null;           // transform moved by inputs
  let avatarRoot = null;     // glb root
  let avatarMeshes = [];     // flattened for culling
  let isThird = false;       // start in 1P
  let lastPos = null;

  // Fallback movement (if modular_bindings flags aren’t present)
  const fallback = { forward:false, back:false, left:false, right:false, running:false };
  addEventListener('keydown', (e)=>{
    const c = e.code;
    if (c==='KeyW'||c==='ArrowUp'||c==='Numpad8') fallback.forward = true;
    if (c==='KeyS'||c==='ArrowDown'||c==='Numpad5') fallback.back    = true;
    if (c==='KeyA'||c==='ArrowLeft'||c==='Numpad4') fallback.left    = true;
    if (c==='KeyD'||c==='ArrowRight'||c==='Numpad6') fallback.right  = true;
    if (c==='ShiftLeft'||c==='ShiftRight') fallback.running = true;
  }, true);
  addEventListener('keyup', (e)=>{
    const c = e.code;
    if (c==='KeyW'||c==='ArrowUp'||c==='Numpad8') fallback.forward = false;
    if (c==='KeyS'||c==='ArrowDown'||c==='Numpad5') fallback.back    = false;
    if (c==='KeyA'||c==='ArrowLeft'||c==='Numpad4') fallback.left    = false;
    if (c==='KeyD'||c==='ArrowRight'||c==='Numpad6') fallback.right  = false;
    if (c==='ShiftLeft'||c==='ShiftRight') fallback.running = false;
  }, true);

  function S(){ return window.SCENE || window.__SCENE || BABYLON.EngineStore?.LastCreatedScene || null; }
  function ensureScene(){ scene = S(); camera = scene?.activeCamera || window.camera || null; return !!(scene && camera); }

  function makeBody(){
    const n = new BABYLON.TransformNode("player_body", scene);
    n.position = new BABYLON.Vector3(0, AVATAR.eyeY, 0); // feet at y=0, eyes at eyeY
    PP.rig.body = n;
    scene.__playerBody = n;
    return n;
  }

  function collectMeshes(root){
    avatarMeshes.length = 0;
    root.getChildMeshes(false).forEach(m => { if (!m.isDisposed()) avatarMeshes.push(m); });
  }

  // —— Strong autoscale: normalize to AVATAR.targetHeight & anchor feet —— //
  function normalizeAvatarScaleAndFeet(root){
    try {
      // Measure unscaled bounds
      const prevScaling = root.scaling.clone();
      root.scaling.setAll(1);
      root.computeWorldMatrix(true);
      const bb0 = root.getHierarchyBoundingVectors();
      let rawH = bb0.max.y - bb0.min.y;

      // If model is in centimeters, rawH may be ~170–200; clamp by heuristic:
      // If height > 5m, assume cm and divide by 100.
      if (rawH > 5) rawH = rawH / 100;

      const sf = (rawH > 0.001) ? (AVATAR.targetHeight / rawH) : 1;
      root.scaling.setAll(sf);
      root.computeWorldMatrix(true);

      // Re-measure to anchor feet at y = 0 relative to the body
      const bb = root.getHierarchyBoundingVectors();
      const minY = bb.min.y;
      // Move the avatar up so feet are at y=0, then add optional tweak
      root.position = new BABYLON.Vector3(0, -minY + AVATAR.meshYOffset, 0);

      // Keep rotation clean
      if (root.rotationQuaternion) {
        const e = root.rotationQuaternion.toEulerAngles();
        root.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, e.y));
      } else {
        root.rotation = new BABYLON.Vector3(0, 0, 0);
      }
    } catch (e) {
      console.warn("[rig] normalize failed:", e);
    }
  }

  function computeWorldHeightBounds(){
    try {
      const bb = avatarRoot.getHierarchyBoundingVectors();
      return { min: bb.min.y, max: bb.max.y, height: (bb.max.y - bb.min.y) };
    } catch {
      const by = body.getAbsolutePosition().y;
      return { min: by-1, max: by+1, height: 2 };
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
        m.isVisible = centerY <= cutoffWorldY; // hide head slice, keep torso/legs
      }catch{}
    }
  }
  function showAllAvatar(){ for (const m of avatarMeshes){ try { m.isVisible = true; } catch {} } }

  async function loadAvatar(){
    if (!AVATAR.file) return;
    try {
      const folder = AVATAR.file.replace(/[^/]+$/, "");
      const name   = AVATAR.file.split("/").pop();
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", folder, name, scene);
      const root = res.meshes[0];

      // Parent under body first (so world matrices chain correctly)
      root.parent = body;

      // Strong normalize: scale to target height and anchor feet
      normalizeAvatarScaleAndFeet(root);

      // Idle animations if present
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
      // 1P: camera sits at eyes above feet
      const base = body.getAbsolutePosition();
      camera.position.set(base.x, base.y + AVATAR.eyeY, base.z);
      applyFirstPersonCulling();
    } else {
      // 3P: position camera behind & above, looking at eye point
      const base = body.getAbsolutePosition().clone();
      const eye = new BABYLON.Vector3(base.x, base.y + AVATAR.eyeY, base.z);
      const fwd = camera.getDirection(BABYLON.Vector3.Forward());
      const back = fwd.scale(-CAM3.back);
      camera.position.copyFrom(eye.add(new BABYLON.Vector3(0, CAM3.up, 0)).add(back));
      camera.setTarget(eye);
      showAllAvatar();
    }
  }

  const yawFromForward = (f)=> Math.atan2(f.x, f.z);
  function slerpYaw(current, target, dt, speed){
    let d = target - current;
    while (d >  Math.PI) d -= 2*Math.PI;
    while (d < -Math.PI) d += 2*Math.PI;
    return current + d * Math.min(1, dt * speed);
  }
  function faceCamera(dt){
    if (!avatarRoot || !camera) return;
    const f = camera.getDirection(BABYLON.Vector3.Forward());
    f.y = 0; f.normalize();
    const targetYaw = yawFromForward(f);

    if (avatarRoot.rotationQuaternion){
      const eul = avatarRoot.rotationQuaternion.toEulerAngles();
      const newYaw = isThird ? slerpYaw(eul.y, targetYaw, dt, ROT_SMOOTH) : targetYaw;
      avatarRoot.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, newYaw));
    } else {
      const cur = avatarRoot.rotation?.y || 0;
      avatarRoot.rotation = avatarRoot.rotation || BABYLON.Vector3.Zero();
      avatarRoot.rotation.y = isThird ? slerpYaw(cur, targetYaw, dt, ROT_SMOOTH) : targetYaw;
    }
  }

  function movementFlags(){
    const mf = (PP.getMovementFlags?.() || PP.state?.controls || {});
    const wired = (['forward','back','left','right'].some(k => k in mf));
    return wired ? { forward:!!mf.forward, back:!!mf.back, left:!!mf.left, right:!!mf.right, running: !!(PP.state?.running || mf.running) }
                 : {...fallback};
  }

  function moveLoop(){
    if (!ensureScene()) return void setTimeout(moveLoop, 200);

    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    const flags = movementFlags();
    const run = !!flags.running;
    const spd = (run ? SPEEDS().run : SPEEDS().walk);

    const f = camera.getDirection(BABYLON.Vector3.Forward());
    const r = camera.getDirection(BABYLON.Vector3.Right());
    f.y = 0; r.y = 0; f.normalize(); r.normalize();

    let dir = new BABYLON.Vector3(0,0,0);
    if (flags.forward) dir.addInPlace(f);
    if (flags.back)    dir.subtractInPlace(f);
    if (flags.left)    dir.subtractInPlace(r);
    if (flags.right)   dir.addInPlace(r);

    if (dir.lengthSquared() > 1e-5){
      dir.normalize().scaleInPlace(spd * dt);
      body.position.addInPlace(dir);
    }

    faceCamera(dt);
    syncCameraToBody();

    if (!lastPos) lastPos = body.position.clone();
    const d = BABYLON.Vector3.Distance(lastPos, body.position);
    if (d > 0.6) {
      lastPos.copyFrom(body.position);
      if (typeof window.playStep === 'function') try { window.playStep(0.42); } catch {}
    }

    requestAnimationFrame(moveLoop);
  }

  function toggleView(){ isThird = !isThird; syncCameraToBody(); }
  function bindToggle(){
    window.addEventListener("keydown", (e)=>{
      if (e.code === "Backquote") { e.preventDefault(); toggleView(); }
    }, true);
  }
  function attachPointerLock(){
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return;
    canvas.addEventListener("click", ()=>{
      try { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); } catch {}
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

  window.addEventListener("pp:start", start, { once: true });
  if (window.__PP_ALREADY_STARTED__) start();
})();
