/* File: ./assets/dev/game/game_bootstrap.js
   Minimal, safe bootstrap that:
   - waits for Start (pp:start) to build engine/scene
   - loads map (or builds a fallback 900ft x 900ft room)
   - sets up a UniversalCamera with WASD + mouse look
   - integrates BOOTLOG milestones and loading bar updates
*/
(function () {
  if (window.__PP_BOOTSTRAP_READY__) return;
  window.__PP_BOOTSTRAP_READY__ = true;

  const $ = (s) => document.querySelector(s);
  const LOG = (name, data) => { try { window.BOOTLOG?.mark(name, data); } catch {} };

  // Loading UI
  const L = (() => {
    const box  = () => $("#loading-box");
    const fill = () => $("#loading-fill");
    const text = () => $("#loading-text");
    let steps = 0, done = 0;
    return {
      reset() { steps = done = 0; this.show(); this.draw(); },
      add(n=1){ steps += n; this.draw(); },
      step(lbl){ done++; if (lbl) this.label(lbl); this.draw(); },
      label(s){ const t=text(); if (t) t.textContent = s; },
      draw(){ const f=fill(); if (!f) return; const pct = steps? (done/steps)*100:0; f.style.width = pct.toFixed(1) + "%"; },
      show(){ const b=box(); if (b) b.style.display = "flex"; },
      hide(){ const b=box(); if (b) b.style.display = "none"; }
    };
  })();

  // Globals (read-only mirrors to avoid "getter only" crash)
  let engine = null, scene = null, camera = null, hemi = null;

  function createEngineScene() {
    LOG("bootstrap:createEngineScene:start");
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");

    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -0.098, 0);

    // Mild night look
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.35;

    // Camera: WASD only + mouse look
    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.8, 0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);
    camera.checkCollisions = true;

    camera.inputs.clear();
    const kb = camera.inputs.addKeyboard();
    // Disable arrow keys; use WASD only
    kb.keysUp = [87];     // W
    kb.keysDown = [83];   // S
    kb.keysLeft = [65];   // A
    kb.keysRight = [68];  // D
    camera.inputs.addMouse(); // pointer lock mouse look (attach later)

    // Attach to canvas
    camera.attachControl(canvas, true);
    scene.activeCamera = camera;

    // Safe mirrors (avoid overwriting getter-based globals)
    window.__ENGINE = engine;
    window.__SCENE  = scene;
    window.camera   = camera;

    // Render loop
    engine.runRenderLoop(() => scene && scene.render());
    window.addEventListener("resize", () => engine && engine.resize());

    LOG("bootstrap:createEngineScene:ok");
  }

  // Map manifest loader
  async function loadManifest() {
    LOG("manifest:load:start");
    try {
      const r = await fetch("./assets/models/map/maps.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      const j = await r.json();
      let list = Array.isArray(j) ? j : (Array.isArray(j?.maps) ? j.maps : []);
      LOG("manifest:load:ok", { count: list.length });
      return list;
    } catch (e) {
      LOG("manifest:load:fail", { error: String(e) });
      return []; // no manifest → fallback
    }
  }

  function getSelectedMap(MAPS) {
    const sel = $("#map-select");
    let idx = parseInt(sel?.value ?? "0", 10) || 0;
    idx = Math.max(0, Math.min(MAPS.length - 1, idx));
    return MAPS[idx] || null;
  }

  function applyMapDefToRoot(root) {
    const d = window.MAP_DEF || {};
    try {
      if (typeof d.scale === "number") root.scaling.setAll(d.scale);
      const yaw = (d.rotationY || 0) * Math.PI / 180;
      root.rotation = new BABYLON.Vector3(0, yaw, 0);
      if (d.offset) {
        root.position.x = d.offset.x || 0;
        root.position.y = d.offset.y || 0;
        root.position.z = d.offset.z || 0;
      }
    } catch {}
  }

  async function loadMapDefFor(file, defName) {
    const baseNoExt = (file || "").replace(/\.[^.]+$/, "");
    const candidates = [];
    if (defName) candidates.push(`./assets/models/map/${defName}`);
    candidates.push(`./assets/models/map/${baseNoExt}.config.js`);
    candidates.push(`./assets/models/map/${baseNoExt}.js`);

    for (const src of candidates) {
      try {
        await new Promise((resolve) => {
          const s = document.createElement("script");
          s.src = src + (src.includes("?") ? "" : `?v=${Date.now()}`);
          s.async = true;
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.head.appendChild(s);
        });
        if (window.MAP_DEF && (window.MAP_DEF.file || window.MAP_DEF.spawn)) {
          LOG("map:def:ok", { src });
          return true;
        }
      } catch {}
    }
    // Minimal default
    window.MAP_DEF = window.MAP_DEF || {};
    LOG("map:def:fallback");
    return false;
  }

  async function importSelectedMap(MAPS) {
    const chosen = getSelectedMap(MAPS);
    const file = chosen?.file;
    if (!file) throw new Error("No map file selected");
    await loadMapDefFor(file, chosen?.def);

    LOG("map:import:start", { file });
    const res = await BABYLON.SceneLoader.ImportMeshAsync(
      "", "./assets/models/map/", file, scene
    );
    applyMapDefToRoot(res.meshes[0] || null);

    // Basic collision setup
    res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch {} });

    LOG("map:import:ok", { file, meshes: res.meshes?.length || 0 });
    return true;
  }

  // Fallback room: 900ft x 900ft box, ~274.32m each side
  function buildFallbackRoom() {
    LOG("map:fallback:build:start");
    const FT_TO_M = 0.3048;
    const SIZE_FT = 900;                // per request: 900ft by 900ft
    const SIZE_M  = SIZE_FT * FT_TO_M;  // ≈ 274.32m
    const H_M     = 6;                  // wall height
    const t = 0.2;                      // wall thickness

    // floor
    const floor = BABYLON.MeshBuilder.CreateGround("fb_floor",
      { width: SIZE_M, height: SIZE_M, subdivisions: 2 }, scene);
    floor.checkCollisions = true;

    // ceiling
    const ceil = BABYLON.MeshBuilder.CreateGround("fb_ceiling",
      { width: SIZE_M, height: SIZE_M, subdivisions: 2 }, scene);
    ceil.position.y = H_M;
    ceil.rotation.x = Math.PI;
    ceil.checkCollisions = true;

    // walls (four boxes)
    const w1 = BABYLON.MeshBuilder.CreateBox("fb_w1", { width: SIZE_M, height: H_M, depth: t }, scene);
    w1.position.z =  SIZE_M / 2; w1.position.y = H_M/2; w1.checkCollisions = true;

    const w2 = w1.clone("fb_w2"); w2.position.z = -SIZE_M / 2;

    const w3 = BABYLON.MeshBuilder.CreateBox("fb_w3", { width: t, height: H_M, depth: SIZE_M }, scene);
    w3.position.x =  SIZE_M / 2; w3.position.y = H_M/2; w3.checkCollisions = true;

    const w4 = w3.clone("fb_w4"); w4.position.x = -SIZE_M / 2;

    // Simple materials so you can see them
    const mat = new BABYLON.StandardMaterial("fb_mat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.2, 0.22, 0.25);
    floor.material = mat;
    const matW = new BABYLON.StandardMaterial("fb_wall", scene);
    matW.diffuseColor = new BABYLON.Color3(0.15, 0.18, 0.2);
    w1.material = w2.material = w3.material = w4.material = matW;
    const matC = new BABYLON.StandardMaterial("fb_ceil", scene);
    matC.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
    ceil.material = matC;

    // spawn near center
    camera.position.set(0, 1.8, 0);
    try { camera.setTarget(new BABYLON.Vector3(0, 1.8, 2)); } catch {}

    LOG("map:fallback:build:ok", { size_m: SIZE_M, height_m: H_M });
  }

  function enforceSpawnFromMapDef() {
    const d = window.MAP_DEF || {};
    let sp = d.spawn ? { x: d.spawn.x || 0, y: d.spawn.y || 1.8, z: d.spawn.z || 0 } :
                       { x: 0, y: 1.8, z: 0 };
    camera.position.set(sp.x, sp.y, sp.z);
    try { camera.setTarget(new BABYLON.Vector3(sp.x, sp.y + 1, sp.z + 2)); } catch {}
    LOG("spawn:applied", sp);
  }

  async function startPipeline() {
    try {
      L.reset();
      L.add(5); // engine, manifest, map, spawn, finalize

      L.label("Preparing engine");
      createEngineScene(); L.step("engine");

      // Attach pointer lock on click
      const canvas = document.getElementById("renderCanvas");
      canvas?.addEventListener("click", () => {
        try { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); } catch {}
      });

      L.label("Loading maps");
      const MAPS = await loadManifest(); L.step("manifest");

      let imported = false;
      if (MAPS.length) {
        try {
          L.label("Loading selected map");
          imported = await importSelectedMap(MAPS);
          L.step("map");
        } catch (e) {
          LOG("map:import:error", { error: String(e) });
          imported = false;
        }
      }
      if (!imported) {
        L.label("Building fallback room");
        buildFallbackRoom();
        L.step("fallback");
      } else {
        enforceSpawnFromMapDef();
      }

      L.label("Finalizing");
      // show HUD XYZ if you want
      const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";

      L.step("final");
      setTimeout(()=> L.hide(), 150);

      LOG("bootstrap:done");
    } catch (e) {
      LOG("bootstrap:fatal", { error: String(e) });
      console.error("[bootstrap] fatal start error:", e);
      L.label("Boot failed (see console)");
    }
  }

  // Wire Start button -> pp:start -> pipeline
  window.addEventListener("pp:start", () => {
    // If Babylon isn't there yet, wait a tick
    function go() {
      if (!window.BABYLON) { setTimeout(go, 50); return; }
      startPipeline();
    }
    go();
  }, { once: true });

})();
