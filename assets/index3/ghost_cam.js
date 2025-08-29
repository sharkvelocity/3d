// ./assets/index3/ghost_cam.js — v1.0
// Non-invasive Ghost Camera: shows what the ghost is doing/looking at.
// Modes: off | PiP | full. Views: first-person | over-shoulder | orbit.
// Hotkey: Alt+C toggles PiP. Shift+Alt+C cycles modes.
// Requires: BABYLON, scene, camera. Works with ghost_dev.js / ghost_movement.js if present.

(function(){
  "use strict";

  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const MAIN   = ()=> window.camera || SCENE()?.activeCamera;
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const clamp  = (v,a,b)=> Math.max(a, Math.min(b,v));
  const toast  = (m)=> (window.toast? window.toast(m,900):console.log("[ghost-cam]",m));

  const CFG = {
    mode: "off",            // "off" | "pip" | "full"
    view: "shoulder",       // "fp" | "shoulder" | "orbit"
    fov: 0.9,
    dist: 2.8,              // shoulder/orbit distance
    side: 0.5,              // shoulder sideways offset
    height: 1.65,           // eye height above ghost origin
    smooth: 0.15,           // lerp alpha per frame
    orbitSpeed: 0.6,        // radians/sec
    // PiP viewport (x,y,w,h) in normalized coordinates
    pip: { x: 0.70, y: 0.02, w: 0.28, h: 0.28 },
  };

  const ST = {
    ready:false,
    cam:null,
    lastPos:null,
    lastTgt:null,
    orbitTheta: 0,
    prevMain:null,
    _uiBuilt:false,
  };

  function getGhostRoot(){
    const s = SCENE(); if (!s) return null;
    // 1) Dev-selected GLB has priority
    if (window.PREFERRED_GHOST_ROOT && !window.PREFERRED_GHOST_ROOT.isDisposed?.()) return window.PREFERRED_GHOST_ROOT;
    // 2) Heuristic: find a TransformNode named GhostRoot*
    const tn = s.transformNodes || [];
    const byName = tn.find(n=>/^GhostRoot/i.test(n.name));
    if (byName) return byName;
    // 3) Last resort: take a mesh that looks ghosty and return its parent or itself
    const names = s.meshes.map(m=>m.name).filter(Boolean);
    const candidate = names.find(n=>/ghost|spirit|entity|apparition|phantom/i.test(n));
    const m = candidate && (s.getMeshByName(candidate) || s.getNodeByName(candidate));
    return m?.parent || m || null;
  }

  function ensureCamera(){
    const s = SCENE(); if (!s) return null;
    if (ST.cam && !ST.cam.isDisposed?.()) return ST.cam;
    ST.cam = new BABYLON.UniversalCamera("GhostCam", v3(0,3,0), s);
    ST.cam.minZ = 0.05; ST.cam.maxZ = 1000; ST.cam.fov = CFG.fov;
    ST.cam.inertia = 0; ST.cam.angularSensibility = 1e9; // no user input
    ST.cam.inputs.clear();
    return ST.cam;
  }

  function addToActiveCameras(){
    const s = SCENE(); const main = MAIN(); const cam = ensureCamera();
    if (!s || !main || !cam) return;
    if (!s.activeCameras) s.activeCameras = [];
    // Default main viewport
    main.viewport = new BABYLON.Viewport(0,0,1,1);
    // Attach PiP viewport to ghost cam
    cam.viewport = new BABYLON.Viewport(CFG.pip.x, CFG.pip.y, CFG.pip.w, CFG.pip.h);
    if (!s.activeCameras.includes(main)) s.activeCameras.push(main);
    if (!s.activeCameras.includes(cam))  s.activeCameras.push(cam);
  }

  function removeFromActiveCameras(){
    const s = SCENE(); const main = MAIN(); if (!s || !main) return;
    s.activeCameras = [main]; // only main renders
    s.activeCamera  = main;
    main.viewport   = new BABYLON.Viewport(0,0,1,1);
  }

  function makeFullScreen(){
    const s = SCENE(); const main = MAIN(); const cam = ensureCamera();
    if (!s || !main || !cam) return;
    ST.prevMain = main;
    s.activeCameras = null;
    s.activeCamera  = cam;
    cam.viewport    = new BABYLON.Viewport(0,0,1,1);
  }

  function restoreFromFull(){
    const s = SCENE(); const main = ST.prevMain || MAIN(); if (!s || !main) return;
    s.activeCamera  = main;
    s.activeCameras = [main];
    main.viewport   = new BABYLON.Viewport(0,0,1,1);
    ST.prevMain = null;
  }

  function setMode(mode){
    CFG.mode = mode;
    if (mode === "pip"){ addToActiveCameras(); toast("Ghost Cam: PiP"); }
    else if (mode === "full"){ makeFullScreen(); toast("Ghost Cam: Full"); }
    else { removeFromActiveCameras(); toast("Ghost Cam: Off"); }
    // apply latest FOV
    if (ST.cam) ST.cam.fov = CFG.fov;
    reflectUI();
  }

  function setView(view){
    CFG.view = view;
    reflectUI();
  }

  function update(){
    const s = SCENE(); if (!s || CFG.mode === "off") return;
    const g = getGhostRoot(); if (!g) return;
    const cam = ensureCamera(); if (!cam) return;

    // Compute basis from ghost world matrix
    const wm = g.getWorldMatrix();
    const forward = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, wm).normalize();
    const right   = BABYLON.Vector3.TransformNormal(BABYLON.Axis.X, wm).normalize();
    const up      = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, wm).normalize();
    const base    = g.getAbsolutePosition ? g.getAbsolutePosition() : g.position;

    let desiredPos, desiredTgt;

    if (CFG.view === "fp"){
      desiredPos = base.add(up.scale(CFG.height)).add(forward.scale(0.05));
      desiredTgt = desiredPos.add(forward);
    } else if (CFG.view === "shoulder"){
      const back = forward.scale(-CFG.dist);
      const side = right.scale(CFG.side);
      desiredPos = base.add(up.scale(CFG.height)).add(back).add(side);
      desiredTgt = base.add(up.scale(CFG.height*0.8));
    } else { // orbit
      ST.orbitTheta += s.getEngine().getDeltaTime()*0.001*CFG.orbitSpeed;
      const ox = Math.cos(ST.orbitTheta)*CFG.dist;
      const oz = Math.sin(ST.orbitTheta)*CFG.dist;
      desiredPos = base.add(up.scale(CFG.height*0.7)).add(v3(ox, 0.3*CFG.dist, oz));
      desiredTgt = base.add(up.scale(CFG.height*0.5));
    }

    // Smooth
    const a = clamp(CFG.smooth, 0, 1);
    if (!ST.lastPos) ST.lastPos = desiredPos.clone();
    if (!ST.lastTgt) ST.lastTgt = desiredTgt.clone();
    ST.lastPos = BABYLON.Vector3.Lerp(ST.lastPos, desiredPos, a);
    ST.lastTgt = BABYLON.Vector3.Lerp(ST.lastTgt, desiredTgt, a);

    cam.position.copyFrom(ST.lastPos);
    cam.setTarget(ST.lastTgt);
    cam.fov = CFG.fov;
  }

  // ---------- UI (small floating panel) ----------
  function buildUI(){
    if (ST._uiBuilt) return;
    ST._uiBuilt = true;
    const style = document.createElement("style");
    style.textContent = `
#ghostcam-toggle{ position:fixed; right:12px; bottom:348px; z-index:9001; padding:8px 12px; border:1px solid #066; background:#111; color:#0ff; border-radius:8px; cursor:pointer; }
#ghostcam-panel{ position:fixed; right:12px; bottom:192px; width:260px; background:#0b0b0b; border:1px solid #033; border-radius:10px; padding:10px; color:#cfe; font:12px/1.4 monospace; display:none; z-index:9002; }
#ghostcam-panel .row{ display:flex; gap:6px; align-items:center; margin:6px 0; flex-wrap:wrap; }
#ghostcam-panel input[type="number"]{ width:64px; padding:2px 4px; background:#000; color:#0ff; border:1px solid #066; border-radius:6px; }
#ghostcam-panel select{ padding:2px 4px; background:#000; color:#0ff; border:1px solid #066; border-radius:6px; }
`;
    document.head.appendChild(style);

    const toggle = document.createElement("button");
    toggle.id = "ghostcam-toggle";
    toggle.className = "hud-btn";
    toggle.textContent = "Ghost Cam";
    document.body.appendChild(toggle);

    const panel = document.createElement("div");
    panel.id = "ghostcam-panel";
    panel.innerHTML = `
      <div style="color:#9ff;font-weight:bold;margin-bottom:4px;">Ghost Cam</div>
      <div class="row">
        <span style="min-width:60px;">Mode</span>
        <select id="gc-mode">
          <option value="off">Off</option>
          <option value="pip">PiP</option>
          <option value="full">Full</option>
        </select>
      </div>
      <div class="row">
        <span style="min-width:60px;">View</span>
        <select id="gc-view">
          <option value="fp">First-person</option>
          <option value="shoulder" selected>Over-shoulder</option>
          <option value="orbit">Orbit</option>
        </select>
      </div>
      <div class="row"><span>FOV</span><input id="gc-fov" type="number" step="0.05" value="0.9"></div>
      <div class="row"><span>Dist</span><input id="gc-dist" type="number" step="0.1" value="2.8">
                 <span>Side</span><input id="gc-side" type="number" step="0.05" value="0.5"></div>
      <div class="row"><span>Height</span><input id="gc-height" type="number" step="0.05" value="1.65">
                 <span>Smooth</span><input id="gc-smooth" type="number" step="0.01" value="0.15"></div>
    `;
    document.body.appendChild(panel);

    toggle.onclick = ()=> panel.style.display = (panel.style.display==='none'?'block':'none');

    // bindings
    const byId = id=> panel.querySelector('#'+id);
    byId('gc-mode').onchange   = (e)=> setMode(e.target.value);
    byId('gc-view').onchange   = (e)=> setView(e.target.value);
    byId('gc-fov').onchange    = (e)=> CFG.fov    = clamp(+e.target.value||0.9, 0.2, 2.2);
    byId('gc-dist').onchange   = (e)=> CFG.dist   = clamp(+e.target.value||2.8, 0.1, 20);
    byId('gc-side').onchange   = (e)=> CFG.side   = clamp(+e.target.value||0.5, -4, 4);
    byId('gc-height').onchange = (e)=> CFG.height = clamp(+e.target.value||1.65, 0, 4);
    byId('gc-smooth').onchange = (e)=> CFG.smooth = clamp(+e.target.value||0.15, 0, 1);

    // hotkeys
    window.addEventListener('keydown',(e)=>{
      const typing = document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
      if (typing) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key==='c'||e.key==='C')){
        e.preventDefault();
        setMode(CFG.mode==="pip" ? "off" : "pip");
      } else if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key==='c'||e.key==='C')){
        e.preventDefault();
        setMode(CFG.mode==="off" ? "pip" : (CFG.mode==="pip" ? "full" : "off"));
      }
    });
  }

  function reflectUI(){
    const panel = document.getElementById('ghostcam-panel'); if (!panel) return;
    const S = (id)=> panel.querySelector('#'+id);
    if (S('gc-mode'))  S('gc-mode').value  = CFG.mode;
    if (S('gc-view'))  S('gc-view').value  = CFG.view;
    if (S('gc-fov'))   S('gc-fov').value   = String(CFG.fov);
    if (S('gc-dist'))  S('gc-dist').value  = String(CFG.dist);
    if (S('gc-side'))  S('gc-side').value  = String(CFG.side);
    if (S('gc-height'))S('gc-height').value= String(CFG.height);
    if (S('gc-smooth'))S('gc-smooth').value= String(CFG.smooth);
  }

  // Boot
  const boot = setInterval(()=>{ try{
    if (SCENE() && MAIN()){
      clearInterval(boot);
      ensureCamera(); buildUI();
      SCENE().onBeforeRenderObservable.add(update);
      // default off; user presses Alt+C or panel.
      reflectUI();
      // if full mode is active and dev-tools hide, restore main:
      const devPanel = document.getElementById('devtools-panel');
      if (devPanel){
        const obs = new MutationObserver(()=>{
          const shown = devPanel.style.display !== 'none';
          if (!shown && CFG.mode==='full') setMode('off');
        });
        obs.observe(devPanel, { attributes:true, attributeFilter:['style'] });
      }
      ST.ready = true;
      toast('Ghost Cam ready');
    }
  }catch{} }, 200);

  // Public API (optional use from devtools)
  window.GHOST_CAM = {
    setMode, setView,
    setFov:(f)=>{ CFG.fov=f; if(ST.cam) ST.cam.fov=f; reflectUI(); },
    setDist:(d)=>{ CFG.dist=d; reflectUI(); },
    setHeight:(h)=>{ CFG.height=h; reflectUI(); },
    setSmooth:(s)=>{ CFG.smooth=s; reflectUI(); },
    getConfig:()=>({ mode:CFG.mode, view:CFG.view, fov:CFG.fov, dist:CFG.dist, side:CFG.side, height:CFG.height, smooth:CFG.smooth }),
    applyConfig:(c)=>{ Object.assign(CFG,c||{}); reflectUI(); }
  };

})();
