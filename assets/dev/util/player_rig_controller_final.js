(function(){ 'use strict';
  if (window.__rigFinal_v3) return; window.__rigFinal_v3 = true;

  // Fallback spawn (only used if we can't find Index3)
  const SPAWN_FALLBACK = new BABYLON.Vector3(-46.18, 1.35, -105.50);

  const SPEED_WALK = 1.9, SPEED_RUN = 3.3;
  const MOUSE_SENS = 0.002, TOUCH_LOOK_SENS = 0.0022;
  const PLAYER_GLB = ["assets/models/player/main_player.glb","assets/models/player/player.glb"];

  const canvas = () => document.getElementById('renderCanvas') || document.querySelector('canvas');
  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }
  window.S = S;

  const isArc = c => c && c.alpha!==undefined && c.beta!==undefined && c.radius!==undefined;
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
  const UP = new BABYLON.Vector3(0,1,0);

  const K = {w:0,a:0,s:0,d:0,run:false};

  // ---------- INPUT ----------
  function keyDown(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
    if(k==='w'||c===87)K.w=1; else if(k==='a'||c===65)K.a=1; else if(k==='s'||c===83)K.s=1; else if(k==='d'||c===68)K.d=1; else if(k==='shift'||c===16)K.run=true;
    if(k==='v' || code==='KeyV' || c===86){ e.stopPropagation(); toggleThirdPerson(); }
  }
  function keyUp(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
    if(k==='w'||c===87)K.w=0; else if(k==='a'||c===65)K.a=0; else if(k==='s'||c===83)K.s=0; else if(k==='d'||c===68)K.d=0; else if(k==='shift'||c===16)K.run=false;
  }
  window.addEventListener('keydown', keyDown, false);
  window.addEventListener('keyup',   keyUp,   false);
  document.addEventListener('keydown', keyDown, true);
  document.addEventListener('keyup',   keyUp,   true);

  // Pointer lock + mouse look
  (function(){
    const c = canvas(); if(!c) return;
    c.setAttribute('tabindex','0');
    c.addEventListener('click', ()=>{ try{ c.requestPointerLock && c.requestPointerLock(); }catch(_){ } });
    window.addEventListener('mousemove', ev=>{
      const s=S(), cam=s&&s.activeCamera; if(!cam || isArc(cam)) return;
      if(document.pointerLockElement!==c) return;
      const dx=ev.movementX||0, dy=ev.movementY||0;
      cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
      cam.cameraRotation.y += -dx*MOUSE_SENS;
      cam.cameraRotation.x += -dy*MOUSE_SENS;
    }, true);
  })();

  // Touch: left = move, right = look
  (function(){
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
          if (isArc(cam)){
            cam.alpha += -0.01*(t.clientX-rx);
            cam.beta  += -0.01*(t.clientY-ry);
            cam.beta = clamp(cam.beta, cam.lowerBetaLimit||0.3, cam.upperBetaLimit||1.45);
          } else {
            cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
            cam.cameraRotation.y += -(t.clientX-rx)*TOUCH_LOOK_SENS;
            cam.cameraRotation.x += -(t.clientY-ry)*TOUCH_LOOK_SENS;
          }
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

  // ---------- RIG / CAMERAS ----------
  function ensureRig(s){
    if (!s.__playerBody){
      const body = BABYLON.MeshBuilder.CreateCapsule('player_capsule',{height:1.8,radius:0.35,tessellation:8,capSubdivisions:4},s);
      body.checkCollisions=true; body.visibility=0; body.isPickable=false;
      body.position = SPAWN_FALLBACK.clone();
      s.__playerBody = body;
    }
    if (!s.__playerRig){
      const rig = new BABYLON.TransformNode('PlayerRig', s);
      rig.parent = s.__playerBody; s.__playerRig = rig;
    }
    let fps = s.getCameraByName && s.getCameraByName('FPCam');
    if (!fps){
      fps = new BABYLON.UniversalCamera('FPCam', new BABYLON.Vector3(0,1.6,0), s);
      fps.parent = s.__playerRig; fps.minZ=0.1; fps.speed=0; fps.inertia=0; fps.angularSensibility=4000;
      try{ fps.attachControl(canvas(), true); }catch(_){}
      s.cameras && s.cameras.indexOf(fps)===-1 && s.cameras.push(fps);
    }
    let arc = s.getCameraByName && s.getCameraByName('TPCam');
    if (!arc){
      arc = new BABYLON.ArcRotateCamera('TPCam', -Math.PI/2, 1.2, 3.6, s.__playerBody.position.clone(), s);
      arc.lowerBetaLimit=0.3; arc.upperBetaLimit=1.45; arc.lowerRadiusLimit=2.4; arc.upperRadiusLimit=7.5; arc.wheelPrecision=60;
      try{ arc.attachControl(canvas(), true); }catch(_){}
      s.cameras && s.cameras.indexOf(arc)===-1 && s.cameras.push(arc);
    }
    arc.lockedTarget = s.__playerBody;
    arc.radius = clamp(arc.radius||3.6, 3.0, 6.0);
    arc.alpha = -Math.PI/2; arc.beta = 1.2;
    return {fps, arc};
  }

  async function ensurePlayerMesh(s){
    if (s.__playerMesh) return s.__playerMesh;
    for (const p of PLAYER_GLB){
      try{
        const i=p.lastIndexOf('/'); const path=p.substring(0,i+1), file=p.substring(i+1);
        const r = await BABYLON.SceneLoader.ImportMeshAsync('', path, file, s);
        const root = r.meshes && r.meshes[0]; if(!root) continue;
        root.name='PlayerModel'; root.parent = s.__playerBody; root.position = new BABYLON.Vector3(0,-1.1,0);
        if (root.getChildMeshes) root.getChildMeshes().forEach(m=>m.layerMask=0x1);
        root.layerMask = 0x1;
        s.__playerMesh = root; return root;
      }catch(_){}
    }
    return null;
  }

  // ---------- HANDEDNESS-SAFE MOVEMENT BASIS ----------
  function basisFromCamera(cam){
    const s = S();
    const fwd = cam.getDirection ? cam.getDirection(BABYLON.Vector3.Forward()) : new BABYLON.Vector3(0,0,1);
    fwd.y = 0; if (fwd.lengthSquared() < 1e-6) fwd.set(0,0,1); else fwd.normalize();

    // Right depends on handedness:
    // LH (Babylon default): right = up × forward
    // RH:                     right = forward × up
    let right;
    if (s && s.useRightHandedSystem){
      right = BABYLON.Vector3.Cross(fwd, UP);
    } else {
      right = BABYLON.Vector3.Cross(UP, fwd);
    }
    right.y = 0; if (right.lengthSquared() < 1e-6) right.set(1,0,0); else right.normalize();
    return { fwd, right };
  }

  // ---------- LOOP ----------
  function attachLoop(s){
    if (s.__rigLoopFinal_v3) return; s.__rigLoopFinal_v3 = true;

    s.onNewCameraAddedObservable.add(()=>{ const f=s.getCameraByName('FPCam'); if (f) s.activeCamera=f; });

    s.onBeforeRenderObservable.add(function(){
      if (s.activeCamera && s.activeCamera.name!=='FPCam' && s.activeCamera.name!=='TPCam'){
        const f=s.getCameraByName('FPCam'), t=s.getCameraByName('TPCam'); s.activeCamera = f || t || s.activeCamera;
      }
      const cam=s.activeCamera; if(!cam) return;
      const body=s.__playerBody; if(!body) return;

      // Build movement vector using handedness-safe basis
      const { fwd, right } = basisFromCamera(cam);
      let v = new BABYLON.Vector3(0,0,0);
      if (K.w) v.addInPlace(fwd);
      if (K.s) v.addInPlace(fwd.scale(-1));
      if (K.d) v.addInPlace(right);
      if (K.a) v.addInPlace(right.scale(-1));

      const len=v.length();
      if (len>0){
        v.scaleInPlace(1/len);
        const eng=s.getEngine&&s.getEngine()||window.ENGINE;
        const dt=((eng&&eng.getDeltaTime)?eng.getDeltaTime():16.7)/1000;
        const sp=(K.run?SPEED_RUN:SPEED_WALK)*dt;
        const d=v.scale(sp);
        try{ body.moveWithCollisions ? body.moveWithCollisions(d) : body.position.addInPlace(d); }catch(_){}
      }
    });
  }

  // ---------- SPAWN (Index3 position + yaw, ground snap) ----------
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
  function yawFromAnchor(t){
    if (!t) return null;
    if (t.rotationQuaternion){ return t.rotationQuaternion.toEulerAngles().y; }
    if (t.rotation && typeof t.rotation.y === 'number') return t.rotation.y;
    return null;
  }
  function posOf(t){ try{ return t.getAbsolutePosition?.() || t.position || null; }catch{ return null; } }

  function groundYAt(x,z,approxY){
    const s=S(); if(!s) return null;
    const from = new BABYLON.Vector3(x, (approxY ?? 4) + 20, z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 200);
    const hit  = s.pickWithRay(ray, (m)=>{
      if (!m) return false;
      if (m.isPickable === false) return false;
      const n=(m.name||'').toLowerCase();
      if (/sky|cloud|atmo|probe|env|reflection/.test(n)) return false;
      return true;
    });
    return (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : null;
  }

  function resolveIndex3(){
    const s=S(); if (!s) return null;

    // Vars from devtools/custom
    const cand = [
      window.Index3Spawn, window.PP_INDEX3_SPAWN, window.PP?.index3?.spawn,
      window.DEVTOOLS?.Index3Spawn, window.DEVTOOLS?.spawns?.index3,
      window.DEVTOOLS?.spawns?.[3], window.DEVTOOLS?.getSpawn?.('index3')
    ].find(Boolean);

    if (cand){
      if (cand.x !== undefined && cand.y !== undefined && cand.z !== undefined){
        return { pos: new BABYLON.Vector3(cand.x, cand.y, cand.z), yaw: (typeof cand.yaw==='number')?cand.yaw:null };
      }
      if (cand.getAbsolutePosition){ return { pos: posOf(cand), yaw: yawFromAnchor(cand) }; }
    }

    // Scene anchors by name
    const names = [
      'Index3','index3','Index_3','index_3','Index3_Start','index3_start',
      'Spawn_Index3','spawn_index3','PlayerSpawn_Index3','player_spawn_index3',
      'Van_Spawn','van_spawn','PlayerSpawn','Spawn','Start'
    ];
    for (const n of names){
      const t = s.getTransformNodeByName?.(n) || s.getNodeByName?.(n);
      if (t) return { pos: posOf(t), yaw: yawFromAnchor(t) };
    }

    // Metadata
    for (const m of (s.transformNodes||[])){
      if (m?.metadata?.spawn === 'index3' || m?.metadata?.index === 3){
        return { pos: posOf(m), yaw: yawFromAnchor(m) };
      }
    }
    return null;
  }

  async function placeAtSpawn(s){
    const body = s.__playerBody; if (!body) return;
    const idx3 = resolveIndex3();

    let p = (idx3?.pos && idx3.pos.clone()) || SPAWN_FALLBACK.clone();
    const gy = groundYAt(p.x, p.z, p.y);
    if (gy != null) p.y = gy + 0.35 + 0.12;

    if (body.position?.copyFrom) body.position.copyFrom(p);
    else if (body.setAbsolutePosition) body.setAbsolutePosition(p);
    else body.position = p;

    // Align yaw so movement matches look/scene forward
    let yaw = (idx3 && typeof idx3.yaw === 'number') ? idx3.yaw : null;
    if (yaw == null){
      // Face toward van or origin
      const focus = window.PP?.CONFIG?.VAN?.POSITION || new BABYLON.Vector3(0, p.y, 0);
      const dir = focus.subtract(p); dir.y = 0;
      yaw = Math.atan2(dir.x, dir.z); // Babylon LH yaw
    }
    setYaw(body, yaw);

    // Align camera too
    const cam = s.activeCamera || window.camera;
    if (cam && cam !== body){
      setYaw(cam, yaw);
      if (cam.position && body.position) cam.position.copyFrom(body.position);
    }
  }

  // ---------- TOGGLE 1P/3P ----------
  function doToggle(){
    const s=S(); if(!s) return;
    const {fps,arc} = ensureRig(s); if (!fps||!arc) return;
    if (isArc(s.activeCamera)){
      s.activeCamera = fps; try{ fps.attachControl(canvas(), true); }catch(_){}
    } else {
      arc.lockedTarget = s.__playerBody;
      arc.radius = clamp(arc.radius||3.6, 3.0, 6.0);
      arc.alpha = -Math.PI/2; arc.beta = 1.2;
      s.activeCamera = arc; try{ arc.attachControl(canvas(), true); }catch(_){}
    }
    window.camera = s.activeCamera;
  }
  window.toggleThirdPerson = function(){
    const s=S();
    if (!s || !s.activeCamera){ whenReady(()=>doToggle()); return; }
    doToggle();
  };

  // ---------- BOOT ----------
  function whenReady(cb){ (function tick(){ const s=S(); if (s && s.activeCamera){ try{ cb(s); }catch(_){ } return; } requestAnimationFrame(tick); })(); }
  whenReady(async function(s){
    const cams = ensureRig(s);
    s.activeCamera = cams.fps; window.camera = cams.fps;
    attachLoop(s);
    await ensurePlayerMesh(s);

    // Robust spawn application
    if (!s.__spawnDone){
      await placeAtSpawn(s);
      s.__spawnDone = true;
    }
  });
})();
