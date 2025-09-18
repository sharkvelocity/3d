/* File: assets/dev/util/player_rig_controller_final.js
   Player rig controller with Havok + raycast ground detection + PS5 controller
   ------------------------------------------------------------
   - WASD movement, ` toggles 1P/3P
   - C toggles crouch (with crouched walk anim)
   - Raycast keeps player anchored to ground
   - Havok handles collisions & gravity
   - Slopes supported
   - PS5 controller support
*/

(function () {
  if (window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----- Config -----------------------------------------------------------
  const AVATAR = {
    file: "./assets/models/player/player.glb",
    eyeY: 1.6,
    targetHeight: 1.75,
    meshYOffset: 0.0
  };
  const SPAWN_POS = new BABYLON.Vector3(-2.12, 0, -9.96);
  const CAM3 = { back: 2.8, up: 1.25 };
  const SPEEDS = { walk: 1.8, run: 3.5, crouch: 1.0 };
  const MAX_SLOPE = 45;

  // ----- State ------------------------------------------------------------
  let scene, camera;
  let body, avatarRoot, avatarMeshes = [];
  let isThird = false, isCrouching = false;
  let animations = { idle: null, walk: null, crouchWalk: null };
  let currentAnim = null;

  // Input flags
  const input = { forward:false, back:false, left:false, right:false, run:false };

  // ----- Input Handlers ---------------------------------------------------
  addEventListener("keydown", (e) => {
    if (e.code==="KeyW"||e.code==="ArrowUp") input.forward = true;
    if (e.code==="KeyS"||e.code==="ArrowDown") input.back = true;
    if (e.code==="KeyA"||e.code==="ArrowLeft") input.left = true;
    if (e.code==="KeyD"||e.code==="ArrowRight") input.right = true;
    if (e.code==="ShiftLeft"||e.code==="ShiftRight") input.run = true;
    if (e.code==="KeyC") isCrouching = !isCrouching;
  }, true);

  addEventListener("keyup", (e) => {
    if (e.code==="KeyW"||e.code==="ArrowUp") input.forward = false;
    if (e.code==="KeyS"||e.code==="ArrowDown") input.back = false;
    if (e.code==="KeyA"||e.code==="ArrowLeft") input.left = false;
    if (e.code==="KeyD"||e.code==="ArrowRight") input.right = false;
    if (e.code==="ShiftLeft"||e.code==="ShiftRight") input.run = false;
  }, true);

  function ensureScene(){
    scene = scene || window.SCENE || BABYLON.EngineStore?.LastCreatedScene;
    camera = scene?.activeCamera;
    return !!(scene && camera);
  }

  // ----- Physics Capsule & Avatar ----------------------------------------
  function makeBody(){
    body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule", {
      height: AVATAR.targetHeight,
      radius: 0.4
    }, scene);
    body.isVisible = false;
    body.position.copyFrom(SPAWN_POS).add(new BABYLON.Vector3(0, AVATAR.targetHeight/2, 0));

    body.physicsImpostor = new BABYLON.PhysicsAggregate(
      body,
      BABYLON.PhysicsShapeType.CAPSULE,
      { mass: 70, restitution: 0.0, friction: 0.8 },
      scene
    );
    PP.rig.body = body;
    return body;
  }

  function normalizeAvatarScale(root){
    root.scaling.setAll(1);
    const bb = root.getHierarchyBoundingVectors();
    const rawH = bb.max.y - bb.min.y;
    const scale = AVATAR.targetHeight / rawH;
    root.scaling.setAll(scale);

    // feet at y=0
    const bb2 = root.getHierarchyBoundingVectors();
    root.position.y -= bb2.min.y;

    avatarRoot = root;
    avatarMeshes = root.getChildMeshes();
    avatarRoot.parent = body;
  }

  async function loadAvatar(){
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
    const root = res.meshes[0];
    normalizeAvatarScale(root);

    res.animationGroups.forEach(g => {
      if (/Idle/i.test(g.name)) animations.idle = g;
      if (/Walk/i.test(g.name)) animations.walk = g;
      if (/Crouch/i.test(g.name)) animations.crouchWalk = g;
    });

    playAnim("idle");
  }

  function playAnim(name){
    if (currentAnim === animations[name]) return;
    Object.values(animations).forEach(g => g?.stop());
    animations[name]?.start(true);
    currentAnim = animations[name];
  }

  function syncCamera(){
    if (!camera || !body) return;
    const pos = body.position;
    if (!isThird){
      camera.position.set(pos.x, pos.y + AVATAR.eyeY, pos.z);
    } else {
      const eye = new BABYLON.Vector3(pos.x, pos.y + AVATAR.eyeY, pos.z);
      const back = camera.getDirection(BABYLON.Vector3.Forward()).scale(-CAM3.back);
      camera.position.copyFrom(eye.add(new BABYLON.Vector3(0, CAM3.up, 0)).add(back));
      camera.setTarget(eye);
    }
  }

  // ----- Ground Stick & Slopes -------------------------------------------
  function stickToGround(moveDir) {
    if (!body || !scene) return moveDir;
    const origin = body.position.add(new BABYLON.Vector3(0, 1, 0));
    const ray = new BABYLON.Ray(origin, BABYLON.Axis.Y.scale(-1), 4);
    const pick = scene.pickWithRay(ray, m => m.isPickable && m.name.includes("ground"));
    if (!pick.hit) return moveDir;

    const groundPoint = pick.pickedPoint;
    const groundNormal = pick.getNormal(true);
    body.position.y = groundPoint.y + AVATAR.targetHeight / 2;

    if (moveDir.lengthSquared() > 0.001) {
      const slopeAngle = Math.acos(BABYLON.Vector3.Dot(BABYLON.Axis.Y, groundNormal)) * (180/Math.PI);
      if (slopeAngle <= MAX_SLOPE) {
        const moveOnSlope = moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir, groundNormal)));
        return moveOnSlope.normalize();
      } else {
        return BABYLON.Vector3.Zero();
      }
    }
    return moveDir;
  }

  // ----- Movement Loop ----------------------------------------------------
  function moveLoop(){
    if (!ensureScene()) return void requestAnimationFrame(moveLoop);
    const dt = scene.getEngine().getDeltaTime() / 1000;

    const forward = camera.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right   = camera.getDirection(BABYLON.Vector3.Right()).normalize();

    let move = new BABYLON.Vector3(0,0,0);
    if (input.forward) move.addInPlace(forward);
    if (input.back) move.subtractInPlace(forward);
    if (input.left) move.subtractInPlace(right);
    if (input.right) move.addInPlace(right);

    if (move.lengthSquared() > 0.001) {
      move.normalize();
      const speed = isCrouching ? SPEEDS.crouch : (input.run ? SPEEDS.run : SPEEDS.walk);
      const slopeMove = stickToGround(move);
      if (slopeMove.lengthSquared() > 0.001) {
        body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());
      }
      playAnim(isCrouching ? "crouchWalk" : "walk");
    } else {
      playAnim("idle");
      stickToGround(BABYLON.Vector3.Zero());
    }

    stickToGround();
    syncCamera();
    handleGamepadInput(dt);
    requestAnimationFrame(moveLoop);
  }

  // ----- View Toggle ------------------------------------------------------
  function bindToggle(){
    addEventListener("keydown", (e)=>{
      if (e.code==="Backquote"){ e.preventDefault(); isThird = !isThird; }
    });
  }

  // ----- Gamepad Support --------------------------------------------------
  function handleGamepadInput(dt){
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const lx = gp.axes[0]; // left stick X
    const ly = gp.axes[1]; // left stick Y
    const run = gp.buttons[0]?.pressed; // X button as example run
    const crouch = gp.buttons[1]?.pressed; // Circle button as example crouch

    input.left  = lx < -0.2;
    input.right = lx > 0.2;
    input.forward = ly < -0.2;
    input.back = ly > 0.2;
    input.run = run;
    if (crouch) isCrouching = !isCrouching;
  }

  // ----- Start ------------------------------------------------------------
  async function start(){
    if (!ensureScene()){ setTimeout(start,100); return; }

    const havok = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true, havok));

    makeBody();
    // Snap to ground immediately
    stickToGround(BABYLON.Vector3.Zero());
    await loadAvatar();
    bindToggle();
    moveLoop();
  }

  window.addEventListener("pp:start", start, { once:true });
  if (window.__PP_ALREADY_STARTED__) start();
})();
