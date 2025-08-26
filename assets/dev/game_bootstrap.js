/* game_bootstrap.js — start flow + map select + map load + transforms + spawn + pointer lock + HUD glue */
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const log = (...a) => { try { console.log("[bootstrap]", ...a); } catch (_) {} };
  const warn = (...a) => { try { console.warn("[bootstrap]", ...a); } catch (_) {} };

  function docResolve(path) {
    try { return new URL(path, document.baseURI).toString(); }
    catch (_) { return path; }
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
      warn("fetchJSON failed", url, e);
      return null;
    }
  }

  // ---------- map list / selector ----------
  let MAP_FILES = [];
  function populateMapSelector() {
    const sel = $("#map-select");
    if (!sel) return;
    sel.innerHTML = MAP_FILES.length
      ? MAP_FILES.map((m, i) => `<option value="${i}">${m.title || m.file}</option>`).join("")
      : `<option value="-1">(no maps found)</option>`;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      sel.value = saved && MAP_FILES[+saved] ? saved : "0";
    } catch (_) { sel.value = "0"; }
    sel.onchange = () => { try { localStorage.setItem("selectedMapIndex", sel.value); } catch (_) {} };
  }

  async function loadManifest() {
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;

    if (!MAP_FILES.length) {
      MAP_FILES = [
        { file: "Abandoned_House.glb",      title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",      title: "Furnished House", def: "furnished_house.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",       def: "apartment_floor_plan.config.js" },
        { file: "jailhouse.glb",            title: "Jailhouse",       def: "jailhouse.js" }
      ];
    }
    populateMapSelector();
  }

  function getSelectedMap() {
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length - 1, parseInt(sel?.value || "0", 10) || 0));
    return MAP_FILES[idx];
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box = () => $("#loading-box");
    const text = () => $("#loading-text");
    const fill = () => $("#loading-fill");
    let stepsDone = 0, stepsTotal = 0;
    function show() { const b = box(); if (b) b.style.display = "flex"; }
    function hide() { const b = box(); if (b) b.style.display = "none"; }
    function label(s) { const t = text(); if (t) t.textContent = s || ""; }
    function draw() { const f = fill(); if (f) f.style.width = (stepsTotal ? (stepsDone/stepsTotal)*100 : 0).toFixed(1) + "%"; }
    const queue = [];
    function addStep(lbl, fn) { queue.push({ lbl, fn }); stepsTotal = queue.length; }
    async function run() {
      show(); draw();
      for (const s of queue) {
        label(s.lbl); draw();
        try { await s.fn(); } catch (e) { warn("step failed:", s.lbl, e); }
        stepsDone++; draw();
      }
      label("Finalizing…"); draw();
      await new Promise(r => setTimeout(r, 120));
      hide();
    }
    function reset(){ queue.length = 0; stepsDone = 0; stepsTotal = 0; draw(); }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- Babylon setup ----------
  let engine, scene, camera, hemi;
  async function prepareEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.05);
    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.8, 0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    // Clean inputs then add both
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();
    camera.attachControl(canvas, true);

    // Expose globals for other systems
    window.engine = engine;
    window.scene  = scene;
    window.SCENE  = scene;   // some scripts look for SCENE
    window.camera = camera;

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // HUD XYZ visible
    const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";
    scene.onBeforeRenderObservable.add(() => {
      try {
        $("#hud-x").textContent = camera.position.x.toFixed(2);
        $("#hud-y").textContent = camera.position.y.toFixed(2);
        $("#hud-z").textContent = camera.position.z.toFixed(2);
      } catch (_) {}
    });
  }

  // ---------- map def + load ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) { log("Loaded MAP_DEF from", c); return true; }
    }
    warn("No MAP_DEF found; synthesizing minimal fallback.");
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.title = MAP_DEF.title || (baseNoExt || "Unknown Map");
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x: 0, y: 0, z: 0 };
    MAP_DEF.spawn = MAP_DEF.spawn || { x: 0, y: 1.8, z: 0 };
    return true;
  }

  async function loadSelectedMap() {
    const chosen  = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, mapFile);

    let root = null;
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", mapFile, scene);
      root = res.meshes[0] || null;

      // Apply transforms from MAP_DEF to the imported root
      if (root) {
        const s = (typeof MAP_DEF.scale === "number" && MAP_DEF.scale > 0) ? MAP_DEF.scale : 1;
        root.scaling.set(s, s, s);

        const ry = (MAP_DEF.rotationY || 0) * Math.PI / 180;
        root.rotation.y = ry;

        const off = MAP_DEF.offset || { x: 0, y: 0, z: 0 };
        root.position.addInPlace(new BABYLON.Vector3(off.x || 0, off.y || 0, off.z || 0));

        // collisions
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch (_) {} });
      }

      log("Map imported:", mapFile, "scale=", MAP_DEF.scale, "rotY=", MAP_DEF.rotationY, "offset=", MAP_DEF.offset);
    } catch (e) {
      warn("Map import failed, creating ground fallback", e);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 180, height: 180 }, scene);
      g.checkCollisions = true;
    }
  }

  function enforceSpawn() {
    if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
    const sp = MAP_DEF.spawn || { x: 0, y: 1.8, z: 0 };
    camera.position.set(sp.x || 0, sp.y || 1.8, sp.z || 0);
    log("Spawn:", sp);
  }

  function enablePointerLock() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (_) {} }
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) {
        try { (window.toast || ((m)=>console.log(m)))("Click the canvas to lock mouse"); } catch (_) {}
      }
    });
  }

  // ---------- HUD/minimap/belt glue ----------
  function ensureHUDVisible() {
    const hudBar = $("#hud-bar"); if (hudBar) hudBar.style.display = "flex";
    const belt = $("#belt"); if (belt) belt.style.display = "flex";
    const hudXYZ = $("#hud-xyz"); if (hudXYZ) hudXYZ.style.display = "block";
  }

  // If your belt isn’t populated by other scripts, create a minimal fallback so it’s not “just a dot”.
  function ensureBeltFallback() {
    const belt = $("#belt");
    if (!belt) return;
    if (belt.children.length > 0) return; // something else already built it

    const items = [
      { key: "EMF",      icon: "./assets/icons/emf.png" },
      { key: "UV",       icon: "./assets/icons/uv.png" },
      { key: "Spirit",   icon: "./assets/icons/spirit.png" },
      { key: "DOTS",     icon: "./assets/icons/camera.png" },
      { key: "Notebook", icon: "./assets/icons/notebook.png" },
      { key: "Lighter",  icon: "./assets/icons/lighter.png" }
    ];
    items.forEach((it, i) => {
      const slot = document.createElement("div");
      slot.className = "slot" + (i===0 ? " active" : "");
      const img = document.createElement("img");
      img.alt = it.key;
      img.src = it.icon;
      img.style.maxWidth = "70%";
      img.style.maxHeight = "70%";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = it.key;
      slot.appendChild(img);
      slot.appendChild(label);
      belt.appendChild(slot);
    });
  }

  function announceSceneReady() {
    try {
      document.dispatchEvent(new CustomEvent("GameSceneReady", { detail: { engine, scene, camera, MAP_DEF } }));
    } catch (_) {}
    // a couple of optional hooks other scripts might expose
    try { window.initMinimap && window.initMinimap(scene, camera); } catch (_) {}
    try { window.initHUD && window.initHUD(); } catch (_) {}
    try { window.initInventory && window.initInventory(scene, camera); } catch (_) {}
  }

  // ---------- start button flow ----------
  let started = false;
  async function safeStart(e) {
    e?.preventDefault?.();
    if (started) return;
    started = true;

    const title = $("#title-screen"); if (title) title.style.display = "none";

    Loader.reset(); Loader.label("Initializing…"); Loader.show();

    Loader.addStep("Loading map list…",    async () => await loadManifest());
    Loader.addStep("Preparing engine…",    async () => await prepareEngineScene());
    Loader.addStep("Loading map…",         async () => await loadSelectedMap());
    Loader.addStep("Enforcing spawn…",     async () => enforceSpawn());
    Loader.addStep("Pointer lock ready…",  async () => enablePointerLock());
    Loader.addStep("Show HUD…",            async () => { ensureHUDVisible(); ensureBeltFallback(); });

    await Loader.run();

    // Focus canvas and try to lock once
    const canvas = document.getElementById("renderCanvas");
    try { canvas?.focus?.(); } catch (_) {}
    try { canvas?.requestPointerLock?.(); } catch (_) {}

    // Tell other scripts the scene is good to go
    announceSceneReady();
  }

  // hook UI
  (function wireStart() {
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", safeStart, { passive: false });
    document.addEventListener("keydown", (e) => {
      if (!started && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); safeStart(e); }
    }, { passive: false });

    // Preload manifest so dropdown is filled on first paint
    window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
  })();
})();
