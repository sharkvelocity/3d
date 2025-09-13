/* File: assets/dev/util/player_rig_controller_final.js
   Always-visible avatar. In 1st-person, cull head only (look down, see body).
   - WASD from PP.state.controls (modular_bindings.js)
   - Backquote (`) toggles 1P/3P
*/
(function () {
  if (window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----- Config -----------------------------------------------------------
  const AVATAR = {
    file: "./assets/models/player/player.glb",  // change if needed
    eyeY: 1.6,          // camera eye height
    targetHeight: 1.75, // desired avatar height after autoscale
    meshYOffset: 0.0    // extra lift of avatar root if your feet are sinking
  };

  // In first person, hide the top fraction of the avatar height (the "head")
  const FIRST_PERSON_HIDE_TOP_FRACTION = 0.23; // ~top 23% (tweak to show more/less)

  const CAM3 = { back: 2.6, up: 1.2 }; // 3rd-person boom

  const SPEEDS = () => (PP.getSpeeds?.() || { walk: 0.9, run: 1.8 });

  // ----- State ------------------------------------------------------------
  let scene = null, camera = null;
  let body = null;           // capsule/root transform for movement
  let avatarRoot = null;     // imported GLB root (parented to body)
  let avatarMeshes = [];     // flattened mesh list for culling
  let isThird = false;       // start in 1P by default
  let lastPos = null;

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
      // Skip invisible helpers
      if (m.isDisposed()) return;
      avatarMeshes.push(m);
    });
  }

  function computeWorldHeightBounds(){
    // Returns {min,max,height} in world space for avatar
    try {
      const bb = avatarRoot.getHierarchyBoundingVectors();
      return { min: bb.min.y, max: bb.max.y, height: (bb.max.y - bb.min.y) };
    } catch {
      return { min: body.getAbsolutePosition().y-1, max: body.getAbsolutePosition().y+1, height: 2 };
    }
  }

  function applyFirstPersonCulling(){
    // Cull only the top slice (head). Everything else stays visible.
    if (!avatarRoot) return;

    const { min, height } = computeWorldHeightBounds();
    const cutoffWorldY = min + height * (1.0 - FIRST_PERSON_HIDE_TOP_FRACTION);

    for (const m of avatarMeshes){
      try{
        // world y of mesh center (approx; bbox is fine)
        const b = m.getBoundingInfo().boundingBox;
        const centerY = b.centerWorld.y;
        // If center is above cutoff, hide (part of head/upper neck). Else show.
        m.isVisible = centerY <= cutoffWorldY;
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

      // Start idle anims if any
      res.animationGroups?.forEach(g => { try { g.start(true); } catch {} });

      avatarRoot = root;
      collectMeshes(root);

      // Always visible avatar; cull head only in 1P
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
      // No look target force — pointer lock/mouse move drives rotation
      // Keep head-culling up to date as you move/animate
      applyFirstPersonCulling();
    } else {
      // 3P: boom back & up from the body, look at eye height
      const fwd = camera.getDirection(BABYLON.Vector3.Forward());
      const back = fwd.scale(-CAM3.back);
      const base = body.getAbsolutePosition().clone();
      base.y = base.y - (AVATAR.eyeY - 0.2) + AVATAR.eyeY + CAM3.up;
      camera.position.copyFrom(base.add(back));
      camera.setTarget(base);
      showAllAvatar();
    }
  }

  function moveLoop(){
    if (!ensureScene()) return void setTimeout(moveLoop, 200);

    const flags = (PP.getMovementFlags?.() || PP.state?.controls || {});
    const run = !!flags.running;
    const spd = (run ? SPEEDS().run : SPEEDS().walk);

    // Move in camera plane
    const f = camera.getDirection(BABYLON.Vector3.Forward());
    const r = camera.getDirection(BABYLON.Vector3.Right());
    f.y = 0; r.y = 0; f.normalize(); r.normalize();

    let dir = new BABYLON.Vector3(0,0,0);
    if (flags.forward) dir.addInPlace(f);
    if (flags.back)    dir.subtractInPlace(f);
    if (flags.left)    dir.subtractInPlace(r);
    if (flags.right)   dir.addInPlace(r);

    if (dir.lengthSquared() > 1e-4){
      dir.normalize();
      dir.scaleInPlace(spd * (scene.getEngine().getDeltaTime() / 1000));
      body.position.addInPlace(dir);

      // Turn avatar toward camera facing (nice in 3P; harmless in 1P)
      if (avatarRoot){
        try {
          const yaw = Math.atan2(f.x, f.z);
          if (avatarRoot.rotationQuaternion) {
            avatarRoot.rotationQuaternion.copyFrom(
              BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw)
            );
          } else {
            avatarRoot.rotation = avatarRoot.rotation || BABYLON.Vector3.Zero();
            avatarRoot.rotation.y = yaw;
          }
        } catch {}
      }
    }

    // Keep the camera synced
    syncCameraToBody();

    // Optional simple footsteps by distance
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
