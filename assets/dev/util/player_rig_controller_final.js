// File: assets/dev/util/player_rig_controller_final.js
(function(){ 'use strict';
  if (window.__rigFinal_fix3) return; window.__rigFinal_fix3 = true;

  // ---- Tunables ----
  const TARGET_HEIGHT = 1.75;             // desired player height (meters)
  const SPEED_WALK    = 1.9;              // m/s
  const SPEED_RUN     = 3.3;              // m/s
  const CAP_RADIUS    = 0.35;
  const CAP_HEIGHT    = 1.8;
  const MOUSE_SENS    = 0.002;            // radians per px
  const TOUCH_SENS    = 0.0022;
  const SPAWN_FALLBACK = new BABYLON.Vector3(-46.18, 1.35, -105.50); // index3 fallback

  // ---- Shortcuts ----
  const canvas = () => document.getElementById('renderCanvas') || document.querySelector('canvas');
  function S(){ return window.SCENE || window.scene || BABYLON.Engine?.LastCreatedScene || null; }
  const isArc = c => c && c.alpha!==undefined && c.beta!==undefined && c.radius!==undefined;
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
  const UP = BABYLON.Vector3.Up();

  // ---- Input state ----
  const K = {w:0,a:0,s:0,d:0,run:false};
  function onKeyDown(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
    if(k==='w'||c===87)K.w=1; else if(k==='a'||c===65)K.a=1; else if(k==='s'||c===83)K.s=1; else if(k==='d'||c===68)K.d=1; else if(k==='shift'||c===16)K.run=true;
    if(code==='KeyV'||k==='v'){ e.stopPropagation(); toggleThirdPerson(); }
  }
  function onKeyUp(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
    if(k==='w'||c===87)K.w=0; else if(k==='a'||c===65)K.a=0; else if(k==='s'||c===83)K.s=0; else if(k==='d'||c===68)K.d=0; else if(k==='shift'||c===16)K.run=false;
  }
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup',   onKeyUp,   true);

  // ---- Pointer look (FPS) ----
  (function initLook(){
    const c = canvas(); if(!c) return;
    c.setAttribute('tabindex','0');
    window.addEventListener('mousemove', ev=>{
      const s=S(), cam=s&&s.activeCamera; if(!cam || isArc(cam)) return;
      if(document.pointerLockElement!==c) return;
      const dx=ev.movementX||0, dy=ev.movementY||0;
      cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
      cam.cameraRotation.y += -dx*MOUSE_SENS;
      cam.cameraRotation.x += -dy*MOUSE_SENS;
      // clamp vertical pitch
      cam.cameraRotation.x = clamp(cam.cameraRotation.x, -1.45, 1.45);
    }, true);
  })();

  // ---- Touch look/move (mobile) ----
  (function initTouch(){
    let leftId=null,rightId=null,lx=0,ly=0,rx=0,ry=0;
    addEventListener('touchstart', e=>{
      for(const t of e.changedTouches){
        if(t.clientX < innerWidth*0.5 && leftId===null){ leftId=t.identifier; lx=t.clientX; ly=t.clientY; }
        else if(t.clientX >= innerWidth*0.5 && rightId===null){ rightId=t.identifier; rx=t.clientX; ry=t.clientY; }
      }
    }, {passive:true});
    addEventListener('touchmove', e=>{
      const s=S(); if(!s) return;
      for(const t of e.changedTouches){
        if(t.identifier===leftId){
          const dx=t.clientX-lx, dy=t.clientY-ly;
          K.w = dy<-10?1:0; K.s = dy>10?1:0; K.a = dx<-10?1:0; K.d = dx>10?1:0;
        } else if (t.identifier===rightId){
          const cam=s.activeCamera; if(!cam) continue;
          cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
          cam.cameraRotation.y += -(t.clientX-rx)*TOUCH_SENS;
          cam.cameraRotation.x += -(t.clientY-ry)*TOUCH_SENS;
          cam.cameraRotation.x = clamp(cam.cameraRotation.x, -1.45, 1.45);
          rx=t.clientX; ry=t.clientY;
        }
      }
    }, {passive:true});
    addEventListener('touchend', e=>{
      for(const t of e.changedTouches){
        if(t.identifier===leftId){ leftId=null; K.w=K.a=K.s=K.d=0; }
        if(t.identifier===rightId) rightId=null;
      }
    }, {passive:true});
  })();

  // ---- Rig creation ----
  async function ensureRig(s){
    if (!s.__playerBody){
      const body = BABYLON.MeshBuilder.CreateCapsule('player_capsule',{height:CAP_HEIGHT,radius:CAP_RADIUS,tessellation:8,capSubdivisions:4},s);
      body.checkCollisions=true; body.isPickable=false; body.visibility=0;
      body.position = spawnPosition(s);
      s.__playerBody = body;
    }
    if (!s.__playerRig){
      const rig = new BABYLON.TransformNode('PlayerRig', s);
      rig.parent = s.__playerBody; s.__playerRig = rig;
    }
    let fps = s.getCameraByName && s.getCameraByName('FPCam');
    if (!fps){
      fps = new BABYLON.UniversalCamera('FPCam', new BABYLON.Vector3(0,1.6,0), s);
      fps.parent = s.__playerRig; fps.minZ=0.1; fps.speed=0; fps.inertia=0;
      fps.inputs.clear(); // we manage rotation ourselves via cameraRotation
      s.cameras.push(fps);
    }
    let tpc = s.getCameraByName && s.getCameraByName('TPCam');
    if (!tpc){
      tpc = new BABYLON.ArcRotateCamera('TPCam', -Math.PI/2, 1.2, 3.8, s.__playerBody.position.clone(), s);
      tpc.lowerBetaLimit=0.3; tpc.upperBetaLimit=1.45; tpc.lowerRadiusLimit=2.4; tpc.upperRadiusLimit=7.5; tpc.wheelPrecision=60;
      tpc.lockedTarget = s.__playerBody; s.cameras.push(tpc);
    }
    s.activeCamera = fps; window.camera = fps;
    return {fps, tpc};
  }

  // ---- Spawn helpers ----
  function findIndex3Anchor(s){
    const prefer = [
      'Index3','index3','Index_3','index_3',
      'Index3_Start','index3_start','Spawn_Index3','spawn_index3',
      'Van_Spawn','van_spawn','PlayerSpawn','Spawn','Start'
    ];
    for (const n of prefer){
      const t = s.getTransformNodeByName?.(n) || s.getNodeByName?.(n);
      if (t) return t;
    }
    return null;
  }
  function groundYAt(s, x,z,approxY){
    const from = new BABYLON.Vector3(x, (approxY ?? 6) + 20, z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 200);
    const hit  = s.pickWithRay(ray, m=>{
      if (!m) return false;
      if (m.isPickable===false) return false;
      const n=(m.name||'').toLowerCase();
      if (/sky|cloud|probe|env|reflection|atmo/.test(n)) return false;
      return true;
    });
    return (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : null;
  }
  function spawnPosition(s){
    let p = SPAWN_FALLBACK.clone();
    try{
      const a = findIndex3Anchor(s);
      if (a){
        const ap = a.getAbsolutePosition?.() || a.position;
        if (ap) p = ap.clone();
      }
      const gy = groundYAt(s, p.x, p.z, p.y);
      if (gy!=null) p.y = gy + CAP_RADIUS + 0.12;
    }catch{}
    return p;
  }

  // ---- Import player GLB + scale to height ----
  async function ensurePlayerMesh(s){
    if (s.__playerMesh) return s.__playerMesh;
    const paths = [
      "assets/models/player/main_player.glb",
      "assets/models/player/player.glb"
    ];
    for (const full of paths){
      try{
        const i=full.lastIndexOf('/'); const path=full.substring(0,i+1), file=full.substring(i+1);
        const r = await BABYLON.SceneLoader.ImportMeshAsync('', path, file, s);
        const root = (r.meshes && r.meshes[0]) || r.meshes?.find(m=>!m.parent);
        if (!root) continue;

        // Parent to body rig and scale to ~TARGET_HEIGHT
        root.name='PlayerModel';
        root.parent = s.__playerBody;
        root.position.set(0,-1.1,0);
        root.isPickable = false;
        scaleToHeight(root, TARGET_HEIGHT);

        // Make sure first-person camera doesn't clip (optionally hide head)
        try {
          const head = root.getChildMeshes?.().find(m => /head|camera|eyes/i.test(m.name));
          if (head) head.isVisible = false; // avoid seeing the face in FPS
        } catch {}

        // Cache animation groups
        s.__playerAnims = r.animationGroups || [];
        return (s.__playerMesh = root);
      }catch(e){ /* try next */ }
    }
    return null;
  }

  function scaleToHeight(node, target){
    try{
      const bb = node.getHierarchyBoundingVectors ? node.getHierarchyBoundingVectors(true) : null;
      if (!bb) return;
      const h = bb.max.y - bb.min.y;
      if (!isFinite(h) || h <= 0.01) return;
      const sf = target / Math.min(h, 1000);
      if (sf>0 && sf<10) node.scaling = new BABYLON.Vector3(sf,sf,sf);
    }catch{}
  }

  // ---- Movement helpers (body faces camera yaw) ----
  function forwardOnXZ(cam){
    // Build forward from camera yaw only (ignore pitch to prevent inverted controls)
    const y = (cam.cameraRotation?.y) ?? 0;
    const s = Math.sin(y), c = Math.cos(y);
    return new BABYLON.Vector3(s, 0, c * 1).normalize(); // Babylon is left-handed Z forward
  }
  function rightOnXZ(cam){
    const f = forwardOnXZ(cam);
    const r = BABYLON.Vector3.Cross(UP, f).normalize(); // right vector on XZ
    return r;
  }
  function setBodyYaw(body, cam){
    const yaw = (cam.cameraRotation?.y) ?? 0;
    if (body.rotationQuaternion){
      const q = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw);
      body.rotationQuaternion.copyFrom(q);
    } else {
      body.rotation = body.rotation || new BABYLON.Vector3();
      body.rotation.y = yaw;
    }
  }

  // ---- Simple locomotion animation state ----
  function playAnimClosest(s, nameLike, speed=1){
    const groups = s.__playerAnims||[];
    if (!groups.length) return;
    let best=null, score=-1;
    for (const g of groups){
      const nm=(g.name||'').toLowerCase();
      const sc = nameLike.reduce((acc,k)=>acc + (nm.includes(k)?1:0), 0);
      if (sc>score){ score=sc; best=g; }
    }
    if (!best) return;
    try{
      groups.forEach(g=>{ if(g!==best) g.stop(); });
      best.start(true, speed, best.from, best.to, false);
    }catch{}
  }

  // ---- Main loop ----
  function attachLoop(s){
    if (s.__rigLoopFixed) return; s.__rigLoopFixed = true;
    s.onBeforeRenderObservable.add(()=>{
      const cam=s.activeCamera; if(!cam) return;
      const body=s.__playerBody; if(!body) return;

      // Keep rig at body
      const rig = s.__playerRig; if (rig) rig.position.set(0,0,0);

      // Movement vector in camera space (yaw only)
      let v = new BABYLON.Vector3(0,0,0);
      const fw=forwardOnXZ(cam), rt=rightOnXZ(cam);
      if (K.w) v.addInPlace(fw);
      if (K.s) v.addInPlace(fw.scale(-1));
      if (K.d) v.addInPlace(rt);
      if (K.a) v.addInPlace(rt.scale(-1));

      const eng = s.getEngine?.() || window.ENGINE;
      const dt = Math.min(0.066, ((eng?.getDeltaTime?.()||16.7)/1000));

      // Rotate body to camera yaw for proper strafe orientation
      setBodyYaw(body, cam);

      // Move with collisions
      const len=v.length();
      if (len>0.0001){
        v.scaleInPlace(1/len);
        const sp=(K.run?SPEED_RUN:SPEED_WALK)*dt;
        const d=v.scale(sp);
        try{ body.moveWithCollisions ? body.moveWithCollisions(d) : body.position.addInPlace(d); }catch{}
      }

      // Keep camera sitting at rig offset
      try {
        const worldPos = body.getAbsolutePosition?.() || body.position;
        s.__playerRig && (s.__playerRig.position.copyFrom(new BABYLON.Vector3(0,0,0)));
        cam.position.copyFrom(new BABYLON.Vector3(worldPos.x, worldPos.y + 1.6, worldPos.z));
      } catch {}

      // Drive simple animation state if available
      try {
        const speedNow = len * (K.run?SPEED_RUN:SPEED_WALK);
        if (speedNow > 0.05) {
          playAnimClosest(s, ['run','walk','move'], K.run ? 1.2 : 0.9);
        } else {
          playAnimClosest(s, ['idle','stand','breath'], 1.0);
        }
      } catch {}
    });
  }

  // ---- Third-person toggle ----
  function doToggle(){
    const s=S(); if(!s) return;
    const fps=s.getCameraByName?.('FPCam'), tpc=s.getCameraByName?.('TPCam');
    if (!fps||!tpc) return;
    s.activeCamera = (s.activeCamera===fps) ? tpc : fps;
    window.camera = s.activeCamera;
  }
  window.toggleThirdPerson = doToggle;

  // ---- Boot ----
  (function whenReady(){
    const s=S(); if (!s) return requestAnimationFrame(whenReady);
    (async ()=>{
      const cams = await ensureRig(s);
      await ensurePlayerMesh(s);
      attachLoop(s);
    })();
  })();

})();
