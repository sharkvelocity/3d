// ./assets/index3/builder_view_lock.js — v1.3
// Builder helpers:
//  • Aerial Lock: strict top-down view (no tilt/rotate/pan), zoom only (wheel / pinch)
//  • Player Control: first-person preview from a Spawn Pad
//  • Spawn Pad: auto-create if missing, draggable in aerial view, persisted in export
//
// Export integration:
//  - If Builder.exportToJSON() exists, we wrap it to include { spawn: {pos,yaw,name} }.
//  - If not, we expose window.BuilderSpawn.serialize() and set window.__SPAWN_EXPORT_PATCH
//    right before clicks on common "save/export" buttons so your exporter can merge it.
//
// UI: two toggles (Aerial Lock, Player Control) + a “Spawn Tool” button to enable drag.
//
// Keys in Player Control: WASD/Arrows to move, Shift sprint, Z crouch toggle, mouse to look.

(function(){
  "use strict";
  if (window.BuilderViewLock?.__v === '1.3') return;

  const API = {
    __v:'1.3',
    setAerial, isAerialLocked,
    setPlayerControl, isPlayerControl,
    ensureUI,
    // spawn API
    ensureSpawnPad, serializeSpawn
  };
  window.BuilderViewLock = API;

  const ST = {
    s:null,
    // Aerial
    cTop:null, pointerInput:null, aerialLocked:true, aerialSnap:null,
    // Player
    playerOn:false, playerRoot:null, playerCapsule:null, playerCam:null,
    playerYStanding:1.7, playerYCrouch:1.1, isCrouch:false,
    playerSpeed:3.0, playerSprint:5.0, pressed:Object.create(null), moveObs:null,
    // Spawn
    spawn:null,              // mesh
    spawnDrag:false,
    spawnDragPlaneY:0,
    spawnYaw:0,              // degrees
  };

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CANVAS = ()=> ST.s?.getEngine?.().getRenderingCanvas();
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const deg = r=> r*180/Math.PI;
  const rad = d=> d*Math.PI/180;

  // ---------------- AERIAL CAMERA ----------------
  function ensureArcTopCamera(){
    ST.s = SCENE();
    if (!ST.s) return null;

    let cam = ST.s.activeCamera;
    if (!(cam instanceof BABYLON.ArcRotateCamera)) {
      const t = new BABYLON.Vector3(0,0,0);
      cam = new BABYLON.ArcRotateCamera("BuildCam", 0, 0.001, 25, t, ST.s);
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
      alpha:cam.alpha, beta:cam.beta, radius:cam.radius, target:cam.target.clone(),
      lowerAlphaLimit:cam.lowerAlphaLimit, upperAlphaLimit:cam.upperAlphaLimit,
      lowerBetaLimit:cam.lowerBetaLimit,   upperBetaLimit:cam.upperBetaLimit,
      panningSensibility:cam.panningSensibility,
      inertia:cam.inertia,
      keysUp:cam.keysUp?.slice?.()||[], keysDown:cam.keysDown?.slice?.()||[],
      keysLeft:cam.keysLeft?.slice?.()||[], keysRight:cam.keysRight?.slice?.()||[],
      mode:cam.mode, wheelPrecision:cam.wheelPrecision,
      pinchDeltaPercentage: ST.pointerInput?.pinchDeltaPercentage,
      asActive: ST.s?.activeCamera===cam
    };
  }
  function restoreCam(cam, snap){
    if (!snap) return;
    cam.alpha=snap.alpha; cam.beta=snap.beta; cam.radius=snap.radius; cam.setTarget(snap.target);
    cam.lowerAlphaLimit=snap.lowerAlphaLimit; cam.upperAlphaLimit=snap.upperAlphaLimit;
    cam.lowerBetaLimit=snap.lowerBetaLimit;   cam.upperBetaLimit=snap.upperBetaLimit;
    cam.panningSensibility=snap.panningSensibility; cam.inertia=snap.inertia;
    cam.keysUp=snap.keysUp; cam.keysDown=snap.keysDown; cam.keysLeft=snap.keysLeft; cam.keysRight=snap.keysRight;
    cam.mode=snap.mode; cam.wheelPrecision=snap.wheelPrecision;
    if (ST.pointerInput) ST.pointerInput.pinchDeltaPercentage=snap.pinchDeltaPercentage;
    if (snap.asActive) ST.s.activeCamera=cam;
  }

  function lockAerial(){
    const cam = ensureArcTopCamera(); if (!cam) return;
    ST.aerialSnap = snapshotCam(cam);
    cam.alpha=0; cam.beta=0.001;
    cam.lowerAlphaLimit=0; cam.upperAlphaLimit=0;
    cam.lowerBetaLimit=0;  cam.upperBetaLimit=0.001;
    cam.panningSensibility = 0;
    cam.keysUp=cam.keysDown=cam.keysLeft=cam.keysRight=[];
    cam.wheelPrecision=50;
    if (ST.pointerInput){
      ST.pointerInput.pinchDeltaPercentage=0.01;
      ST.pointerInput.angularSensibilityX=1e12;
      ST.pointerInput.angularSensibilityY=1e12;
    }
    cam.inertia=0;
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
    const cb = document.getElementById('aerial-lock-cb'); if (cb) cb.checked = ST.aerialLocked;
  }
  function isAerialLocked(){ return !!ST.aerialLocked; }

  // ---------------- SPAWN PAD ----------------
  function ensureSpawnPad(){
    const s = SCENE(); if (!s) return null;
    // prefer existing names
    const names = ['StartPad_Wood','StartPad','Spawn','SpawnPad','Start'];
    for (const n of names){ const m = s.getMeshByName(n); if (m){ ST.spawn=m; decorateSpawn(m); return m; } }

    // create new
    const size = 1.2;
    const pad = BABYLON.MeshBuilder.CreateGround('StartPad_Wood',{width:size, height:size, subdivisions:2}, s);
    pad.position.set(0, 0.01, 0);
    pad.checkCollisions = true; pad.isPickable = true;
    const mat = new BABYLON.StandardMaterial('Mat_SpawnPad', s);
    mat.diffuseColor = new BABYLON.Color3(0.55, 0.42, 0.22);
    mat.specularColor= new BABYLON.Color3(0.05, 0.05, 0.05);
    pad.material = mat;

    decorateSpawn(pad);
    ST.spawn = pad;
    return pad;
  }

  function decorateSpawn(mesh){
    mesh.metadata = mesh.metadata || {};
    mesh.metadata.builder = Object.assign({}, mesh.metadata.builder, { type:'spawn' });

    // arrow / facing
    if (!mesh._spawnArrow){
      const s = SCENE();
      const arrow = BABYLON.MeshBuilder.CreateCylinder('SpawnArrow', {diameterTop:0, diameterBottom:0.25, height:0.35, tessellation:12}, s);
      arrow.parent = mesh; arrow.position.y = 0.18; arrow.rotation.x = Math.PI/2;
      const m = new BABYLON.StandardMaterial('Mat_SpawnArrow', s);
      m.diffuseColor = new BABYLON.Color3(0.2, 0.9, 0.2);
      arrow.material = m;
      mesh._spawnArrow = arrow;
    }

    // label
    if (!mesh._spawnLabel){
      const s = SCENE();
      const plane = BABYLON.MeshBuilder.CreatePlane('SpawnLabel',{size:0.7}, s);
      plane.parent = mesh; plane.position.y = 0.55; plane.rotation.y = Math.PI;
      const mat = new BABYLON.StandardMaterial('Mat_SpawnLabel', s);
      mat.diffuseColor = new BABYLON.Color3(0.9, 0.95, 1);
      mat.emissiveColor= new BABYLON.Color3(0.4,0.8,1);
      mat.alpha = 0.85;
      plane.material = mat;
      mesh._spawnLabel = plane;

      // quick dynamic texture saying "SPAWN"
      const dt = new BABYLON.DynamicTexture('DT_Spawn', {width:256,height:128}, s, false);
      const ctx = dt.getContext();
      ctx.fillStyle = '#09222a'; ctx.fillRect(0,0,256,128);
      ctx.fillStyle = '#9ff'; ctx.font = 'bold 48px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('SPAWN', 128, 64);
      dt.update();
      mat.diffuseTexture = dt;
      mat.emissiveTexture = dt;
    }

    // ensure rotation/yaw storage
    ST.spawnYaw = ST.spawnYaw || 0;
  }

  function startSpawnDrag(){
    if (!ST.spawn) return;
    ST.spawnDrag = true;
    // lock to current Y plane
    const bb = ST.spawn.getBoundingInfo().boundingBox;
    ST.spawnDragPlaneY = bb.minimumWorld.y + 0.01;
  }
  function stopSpawnDrag(){ ST.spawnDrag = false; }

  function pointerToGround(p){
    const s = SCENE(); if (!s) return null;
    // Create a ground plane at spawnDragPlaneY and intersect the screen ray
    const ray = s.createPickingRay(p.x, p.y, BABYLON.Matrix.Identity(), ST.cTop || s.activeCamera, false);
    const plane = new BABYLON.Plane(0,1,0,-ST.spawnDragPlaneY); // y = spawnY
    const dist = ray.intersectsPlane(plane);
    if (dist===null) return null;
    return ray.origin.add(ray.direction.scale(dist));
  }

  function attachSpawnDragHandlers(){
    if (!ST.s || ST._dragHandlersAttached) return;
    ST._dragHandlersAttached = true;
    const s = ST.s;

    s.onPointerObservable.add((pi)=>{
      const type = pi.type;
      if (type === BABYLON.PointerEventTypes.POINTERDOWN){
        const pick = pi.pickInfo;
        if (pick?.hit && pick.pickedMesh && (pick.pickedMesh===ST.spawn || pick.pickedMesh.parent===ST.spawn)){
          startSpawnDrag();
        }
      }
      if (type === BABYLON.PointerEventTypes.POINTERUP){
        stopSpawnDrag();
      }
      if (type === BABYLON.PointerEventTypes.POINTERMOVE){
        if (ST.spawnDrag && ST.spawn && isAerialLocked()){
          const p = pi.event; // MouseEvent / PointerEvent
          const canvas = CANVAS();
          const rect = canvas.getBoundingClientRect();
          const pt = { x: (p.clientX-rect.left), y:(p.clientY-rect.top) };
          const hit = pointerToGround(pt);
          if (hit){
            // optional grid snap if your Builder has grid size
            const snap = (window.Builder?.gridSize) || 0;
            if (snap>0){
              hit.x = Math.round(hit.x/snap)*snap;
              hit.z = Math.round(hit.z/snap)*snap;
            }
            ST.spawn.position.x = hit.x;
            ST.spawn.position.z = hit.z;
          }
        }
      }
      if (type === BABYLON.PointerEventTypes.POINTERWHEEL){
        // Use Alt+wheel or Ctrl+wheel to rotate the spawn yaw
        const ev = pi.event;
        if (ev && (ev.altKey || ev.ctrlKey) && ST.spawn){
          ev.preventDefault();
          const delta = Math.sign(ev.deltaY) * (ev.shiftKey? 10 : 2);
          ST.spawnYaw = (ST.spawnYaw + delta + 360) % 360;
          ST.spawn.rotation.y = rad(ST.spawnYaw);
        }
      }
    });
  }

  // ---------------- PLAYER PREVIEW ----------------
  function findSpawnPosition(){
    ensureSpawnPad();
    if (ST.spawn) {
      const bb = ST.spawn.getBoundingInfo?.().boundingBox;
      const y = bb ? bb.maximumWorld.y + 0.05 : (ST.spawn.position.y + 0.05);
      return new BABYLON.Vector3(ST.spawn.position.x, y, ST.spawn.position.z);
    }
    // fallback near origin (ray down)
    let p = v3(0,5,0);
    const hit = SCENE().pickWithRay(new BABYLON.Ray(p, v3(0,-1,0), 10), m=> m && m.isPickable!==false);
    if (hit?.hit) p = hit.pickedPoint.addInPlace(v3(0,0.05,0));
    return p;
  }

  function ensurePlayer(){
    const s = SCENE();
    if (ST.playerRoot && !ST.playerRoot.isDisposed()) return ST.playerRoot;
    const root = new BABYLON.TransformNode('BuilderPlayerRoot', s);
    const cap  = BABYLON.MeshBuilder.CreateCapsule('BuilderPlayerCapsule', {height:1.75, radius:0.28, tessellation:12}, s);
    cap.parent = root;
    const mat = new BABYLON.StandardMaterial('Mat_BuilderPlayer', s);
    mat.diffuseColor = new BABYLON.Color3(0.3,0.8,1.0);
    mat.alpha = 0.35;
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
    cam.minZ = 0.05; cam.maxZ=10000; cam.speed=0; cam.inertia=0.15;
    cam.attachControl(CANVAS(), true);
    cam.inputs.clear(); cam.inputs.addMouse(); cam.inputs.addKeyboard();
    cam.rotation = v3(0, rad(ST.spawnYaw), 0);
    cam.parent = ST.playerRoot;
    return (ST.playerCam = cam);
  }

  function onKey(e, down){
    const k = (e.code || e.key || '').toLowerCase();
    // crouch toggle on keydown
    if (down && k==='keyz') ST.isCrouch = !ST.isCrouch;
    ST.pressed[k] = down;
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
    const ray = new BABYLON.Ray(cur, dir, step+0.25);
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

    ST.playerCam.position.y = ST.isCrouch ? ST.playerYCrouch : ST.playerYStanding;

    const yaw = ST.playerCam.absoluteRotation.toEulerAngles().y;
    const fwd = v3(Math.sin(yaw),0,Math.cos(yaw));
    const right=v3(Math.cos(yaw),0,-Math.sin(yaw));
    let move = v3(0,0,0);
    const P = ST.pressed;
    if (P['keyw']||P['arrowup'])    move.addInPlace(fwd);
    if (P['keys']||P['arrowdown'])  move.subtractInPlace(fwd);
    if (P['keya']||P['arrowleft'])  move.subtractInPlace(right);
    if (P['keyd']||P['arrowright']) move.addInPlace(right);
    if (move.lengthSquared()>0){
      move.normalize();
      const speed = (P['shiftleft']||P['shiftright']) ? ST.playerSprint : ST.playerSpeed;
      const step = speed*dt;
      if (!collidesAhead(ST.playerRoot.position, move, step)){
        ST.playerRoot.position.addInPlace(move.scale(step));
      }
    }
    const g = groundBelow(ST.playerRoot.position);
    if (g) ST.playerRoot.position.y = g.y + 0.01;
  }

  function enterPlayer(){
    if (ST.playerOn) return;
    const s = SCENE();
    ensureSpawnPad();
    const pos = findSpawnPosition();
    ensurePlayer(); ensurePlayerCam();
    ST.playerRoot.position.copyFrom(pos);
    ST.playerRoot.rotation.y = rad(ST.spawnYaw);
    ST.playerRoot.setEnabled(true);

    // active camera
    ST.s.activeCamera = ST.playerCam;
    ST.s.cameraToUseForPointers = ST.playerCam;

    const canvas = CANVAS();
    canvas?.requestPointerLock?.();

    if (!ST.moveObs){
      ST.moveObs = s.onBeforeRenderObservable.add(moverTick);
      window.addEventListener('keydown', e=> onKey(e,true),  true);
      window.addEventListener('keyup',   e=> onKey(e,false), true);
    }
    ST.playerOn = true;
    setAerial(false);
    const pcb = document.getElementById('player-control-cb'); if (pcb) pcb.checked = true;
  }

  function exitPlayer(){
    if (!ST.playerOn) return;
    const s = SCENE();
    try{ ST.playerCam.detachControl(); }catch{}
    if (ST.moveObs){ s.onBeforeRenderObservable.remove(ST.moveObs); ST.moveObs=null; }
    ST.playerOn=false;
    setAerial(true);
    ST.s.activeCamera = ST.cTop;
    ST.s.cameraToUseForPointers = ST.cTop;
    const pcb = document.getElementById('player-control-cb'); if (pcb) pcb.checked = false;
  }

  function setPlayerControl(on){ if (on) enterPlayer(); else exitPlayer(); }
  function isPlayerControl(){ return !!ST.playerOn; }

  // ---------------- SAVE / EXPORT ----------------
  function serializeSpawn(){
    ensureSpawnPad();
    if (!ST.spawn) return null;
    return {
      name: ST.spawn.name || 'StartPad_Wood',
      pos: { x:+ST.spawn.position.x.toFixed(4), y:+ST.spawn.position.y.toFixed(4), z:+ST.spawn.position.z.toFixed(4) },
      yaw: +(+ST.spawnYaw).toFixed(2)
    };
  }
  function injectSpawnInto(obj){
    try{
      if (!obj || typeof obj!=='object') return obj;
      obj.spawn = serializeSpawn();
      return obj;
    }catch{ return obj; }
  }

  function wrapExportIfPresent(){
    if (!window.Builder) return;
    // Prefer wrapping a canonical exporter if provided
    const B = window.Builder;
    if (typeof B.exportToJSON === 'function' && !B.exportToJSON.__wrappedWithSpawn){
      const orig = B.exportToJSON.bind(B);
      B.exportToJSON = function(...args){
        const out = orig(...args);
        try{ injectSpawnInto(out); }catch{}
        return out;
      };
      B.exportToJSON.__wrappedWithSpawn = true;
    }
  }

  function tagSaveButtons(){
    const ids = ['proj-download','proj-export','btn-export','proj-save'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (!el || el.__spawnHooked) return;
      el.addEventListener('click', ()=> {
        // place patch globally so any exporter can merge it
        window.__SPAWN_EXPORT_PATCH = serializeSpawn();
      }, true);
      el.__spawnHooked = true;
    });
  }

  // ---------------- UI ----------------
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
    function mkBtn(id, label, title, onClick){
      const b = document.createElement('button'); b.id=id; b.textContent=label; b.title=title;
      b.className = 'btn';
      b.style.marginLeft='8px';
      b.addEventListener('click', onClick);
      return b;
    }

    if (toolbar){
      if (!document.getElementById('aerial-lock-cb'))
        toolbar.appendChild(mkSwitch('aerial-lock-cb','Aerial Lock', true, setAerial));
      if (!document.getElementById('player-control-cb'))
        toolbar.appendChild(mkSwitch('player-control-cb','Player Control', false, setPlayerControl));
      if (!document.getElementById('spawn-tool-btn'))
        toolbar.appendChild(mkBtn('spawn-tool-btn','Spawn Tool','Drag to move spawn (Alt/Ctrl + Wheel to rotate)', ()=>{
          ensureSpawnPad();
          // flash/select
          if (ST.spawn){
            const mat = ST.spawn.material;
            try{
              const orig = mat.emissiveColor?.clone?.();
              mat.emissiveColor = new BABYLON.Color3(0.2,1,0.6);
              setTimeout(()=> { try{ mat.emissiveColor = orig || new BABYLON.Color3(0,0,0); }catch{} }, 450);
            }catch{}
          }
        }));
    } else {
      // Fallback floating pill
      if (document.getElementById('builder-view-pill')) return;
      const pill = document.createElement('div');
      pill.id='builder-view-pill';
      pill.style.cssText = `
        position:fixed; top:10px; left:10px; z-index:8000;
        background:rgba(0,0,0,0.55); border:1px solid #066; border-radius:8px; padding:6px 8px;
        display:flex; gap:10px; align-items:center; flex-wrap:wrap;`;
      pill.appendChild(mkSwitch('aerial-lock-cb','Aerial Lock', true, setAerial));
      pill.appendChild(mkSwitch('player-control-cb','Player Control', false, setPlayerControl));
      pill.appendChild(mkBtn('spawn-tool-btn','Spawn Tool','Drag to move spawn (Alt/Ctrl + Wheel to rotate)', ()=> ensureSpawnPad()));
      document.body.appendChild(pill);
    }
  }

  // ---------------- BOOT ----------------
  const boot = setInterval(()=>{
    try{
      if (!SCENE()) return;
      ensureUI();
      setAerial(true);
      ensureSpawnPad();
      attachSpawnDragHandlers();
      wrapExportIfPresent();
      tagSaveButtons();
      clearInterval(boot);
    }catch{}
  }, 150);

  // Expose spawn serializer for external exporters
  function serializeSpawn(){ return API.serializeSpawn = serializeSpawnInner(); }
  function serializeSpawnInner(){
    const s = serializeSpawn._impl || (serializeSpawn._impl = ()=> {
      ensureSpawnPad();
      if (!ST.spawn) return null;
      return {
        name: ST.spawn.name || 'StartPad_Wood',
        pos: { x:+ST.spawn.position.x.toFixed(4), y:+ST.spawn.position.y.toFixed(4), z:+ST.spawn.position.z.toFixed(4) },
        yaw: +(+ST.spawnYaw).toFixed(2)
      };
    });
    return s();
  }
})();