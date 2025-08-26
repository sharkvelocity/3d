/* assets/dev/game_bootstrap.js — unified map transform + correct spawn */
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  // ---------- tiny helpers ----------
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
        { file: "apartment_floor_plan.glb", title: "Apartment", def: "apartment_floor_plan.config.js" },
      ];
    }
    populateMapSelector();
  }

  function getSelectedMap() {
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length - 1, parseInt(sel?.value || "0", 10) || 0));
    return MAP_FILES[idx];
  }

  // ---------- math helpers (shared by minimap etc.) ----------
  const toRad = d => d * Math.PI / 180;

  function localToWorld(p, def) {
    const s = (def?.scale ?? 1);
    const yaw = toRad(def?.rotationY ?? 0);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);

    const lx = (p?.x ?? 0), ly = (p?.y ?? 0), lz = (p?.z ?? 0);
    // scale then rotate
    const sx = lx * s, sy = ly * s, sz = lz * s;
    const rx = sx * cos - sz * sin;
    const rz = sx * sin + sz * cos;

    return new BABYLON.Vector3(
      (def?.offset?.x ?? 0) + rx,
      (def?.offset?.y ?? 0) + sy,
      (def?.offset?.z ?? 0) + rz
    );
  }

  function worldToLocal(v, def) {
    const s = (def?.scale ?? 1);
    const yaw = toRad(def?.rotationY ?? 0);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);

    const x = (v.x - (def?.offset?.x ?? 0));
    const y = (v.y - (def?.offset?.y ?? 0));
    const z = (v.z - (def?.offset?.z ?? 0));

    // inverse rotate
    const rx = x * cos + z * sin;
    const rz = -x * sin + z * cos;

    // inverse scale
    return { x: rx / s, y: y / s, z: rz / s };
  }

  // expose so minimap / other scripts can reuse the exact same math
  window.localToWorld = localToWorld;
  window.worldToLocal = worldToLocal;

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

    // First person camera
    camera = new BABYLON.UniversalCamera(
// --- expose engine/scene/camera for other modules ---
try {
  if (typeof window !== 'undefined') {
    window.ENGINE = window.ENGINE || (typeof engine!=='undefined' ? engine : (BABYLON.Engine && BABYLON.Engine.LastCreatedEngine));
    window.SCENE  = window.SCENE  || (typeof scene!=='undefined'  ? scene  : (BABYLON.Engine && BABYLON.Engine.LastCreatedScene));
    if (window.SCENE) window.camera = window.SCENE.activeCamera || (typeof camera!=='undefined' ? camera : window.camera);
  }
} catch(e) { console.warn('[bootstrap] export globals failed', e); }
// --- end expose ---
"playerCam", new BABYLON.Vector3(0, 1.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    // HUD XYZ
    const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";
    scene.onBeforeRenderObservable.add(() => {
      try {
        $("#hud-x").textContent = camera.position.x.toFixed(2);
        $("#hud-y").textContent = camera.position.y.toFixed(2);
        $("#hud-z").textContent = camera.position.z.toFixed(2);
      } catch (_) {}
    });
  }

  // ---------- apply map transform to imported meshes ----------
  function applyMapTransform(root, def) {
    if (!root || !def) return;
    // Reset any baked rotation/quat on root so .rotation.y works
    root.rotationQuaternion = null;
    root.scaling.setAll(def.scale ?? 1);
    root.rotation.y = toRad(def.rotationY ?? 0);
    root.position.set(
      def.offset?.x ?? 0,
      def.offset?.y ?? 0,
      def.offset?.z ?? 0
    );
  }

  // ---------- map def loading ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    // known defs
    candidates.push("./assets/models/map/Abandoned_House.config.js");
    candidates.push("./assets/models/map/furnished_house.js");
    candidates.push("./assets/models/map/apartment_floor_plan.config.js");

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) { log("Loaded MAP_DEF from", c); return true; }
    }
    warn("No MAP_DEF found; synthesizing minimal fallback.");
    window.MAP_DEF = window.MAP_DEF || {
      title: "Fallback",
      file: mapFile || null,
      scale: 1, rotationY: 0, offset: { x: 0, y: 0, z: 0 },
      spawn: { x: 0, y: 1.8, z: 0 }
    };
    return true;
  }

  // will be set after import + transform
  let mapRoot = null;

  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    await tryLoadMapDef(chosen?.def, mapFile);

    // Import GLB
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/models/map/",
        mapFile,
        scene
      );
      mapRoot = res?.meshes?.[0] || null;

      // APPLY MAP_DEF TRANSFORM TO ROOT
      applyMapTransform(mapRoot, MAP_DEF);

      // collisions
      if (res && res.meshes) {
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch (_) {} });
      }
      log("Map imported:", mapFile, "root:", mapRoot?.name);

    } catch (e) {
      warn("Map import failed, creating ground fallback", e);
      mapRoot = BABYLON.MeshBuilder.CreateGround("fallback", { width: 180, height: 180 }, scene);
      mapRoot.checkCollisions = true;
    }
  }

  // ---------- spawn & pointer lock ----------
  function enforceSpawnFromDef() {
    if (!(window.MAP_DEF && MAP_DEF.spawn)) return;

    // compute world-space spawn using the SAME math as minimap
    const ws = localToWorld(MAP_DEF.spawn, MAP_DEF);

    // Share spawnWS for other scripts
    window.PP = window.PP || {}; PP.cfg = PP.cfg || {};
    PP.cfg.spawnWS = ws.clone();

    camera.position.copyFrom(ws);
    camera.setTarget(ws.add(new BABYLON.Vector3(0, 1, 2)));

    log("Spawn (local):", MAP_DEF.spawn, "Spawn (world):", ws);
  }

  function enablePointerLock() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (_) {} }
    });
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

  // ---------- start button flow ----------
  let started = false;
  async function safeStart(e) {
    e?.preventDefault?.();
    if (started) return;
    started = true;

    // Hide title
    const title = $("#title-screen"); if (title) title.style.display = "none";

    Loader.reset(); Loader.label("Initializing…"); Loader.show();

    Loader.addStep("Loading map list…", async () => await loadManifest());
    Loader.addStep("Preparing engine…", async () => await prepareEngineScene());
    Loader.addStep("Loading selected map…", async () => await loadSelectedMap());
    Loader.addStep("Applying spawn…", async () => enforceSpawnFromDef());
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
