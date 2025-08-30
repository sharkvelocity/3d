// ./assets/index3/builder_view_lock.js — v1.0
// Builder: toggleable "Aerial Lock" that keeps a strict top-down view
// and allows only zoom via mouse wheel or touch pinch (no tilt/rotate/pan).

(function(){
  "use strict";
  if (window.BuilderViewLock?.__v === '1.0') return;

  const API = { __v:'1.0', set, isLocked, ensureUI };
  window.BuilderViewLock = API;

  const ST = {
    s: null,
    c: null,
    locked: true,          // default ON
    snap: null,            // previous camera settings snapshot
    pointerInput: null     // ArcRotate pointers input (for pinch zoom)
  };

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CANVAS = ()=> ST.s?.getEngine?.().getRenderingCanvas();

  function ensureArcTopCamera(){
    ST.s = SCENE();
    if (!ST.s) return null;

    // If it's already an ArcRotate, reuse it; otherwise create one.
    let cam = ST.s.activeCamera;
    if (!(cam instanceof BABYLON.ArcRotateCamera)) {
      const target = new BABYLON.Vector3(0,0,0);
      cam = new BABYLON.ArcRotateCamera("BuildCam", 0, 0.001, 25, target, ST.s);
      cam.lowerRadiusLimit = 2;
      cam.upperRadiusLimit = 200;
      cam.inertia = 0;
      cam.attachControl(CANVAS(), true);
      ST.s.activeCamera = cam;
    }
    ST.c = cam;

    // Prefer perspective so wheel/pinch zoom works natively
    cam.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;

    // Ensure we have the ArcRotate pointer input so pinch zoom works
    ST.pointerInput = cam.inputs.attached.pointers || cam.inputs.getInput("ArcRotateCameraPointersInput");
    if (!ST.pointerInput){
      cam.inputs.add(new BABYLON.ArcRotateCameraPointersInput());
      ST.pointerInput = cam.inputs.attached.pointers;
    }
    // Reasonable zoom feels
    cam.wheelPrecision = 50;              // higher = slower wheel zoom
    ST.pointerInput.pinchDeltaPercentage = 0.01; // smooth pinch zoom
    return cam;
  }

  function snapshotCam(cam){
    return {
      alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone(),
      lowerAlphaLimit: cam.lowerAlphaLimit, upperAlphaLimit: cam.upperAlphaLimit,
      lowerBetaLimit: cam.lowerBetaLimit,   upperBetaLimit: cam.upperBetaLimit,
      panningSensibility: cam.panningSensibility,
      inertia: cam.inertia,
      keysUp: cam.keysUp?.slice?.() || [],
      keysDown: cam.keysDown?.slice?.() || [],
      keysLeft: cam.keysLeft?.slice?.() || [],
      keysRight: cam.keysRight?.slice?.() || [],
      mode: cam.mode,
      wheelPrecision: cam.wheelPrecision,
      pinchDeltaPercentage: ST.pointerInput?.pinchDeltaPercentage
    };
  }

  function restoreCam(cam, snap){
    if (!snap) return;
    cam.alpha = snap.alpha; cam.beta = snap.beta; cam.radius = snap.radius; cam.setTarget(snap.target);
    cam.lowerAlphaLimit = snap.lowerAlphaLimit; cam.upperAlphaLimit = snap.upperAlphaLimit;
    cam.lowerBetaLimit  = snap.lowerBetaLimit;  cam.upperBetaLimit  = snap.upperBetaLimit;
    cam.panningSensibility = snap.panningSensibility;
    cam.inertia = snap.inertia;
    cam.keysUp = snap.keysUp; cam.keysDown = snap.keysDown; cam.keysLeft = snap.keysLeft; cam.keysRight = snap.keysRight;
    cam.mode = snap.mode;
    cam.wheelPrecision = snap.wheelPrecision;
    if (ST.pointerInput) ST.pointerInput.pinchDeltaPercentage = snap.pinchDeltaPercentage;
  }

  // Lock: top-down, no pan, no rotate/tilt, only radius changes (zoom)
  function lockCamera(){
    const cam = ensureArcTopCamera(); if (!cam) return;
    ST.snap = snapshotCam(cam);

    // Strict top-down: beta very small (avoid singularity), alpha fixed
    cam.alpha = 0;
    cam.beta  = 0.001;
    cam.lowerAlphaLimit = 0;
    cam.upperAlphaLimit = 0;
    cam.lowerBetaLimit  = 0;
    cam.upperBetaLimit  = 0.001;

    // Disable panning and keyboard movement
    cam.panningSensibility = 0;
    cam.keysUp = cam.keysDown = cam.keysLeft = cam.keysRight = [];

    // Zoom behavior (wheel + pinch)
    cam.wheelPrecision = 50;
    if (ST.pointerInput){
      ST.pointerInput.pinchDeltaPercentage = 0.01; // 1% scale per frame
      // Prevent rotate by pointer: crank up angular sensitivity
      ST.pointerInput.angularSensibilityX = 1e12;
      ST.pointerInput.angularSensibilityY = 1e12;
    }

    cam.inertia = 0;
  }

  function unlockCamera(){
    if (!ST.c || !ST.snap) return;
    restoreCam(ST.c, ST.snap);
    ST.snap = null;
  }

  function set(on){
    ST.locked = !!on;
    if (!SCENE()) return;
    if (ST.locked) lockCamera(); else unlockCamera();
    // Update UI
    const cb = document.getElementById('aerial-lock-cb');
    if (cb) cb.checked = ST.locked;
  }

  function isLocked(){ return !!ST.locked; }

  // ---------- UI ----------
  function ensureUI(){
    // Prefer adding into builder toolbar if it exists
    const toolbar = document.getElementById('builder-toolbar');
    const makeSwitch = ()=>{
      const wrap = document.createElement('label');
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin-left:8px;";
      wrap.innerHTML = `
        <input id="aerial-lock-cb" type="checkbox" style="transform:scale(1.2); accent-color:#0ff;" />
        <span style="color:#9ff;">Aerial Lock</span>
      `;
      const cb = wrap.querySelector('#aerial-lock-cb');
      cb.checked = true;
      cb.addEventListener('change', (e)=> set(cb.checked));
      return wrap;
    };

    if (toolbar){
      if (!document.getElementById('aerial-lock-cb')){
        toolbar.appendChild(makeSwitch());
      }
    } else {
      // Fallback floating pill in top-left
      if (document.getElementById('aerial-lock-pill')) return;
      const pill = document.createElement('div');
      pill.id = 'aerial-lock-pill';
      pill.style.cssText = `
        position:fixed; top:10px; left:10px; z-index:8000;
        background:rgba(0,0,0,0.55); border:1px solid #066; border-radius:8px; padding:6px 8px;
      `;
      pill.appendChild(makeSwitch());
      document.body.appendChild(pill);
    }
  }

  // ---------- Boot ----------
  const boot = setInterval(()=>{
    try{
      if (!SCENE()) return;
      ensureUI();
      // Default to locked on first load
      set(true);
      clearInterval(boot);
    }catch{}
  }, 150);

})();