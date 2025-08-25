// load_map_runtime.js — Start flow with normalized paths and clear fallbacks
(function () {
  const startBtn = document.getElementById("start-button");
  const canvas   = document.getElementById("renderCanvas");
  const xyzHud   = document.getElementById("hud-xyz");
  const hudX = document.getElementById("hud-x");
  const hudY = document.getElementById("hud-y");
  const hudZ = document.getElementById("hud-z");

  if (!startBtn || !canvas) return;

  function R(p){ return (window.__PP_resolvePath || (x=>x))(p); }

  let engine, scene, camera;

  function setupScene() {
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
    scene  = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -0.9, 0);

    camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 1.8, 6), scene);
    camera.attachControl(canvas, true);
    camera.checkCollisions = true;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);
    camera.minZ = 0.1; camera.inertia = 0;

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.9;
    scene.clearColor = new BABYLON.Color4(0.02,0.02,0.03,1);

    if (xyzHud) xyzHud.style.display = "block";
    scene.onBeforeRenderObservable.add(()=>{
      if (!camera) return;
      hudX && (hudX.textContent = camera.position.x.toFixed(2));
      hudY && (hudY.textContent = camera.position.y.toFixed(2));
      hudZ && (hudZ.textContent = camera.position.z.toFixed(2));
    });

    engine.runRenderLoop(()=> scene.render());
    window.addEventListener("resize", ()=> engine.resize());

    window.engine = engine; window.scene = scene; window.camera = camera;
  }

  function addGround() {
    const g = BABYLON.MeshBuilder.CreateGround("fallback_ground", { width: 180, height: 180 }, scene);
    const m = new BABYLON.StandardMaterial("fallback_mat", scene);
    m.diffuseColor = new BABYLON.Color3(0.15,0.18,0.22); m.specularColor = new BABYLON.Color3(0,0,0);
    g.material = m; g.checkCollisions = true;
  }

  async function importGLB(glbPath) {
    const url = R(glbPath);
    return BABYLON.SceneLoader.ImportMeshAsync("", url.replace(/[^/]+$/, ""), url.split("/").pop(), scene);
  }

  async function start() {
    const title = document.getElementById("title-screen");
    title && (title.style.display = "none");

    setupScene();

    // Ensure MAP_DEF (from config or synthesized)
    await window.__SpawnFix.ensureMapDef();

    let imported = false;
    if (window.MAP_DEF?.file) {
      try {
        await importGLB(MAP_DEF.file);
        imported = true;
      } catch (e) {
        console.warn("[runtime] GLB import failed:", MAP_DEF.file, e);
      }
    }

    if (!imported) addGround();

    try { window.__SpawnFix.enforceSpawn(scene); } catch {}

    try { canvas.focus(); canvas.requestPointerLock && canvas.requestPointerLock(); } catch {}

    try { window.rebuildBelt && window.rebuildBelt(); } catch {}
  }

  startBtn.addEventListener("click", (e)=>{ e.preventDefault(); start(); }, { passive:false });
})();
