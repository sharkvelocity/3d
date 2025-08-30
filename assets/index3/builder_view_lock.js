// ./assets/index3/builder_view_lock.js — v1.2
// Builder tools:
//  - Aerial Lock (top-down, zoom-only; no tilt/rotate/pan)
//  - Player Control toggle (spawn/possess a simple FPS avatar at the spawn pad)
//
// UI: adds two switches in the builder toolbar (or a floating pill if no toolbar).
//
// Keys in Player Control:
//  - WASD / Arrows to move, Mouse to look
//  - Shift = sprint, Z = crouch (shorter eye height)
//  - Esc exits pointer lock (toggle Player Control off to return to Aerial Lock)

(function(){
  "use strict";
  if (window.BuilderViewLock?.__v === '1.2') return;

  const API = { __v:'1.2', setAerial, isAerialLocked, ensureUI, setPlayerControl, isPlayerControl };
  window.BuilderViewLock = API;

  const ST = {
    s: null,
    cTop: null,             // ArcRotate (aerial) camera
    pointerInput: null,
    aerialLocked: true,
    aerialSnap: null,

    // Player preview
    playerOn: false,
    playerRoot: null,
    playerCapsule: null,
    playerCam: null,
    playerYStanding: 1.7,
    playerYCrouch: 1.1,
    playerSpeed: 3.0,
    playerSprint: 5.0,
    isCrouch: false,
    pressed: Object.create(null),
    moveObs: null,
  };

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CANVAS = ()=> ST.s?.getEngine?.().getRenderingCanvas();
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));

  // ---------- AERIAL CAMERA ----------
  function ensureArcTopCamera(){
    ST.s = SCENE();
    if (!ST.s) return null;

    let cam = ST.s.activeCamera;
    if (!(cam instanceof BABYLON.ArcRotateCamera)) {
      const target = new BABYLON.Vector3(0,0,0);
      cam = new BABYLON.ArcRotateCamera("BuildCam", 0, 0.001, 25, target, ST.s);
      cam.lowerRadiusLimit = 2;
      cam.upperRadiusLimit = 400;
      cam.inertia = 0;
      cam.attachControl(CANVAS(), true);
      ST.s.activeCamera = cam;
    }
    ST.cTop = cam;
    cam.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;

    ST.pointerInput = cam.inputs.attached.pointers || cam.inputs.getInput("ArcRotateCameraPointersInput");
    if (!ST.pointerInput){
      cam.inputs.add(new BABYLON.ArcRotateCameraPointersInput());
      ST.pointerInput = cam.inputs.attached.pointers;
    }
    cam.wheelPrecision = 50;
    if (ST.pointerInput) ST.pointerInput.pinchDeltaPercentage = 0.01;
    return cam;
  }

  function snapshotCam(cam){
    return {
      alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone(),
      lowerAlphaLimit: cam.lowerAlphaLimit, upperAlphaLimit: cam.upperAlphaLimit,
      lowerBetaLimit: cam.lowerBetaLimit,   upperBetaLimit: cam.upperBetaLimit,
      panningSensibility: cam.panningSensibility,
      inertia: cam.inertia,
      keysUp: cam.keysUp?.slice?.() || [],
      keysDown: cam.keysDown?.slice?.() || [],
      keysLeft: cam.keysLeft?.slice?.() || [],
      keysRight: cam.keysRight?.slice?.() || [],
      mode: cam.mode,
      wheelPrecision: cam.wheelPrecision,
      pinchDeltaPercentage: ST.pointerInput?.pinchDeltaPercentage,
      asActive: ST.s?.activeCamera === cam
    };
  }

  function restoreCam(cam, snap){
    if (!snap) return;
    cam.alpha = snap.alpha; cam.beta = snap.beta; cam.radius = snap.radius; cam.setTarget(snap.target);
    cam.lowerAlphaLimit = snap.lowerAlphaLimit; cam.upperAlphaLimit = snap.upperAlphaLimit;
    cam.lowerBetaLimit  = snap.lowerBetaLimit;  cam.upperBetaLimit  = snap.upperBetaLimit;
    cam.panningSensibility = snap.panningSensibility;
    cam.inertia = snap.inertia;
    cam.keysUp = snap.keysUp; cam.keysDown = snap.keysDown; cam.keysLeft = snap.keysLeft; cam.keysRight = snap.keysRight;
    cam.mode = snap.mode;
    cam.wheelPrecision = snap.wheelPrecision;
    if (ST.pointerInput) ST.pointerInput.pinchDeltaPercentage = snap.pinchDeltaPercentage;
    if (snap.asActive) ST.s.activeCamera = cam;
  }

  function lockAerial(){
    const cam = ensureArcTopCamera(); if (!cam) return;
    ST.aerialSnap = snapshotCam(cam);
    cam.alpha = 0;
    cam.beta  = 0.001;
    cam.lowerAlphaLimit = 0;
    cam.upperAlphaLimit = 0;
    cam.lowerBetaLimit  = 0;
    cam.upperBetaLimit  = 0.001;
    cam.panningSensibility = 0;
    cam.keysUp = cam.keysDown = cam.keysLeft = cam.keysRight = [];
    cam.wheelPrecision = 50;
    if (ST.pointerInput){
      ST.pointerInput.pinchDeltaPercentage = 0.01;
      ST.pointerInput.angularSensibilityX = 1e12;
      ST.pointerInput.angularSensibilityY = 1e12;
    }
    cam.inertia = 0;
    ST.s.cameraToUseForPointers = cam;
  }

  function unlockAerial(){
    if (!ST.cTop || !ST.aerialSnap) return;
    restoreCam(ST.cTop, ST.aerialSnap);
    ST.aerialSnap = null;
  }

  function setAerial(on){
    ST.aerialLocked = !!on;
    if (!SCENE()) return;
    if (ST.aerialLocked) lockAerial(); else unlockAerial();
    const cb = document.getElementById('aerial-lock-cb');
    if (cb) cb.checked = ST.aerialLocked;
  }
  function isAerialLocked(){ return !!ST.aerialLocked; }

  // ---------- SPAWN + PLAYER ----------
  function findSpawn(){
    const s = SCENE();
    // Prefer explicit spawn pad
    const names = ['StartPad_Wood','StartPad','Spawn','SpawnPad','Start'];
    for (const n of names){
      const m = s.getMeshByName(n);
      if (m) {
        // place player slightly above
        const bb = m.getBoundingInfo?.().boundingBox;
        const y = bb ? bb.maximumWorld.y + 0.05 : (m.position.y + 0.05);
        return new BABYLON.Vector3(m.position.x, y, m.position.z);
      }
    }
    // Fallback: near origin, try to drop to ground
    let p = v3(0, 5, 0);
    const hit = s.pickWithRay(new BABYLON.Ray(p, v3(0,-1,0), 10), m=> m && m.isPickable!==false);
    if (hit?.hit) p = hit.pickedPoint.addInPlace(v3(0,0.05,0));
    return p;
  }

  function ensurePlayer(){
    const s = SCENE();
    if (ST.playerRoot && !ST.playerRoot.isDisposed()) return ST.playerRoot;
    // root + capsule
    const root = new BABYLON.TransformNode('BuilderPlayerRoot', s);
    const cap  = BABYLON.MeshBuilder.CreateCapsule('BuilderPlayerCapsule', {height:1.75, radius:0.28, tessellation:12}, s);
    cap.parent = root;
    const mat = new BABYLON.StandardMaterial('Mat_BuilderPlayer', s);
    mat.diffuseColor = new BABYLON.Color3(0.3,0.8,1.0);
    mat.alpha = 0.35; // translucent so it doesn't block view
    cap.material = mat;
    cap.isPickable = false;
    ST.playerRoot = root;
    ST.playerCapsule = cap;
    return root;
  }

  function ensurePlayerCam(){
    const s = SCENE();
    if (ST.playerCam && !ST.playerCam.isDisposed()) return ST.playerCam;
    const cam = new BABYLON.UniversalCamera('BuilderPlayerCam', v3(0, ST.playerYStanding, 0), s);
    cam.minZ = 0.05;
    cam.maxZ = 10000;
    cam.speed = 0.0;            // we move the root, not the camera
    cam.inertia = 0.15;
    cam.attachControl(CANVAS(), true);
    cam.inputs.clear();
    cam.inputs.addMouse();
    cam.inputs.addKeyboard();   // for look via arrows if desired
    cam.rotation = v3(0,0,0);
    cam.parent = ST.playerRoot;
    return (ST.playerCam = cam);
  }

  function onKey(e, down){
    const k = (e.code || e.key || '').toLowerCase();
    ST.pressed[k] = down;
    if (k==='keyz') ST.isCrouch = down ? !ST.isCrouch : ST.isCrouch; // toggle on keydown
  }

  function groundBelow(pos){
    const s = SCENE();
    const ray = new BABYLON.Ray(pos.add(v3(0,2,0)), v3(0,-1,0), 5);
    const hit = s.pickWithRay(ray, m=>{
      const tag = m.metadata?.builder?.type;
      return m && (tag==='floor' || tag==='wall' || m.isPickable!==false);
    });
    return hit?.hit ? hit.pickedPoint : null;
  }

  function collidesAhead(cur, dir, step){
    const s = SCENE();
    const a = cur;
    const b = cur.add(dir.scale(step + 0.2));
    const ray = new BABYLON.Ray(a, dir, step+0.25);
    const hit = s.pickWithRay(ray, m=>{
      const tag = m.metadata?.builder?.type;
      return m && (tag==='wall' || tag==='door' || tag==='stair' || m.metadata?.isGhostBlocker);
    });
    return !!(hit && hit.hit);
  }

  function moverTick(){
    if (!ST.playerOn || !ST.playerRoot || !ST.playerCam) return;
    const s = SCENE();
    const dt = Math.min(0.05, s.getEngine().getDeltaTime()/1000);
    // camera vertical offset (crouch toggle)
    ST.playerCam.position.y = ST.isCrouch ? ST.playerYCrouch : ST.playerYStanding;

    // build input vector in XZ using camera yaw
    const yaw = ST.playerCam.absoluteRotation.toEulerAngles().y;
    let fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
    let right = v3(Math.cos(yaw), 0, -Math.sin(yaw));
    let move = v3(0,0,0);
    const P = ST.pressed;
    if (P['keyw'] || P['arrowup'])    move.addInPlace(fwd);
    if (P['keys'] || P['arrowdown'])  move.subtractInPlace(fwd);
    if (P['keya'] || P['arrowleft'])  move.subtractInPlace(right);
    if (P['keyd'] || P['arrowright']) move.addInPlace(right);

    if (move.lengthSquared() > 0){
      move.normalize();
      const speed = (P['shiftleft']||P['shiftright']) ? ST.playerSprint : ST.playerSpeed;
      const step = speed * dt;
      // simple collision probe
      if (!collidesAhead(ST.playerRoot.position, move, step)){
        ST.playerRoot.position.addInPlace(move.scale(step));
      }
    }

    // keep on ground
    const g = groundBelow(ST.playerRoot.position);
    if (g) ST.playerRoot.position.y = g.y + 0.01;
  }

  function enterPlayer(){
    if (ST.playerOn) return;
    const s = SCENE();
    const spawn = findSpawn();
    ensurePlayer();
    ensurePlayerCam();
    ST.playerRoot.position.copyFrom(spawn);
    ST.playerRoot.setEnabled(true);

    // Hide capsule when pointer locked (cleaner)
    const canvas = CANVAS();
    const hideCapsule = ()=> { ST.playerCapsule.setEnabled(document.pointerLockElement !== canvas); };
    document.addEventListener('pointerlockchange', hideCapsule);

    // Make it the active camera
    ST.s.activeCamera = ST.playerCam;
    ST.s.cameraToUseForPointers = ST.playerCam;
    // Request pointer lock for mouselook
    canvas?.requestPointerLock?.();

    // Tick
    if (!ST.moveObs){
      ST.moveObs = s.onBeforeRenderObservable.add(moverTick);
      window.addEventListener('keydown', e=> onKey(e,true),  true);
      window.addEventListener('keyup',   e=> onKey(e,false), true);
    }

    ST.playerOn = true;
    // Ensure aerial unlock while in player mode
    setAerial(false);
    const pcb = document.getElementById('player-control-cb');
    if (pcb) pcb.checked = true;
  }

  function exitPlayer(){
    if (!ST.playerOn) return;
    const s = SCENE();
    // Detach camera and restore aerial
    try{ ST.playerCam.detachControl(); }catch{}
    if (ST.moveObs) { s.onBeforeRenderObservable.remove(ST.moveObs); ST.moveObs = null; }
    ST.playerOn = false;

    // Keep the player visible for spawn location reference, or hide it:
    try{ ST.playerCapsule.setEnabled(true); }catch{}

    // Restore aerial camera as active and lock
    setAerial(true);
    ST.s.activeCamera = ST.cTop;
    ST.s.cameraToUseForPointers = ST.cTop;

    const pcb = document.getElementById('player-control-cb');
    if (pcb) pcb.checked = false;
  }

  function setPlayerControl(on){
    if (on) enterPlayer(); else exitPlayer();
  }
  function isPlayerControl(){ return !!ST.playerOn; }

  // ---------- UI ----------
  function ensureUI(){
    const toolbar = document.getElementById('builder-toolbar');

    function mkSwitch(id, label, checked, onChange){
      const wrap = document.createElement('label');
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin-left:8px;";
      wrap.innerHTML = `
        <input id="${id}" type="checkbox" style="transform:scale(1.2); accent-color:#0ff;" />
        <span style="color:#9ff;">${label}</span>
      `;
      const cb = wrap.querySelector('input');
      cb.checked = !!checked;
      cb.addEventListener('change', ()=> onChange(cb.checked));
      return wrap;
    }

    if (toolbar){
      if (!document.getElementById('aerial-lock-cb')){
        toolbar.appendChild(mkSwitch('aerial-lock-cb', 'Aerial Lock', true, setAerial));
      }
      if (!document.getElementById('player-control-cb')){
        toolbar.appendChild(mkSwitch('player-control-cb', 'Player Control', false, setPlayerControl));
      }
    } else {
      // Floating pill fallback
      if (document.getElementById('builder-view-pill')) return;
      const pill = document.createElement('div');
      pill.id = 'builder-view-pill';
      pill.style.cssText = `
        position:fixed; top:10px; left:10px; z-index:8000;
        background:rgba(0,0,0,0.55); border:1px solid #066; border-radius:8px; padding:6px 8px;
        display:flex; gap:10px; align-items:center;
      `;
      pill.appendChild(mkSwitch('aerial-lock-cb', 'Aerial Lock', true, setAerial));
      pill.appendChild(mkSwitch('player-control-cb', 'Player Control', false, setPlayerControl));
      document.body.appendChild(pill);
    }
  }

  // ---------- Boot ----------
  const boot = setInterval(()=>{
    try{
      if (!SCENE()) return;
      ensureUI();
      // default aerial lock ON
      setAerial(true);
      clearInterval(boot);
    }catch{}
  }, 150);

})();