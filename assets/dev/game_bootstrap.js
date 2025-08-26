/* game_bootstrap.js — start flow + map select + map load + vanZone spawn + pointer lock */
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  // ---------- small helpers ----------
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
    } catch (_) {
      sel.value = "0";
    }
    sel.onchange = () => {
      try { localStorage.setItem("selectedMapIndex", sel.value); } catch (_) {}
    };
  }

  async function loadManifest() {
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;
    if (!MAP_FILES.length) {
      MAP_FILES = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.js" },
        { file: "furnished_house.glb", title: "Furnished House", def: "furnished_house.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment", def: "apartment_floor_plan.js" },
        { file: "jailhouse.glb", title: "Jailhouse", def: "jailhouse.js" },
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
    function draw() {
      const f = fill(); if (!f) return;
      const pct = stepsTotal ? (stepsDone / stepsTotal) : 0;
      f.style.width = (pct * 100).toFixed(1) + "%";
    }
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
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    // Make sure keyboard/mouse both work together
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();

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

  // ---------- ground probe (like index3.html) ----------
  function pickGroundHeightAt(x, z) {
    try {
      const origin = new BABYLON.Vector3(x, 1000, z);
      const dir = new BABYLON.Vector3(0, -1, 0);
      const ray = new BABYLON.Ray(origin, dir, 3000);
      const hit = scene.pickWithRay(ray, (m) => m && m.isPickable !== false);
      if (hit && hit.hit && hit.pickedPoint) return hit.pickedPoint.y;
    } catch (_) {}
    return 0; // fallback
  }

  // ---------- map def loading (with vanZone back-compat) ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    // known defs in your repo
    candidates.push("./assets/models/map/Abandoned_House.js");
    candidates.push("./assets/models/map/furnished_house.js");
    candidates.push("./assets/models/map/jailhouse.js");
    candidates.push("./assets/models/map/apartment_floor_plan.js");

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) { log("Loaded MAP_DEF from", c); break; }
    }

    // Normalize defaults
    window.MAP_DEF = window.MAP_DEF || {};
    const md = window.MAP_DEF;

    // If map provided spawn but no vanZone, build vanZone from spawn (+ optional offset)
    if (!md.vanZone) {
      const off = md.offset || { x: 0, y: 0, z: 0 };
      const sp = md.spawn || { x: 0, y: 1.7, z: 0 };
      md.vanZone = {
        center: { x: (sp.x || 0) + (off.x || 0), y: (sp.y || 1.7) + (off.y || 0), z: (sp.z || 0) + (off.z || 0) },
        radius: 11
      };
    }
    if (typeof md.vanZone.radius !== "number") md.vanZone.radius = 11;

    return true;
  }

  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", mapFile, scene);
      const root = res.meshes[0] || null;
      if (root) res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch (_) {} });
      log("Map imported:", mapFile);
    } catch (e) {
      warn("Map import failed, creating ground fallback", e);
      BABYLON.MeshBuilder.CreateGround("fallback", { width: 180, height: 180 }, scene).checkCollisions = true;
    }
  }

  function enforceSpawn() {
    const md = window.MAP_DEF || {};
    const vz = md.vanZone;
    if (!vz || !vz.center) return;

    const cx = vz.center.x || 0;
    const cz = vz.center.z || 0;
    const y = pickGroundHeightAt(cx, cz);
    camera.position.set(cx, y + 1.7, cz);
    log("Spawn (vanZone):", { x: cx, y: y + 1.7, z: cz });
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

  // ---------- start button flow ----------
  let started = false;
  async function safeStart(e) {
    e?.preventDefault?.();
    if (started) return;
    started = true;

    const title = $("#title-screen"); if (title) title.style.display = "none";

    Loader.reset(); Loader.label("Initializing…"); Loader.show();

    Loader.addStep("Loading map list…", async () => await loadManifest());
    Loader.addStep("Preparing engine…", async () => await prepareEngineScene());
    Loader.addStep("Loading selected map…", async () => await loadSelectedMap());
    Loader.addStep("Enforcing spawn…", async () => enforceSpawn());
    Loader.addStep("Pointer lock ready…", async () => enablePointerLock());

    await Loader.run();

    const canvas = document.getElementById("renderCanvas");
    try { canvas?.focus?.(); } catch (_) {}
    try { canvas?.requestPointerLock?.(); } catch (_) {}
  }

  (function wireStart() {
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", safeStart, { passive: false });
    document.addEventListener("keydown", (e) => {
      if (!started && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); safeStart(e); }
    }, { passive: false });
    window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
  })();
})();
