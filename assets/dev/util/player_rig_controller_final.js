/* game_bootstrap.js — robust start flow for PhasmaPhoney
   - Loads map manifest
   - Imports GLB + matching MAP_DEF (*.config.js or *.js)
   - Applies MAP_DEF {scale, rotationY, offset, spawn}
   - Safe render loop (only renders when a camera exists)
   - Spawns player (PP.rig.body preferred) at MAP_DEF.spawn
*/
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  // ---------- tiny utils ----------
  const $ = (s) => document.querySelector(s);
  const log  = (...a) => { try { console.log("[bootstrap]", ...a); } catch(_){} };
  const warn = (...a) => { try { console.warn("[bootstrap]", ...a); } catch(_){} };

  function absUrl(path) {
    try { return new URL(path, document.baseURI).toString(); }
    catch (_){ return path; }
  }

  function loadScriptOnce(path) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = absUrl(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(absUrl(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } catch (e) {
      warn("fetchJSON failed:", url, e);
      return null;
    }
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box  = () => $("#loading-box");
    const text = () => $("#loading-text");
    const fill = () => $("#loading-fill");
    let stepsDone = 0, stepsTotal = 0;
    function show(){ const b=box(); if (b) b.style.display="flex"; }
    function hide(){ const b=box(); if (b) b.style.display="none"; }
    function label(s){ const t=text(); if (t) t.textContent = s || ""; }
    function draw(){ const f=fill(); if (!f) return; f.style.width = (stepsTotal? (stepsDone/stepsTotal)*100 : 0).toFixed(1)+"%"; }
    const queue = [];
    function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal = queue.length; }
    async function run(){
      show(); draw();
      for (const s of queue){
        label(s.lbl); draw();
        try { await s.fn(); } catch(e){ warn("step failed:", s.lbl, e); }
        stepsDone++; draw();
      }
      label("Finalizing…"); draw();
      await new Promise(r=>setTimeout(r, 80));
      hide();
    }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- state ----------
  let engine, scene;
  let MAP_FILES = [];

  // Expose for other modules (rig uses these if needed)
  Object.defineProperties(window, {
    ENGINE: { get(){ return engine; } },
    SCENE:  { get(){ return scene;  } }
  });

  // ---------- map list / selector ----------
  function populateMapSelector() {
    const sel = $("#map-select");
    if (!sel) return;
    sel.innerHTML = MAP_FILES.length
      ? MAP_FILES.map((m,i) => `<option value="${i}">${m.title || m.file}</option>`).join("")
      : `<option value="-1">(no maps found)</option>`;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved && MAP_FILES[+saved]) sel.value = saved;
      else sel.value = "0";
    } catch(_){ sel.value = "0"; }
    sel.onchange = () => {
      try { localStorage.setItem("selectedMapIndex", sel.value); } catch(_){}
    };
  }

  async function loadManifest() {
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;

    // Fallback to known files if manifest missing
    if (!MAP_FILES.length) {
      MAP_FILES = [
        { file: "Abandoned_House.glb",      title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",      title: "Furnished House", def: "furnished_house.js" },
        { file: "jailhouse.glb",            title: "Jailhouse",       def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",       def: "apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function getSelectedMap() {
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value || "0", 10) || 0));
    return MAP_FILES[idx];
  }

  // ---------- Babylon setup ----------
  function startRenderLoop() {
    if (!engine || !scene) return;
    engine.runRenderLoop(() => {
      // Render ONLY when there is a camera to avoid "No camera defined"
      if (scene.activeCamera) scene.render();
    });
    window.addEventListener("resize", () => engine && engine.resize());
  }

  async function prepareEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded yet");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // Hemi for gentle global light
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    // Slight fog for night vibe
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    // kick the loop (safe)
    startRenderLoop();
  }

  // ---------- map def loading ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const cands = [];
    if (defNameOrNull) cands.push(`./assets/models/map/${defNameOrNull}`);
    cands.push(`./assets/models/map/${baseNoExt}.config.js`);
    cands.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of cands) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && (MAP_DEF.spawn || MAP_DEF.scale || MAP_DEF.offset)) {
        log("Loaded MAP_DEF:", c);
        return true;
      }
    }
    // Synthesize a minimal one
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.file = mapFile || MAP_DEF.file || "";
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x:0,y:0,z:0 };
    MAP_DEF.spawn  = MAP_DEF.spawn  || { x:0, y:1.8, z:0 };
    warn("No MAP_DEF found; using synthesized fallback.");
    return true;
  }

  function applyMapDefToRoot(root) {
    if (!root || !window.MAP_DEF) return;
    const d = MAP_DEF;
    try {
      // scaling
      if (typeof d.scale === "number") {
        root.scaling = new BABYLON.Vector3(d.scale, d.scale, d.scale);
      }
      // rotationY (degrees)
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation = new BABYLON.Vector3(0, yaw, 0);
      // offset
      if (d.offset) {
        root.position.x = (d.offset.x||0);
        root.position.y = (d.offset.y||0);
        root.position.z = (d.offset.z||0);
      }
    } catch(e){ warn("applyMapDefToRoot failed", e); }
  }

  async function loadSelectedMap() {
    const chosen  = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "", "./assets/models/map/", mapFile, scene
      );
      const root = res.meshes[0] || null;
      if (root) {
        applyMapDefToRoot(root);
        // collisions receiving
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }
      log("Map imported:", mapFile);
    } catch (e) {
      warn("Map import failed, creating ground fallback:", e);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 200, height: 200 }, scene);
      g.checkCollisions = true;
    }
  }

  // ---------- spawn ----------
  function placePlayerAtSpawn() {
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? { x: d.spawn.x||0, y: d.spawn.y||1.8, z: d.spawn.z||0 } : { x:0, y:1.8, z:0 };

    // Prefer PP.rig.body provided by the rig file
    const rig = window.PP && PP.rig;
    if (rig && rig.body) {
      rig.body.position.set(sp.x, sp.y, sp.z);
      if (rig.fpCam) rig.fpCam.position.copyFrom(rig.body.position);
      if (rig.tpCam) rig.tpCam.target.copyFrom(rig.body.position);
      log("Spawned rig at", sp);
      return;
    }

    // Fallback: if a camera already exists, place it
    const cam = scene.activeCamera;
    if (cam) {
      cam.position.set(sp.x, sp.y, sp.z);
      try { cam.setTarget(new BABYLON.Vector3(sp.x, sp.y + 1, sp.z + 2)); } catch(_) {}
      log("Spawned camera at", sp);
    } else {
      // Try again a bit later if rig/camera arrives after bootstrap
      setTimeout(placePlayerAtSpawn, 150);
    }
  }

  function enablePointerLockOnce() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    function tryLock(){ if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch(_){ } } }
    canvas.addEventListener("click", () => tryLock(), { passive:true });
    setTimeout(tryLock, 250);
  }

  function toast(msg){
    const t = $("#toast"); if (!t) { console.log(msg); return; }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._h); toast._h = setTimeout(() => { t.style.display = "none"; }, 2200);
  }

  // ---------- start pipeline ----------
  let started = false;
  async function startPipeline() {
    if (started) return;
    started = true;

    const title = $("#title-screen");
    if (title) title.style.display = "none";

    Loader.reset(); Loader.label("Initializing…"); Loader.show();

    try {
      Loader.addStep("Loading map list…",    async () => await loadManifest());
      Loader.addStep("Preparing engine…",    async () => await prepareEngineScene());
      Loader.addStep("Loading selected map…",async () => await loadSelectedMap());
      Loader.addStep("Placing player…",      async () => placePlayerAtSpawn());
      Loader.addStep("Pointer lock…",        async () => enablePointerLockOnce());
      await Loader.run();

      // focus canvas
      const canvas = document.getElementById("renderCanvas");
      try { canvas?.focus?.(); } catch(_){}

      // Let the rest of the app know we’re live
      window.dispatchEvent(new CustomEvent("pp:start"));
    } catch (err) {
      warn("Boot failed:", err);
      toast("Boot failed. See console for details.");
      started = false; // allow retry
      if (title) title.style.display = "flex";
    }
  }

  // ---------- wire UI and early manifest load ----------
  (function wireStart(){
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", (e)=>{ e.preventDefault(); startPipeline(); }, { passive: false, once:true });

    // keyboard fallback (Enter/Space) on title
    document.addEventListener("keydown", (e) => {
      const onTitle = $("#title-screen") && $("#title-screen").style.display !== "none";
      if (onTitle && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); startPipeline(); }
    }, { passive: false });

    // Preload manifest list for the selector (non-blocking)
    window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
  })();

})();
