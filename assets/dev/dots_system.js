<script>
(function(){
  const DOTS = (window.DOTS = window.DOTS || { projectors:[] });
  let SCENE=null, ENGINE=null; let monitorDT=null, monitorWrite=(msg)=>{};
  function whenScene(cb){ (function w(){ if(window.scene){ cb(window.scene); } else requestAnimationFrame(w); })(); }

  function ensureMonitor(scene){
    if (monitorDT) return;
    const plane = BABYLON.MeshBuilder.CreatePlane('vanMonitor',{width:2.2,height:1.3}, scene);
    plane.position = new BABYLON.Vector3(0,1.6,22.8); plane.rotation.y = Math.PI; plane.isPickable=false;
    const mat = new BABYLON.StandardMaterial('vanMonitorMat', scene);
    mat.emissiveColor=new BABYLON.Color3(0.1,0.9,0.1); mat.diffuseColor=mat.specularColor=new BABYLON.Color3(0,0,0);
    plane.material=mat;
    monitorDT = new BABYLON.DynamicTexture('vanMonitorDT',{width:1024,height:512},scene,true);
    mat.emissiveTexture=monitorDT;
    const ctx = monitorDT.getContext();
    monitorWrite = function(msg){
      ctx.save();
      ctx.fillStyle='black'; ctx.fillRect(0,0,1024,512);
      ctx.fillStyle='#00ff88'; ctx.font='36px monospace'; ctx.textBaseline='top';
      ctx.fillText(msg, 40, 40); ctx.restore(); monitorDT.update();
    };
    monitorWrite('Camera: offline');
  }

  function ensureDotMaterial(scene){
    const m = new BABYLON.StandardMaterial('dotMat_shared', scene);
    m.emissiveColor=new BABYLON.Color3(0,1,0); m.disableLighting=true; m.specularColor=new BABYLON.Color3(0,0,0);
    return m;
  }
  function makeDotsGrid(scene, parent){
    const count=10, spacing=0.25, size=0.03;
    const mat=ensureDotMaterial(scene);
    const base=BABYLON.MeshBuilder.CreateSphere('dotBase',{diameter:size,segments:4},scene);
    base.material=mat; base.setEnabled(false); base.isPickable=false;
    const half=count/2;
    for(let ix=0;ix<count;ix++){
      for(let iz=0;iz<count;iz++){
        const inst=base.createInstance('dotInst'); inst.parent=parent; inst.isPickable=false;
        inst.position = new BABYLON.Vector3((ix-half)*spacing, 0.9, (iz-half)*spacing);
      }
    }
  }

  function aimPointOnGround(scene,maxDist=4){
    const cam=scene.activeCamera, ray=cam.getForwardRay(maxDist), pick=scene.pickWithRay(ray, m=>m?.isPickable!==false);
    return pick?.hit ? pick.pickedPoint : cam.position.add(ray.direction.scale(Math.min(maxDist,3.5)));
  }

  window.placeDotsProjector = function(){
    if (!SCENE) return;
    ensureMonitor(SCENE);
    const p=aimPointOnGround(SCENE,4.0);
    const node=new BABYLON.TransformNode('DOTS_Projector',SCENE); node.position = new BABYLON.Vector3(p.x,0,p.z);
    makeDotsGrid(SCENE,node);
    DOTS.projectors.push({node,radius:2.6,cooldown:0});
    try{ toast?.('DOTS projector placed'); }catch(_){}
  };

  function ghostInsideAny(){
    if (!DOTS.projectors.length) return null;
    const gpos = window.ghost?.position || BABYLON.Vector3.Zero();
    for(const p of DOTS.projectors){
      if (p.cooldown>0) continue;
      try{
        if (BABYLON.Vector3.Distance(gpos, p.node.position) < p.radius) return p;
      }catch(_){}
    }
    return null;
  }
  function apparition(atPos, onlyMonitor=false){
    const pos = atPos || (window.ghost?.position) || BABYLON.Vector3.Zero();
    if (onlyMonitor){ ensureMonitor(SCENE); monitorWrite('Camera: DOTS detected'); setTimeout(()=>monitorWrite('Camera: online'), 2000); return; }
    const plane = BABYLON.MeshBuilder.CreatePlane('dotsSil',{size:1.5}, SCENE);
    plane.position = new BABYLON.Vector3(pos.x,1.2,pos.z); plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y; plane.isPickable=false;
    const mat=new BABYLON.StandardMaterial('dotsSilMat',SCENE); mat.diffuseColor=mat.emissiveColor=new BABYLON.Color3(0,1,0); mat.alpha=0.0; plane.material=mat;
    let t=0; const h=SCENE.onBeforeRenderObservable.add(()=>{
      const dt=(ENGINE?.getDeltaTime?.()||16.7)/1000; t+=dt;
      mat.alpha = t<0.2? t*4.5 : Math.max(0, 1.0 - (t-0.2)*1.2);
      if (t>1.2){ try{ SCENE.onBeforeRenderObservable.remove(h); plane.dispose(); }catch(_){ } }
    });
  }

  whenScene(function(scene){
    SCENE=scene; ENGINE=scene.getEngine?.();
    scene.onBeforeRenderObservable.add(()=>{
      for(const p of DOTS.projectors) if (p.cooldown>0) p.cooldown=Math.max(0,p.cooldown-(ENGINE.getDeltaTime?.()/1000||0.016));
      const hit = ghostInsideAny(); if (!hit) return;
      if (typeof window.ghostHasEvidence==='function' && !ghostHasEvidence('dots')) return;

      const isGoryo = ((window.ghost?.type||'').toLowerCase()==='goryo');
      if (isGoryo){ apparition(window.ghost?.position, true); hit.cooldown=3.0; }
      else { apparition(window.ghost?.position, false); hit.cooldown=3.0; }
    });
  });
})();
</script>
