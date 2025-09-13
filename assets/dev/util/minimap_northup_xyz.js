(function(){
  if (window.__PP_MINIMAP__) return; window.__PP_MINIMAP__ = true;

  // Config
  const SIZE_PX = 256;            // logical pixels; will be scaled by DPR
  const LAYER_MASK = 0xFFFFFFFF;  // render everything (adjust if you want to hide HUD meshes)
  const ORTHO_SCALE = 40;         // world meters shown across minimap

  let engine, scene, mapCam, rtt, dprCached = 1, uiRoot, imgEl;

  function S(){ return window.SCENE || BABYLON.Engine?.LastCreatedScene; }
  function E(){ return window.ENGINE || BABYLON.Engine?.LastCreatedEngine; }

  function currentDPR(){
    // round to int to avoid fractional RT sizes on some GPUs
    return Math.max(1, Math.floor(window.devicePixelRatio || 1));
  }

  function sizeForRT(){
    const dpr = currentDPR();
    const s = Math.max(64, Math.floor(SIZE_PX * dpr));
    return { width: s, height: s, dpr };
  }

  function disposeMinimap(){
    try { rtt?.dispose(); } catch{}
    try { mapCam?.dispose(); } catch{}
    rtt = null; mapCam = null;
  }

  function createMinimap(){
    disposeMinimap();

    engine = E(); scene = S();
    if (!engine || !scene) return;

    // 1) Top-down ortho camera
    mapCam = new BABYLON.FreeCamera("MinimapCam", new BABYLON.Vector3(0, 50, 0), scene);
    mapCam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    mapCam.minZ = 0.1; mapCam.maxZ = 1000;
    mapCam.layerMask = LAYER_MASK;
    mapCam.rotation.x = Math.PI / 2; // look straight down

    // Ortho frustum (units are world units)
    const half = ORTHO_SCALE * 0.5;
    mapCam.orthoLeft   = -half;
    mapCam.orthoRight  =  half;
    mapCam.orthoTop    =  half;
    mapCam.orthoBottom = -half;

    // 2) Render target texture
    const { width, height, dpr } = sizeForRT();
    dprCached = dpr;

    rtt = new BABYLON.RenderTargetTexture("MinimapRTT", { width, height }, scene, false, true);
    rtt.ignoreCameraViewport = true;
    rtt.samples = 1;  // avoid MSAA mismatch on some GPUs
    rtt.refreshRate = 1;
    rtt.renderList = null; // whole scene
    rtt.clearColor = new BABYLON.Color4(0,0,0,0); // transparent BG if you composite into UI
    rtt.activeCamera = mapCam;

    scene.customRenderTargets = scene.customRenderTargets || [];
    scene.customRenderTargets.push(rtt);

    // 3) Simple HTML <img> preview (keeps Babylon out of UI FBOs)
    ensureUI();
    rtt.onAfterRenderObservable.addOnce(()=> {
      // use snapshot as dataURL; avoids any cross-attachment bugs
      const data = rtt.readPixels
        ? rtt.readPixels() // (kept for completeness, but we’ll use copy to image below)
        : null;
      // Simpler: use scene.createScreenshot on this camera into a canvas, then toDataURL:
      BABYLON.Tools.CreateScreenshotUsingRenderTarget(engine, mapCam, { width, height }, (uri)=>{
        if (imgEl) imgEl.src = uri;
      });
    });
  }

  function ensureUI(){
    if (uiRoot) return;
    uiRoot = document.createElement('div');
    uiRoot.style.position = 'fixed';
    uiRoot.style.left = '10px';
    uiRoot.style.top = '10px';
    uiRoot.style.zIndex = 6001;
    uiRoot.style.pointerEvents = 'none';

    // outer border
    uiRoot.style.border = '1px solid #066';
    uiRoot.style.background = 'rgba(0,0,0,0.35)';
    uiRoot.style.padding = '4px';
    uiRoot.style.borderRadius = '8px';

    imgEl = document.createElement('img');
    imgEl.alt = 'minimap';
    imgEl.width = SIZE_PX;   // CSS pixel size (not DPR)
    imgEl.height = SIZE_PX;
    imgEl.style.display = 'block';

    uiRoot.appendChild(imgEl);
    document.body.appendChild(uiRoot);
  }

  // Keep camera centered over player/camera each frame
  function followPlayer(){
    const s = S(); if (!s || !mapCam) return;
    const src =
      window.PP?.rig?.body ||
      window.PP?.player?.body ||
      s.getMeshByName?.('player_capsule') ||
      s.activeCamera;
    const p = src?.getAbsolutePosition?.() || src?.position;
    if (!p) return;
    mapCam.position.x = p.x;
    mapCam.position.z = p.z;
  }

  // Build once after scene is ready & first frame rendered (sizes are stable)
  function buildSoon(){
    const s = S(); const e = E(); if (!s || !e) return setTimeout(buildSoon, 100);
    // wait a frame to let canvas settle
    let built = false;
    const sub = s.onAfterRenderObservable.add(()=>{
      if (built) return;
      built = true;
      s.onAfterRenderObservable.remove(sub);
      createMinimap();
    });
  }

  // Recreate RTT when engine resizes or DPR changes
  function hookResize(){
    const e = E(); if (!e) return;
    e.onResizeObservable.add(()=>{
      const dpr = currentDPR();
      if (!rtt || dpr !== dprCached){
        createMinimap();
      }
    });
  }

  // Move cam every frame
  function hookFollow(){
    const s = S(); if (!s) return setTimeout(hookFollow, 100);
    s.onBeforeRenderObservable.add(followPlayer);
  }

  // Boot once start is pressed
  window.addEventListener('pp:start', ()=>{
    buildSoon();
    hookResize();
    hookFollow();
  }, { once:true });

})();
