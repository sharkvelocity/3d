<!-- save as: ./assets/dev/util/player_rig_controller_final.js -->
<script>
/* Player Rig — single source of truth
   - ONE FPS camera + ONE optional TPS camera (toggle: V)
   - Mouse works (Babylon mouse input; no custom deltas)
   - Spawn from MAP_DEF.spawn or vanZone center; snap to ground
   - Body + camera always stay in sync (no rubberband)
   - No pointer-lock here (Start button already handles it)
*/
(function(){
  if (window.__PP_RIG__) return; window.__PP_RIG__ = true;

  const PP = window.PP || (window.PP = {});
  PP.rig = PP.rig || {};
  const STATE = {
    mode: "fps",       // 'fps' | 'tps'
    speedWalk: 2.2,
    speedRun:  4.0,
    strideWalk: 1.25,  // for footsteps
    strideRun:  0.85,
  };

  // --- helpers ---
  function S(){ return window.SCENE || BABYLON.Engine?.LastCreatedScene || null; }
  function E(){ return window.ENGINE || BABYLON.Engine?.LastCreatedEngine || null; }
  const v3 = (x=0,y=0,z=0)=> new BABYLON.Vector3(x,y,z);

  function hudXYZAttach(cam){
    try{
      const hud = document.getElementById('hud-xyz');
      if (!hud) return;
      hud.style.display = 'block';
      const x = document.getElementById('hud-x');
      const y = document.getElementById('hud-y');
      const z = document.getElementById('hud-z');
      const scn = S();
      scn.onBeforeRenderObservable.add(()=>{
        const p = cam.position;
        if (x) x.textContent = p.x.toFixed(2);
        if (y) y.textContent = p.y.toFixed(2);
        if (z) z.textContent = p.z.toFixed(2);
      });
    }catch{}
  }

  // Ground snap via ray
  function groundYAt(x,z,approxY=3){
    const scn=S(); if(!scn) return null;
    const from = new BABYLON.Vector3(x, approxY + 30, z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,-1,0), 200);
    const pick = scn.pickWithRay(ray, (m)=>{
      if (!m) return false;
      if (m.isPickable === false) return false;
      const n=(m.name||'').toLowerCase();
      if (/sky|atmo|cloud|probe|env|reflection/.test(n)) return false;
      return true;
    });
    return (pick?.hit && pick.pickedPoint) ? pick.pickedPoint.y : null;
  }

  function centerOfPolygon2D(poly){
    if (!Array.isArray(poly) || poly.length === 0) return {x:0,z:0};
    let sx=0, sz=0;
    for (const p of poly){ sx += +p.x||0; sz += +p.z||0; }
    const n = poly.length;
    return { x: sx/n, z: sz/n };
  }

  function resolveSpawn(){
    const d = window.MAP_DEF || {};
    const camY = 1.8;
    let sp;
    if (d.spawn && typeof d.spawn === 'object'){
      sp = { x:+d.spawn.x||0, y: (+d.spawn.y||camY), z:+d.spawn.z||0 };
    } else if (Array.isArray(d.vanZone) && d.vanZone.length>=3){
      const c = centerOfPolygon2D(d.vanZone);
      sp = { x:c.x, y:camY, z:c.z };
    } else {
      sp = { x:0, y:camY, z:0 };
    }
    // ground snap
    const gy = groundYAt(sp.x, sp.z, sp.y);
    if (gy != null) sp.y = gy + 0.9;  // eye ~1.8 with ellipsoid offset
    return sp;
  }

  function attachMouseKeyboard(cnv, cam){
    // full reset to avoid double-input fights
    cam.inputs.clear();
    cam.inputs.addMouse();     // Babylon's built-in mouse look
    cam.inputs.addKeyboard();  // WASD/Arrows for fallback
    cam.attachControl(cnv, true);
  }

  // --- build rig once ---
  function buildRig(){
    const scn=S(); if (!scn) return setTimeout(buildRig, 100);
    const eng=E(); if (!eng) return setTimeout(buildRig, 100);
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) return setTimeout(buildRig, 100);

    // Body (invisible, collision capsule for TPS target and consistency)
    const body = scn.__playerBody || BABYLON.MeshBuilder.CreateCapsule('player_capsule',{
      height:1.8, radius:0.35, tessellation:8, capSubdivisions:4
    }, scn);
    body.checkCollisions = true;
    body.isPickable = false;
    body.visibility = 0;

    // FPS camera — authoritative for movement
    const fps = scn.getCameraByName('FPCam') || new BABYLON.UniversalCamera('FPCam', v3(0,1.8,0), scn);
    fps.minZ = 0.1;
    fps.inertia = 0;
    fps.applyGravity = true;
    fps.checkCollisions = true;
    fps.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    fps.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    attachMouseKeyboard(canvas, fps);

    // TPS (optional) — follows body; we don’t let ArcRotate control position directly
    const tps = scn.getCameraByName('TPCam') || new BABYLON.ArcRotateCamera('TPCam', -Math.PI/2, 1.2, 3.6, body.position.clone(), scn);
    tps.lowerBetaLimit=0.3;  tps.upperBetaLimit=1.45;
    tps.lowerRadiusLimit=2.4; tps.upperRadiusLimit=7.5;
    tps.wheelPrecision=60;
    tps.lockedTarget = body;  // always target body

    // spawn
    const sp = resolveSpawn();
    body.position.set(sp.x, sp.y-1.4, sp.z); // body origin ~feet; FPS eye at 1.8
    fps.position.set(sp.x, sp.y, sp.z);
    scn.activeCamera = fps;
    window.camera = fps;

    hudXYZAttach(fps);

    // movement (uses PP.controls flags if present, else keyboard fallback)
    const flags = (PP.state = PP.state || {}).controls = (PP.state.controls || {
      forward:false, back:false, left:false, right:false
    });

    // local fallback keys (non-capturing)
    const localKeys = {w:0,a:0,s:0,d:0,run:false};
    function kd(e){
      const k=(e.key||'').toLowerCase();
      if(k==='w')localKeys.w=1; if(k==='a')localKeys.a=1; if(k==='s')localKeys.s=1; if(k==='d')localKeys.d=1;
      if(e.code==='ShiftLeft'||e.code==='ShiftRight') localKeys.run=true;
      if(e.code==='KeyV') toggleView();  // toggle TPS/FPS
    }
    function ku(e){
      const k=(e.key||'').toLowerCase();
      if(k==='w')localKeys.w=0; if(k==='a')localKeys.a=0; if(k==='s')localKeys.s=0; if(k==='d')localKeys.d=0;
      if(e.code==='ShiftLeft'||e.code==='ShiftRight') localKeys.run=false;
    }
    window.addEventListener('keydown', kd, {passive:true});
    window.addEventListener('keyup',   ku, {passive:true});

    function want(k){ return !!(flags[k]) || !!(localKeys[({forward:'w',back:'s',left:'a',right:'d'})[k]]); }
    function running(){ return !!PP.state.running || !!localKeys.run; }

    function forwardXZ(cam){
      const f = cam.getFrontPosition(1).subtract(cam.position);
      f.y = 0; if (f.length() > 1e-4) f.normalize();
      return f;
    }
    function rightXZ(cam){
      const f = forwardXZ(cam);
      const r = BABYLON.Vector3.Cross(BABYLON.Axis.Y, f);
      if (r.length() > 1e-4) r.normalize();
      return r;
    }

    // Authoritative movement loop (applies to FPS camera only; TPS reads body)
    scn.onBeforeRenderObservable.add(()=>{
      // Ensure active camera stays synced with mode
      if (STATE.mode === 'fps' && scn.activeCamera !== fps) scn.activeCamera = fps;
      if (STATE.mode === 'tps' && scn.activeCamera !== tps) scn.activeCamera = tps;

      // Drive FPS camera with collisions
      const cam = fps;
      let v = v3();
      const fw = forwardXZ(cam), rt = rightXZ(cam);
      if (want('forward')) v.addInPlace(fw);
      if (want('back'))    v.addInPlace(fw.scale(-1));
      if (want('right'))   v.addInPlace(rt);
      if (want('left'))    v.addInPlace(rt.scale(-1));

      const len = v.length();
      if (len > 0){
        v.scaleInPlace(1/len);
        const dt = (E()?.getDeltaTime?.() || 16.7) / 1000;
        const sp = (running()? STATE.speedRun : STATE.speedWalk) * dt;
        const d = v.scale(sp);
        try { cam.cameraDirection ? cam.cameraDirection.addInPlace(d) : cam.position.addInPlace(d); } catch {}
      }

      // Keep body glued to FPS camera horizontally; snap Y from ground
      body.position.x = fps.position.x;
      body.position.z = fps.position.z;
      const gy = groundYAt(body.position.x, body.position.z, fps.position.y);
      if (gy != null) body.position.y = gy - 0.0; // keep capsule feet on ground

      // TPS camera follows body via ArcRotate target — no rubberband
      tps.target = body;
    });

    // Toggle view
    function toggleView(){
      if (STATE.mode === 'fps'){
        // place TPS orbit around current body position
        tps.target = body;
        tps.radius = Math.min(Math.max(tps.radius||3.6, 3.0), 6.0);
        tps.alpha  = -Math.PI/2;
        tps.beta   = 1.2;
        scn.activeCamera = tps;
        STATE.mode = 'tps';
      } else {
        // snap FPS to body position
        fps.position.copyFrom(body.position.add(new BABYLON.Vector3(0, 1.8, 0)));
        scn.activeCamera = fps;
        STATE.mode = 'fps';
      }
      window.camera = scn.activeCamera;
      try { document.getElementById('renderCanvas')?.focus?.(); } catch {}
    }

    PP.rig.body = body;
    PP.rig.fps  = fps;
    PP.rig.tps  = tps;
    PP.rig.toggleView = toggleView;

    // expose a clean respawn you can call anytime
    PP.rig.respawn = function(){
      const sp = resolveSpawn();
      body.position.set(sp.x, sp.y-1.4, sp.z);
      fps.position.set(sp.x, sp.y, sp.z);
    };

    // Recenter once at start if a “pp:start” is used by your Start button
    window.addEventListener('pp:start', ()=> setTimeout(PP.rig.respawn, 50), { once:true });
  }

  // defer until Babylon scene exists
  (function wait(){ if (S()) buildRig(); else setTimeout(wait, 60); })();
})();
</script>
