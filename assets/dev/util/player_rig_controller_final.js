(function(){ 'use strict';
  if (window.__PP_RIG_v5__) return; window.__PP_RIG_v5__ = true;

  // ---- Tunables ----
  const TARGET_HEIGHT = 1.75;
  const CAP_HEIGHT = 1.8, CAP_RADIUS = 0.35;
  const SPEED_WALK = 1.9, SPEED_RUN = 3.3;
  const HEAD_OFFSET = 1.6;
  const MOUSE_SENS = 0.002;
  const TOUCH_SENS = 0.0022;
  const TPS_RADIUS_DEFAULT = 3.6;
  const SPAWN_FALLBACK = new BABYLON.Vector3(-46.18, 1.35, -105.50);

  // ---- Shortcuts ----
  const canvas = () => document.getElementById('renderCanvas') || document.querySelector('canvas');
  const S = () => window.SCENE || window.scene || BABYLON.Engine?.LastCreatedScene || null;
  const UP = BABYLON.Vector3.Up();
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);

  // ---- Input (WASD, Shift, V) ----
  const K = {w:0,a:0,s:0,d:0,run:false};
  addEventListener('keydown', e=>{
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0, code=e.code||'';
    if(k==='w'||c===87)K.w=1; else if(k==='a'||c===65)K.a=1; else if(k==='s'||c===83)K.s=1; else if(k==='d'||c===68)K.d=1; else if(k==='shift'||c===16)K.run=true;
    if (code==='KeyV'){ e.stopPropagation(); e.preventDefault(); toggleThirdPerson(); }
  }, true);
  addEventListener('keyup', e=>{
    const k=(e.key||'').toLowerCase(), c=e.keyCode||0;
    if(k==='w'||c===87)K.w=0; else if(k==='a'||c===65)K.a=0; else if(k==='s'||c===83)K.s=0; else if(k==='d'||c===68)K.d=0; else if(k==='shift'||c===16)K.run=false;
  }, true);

  // ---- FPS pointer-lock look ----
  (function initPointerLook(){
    const c = canvas(); if (!c) return;
    c.setAttribute('tabindex','0');
    addEventListener('mousemove', ev=>{
      const scn=S(); const cam=scn && scn.activeCamera;
      if (!cam || cam.name!=='FPCam') return;
      if (document.pointerLockElement !== c) return;
      cam._rot = cam._rot || new BABYLON.Vector2(0,0);
      cam._rot.y += -(ev.movementX||0)*MOUSE_SENS;
      cam._rot.x += -(ev.movementY||0)*MOUSE_SENS;
      cam._rot.x = clamp(cam._rot.x, -1.45, 1.45);
    }, true);
  })();

  // ---- Touch look/move (FPS only for look) ----
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
          cam._rot = cam._rot || new BABYLON.Vector2(0,0);
          cam._rot.y += -(t.clientX-rx)*TOUCH_SENS;
          cam._rot.x += -(t.clientY-ry)*TOUCH_SENS;
          cam._rot.x = clamp(cam._rot.x, -1.45, 1.45);
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

  // ---- Rig / Cameras ----
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

    // FPS: manual yaw/pitch; attachControl just to own pointer lock lifecycle
    let fps = scn.getCameraByName?.('FPCam');
    if (!fps){
      fps = new BABYLON.UniversalCamera('FPCam', new BABYLON.Vector3(0,HEAD_OFFSET,0), scn);
      fps.parent = scn.__playerRig; fps.minZ=0.1; fps.speed=0; fps.inertia=0;
      fps.inputs.clear(); // we steer via _rot
      scn.cameras.push(fps);
    }

    // TPS: ArcRotate with standard inputs (mouse rotates, wheel zooms) – no pointer lock
    let tps = scn.getCameraByName?.('TPCam');
    if (!tps){
      tps = new BABYLON.ArcRotateCamera('TPCam', -Math.PI/2, 1.15, TPS_RADIUS_DEFAULT, scn.__playerBody.position.clone(), scn);
      tps.lowerBetaLimit=0.3; tps.upperBetaLimit=1.45;
      tps.lowerRadiusLimit=2.6; tps.upperRadiusLimit=7.5;
      tps.wheelPrecision=60;
      tps.lockedTarget = scn.__playerBody;
      scn.cameras.push(tps);
    }

    // start FPS, attach controls
    setActiveFPS(scn, fps, tps, /*requestPointerLock*/ false);
    return {fps, tps};
  }

  function resolveSpawn(scn){
    const names = ['Index3','index3','Index_3','index_3','Index3_Start','index3_start','Spawn_Index3','spawn_index3','Van_Spawn','van_spawn','PlayerSpawn','Spawn','Start'];
    for (const n of names){
      const t = scn.getTransformNodeByName?.(n) || scn.getNodeByName?.(n);
      if (t){
        const pos=(t.getAbsolutePosition?.()||t.position||SPAWN_FALLBACK).clone();
        const gy=groundYAt(scn,pos.x,pos.z,pos.y); if(gy!=null) pos.y=gy+CAP_RADIUS+0.12;
        return pos;
      }
    }
    const pos=SPAWN_FALLBACK.clone(); const gy=groundYAt(scn,pos.x,pos.z,pos.y); if(gy!=null) pos.y=gy+CAP_RADIUS+0.12; return pos;
  }
  function groundYAt(scn,x,z,approxY){
    const from=new BABYLON.Vector3(x,(approxY??6)+20,z);
    const ray=new BABYLON.Ray(from,new BABYLON.Vector3(0,-1,0),200);
    const hit=scn.pickWithRay(ray,m=>{
      if(!m||m.isPickable===false) return false;
      const n=(m.name||'').toLowerCase(); if(/sky|cloud|probe|env|reflection|atmo/.test(n)) return false;
      return true;
    });
    return (hit&&hit.hit&&hit.pickedPoint)?hit.pickedPoint.y:null;
  }

  async function ensurePlayerMesh(scn){
    if (scn.__playerMesh) return scn.__playerMesh;
    const paths=["assets/models/player/main_player.glb","assets/models/player/player.glb"];
    for (const full of paths){
      try{
        const i=full.lastIndexOf('/'); const path=full.substring(0,i+1), file=full.substring(i+1);
        const r=await BABYLON.SceneLoader.ImportMeshAsync('', path, file, scn);
        const root=r.meshes && r.meshes[0]; if(!root) continue;
        root.parent=scn.__playerBody; root.position.set(0,-1.1,0); root.isPickable=false;
        scaleToHeight(root, TARGET_HEIGHT);
        scn.__playerAnims=r.animationGroups||[];
        return (scn.__playerMesh=root);
      }catch{}
    }
    return null;
  }
  function scaleToHeight(node, target){
    try{
      const bb=node.getHierarchyBoundingVectors?.(true);
      if(!bb) return;
      const h=bb.max.y-bb.min.y;
      const sf=target/Math.min(Math.max(h,0.01),1000);
      if(sf>0&&sf<10) node.scaling=new BABYLON.Vector3(sf,sf,sf);
    }catch{}
  }

  // ---- Movement helpers ----
  function yawToVec(yaw){ const s=Math.sin(yaw), c=Math.cos(yaw); return new BABYLON.Vector3(s,0,c); }
  function getFPSYaw(fps){ return (fps._rot?.y)||0; }
  function setBodyYaw(body, yaw){
    if(body.rotationQuaternion) body.rotationQuaternion.copyFrom(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,yaw));
    else { body.rotation=body.rotation||new BABYLON.Vector3(0,0,0); body.rotation.y=yaw; }
  }

  // ---- Camera mode switching ----
  function requestPointerLock(){ try{ canvas()?.requestPointerLock?.(); }catch{} }
  function exitPointerLock(){ try{ document.exitPointerLock?.(); }catch{} }

  function setActiveFPS(scn, fps, tps, requestLock=true){
    // detach TPS controls
    try{ tps?.detachControl?.(); }catch{}
    // set yaw continuity if coming from TPS
    if (scn.activeCamera === tps){
      const yaw = Math.PI/2 - (tps.alpha||0);
      fps._rot = fps._rot || new BABYLON.Vector2(0,0);
      fps._rot.y = yaw;
    }
    scn.activeCamera = fps; window.camera=fps;
    try{ fps.attachControl(canvas(), true); }catch{}
    if (requestLock) requestPointerLock();
  }
  function setActiveTPS(scn, fps, tps){
    // compute TPS orbit that matches current body yaw
    const yaw = getFPSYaw(fps);
    tps.lockedTarget = scn.__playerBody;
    tps.radius = clamp(tps.radius||TPS_RADIUS_DEFAULT, 3.0, 6.0);
    tps.beta   = clamp(tps.beta||1.15, 0.35, 1.45);
    tps.alpha  = Math.PI/2 - yaw;
    // align arc camera “position” instantly by forcing re-target
    tps.setTarget(scn.__playerBody.getAbsolutePosition?.()||scn.__playerBody.position);
    // attach standard mouse inputs (no pointer lock)
    exitPointerLock();
    try{ tps.attachControl(canvas(), true); }catch{}
    scn.activeCamera=tps; window.camera=tps;
  }

  function toggleThirdPerson(){
    const scn=S(); if(!scn) return;
    const fps=scn.getCameraByName?.('FPCam');
    const tps=scn.getCameraByName?.('TPCam');
    if (!fps || !tps) return;
    if (scn.activeCamera===fps) setActiveTPS(scn, fps, tps);
    else setActiveFPS(scn, fps, tps);
  }
  window.toggleThirdPerson = toggleThirdPerson;

  // ---- Main loop ----
  function attachLoop(scn){
    if (scn.__ppRigLoop_v5) return; scn.__ppRigLoop_v5=true;

    scn.onBeforeRenderObservable.add(()=>{
      const cam=scn.activeCamera; if(!cam) return;
      const body=scn.__playerBody; if(!body) return;

      // Compute yaw from current mode
      let yaw;
      if (cam.name==='FPCam'){
        cam._rot = cam._rot || new BABYLON.Vector2(0,0);
        yaw = cam._rot.y||0;
      } else {
        yaw = Math.PI/2 - (cam.alpha||0);
      }

      // Move body in yaw space
      const fw = yawToVec(yaw).normalize();
      const rt = BABYLON.Vector3.Cross(UP, fw).normalize();
      let v = new BABYLON.Vector3(0,0,0);
      if (K.w) v.addInPlace(fw);
      if (K.s) v.addInPlace(fw.scale(-1));
      if (K.d) v.addInPlace(rt);
      if (K.a) v.addInPlace(rt.scale(-1));
      const len=v.length();
      if (len>0) v.scaleInPlace(1/len);

      const eng=scn.getEngine?.() || window.ENGINE;
      const dt = Math.min(0.066, ((eng?.getDeltaTime?.()||16.7)/1000));

      setBodyYaw(body, yaw);

      if (len>0){
        const sp=(K.run?SPEED_RUN:SPEED_WALK)*dt;
        const d=v.scale(sp);
        try{ body.moveWithCollisions? body.moveWithCollisions(d) : body.position.addInPlace(d); }catch{}
      }

      // FPS camera sticks to head; we do NOT touch TPS camera position here
      if (cam.name==='FPCam'){
        const p = body.getAbsolutePosition?.() || body.position;
        const rig = scn.__playerRig; if (rig) rig.position.set(0,0,0);
        cam.position.set(p.x, p.y + HEAD_OFFSET, p.z);
      }

      // (Optional) simple anim switching
      try{
        const speedNow = len * (K.run?SPEED_RUN:SPEED_WALK);
        const groups=scn.__playerAnims||[];
        if (groups.length){
          const play = (want)=> groups.forEach(g=>{
            const nm=(g.name||'').toLowerCase();
            if (want==='idle')  { if(/idle|stand|breath/.test(nm)) g.start(true,1.0); else g.stop(); }
            if (want==='move')  { if(/run|walk|move/.test(nm)) g.start(true, K.run?1.2:1.0); else g.stop(); }
          });
          if (speedNow>0.05) play('move'); else play('idle');
        }
      }catch{}
    });
  }

  // ---- Boot ----
  (function boot(){
    const scn=S(); if (!scn) return requestAnimationFrame(boot);
    (async ()=>{
      await ensureRig(scn);
      await ensurePlayerMesh(scn);
      attachLoop(scn);
    })();
  })();

})();
