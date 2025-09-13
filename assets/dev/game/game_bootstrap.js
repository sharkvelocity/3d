/* assets/dev/game/game_bootstrap.js
   Start only after the user clicks the Start button.
   Safe global exports. Solid map import with diagnostics.
   Fallback test: add ?fallback=1 to the URL to force the box room.
*/
(function () {
  "use strict";
  if (window.__PP_GAME_BOOT__) return;
  window.__PP_GAME_BOOT__ = true;

  // ---------- DOM helpers ----------
  const $   = (s)=> document.querySelector(s);
  const box = ()=> $("#loading-box");
  const txt = ()=> $("#loading-text");
  const fill= ()=> $("#loading-fill");
  const belt= ()=> $("#belt");

  function label(s){ const t=txt(); if (t) t.textContent = s; }
  function setBar(p){ const f=fill(); if (f) f.style.width = Math.max(0,Math.min(100,p)).toFixed(1) + "%"; }
  function showLoader(){ const b=box(); if (b) { b.style.display="flex"; setBar(0);} }
  function hideLoader(){ const b=box(); if (b) b.style.display="none"; }

  // ---------- state ----------
  let started = false;
  let engine=null, scene=null, camera=null;

  const FORCE_FALLBACK = /(?:\?|&)fallback=1(?:&|$)/.test(location.search);

  // ---------- utils ----------
  async function fetchJSON(url){
    try{
      const r = await fetch(new URL(url, document.baseURI), { cache:"no-store" });
      if (!r.ok) throw new Error(r.status+" "+r.statusText);
      return await r.json();
    }catch(e){ console.warn("[bootstrap] fetchJSON fail", url, e); return null; }
  }
  async function loadScriptOnce(path){
    return new Promise((resolve)=>{
      const s=document.createElement("script");
      s.src = new URL(path, document.baseURI).toString() + (path.includes("?")?"":`?v=${Date.now()}`);
      s.async=true;
      s.onload=()=>resolve(true);
      s.onerror=()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  // ---------- manifest ----------
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    let maps = [];
    if (Array.isArray(j)) maps = j; else if (j && Array.isArray(j.maps)) maps = j.maps;
    if (!maps.length){
      maps = [
        { file:"Abandoned_House.glb", title:"Abandoned House", def:"Abandoned_House.config.js" },
        { file:"furnished_house.glb", title:"Furnished House", def:"furnished_house.js" },
        { file:"jailhouse.glb",       title:"Jailhouse",       def:"jailhouse.config.js" },
        { file:"apartment_floor_plan.glb", title:"Apartment",  def:"apartment_floor_plan.config.js" },
      ];
    }
    const sel=$("#map-select");
    if (sel){
      sel.innerHTML = maps.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
      try{ const saved=localStorage.getItem("selectedMapIndex"); if (saved && maps[+saved]) sel.value=saved; }catch(_){}
      sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){}}; 
    }
    return maps;
  }
  function chosenMap(maps){
    const sel=$("#map-select");
    const idx = Math.max(0, Math.min((maps.length-1)||0, parseInt(sel?.value||"0",10)||0));
    return maps[idx] || maps[0];
  }

  // ---------- safe globals ----------
  function exportGlobals(){
    if (window.PP?.runtime?.exportGlobals){
      window.PP.runtime.exportGlobals(engine, scene, camera);
    } else {
      // ultra-safe fallback
      try{ window.ENGINE = engine; }catch{}
      try{ window.SCENE  = scene;  }catch{}
      try{ window.camera = camera; }catch{}
      window.__ENGINE = engine; window.__SCENE = scene; window.__camera = camera;
    }
  }

  // ---------- engine/scene ----------
  async function createEngineScene(){
    label("Creating engine…"); setBar(10);
    const canvas = $("#renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

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
    camera.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);

    // Mouse + WASD only
    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();
    camera.keysUp    = [87]; // W
    camera.keysDown  = [83]; // S
    camera.keysLeft  = [65]; // A
    camera.keysRight = [68]; // D

    scene.activeCamera = camera;
    camera.attachControl(canvas, true);

    exportGlobals();

    engine.runRenderLoop(()=> scene && scene.render());
    addEventListener("resize", ()=> engine && engine.resize());
  }

  // ---------- map def + apply ----------
  async function loadMapDef(file, defName){
    label("Loading map definition…"); setBar(30);
    const baseNoExt = (file||"").replace(/\.[^.]+$/,"");
    const cand=[];
    if (defName) cand.push(`./assets/models/map/${defName}`);
    cand.push(`./assets/models/map/${baseNoExt}.config.js`);
    cand.push(`./assets/models/map/${baseNoExt}.js`);
    for (const c of cand){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF){ console.log("[bootstrap] MAP_DEF:", c); return; }
    }
    // minimal fallback
    window.MAP_DEF = window.MAP_DEF || {};
    const d = window.MAP_DEF;
    d.file = file || d.file || "";
    d.scale = d.scale ?? 1;
    d.rotationY = d.rotationY ?? 0;
    d.offset = d.offset || { x:0,y:0,z:0 };
    d.spawn  = d.spawn  || { x:0, y:1.8, z:0 };
  }

  function applyMapDef(root){
    const d = window.MAP_DEF || {};
    try{
      if (typeof d.scale === "number") root.scaling.set(d.scale,d.scale,d.scale);
      root.rotation = root.rotation || new BABYLON.Vector3();
      root.rotation.y = (d.rotationY||0) * Math.PI/180;
      if (d.offset){ root.position.set(d.offset.x||0, d.offset.y||0, d.offset.z||0); }
    }catch(e){ console.warn("[bootstrap] applyMapDef failed", e); }
  }

  // ---------- fallback room ----------
  function buildFallbackRoom(){
    label("Building fallback room…"); setBar(45);
    const w = 30, h = 3.2;

    const mat = new BABYLON.StandardMaterial("roomMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.18,0.18,0.20);

    const floor = BABYLON.MeshBuilder.CreateGround("roomFloor", { width:w, height:w }, scene);
    floor.material = mat; floor.checkCollisions = true;

    const wallOpts = { width:w, height:h, depth:0.2 };
    const wallN = BABYLON.MeshBuilder.CreateBox("wallN", wallOpts, scene);
    const wallS = wallN.clone("wallS");
    const wallE = wallN.clone("wallE");
    const wallW = wallN.clone("wallW");
    [wallN,wallS,wallE,wallW].forEach(wm => { wm.material = mat; wm.checkCollisions=true; });

    wallN.position.set(0,h/2,-w/2);
    wallS.position.set(0,h/2, w/2);
    wallE.scaling.set(0.2,1,1); wallE.rotation.y = Math.PI/2; wallE.position.set( w/2,h/2,0);
    wallW.scaling.set(0.2,1,1); wallW.rotation.y = Math.PI/2; wallW.position.set(-w/2,h/2,0);

    const p = new BABYLON.PointLight("roomLight", new BABYLON.Vector3(0,h-0.4,0), scene);
    p.intensity = 0.85;

    camera.position.set(0,1.8,0);
    try { camera.setTarget(new BABYLON.Vector3(0,1.8,2)); } catch(_){}
  }

  // ---------- import map ----------
  async function importMap(meta){
    const file = meta?.file || "Abandoned_House.glb";
    await loadMapDef(file, meta?.def);

    if (FORCE_FALLBACK){
      console.warn("[bootstrap] ?fallback=1 set → skipping GLB import");
      buildFallbackRoom();
      return;
    }

    label("Loading selected map…"); setBar(40);
    console.log("[bootstrap] Importing:", file);
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      if (!res || !res.meshes || !res.meshes.length) throw new Error("No meshes in GLB");
      const root = res.meshes[0];
      applyMapDef(root);
      res.meshes.forEach(m => { try { m.checkCollisions=true; m.receiveShadows=true; } catch(_){ } });
    } catch (e){
      console.error("[bootstrap] GLB import failed:", e);
      buildFallbackRoom();
    }
  }

  // ---------- spawn ----------
  function enforceSpawn(){
    label("Placing player…"); setBar(70);
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? {x:d.spawn.x||0,y:d.spawn.y||1.8,z:d.spawn.z||0} : {x:0,y:1.8,z:0};
    camera.position.set(sp.x, sp.y, sp.z);
    try{ camera.setTarget(new BABYLON.Vector3(sp.x, sp.y+1, sp.z+2)); }catch(_){}
  }

  // ---------- pointer lock ----------
  function pointerLock(){
    label("Pointer lock…"); setBar(85);
    const canvas = $("#renderCanvas");
    if (!canvas || !canvas.requestPointerLock) return;
    function lock(){ if (document.pointerLockElement !== canvas) { try{ canvas.requestPointerLock(); }catch(_){ } } }
    canvas.addEventListener("click", lock, { passive:true });
    setTimeout(lock, 200);
  }

  // ---------- systems start ----------
  function startSystems(){
    label("Finalizing…"); setBar(92);
    window.dispatchEvent(new CustomEvent("pp:start"));
  }

  // ---------- reveal UI ----------
  function revealUI(){
    setBar(100);
    setTimeout(()=> hideLoader(), 120);
    if (belt()) belt().style.display = "flex";
    try{ $("#renderCanvas")?.focus?.(); }catch(_){}
  }

  // ---------- pipeline ----------
  async function startGame(){
    if (started) return;
    started = true;

    showLoader(); // only now

    try{
      const maps = await loadManifest(); setBar(12);
      await createEngineScene();         setBar(24);
      const meta = chosenMap(maps);
      await importMap(meta);             setBar(60);
      enforceSpawn();                    setBar(74);
      pointerLock();                     setBar(86);
      startSystems();                    setBar(95);
      revealUI();
    }catch(err){
      console.error("[bootstrap] fatal start error:", err);
      label("Boot failed – see console."); setBar(100);
    }finally{
      try{ $("#title-screen")?.remove(); }catch(_){}
    }
  }

  // ---------- wire start button ONLY ----------
  (function wire(){
    const btn = $("#start-button");
    if (!btn) return;
    if (belt()) belt().style.display = "none";
    hideLoader();
    btn.addEventListener("click", startGame, { once:true });
  })();
})();
