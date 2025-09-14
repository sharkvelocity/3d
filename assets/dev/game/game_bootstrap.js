/* game_bootstrap.js — robust start flow (single engine, single map)
   - Populates map dropdown from assets/models/map/maps.json
   - Waits for Start to create engine/scene and then import the selected map
   - Ensures no double-start, no duplicate fallback ground
   - Disposes fallback if the real map succeeds
*/
(function () {
  "use strict";
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
  const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
  const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

  // ---------- tiny utils ----------
  const $  = (s)=> document.querySelector(s);
  const bURL = (p)=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };
  async function fetchJSON(url){
    try {
      const r = await fetch(bURL(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } catch (e) { warn("fetchJSON failed:", url, e); return null; }
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box  = ()=> $("#loading-box");
    const text = ()=> $("#loading-text");
    const fill = ()=> $("#loading-fill");
    let stepsDone = 0, stepsTotal = 0, queue = [];
    function show(){ const b=box(); if (b) b.style.display="flex"; }
    function hide(){ const b=box(); if (b) b.style.display="none"; }
    function label(s){ const t=text(); if (t) t.textContent = s || ""; }
    function draw(){ const f=fill(); if (!f) return; f.style.width = (stepsTotal? (stepsDone/stepsTotal)*100 : 0).toFixed(1)+"%"; }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal = queue.length; }
    async function run(){
      show(); draw();
      for (const s of queue){
        label(s.lbl); draw();
        try { await s.fn(); } catch(e){ warn("step failed:", s.lbl, e); }
        stepsDone++; draw();
      }
      label("Finalizing…"); draw();
      await new Promise(r=>setTimeout(r, 100));
      hide();
    }
    return { reset, addStep, run, show, hide, label };
  })();

  // ---------- state ----------
  let engine = null, scene = null, camera = null;
  let hemi = null;
  let started = false;
  let manifest = [];   // [{file, title, def?}]
  let mapRoot = null;  // imported meshes[0]
  let fallbackGround = null;

  // ---------- map list / selector ----------
  async function loadManifest() {
    // Expected at this path; adjust if your repo differs
    let j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) manifest = j;
    else if (j && Array.isArray(j.maps)) manifest = j.maps;

    if (!manifest.length) {
      // Fallback list — only used if file missing
      manifest = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
        { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",    def: "apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function populateMapSelector(){
    const sel = $("#map-select");
    if (!sel) return;
    if (!manifest.length){
      sel.innerHTML = `<option value="-1">(no maps found)</option>`;
      return;
    }
    const opts = manifest.map((m,i)=> `<option value="${i}">${m.title || m.file}</option>`).join("");
    sel.innerHTML = opts;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved && manifest[+saved]) sel.value = saved;
      else sel.value = "0";
    } catch(_){ sel.value = "0"; }
    sel.onchange = () => {
      try { localStorage.setItem("selectedMapIndex", sel.value); } catch(_){}
    };
  }

  function getSelectedMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(manifest.length-1, parseInt(sel?.value || "0", 10) || 0));
    return manifest[idx];
  }

  // ---------- engine + scene ----------
  function createEngineScene(){
    if (engine && scene) return; // idempotent
    const canvas = $("#renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // Night-ish feel + collisions/gravity
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();

    camera.attachControl(canvas, true);

    // Export for other modules
    window.ENGINE = engine; window.SCENE = scene; window.camera = camera;

    // Render loop
    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());
    mark("engine+scene-created");
  }

  // ---------- MAP_DEF loading + apply ----------
  async function loadMapDef(defNameOrNull, mapFile){
    const baseNoExt = (mapFile||"").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of candidates){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) return true;
    }
    // Minimal synthesized def to keep going
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.file = mapFile || MAP_DEF.file || "";
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x:0,y:0,z:0 };
    MAP_DEF.spawn  = MAP_DEF.spawn  || { x:0, y:1.8, z:0 };
    return true;
  }

  function applyMapDefToRoot(root){
    if (!root || !window.MAP_DEF) return;
    const d = MAP_DEF;
    try {
      if (typeof d.scale === "number"){
        root.scaling.set(d.scale, d.scale, d.scale);
      }
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation.set(0, yaw, 0);
      if (d.offset){
        root.position.x = d.offset.x||0;
        root.position.y = d.offset.y||0;
        root.position.z = d.offset.z||0;
      }
    } catch(e){ warn("applyMapDefToRoot failed", e); }
  }

  function loadScriptOnce(path){
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  // ---------- import selected map ----------
  async function importSelectedMap(){
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    // clear previous import/fallback
    try { if (mapRoot && !mapRoot.isDisposed()) mapRoot.dispose(false, true); } catch{}
    mapRoot = null;
    try { if (fallbackGround && !fallbackGround.isDisposed()) { fallbackGround.dispose(false, true); fallbackGround = null; } } catch{}

    await loadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "", bURL("./assets/models/map/"), mapFile, scene
      );
      mapRoot = res.meshes[0] || null;

      // Apply MAP_DEF + enable collisions
      if (mapRoot) {
        applyMapDefToRoot(mapRoot);
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }

      enforceSpawn();
      mark("map-imported", { file: mapFile });
      log("Map imported:", mapFile);

    } catch (e) {
      warn("Map import failed, creating fallback ground:", e);
      // 30x30 meters ~ 900 sqft (1m ~ 3.28ft → 30m ≈ 98.4ft side ≈ 9680 sqft; use 28.4m for ~900 sqft square)
      // User asked 900 square feet room; that’s ~ 28.4ft x 28.4ft → 8.66m x 8.66m.
      // But earlier asked “900 square feet by 900 square feet” (huge). We’ll honor ~900 sqft room:
      const sideM = 8.66; // ≈ 28.4ft
      fallbackGround = BABYLON.MeshBuilder.CreateGround("fallback_ground",
        { width: sideM, height: sideM, subdivisions: 1 }, scene);
      fallbackGround.checkCollisions = true;
      enforceSpawn();
    }
  }

  // ---------- spawn ----------
  function enforceSpawn(){
    if (!scene?.activeCamera) return;
    const d = window.MAP_DEF || {};
    const sp = d.spawn
      ? {x: d.spawn.x||0, y: d.spawn.y||1.8, z: d.spawn.z||0}
      : {x:0,y:1.8,z:0};

    scene.activeCamera.position.set(sp.x, sp.y, sp.z);
    try { scene.activeCamera.setTarget(new BABYLON.Vector3(sp.x, sp.y + 1, sp.z + 2)); } catch(_){}
  }

  // ---------- pointer lock helpers ----------
  function enablePointerLockOnce(){
    const canvas = $("#renderCanvas");
    if (!canvas) return;
    const lock = ()=>{ if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch{} } };
    // Re-lock on click, but let your UI release it (Notebook/Van can call exitPointerLock)
    canvas.addEventListener("click", lock);
    setTimeout(lock, 200); // first try shortly after start
  }

  // ---------- Start button flow ----------
  async function startGame(){
    if (started) return; started = true;
    const title = $("#title-screen"); if (title) title.style.display = "none";

    try {
      Loader.reset();
      Loader.addStep("Preparing engine…", async ()=> { createEngineScene(); });
      Loader.addStep("Loading map…",       async ()=> { await importSelectedMap(); });
      Loader.addStep("Finalizing…",        async ()=> { enablePointerLockOnce(); });
      await Loader.run();

      // Broadcast start for subsystems (inventory, weather, etc.)
      window.dispatchEvent(new CustomEvent("pp:start"));
      // Focus canvas
      try { $("#renderCanvas")?.focus?.(); } catch{}

    } catch (err) {
      warn("fatal start error:", err);
      try { window.BOOTLOG?.add?.("fatal", { err: String(err) }); } catch(_){}
      // Allow retry
      started = false;
      if (title) title.style.display = "flex";
      alert("Boot failed. Check console for details.");
    }
  }

  // ---------- wire UI and early manifest load ----------
  (function wire(){
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", startGame, { passive: false });

    // Preload manifest so dropdown is ready before start
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", ()=> loadManifest());
    } else {
      loadManifest();
    }
  })();

})();