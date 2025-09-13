// File: assets/dev/game/game_bootstrap.js
/* Robust bootstrap:
   - Creates engine/scene/camera first (mouse + WASD + pointer lock)
   - Loads selected map (from maps.json); if it fails, builds a 900ft x 900ft fallback room
   - Defers belt/van UI until pp:start
   - Starts weather after scene/camera exist
*/
(function () {
  if (window.__PP_BOOT_V2__) return;
  window.__PP_BOOT_V2__ = true;

  const FT_TO_M = 0.3048;

  // ---------------- tiny DOM helpers ----------------
  const $ = (s) => document.querySelector(s);
  const show = (el, d = "block") => el && (el.style.display = d);
  const hide = (el) => el && (el.style.display = "none");

  // ---------------- loader UI ----------------
  const L = {
    box: () => $("#loading-box"),
    text: () => $("#loading-text"),
    fill: () => $("#loading-fill"),
    steps: [],
    i: 0,
    add(lbl, fn) { this.steps.push({ lbl, fn }); },
    async run() {
      const box = this.box(); if (box) box.style.display = "flex";
      for (let k = 0; k < this.steps.length; k++) {
        this.i = k;
        const s = this.steps[k];
        const t = this.text(); if (t) t.textContent = s.lbl;
        const f = this.fill(); if (f) f.style.width = (100 * (k / this.steps.length)).toFixed(1) + "%";
        try { await s.fn(); } catch (e) { console.warn("[bootstrap]", s.lbl, e); }
      }
      const f = this.fill(); if (f) f.style.width = "100%";
      await new Promise(r => setTimeout(r, 120));
      const box2 = this.box(); if (box2) box2.style.display = "none";
    }
  };

  // ---------------- state ----------------
  let engine, scene, camera, canvas;
  let MAPS = [];

  function setGlobals() {
    window.ENGINE = engine;
    window.SCENE = scene;
    window.camera = camera;
  }

  // ---------------- engine/scene/camera ----------------
  async function makeEngineScene() {
    canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");

    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    scene = new BABYLON.Scene(engine);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.05);

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.35;

    // UniversalCamera with mouse+WASD
    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.8, 0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    // ensure inputs
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();

    scene.activeCamera = camera;
    camera.attachControl(canvas, true);

    // Pointer lock + focus
    const wantLock = { v: false };
    const reqLock = () => { try { canvas.requestPointerLock?.(); } catch {} };
    canvas.addEventListener("click", () => { wantLock.v = true; canvas.focus(); reqLock(); }, { passive: true });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas && wantLock.v) reqLock();
    });
    // Make sure canvas is focusable & focused once
    try { canvas.setAttribute("tabindex", "0"); canvas.focus(); } catch {}

    // Render loop AFTER active camera is set
    engine.runRenderLoop(() => scene && scene.render());
    window.addEventListener("resize", () => engine && engine.resize());

    // Export globals
    setGlobals();

    // HUD XYZ
    try {
      scene.onBeforeRenderObservable.add(() => {
        const p = camera.position;
        const el = document.getElementById("hud-xyz");
        if (el) el.textContent = `XYZ: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
      });
    } catch {}
  }

  // ---------------- manifest + selection ----------------
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  }

  async function loadManifest() {
    try {
      const j = await fetchJSON("./assets/models/map/maps.json");
      if (Array.isArray(j)) MAPS = j;
      else if (j && Array.isArray(j.maps)) MAPS = j.maps;
    } catch {
      // fallback to known names
      MAPS = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb", title: "Furnished House", def: "furnished_house.js" },
        { file: "jailhouse.glb", title: "Jailhouse", def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment", def: "apartment_floor_plan.config.js" }
      ];
    }

    // Populate selector
    const sel = $("#map-select");
    if (sel) {
      sel.innerHTML = MAPS.map((m, i) =>
        `<option value="${i}">${m.title || m.file}</option>`).join("");
      const saved = localStorage.getItem("selectedMapIndex");
      sel.value = (saved && MAPS[+saved]) ? saved : "0";
      sel.onchange = () => localStorage.setItem("selectedMapIndex", sel.value);
    }
  }

  function chosenMap() {
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAPS.length - 1, parseInt(sel?.value || "0", 10) || 0));
    return MAPS[idx];
  }

  // ---------------- MAP_DEF loader ----------------
  function docResolve(path) {
    try { return new URL(path, document.baseURI).toString(); }
    catch { return path; }
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

  async function loadMapDef(defNameOrNull, mapFile) {
    window.MAP_DEF = undefined;
    const base = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${base}.config.js`);
    candidates.push(`./assets/models/map/${base}.js`);

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) return true;
    }
    // synthesize a minimal one
    window.MAP_DEF = {
      file: mapFile || "",
      scale: 1,
      rotationY: 0,
      offset: { x: 0, y: 0, z: 0 },
      spawn: { x: 0, y: 1.8, z: 0 }
    };
    return true;
  }

  function applyMapDefToRoot(root) {
    if (!root || !window.MAP_DEF) return;
    const d = window.MAP_DEF;
    if (typeof d.scale === "number") {
      root.scaling = new BABYLON.Vector3(d.scale, d.scale, d.scale);
    }
    const yaw = (d.rotationY || 0) * Math.PI / 180;
    root.rotation = new BABYLON.Vector3(0, yaw, 0);
    if (d.offset) {
      root.position.set(d.offset.x || 0, d.offset.y || 0, d.offset.z || 0);
    }
  }

  // ---------------- fallback room (900ft x 900ft) ----------------
  function buildFallbackRoom() {
    const sizeFt = 900;
    const size = sizeFt * FT_TO_M;       // ~274.32m
    const half = size / 2;
    const h = 3.0;                       // wall height meters

    // ground
    const ground = BABYLON.MeshBuilder.CreateGround("fb_ground",
      { width: size, height: size }, scene);
    ground.position.y = 0;
    ground.checkCollisions = true;

    // simple mat
    const gMat = new BABYLON.StandardMaterial("fb_ground_mat", scene);
    gMat.diffuseColor = new BABYLON.Color3(0.08, 0.1, 0.12);
    ground.material = gMat;

    // walls
    const wallOpts = { width: size, height: h, depth: 0.3 };
    const w1 = BABYLON.MeshBuilder.CreateBox("fb_w1", wallOpts, scene);
    const w2 = BABYLON.MeshBuilder.CreateBox("fb_w2", wallOpts, scene);
    w1.position.set(0, h / 2, -half);
    w2.position.set(0, h / 2, half);

    const w3 = BABYLON.MeshBuilder.CreateBox("fb_w3", { width: size, height: h, depth: 0.3 }, scene);
    const w4 = BABYLON.MeshBuilder.CreateBox("fb_w4", { width: size, height: h, depth: 0.3 }, scene);
    w3.scaling.z = 1;
    w4.scaling.z = 1;
    w3.rotation.y = Math.PI / 2;
    w4.rotation.y = Math.PI / 2;
    w3.position.set(-half, h / 2, 0);
    w4.position.set(half, h / 2, 0);

    [w1, w2, w3, w4].forEach(w => (w.checkCollisions = true));

    const wMat = new BABYLON.StandardMaterial("fb_wall_mat", scene);
    wMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.18);
    [w1, w2, w3, w4].forEach(w => (w.material = wMat));

    // ceiling
    const ceiling = BABYLON.MeshBuilder.CreateGround("fb_ceiling",
      { width: size, height: size }, scene);
    ceiling.position.y = h;
    ceiling.rotation.x = Math.PI;
    ceiling.checkCollisions = true;
    const cMat = new BABYLON.StandardMaterial("fb_ceiling_mat", scene);
    cMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
    ceiling.material = cMat;

    // spawn cam inside
    camera.position.set(0, 1.8, 0);
    camera.setTarget(new BABYLON.Vector3(0, 1.8, 2));
    console.log("[bootstrap] Fallback room built:", sizeFt, "ft");
  }

  // ---------------- map import ----------------
  async function importSelectedMapOrFallback() {
    const m = chosenMap();
    const file = m?.file || "Abandoned_House.glb";

    await loadMapDef(m?.def, file);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      const root = res.meshes[0];
      if (root) {
        applyMapDefToRoot(root);
        res.meshes.forEach(x => { try { x.checkCollisions = true; x.receiveShadows = true; } catch {} });
        // move camera to spawn from MAP_DEF
        const sp = window.MAP_DEF?.spawn || { x: 0, y: 1.8, z: 0 };
        camera.position.set(sp.x || 0, sp.y || 1.8, sp.z || 0);
        camera.setTarget(new BABYLON.Vector3(sp.x || 0, (sp.y || 1.8) + 1, (sp.z || 0) + 2));
        console.log("[bootstrap] Map imported:", file);
        return;
      }
      // if no meshes, fallback
      buildFallbackRoom();
    } catch (e) {
      console.warn("[bootstrap] Map import failed, using fallback room:", e);
      buildFallbackRoom();
    }
  }

  // ---------------- weather kick ----------------
  function startWeather() {
    try {
      // Let your weather module pick & init after scene exists
      if (window.Weather && typeof Weather.init === "function") {
        const r = Math.random();
        const next = r < 0.45 ? "Clear" : r < 0.80 ? "Rainstorm" : r < 0.90 ? "Bloodmoon" : "Snow";
        Weather.set(next, { immediate: true, intensity: 0.85 });
        Weather.init();
      }
    } catch (e) { console.warn("[bootstrap] weather init failed", e); }
  }

  // ---------------- UI gating ----------------
  function gateUIBeforeStart() {
    hide(document.getElementById("belt"));
    hide(document.getElementById("action-bar"));
    hide(document.getElementById("notebook-modal"));
    // belt_manager will remount on pp:start and make it visible
  }
  function showUIAfterStart() {
    show(document.getElementById("belt"), "flex");
    show(document.getElementById("action-bar"), "flex");
  }

  // ---------------- pipeline ----------------
  async function startPipeline() {
    gateUIBeforeStart();

    L.add("Preparing engine…", makeEngineScene);
    L.add("Loading maps list…", loadManifest);
    L.add("Loading selected map…", importSelectedMapOrFallback);
    await L.run();

    // do not start gameplay/weather until the player clicks Start (pp:start)
    const onStart = () => {
      showUIAfterStart();
      startWeather();
      window.removeEventListener("pp:start", onStart);
    };
    window.addEventListener("pp:start", onStart);

    // Also make sure the canvas is focused for controls
    try { canvas.focus(); } catch {}
  }

  // Wire the Start button to dispatch pp:start (index.html already removes title)
  (function wireStartButton() {
    const btn = document.getElementById("start-button");
    if (!btn) return;
    btn.addEventListener("click", () => {
      try { document.getElementById('renderCanvas')?.focus?.(); } catch {}
      window.dispatchEvent(new CustomEvent("pp:start"));
    }, { once: true });
  })();

  // Kick pipeline as soon as DOM is ready
  if (document.readyState !== "loading") startPipeline();
  else document.addEventListener("DOMContentLoaded", startPipeline);
})();
