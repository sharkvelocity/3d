
/**
 * Modular key bindings wired to your existing systems.
 * Safe to include after your core modules (player rig, ghost logic, UI).
 * It only calls functions if they exist.
 */
(function(){
  if (window.__PP_BINDINGS__) return; window.__PP_BINDINGS__ = true;
  const PP = window.PP || (window.PP = {});
  const C  = (PP.controls = PP.controls || {});
  const Keys = Object.create(null);

  const has = (arr, code)=> Array.isArray(arr) && arr.includes(code);

  // Keep an eye on active scene/camera for a few helpers
  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }

  // Selection helpers
  function selectSlot(n){
    PP.state = PP.state || { selectedSlot:1 };
    PP.state.selectedSlot = n;
    if (typeof window.selectSlot === 'function') window.selectSlot(n);
    if (typeof window.buildBelt === 'function') try{ window.buildBelt(null); }catch{}
    if (typeof window.refreshCameraOverlay === 'function') try{ window.refreshCameraOverlay(); }catch{}
  }

  // Light helpers
  function syncHeldLights(){ if (typeof window.syncHeldLights === 'function') window.syncHeldLights(); }
  function toggleNearestHouseLight(){ if (typeof window.toggleNearestHouseLight === 'function') window.toggleNearestHouseLight(); }
  function setHousePower(on){ if (typeof window.setHousePower === 'function') window.setHousePower(on); }

  // Core input flags for movement rigs that read global state (optional)
  const flags = (PP.state.controls = PP.state.controls || { forward:false, back:false, left:false, right:false });

  // Keydown
  addEventListener('keydown', (e)=>{
    Keys[e.code] = true;
    // Movement flags (WASD + arrows)
    if (has(C.keys?.forward, e.code)) flags.forward = true;
    if (has(C.keys?.back,    e.code)) flags.back    = true;
    if (has(C.keys?.left,    e.code)) flags.left    = true;
    if (has(C.keys?.right,   e.code)) flags.right   = true;
    if (has(C.keys?.sprint,  e.code)) PP.state.running = true;

    // Slots 1-5
    if (C.keys?.slots?.includes(e.code)){
      const n = parseInt(e.code.replace(/\D/g,''), 10);
      if (n>=1 && n<=5) selectSlot(n);
    }

    // Discrete actions
    if (has(C.keys?.notebook, e.code) && typeof window.openNotebook === 'function') window.openNotebook();
    if (has(C.keys?.openDoor, e.code) && typeof window.openDoorNearby === 'function') window.openDoorNearby();
    if (has(C.keys?.use,      e.code) && typeof window.useActiveItem === 'function') window.useActiveItem();
    if (has(C.keys?.minimap,  e.code) && typeof window.toggleMinimap === 'function') window.toggleMinimap();

    if (has(C.keys?.flash, e.code)){ window.flashOn = !window.flashOn; window.uvOn=false; window.irOn=false; syncHeldLights(); }
    if (has(C.keys?.uv,    e.code)){ window.uvOn = !window.uvOn; window.flashOn=false; window.irOn=false; syncHeldLights(); }
    if (has(C.keys?.ir,    e.code)){ window.irOn = !window.irOn; window.flashOn=false; window.uvOn=false; syncHeldLights(); if (typeof window.refreshCameraOverlay==='function') window.refreshCameraOverlay(); }
    if (has(C.keys?.lightToggle, e.code)) toggleNearestHouseLight();
    if (has(C.keys?.powerToggle, e.code)) setHousePower(!(window.housePower===false?false:true));
  }, true);

  // Keyup
  addEventListener('keyup', (e)=>{
    Keys[e.code] = false;
    if (has(C.keys?.forward, e.code)) flags.forward = false;
    if (has(C.keys?.back,    e.code)) flags.back    = false;
    if (has(C.keys?.left,    e.code)) flags.left    = false;
    if (has(C.keys?.right,   e.code)) flags.right   = false;
    if (has(C.keys?.sprint,  e.code)) PP.state.running = false;
  }, true);

  // Optional: footstep pacing helper if your rig doesn't emit steps
  (function footsteps(){
    const s = S(); if (!s || !s.activeCamera) return setTimeout(footsteps, 200);
    const cam = s.activeCamera, st = { last:null, acc:0 };
    function tick(){
      const now = cam.position.clone();
      if (!st.last) st.last = now;
      const d = BABYLON.Vector3.Distance(now, st.last);
      st.last = now;
      const moving = flags.forward || flags.back || flags.left || flags.right;
      if (moving){
        st.acc += d;
        const stride = (PP.state.running ? (PP.controls.strideRun||0.8) : (PP.controls.strideWalk||1.2));
        if (st.acc >= stride){
          st.acc = 0;
          if (typeof window.playStep === 'function') try{ window.playStep(0.42); }catch{}
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  // Export handy accessors in case other modules want them
  PP.getMovementFlags = ()=> ({...flags, running: !!PP.state.running});
  PP.getSpeeds = ()=> ({ walk: PP.controls.speedWalk||0.9, run: PP.controls.speedRun||1.8 });
})();
