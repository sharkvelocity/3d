/* game_bootstrap.js — robust start flow with player rig integration
   - Populates map dropdown from assets/models/map/maps.json
   - Waits for Start to create engine/scene and then import the selected map
   - Ensures no double-start, no duplicate fallback ground
   - Disposes fallback if the real map succeeds
   - Integrates player rig fully (WASD, PS5, camera, animations)
   - Fully integrates PP.audio.weather system
*/
(function () {
  "use strict";
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
  const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
  const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

  // ---------- tiny utils ----------
  const $  = (s)=> document.querySelector(s);
  const bURL = (p)=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };
  async function fetchJSON(url){
    try {
      const r = await fetch(bURL(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    } catch (e) { warn("fetchJSON failed:", url, e); return null; }
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box  = ()=> $("#loading-box");
    const text = ()=> $("#loading-text");
    const fill = ()=> $("#loading-fill");
    let stepsDone = 0, stepsTotal = 0, queue = [];
    function show(){ const b=box(); if (b) b.style.display="flex"; }
    function hide(){ const b=box(); if (b) b.style.display="none"; }
    function label(s){ const t=text(); if (t) t.textContent = s || ""; }
    function draw(){ const f=fill(); if (!f) return; f.style.width = (stepsTotal? (stepsDone/stepsTotal)*100 : 0).toFixed(1)+"%"; }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
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
    return { reset, addStep, run, show, hide, label };
  })();

  // ---------- state ----------
  let engine = null, scene = null, camera = null;
  let hemi = null;
  let started = false;
  let manifest = [];   // [{file, title, def?}]
  let mapRoot = null;  // imported meshes[0]
  let fallbackGround = null;

  // ---------- map list / selector ----------
  async function loadManifest() {
    let j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) manifest = j;
    else if (j && Array.isArray(j.maps)) manifest = j.maps;

    if (!manifest.length) {
      manifest = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
        { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",    def: "apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function populateMapSelector(){
    const sel = $("#map-select");
    if (!sel) return;
    if (!manifest.length){
      sel.innerHTML = `<option value="-1">(no maps found)</option>`;
      return;
    }
    const opts = manifest.map((m,i)=> `<option value="${i}">${m.title || m.file}</option>`).join("");
    sel.innerHTML = opts;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved && manifest[+saved]) sel.value = saved;
      else sel.value = "0";
    } catch(_){ sel.value = "0"; }
    sel.onchange = () => {
      try { localStorage.setItem("selectedMapIndex", sel.value); } catch(_){}
    };
  }

  function getSelectedMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(manifest.length-1, parseInt(sel?.value || "0", 10) || 0));
    return manifest[idx];
  }

  // ---------- engine + scene ----------
  function createEngineScene(){
    if (engine && scene) return;
    const canvas = $("#renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);
    window.SCENE = scene; // global for weather

    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    // Camera placeholder; player rig controls camera
    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inputs.clear();

    window.ENGINE = engine; window.camera = camera;

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());
    mark("engine+scene-created");
  }

  // ---------- MAP_DEF loading + apply ----------
  async function loadMapDef(defNameOrNull, mapFile){
    const baseNoExt = (mapFile||"").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of candidates){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) return true;
    }
    window.MAP_DEF = window.MAP_DEF || {};
    MAP_DEF.file = mapFile || MAP_DEF.file || "";
    MAP_DEF.scale = MAP_DEF.scale ?? 1;
    MAP_DEF.rotationY = MAP_DEF.rotationY ?? 0;
    MAP_DEF.offset = MAP_DEF.offset || { x:0,y:0,z:0 };
    MAP_DEF.spawn  = MAP_DEF.spawn  || { x:0, y:1.8, z:0 };
    return true;
  }

  function applyMapDefToRoot(root){
    if (!root || !window.MAP_DEF) return;
    const d = MAP_DEF;
    try {
      if (typeof d.scale === "number") root.scaling.set(d.scale, d.scale, d.scale);
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation.set(0, yaw, 0);
      if (d.offset){
        root.position.x = d.offset.x||0;
        root.position.y = d.offset.y||0;
        root.position.z = d.offset.z||0;
      }
    } catch(e){ warn("applyMapDefToRoot failed", e); }
  }

  function loadScriptOnce(path){
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  // ---------- import selected map ----------
  async function importSelectedMap(){
    const chosen = getSelectedMap();
    const mapFile = chosen?.file || "Abandoned_House.glb";

    try { if (mapRoot && !mapRoot.isDisposed()) mapRoot.dispose(false, true); } catch{}
    mapRoot = null;
    try { if (fallbackGround && !fallbackGround.isDisposed()) { fallbackGround.dispose(false, true); fallbackGround = null; } } catch{}

    await loadMapDef(chosen?.def, mapFile);

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "", bURL("./assets/models/map/"), mapFile, scene
      );
      mapRoot = res.meshes[0] || null;

      if (mapRoot) {
        applyMapDefToRoot(mapRoot);
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }

      enforceSpawn();
      mark("map-imported", { file: mapFile });
      log("Map imported:", mapFile);

    } catch (e) {
      warn("Map import failed, creating fallback ground:", e);
      const sideM = 50;
      fallbackGround = BABYLON.MeshBuilder.CreateGround("fallback_ground",
        { width: sideM, height: sideM, subdivisions: 1 }, scene);
      fallbackGround.checkCollisions = true;
      fallbackGround.position.y = 0;
      enforceSpawn();
    }
  }

  // ---------- spawn ----------
  function enforceSpawn(){
    if (!scene) return;
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? {x: d.spawn.x||0, y: d.spawn.y||1.8, z: d.spawn.z||0} : {x:0,y:1.8,z:0};
    window.__PP_SPAWN = new BABYLON.Vector3(sp.x, sp.y, sp.z);
  }

  // ---------- pointer lock helpers ----------
  function enablePointerLockOnce(){
    const canvas = $("#renderCanvas");
    if (!canvas) return;
    const lock = ()=>{ if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch{} } };
    canvas.addEventListener("click", lock);
    setTimeout(lock, 200);
  }

  // ---------- startGame with loader + rig + weather ----------
  async function startGame(){
    if (started) return;
    started = true;

    const title = document.querySelector("#title-screen");
    if (title) title.style.display = "none";

    console.log("[bootstrap] Starting game…");

    try {
      Loader.reset();
      Loader.addStep("Preparing engine…", async () => { createEngineScene(); });

      Loader.addStep("Loading map…", async () => { await importSelectedMap(); });

      Loader.addStep("Loading player rig…", async () => {
        await loadScriptOnce("./assets/dev/util/player_rig_controller_final.js");
        await new Promise((resolve) => {
          if (window.PP?.rigReady) return resolve();
          document.addEventListener("pp:rig-ready", resolve, { once: true });
        });
        console.log("[bootstrap] Player rig ready");

        // Lock camera to rig body
        if (scene && scene.activeCamera && window.PP?.rig?.body) {
          scene.activeCamera.lockedTarget = window.PP.rig.body;
          console.log("[bootstrap] Camera locked to player rig body");
        }
      });

      Loader.addStep("Initializing weather…", async () => {
        if (window.PP?.audio?.weather && scene) {
          // Set default Clear weather
          PP.audio.weather.set("Clear", scene);
          console.log("[bootstrap] Weather system initialized");
        }
      });

      Loader.addStep("Finalizing…", async () => {
        if (window.__PP_SPAWN) scene.activeCamera.position.copyFrom(window.__PP_SPAWN);
        else scene.activeCamera.position.set(0, 1.8, 0);

        if (!scene.lights || scene.lights.length === 0) {
          const hemi = new BABYLON.HemisphericLight("tempLight", new BABYLON.Vector3(0,1,0), scene);
          hemi.intensity = 1.0;
        }

        enablePointerLockOnce();
      });

      await Loader.run();

      // Randomize weather AFTER everything is ready
      window.dispatchEvent(new CustomEvent("pp:start"));
      const states = ["Clear", "Rainstorm", "Snow", "Bloodmoon"];
      const chosen = states[Math.floor(Math.random() * states.length)];
      if (window.PP?.audio?.weather) PP.audio.weather.set(chosen, scene);
      console.log("[Weather] randomized to:", chosen);

      console.log("[bootstrap] Game started successfully.");
      try { $("#renderCanvas")?.focus?.(); } catch{}

    } catch (err) {
      console.error("[bootstrap] Error starting game:", err);
      started = false;
      if (title) title.style.display = "flex";
      alert("Boot failed. Check console for details.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadManifest().catch(e => console.error("Failed to load map manifest:", e));
  });

  window.startGame = startGame;

})();
