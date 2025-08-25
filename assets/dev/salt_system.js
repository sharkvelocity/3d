<script>
(function(){
  const SALT = (window.SaltSystem = window.SaltSystem || {});
  let SCENE=null, ENGINE=null;
  const LINES=[]; let charges=6;

  function whenScene(cb){ (function w(){ if(window.scene){ cb(window.scene); } else requestAnimationFrame(w); })(); }
  function aimForward(maxDist=3.8){
    try{
      const cam=SCENE.activeCamera, ray=cam.getForwardRay(maxDist), pick=SCENE.pickWithRay(ray,m=>m&&m.isPickable!==false);
      return pick?.hit ? pick.pickedPoint : cam.position.add(ray.direction.scale(Math.min(maxDist,3.5)));
    }catch(_){ return new BABYLON.Vector3(0,0,0); }
  }
  function lineDist(p,a,b){
    const ap=p.subtract(a), ab=b.subtract(a); const ab2=ab.x*ab.x+ab.z*ab.z+1e-9;
    const t=Math.max(0,Math.min(1,(ap.x*ab.x+ap.z*ab.z)/ab2));
    const proj=new BABYLON.Vector3(a.x+ab.x*t,p.y,a.z+ab.z*t); return Math.hypot(p.x-proj.x,p.z-proj.z);
  }
  function place(){
    if (charges<=0) { try{ toast?.('Out of salt'); }catch(_){ } return; }
    const c=aimForward(4.0);
    const forward=SCENE.activeCamera.getForwardRay().direction;
    const yaw=Math.atan2(forward.z,forward.x), half=0.6;
    const a=new BABYLON.Vector3(c.x-Math.cos(yaw)*half, 0.01, c.z-Math.sin(yaw)*half);
    const b=new BABYLON.Vector3(c.x+Math.cos(yaw)*half, 0.01, c.z+Math.sin(yaw)*half);
    const path=[a,b];
    const mesh=BABYLON.MeshBuilder.CreateTube('salt_line',{path,radius:0.05,tessellation:4},SCENE);
    const mat=new BABYLON.StandardMaterial('salt_mat',SCENE);
    mat.diffuseColor=new BABYLON.Color3(0.95,0.95,0.95); mat.specularColor=new BABYLON.Color3(0.2,0.2,0.2);
    mat.emissiveColor=new BABYLON.Color3(0.05,0.05,0.05); mat.alpha=0.9; mesh.material=mat;
    LINES.push({mesh,a,b,disturbed:false,mat});
    charges--;
    try{ toast?.(`Salt line placed (${charges} left)`); }catch(_){}
  }
  function puffAt(mesh){
    try{
      const ps=new BABYLON.ParticleSystem('saltPuff',400,SCENE);
      ps.particleTexture=new BABYLON.Texture('./assets/images/particles/smoke.png',SCENE);
      ps.emitter=mesh; ps.minSize=0.02; ps.maxSize=0.08; ps.minEmitPower=0.4; ps.maxEmitPower=1.0;
      ps.emitRate=600; ps.targetStopDuration=0.35; ps.color1=new BABYLON.Color4(1,1,1,0.8); ps.color2=new BABYLON.Color4(1,1,1,0.4); ps.colorDead=new BABYLON.Color4(1,1,1,0);
      ps.start(); setTimeout(()=>{ try{ ps.stop(); ps.dispose(); }catch(_){ } },800);
    }catch(_){}
  }
  function shouldLeaveUV(){
    try{
      if (!window.ghostHasEvidence || !ghostHasEvidence('uv')) return false;
      const gt=(window.ghost?.type||'').toLowerCase();
      if (gt==='wraith') return false;
      if (gt==='obake' && Math.random()<0.30) return false;
      return true;
    }catch(_){ return false; }
  }
  function disturb(pos){
    for (const s of LINES){
      if (s.disturbed) continue;
      if (lineDist(pos, s.a, s.b) < 0.18){
        s.disturbed=true; puffAt(s.mesh);
        try{ s.mat.emissiveColor=new BABYLON.Color3(0.01,0.01,0.01); s.mat.alpha=0.8; }catch(_){}
        if (shouldLeaveUV() && window.UVPrints?.addStepPair){
          const yaw=Math.random()*Math.PI*2;
          UVPrints.addStepPair(pos, yaw);
        }
      }
    }
  }

  SALT.place = place;
  SALT._disturbAt = disturb; // public in case other systems need to trigger

  whenScene(function(scene){
    SCENE=scene; ENGINE=scene.getEngine?.();
    // Ghost passes salt?
    scene.onBeforeRenderObservable.add(()=>{
      try{
        const gpos = window.ghost?.position || BABYLON.Vector3.Zero();
        disturb(gpos);
      }catch(_){}
    });
  });
})();
</script>
