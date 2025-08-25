
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
