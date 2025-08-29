// ./assets/index3/ui_input.js
// Input, action bar wiring (Use/Drop/Throw), basic movement + common hotkeys.

(function(){
  "use strict";

  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAM    = ()=> window.camera;

  // ---- Movement state ----
  const keys = { w:false, a:false, s:false, d:false, shift:false };
  let footTimer = 0;

  // ---- Helpers ----
  const toast = (...a)=> window.toast ? window.toast(...a) : console.log('[toast]', ...a);
  function activeItemName(){
    try{ return (window.inventory?.slots?.[window.activeItemSlot] || null); }catch(_){ return null; }
  }
  function normalizeName(n){ return (n||'').toLowerCase().replace(/\s+/g,''); }

  // ---- ACTIONS: Use / Drop / Throw ----
  function useActive(){
    const name = activeItemName();
    if (!name) return toast('No item selected');
    const n = normalizeName(name);

    // Preferred: bridge to a registry, if you have one
    if (window.ItemRegistry?.use) {
      try{ window.ItemRegistry.use(name); return; }catch(_){}
    }

    // Fallback: direct mappings
    try{
      if (n==='salt') { window.placeSalt?.(); return; }
      if (n==='writingbook' || n==='book') { window.dropWritingBook?.(); return; }
      if (n==='dots') { window.placeDotsProjector?.(); return; }
      if (n==='spiritbox') { window.SpiritBoxAudio?.speak?.(); return; }
      if (n==='uvprints' || n==='uv' || n==='uvlight') {
        if (window.uvLight){ window.uvLight.intensity = window.uvLight.intensity>0 ? 0 : 1.2; }
        const badge = document.getElementById("camera-ir");
        if (badge) badge.style.display = window.uvLight?.intensity>0 ? 'block' : 'none';
        return;
      }
      // default
      toast('No use action for '+name);
    }catch(e){ console.warn('[useActive]', e); }
  }

  function dropActive(){
    const name = activeItemName();
    if (!name) return toast('No item selected');
    const n = normalizeName(name);

    // If your registry exposes drop(), prefer that:
    if (window.ItemRegistry?.drop){
      try{ window.ItemRegistry.drop(name); return; }catch(_){}
    }

    try{
      if (n==='salt') { window.placeSalt?.(); return; }
      if (n==='writingbook' || n==='book') { window.dropWritingBook?.(); return; }
      if (n==='dots') { window.placeDotsProjector?.(); return; }
      // Spirit box / UV aren't "droppable" by default
      toast('No drop behavior for '+name);
    }catch(e){ console.warn('[dropActive]', e); }
  }

  function throwActive(){
    const name = activeItemName();
    if (!name) return toast('No item selected');
    const n = normalizeName(name);

    // If your registry exposes throw(), prefer that:
    if (window.ItemRegistry?.throw){
      try{ window.ItemRegistry.throw(name); return; }catch(_){}
    }

    // Lightweight "toss forward" helper for placeable items:
    try{
      if (n==='salt'){ window.placeSalt?.(); return; }
      if (n==='dots'){ window.placeDotsProjector?.(); return; }
      if (n==='writingbook' || n==='book'){
        // play the toss sound if the writing system provided it (best effort)
        try{
          const p = CAM()?.position?.add(CAM().getForwardRay().direction.scale(1.2)) || null;
          // writing_book.js already plays a toss sound when the ghost tosses; we emulate a drop here:
          window.dropWritingBook?.();
          toast('Book thrown (simulated)');
        }catch(_){}
        return;
      }
      toast('No throw behavior for '+name);
    }catch(e){ console.warn('[throwActive]', e); }
  }

  // Expose for other scripts / action bar buttons:
  window.useActive   = useActive;
  window.dropActive  = dropActive;
  window.throwActive = throwActive;

  // ---- On-screen Action Bar wiring (buttons provided by devmode.js) ----
  function wireActionBar(){
    const u = document.getElementById('ab-use');
    const d = document.getElementById('ab-drop');
    const g = document.getElementById('ab-throw');
    if (u && !u.__wired){ u.__wired = true; u.onclick = useActive; }
    if (d && !d.__wired){ d.__wired = true; d.onclick = dropActive; }
    if (g && !g.__wired){ g.__wired = true; g.onclick = throwActive; }
  }

  // ---- Keyboard ----
  function onKey(e, down){
    const k = e.key;
    if (k==='w' || k==='W') keys.w = down;
    if (k==='a' || k==='A') keys.a = down;
    if (k==='s' || k==='S') keys.s = down;
    if (k==='d' || k==='D') keys.d = down;
    if (k==='Shift') keys.shift = down;

    if (!down) return; // the rest are "on press"

    // Item actions
    if (k==='e' || k==='E') useActive();   // Use
    if (k==='x' || k==='X') dropActive();  // Drop / place
    if (k==='g' || k==='G') throwActive(); // Throw

    // Lights
    if (k==='f' || k==='F'){ try{ window.flashLight.intensity = window.flashLight.intensity>0?0:1.2; }catch(_){}
    }
    if (k==='u' || k==='U'){ try{
      window.uvLight.intensity = window.uvLight.intensity>0?0:1.2;
      const badge = document.getElementById("camera-ir");
      if (badge) badge.style.display = window.uvLight.intensity>0 ? 'block' : 'none';
    }catch(_){}
    }
    if (k==='i' || k==='I'){ try{ window.irLight.intensity = window.irLight.intensity>0?0:1.0; }catch(_){}
    }

    // Notebook
    if (k==='n' || k==='N') document.getElementById('notebook-modal')?.style?.setProperty('display','flex');

    // Storage
    if (k==='b' || k==='B') document.getElementById('storage-button')?.click();

    // Dev Tools panel toggle (separate from DEV mode switch)
    if (k==='t' || k==='T'){
      const p = document.getElementById('devtools-panel');
      if (p){ p.style.display = (p.style.display==='none'?'block':'none'); }
    }

    // DEV mode master toggle (extra shortcut)
    if (k==='`'){ try{ window.setDevMode?.(!window.DEV_MODE); }catch(_){}
    }
  }

  window.addEventListener('keydown', e=> onKey(e,true));
  window.addEventListener('keyup',   e=> onKey(e,false));

  // ---- Movement + footsteps (lightweight) ----
  window.handleMovement = function handleMovement(dt){
    const cam = CAM(); if (!cam) return;
    const spd = (keys.shift ? window.player?.speedRun : window.player?.speedWalk) || 0.1;
    const fwd = cam.getForwardRay().direction; fwd.y = 0; fwd.normalize();
    const right = BABYLON.Vector3.Cross(fwd, BABYLON.Axis.Y).scale(-1);
    let v = new BABYLON.Vector3(0,0,0);
    if (keys.w) v = v.add(fwd);
    if (keys.s) v = v.subtract(fwd);
    if (keys.a) v = v.subtract(right);
    if (keys.d) v = v.add(right);
    if (v.lengthSquared()>0){
      v = v.normalize().scale(spd / Math.max(0.0001, (1/60))); // scale approx per frame
      cam.cameraDirection = cam.cameraDirection ? cam.cameraDirection.add(v) : v.clone();
    }
  };

  // Optional footstep player (HTMLAudio fallback in core.js)
  window.updatePlayerFootsteps = function updatePlayerFootsteps(dt){
    try{
      const moving = keys.w || keys.a || keys.s || keys.d;
      if (!moving) { footTimer = 0; return; }
      footTimer += dt;
      const period = (keys.shift? 0.33 : 0.5);
      if (footTimer >= period){
        footTimer = 0;
        window.playStep?.(0.5);
      }
    }catch(_){}
  };

  // ---- UI init ----
  window.initUI = function initUI(){
    // Start button
    const start = document.getElementById('start-button');
    if (start && !start.__wired){
      start.__wired = true;
      start.onclick = ()=> window.safeStart?.();
    }

    // Storage open button (show while in Van; this can be refined by your movement loop)
    const sb = document.getElementById('storage-button');
    if (sb && !sb.__wired){
      sb.__wired = true;
      sb.onclick = ()=>{
        const m = document.getElementById('storage-modal');
        if (m) m.style.display = 'flex';
      };
    }

    // Notebook close
    const nbClose = document.getElementById('notebook-close');
    if (nbClose && !nbClose.__wired){
      nbClose.__wired = true;
      nbClose.onclick = ()=> document.getElementById('notebook-modal').style.display='none';
    }

    // Wire action bar buttons (created by devmode.js)
    wireActionBar();
  };

  // Kick it if DOM is ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> window.initUI?.());
  } else {
    window.initUI?.();
  }
})();
