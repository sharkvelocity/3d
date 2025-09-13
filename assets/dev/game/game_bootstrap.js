/* game_bootstrap.js — robust start flow for PhasmaPhoney
   - Loads map manifest
   - Imports GLB + matching MAP_DEF (*.config.js or *.js)
   - Applies MAP_DEF {scale, rotationY, offset, spawn/vanZone}
   - If import is empty/invisible -> builds a 900ft x 900ft boxed fallback room
   - Enables pointer lock + HUD XYZ
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
      await new Promise(r=>setTimeout(r, 120));
      hide();
    }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- state ----------
  let engine, scene, camera, hemi;
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
        { file: "Abandoned_House.glb",     title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",     title: "Furnished House", def: "furnished_house.js" },
        { file: "jailhouse.glb",           title: "Jailhouse",       def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb",title: "Apartment",       def: "apartment_floor_plan.config.js" }
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

    canvas.tabIndex = 1;

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // Night-ish feel
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    // Collisions + gravity
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -0.5, 0);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.checkCollisions = true;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    // Mouse look (guaranteed)
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.attached.mouse.buttons = [0,1,2]; // look with any button if not locked
    camera.angularSensibility = 1200;

    // Do NOT use Babylon WASD — your rig handles movement
    camera.keysUp.length = camera.keysDown.length = camera.keysLeft.length = camera.keysRight.length = 0;

    scene.activeCamera = camera;

    // Attach controls with retries (overlays sometimes steal focus)
    function attachControlsHard() {
      try { camera.detachControl(); } catch {}
      camera.attachControl(canvas, true);
      canvas.focus();
    }
    attachControlsHard();
    setTimeout(attachControlsHard, 150);
    setTimeout(attachControlsHard, 600);

    // Pointer lock helper
    (function pointerLockLoop(){
      const wantLock = true;
      const locked = (document.pointerLockElement === canvas);
      if (wantLock && !locked){
        try { canvas.requestPointerLock?.(); } catch {}
      }
      setTimeout(pointerLockLoop, 800);
    })();

    canvas.addEventListener("click", () => {
      try { canvas.requestPointerLock?.(); } catch {}
      attachControlsHard();
    });

    engine.runRenderLoop(() => scene && scene.render());
    window.addEventListener("resize", () => engine && engine.resize());

    // XYZ HUD
    try {
      const hx = $("#hud-x"), hy=$("#hud-y"), hz=$("#hud-z");
      scene.onBeforeRenderObservable.add(() => {
        const p = scene.activeCamera?.position;
        if (!p) return;
        if (hx) hx.textContent = p.x.toFixed(2);
        if (hy) hy.textContent = p.y.toFixed(2);
        if (hz) hz.textContent = p.z.toFixed(2);
      });
    } catch(_){}

    // Export globals
    window.ENGINE = engine; window.SCENE = scene; window.camera = camera;
    log("Engine/Scene ready");
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
      if (typeof d.scale === "number") {
        root.scaling = new BABYLON.Vector3(d.scale, d.scale, d.scale);
      }
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation = new BABYLON.Vector3(0, yaw, 0);
      if (d.offset) {
        root.position.x = (d.offset.x||0);
        root.position.y = (d.offset.y||0);
        root.position.z = (d.offset.z||0);
      }
    } catch(e){ warn("applyMapDefToRoot failed", e); }
  }

  // ---------- boxed fallback (900ft x 900ft) ----------
  function createFallbackRoom() {
    const FT_TO_M = 0.3048;
    const sizeM = 900 * FT_TO_M;        // ~274.32 m
    const heightM = 3.2;                // ~10.5 ft
    const wallT = 0.25;

    const root = new BABYLON.TransformNode("Fallback_Room", scene);

    const matFloor  = new BABYLON.StandardMaterial("matFloor", scene);
    matFloor.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.15);
    const matWall   = new BABYLON.StandardMaterial("matWall", scene);
    matWall.diffuseColor = new BABYLON.Color3(0.18, 0.18, 0.22);
    const matCeil   = new BABYLON.StandardMaterial("matCeil", scene);
    matCeil.diffuseColor = new BABYLON.Color3(0.14, 0.14, 0.18);

    const floor = BABYLON.MeshBuilder.CreateGround("fb_floor", { width: sizeM, height: sizeM }, scene);
    floor.material = matFloor; floor.checkCollisions = true; floor.parent = root;

    const ceil = BABYLON.MeshBuilder.CreateBox("fb_ceil", { width: sizeM, depth: sizeM, height: wallT }, scene);
    ceil.material = matCeil; ceil.checkCollisions = true; ceil.parent = root;
    ceil.position.y = heightM;

    const half = sizeM / 2, h2 = heightM / 2;
    function makeWall(name, w, h, d, px, py, pz){
      const m = BABYLON.MeshBuilder.CreateBox(name, { width:w, height:h, depth:d }, scene);
      m.material = matWall; m.checkCollisions = true; m.parent = root;
      m.position.set(px, py, pz);
      return m;
    }
    makeWall("fb_wall_n", sizeM, heightM, wallT, 0, h2, -half);
    makeWall("fb_wall_s", sizeM, heightM, wallT, 0, h2,  half);
    makeWall("fb_wall_w", wallT, heightM, sizeM, -half, h2, 0);
    makeWall("fb_wall_e", wallT, heightM, sizeM,  half, h2, 0);

    const pl = new BABYLON.PointLight("fb_light", new BABYLON.Vector3(0, heightM - 0.6, 0), scene);
    pl.intensity = 0.6; pl.parent = root;

    window.MAP_DEF = window.MAP_DEF || {};
    if (!MAP_DEF.spawn) MAP_DEF.spawn = { x:0, y:1.8, z:0 };

    log("Built fallback boxed room", { meters: sizeM, height: heightM });
    return root;
  }

  // Validate map content (some “loads” are empty/culled)
  function mapLooksEmptyOrTiny(meshes) {
    if (!meshes || meshes.length === 0) return true;
    const solids = meshes.filter(m => {
      try {
        return !!(m && m.getTotalVertices && m.getTotalVertices() > 0 && m.isEnabled() && (m.visibility ?? 1) > 0.01);
      } catch { return false; }
    });
    if (!solids.length) return true;
    try {
      let min = new BABYLON.Vector3(+Infinity,+Infinity,+Infinity);
      let max = new BABYLON.Vector3(-Infinity,-Infinity,-Infinity);
      for (const m of solids){
        const bb = m.getBoundingInfo().boundingBox;
        min.minimizeInPlace(bb.minimumWorld);
        max.maximizeInPlace(bb.maximumWorld);
      }
      const size = max.subtract(min);
      const vol = size.x*size.y*size.z;
      return !(isFinite(vol) && vol > 10); // require some volume
    } catch { return false; }
  }

  // ---------- map load or fallback ----------
  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    await tryLoadMapDef(chosen?.def, mapFile);

    let importedMeshes = null;
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/models/map/",
        mapFile,
        scene
      );
      importedMeshes = res.meshes || [];
      const root = res.meshes[0] || null;
      if (root) applyMapDefToRoot(root);
      importedMeshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      log("Map imported:", mapFile, "#meshes:", importedMeshes.length);
    } catch (e) {
      warn("Map import threw; creating boxed fallback:", e);
      createFallbackRoom();
      return;
    }

    // If import “succeeded” but looks empty/tiny → fallback room
    if (mapLooksEmptyOrTiny(importedMeshes)) {
      warn("Imported map looks empty/tiny; building boxed fallback.");
      createFallbackRoom();
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
    function lockTry(){ if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch(_){ } } }
    canvas.addEventListener("click", () => lockTry(), { passive:true });
    setTimeout(lockTry, 250);
  }

  function toast(msg){
    const t = $("#toast"); if (!t) { console.log(msg); return; }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._h); toast._h = setTimeout(() => { t.style.display = "none"; }, 2200);
  }

  // ---------- start flow ----------
  let started = false;
  async function startPipeline(e) {
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

      try { window.DEVTOOLS?.onBoot?.(scene, engine); } catch(_){}
      try { window.MINIMAP?.refresh?.(); } catch(_){}

      log("Start pipeline complete");
    } catch (err) {
      warn("Boot failed:", err);
      toast("Boot failed. See console for details.");
      started = false;
      const title2 = $("#title-screen"); if (title2) title2.style.display = "flex";
    }
  }

  // ---------- wire UI and early manifest load ----------
  (function wireStart(){
    const btn = $("#start-button");
    if (btn) btn.addEventListener("click", startPipeline, { passive: false });
    document.addEventListener("keydown", (e) => {
      if (!started && (e.key === "Enter" || e.code === "Space")) { e.preventDefault(); startPipeline(e); }
    }, { passive: false });

    window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
  })();
})();
