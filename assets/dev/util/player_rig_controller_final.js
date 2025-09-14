/* File: assets/dev/util/player_rig_controller_final.js
   1P/3P rig with proper avatar autoscale, feet anchoring, and auto eye-height from head bone.
   Fixes:
   - Camera aligns to avatar head (auto-detect bones; fallback to bbox)
   - Body anchored at y=0. Camera at body.y + eyeY
   - WASD/Arrows movement; ` toggles 1P/3P
*/
(function () {
  if (window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----- Config -----------------------------------------------------------
  const AVATAR = {
    file: "./assets/models/player/player.glb", // update path if different
    eyeY: 1.6,            // will be auto-updated from head bone after load
    targetHeight: 1.75,   // normalize avatar height
    meshYOffset: 0.0      // extra tweak if the feet look off
  };
  const FIRST_PERSON_HIDE_TOP_FRACTION = 0.23; // only hide head slice
  const CAM3 = { back: 2.8, up: 1.25 };
  const ROT_SMOOTH = 10.0;
  const SPEEDS = () => (PP.getSpeeds?.() || { walk: 0.9, run: 1.8 });

  // ----- State ------------------------------------------------------------
  let scene = null, camera = null;
  let body = null;           // transform moved by inputs (feet at y=0)
  let avatarRoot = null;     // glb root
  let avatarMeshes = [];     // flattened for visibility culling
  let isThird = false;       // start 1P by default
  let lastPos = null;

  // Fallback movement if modular_bindings is absent
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
    n.position = new BABYLON.Vector3(0, 0, 0);  // FEET at y=0
    PP.rig.body = n;
    scene.__playerBody = n;
    return n;
  }

  function collectMeshes(root){
    avatarMeshes.length = 0;
    root.getChildMeshes(false).forEach(m => { if (!m.isDisposed()) avatarMeshes.push(m); });
  }

  // —— Strong autoscale: normalize to target height & anchor feet —— //
  function normalizeAvatarScaleAndFeet(root){
    try {
      root.scaling.setAll(1);
      root.computeWorldMatrix(true);
      const bb0 = root.getHierarchyBoundingVectors();
      let rawH = bb0.max.y - bb0.min.y;
      if (rawH > 5) rawH = rawH / 100; // cm → m heuristic

      const sf = (rawH > 0.001) ? (AVATAR.targetHeight / rawH) : 1;
      root.scaling.setAll(sf);
      root.computeWorldMatrix(true);

      // Anchor feet to y=0
      const bb = root.getHierarchyBoundingVectors();
      const minY = bb.min.y;
      root.position = new BABYLON.Vector3(0, -minY + AVATAR.meshYOffset, 0);

      if (root.rotationQuaternion) {
        const e = root.rotationQuaternion.toEulerAngles();
        root.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, e.y));
      } else {
        root.rotation = new BABYLON.Vector3(0, 0, 0);
      }
    } catch (e) { console.warn("[rig] normalize failed:", e); }
  }

  // Auto-detect head/eyes
  function updateEyeFromAvatar(){
    try{
      // try skeleton head bone names
      const skel = avatarRoot.getChildren().find(n=>n.skeleton)?.skeleton;
      let headY = NaN;
      if (skel && skel.bones?.length){
        const re = /(head|Head|HeadTop|HeadTop_End|neck)/;
        const headBone = skel.bones.find(b => re.test(b.name));
        if (headBone){
          const m = headBone.getTransformNode()?.getWorldMatrix() || headBone.getFinalMatrix();
          const pos = m.getTranslation ? m.getTranslation() :
                      BABYLON.Vector3.FromArray(m.m ? [m.m[12],m.m[13],m.m[14]] : [0,0,0]);
          headY = pos.y;
        }
      }
      if (!isFinite(headY)){
        const bb = avatarRoot.getHierarchyBoundingVectors();
        headY = bb.max.y;
      }
      // feet y is 0 after normalize → eye a bit below the very top
      const eye = Math.max(1.2, Math.min(1.9, headY - 0.1));
      AVATAR.eyeY = eye;
    } catch(e){ /* keep default */ }
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
        m.isVisible = centerY <= cutoffWorldY; // hide head slice only
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

      root.parent = body;

      normalizeAvatarScaleAndFeet(root);
      avatarRoot = root;
      collectMeshes(root);
      updateEyeFromAvatar();

      // idle anims if present
      res.animationGroups?.forEach(g => { try { g.start(true); } catch {} });

      if (isThird) showAllAvatar(); else applyFirstPersonCulling();
    } catch (e) {
      console.warn("[rig] avatar load failed:", e);
    }
  }

  function syncCameraToBody(){
    if (!camera || !body) return;
    const feet = body.getAbsolutePosition();
    if (!isThird){
      camera.position.set(feet.x, feet.y + AVATAR.eyeY, feet.z);
      applyFirstPersonCulling();
    } else {
      const eye = new BABYLON.Vector3(feet.x, feet.y + AVATAR.eyeY, feet.z);
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

    // step sounds
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
