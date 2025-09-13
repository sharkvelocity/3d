/* File: assets/dev/game/game_bootstrap.js
   Minimal, robust start pipeline for PhasmaPhoney.
   - Safe with player_rig_controller_final.js (rig owns real cameras)
   - Avoids "No camera defined" by using a temp camera until rig is ready
*/
(function () {
  "use strict";
  if (window.__GameBootstrapV2__) return;
  window.__GameBootstrapV2__ = true;

  // ---------- tiny utils ----------
  const $ = (s) => document.querySelector(s);
  const log  = (...a) => { try { console.log("[bootstrap]", ...a); } catch{} };
  const warn = (...a) => { try { console.warn("[bootstrap]", ...a); } catch{} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function docURL(path){ try { return new URL(path, document.baseURI).toString(); } catch { return path; } }

  async function fetchJSON(url){
    try {
      const r = await fetch(docURL(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } catch (e) {
      warn("fetchJSON failed:", url, e);
      return null;
    }
  }
  function loadScriptOnce(path){
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = docURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box = () => $("#loading-box");
    const txt = () => $("#loading-text");
    const fill = () => $("#loading-fill");
    let steps = [];
    function show(){ const b=box(); if (b) b.style.display="flex"; }
    function hide(){ const b=box(); if (b) b.style.display="none"; }
    function label(s){ const t=txt(); if (t) t.textContent = s || ""; }
    function progress(i, n){ const f=fill(); if (!f) return; const p = Math.max(0, Math.min(1, i/n||0)); f.style.width = (p*100).toFixed(1) + "%"; }
    function reset(){ steps = []; progress(0,1); }
    function addStep(lbl, fn){ steps.push({lbl, fn}); }
    async function run(){
      show(); progress(0, steps.length||1);
      for (let i=0;i<steps.length;i++){
        label(steps[i].lbl); progress(i, steps.length);
        try { await steps[i].fn(); } catch (e){ warn("step failed:", steps[i].lbl, e); }
      }
      label("Finalizing…"); progress(steps.length, steps.length || 1);
      await sleep(80);
      hide();
    }
    return { addStep, run, reset, show, hide, label };
  })();

  // ---------- bootstrap state ----------
  let engine = null, scene = null, tempCam = null;
  let MAP_FILES = [];

  // ---------- map list / selector ----------
  function populateMapSelector(){
    const sel = $("#map-select");
    if (!sel) return;
    sel.innerHTML = MAP_FILES.length
      ? MAP_FILES.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("")
      : `<option value="-1">(no maps found)</option>`;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved && MAP_FILES[+saved]) sel.value = saved;
      else sel.value = "0";
    } catch { sel.value = "0"; }
    sel.onchange = () => { try { localStorage.setItem("selectedMapIndex", sel.value); } catch{} };
  }

  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;

    if (!MAP_FILES.length){
      // Fallback guesses (edit to your repo)
      MAP_FILES = [
        { file: "Abandoned_House.glb",        title: "Abandoned House",      def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",        title: "Furnished House",      def: "furnished_house.js" },
        { file: "jailhouse.glb",              title: "Jailhouse",            def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb",   title: "Apartment",            def: "apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function getSelectedMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value||"0", 10) || 0));
    return MAP_FILES[idx];
  }

  // ---------- scene/engine ----------
  async function prepareEngineScene(){
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // mild night fog
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    // temp light
    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.35;

    // TEMP CAMERA so we render before the rig swaps in real cameras
    tempCam = new BABYLON.FreeCamera("tempCam", new BABYLON.Vector3(0, 2, -4), scene);
    tempCam.setTarget(new BABYLON.Vector3(0,1.7,0));
    tempCam.minZ = 0.1;
    tempCam.attachControl(canvas, true);

    // expose for other modules
    window.ENGINE = engine;
    window.SCENE  = scene;
    window.camera = tempCam;

    engine.runRenderLoop(() => { if (scene) scene.render(); });
    window.addEventListener("resize", () => engine && engine.resize());
  }

  // ---------- MAP_DEF loading / application ----------
  async function tryLoadMapDef(defNameOrNull, mapFile){
    const base = (mapFile||"").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${base}.config.js`);
    candidates.push(`./assets/models/map/${base}.js`);

    // clear any prior MAP_DEF
    window.MAP_DEF = undefined;

    for (const c of candidates){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && typeof MAP_DEF === "object"){ log("MAP_DEF loaded:", c); return true; }
    }
    // synthesize minimal def to keep going
    warn("No MAP_DEF found; synthesizing fallback.");
    window.MAP_DEF = {
      file: mapFile||"",
      scale: 1,
      rotationY: 0,
      offset: { x:0, y:0, z:0 },
      spawn:  { x:0, y:1.8, z:0 }
    };
    return true;
  }

  function applyMapDefToRoot(root){
    if (!root || !window.MAP_DEF) return;
    const d = MAP_DEF;
    try {
      // scale
      if (typeof d.scale === "number") {
        root.scaling = new BABYLON.Vector3(d.scale, d.scale, d.scale);
      }
      // rotationY in degrees
      root.rotation = new BABYLON.Vector3(0, (d.rotationY||0) * Math.PI/180, 0);
      // offset
      if (d.offset){
        root.position.x = d.offset.x||0;
        root.position.y = d.offset.y||0;
        root.position.z = d.offset.z||0;
      }
    } catch (e){ warn("applyMapDefToRoot failed", e); }
  }

  async function loadSelectedMap(){
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    await tryLoadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", mapFile, scene);
      const root = res.meshes[0] || null;
      if (root){
        applyMapDefToRoot(root);
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch{} });
      }
      log("Map imported:", mapFile);
    } catch (e){
      warn("Map import failed, creating ground fallback:", e);
      BABYLON.MeshBuilder.CreateGround("fallback", { width: 240, height: 240 }, scene).checkCollisions = true;
    }
  }

  // ---------- spawn utilities ----------
  function centerOf(poly){
    if (!poly || !poly.length) return {x:0,z:0};
    let x=0,z=0; for (const p of poly){ x += (p.x||0); z += (p.z||0); }
    const n = poly.length; return { x:x/n, z:z/n };
  }

  function desiredSpawn(){
    const d = window.MAP_DEF || {};
    if (d.spawn && (typeof d.spawn.x === "number")){
      return { x:d.spawn.x, y:d.spawn.y ?? 1.8, z:d.spawn.z };
    }
    if (Array.isArray(d.vanZone) && d.vanZone.length >= 3){
      const c = centerOf(d.vanZone); return { x:c.x, y:1.8, z:c.z };
    }
    return { x:0, y:1.8, z:0 };
  }

  function desiredYaw(pos){
    // if MAP_DEF has rotationY for "front" consider facing -Z after rotation; otherwise look toward origin
    try {
      const focus =
        (window.PP && PP.CONFIG && PP.CONFIG.VAN && PP.CONFIG.VAN.POSITION) ||
        new BABYLON.Vector3(0, pos.y, 0);
      const dir = new BABYLON.Vector3(focus.x - pos.x, 0, focus.z - pos.z);
      return Math.atan2(dir.x, dir.z); // Babylon LH yaw
    } catch {
      return 0;
    }
  }

  async function enforceSpawn(){
    const pos = desiredSpawn();
    const yaw = desiredYaw(pos);

    // If rig exists, place body + align yaw
    if (window.PP && PP.rig && PP.rig.body){
      const b = PP.rig.body;
      b.position.set(pos.x, pos.y, pos.z);
      if (!b.rotation) b.rotation = new BABYLON.Vector3();
      b.rotation.y = yaw;

      // align FP cam height if active
      try {
        if (scene.activeCamera && scene.activeCamera.name === "playerFP"){
          scene.activeCamera.position.copyFrom(b.position);
        }
      } catch {}
      log("Spawned rig @", pos);
      return;
    }

    // Fallback: move active camera
    if (scene.activeCamera){
      scene.activeCamera.position.set(pos.x, pos.y, pos.z);
      try { scene.activeCamera.setTarget(new BABYLON.Vector3(pos.x, pos.y + 1, pos.z + 2)); } catch {}
      log("Spawned camera @", pos);
    }
  }

  function disposeTempIfRigReady(){
    try {
      if (tempCam && scene && scene.activeCamera && scene.activeCamera !== tempCam){
        tempCam.detachControl();
        tempCam.dispose();
        tempCam = null;
        log("Temp camera disposed.");
      }
    } catch {}
  }

  // ---------- pointer lock ----------
  function pointerLockOnce(){
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    if (document.pointerLockElement !== canvas){
      try { canvas.requestPointerLock(); } catch {}
    }
  }

  // ---------- start pipeline ----------
  let started = false;
  async function startPipeline(){
    if (started) return; started = true;

    // Hide title screen if still there
    const title = $("#title-screen"); if (title) title.style.display = "none";

    Loader.reset();
    Loader.addStep("Loading map list…",  async () => { await loadManifest(); });
    Loader.addStep("Preparing engine…",  async () => { await prepareEngineScene(); });
    Loader.addStep("Loading selected map…", async () => { await loadSelectedMap(); });

    // Wait for rig to appear (player_rig_controller_final attaches itself to scene)
    Loader.addStep("Waiting for rig…", async () => {
      const t0 = performance.now();
      while (!(window.PP && PP.rig && PP.rig.body) && performance.now() - t0 < 4000){
        await sleep(50);
      }
    });

    Loader.addStep("Placing player…", async () => {
      await enforceSpawn();
      disposeTempIfRigReady();
    });

    Loader.addStep("Pointer lock…", async () => {
      await sleep(150);
      pointerLockOnce();
    });

    await Loader.run();

    // Focus canvas
    try { $("#renderCanvas")?.focus?.(); } catch {}
  }

  // ---------- wiring ----------
  // Start when your Start button fires pp:start (index.html already dispatches it)
  window.addEventListener("pp:start", () => startPipeline(), { once:true });

  // Also allow Enter/Space as an alternative "start" if the title is visible
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.code === "Space") && !started){
      e.preventDefault();
      startPipeline();
    }
  }, { passive:false });

  // Preload map list so the dropdown fills before pressing Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { loadManifest().catch(()=>{}); }, { once:true });
  } else {
    loadManifest().catch(()=>{});
  }
})();
