/* File: assets/dev/util/player_rig_controller_final.js
   Player rig controller with Havok + raycast ground detection + PS5 controller
   ------------------------------------------------------------
<<<<<<< HEAD
   - WASD movement, ` toggles 1P/3P
=======
   - WASD / PS5 movement, ` toggles 1P/3P
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
   - C toggles crouch (with crouched walk anim)
   - Raycast keeps player anchored to ground with slopes
   - Havok handles collisions & gravity
<<<<<<< HEAD
   - Slopes supported
   - PS5 controller support
=======
   - Step sounds preserved
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
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
    meshYOffset: 0.0,
    spawn: new BABYLON.Vector3(-2.12, 0, -9.96)
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
  let lastPos = null;

  // Input flags
  const input = { forward:false, back:false, left:false, right:false, run:false };

<<<<<<< HEAD
  // ----- Input Handlers ---------------------------------------------------
=======
  // ----- Keyboard input ---------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
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

<<<<<<< HEAD
=======
  // ----- Scene ------------------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
  function ensureScene(){
    scene = scene || window.SCENE || BABYLON.EngineStore?.LastCreatedScene;
    camera = scene?.activeCamera;
    return !!(scene && camera);
  }

<<<<<<< HEAD
  // ----- Physics Capsule & Avatar ----------------------------------------
=======
  // ----- Physics Capsule --------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
  function makeBody(){
    body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule", {
      height: AVATAR.targetHeight,
      radius: 0.4
    }, scene);
    body.isVisible = false;
<<<<<<< HEAD
    body.position.copyFrom(SPAWN_POS).add(new BABYLON.Vector3(0, AVATAR.targetHeight/2, 0));
=======
    body.position.copyFrom(AVATAR.spawn);
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7

    body.physicsImpostor = new BABYLON.PhysicsAggregate(
      body,
      BABYLON.PhysicsShapeType.CAPSULE,
      { mass: 70, restitution: 0.0, friction: 0.8 },
      scene
    );
    PP.rig.body = body;
    return body;
  }

<<<<<<< HEAD
=======
  // ----- Avatar -----------------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
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

<<<<<<< HEAD
=======
  // ----- Camera -----------------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
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

<<<<<<< HEAD
  // ----- Ground Stick & Slopes -------------------------------------------
  function stickToGround(moveDir) {
=======
  // ----- Raycast & slope handling -----------------------------------------
  function stickToGround(moveDir){
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
    if (!body || !scene) return moveDir;
    const origin = body.position.add(new BABYLON.Vector3(0, 1, 0));
    const ray = new BABYLON.Ray(origin, BABYLON.Axis.Y.scale(-1), 4);
    const pick = scene.pickWithRay(ray, m => m.isPickable && m.name.includes("ground"));
    if (!pick.hit) return moveDir;

<<<<<<< HEAD
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
=======
    if (pick.hit){
      const groundPoint = pick.pickedPoint;
      const groundNormal = pick.getNormal(true);
      body.position.y = groundPoint.y + AVATAR.targetHeight/2;

      if (moveDir.lengthSquared() > 0.001){
        const slopeAngle = BABYLON.Vector3.GetAngleBetweenVectors(
          BABYLON.Axis.Y, groundNormal, BABYLON.Vector3.Forward()
        ) * (180/Math.PI);

        if (slopeAngle <= MAX_SLOPE){
          const moveOnSlope = moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir, groundNormal)));
          return moveOnSlope.normalize();
        } else {
          return BABYLON.Vector3.Zero();
        }
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
      }
    }
    return moveDir;
  }

<<<<<<< HEAD
  // ----- Movement Loop ----------------------------------------------------
=======
  // ----- Movement ---------------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
  function moveLoop(){
    if (!ensureScene()) return void requestAnimationFrame(moveLoop);
    const dt = scene.getEngine().getDeltaTime() / 1000;

<<<<<<< HEAD
    const forward = camera.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right   = camera.getDirection(BABYLON.Vector3.Right()).normalize();

=======
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
    let move = new BABYLON.Vector3(0,0,0);
    if (input.forward) move.addInPlace(forward);
    if (input.back) move.subtractInPlace(forward);
    if (input.left) move.subtractInPlace(right);
    if (input.right) move.addInPlace(right);

    if (move.lengthSquared() > 0.001){
      move.normalize();
      const speed = isCrouching ? SPEEDS.crouch : (input.run ? SPEEDS.run : SPEEDS.walk);
      const slopeMove = stickToGround(move);
      if (slopeMove.lengthSquared() > 0.001){
        body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());
      }
      playAnim(isCrouching ? "crouchWalk" : "walk");

      // Step sounds
      if (!lastPos) lastPos = body.position.clone();
      const d = BABYLON.Vector3.Distance(lastPos, body.position);
      if (d > 0.6){
        lastPos.copyFrom(body.position);
        if (typeof window.playStep === "function") try { window.playStep(0.42); } catch {}
      }
    } else {
      playAnim("idle");
      stickToGround(BABYLON.Vector3.Zero());
    }

    stickToGround();
    syncCamera();
<<<<<<< HEAD
    handleGamepadInput(dt);
    requestAnimationFrame(moveLoop);
  }

  // ----- View Toggle ------------------------------------------------------
=======
    handleGamepad();
    requestAnimationFrame(moveLoop);
  }

  // ----- PS5 Controller ---------------------------------------------------
  function handleGamepad(){
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    const pad = pads[0]; if (!pad) return;

    const threshold = 0.2;
    input.forward = pad.axes[1] < -threshold;
    input.back    = pad.axes[1] > threshold;
    input.left    = pad.axes[0] < -threshold;
    input.right   = pad.axes[0] > threshold;
    input.run     = pad.buttons[0].pressed; // Cross = run
  }

  // ----- View toggle ------------------------------------------------------
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
  function bindToggle(){
    addEventListener("keydown", (e)=>{
      if (e.code==="Backquote"){ e.preventDefault(); isThird = !isThird; }
    });
  }

<<<<<<< HEAD
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

=======
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
  // ----- Start ------------------------------------------------------------
  async function start(){
    if (!ensureScene()){ setTimeout(start,100); return; }

<<<<<<< HEAD
=======
    // Enable Havok physics
>>>>>>> 351f0ca4522713af11dbc54df8b6917142f459d7
    const havok = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true, havok));

    // Ensure ground is ready (pickable & physics impostor expected)
    makeBody();
    // Snap to ground immediately
    stickToGround(BABYLON.Vector3.Zero());
    await loadAvatar();
    stickToGround(BABYLON.Vector3.Zero()); // snap to ground on spawn

    bindToggle();
    moveLoop();
  }

  window.addEventListener("pp:start", start, { once:true });
  if (window.__PP_ALREADY_STARTED__) start();

})();
