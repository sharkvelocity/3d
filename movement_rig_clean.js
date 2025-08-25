
// movement_rig_clean.js (hardened) — WASD + FP/TP + visible body with fallback
(function(){ 'use strict';
  if (window.__rigFinal) return; window.__rigFinal = true;

  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }
  function canvas(){ return document.getElementById('renderCanvas') || document.querySelector('canvas'); }
  const isArc = c => c && c.alpha!==undefined && c.beta!==undefined && c.radius!==undefined;
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
  const K = {w:0,a:0,s:0,d:0,run:false};

  const SPEED_WALK = 1.9, SPEED_RUN = 3.3;
  const MOUSE_SENS = 0.002, TOUCH_LOOK_SENS = 0.0022;
  const PLAYER_GLB = ["assets/models/player/main_player.glb","assets/models/player/player.glb"];

  function getSpawn(){
    if (window.MAP_DEF && window.MAP_DEF.spawn){
      const sp = window.MAP_DEF.spawn;
      return new BABYLON.Vector3(sp.x||0, sp.y||1.35, sp.z||0);
    }
    return new BABYLON.Vector3(0,1.35,0);
  }

  // Input
  function keyDown(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
    if(k==='w'||c===87)K.w=1; else if(k==='a'||c===65)K.a=1; else if(k==='s'||c===83)K.s=1; else if(k==='d'||c===68)K.d=1; else if(k==='shift'||c===16)K.run=true;
    if(k==='v' || code==='KeyV' || c===86){ e.stopPropagation(); toggleThirdPerson(); }
  }
  function keyUp(e){
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
    if(k==='w'||c===87)K.w=0; else if(k==='a'||c===65)K.a=0; else if(k==='s'||c===83)K.s=0; else if(k==='d'||c===68)K.d=0; else if(k==='shift'||c===16)K.run=false;
  }
  addEventListener('keydown', keyDown, true);
  addEventListener('keyup',   keyUp,   true);

  // Pointer lock mouse look
  (function(){
    const c = canvas(); if(!c) return;
    c.setAttribute('tabindex','0');
    c.addEventListener('click', ()=>{ try{ c.requestPointerLock && c.requestPointerLock(); c.focus(); }catch(_){ } });
    addEventListener('mousemove', ev=>{
      const s=S(), cam=s&&s.activeCamera; if(!cam || isArc(cam)) return;
      if(document.pointerLockElement!==c) return;
      const dx=ev.movementX||0, dy=ev.movementY||0;
      cam.cameraRotation = cam.cameraRotation || new BABYLON.Vector2(0,0);
      cam.cameraRotation.y += -dx*MOUSE_SENS;
      cam.cameraRotation.x += -dy*MOUSE_SENS;
    }, true);
  })();

  // Touch look/move
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
          if (isArc(cam)){ cam.alpha += -0.01*(t.clientX-rx); cam.beta += -0.01*(t.clientY-ry);
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

  function ensureSceneFlags(s){
    try{
      s.collisionsEnabled = true;
      s.gravity = new BABYLON.Vector3(0, -0.5, 0);
    }catch(_){}
  }

  function ensureRig(s){
    ensureSceneFlags(s);
    if (!s.__playerBody){
      const body = BABYLON.MeshBuilder.CreateCapsule('player_capsule',{height:1.8,radius:0.35,tessellation:8,capSubdivisions:4},s);
      body.checkCollisions=true; body.isPickable=false; body.visibility=0.0;
      body.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
      body.ellipsoidOffset = new BABYLON.Vector3(0,0.9,0);
      body.position = getSpawn();
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
    // Try GLBs
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
    // Fallback visible placeholder so user sees "body"
    const box = BABYLON.MeshBuilder.CreateBox("PlayerModel_Fallback",{width:0.5,height:1.7,depth:0.3},s);
    box.parent = s.__playerBody; box.position = new BABYLON.Vector3(0,-0.05,0);
    const mat = new BABYLON.StandardMaterial("pmat", s); mat.emissiveColor = new BABYLON.Color3(0.1,0.9,0.9);
    box.material = mat;
    s.__playerMesh = box; return box;
  }

  function fwd(cam){ try{ const v=cam.getDirection(BABYLON.Axis.Z); v.y=0; v.normalize(); return v; }catch(_){ return new BABYLON.Vector3(0,0,1); } }
  function right(cam){ try{ const v=cam.getDirection(BABYLON.Axis.X); v.y=0; v.normalize(); return v; }catch(_){ return new BABYLON.Vector3(1,0,0); } }

  function attachLoop(s){
    if (s.__rigLoopFinal) return; s.__rigLoopFinal = true;
    s.onNewCameraAddedObservable.add(()=>{ const t=s.getCameraByName('TPCam'); if (t) s.activeCamera=t; });
    s.onBeforeRenderObservable.add(function(){
      // Force a known active camera (default to third-person so user sees body)
      if (s.activeCamera && s.activeCamera.name!=='FPCam' && s.activeCamera.name!=='TPCam'){
        const f=s.getCameraByName('FPCam'), t=s.getCameraByName('TPCam'); s.activeCamera = t || f || s.activeCamera;
      }
      const cam=s.activeCamera; if(!cam) return;
      const body=s.__playerBody; if(!body) return;

      // Movement vector
      let v=new BABYLON.Vector3(0,0,0);
      const fw=fwd(cam), rt=right(cam);
      if (K.w) v.addInPlace(fw);
      if (K.s) v.addInPlace(fw.scale(-1));
      if (K.d) v.addInPlace(rt);
      if (K.a) v.addInPlace(rt.scale(-1));
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

  function whenReady(cb){ (function tick(){ const s=S(); if (s && s.activeCamera){ try{ cb(s); }catch(_){ } return; } requestAnimationFrame(tick); })(); }
  whenReady(async function(s){
    const cams = ensureRig(s);
    // Default to third-person so avatar is visible immediately
    s.activeCamera = cams.arc; window.camera = cams.arc;
    attachLoop(s);
    await ensurePlayerMesh(s);
    if (!s.__spawnDone){ s.__playerBody.position = getSpawn(); s.__spawnDone = true; }
  });
})();
