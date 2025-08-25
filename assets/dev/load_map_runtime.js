// load_map_runtime.js — Start button handler: boot Babylon, import GLB, enforce spawn

(function () {
  const startBtn = document.getElementById("start-button");
  const canvas   = document.getElementById("renderCanvas");
  const xyzHud   = document.getElementById("hud-xyz");
  const hudX = document.getElementById("hud-x");
  const hudY = document.getElementById("hud-y");
  const hudZ = document.getElementById("hud-z");

  if (!startBtn || !canvas) return;

  let engine = null, scene = null, camera = null, hemi = null;

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return console.log(msg);
    t.textContent = msg; t.style.display = "block";
    setTimeout(()=> t.style.display = "none", 1200);
  }

  async function importMapFromMAP_DEF() {
    const file = (window.MAP_DEF && MAP_DEF.file) ? MAP_DEF.file : null;
    if (!file) throw new Error("MAP_DEF.file missing");
    const folder = "./assets/models/map/";
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", folder, file, scene);
    // Make sure meshes receive shadows later if you add lights/shadows
    res.meshes.forEach(m => { try { m.receiveShadows = true; } catch(_){} });
    return res;
  }

  function addGroundFallback() {
    const g = BABYLON.MeshBuilder.CreateGround("fallback_ground", { width: 180, height: 180 }, scene);
    g.checkCollisions = true;
    const m = new BABYLON.StandardMaterial("fallback_mat", scene);
    m.diffuseColor = new BABYLON.Color3(0.15,0.18,0.22);
    m.specularColor = new BABYLON.Color3(0,0,0);
    g.material = m;
    return g;
  }

  function setupSceneBasics() {
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

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.85;

    scene.clearColor = new BABYLON.Color4(0.02,0.02,0.03,1);
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

    // XYZ HUD live
    if (xyzHud) xyzHud.style.display = "block";
    scene.onBeforeRenderObservable.add(()=>{
      if (!camera) return;
      if (hudX) hudX.textContent = camera.position.x.toFixed(2);
      if (hudY) hudY.textContent = camera.position.y.toFixed(2);
      if (hudZ) hudZ.textContent = camera.position.z.toFixed(2);
    });

    engine.runRenderLoop(()=> scene.render());
    window.addEventListener("resize", ()=> engine.resize());
  }

  async function ensureMapDefLoadedForSelection() {
    // If MAP_DEF already there (e.g., your Abandoned_House.config.js), done.
    if (window.MAP_DEF && MAP_DEF.spawn) return true;

    // Otherwise, try to load specific config named by selection (best-effort)
    const selected = (typeof window.__PP_getSelectedMap === "function") ? __PP_getSelectedMap() : null;
    if (selected && selected.def) {
      // classic script injection; spawn_fix’s loadScriptOnce logic not needed here
      const ok = await new Promise(res=>{
        const s=document.createElement("script");
        s.src = "./assets/models/map/" + selected.def;
        s.onload = ()=>res(true); s.onerror = ()=>res(false);
        document.head.appendChild(s);
      });
      return ok && window.MAP_DEF && MAP_DEF.spawn;
    }
    return !!(window.MAP_DEF && MAP_DEF.spawn);
  }

  async function startGame() {
    // hide title + show loader bar if you want (optional)
    const title = document.getElementById("title-screen");
    if (title) title.style.display = "none";

    setupSceneBasics();

    // Make sure a MAP_DEF exists (either preloaded or from the selected map’s config)
    await ensureMapDefLoadedForSelection();

    // Import the GLB for the map (or build fallback ground)
    try {
      await importMapFromMAP_DEF();
    } catch (e) {
      console.warn("[runtime] map import failed, using fallback ground:", e);
      addGroundFallback();
      toast("Map import failed, using fallback ground");
    }

    // Enforce spawn (from your spawn_fix)
    try { window.__SpawnFix && __SpawnFix.enforceSpawn && __SpawnFix.enforceSpawn(scene); } catch(_) {}

    // Pointer lock convenience
    try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch(_) {}

    // Let other systems know scene exists
    window.engine = engine; window.scene = scene; window.camera = camera;

    // If your belt system exposes rebuildBelt, call it
    try { window.rebuildBelt && window.rebuildBelt(); } catch(_) {}
  }

  startBtn.addEventListener("click", (e)=>{ e.preventDefault(); startGame(); }, { passive:false });
})();
