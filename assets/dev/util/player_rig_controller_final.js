// assets/dev/util/player_rig_controller_final.js
// One true rig: body + FPS/TPS cameras + input + spawn + model autoscale.
// Assumes pp_runtime created ENGINE/SCENE & render loop. No other script should move the player.

(function () {
  "use strict";
  if (window.__PP_RIG__) return;
  window.__PP_RIG__ = true;

  const PP = (window.PP = window.PP || {});
  PP.rig = PP.rig || {};

  // ----------------- Tunables -----------------
  const TARGET_HEIGHT = 1.75;       // human height (m) for model auto-scale
  const EYE_HEIGHT    = 1.6;        // FPS camera height from capsule base
  const CAP_RADIUS    = 0.35;       // capsule radius
  const CAP_HEIGHT    = 1.8;        // capsule visual height
  const SPEED_WALK    = 1.9;        // m/s
  const SPEED_RUN     = 3.3;        // m/s
  const MOUSE_SENS    = 0.0020;     // radians per pixel
  const TOUCH_SENS    = 0.0022;
  const TPS_MIN_R     = 2.8;
  const TPS_MAX_R     = 7.5;

  // ----------------- State -----------------
  const State = {
    scene: null,
    engine: null,

    body: null,        // collision capsule (Mesh)
    rig: null,         // TransformNode parented to body (for attachments)
    model: null,       // imported GLB root (optional)

    fps: null,         // UniversalCamera parented to rig
    tps: null,         // ArcRotateCamera locked to body

    useTPS: false,     // current camera mode
    yaw: 0,            // radians
    pitch: 0,          // radians (FPS only)

    keys: { w:0, a:0, s:0, d:0, run:false },
    lastTime: performance.now(),

    // animation (optional)
    anim: {
      skeleton: null,
      groups: { idle: null, walk: null },
      playing: "idle"
    },

    _loopAttached: false,
    _mouseBound: false,
    _touchBound: false,
    _wheelBound: false
  };

  // --------------- Helpers ----------------
  function S(){ return State.scene || window.SCENE || BABYLON.Engine?.LastCreatedScene; }
  function Eng(){ return State.engine || window.ENGINE || State.scene?.getEngine?.(); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function v3(x,y,z){ return new BABYLON.Vector3(x,y,z); }
  function qFromYaw(y){ return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, y); }
  function setYaw(node, yaw){
    if (!node) return;
    if (node.rotationQuaternion){
      node.rotationQuaternion.copyFrom(qFromYaw(yaw));
    } else {
      node.rotation = node.rotation || new BABYLON.Vector3(0,0,0);
      node.rotation.y = yaw;
    }
  }

  function groundYAt(x,z,approxY=3){
    const sc=S(); if(!sc) return null;
    const from = new BABYLON.Vector3(x, approxY + 30, z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 300);
    const hit  = sc.pickWithRay(ray, (m)=>{
      if (!m || m.isPickable === false) return false;
      const n=(m.name||'').toLowerCase();
      if (/sky|cloud|atmo|probe|env|reflection/.test(n)) return false;
      return true;
    });
    return (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : null;
  }

  function findIndex3Spawn(){
    const sc=S(); if(!sc) return null;

    // 1) Devtools / globals
    const cand = [
      window.Index3Spawn, window.PP_INDEX3_SPAWN, window.PP?.index3?.spawn,
      window.DEVTOOLS?.Index3Spawn, window.DEVTOOLS?.spawns?.index3,
      window.DEVTOOLS?.spawns?.[3], window.DEVTOOLS?.getSpawn?.('index3')
    ].find(Boolean);
    if (cand){
      if (cand.x!==undefined && cand.y!==undefined && cand.z!==undefined){
        const pos = v3(cand.x,cand.y,cand.z);
        const yaw = (typeof cand.yaw === 'number')? cand.yaw : null;
        return { pos, yaw };
      }
      if (cand.getAbsolutePosition){
        const pos = cand.getAbsolutePosition() || cand.position || null;
        const yaw = cand.rotationQuaternion ? cand.rotationQuaternion.toEulerAngles().y
                  : (cand.rotation && typeof cand.rotation.y==='number') ? cand.rotation.y : null;
        return { pos, yaw };
      }
    }

    // 2) Named anchors
    const names = [
      'Index3','index3','Index_3','index_3','Index3_Start','index3_start',
      'Spawn_Index3','spawn_index3','PlayerSpawn_Index3','player_spawn_index3',
      'Van_Spawn','van_spawn','PlayerSpawn','Spawn','Start'
    ];
    for (const n of names){
      const t = sc.getTransformNodeByName?.(n) || sc.getNodeByName?.(n);
      if (t){
        const pos = t.getAbsolutePosition?.() || t.position || null;
        const yaw = t.rotationQuaternion ? t.rotationQuaternion.toEulerAngles().y
                  : (t.rotation && typeof t.rotation.y==='number') ? t.rotation.y : null;
        return { pos, yaw };
      }
    }

    // 3) Metadata on transform nodes
    for (const m of (sc.transformNodes||[])){
      if (m?.metadata?.spawn === 'index3' || m?.metadata?.index === 3){
        const pos = m.getAbsolutePosition?.() || m.position || null;
        const yaw = m.rotationQuaternion ? m.rotationQuaternion.toEulerAngles().y
                  : (m.rotation && typeof m.rotation.y==='number') ? m.rotation.y : null;
        return { pos, yaw };
      }
    }

    return null;
  }

  // --------------- Build rig ----------------
  function ensureBody(){
    const sc=S(); if (!sc) return null;
    if (State.body && !State.body.isDisposed()) return State.body;

    const body = BABYLON.MeshBuilder.CreateCapsule(
      'player_capsule',
      { height: CAP_HEIGHT, radius: CAP_RADIUS, tessellation: 8, capSubdivisions: 4 },
      sc
    );
    body.visibility = 0;          // invisible physics shell
    body.isPickable = false;
    body.checkCollisions = true;
    body.ellipsoid = new BABYLON.Vector3(CAP_RADIUS, CAP_HEIGHT*0.5, CAP_RADIUS);
    body.ellipsoidOffset = new BABYLON.Vector3(0, CAP_HEIGHT*0.5 - CAP_RADIUS, 0);

    // Neutral rotation quaternion for consistent yaw application
    body.rotationQuaternion = body.rotationQuaternion || BABYLON.Quaternion.Identity();

    State.body = body;
    sc.__playerBody = body; // legacy handle many modules look for
    return body;
  }

  function ensureRigNode(){
    const sc=S(); if(!sc) return null;
    if (State.rig && !State.rig.isDisposed()) return State.rig;
    const rig = new BABYLON.TransformNode('PlayerRig', sc);
    rig.rotationQuaternion = BABYLON.Quaternion.Identity();
    rig.parent = ensureBody();
    State.rig = rig;
    return rig;
  }

  function ensureFPS(){
    const sc=S(); if(!sc) return null;
    if (State.fps && !State.fps.isDisposed()) return State.fps;

    const cam = new BABYLON.UniversalCamera('FPCam', new BABYLON.Vector3(0, EYE_HEIGHT, 0), sc);
    cam.rotation = new BABYLON.Vector3(0,0,0); // use rotation, not cameraRotation
    cam.minZ = 0.1;
    cam.inertia = 0; // manual movement, no glide
    cam.speed = 0;   // we move the body, not the camera
    cam.parent = ensureRigNode();

    State.fps = cam;
    return cam;
  }

  function ensureTPS(){
    const sc=S(); if(!sc) return null;
    if (State.tps && !State.tps.isDisposed()) return State.tps;

    const body = ensureBody();
    const cam = new BABYLON.ArcRotateCamera(
      'TPCam',
      -Math.PI/2, 1.2, 3.6,
      body.position.clone(),
      sc
    );
    cam.lowerBetaLimit = 0.3;
    cam.upperBetaLimit = 1.45;
    cam.lowerRadiusLimit = TPS_MIN_R;
    cam.upperRadiusLimit = TPS_MAX_R;
    cam.wheelPrecision = 60;
    cam.lockedTarget = body;

    State.tps = cam;
    return cam;
  }

  function setActiveCameraFPS(){
    const sc=S(); if(!sc) return;
    const fps = ensureFPS();
    sc.activeCamera = fps;
    try { fps.attachControl(PPCanvas(), true); } catch {}
    State.useTPS = false;
    // pointer lock is only meaningful in FPS
    requestPointerLock();
  }

  function setActiveCameraTPS(){
    const sc=S(); if(!sc) return;
    const tps = ensureTPS();
    sc.activeCamera = tps;
    try { tps.attachControl(PPCanvas(), true); } catch {}
    State.useTPS = true;
    // exiting pointer lock if any
    try { document.exitPointerLock?.(); } catch {}
  }

  function PPCanvas(){
    return document.getElementById('renderCanvas') || document.querySelector('canvas');
  }

  function requestPointerLock(){
    const cvs = PPCanvas();
    if (!cvs) return;
    if (document.pointerLockElement !== cvs){
      try { cvs.requestPointerLock?.(); } catch {}
    }
  }

  // --------------- Input ----------------
  function bindKeys(){
    const K = State.keys;
    function kd(e){
      const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
      if (k==='w'||c===87) K.w=1;
      else if (k==='a'||c===65) K.a=1;
      else if (k==='s'||c===83) K.s=1;
      else if (k==='d'||c===68) K.d=1;
      else if (k==='shift'||c===16) K.run=true;
      else if (k==='v' || code==='KeyV' || c===86){ e.stopPropagation(); toggleTPS(); }
    }
    function ku(e){
      const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
      if (k==='w'||c===87) K.w=0;
      else if (k==='a'||c===65) K.a=0;
      else if (k==='s'||c===83) K.s=0;
      else if (k==='d'||c===68) K.d=0;
      else if (k==='shift'||c===16) K.run=false;
    }
    window.addEventListener('keydown', kd, false);
    window.addEventListener('keyup',   ku, false);
    document.addEventListener('keydown', kd, true);
    document.addEventListener('keyup',   ku, true);
  }

  function bindMouse(){
    if (State._mouseBound) return;
    State._mouseBound = true;

    const cvs = PPCanvas();
    if (!cvs) return;

    // Click -> lock (FPS only)
    cvs.addEventListener('click', ()=>{ if (!State.useTPS) requestPointerLock(); });

    // Move -> adjust yaw/pitch (FPS only while locked)
    window.addEventListener('mousemove', (ev)=>{
      if (State.useTPS) return;
      if (document.pointerLockElement !== cvs) return;
      const dx = ev.movementX || 0;
      const dy = ev.movementY || 0;
      State.yaw   -= dx * MOUSE_SENS;
      State.pitch -= dy * MOUSE_SENS;
      State.pitch = clamp(State.pitch, -Math.PI*0.48, Math.PI*0.48);
    }, true);
  }

  function bindTouch(){
    if (State._touchBound) return;
    State._touchBound = true;

    let rightId=null, rx=0, ry=0;
    addEventListener('touchstart', e=>{
      for(const t of e.changedTouches){
        if (t.clientX >= innerWidth*0.5 && rightId===null){ rightId=t.identifier; rx=t.clientX; ry=t.clientY; }
      }
    }, {passive:true});
    addEventListener('touchmove', e=>{
      if (State.useTPS) return;
      for(const t of e.changedTouches){
        if (t.identifier===rightId){
          State.yaw   -= (t.clientX-rx) * TOUCH_SENS;
          State.pitch -= (t.clientY-ry) * TOUCH_SENS;
          State.pitch  = clamp(State.pitch, -Math.PI*0.48, Math.PI*0.48);
          rx=t.clientX; ry=t.clientY;
        }
      }
    }, {passive:true});
    addEventListener('touchend', e=>{
      for(const t of e.changedTouches){ if (t.identifier===rightId) rightId=null; }
    }, {passive:true});
  }

  function bindWheel(){
    if (State._wheelBound) return;
    State._wheelBound = true;

    window.addEventListener('wheel', (e)=>{
      if (!State.useTPS) return;
      const cam = State.tps;
      if (!cam) return;
      const delta = (e.deltaY || 0) * 0.01;
      cam.radius = clamp(cam.radius + delta, TPS_MIN_R, TPS_MAX_R);
    }, {passive:true});
  }

  // --------------- Movement Loop ----------------
  function forwardXZ(){
    // Compute forward from yaw only (decoupled from camera)
    return new BABYLON.Vector3(Math.sin(State.yaw), 0, Math.cos(State.yaw));
  }
  function rightXZ(){
    const f = forwardXZ();
    return new BABYLON.Vector3(f.z, 0, -f.x);
  }

  function loop(){
    const sc = S(); if (!sc || !State.body) return;

    const now = performance.now();
    const dt = clamp((now - State.lastTime) / 1000, 0, 0.2);
    State.lastTime = now;

    // Apply yaw/pitch to FPS camera + body orientation
    if (State.fps){
      // FPS camera pitch: rotate camera node around X; yaw is applied to body
      State.fps.rotation.x = State.pitch;
    }
    setYaw(State.body, State.yaw);

    // Movement vector from inputs (WASD)
    let v = new BABYLON.Vector3(0,0,0);
    if (State.keys.w) v.addInPlace(forwardXZ());
    if (State.keys.s) v.addInPlace(forwardXZ().scale(-1));
    if (State.keys.d) v.addInPlace(rightXZ());
    if (State.keys.a) v.addInPlace(rightXZ().scale(-1));

    const len = v.length();
    if (len > 0.0001){
      v.scaleInPlace(1/len);
      const spd = (State.keys.run ? SPEED_RUN : SPEED_WALK) * dt;
      const delta = v.scale(spd);
      try {
        if (State.body.moveWithCollisions) State.body.moveWithCollisions(delta);
        else State.body.position.addInPlace(delta);
      } catch {}
      setWalkAnim(true);
    } else {
      setWalkAnim(false);
    }

    // Keep FPS camera sitting at eye height on the rig (already parented)
    // TPS camera is lockedTarget to body; nothing to do.

    // Update HUD XYZ (if present)
    try {
      const hud = document.getElementById('hud-xyz');
      if (hud){
        const p = State.body.position;
        hud.textContent = `XYZ: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
      }
    } catch {}
  }

  function attachLoop(){
    const sc=S(); if (!sc || State._loopAttached) return;
    State._loopAttached = true;
    sc.onBeforeRenderObservable.add(loop);
  }

  // --------------- Model load / autoscale (optional) ---------------
  async function ensurePlayerModel(){
    if (State.model && !State.model.isDisposed()) return State.model;
    const sc=S(); if (!sc) return null;

    // Try common locations; harmless if missing.
    const CAND = [
      "assets/models/player/main_player.glb",
      "assets/models/player/player.glb"
    ];
    for (const path of CAND){
      try{
        const i = path.lastIndexOf('/');
        const rootUrl = path.substring(0, i+1), file = path.substring(i+1);
        const r = await BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, file, sc);
        const root = r.meshes && r.meshes[0];
        if (!root) continue;
        root.name = 'PlayerModel';
        root.parent = ensureBody();
        root.position = new BABYLON.Vector3(0, -1.1, 0); // roughly feet to capsule base
        root.layerMask = 0x1;
        State.model = root;

        // Autoscale to TARGET_HEIGHT
        try {
          const bb = root.getBoundingInfo()?.boundingBox;
          if (bb){
            const h = bb.maximumWorld.y - bb.minimumWorld.y;
            if (isFinite(h) && h>0.01){
              const sf = TARGET_HEIGHT / Math.min(h, 1000);
              if (sf > 0.05 && sf < 20) root.scaling.setAll(sf);
            }
          }
        } catch {}

        // Optional: hook skeleton animations named "Idle"/"Walk"
        try {
          if (r.animationGroups?.length){
            const groups = r.animationGroups;
            State.anim.groups.idle = groups.find(g=>/idle/i.test(g.name)) || null;
            State.anim.groups.walk = groups.find(g=>/walk|run/i.test(g.name)) || null;
            // play idle by default
            if (State.anim.groups.idle){ State.anim.groups.idle.start(true); State.anim.playing='idle'; }
          }
        } catch {}
        return root;
      }catch(_){}
    }
    return null;
  }

  function setWalkAnim(isMoving){
    const A = State.anim.groups;
    if (!A.idle && !A.walk) return;
    if (isMoving && State.anim.playing !== 'walk'){
      try { A.idle?.stop(); A.walk?.start(true, 1.0, A.walk.from, A.walk.to, false); } catch {}
      State.anim.playing = 'walk';
    } else if (!isMoving && State.anim.playing !== 'idle'){
      try { A.walk?.stop(); A.idle?.start(true); } catch {}
      State.anim.playing = 'idle';
    }
  }

  // --------------- Spawn ----------------
  function applySpawnOnce(){
    const sc=S(); if(!sc) return;
    const body = ensureBody();
    if (!body) return;

    const idx3 = findIndex3Spawn();

    // position
    let p = (idx3?.pos && idx3.pos.clone()) || body.position.clone();
    const gy = groundYAt(p.x, p.z, p.y);
    if (gy != null) p.y = gy + CAP_RADIUS + 0.12;
    if (body.position?.copyFrom) body.position.copyFrom(p); else body.position = p;

    // yaw
    let yaw = (idx3 && typeof idx3.yaw === 'number') ? idx3.yaw : null;
    if (yaw == null){
      // face origin or van position if configured
      const focus =
        window.PP?.CONFIG?.VAN?.POSITION ||
        sc.getTransformNodeByName?.('Van_Spawn')?.getAbsolutePosition?.() ||
        new BABYLON.Vector3(0, p.y, 0);
      const dir = focus.subtract(p); dir.y=0;
      yaw = Math.atan2(dir.x, dir.z);
    }
    State.yaw = yaw;
    setYaw(body, State.yaw);

    // align TPS initial orbit
    if (State.tps){
      State.tps.alpha = -Math.PI/2;
      State.tps.beta = 1.2;
      State.tps.radius = clamp(State.tps.radius||3.6, TPS_MIN_R, TPS_MAX_R);
      State.tps.lockedTarget = body;
    }

    // put FPS at body position
    if (State.fps && State.fps.position && body.position){
      const wp = body.position;
      State.fps.parent = ensureRigNode();
      State.fps.position.copyFrom(new BABYLON.Vector3(0, EYE_HEIGHT, 0));
    }
  }

  // --------------- Public API ----------------
  PP.rig.init = async function initRig(){
    State.scene = S();
    State.engine = Eng();

    ensureBody();
    ensureRigNode();
    ensureFPS();
    ensureTPS();

    // default to FPS to get pointer lock/mouselook immediately after Start
    setActiveCameraFPS();

    // Bind inputs and per-frame loop
    bindKeys(); bindMouse(); bindTouch(); bindWheel();
    attachLoop();

    // Spawn + model
    applySpawnOnce();
    await ensurePlayerModel();
  };

  PP.rig.toggleThirdPerson = function(){
    toggleTPS();
  };

  function toggleTPS(){
    if (State.useTPS){ setActiveCameraFPS(); }
    else { setActiveCameraTPS(); }
  }

  // --------------- Lifecycle hooks ----------------
  // Initialize after pp:start so audio is unlocked and scene exists.
  window.addEventListener('pp:start', ()=>{
    // Make sure canvas is focused to allow pointer lock + keys
    try { PPCanvas()?.focus(); } catch {}
    PP.rig.init().catch(console.warn);
  });

})();
