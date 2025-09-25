// ---------- Player Rig added ----------
/*
  ./assets/dev/game/bootstrap.js
*/
window.PlayerRig = (function(){
  "use strict";

  const AVATAR = {
    file: "./assets/models/player/player.glb",
    eyeY: 1.62,           // camera eye height relative to body's origin (standing)
    crouchEyeY: 1.0,      // crouched camera height
    radius: 0.35,
    height: 1.75,
    mass: 70
  };

  const SPEED = { walk: 2.0, run: 4.2, crouch: 1.0 };
  const MAX_SLOPE_DEG = 45;
  const MOUSE_SENS = 0.0025;
  const GAMEPAD_DEADZONE = 0.18;

  // internal state
  let _scene = null;
  let _engine = null;
  let _camera = null;
  let _body = null;              // physics capsule/collider mesh
  let _avatarRoot = null;        // visual avatar (GLB root) parented to body
  let _animGroups = {};          // Idle/Walk/Crouch
  let _animPlaying = null;
  let _onBeforeRenderHandle = null;
  let _pointerLocked = false;
  let _yaw = 0, _pitch = 0;
  let _input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
  let _keysDown = {};
  let _mouse = { dx:0, dy:0 };
  let _gamepadPolling = false;
  let _ready = false;
  let _usePhysics = false;
  let _crouched = false;
  let _thirdPerson = false;
  let _thirdPersonDistance = 2.8;
  let _lastDt = 0;

  // helpers
  function log(...a){ try{ console.log("[PlayerRig]", ...a); }catch{} }
  function warn(...a){ try{ console.warn("[PlayerRig]", ...a); }catch{} }

  // Find a reasonable spawn point:
  function _getSpawnPosition(){
    // 1) MAP_DEF.spawn (many of your map defs use this)
    try{
      if(window.MAP_DEF && window.MAP_DEF.spawn){
        const s = window.MAP_DEF.spawn;
        return new BABYLON.Vector3(s.x||0, (s.y||AVATAR.eyeY), s.z||0);
      }
    }catch{}
    // 2) map_manager / PP.map etc. (best-effort)
    try{
      if(window.PP && window.PP.mapManager && typeof window.PP.mapManager.getCurrentMap === 'function'){
        // map_manager returns meshes — some maps include a "spawn" mesh
        const cur = window.PP.mapManager.getCurrentMap();
        if(Array.isArray(cur)){
          const spawnMesh = cur.find(m=> /spawn/i.test(m.name||""));
          if(spawnMesh && spawnMesh.position) return spawnMesh.position.clone().add(new BABYLON.Vector3(0,AVATAR.eyeY,0));
        }
      }
    }catch{}
    // 3) fallback to origin at eye height
    return new BABYLON.Vector3(0, AVATAR.eyeY, 0);
  }

  // Create physics body/capsule. Uses CapsuleImpostor if available; otherwise Cylinder fallback.
  function _createBody(scene){
    if(_body && !_body.isDisposed()) return _body;
    // Use an invisible mesh as collider
    const capsule = BABYLON.MeshBuilder.CreateCapsule("pp_player_body", {
      height: Math.max(0.1, AVATAR.height - AVATAR.radius*2),
      radius: AVATAR.radius,
      subdivisions: 6
    }, scene);
    capsule.position.copyFrom(_getSpawnPosition());
    capsule.checkCollisions = true;
    capsule.isVisible = false;
    capsule.metadata = capsule.metadata || {};
    capsule.metadata.playerCollider = true;

    // Physics impostor (try CapsuleImpostor -> Cylinder -> Box)
    try{
      if(typeof BABYLON.PhysicsImpostor.CapsuleImpostor !== "undefined"){
        capsule.physicsImpostor = new BABYLON.PhysicsImpostor(capsule, BABYLON.PhysicsImpostor.CapsuleImpostor, { mass: AVATAR.mass, friction:0.9, restitution:0 }, scene);
      } else {
        // Cylinder fallback sized to capsule
        capsule.physicsImpostor = new BABYLON.PhysicsImpostor(capsule, BABYLON.PhysicsImpostor.CylinderImpostor, { mass: AVATAR.mass, friction:0.9, restitution:0 }, scene);
      }
      _usePhysics = true;
    }catch(e){
      // No physics engine — keep kinematic
      _usePhysics = false;
    }

    _body = capsule;
    return _body;
  }

  // Load avatar visual model and animation groups (non-blocking to allow fallback)
  async function _loadAvatar(scene){
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
      // First mesh as root (common)
      _avatarRoot = res.meshes[0] || null;
      if(_avatarRoot){
        // detach from world and parent to collider
        _avatarRoot.position = BABYLON.Vector3.Zero();
        _avatarRoot.rotationQuaternion = null; // we'll rotate via Euler if needed
        _avatarRoot.parent = _body;
        // ensure avatar sits so camera at correct eyeY:
        _avatarRoot.position.y = - (AVATAR.height/2 - AVATAR.eyeY);
      }
      (res.animationGroups || []).forEach(g=>{
        if(/idle/i.test(g.name)) _animGroups.idle = g;
        else if(/walk/i.test(g.name)) _animGroups.walk = g;
        else if(/crouch/i.test(g.name)) _animGroups.crouch = g;
      });
    }catch(e){
      warn("Avatar load failed or missing player.glb:", e);
    }
  }

  // Animation helper
  function _playAnim(key){
    const target = _animGroups[key];
    if(!_animGroups) return;
    if(_animPlaying === target) return;
    // stop all
    Object.values(_animGroups).forEach(g=>{ try{ g.stop(); }catch{} });
    try{ target?.start(true); }catch{}
    _animPlaying = target || null;
  }

  // Input wiring
  function _wireKeyboard(){
    function keyDown(ev){
      if(document.activeElement && (document.activeElement.tagName==="INPUT" || document.activeElement.isContentEditable)) return;
      _keysDown[ev.code]=true;
      if(["KeyW","ArrowUp"].includes(ev.code)) _input.forward = true;
      if(["KeyS","ArrowDown"].includes(ev.code)) _input.back = true;
      if(["KeyA","ArrowLeft"].includes(ev.code)) _input.left = true;
      if(["KeyD","ArrowRight"].includes(ev.code)) _input.right = true;
      if(["ShiftLeft","ShiftRight"].includes(ev.code)) _input.run = true;
      if(["KeyC"].includes(ev.code) && !_keysDown[ev.code]) { _input.crouch = !_input.crouch; _crouched = _input.crouch; }
      if(["Backquote"].includes(ev.code)) { _thirdPerson = !_thirdPerson; }
    }
    function keyUp(ev){
      _keysDown[ev.code]=false;
      if(["KeyW","ArrowUp"].includes(ev.code)) _input.forward = false;
      if(["KeyS","ArrowDown"].includes(ev.code)) _input.back = false;
      if(["KeyA","ArrowLeft"].includes(ev.code)) _input.left = false;
      if(["KeyD","ArrowRight"].includes(ev.code)) _input.right = false;
      if(["ShiftLeft","ShiftRight"].includes(ev.code)) _input.run = false;
    }
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    // store functions for potential removal
    _wireKeyboard._keyDown = keyDown;
    _wireKeyboard._keyUp = keyUp;
  }
  function _unwireKeyboard(){
    try{ window.removeEventListener("keydown", _wireKeyboard._keyDown, true); }catch{}
    try{ window.removeEventListener("keyup", _wireKeyboard._keyUp, true); }catch{}
  }

  // Pointer/mouse look
  function _wirePointer(canvas){
    // request pointer on click
    canvas?.addEventListener("click", ()=>{ if(!document.pointerLockElement && canvas.requestPointerLock) canvas.requestPointerLock(); });

    function plChange(){ _pointerLocked = (document.pointerLockElement === canvas); }
    function mouseMove(e){
      if(!_pointerLocked) return;
      _yaw -= e.movementX * MOUSE_SENS;
      _pitch -= e.movementY * MOUSE_SENS;
      // clamp pitch
      const limit = Math.PI/2 - 0.05;
      _pitch = Math.max(-limit, Math.min(limit, _pitch));
    }
    document.addEventListener("pointerlockchange", plChange);
    document.addEventListener("mousemove", mouseMove);

    _wirePointer._plChange = plChange;
    _wirePointer._mouseMove = mouseMove;
  }
  function _unwirePointer(){
    try{ document.removeEventListener("pointerlockchange", _wirePointer._plChange); }catch{}
    try{ document.removeEventListener("mousemove", _wirePointer._mouseMove); }catch{}
  }

  // Gamepad polling (keeps running while rig active)
  function _startGamepad(){
    if(_gamepadPolling) return;
    _gamepadPolling = true;
    (function poll(){
      if(!_gamepadPolling) return;
      try{
        const pads = navigator.getGamepads?.() || [];
        const pad = pads[0];
        if(pad){
          const ax0 = pad.axes[0] || 0;
          const ax1 = pad.axes[1] || 0;
          _input.left = ax0 < -GAMEPAD_DEADZONE;
          _input.right = ax0 > GAMEPAD_DEADZONE;
          _input.forward = ax1 < -GAMEPAD_DEADZONE;
          _input.back = ax1 > GAMEPAD_DEADZONE;
          _input.run = pad.buttons[0]?.pressed || false;
          const bA = pad.buttons[1]?.pressed || false;
          if(bA && !_keysDown._gpCrouch) { _input.crouch = !_input.crouch; _crouched = _input.crouch; }
          _keysDown._gpCrouch = bA;
        }
      }catch(e){ /* ignore */ }
      requestAnimationFrame(poll);
    })();
  }
  function _stopGamepad(){ _gamepadPolling = false; }

  // Ground probe: returns { point, normal } or null
  function _raycastDown(from, len=2.5){
    try{
      const r = new BABYLON.Ray(from, BABYLON.Axis.Y.scale(-1), len);
      const pick = _scene.pickWithRay(r, m => !!m && m.isPickable !== false);
      if(pick && pick.hit && pick.pickedPoint) return { point: pick.pickedPoint.clone(), normal: pick.getNormal(true) };
      return null;
    }catch(e){ return null; }
  }

  // Movement core — called each frame
  function _updateFrame(){
    if(!_scene || !_body || !_camera) return;

    const dt = Math.min(0.1, (_engine?.getDeltaTime?.()||16.666)/1000);
    _lastDt = dt;

    // camera orientation from yaw/pitch
    // camera.rotation.x = pitch; camera.rotation.y = yaw
    _camera.rotation.x = _pitch;
    _camera.rotation.y = _yaw;

    // base vectors in world-space (camera forward/right projected to XZ)
    const mat = _camera.getWorldMatrix();
    const camForward = _camera.getDirection(BABYLON.Vector3.Forward()).clone(); camForward.y = 0; camForward.normalize();
    const camRight = _camera.getDirection(BABYLON.Vector3.Right()).clone(); camRight.y = 0; camRight.normalize();

    // movement direction
    let moveDir = new BABYLON.Vector3();
    if(_input.forward) moveDir.addInPlace(camForward);
    if(_input.back)  moveDir.subtractInPlace(camForward);
    if(_input.left)  moveDir.subtractInPlace(camRight);
    if(_input.right) moveDir.addInPlace(camRight);

    // normalize & speed
    let speed = _input.crouch ? SPEED.crouch : (_input.run ? SPEED.run : SPEED.walk);
    if(moveDir.lengthSquared() > 0.0001){
      moveDir = moveDir.normalize();
    } else {
      moveDir.set(0,0,0);
      // play idle
      _playAnim(_crouched ? "crouch" : "idle");
    }

    if(moveDir.lengthSquared() > 0.0001){
      // slope adjustments: raycast down from a point slightly ahead to sample normal
      const ahead = _body.position.add(moveDir.scale(0.5));
      const hit = _raycastDown(ahead, 2.5);
      if(hit && hit.normal){
        // remove the component along the normal to slide along surface
        const dot = BABYLON.Vector3.Dot(moveDir, hit.normal);
        if(Math.abs(dot) > 1e-4){
          moveDir = moveDir.subtract(hit.normal.scale(dot)).normalize();
        }
        // slope angle check
        const slopeAngle = Math.acos(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(hit.normal, BABYLON.Axis.Y)))) * (180/Math.PI);
        if(slopeAngle > MAX_SLOPE_DEG){
          // too steep -> cancel movement
          moveDir.set(0,0,0);
        }
      }
    }

    // final planar velocity
    const planarVel = moveDir.scale(speed);

    if(_usePhysics && _body.physicsImpostor){
      // preserve vertical velocity
      const currentVel = _body.physicsImpostor.getLinearVelocity() || new BABYLON.Vector3(0,0,0);
      const newVel = new BABYLON.Vector3(planarVel.x, currentVel.y, planarVel.z);
      // use setLinearVelocity for deterministic non-bouncy control (no jump)
      try {
        _body.physicsImpostor.setLinearVelocity(newVel);
      } catch(e){
        // fallback to apply impulse if setLinearVelocity fails
        try{ _body.physicsImpostor.applyImpulse(newVel.scale(_body.physicsImpostor.getMass?.()||AVATAR.mass), _body.getAbsolutePosition()); }catch{}
      }
    } else {
      // kinematic fallback: move by position step and simulate gravity via ray snap
      const step = planarVel.scale(dt);
      _body.position.addInPlace(step);

      // try to stick to ground if present
      const down = _raycastDown(_body.position.add(new BABYLON.Vector3(0, 0.5, 0)), 3);
      if(down && down.point){
        _body.position.y = down.point.y + (AVATAR.height/2);
      } else {
        // otherwise apply small downward offset to simulate gravity
        _body.position.y -= 9.81 * dt * 0.1;
      }
    }

    // simple animation selection
    if(moveDir.lengthSquared()>0.001) _playAnim(_crouched ? "crouch" : "walk");
    // update camera position to body
    if(!_thirdPerson){
      _camera.position.copyFrom(_body.position.add(new BABYLON.Vector3(0, AVATAR.eyeY - ( _crouched ? (AVATAR.eyeY - AVATAR.crouchEyeY) : 0 ), 0)));
    } else {
      // third person: offset behind camera by yaw
      const eye = _body.position.add(new BABYLON.Vector3(0, AVATAR.eyeY, 0));
      const behind = new BABYLON.Vector3(0,0,1);
      // compute direction from yaw
      behind.x = Math.sin(_yaw) * _thirdPersonDistance;
      behind.z = Math.cos(_yaw) * _thirdPersonDistance;
      _camera.position.copyFrom(eye.add(new BABYLON.Vector3(0, 0.6, 0)).subtract(behind));
      _camera.setTarget(eye);
    }
  }

  // Attach per-frame loop
  function _attachLoop(){
    if(!_scene || !_onBeforeRenderHandle) {
      _onBeforeRenderHandle = _scene.onBeforeRenderObservable.add(_updateFrame);
    }
  }
  function _detachLoop(){
    try{
      if(_scene && _onBeforeRenderHandle) _scene.onBeforeRenderObservable.removeCallback(_updateFrame);
    }catch(e){}
    _onBeforeRenderHandle = null;
  }

  // Public API: start & stop
  async function start(scene, engine, camera){
    if(_ready) return;
    _scene = scene;
    _engine = engine;
    _camera = camera || scene.activeCamera || new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,AVATAR.eyeY,0), scene);
    // reset orientation from existing camera if present
    _yaw = _camera.rotation?.y || 0;
    _pitch = _camera.rotation?.x || 0;

    // create body
    _createBody(scene);

    // load avatar model (non-blocking)
    await _loadAvatar(scene);

    // wire inputs
    _wireKeyboard();
    _wirePointer(_engine ? _engine.getRenderingCanvas() : document.querySelector("canvas"));
    _startGamepad();

    // attach update loop
    _attachLoop();

    _ready = true;
    log("PlayerRig started (no-jump). Physics:", _usePhysics ? "enabled" : "disabled");
    return true;
  }

  function stop(){
    // teardown input & loops but preserve meshes if you want to reuse
    _unwireKeyboard();
    _unwirePointer();
    _stopGamepad();
    _detachLoop();

    try{
      if(_avatarRoot && !_avatarRoot.isDisposed()){
        // detach from body rather than dispose so visual remains if needed
        _avatarRoot.parent = null;
      }
    }catch(e){}
    // if you want full disposal uncomment the following:
    // try{ _avatarRoot?.dispose(); }catch(e){}
    // try{ _body?.dispose(); }catch(e){}

    _ready = false;
    log("PlayerRig stopped");
  }

  async function reset(scene, engine, camera){
    stop();
    // dispose old collider if present
    try{ if(_body && !_body.isDisposed()) { _body.dispose(); } }catch{}
    _body = null; _avatarRoot = null; _animGroups = {}; _animPlaying = null;
    return start(scene, engine, camera);
  }

  // getters
  function isReady(){ return _ready; }
  function getBody(){ return _body; }
  function isThirdPerson(){ return _thirdPerson; }
  function setThirdPerson(v){ _thirdPerson = !!v; }

  // expose minimal API
  return {
    start,
    stop,
    reset,
    isReady,
    getBody,
    setThirdPerson,
    // helpers for bootstrap to await readiness
    _internal: {
      _updateFrame,
      _getSpawnPosition
    }
  };
})(); // end PlayerRig
