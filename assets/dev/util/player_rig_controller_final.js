/* File: assets/dev/util/player_rig_controller_final.js
   Player rig controller with Havok + raycast ground detection + PS5 controller support
   ------------------------------------------------------------------------------
   - WASD movement, ` toggles 1P/3P
   - C toggles crouch (with crouched walk anim)
   - Raycast keeps player anchored to ground
   - Havok handles collisions & gravity
   - Slopes supported (max 45 deg)
   - PS5 DualSense controller support
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
  const CAM3 = { back: 2.8, up: 1.25 };
  const SPEEDS = { walk: 1.8, run: 3.5, crouch: 1.0 };
  const MAX_SLOPE = 45; // degrees

  // ----- State ------------------------------------------------------------
  let scene, camera;
  let body, avatarRoot, avatarMeshes = [];
  let isThird = false, isCrouching = false;
  let animations = { idle: null, walk: null, crouchWalk: null };
  let currentAnim = null;

  // Input flags
  const input = { forward:false, back:false, left:false, right:false, run:false };
  addEventListener("keydown", (e) => {
    if (e.code==="KeyW"||e.code==="ArrowUp") input.forward = true;
    if (e.code==="KeyS"||e.code==="ArrowDown") input.back = true;
    if (e.code==="KeyA"||e.code==="ArrowLeft") input.left = true;
    if (e.code==="KeyD"||e.code==="ArrowRight") input.right = true;
    if (e.code==="ShiftLeft"||e.code==="ShiftRight") input.run = true;
    if (e.code==="KeyC") isCrouching = !isCrouching; // toggle crouch
  }, true);
  addEventListener("keyup", (e) => {
    if (e.code==="KeyW"||e.code==="ArrowUp") input.forward = false;
    if (e.code==="KeyS"||e.code==="ArrowDown") input.back = false;
    if (e.code==="KeyA"||e.code==="ArrowLeft") input.left = false;
    if (e.code==="KeyD"||e.code==="ArrowRight") input.right = false;
    if (e.code==="ShiftLeft"||e.code==="ShiftRight") input.run = false;
  }, true);

  // PS5 controller state
  let gamepad = null;
  const padInput = { lx:0, ly:0, rx:0, ry:0, crouch:false, run:false, toggleView:false };

  function ensureScene(){
    scene = scene || window.SCENE || BABYLON.EngineStore?.LastCreatedScene;
    camera = scene?.activeCamera;
    return !!(scene && camera);
  }

  // Create physics capsule for player
  function makeBody(){
    body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule", {
      height: AVATAR.targetHeight,
      radius: 0.4
    }, scene);
    body.isVisible = false;
    body.position.set(0, AVATAR.targetHeight/2, 0);

    body.physicsImpostor = new BABYLON.PhysicsAggregate(
      body,
      BABYLON.PhysicsShapeType.CAPSULE,
      { mass: 70, restitution: 0.0, friction: 0.8 },
      scene
    );
    PP.rig.body = body;
    return body;
  }

  // Autoscale and attach avatar mesh
  function normalizeAvatarScale(root){
    root.scaling.setAll(1);
    const bb = root.getHierarchyBoundingVectors();
    const rawH = bb.max.y - bb.min.y;
    const scale = AVATAR.targetHeight / rawH;
    root.scaling.setAll(scale);

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

    // Save animations
    res.animationGroups.forEach(g => {
      if (/Idle/i.test(g.name)) animations.idle = g;
      if (/Walk/i.test(g.name)) animations.walk = g;
      if (/Crouch/i.test(g.name)) animations.crouchWalk = g;
    });

    playAnim("idle");
  }

  // Animation helper
  function playAnim(name){
    if (currentAnim === animations[name]) return;
    Object.values(animations).forEach(g => g?.stop());
    animations[name]?.start(true);
    currentAnim = animations[name];
  }

  // Camera sync
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

    // Right stick camera rotation
    if (gamepad && Math.abs(padInput.rx) > 0.15) {
      body.rotation.y -= padInput.rx * 0.04;
    }
  }

  // Raycast and slope handling
  function stickToGround(moveDir) {
    const origin = body.position.add(new BABYLON.Vector3(0, 1, 0));
    const ray = new BABYLON.Ray(origin, BABYLON.Axis.Y.scale(-1), 4);
    const pick = scene.pickWithRay(ray, m => m.isPickable && m.name.includes("ground"));

    if (pick.hit) {
      const groundPoint = pick.pickedPoint;
      const groundNormal = pick.getNormal(true);

      body.position.y = groundPoint.y + AVATAR.targetHeight / 2;

      if (moveDir.lengthSquared() > 0.001) {
        const slopeAngle = BABYLON.Vector3.GetAngleBetweenVectors(
          BABYLON.Axis.Y, groundNormal, BABYLON.Vector3.Forward()
        ) * (180 / Math.PI);

        if (slopeAngle <= MAX_SLOPE) {
          const moveOnSlope = moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir, groundNormal)));
          return moveOnSlope.normalize();
        } else return BABYLON.Vector3.Zero();
      }
    }
    return moveDir;
  }

  // Movement loop
  function moveLoop(){
    if (!ensureScene()) return void requestAnimationFrame(moveLoop);

    const dt = scene.getEngine().getDeltaTime() / 1000;
    const forward = camera.getDirection(BABYLON.Vector3.Forward());
    const right   = camera.getDirection(BABYLON.Vector3.Right());
    forward.y = right.y = 0; forward.normalize(); right.normalize();

    // PS5 gamepad input
    padInput.lx = padInput.ly = padInput.rx = padInput.ry = 0;
    padInput.run = padInput.crouch = padInput.toggleView = false;
    if (gamepad) {
      padInput.lx = gamepad.leftStick.x;
      padInput.ly = gamepad.leftStick.y;
      padInput.rx = gamepad.rightStick.x;
      padInput.ry = gamepad.rightStick.y;
      if (gamepad.buttonCross) isCrouching = !isCrouching;
      padInput.run = gamepad.buttonL3;
      if (gamepad.buttonOptions) isThird = !isThird;
    }

    // Build movement vector
    let move = new BABYLON.Vector3(0,0,0);
    if (input.forward) move.addInPlace(forward);
    if (input.back) move.subtractInPlace(forward);
    if (input.left) move.subtractInPlace(right);
    if (input.right) move.addInPlace(right);
    if (Math.abs(padInput.lx) > 0.15) move.addInPlace(right.scale(padInput.lx));
    if (Math.abs(padInput.ly) > 0.15) move.addInPlace(forward.scale(-padInput.ly));

    if (move.lengthSquared() > 0.001) {
      move.normalize();
      const speed = isCrouching ? SPEEDS.crouch : (input.run || padInput.run ? SPEEDS.run : SPEEDS.walk);
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
    requestAnimationFrame(moveLoop);
  }

  // Toggle 1P/3P
  function bindToggle(){
    addEventListener("keydown", (e)=>{
      if (e.code==="Backquote"){ e.preventDefault(); isThird = !isThird; }
    });
  }

  async function start(){
    if (!ensureScene()){ setTimeout(start,100); return; }

    // Havok physics
    const havok = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true, havok));

    makeBody();
    await loadAvatar();
    bindToggle();

    // PS5 gamepad manager
    const gpManager = new BABYLON.GamepadManager();
    gpManager.onGamepadConnectedObservable.add((pad) => { console.log("Gamepad connected:", pad.id); gamepad = pad; });
    gpManager.onGamepadDisconnectedObservable.add(() => { console.log("Gamepad disconnected"); gamepad = null; });

    moveLoop();
  }

  window.addEventListener("pp:start", start, { once:true });
  if (window.__PP_ALREADY_STARTED__) start();
})();
