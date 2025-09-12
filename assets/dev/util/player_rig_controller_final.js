(function(){ 'use strict';
  if (window.__PP_RIG_v4) return; window.__PP_RIG_v4 = true;

  // -------- Tunables --------
  const TARGET_HEIGHT = 1.75;
  const SPEED_WALK = 1.9, SPEED_RUN = 3.3;
  const CAP_RADIUS = 0.35, CAP_HEIGHT = 1.8;
  const MOUSE_SENS = 0.002, TOUCH_SENS = 0.0022;
  const FALLBACK_SPAWN = new BABYLON.Vector3(-46.18, 1.35, -105.50); // your Index3 coords

  // -------- Shortcuts --------
  const canvas = () => document.getElementById('renderCanvas') || document.querySelector('canvas');
  const S = () => window.SCENE || window.scene || BABYLON.Engine?.LastCreatedScene || null;
  const UP = BABYLON.Vector3.Up();
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);

  // -------- Input --------
  const K = {w:0,a:0,s:0,d:0,run:false};
  addEventListener('keydown', e=>{
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
    if(k==='w'||c===87)K.w=1; else if(k==='a'||c===65)K.a=1; else if(k==='s'||c===83)K.s=1; else if(k==='d'||c===68)K.d=1; else if(k==='shift'||c===16)K.run=true;
    if (code==='KeyV'){ e.stopPropagation(); toggleThirdPerson(); }
  }, true);
  addEventListener('keyup', e=>{
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
    if(k==='w'||c===87)K.w=0; else if(k==='a'||c===65)K.a=0; else if(k==='s'||c===83)K.s=0; else if(k==='d'||c===68)K.d=0; else if(k==='shift'||c===16)K.run=false;
  }, true);

  // -------- Pointer look (FPS only) --------
  (function initLook(){
    const c = canvas(); if (!c) return;
    c.setAttribute('tabindex','0');
    addEventListener('mousemove', ev=>{
      const scn=S(), cam=scn&&scn.activeCamera; if(!cam) return;
      if (cam.name!=='FPCam') return; // do not touch TPS camera!
      if (document.pointerLockElement!==c) return;
      const dx=ev.movementX||0, dy=ev.movementY||0;
      cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
      cam.cameraRotation.y += -dx*MOUSE_SENS;
      cam.cameraRotation.x += -dy*MOUSE_SENS;
      cam.cameraRotation.x = clamp(cam.cameraRotation.x, -1.45, 1.45);
    }, true);
  })();

  // -------- Touch look/move (works for both, but we only write FPS rotation) --------
  ;(function initTouch(){
    let leftId=null,rightId=null,lx=0,ly=0,rx=0,ry=0;
    addEventListener('touchstart', e=>{
      for(const t of e.changedTouches){
        if(t.clientX < innerWidth*0.5 && leftId===null){ leftId=t.identifier; lx=t.clientX; ly=t.clientY; }
        else if(rightId===null){ rightId=t.identifier; rx=t.clientX; ry=t.clientY; }
      }
    }, {passive:true});
    addEventListener('touchmove', e=>{
      const scn=S(); if(!scn) return;
      for(const t of e.changedTouches){
        if(t.identifier===leftId){
          const dx=t.clientX-lx, dy=t.clientY-ly;
          K.w = dy<-10?1:0; K.s = dy>10?1:0; K.a = dx<-10?1:0; K.d = dx>10?1:0;
        } else if(t.identifier===rightId){
          const cam=scn.activeCamera; if(!cam || cam.name!=='FPCam') continue;
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
        if(t.identifier===rightId){ rightId=null; }
      }
    }, {passive:true});
  })();

  // -------- Rig / Cameras --------
  async function ensureRig(scn){
    if (!scn.__playerBody){
      const body = BABYLON.MeshBuilder.CreateCapsule('player_capsule',{height:CAP_HEIGHT,radius:CAP_RADIUS,tessellation:8,capSubdivisions:4},scn);
      body.checkCollisions=true; body.isPickable=false; body.visibility=0;
      body.position = resolveSpawn(scn);
      scn.__playerBody = body;
    }
    if (!scn.__playerRig){
      const rig = new BABYLON.TransformNode('PlayerRig', scn);
      rig.parent = scn.__playerBody; scn.__playerRig = rig;
    }

    let fps = scn.getCameraByName?.('FPCam');
    if (!fps){
      fps = new BABYLON.UniversalCamera('FPCam', new BABYLON.Vector3(0,1.6,0), scn);
      fps.parent = scn.__playerRig; fps.minZ=0.1; fps.speed=0; fps.inertia=0;
      fps.inputs.clear(); // we drive cameraRotation manually
      scn.cameras.push(fps);
    }

    let tps = scn.getCameraByName?.('TPCam');
    if (!tps){
      tps = new BABYLON.ArcRotateCamera('TPCam', -Math.PI/2, 1.15, 3.6, scn.__playerBody.position, scn);
      tps.lowerBetaLimit=0.3; tps.upperBetaLimit=1.45;
      tps.lowerRadiusLimit=2.4; tps.upperRadiusLimit=7.5;
      tps.wheelPrecision=60;
      tps.lockedTarget = scn.__playerBody; // always follow body
      scn.cameras.push(tps);
    }

    // Start in FPS
    scn.activeCamera = fps; window.camera = fps;
    return {fps, tps};
  }

  function resolveSpawn(scn){
    // Prefer Index3 anchors; else fallback
    const names = ['Index3','index3','Index_3','index_3','Index3_Start','index3_start','Spawn_Index3','spawn_index3','Van_Spawn','van_spawn','PlayerSpawn','Spawn','Start'];
    for (const n of names){
      const t = scn.getTransformNodeByName?.(n) || scn.getNodeByName?.(n);
      if (t){
        const p=t.getAbsolutePosition?.()||t.position; const pos=p? p.clone() : FALLBACK_SPAWN.clone();
        // snap to ground
        const gy = groundYAt(scn, pos.x, pos.z, pos.y);
        if (gy!=null) pos.y = gy + CAP_RADIUS + 0.12;
        return pos;
      }
    }
    const pos = FALLBACK_SPAWN.clone();
    const gy = groundYAt(scn, pos.x, pos.z, pos.y);
    if (gy!=null) pos.y = gy + CAP_RADIUS + 0.12;
    return pos;
  }

  function groundYAt(scn, x,z,approxY){
    const from = new BABYLON.Vector3(x, (approxY ?? 6) + 20, z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 200);
    const hit  = scn.pickWithRay(ray, m=>{
      if (!m || m.isPickable===false) return false;
      const n=(m.name||'').toLowerCase(); if (/sky|cloud|probe|env|reflection|atmo/.test(n)) return false;
      return true;
    });
    return (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : null;
  }

  async function ensurePlayerMesh(scn){
    if (scn.__playerMesh) return scn.__playerMesh;
    const paths=[
      "assets/models/player/main_player.glb",
      "assets/models/player/player.glb"
    ];
    for (const full of paths){
      try{
        const i=full.lastIndexOf('/'); const path=full.substring(0,i+1), file=full.substring(i+1);
        const r = await BABYLON.SceneLoader.ImportMeshAsync('', path, file, scn);
        const root = r.meshes && r.meshes[0]; if (!root) continue;
        root.parent = scn.__playerBody; root.position.set(0,-1.1,0); root.isPickable=false;
        scaleToHeight(root, TARGET_HEIGHT);
        scn.__playerAnims = r.animationGroups||[];
        return (scn.__playerMesh = root);
      }catch(e){/* try next */}
    }
    return null;
  }
  function scaleToHeight(node, target){
    try{
      const bb = node.getHierarchyBoundingVectors?.(true);
      if (!bb) return;
      const h = bb.max.y - bb.min.y;
      const sf = target / Math.min(Math.max(h,0.01), 1000);
      if (sf>0 && sf<10) node.scaling = new BABYLON.Vector3(sf,sf,sf);
    }catch{}
  }

  // -------- Movement helpers --------
  function getYawFromFPS(cam){ return cam.cameraRotation?.y || 0; }
  function forwardOnXZ_fromYaw(yaw){
    const s=Math.sin(yaw), c=Math.cos(yaw);
    return new BABYLON.Vector3(s,0,c).normalize();
  }
  function rightOnXZ_fromYaw(yaw){
    const f=forwardOnXZ_fromYaw(yaw);
    return BABYLON.Vector3.Cross(UP, f).normalize();
  }
  function setBodyYaw(body, yaw){
    if (body.rotationQuaternion){
      body.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, yaw));
    } else {
      body.rotation = body.rotation || new BABYLON.Vector3(0,0,0);
      body.rotation.y = yaw;
    }
  }

  // -------- Anim helper (optional) --------
  function playAnimClosest(scn, keys, speed=1){
    const groups = scn.__playerAnims||[]; if (!groups.length) return;
    let best=null, score=-1;
    for (const g of groups){
      const nm=(g.name||'').toLowerCase();
      const sc = keys.reduce((a,k)=>a+(nm.includes(k)?1:0),0);
      if (sc>score){ score=sc; best=g; }
    }
    if (!best) return;
    try{ groups.forEach(g=>{ if(g!==best) g.stop(); });
      best.start(true, speed, best.from, best.to, false);
    }catch{}
  }

  // -------- Main loop --------
  function attachLoop(scn){
    if (scn.__ppRigLoop) return; scn.__ppRigLoop = true;

    // If any external "spawn fix" is still running, try to disable it
    window.__DISABLE_SPAWN_PATCH__ = true;

    scn.onBeforeRenderObservable.add(()=>{
      const cam = scn.activeCamera; if (!cam) return;
      const body = scn.__playerBody; if (!body) return;

      // Compute yaw depending on camera mode
      let yaw;
      if (cam.name==='FPCam'){
        yaw = getYawFromFPS(cam);
      } else {
        // TPS: ArcRotate alpha is measured from -Z; we want left-handed Z forward
        const arc = cam; // ArcRotateCamera
        yaw = (Math.PI/2 - (arc.alpha||0)); // convert
      }

      // Movement vector in that yaw space
      let v = new BABYLON.Vector3(0,0,0);
      const fw = forwardOnXZ_fromYaw(yaw), rt = rightOnXZ_fromYaw(yaw);
      if (K.w) v.addInPlace(fw);
      if (K.s) v.addInPlace(fw.scale(-1));
      if (K.d) v.addInPlace(rt);
      if (K.a) v.addInPlace(rt.scale(-1));
      const len = v.length();

      const eng = scn.getEngine?.() || window.ENGINE; 
      const dt = Math.min(0.066, ((eng?.getDeltaTime?.()||16.7)/1000));

      // Face the body to yaw so strafing feels correct
      setBodyYaw(body, yaw);

      // Move body
      if (len>0.0001){
        v.scaleInPlace(1/len);
        const sp=(K.run?SPEED_RUN:SPEED_WALK)*dt;
        const d=v.scale(sp);
        try{ body.moveWithCollisions? body.moveWithCollisions(d) : body.position.addInPlace(d); }catch{}
      }

      // Keep FPS camera glued to head; DO NOT touch TPS position!
      if (cam.name==='FPCam'){
        const p = body.getAbsolutePosition?.() || body.position;
        const rig = scn.__playerRig; if (rig) rig.position.set(0,0,0);
        cam.position.copyFrom(new BABYLON.Vector3(p.x, p.y+1.6, p.z));
      }

      // Drive basic anims if present
      try {
        const speedNow = len * (K.run?SPEED_RUN:SPEED_WALK);
        if (speedNow > 0.05) playAnimClosest(scn, ['run','walk','move'], K.run?1.2:1.0);
        else                 playAnimClosest(scn, ['idle','stand','breath'], 1.0);
      } catch {}
    });
  }

  // -------- Toggle TPS/FPS --------
  function toggleThirdPerson(){
    const scn=S(); if (!scn) return;
    const fps=scn.getCameraByName?.('FPCam');
    const tps=scn.getCameraByName?.('TPCam');
    if (!fps || !tps) return;

    if (scn.activeCamera === fps){
      // -> TPS
      tps.lockedTarget = scn.__playerBody;
      // reasonable orbit from behind character, keep radius
      tps.radius = clamp(tps.radius||3.6, 3.0, 6.0);
      tps.beta   = clamp(tps.beta||1.15, 0.35, 1.45);
      // align alpha to FPS yaw so switch feels seamless
      const yaw = getYawFromFPS(fps);
      tps.alpha = Math.PI/2 - yaw;
      scn.activeCamera = tps; window.camera = tps;
    } else {
      // -> FPS
      // copy TPS yaw into FPS cameraRotation
      const yaw = Math.PI/2 - (tps.alpha||0);
      fps.cameraRotation = fps.cameraRotation || new BABYLON.Vector2(0,0);
      fps.cameraRotation.y = yaw;
      scn.activeCamera = fps; window.camera = fps;
    }
  }
  window.toggleThirdPerson = toggleThirdPerson;

  // -------- Boot --------
  (function boot(){
    const scn=S(); if (!scn) return requestAnimationFrame(boot);
    (async ()=>{
      await ensureRig(scn);
      await ensurePlayerMesh(scn);
      attachLoop(scn);
    })();
  })();

})();
