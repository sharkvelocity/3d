/* game_bootstrap.js — start flow + map select + map load + spawn + pointer lock + audio unlock */
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
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb", title: "Furnished House", def: "furnished_house.js" },
        { file: "jailhouse.glb", title: "Jailhouse", def: "jailhouse.config.js" },
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
  let engine, scene, hemi;
  async function prepareEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.05);
    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.35;

    // Do NOT create or attach UniversalCamera here
    // player_rig_controller_final.js owns active camera(s)

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // HUD XYZ visible
    const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";
    scene.onBeforeRenderObservable.add(() => {
      try {
        const cam = scene.activeCamera;
        if (!cam) return;
        $("#hud-x").textContent = cam.position.x.toFixed(2);
        $("#hud-y").textContent = cam.position.y.toFixed(2);
        $("#hud-z").textContent = cam.position.z.toFixed(2);
      } catch (_) {}
    });

    return scene;
  }

  // ---------- map def loading ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push("./assets/models/map/Abandoned_House.config.js");
    candidates.push("./assets/models/map/furnished_house.js");
    candidates.push("./assets/models/map/jailhouse.config.js");

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) { log("Loaded MAP_DEF from", c); return true; }
    }
    warn("No MAP_DEF found; synthesizing minimal fallback.");
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.spawn = MAP_DEF.spawn || { x: 0, y: 1.8, z: 0 };
    return true;
  }

  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/models/map/",
        mapFile,
        scene
      );
      const root = res.meshes[0] || null;
      if (root) {
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch (_) {} });
      }
      log("Map imported:", mapFile);

      // Hide stray far meshes (walkie planes, etc.)
      const bad = scene.meshes.filter(m =>
        /walkie|plane/i.test(m.name) ||
        (Math.abs(m.position.x) + Math.abs(m.position.z) > 5000));
      bad.forEach(m => m.setEnabled(false));
    } catch (e) {
      warn("Map import failed, creating ground fallback", e);
      BABYLON.MeshBuilder.CreateGround("fallback", { width: 180, height: 180 }, scene).checkCollisions = true;
    }
  }

  function enforceSpawn() {
    if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
    const sp = MAP_DEF.spawn || { x: 0, y: 1.8, z: 0 };
    if (scene.activeCamera) scene.activeCamera.position.set(sp.x || 0, sp.y || 1.8, sp.z || 0);
    log("Spawn:", sp);
  }

  function enablePointerLock() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (_) {} }
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) return;
    });
  }

  function unlockAudio() {
    try { BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.unlock(); } catch (_) {}
    document.body.addEventListener("pointerdown", () => {
      try { BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.unlock(); } catch(_) {}
    }, { once:true, capture:true });
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
    Loader.addStep("Unlocking audio…", async () => unlockAudio());

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
