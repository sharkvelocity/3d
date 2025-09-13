/* assets/dev/game/game_bootstrap.js
   Start NOTHING until the user clicks "Start Investigation".
   After click, show loader, create engine/scene, load map + def,
   enforce spawn, enable pointer lock, then reveal belt/UI.
*/
(function () {
  "use strict";
  if (window.__PP_GAME_BOOT__) return;
  window.__PP_GAME_BOOT__ = true;

  // --------------- tiny DOM helpers ----------------
  const $   = (s)=> document.querySelector(s);
  const box = ()=> $("#loading-box");
  const txt = ()=> $("#loading-text");
  const bar = ()=> $("#loading-fill");
  const belt= ()=> $("#belt");

  function setBar(p){ const f=bar(); if (f) f.style.width = Math.max(0,Math.min(100,p)).toFixed(1) + "%"; }
  function label(s){ const t=txt(); if (t) t.textContent = s; }
  function showLoader(){ const b=box(); if (b) { b.style.display="flex"; setBar(0); } }
  function hideLoader(){ const b=box(); if (b) b.style.display="none"; }

  // --------------- state ----------------
  let started = false;
  let engine = null, scene = null, camera = null;

  // --------------- map list (lightweight; only when needed) ----------------
  async function fetchJSON(url){
    try{
      const r = await fetch(new URL(url, document.baseURI), { cache:"no-store" });
      if (!r.ok) throw new Error(r.status+" "+r.statusText);
      return await r.json();
    } catch(e){ console.warn("[bootstrap] fetchJSON fail", url, e); return null; }
  }

  async function loadManifest() {
    // keep this minimal — only to populate the dropdown after start
    const j = await fetchJSON("./assets/models/map/maps.json");
    let items = [];
    if (Array.isArray(j)) items = j;
    else if (j && Array.isArray(j.maps)) items = j.maps;

    if (!items.length) {
      // fallback list
      items = [
        { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
        { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
        { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
        { file: "apartment_floor_plan.glb", title: "Apartment",    def: "apartment_floor_plan.config.js" }
      ];
    }
    // Populate if select exists (on title)
    const sel = $("#map-select");
    if (sel){
      sel.innerHTML = items.map((m,i)=> `<option value="${i}">${m.title || m.file}</option>`).join("");
      try{
        const saved = localStorage.getItem("selectedMapIndex");
        if (saved && items[+saved]) sel.value = saved;
      }catch(_){}
      sel.onchange = ()=> { try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){} };
    }
    return items;
  }

  function chosenMap(maps){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min((maps.length-1)||0, parseInt(sel?.value||"0",10)||0));
    return maps[idx] || maps[0];
  }

  // --------------- Babylon create AFTER click ----------------
  async function createEngineScene(){
    label("Creating engine…"); setBar(10);
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // Mild nighttime fog
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inertia = 0;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

    // Mouse + keyboard; WASD only
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();
    camera.keysUp    = [87]; // W
    camera.keysDown  = [83]; // S
    camera.keysLeft  = [65]; // A
    camera.keysRight = [68]; // D

    scene.activeCamera = camera;
    camera.attachControl(canvas, true);

    // export globals LATE
    window.ENGINE = engine;
    window.SCENE  = scene;
    window.camera = camera;

    engine.runRenderLoop(()=> scene && scene.render());
    window.addEventListener("resize", ()=> engine && engine.resize());
  }

  // --------------- Map Def ----------------
  async function loadScriptOnce(path) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = new URL(path, document.baseURI).toString() + (path.includes("?")?"":`?v=${Date.now()}`);
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function loadMapDef(mapFile, defNameOrNull){
    label("Loading map definition…"); setBar(30);
    const baseNoExt = (mapFile||"").replace(/\.[^.]+$/,"");
    const cand = [];
    if (defNameOrNull) cand.push(`./assets/models/map/${defNameOrNull}`);
    cand.push(`./assets/models/map/${baseNoExt}.config.js`);
    cand.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of cand){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF) return;
    }
    // minimal fallback
    window.MAP_DEF = window.MAP_DEF || {};
    const d = window.MAP_DEF;
    d.file = mapFile || d.file || "";
    d.scale = d.scale ?? 1;
    d.rotationY = d.rotationY ?? 0;
    d.offset = d.offset || { x:0,y:0,z:0 };
    d.spawn  = d.spawn  || { x:0, y:1.8, z:0 };
  }

  function applyMapDefToRoot(root){
    const d = window.MAP_DEF || {};
    try{
      if (typeof d.scale === "number") root.scaling.set(d.scale,d.scale,d.scale);
      root.rotation.y = (d.rotationY||0) * Math.PI/180;
      if (d.offset){ root.position.set(d.offset.x||0, d.offset.y||0, d.offset.z||0); }
    }catch(_){}
  }

  // --------------- Fallback Room (only if GLB fails) ----------------
  function buildFallbackRoom(){
    label("Building fallback room…"); setBar(45);
    const w = 30;  // ~900 sq ft footprint (~30x30)
    const h = 3.2;

    const mat = new BABYLON.StandardMaterial("roomMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.18,0.18,0.20);

    const floor = BABYLON.MeshBuilder.CreateGround("roomFloor", { width:w, height:w }, scene);
    floor.material = mat; floor.checkCollisions = true;

    const wallOpts = { width:w, height:h, depth:0.2 };
    const wallN = BABYLON.MeshBuilder.CreateBox("wallN", wallOpts, scene);
    const wallS = wallN.clone("wallS"); const wallE = wallN.clone("wallE"); const wallW = wallN.clone("wallW");
    [wallN,wallS,wallE,wallW].forEach(wm => { wm.material = mat; wm.checkCollisions = true; });

    wallN.position.set(0,h/2,-w/2);
    wallS.position.set(0,h/2, w/2);
    wallE.scaling.set(0.2,1,1); wallE.rotation.y = Math.PI/2; wallE.position.set(w/2,h/2,0);
    wallW.scaling.set(0.2,1,1); wallW.rotation.y = Math.PI/2; wallW.position.set(-w/2,h/2,0);

    // Simple light
    const p = new BABYLON.PointLight("roomLight", new BABYLON.Vector3(0, h-0.4, 0), scene);
    p.intensity = 0.85;

    // spawn
    camera.position.set(0, 1.8, 0);
    try{ camera.setTarget(new BABYLON.Vector3(0,1.8,2)); }catch(_){}
  }

  // --------------- Map Import ----------------
  async function importMap(mapMeta){
    const file = mapMeta?.file || "Abandoned_House.glb";
    await loadMapDef(file, mapMeta?.def);

    label("Loading selected map…"); setBar(40);
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      const root = res.meshes[0] || null;
      if (root){
        applyMapDefToRoot(root);
        res.meshes.forEach(m => { try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} });
      }
    } catch(e){
      console.warn("[bootstrap] map import failed, using fallback room", e);
      buildFallbackRoom();
    }
  }

  // --------------- Spawn ----------------
  function enforceSpawn(){
    label("Placing player…"); setBar(70);
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? {x:d.spawn.x||0,y:d.spawn.y||1.8,z:d.spawn.z||0} : {x:0,y:1.8,z:0};
    camera.position.set(sp.x,sp.y,sp.z);
    try { camera.setTarget(new BABYLON.Vector3(sp.x, sp.y+1, sp.z+2)); } catch(_){}
  }

  // --------------- Pointer Lock ----------------
  function pointerLock(){
    label("Pointer lock…"); setBar(85);
    const canvas = document.getElementById("renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    let tried=false;
    function lock(){ if (document.pointerLockElement !== canvas) { try{ canvas.requestPointerLock(); }catch(_){ } } }
    canvas.addEventListener("click", ()=> lock(), { passive:true });
    setTimeout(()=>{ if(!tried){ tried=true; lock(); } }, 200);
  }

  // --------------- Weather + systems kick ----------------
  function startSystems(){
    label("Finalizing…"); setBar(92);
    // Start weather/audio/etc. (they bind to pp:start)
    window.dispatchEvent(new CustomEvent("pp:start"));
  }

  // --------------- Reveal HUD/Belt at end ----------------
  function revealUI(){
    label("Ready."); setBar(100);
    setTimeout(()=> hideLoader(), 120);
    // belt stays hidden until after start; now show it
    if (belt()) belt().style.display = "flex";
    try { $("#renderCanvas")?.focus?.(); } catch(_){}
  }

  // --------------- Main start pipeline (after button) ----------------
  async function startGame(){
    if (started) return;
    started = true;

    // Title stays until loader shows; then remove title
    showLoader();

    let maps = [];
    try {
      maps = await loadManifest(); setBar(15);
      await createEngineScene();   setBar(25);
      const meta = chosenMap(maps);
      await importMap(meta);       setBar(60);
      enforceSpawn();              setBar(75);
      pointerLock();               setBar(85);
      startSystems();              setBar(95);
      revealUI();                  setBar(100);
    } catch (err){
      console.error("[bootstrap] fatal start error:", err);
      label("Boot failed. See console."); setBar(100);
    } finally {
      // Remove title screen now (only after we showed loader to avoid pre-start rendering)
      try { $("#title-screen")?.remove(); } catch(_){}
    }
  }

  // --------------- Wire Start button ONLY ----------------
  (function wireStartButton(){
    const btn = $("#start-button");
    if (!btn) return;
    // Ensure belt is hidden before start
    if (belt()) belt().style.display = "none";
    // Ensure loader is hidden before start
    hideLoader();

    btn.addEventListener("click", startGame, { once:true });
  })();
})();
