// salt_system.js
// Salt placement and disturbance → UV footprints

(function(){
  'use strict';
  if (window.SaltSystem) return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const SALT_LINES = [];
  let charges = 6;

  function aimPoint(maxDist=3.8){
    const s=SCENE(); const cam = s?.activeCamera;
    if (!cam) return new BABYLON.Vector3(0,0,0);
    const ray = cam.getForwardRay(maxDist);
    const pick = s.pickWithRay(ray, m=>m && m.isPickable!==false);
    if (pick?.hit) return pick.pickedPoint;
    const ahead = cam.position.add(ray.direction.scale(Math.min(maxDist, 3.5)));
    ahead.y = 0.02; return ahead;
  }

  function place(){
    const s=SCENE(); if (!s) return;
    if (charges<=0){ try{ toast?.('Out of salt'); }catch(_){ } return; }
    const center = aimPoint(3.8);
    const fwd = s.activeCamera.getForwardRay().direction;
    const yaw = Math.atan2(fwd.z, fwd.x);
    const half = 0.6;
    const a = new BABYLON.Vector3(center.x - Math.cos(yaw)*half, 0.01, center.z - Math.sin(yaw)*half);
    const b = new BABYLON.Vector3(center.x + Math.cos(yaw)*half, 0.01, center.z + Math.sin(yaw)*half);
    const mesh = BABYLON.MeshBuilder.CreateTube('salt_line', {path:[a,b], radius:0.05, tessellation:4}, s);
    const mat = new BABYLON.StandardMaterial('salt_mat', s);
    mat.diffuseColor = new BABYLON.Color3(0.95,0.95,0.95);
    mat.specularColor = new BABYLON.Color3(0.2,0.2,0.2);
    mat.emissiveColor = new BABYLON.Color3(0.05,0.05,0.05);
    mat.alpha = 0.9;
    mesh.material = mat;
    SALT_LINES.push({mesh, a, b, disturbed:false, mat});
    charges--;
    try{ toast?.('Salt line placed ('+charges+' left)'); }catch(_){}
  }

  function distAt(pos){
    function pointToSegDistance(p, a, b){
      const ap = p.subtract(a);
      const ab = b.subtract(a);
      const ab2 = ab.x*ab.x + ab.z*ab.z + 1e-9;
      const t = Math.max(0, Math.min(1, (ap.x*ab.x + ap.z*ab.z) / ab2));
      const proj = new BABYLON.Vector3(a.x + ab.x*t, p.y, a.z + ab.z*t);
      const dx = p.x - proj.x, dz = p.z - proj.z;
      return Math.sqrt(dx*dx + dz*dz);
    }
    for (const s of SALT_LINES){
      if (s.disturbed) continue;
      const d = pointToSegDistance(pos, s.a, s.b);
      if (d < 0.18){
        s.disturbed = true;
        try{
          const ps = new BABYLON.ParticleSystem('saltPuff', 400, SCENE());
          ps.particleTexture = new BABYLON.Texture('./assets/images/particles/smoke.png', SCENE());
          ps.emitter = s.mesh;
          ps.minSize = 0.02; ps.maxSize = 0.08;
          ps.minEmitPower = 0.4; ps.maxEmitPower = 1.0;
          ps.emitRate = 600; ps.targetStopDuration = 0.35;
          ps.color1 = new BABYLON.Color4(1,1,1,0.8);
          ps.color2 = new BABYLON.Color4(1,1,1,0.4);
          ps.colorDead = new BABYLON.Color4(1,1,1,0);
          ps.start();
          setTimeout(()=>{ try{ps.stop(); ps.dispose(); } catch(_){ } }, 800);
        }catch(_){}
        if (window._shouldLeaveUVFromSalt ? window._shouldLeaveUVFromSalt() : true){
          try{ UVPrints.addStepPair(pos, 0); }catch(_){}
        }
      }
    }
  }

  function attachLoop(){
    const s=SCENE(); if (!s){ setTimeout(attachLoop, 120); return; }
    s.onBeforeRenderObservable.add(()=>{
      try{ distAt(s.activeCamera.position.clone()); }catch(_){}
    });
  }
  attachLoop();

  window.SaltSystem = { place, disturbAt: distAt };
  window.placeSalt = place; // convenience
})();
