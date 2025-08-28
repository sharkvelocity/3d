// dots_system.js
// DOTS projectors + van monitor, Goryo camera-only behavior supported via ghost_db flag.

(function(){
  'use strict';
  if (window.DOTS) return;
  const DOTS = window.DOTS = { projectors:[], monitorPlane:null, monitorText:null, tripod:null, _mat:null };

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  function say(msg){ try{ toast?.(msg); }catch(_){ console.log('[DOTS]', msg); } }

  function ensureMat(){
    if (DOTS._mat) return DOTS._mat;
    const s=SCENE(); if (!s) return null;
    const mat = new BABYLON.StandardMaterial('dotMat_shared', s);
    mat.emissiveColor = new BABYLON.Color3(0,1,0);
    mat.disableLighting = true;
    mat.specularColor = new BABYLON.Color3(0,0,0);
    DOTS._mat = mat; return mat;
  }

  function makeGrid(node){
    const s=SCENE(); if (!s) return;
    const countX=10, countZ=10, spacing=0.25, size=0.03;
    const base = BABYLON.MeshBuilder.CreateSphere('dotBase',{diameter:size, segments:4}, s);
    base.material = ensureMat(); base.isPickable = false; base.setEnabled(false);
    const halfX=(countX/2), halfZ=(countZ/2);
    for(let ix=0; ix<countX; ix++) for(let iz=0; iz<countZ; iz++){
      const inst = base.createInstance('dotInst'); inst.isPickable=false;
      inst.parent = node;
      inst.position = new BABYLON.Vector3((ix-halfX)*spacing, 0.9, (iz-halfZ)*spacing);
    }
  }

  function aimPointOnGround(maxDist=4){
    try{
      const s=SCENE(); const cam=s?.activeCamera;
      const origin = cam?.position ?? new BABYLON.Vector3(0,1.8,0);
      const ray = cam?.getForwardRay?.(maxDist) ?? new BABYLON.Ray(origin, new BABYLON.Vector3(0,0,1), maxDist);
      const pick = s?.pickWithRay?.(ray, m => m?.isPickable !== false);
      if (pick?.hit) return pick.pickedPoint;
    }catch(_){}
    return (SCENE()?.activeCamera?.position?.clone?.()) || new BABYLON.Vector3(0,1.8,0);
  }

  function ensureMonitor(){
    if (DOTS.monitorPlane) return;
    const s=SCENE(); if (!s) return;
    const plane = BABYLON.MeshBuilder.CreatePlane('vanMonitor',{width:2.2,height:1.3}, s);
    plane.position = new BABYLON.Vector3(0,1.6,22.8);
    plane.rotation.y = Math.PI;

    const mat = new BABYLON.StandardMaterial('vanMonitorMat', s);
    mat.emissiveColor = new BABYLON.Color3(0.1,0.9,0.1);
    mat.diffuseColor = mat.specularColor = new BABYLON.Color3(0,0,0);
    plane.material = mat;

    const dyn = new BABYLON.DynamicTexture('vanMonitorDT', {width:1024,height:512}, s, true);
    mat.emissiveTexture = dyn;
    const ctx = dyn.getContext();
    DOTS.monitorText = (msg)=>{
      ctx.save();
      ctx.fillStyle = 'black'; ctx.fillRect(0,0,1024,512);
      ctx.fillStyle = '#00ff88'; ctx.font = '36px monospace'; ctx.textBaseline = 'top';
      ctx.fillText(msg, 40, 40);
      ctx.restore();
      dyn.update();
    };
    DOTS.monitorPlane = plane;
    DOTS.monitorText('Camera: offline');
  }

  function ensureTripodAt(p){
    if (DOTS.tripod) return DOTS.tripod;
    const s=SCENE(); if (!s) return;
    const n = DOTS.tripod = new BABYLON.TransformNode('TripodCam', s);
    n.position = new BABYLON.Vector3(p.x,1.4,p.z);
    const pole = BABYLON.MeshBuilder.CreateCylinder('tripodPole',{height:1.4,diameter:0.06}, s);
    const head = BABYLON.MeshBuilder.CreateBox('tripodHead',{size:0.12}, s);
    const m = new BABYLON.StandardMaterial('tripodMat', s);
    m.emissiveColor = new BABYLON.Color3(0.05,0.2,0.2);
    pole.material = m; head.material = m;
    pole.parent=n; head.parent=n; pole.position.y = -0.7;
    return n;
  }

  window.placeDotsProjector = function(){
    const s=SCENE(); if (!s) return;
    const p = aimPointOnGround(4.0);
    const node = new BABYLON.TransformNode('DOTS_Projector', s);
    node.position = new BABYLON.Vector3(p.x, 0, p.z);
    makeGrid(node);
    DOTS.projectors.push({ node, radius:2.6, cooldown:0 });
    say('DOTS projector placed');
  };

  window.placeVideoCam = function(){
    ensureMonitor();
    const p = aimPointOnGround(4.0);
    ensureTripodAt(p);
    DOTS.monitorText?.('Camera: online');
  };

  function ghostHasDots(){
    try{ return typeof window.ghostHasEvidence==='function' ? ghostHasEvidence('dots') : true; }catch(_){ return true; }
  }

  function goryoCameraOnly(){
    try{
      const t=(window.ghost?.type||'').toLowerCase();
      const rec = (window.GHOST_DB||[]).find(g=>(g.name||'').toLowerCase()===t);
      return !!rec?.dotsCameraOnly;
    }catch(_){ return false; }
  }

  function update(dt){
    for (const p of DOTS.projectors) if (p.cooldown>0) p.cooldown = Math.max(0, p.cooldown - dt);
    if (!DOTS.projectors.length) return;

    const s=SCENE(); const gpos = window.ghost?.position || BABYLON.Vector3.Zero();
    const hit = DOTS.projectors.find(p => {
      try{ return BABYLON.Vector3.Distance(gpos, p.node.position) < p.radius && p.cooldown<=0; }catch(_){ return false; }
    });
    if (!hit || !ghostHasDots()) return;

    if (goryoCameraOnly()){
      if (DOTS.tripod){ DOTS.monitorText?.('Camera: DOTS detected'); setTimeout(()=>DOTS.monitorText?.('Camera: online'), 2000); hit.cooldown=3.0; }
    } else {
      // green silhouette
      const plane = BABYLON.MeshBuilder.CreatePlane('dotsSil',{size:1.5}, s);
      plane.position = new BABYLON.Vector3(gpos.x, 1.2, gpos.z);
      plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
      const mat = new BABYLON.StandardMaterial('dotsSilMat', s);
      mat.diffuseColor = mat.emissiveColor = new BABYLON.Color3(0,1,0);
      mat.alpha = 0.0; plane.material = mat;
      let t=0;
      const eng=s.getEngine?.()||BABYLON.Engine?.LastCreatedEngine;
      const h = s.onBeforeRenderObservable.add(()=>{
        const dt = ((eng?.getDeltaTime?.()||16.7)/1000);
        t += dt;
        mat.alpha = t < 0.2 ? t*4.5 : Math.max(0, 1.0 - (t-0.2)*1.2);
        if (t > 1.2){
          try{ s.onBeforeRenderObservable.remove(h); plane.dispose(); }catch(_){}
        }
      });
      hit.cooldown=3.0;
    }
  }

  (function hook(){
    const s=SCENE(); if (!s){ setTimeout(hook, 120); return; }
    const eng=s.getEngine?.()||BABYLON.Engine?.LastCreatedEngine;
    s.onBeforeRenderObservable.add(()=>{
      const dt=((eng?.getDeltaTime?.()||16.7)/1000);
      try{ update(dt); }catch(_){}
    });
  })();
})();

/* ---- Storage registration (DOTS item) ---- */
(function(){
  if (!window.registerItem) return; // Storage bridge not loaded yet
  registerItem({
    id: "dots",
    name: "DOTS",
    icon: "./assets/icons/dots.png",
    defaultCharges: Infinity,
    onEquip(){ /* no-op; place with key below or via DevTools */ }
  });

  // Optional hotkey: V to place a DOTS projector when equipped
  if (!window.__DOTS_keybound){
    window.__DOTS_keybound = true;
    window.addEventListener("keydown", (e)=>{
      if ((e.key === "v" || e.key === "V") && window.inventory){
        const slot = window.activeItemSlot || 1;
        if (window.inventory.slots?.[slot] === "DOTS"){
          try{ window.placeDotsProjector?.(); }catch(_){}
        }
      }
    });
  }
})();
