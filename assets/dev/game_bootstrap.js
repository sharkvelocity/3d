/* game_bootstrap.js — engine+scene+map loader ONLY
   - Waits for pp:start (index.html’s Start button dispatches it)
   - Builds Engine + Scene, exposes ENGINE/SCENE globals
   - Loads map manifest + selected map + MAP_DEF
   - Applies MAP_DEF {scale, rotationY(deg), offset}
   - Does NOT create a camera, pointer-lock, or spawn the player (rig owns those)
*/
(function () {
  "use strict";
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
      await new Promise(r=>setTimeout(r, 80));
      hide();
    }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- state ----------
  let ENGINE = null, SCENE = null;
  let MAP_FILES = [];

  // Make globals readable for other modules (rig expects these)
  function exposeGlobals() {
    try {
      window.ENGINE = ENGINE;
      window.SCENE  = SCENE;
    } catch {}
  }

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

    // fallback options if manifest missing/empty
    if (!MAP_FILES.length) {
      MAP_FILES = [
        { file: "Abandoned_House.glb",       title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",       title: "Furnished House", def: "furnished_house.js" },
        { file: "jailhouse.glb",             title: "Jailhouse",       def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb",  title: "Apartment",       def: "apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function getSelectedMap() {
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value || "0", 10) || 0));
    return MAP_FILES[idx];
  }

  // ---------- Babylon setup (NO camera here) ----------
  async function prepareEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded yet");

    ENGINE = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    SCENE  = new BABYLON.Scene(ENGINE);

    // Mild nighttime feel + collisions/gravity setup
    SCENE.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    SCENE.fogDensity = 0.0045;
    SCENE.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), SCENE);
    hemi.intensity = 0.35;

    // Basic run loop; camera will be provided by the rig later
    ENGINE.runRenderLoop(() => SCENE && SCENE.render());
    window.addEventListener("resize", () => ENGINE && ENGINE.resize());

    exposeGlobals();
  }

  // ---------- MAP_DEF ----------
  async function tryLoadMapDef(defNameOrNull, mapFile) {
    const baseNoExt = (mapFile || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of candidates) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) { log("Loaded MAP_DEF:", c); return true; }
    }
    // synthesize minimal MAP_DEF so the scene still loads
    warn("No MAP_DEF found; synthesizing fallback.");
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.file = mapFile || MAP_DEF.file || "";
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x:0,y:0,z:0 };
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

  // ---------- Map import (no camera/spawn here) ----------
  async function loadSelectedMap() {
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/models/map/",
        mapFile,
        SCENE
      );
      const root = res.meshes[0] || null;
      if (root) {
        applyMapDefToRoot(root);
        // collisions & receives shadows
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }
      log("Map imported:", mapFile);
    } catch (e) {
      warn("Map import failed, creating ground fallback:", e);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 200, height: 200 }, SCENE);
      g.checkCollisions = true;
    }
  }

  // ---------- start flow (no pointer lock here) ----------
  let started = false;
  async function startPipeline() {
    if (started) return;
    started = true;

    Loader.reset(); Loader.label("Initializing…"); Loader.show();
    try {
      Loader.addStep("Loading map list…",     async () => await loadManifest());
      Loader.addStep("Preparing engine…",     async () => await prepareEngineScene());
      Loader.addStep("Loading selected map…", async () => await loadSelectedMap());
      await Loader.run();

      // focus canvas (rig will request pointer lock in FPS)
      try { document.getElementById("renderCanvas")?.focus?.(); } catch(_){}
      log("Bootstrap complete. Handing off to PP.rig…");
    } catch (err) {
      warn("Bootstrap failed:", err);
      const title = $("#title-screen"); if (title) title.style.display = "flex";
      started = false; // allow retry
    }
  }

  // ---------- wiring ----------
  // We do NOT bind the Start button here. index.html already dispatches pp:start after click.
  // Just listen for pp:start and run the pipeline once.
  window.addEventListener("pp:start", () => {
    // hide title screen if still present (index already removes it, but safe)
    const title = $("#title-screen"); if (title) title.style.display = "none";
    startPipeline();
  }, { once:true });

  // Preload manifest so the selector has options on first paint
  window.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); });
})();
