/* game_bootstrap.js — minimal, robust start flow for PhasmaPhoney
   - Loads map manifest
   - Imports GLB + matching MAP_DEF (*.config.js or *.js)
   - Applies MAP_DEF {scale, rotationY, offset, spawn/vanZone}
   - Ensures camera exists and is active
   - Enables pointer lock and HUD XYZ
   - No external deps besides Babylon & page DOM
*/
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  // ---------- tiny utils ----------
  const $ = (s) => document.querySelector(s);
  const log  = (...a) => { try { console.log("[bootstrap]", ...a); } catch(_){} };
  const warn = (...a) => { try { console.warn("[bootstrap]", ...a); } catch(_){} };

  function docResolve(path) {
    try { return new URL(path, document.baseURI).toString(); }
    catch (_){ return path; }
  }

  function loadScriptOnce(path) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = docResolve(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(docResolve(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } catch (e) {
      warn("fetchJSON failed:", url, e);
      return null;
    }
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box = () => $("#loading-box");
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
      await new Promise(r=>setTimeout(r, 100));
      hide();
    }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- state ----------
  let engine, scene, hemi;
  let MAP_FILES = [];

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

    if (!MAP_FILES.length) {
      MAP_FILES = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
        { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",    def: "apartment_floor_plan.config.js" }
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
  async function prepareEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded yet");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    // Ensure a camera exists and is active
    let cam = scene.activeCamera || scene.getCameraByName?.("playerCam");
    if (!cam) {
      cam = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
      cam.minZ = 0.1;
      cam.inertia = 0;
      cam.applyGravity = true;
      cam.checkCollisions = true;
      cam.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
      cam.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);
      cam.inputs.clear();
      cam.inputs.addMouse();
      cam.inputs.addKeyboard();
    }
    scene.activeCamera = cam;
    try { cam.attachControl(canvas, true); } catch(_){}

    // Render loop
    engine.runRenderLoop(() => { if (scene.activeCamera) scene.render(); });
    window.addEventListener("resize", () => engine && engine.resize());

    // HUD XYZ
    try {
      const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";
      scene.onBeforeRenderObservable.add(() => {
        const p = scene.activeCamera?.position; if (!p) return;
        $("#hud-x") && ($("#hud-x").textContent = p.x.toFixed(2));
        $("#hud-y") && ($("#hud-y").textContent = p.y.toFixed(2));
        $("#hud-z") && ($("#hud-z").textContent = p.z.toFixed(2));
      });
    } catch(_){}
  }

  // ---------- map def loading ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) { log("Loaded MAP_DEF:", c); return true; }
    }
    warn("No MAP_DEF found; synthesizing fallback.");
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.file = mapFile || MAP_DEF.file || "";
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x:0,y:0,z:0 };
    MAP_DEF.spawn  = MAP_DEF.spawn  || { x:0, y:1.8, z:0 };
    return true;
  }

  function applyMapDefToRoot(root) {
    if (!root || !window.MAP_DEF) return;
    const d = MAP_DEF;
    try {
      if (typeof d.scale === "number") root.scaling = new BABYLON.Vector3(d.scale, d.scale, d.scale);
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation = new BABYLON.Vector3(0, yaw, 0);
      if (d.offset) {
        root.position.x = (d.offset.x||0);
        root.position.y = (d.offset.y||0);
        root.position.z = (d.offset.z||0);
      }
    } catch(e){ warn("applyMapDefToRoot failed", e); }
  }

  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", mapFile, scene);
      const root = res.meshes[0] || null;
      if (root) {
        applyMapDefToRoot(root);
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }
      log("Map imported:", mapFile);
    } catch (e) {
      warn("Map import failed, creating ground fallback:", e);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 200, height: 200 }, scene);
      g.checkCollisions = true;
    }
  }

  function centerOfPolygon2D(poly) {
    if (!poly || !poly.length) return {x:0,z:0};
    let x=0,z=0; for (const p of poly){ x += (p.x||0); z += (p.z||0); }
    const n = poly.length || 1; return { x:x/n, z:z/n };
  }

  function enforceSpawn() {
    if (!scene?.activeCamera) return;
    const d = window.MAP_DEF || {};
    const sp = d.spawn
      ? {x: d.spawn.x||0, y: d.spawn.y||1.8, z: d.spawn.z||0}
      : (Array.isArray(d.vanZone) && d.vanZone.length >= 3
          ? (function(){ const c=centerOfPolygon2D(d.vanZone); return {x:c.x, y:1.8, z:c.z}; })()
          : {x:0,y:1.8,z:0});

    scene.activeCamera.position.set(sp.x, sp.y, sp.z);
    try { scene.activeCamera.setTarget(new BABYLON.Vector3(sp.x, sp.y + 1, sp.z + 2)); } catch(_){}
    log("Spawn enforced:", sp);
  }

  function enablePointerLockOnce() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    let tried = false;
    function lockTry(){ if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch(_){ } } }
    canvas.addEventListener("click", () => lockTry(), { passive:true });
    setTimeout(() => { if (!tried) { tried = true; lockTry(); } }, 250);
  }

  function toast(msg){
    const t = $("#toast"); if (!t) { console.log(msg); return; }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._h); toast._h = setTimeout(() => { t.style.display = "none"; }, 2200);
  }

  // ---------- start flow ----------
  let started = false;
  async function safeStart(e) {
    e?.preventDefault?.();
    if (started) return;
    started = true;

    const title = $("#title-screen"); if (title) title.style.display = "none";

    Loader.reset(); Loader.label("Initializing…"); Loader.show();

    try {
      Loader.addStep("Loading map list…", async () => await loadManifest());
      Loader.addStep("Preparing engine…", async () => await prepareEngineScene());
      Loader.addStep("Loading selected map…", async () => await loadSelectedMap());
      Loader.addStep("Placing player…", async () => enforceSpawn());
      Loader.addStep("Pointer lock…", async () => enablePointerLockOnce());
      await Loader.run();

      const canvas = document.getElementById("renderCanvas");
      try { canvas?.focus?.(); } catch(_){}
    } catch (err) {
      warn("Boot failed:", err);
      toast("Boot failed. See console for details.");
      started = false;
      const title = $("#title-screen"); if (title) title.style.display = "flex";
    }
  }

  (function wireStart(){
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", safeStart, { passive: false });
    document.addEventListener("keydown", (e) => {
      if (!started && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); safeStart(e); }
    }, { passive: false });

    window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
  })();
})();
