(function(){
  // Ensures a solid floor at origin (0,0,0) exists and is enabled only if no ground is detected.
  let floor = null;
  function ensureScene(){
    return (typeof BABYLON !== 'undefined') && window.scene && window.camera;
  }
  function makeFloor(){
    if (floor || !ensureScene()) return floor;
    try{
      floor = BABYLON.MeshBuilder.CreateGround("origin_floor", {width:40, height:40, subdivisions:2}, scene);
      const m = new BABYLON.StandardMaterial("origin_floor_mat", scene);
      m.diffuseColor = new BABYLON.Color3(0.1,0.18,0.2);
      m.emissiveColor = new BABYLON.Color3(0.02,0.04,0.05);
      m.alpha = 0.85; // faint but visible
      floor.material = m;
      floor.position = new BABYLON.Vector3(0, 0, 0);
      floor.isPickable = false;
      floor.checkCollisions = false;     // enabled only when needed
      floor.receiveShadows = true;
      try{ if(window.sunShadows) sunShadows.addShadowCaster(floor, true); if(window.moonShadows) moonShadows.addShadowCaster(floor, true); }catch(_){}
    }catch(e){ console.warn('[origin-floor] create failed', e); }
    return floor;
  }
  function groundCheck(){
    if(!ensureScene()) return;
    makeFloor();
    if(!floor) return;
    try{
      const from = camera.position.add(new BABYLON.Vector3(0, 0.2, 0));
      const ray = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 5.0);
      const hit = scene.pickWithRay(ray, m => (m && m !== floor && m.getClassName && m.getClassName()!=='TransformNode'));
      if(!hit || !hit.hit){
        floor.checkCollisions = true;
        floor.isVisible = true;
        try{ window.toast && toast('Fallback floor enabled at origin'); }catch(_){}
      } else {
        floor.checkCollisions = false;
        floor.isVisible = false;
      }
    }catch(e){ console.warn('[origin-floor] check failed', e); }
  }

  // Wrap applySpawn so the check runs right after spawn is positioned
  function hookApplySpawn(){
    try{
      if(typeof window.applySpawn === 'function' && !window.__originFloorHooked){
        const orig = window.applySpawn;
        window.applySpawn = async function(){
          const r = await orig.apply(this, arguments);
          try{ makeFloor(); groundCheck(); }catch(_){}
          return r;
        };
        window.__originFloorHooked = true;
      }
    }catch(e){}
  }

  // Key 'O' toggles visibility for debugging
  function bindToggle(){
    document.addEventListener('keydown', (e)=>{
      if((e.key||'').toLowerCase()==='o'){
        if(!ensureScene()) return;
        makeFloor();
        if(floor){ floor.isVisible = !floor.isVisible; try{ window.toast && toast('Origin floor: ' + (floor.isVisible?'ON':'OFF')); }catch(_){}} 
      }
    }, {passive:false});
  }

  // Poll until scene && camera exist, then hook and run initial check
  function boot(){
    if(!ensureScene()){ setTimeout(boot, 120); return; }
    makeFloor();
    hookApplySpawn();
    bindToggle();
    // Also run a delayed check in case spawn happened before we hooked
    setTimeout(groundCheck, 400);
  }
  boot();
})();