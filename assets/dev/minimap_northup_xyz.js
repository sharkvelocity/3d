
(function(){ 'use strict';
  if (window.__minimapInstalled_v2) return; window.__minimapInstalled_v2 = true;
  const S = ()=>window.SCENE||window.scene||(window.ENGINE&&ENGINE.scenes&&ENGINE.scenes[0])||null;
  const whenReady = (cb)=>{ (function t(){const s=S(); if(s&&s.activeCamera){try{cb(s);}catch(_){ } return;} requestAnimationFrame(t); })(); };
  const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
  const VIEWPORT = { x: 0.02, y: 0.73, w: 0.24, h: 0.24 };
  const HEIGHT   = 60;
  const HALF_EXT = 55;
  const Y_FALLBK = 1.35;

  function pickable(m){
    if (m.isPickable === false) return false;
    const n=(m.name||"").toLowerCase();
    return n.includes("floor") || n.includes("ground") || n.includes("nav") || true;
  }

  function buildMinimap(scene){
    const eng = scene.getEngine();
    const mm = new BABYLON.FreeCamera("MiniMapCam", new BABYLON.Vector3(0, HEIGHT, 0), scene);
    mm.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    mm.orthoLeft=-HALF_EXT; mm.orthoRight=HALF_EXT; mm.orthoBottom=-HALF_EXT; mm.orthoTop=HALF_EXT;
    mm.minZ = 0.1; mm.maxZ = 10000;
    mm.rotation.set(Math.PI/2, 0, 0);
    mm.rotationQuaternion = null;
    mm.inputs.clear();
    mm.viewport = new BABYLON.Viewport(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);

    scene.activeCameras = scene.activeCameras || [];
    if (!scene.activeCameras.includes(scene.activeCamera)) scene.activeCameras.push(scene.activeCamera);
    if (!scene.activeCameras.includes(mm)) scene.activeCameras.push(mm);

    let W = eng.getRenderWidth(), H = eng.getRenderHeight();
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("MinimapUI", true, scene);

    const frame = new BABYLON.GUI.Rectangle();
    frame.thickness = 2; frame.color = "#00FFFF"; frame.background = "rgba(0,0,0,0.14)";
    frame.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    frame.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;

    const dot = new BABYLON.GUI.Ellipse();
    dot.width = "8px"; dot.height = "8px"; dot.thickness = 2; dot.color="#00FFFF"; dot.background="#00FFFF";
    dot.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dot.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;

    const label = new BABYLON.GUI.TextBlock();
    label.color="#0ff"; label.fontSize=12; label.text="X:0  Y:0  Z:0";
    label.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.textVerticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;

    function pxRect(){
      W = eng.getRenderWidth(); H = eng.getRenderHeight();
      const px = VIEWPORT.x * W, py = (1 - VIEWPORT.y - VIEWPORT.h) * H;
      frame.left = px + "px"; frame.top = py + "px";
      frame.width = (VIEWPORT.w * W) + "px"; frame.height = (VIEWPORT.h * H) + "px";
    }
    pxRect(); ui.addControl(frame); ui.addControl(dot); ui.addControl(label);
    eng.onResizeObservable.add(pxRect);

    function placeDotAtWorldXZ(x,z){
      const px = VIEWPORT.x * W, py = (1 - VIEWPORT.y - VIEWPORT.h) * H;
      const rw = VIEWPORT.w * W, rh = VIEWPORT.h * H;
      const dx = (x - mm.position.x) / (2*HALF_EXT) + 0.5;
      const dz = (-(z - mm.position.z)) / (2*HALF_EXT) + 0.5;
      const nx = clamp(dx, 0, 1), ny = clamp(dz, 0, 1);
      dot.left = (px + nx*rw - 4) + "px";
      dot.top  = (py + ny*rh - 4) + "px";
    }

    scene.onBeforeRenderObservable.add(()=>{
      mm.rotation.set(Math.PI/2, 0, 0);
      mm.orthoLeft=-HALF_EXT; mm.orthoRight=HALF_EXT; mm.orthoBottom=-HALF_EXT; mm.orthoTop=HALF_EXT;
      const body = scene.__playerBody || scene.getMeshByName("player_capsule");
      if (body){
        mm.position.x = body.position.x;
        mm.position.z = body.position.z;
        placeDotAtWorldXZ(body.position.x, body.position.z);
        const x = body.position.x.toFixed(2), y = body.position.y.toFixed(2), z = body.position.z.toFixed(2);
        const px = VIEWPORT.x * W, py = (1 - VIEWPORT.y - VIEWPORT.h) * H;
        label.text = `X:${x}  Y:${y}  Z:${z}`;
        label.left = (px + 6) + "px"; label.top  = (py + 6) + "px";
      }
    });

    scene.onPointerObservable.add((evt)=>{
      if (evt.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
      const x = scene.pointerX, y = scene.pointerY;
      const nx = x/W, ny = 1 - y/H;
      const v  = mm.viewport;
      if (nx < v.x || nx > v.x + v.width || ny < v.y || ny > v.y + v.height) return;
      const hit = scene.pick(x, y, pickable, false, mm);
      if (hit && hit.hit && hit.pickedPoint){
        const p = hit.pickedPoint.clone();
        const groundRay = new BABYLON.Ray(new BABYLON.Vector3(p.x, p.y + 500, p.z), new BABYLON.Vector3(0,-1,0), 2000);
        const g = scene.pickWithRay(groundRay, pickable);
        const body = scene.__playerBody || scene.getMeshByName("player_capsule");
        if (body){
          body.position.x = p.x;
          body.position.z = p.z;
          body.position.y = g && g.hit ? (g.pickedPoint.y + 0.9) : 1.35;
        }
      }
    });
  }

  whenReady(buildMinimap);
})();


/* MINIMAP SYNC HOOK BEGIN */
(function(){
  // Config: tweak scale if your world units are very large/small
  const SCALE = 1.0; // 1 minimap px per world unit by default; adjust as needed
  // Query helpers
  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }
  function getBody(s){ return (s && (s.__playerBody || (s.getMeshByName && s.getMeshByName("player_capsule")))) || null; }
  function $(sel){ return document.querySelector(sel); }

  // DOM nodes for minimap elements
  function mm(){ return $("#minimap") || $("#mini-map") || $("#glb-minimap") || null; }
  function mmPlayer(){ return $("#minimap-player") || $("#mini-dot") || $("#mm-dot") || null; }

  function ensurePlayerDot(){
    let map = mm(); if(!map) return null;
    let dot = mmPlayer();
    if (!dot){
      dot = document.createElement("div");
      dot.id = "minimap-player";
      Object.assign(dot.style, {
        position:"absolute",
        width:"8px", height:"8px", borderRadius:"50%",
        background:"#00ffff", boxShadow:"0 0 6px #00ffff",
        pointerEvents:"none", transform:"translate(-50%,-50%)",
        zIndex:"3"
      });
      map.style.position = map.style.position or "relative"
      map.appendChild(dot);
    }
    return dot;
  }

  function worldToMini(x, z, map){
    // Centered mapping: put (0,0) world at center of minimap
    const rect = map.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    return { u: cx + (x * SCALE), v: cy - (z * SCALE) }; // north-up: +z points down on screen, so invert z
  }

  function syncLoop(){
    const s = S(); const map = mm(); if(!s || !map) return requestAnimationFrame(syncLoop);
    const dot = ensurePlayerDot(); if(!dot) return requestAnimationFrame(syncLoop);
    s.onBeforeRenderObservable.add(()=>{
      const body = getBody(s);
      if (!body) return;
      const p = body.position;
      const pos = worldToMini(p.x, p.z, map);
      dot.style.left = pos.u+"px";
      dot.style.top  = pos.v+"px";
    });
  }
  syncLoop();
})();
/* MINIMAP SYNC HOOK END */


/* MINIMAP FOLLOW + OVERLAY (M key) */
(function(){
  const FOLLOW_CENTER = true;   // keep player centered in the minimap
  const BASE_SCALE = 1.0;       // px per world unit for the small minimap
  let scale = BASE_SCALE;

  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }
  function getBody(s){ return (s && (s.__playerBody || (s.getMeshByName && s.getMeshByName("player_capsule")))) || null; }
  function $(sel){ return document.querySelector(sel); }
  function ce(tag,props){ const n=document.createElement(tag); return Object.assign(n, props||{}); }

  function getMinimap(){
    return $("#minimap") || $("#mini-map") || $("#glb-minimap") || null;
  }

  function ensureLayers(){
    const map = getMinimap(); if(!map) return null;
    // ensure map container has position
    if (!map.style.position) map.style.position="relative";
    map.style.overflow="hidden";

    // content layer (translates opposite of player to keep center)
    let layer = map.querySelector(".minimap-layer");
    if (!layer){
      layer = ce("div"); layer.className="minimap-layer";
      Object.assign(layer.style, {
        position:"absolute", left:"0", top:"0", right:"0", bottom:"0",
        transform:"translate(0px,0px)",
        zIndex:"1", pointerEvents:"none"
      });
      map.appendChild(layer);
    }

    // player dot (always at center if FOLLOW_CENTER)
    let dot = $("#minimap-player");
    if (!dot){
      dot = ce("div"); dot.id="minimap-player";
      Object.assign(dot.style, {
        position:"absolute", width:"10px", height:"10px",
        borderRadius:"50%", background:"#00ffff", boxShadow:"0 0 8px #00ffff",
        pointerEvents:"none", zIndex:"3",
        transform:"translate(-50%,-50%)",
        left: FOLLOW_CENTER ? "50%" : "0px",
        top:  FOLLOW_CENTER ? "50%" : "0px"
      });
      map.appendChild(dot);
    }

    return { map, layer, dot };
  }

  function worldToMini(x,z, mapW, mapH){
    // screen-space center
    const cx = mapW * 0.5, cy = mapH * 0.5;
    return { u: cx + (x * scale), v: cy - (z * scale) };
  }

  function sync(){
    const s = S(); const layers = ensureLayers();
    if (!s || !layers) return requestAnimationFrame(sync);
    const {map, layer, dot} = layers;
    const body = getBody(s);
    if (!body) return requestAnimationFrame(sync);

    const rect = map.getBoundingClientRect();
    const px = body.position.x, pz = body.position.z;
    const pos = worldToMini(px, pz, rect.width, rect.height);

    if (FOLLOW_CENTER){
      // Keep dot at center; move layer opposite the player to give sense of movement
      const tx = -(pos.u - rect.width*0.5);
      const ty = -(pos.v - rect.height*0.5);
      layer.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
    } else {
      dot.style.left = pos.u + "px";
      dot.style.top  = pos.v + "px";
    }
    requestAnimationFrame(sync);
  }
  sync();

  // ===== Map Overlay (M key) =====
  let overlay=null, ovCanvas=null, ovCtx=null, overlayOpen=false;

  function computeBoundsFromMapDef(){
    if (!(window.MAP_DEF && Array.isArray(MAP_DEF.exterior) && MAP_DEF.exterior.length)){
      // default square bounds
      return {minX:-50, maxX:50, minZ:-50, maxZ:50};
    }
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const p of MAP_DEF.exterior){
      if (typeof p.x==="number") { if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; }
      if (typeof p.z==="number") { if(p.z<minZ)minZ=p.z; if(p.z>maxZ)maxZ=p.z; }
    }
    if (!isFinite(minX)) { minX=-50; maxX=50; minZ=-50; maxZ=50; }
    return {minX,maxX,minZ,maxZ};
  }

  function drawOverlay(){
    if (!ovCanvas || !ovCtx) return;
    const s = S(); if (!s) return;
    const body = getBody(s); if (!body) return;
    const W = ovCanvas.width, H = ovCanvas.height;
    ovCtx.clearRect(0,0,W,H);

    const bounds = computeBoundsFromMapDef();
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxZ - bounds.minZ;
    const pad = 40;
    const scaleX = (W - pad*2) / (worldW || 1);
    const scaleY = (H - pad*2) / (worldH || 1);
    const smin = Math.min(scaleX, scaleY);

    function mapX(x){ return pad + (x - bounds.minX) * smin; }
    function mapY(z){ return H - pad - (z - bounds.minZ) * smin; }

    // Background/grid
    ovCtx.save();
    ovCtx.fillStyle = "rgba(20,28,40,0.9)";
    ovCtx.fillRect(0,0,W,H);
    ovCtx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let gx=pad; gx<=W-pad; gx+=40){ ovCtx.beginPath(); ovCtx.moveTo(gx,pad); ovCtx.lineTo(gx,H-pad); ovCtx.stroke(); }
    for (let gy=pad; gy<=H-pad; gy+=40){ ovCtx.beginPath(); ovCtx.moveTo(pad,gy); ovCtx.lineTo(W-pad,gy); ovCtx.stroke(); }
    ovCtx.restore();

    // Exterior poly if available
    if (window.MAP_DEF && Array.isArray(MAP_DEF.exterior) && MAP_DEF.exterior.length>=3){
      ovCtx.beginPath();
      const first = MAP_DEF.exterior[0];
      ovCtx.moveTo(mapX(first.x), mapY(first.z));
      for (let i=1;i<MAP_DEF.exterior.length;i++){
        const p = MAP_DEF.exterior[i];
        ovCtx.lineTo(mapX(p.x), mapY(p.z));
      }
      ovCtx.closePath();
      ovCtx.strokeStyle = "rgba(0,255,255,0.6)";
      ovCtx.lineWidth = 2;
      ovCtx.stroke();
    }

    // Player
    const px = mapX(body.position.x);
    const py = mapY(body.position.z);
    ovCtx.beginPath();
    ovCtx.arc(px, py, 6, 0, Math.PI*2);
    ovCtx.fillStyle = "#00ffff";
    ovCtx.shadowColor = "#00ffff"; ovCtx.shadowBlur = 12;
    ovCtx.fill();
  }

  function ensureOverlay(){
    if (overlay) return overlay;
    overlay = ce("div");
    overlay.id = "map-overlay";
    Object.assign(overlay.style, {
      position:"fixed", inset:"0", background:"rgba(0,0,0,0.85)",
      zIndex:"99999", display:"none"
    });
    const title = ce("div");
    Object.assign(title.style, {
      position:"absolute", left:"20px", top:"16px", color:"#e6f1ff",
      font:"600 16px system-ui, sans-serif", letterSpacing:"0.08em"
    });
    title.textContent = "Map — North Up (press M to close)";
    ovCanvas = ce("canvas");
    Object.assign(ovCanvas.style, {
      position:"absolute", left:"50%", top:"50%",
      transform:"translate(-50%,-50%)",
      width:"80vw", height:"80vh", boxShadow:"0 8px 40px rgba(0,0,0,0.6)", borderRadius:"12px"
    });
    ovCanvas.width = int(window.innerWidth * 0.8);
    ovCanvas.height = int(window.innerHeight * 0.8);
    ovCtx = ovCanvas.getContext("2d");

    overlay.appendChild(ovCanvas);
    overlay.appendChild(title);
    document.body.appendChild(overlay);
    return overlay;
  }

  function openOverlay(){
    ensureOverlay();
    overlay.style.display = "block";
    overlayOpen = true;
    // Disable pointer lock
    try{ document.exitPointerLock && document.exitPointerLock(); }catch(_){}
    // Redraw loop
    function tick(){
      if (!overlayOpen) return;
      drawOverlay();
      requestAnimationFrame(tick);
    }
    tick();
  }

  function closeOverlay(){
    overlayOpen = false;
    if (overlay) overlay.style.display = "none";
  }

  function toggleOverlay(){
    if (overlayOpen) closeOverlay(); else openOverlay();
  }

  // Key handler: M to toggle overlay
  window.addEventListener("keydown", (e)=>{
    const k=(e.key||"").toLowerCase();
    if (k==="m"){
      e.preventDefault();
      toggleOverlay();
    }
  }, true);

  // Keep canvas size in sync
  window.addEventListener("resize", ()=>{
    if (!overlay || overlay.style.display==="none") return;
    ovCanvas.width = Math.floor(window.innerWidth * 0.8);
    ovCanvas.height = Math.floor(window.innerHeight * 0.8);
  });
})();
