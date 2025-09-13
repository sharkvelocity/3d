/* assets/dev/game/game_bootstrap.js */
(function () {
  "use strict";
  if (window.__PP_GAME_BOOT__) return;
  window.__PP_GAME_BOOT__ = true;

  // ---------- DOM helpers ----------
  const $ = (s) => document.querySelector(s);
  const box = () => $("#loading-box");
  const txt = () => $("#loading-text");
  const fill = () => $("#loading-fill");
  const belt = () => $("#belt");

  function setBar(p){ const f=fill(); if (f) f.style.width = Math.max(0,Math.min(100,p)).toFixed(1)+"%"; }
  function label(s){ const t=txt(); if (t) t.textContent = s; }
  function showLoader(){ const b=box(); if (b){ b.style.display="flex"; setBar(0);} }
  function hideLoader(){ const b=box(); if (b) b.style.display="none"; }

  // ---------- state ----------
  let started=false, engine=null, scene=null, camera=null;

  // ---------- manifest ----------
  async function fetchJSON(url){
    try{
      const r = await fetch(new URL(url, document.baseURI), { cache:"no-store" });
      if (!r.ok) throw new Error(r.status+" "+r.statusText);
      return await r.json();
    }catch(e){ console.warn("[bootstrap] fetchJSON", url, e); return null; }
  }
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    let A=[];
    if (Array.isArray(j)) A=j;
    else if (j && Array.isArray(j.maps)) A=j.maps;
    if (!A.length){
      A = [
        { file:"Abandoned_House.glb", title:"Abandoned House", def:"Abandoned_House.config.js" },
        { file:"furnished_house.glb", title:"Furnished House", def:"furnished_house.js" },
        { file:"jailhouse.glb", title:"Jailhouse", def:"jailhouse.config.js" },
        { file:"apartment_floor_plan.glb", title:"Apartment", def:"apartment_floor_plan.config.js" }
      ];
    }
    const sel = $("#map-select");
    if (sel){
      sel.innerHTML = A.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
      try{ const s = localStorage.getItem("selectedMapIndex"); if (s && A[+s]) sel.value=s; }catch(_){}
      sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){ } };
    }
    return A;
  }
  function chosenMap(M){
    const sel = $("#map-select");
    const i = Math.max(0, Math.min((M.length-1)||0, parseInt(sel?.value||"0",10)||0));
    return M[i] || M[0];
  }

  // ---------- safe global export ----------
  function safeExport(){
    const G = (window.PP = window.PP || {});
    G.globals = G.globals || {};
    G.globals.engine = engine; G.globals.scene = scene; G.globals.camera = camera;
    try{ window.ENGINE = engine; }catch{ window.__ENGINE = engine; }
    try{ window.SCENE  = scene;  }catch{ window.__SCENE  = scene;  }
    try{ window.camera = camera; }catch{ window.__camera = camera; }
  }

  // ---------- engine/scene (after click) ----------
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

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1; camera.inertia = 0;
    camera.applyGravity = true; camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);

    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();
    // Force WASD only (no arrows)
    camera.keysUp    = [87]; // W
    camera.keysDown  = [83]; // S
    camera.keysLeft  = [65]; // A
    camera.keysRight = [68]; // D

    scene.activeCamera = camera;
    camera.attachControl(canvas, true);

    // Explicit decoder configuration so imports don’t hang
    try{
      const cdn = "./cdn/";
      if (BABYLON.DracoCompression){
        BABYLON.DracoCompression.Configuration = {
          decoder: {
            wasmUrl:      cdn + "draco_wasm_wrapper_gltf.js",
            wasmBinaryUrl:cdn + "draco_decoder_gltf.wasm",
            jsUrl:        cdn + "draco_decoder_gltf.js",
          }
        };
      }
      if (BABYLON.MeshoptCompression){
        BABYLON.MeshoptCompression.Configuration = {
          decoder: cdn + "meshopt_decoder.js"
        };
      }
    }catch(e){ console.warn("[bootstrap] decoder config", e); }

    safeExport();
    engine.runRenderLoop(()=> scene && scene.render());
    addEventListener("resize", ()=> engine && engine.resize());
  }

  // ---------- load map def ----------
  async function loadScriptOnce(path){
    return new Promise((resolve)=>{
      const s=document.createElement("script");
      s.src = new URL(path, document.baseURI).toString() + (path.includes("?")?"":`?v=${Date.now()}`);
      s.async=true; s.onload=()=>resolve(true); s.onerror=()=>resolve(false);
      document.head.appendChild(s);
    });
  }
  async function loadMapDef(file, defName){
    label("Loading map definition…"); setBar(30);
    const base = (file||"").replace(/\.[^.]+$/,"");
    const tries = [];
    if (defName) tries.push(`./assets/models/map/${defName}`);
    tries.push(`./assets/models/map/${base}.config.js`);
    tries.push(`./assets/models/map/${base}.js`);
    for (const p of tries){
      const ok = await loadScriptOnce(p);
      if (ok && window.MAP_DEF) return;
    }
    window.MAP_DEF = window.MAP_DEF || {};
    const d = window.MAP_DEF;
    d.file = file || d.file || "";
    d.scale = d.scale ?? 1;
    d.rotationY = d.rotationY ?? 0;
    d.offset = d.offset || {x:0,y:0,z:0};
    d.spawn = d.spawn || {x:0,y:1.8,z:0};
  }
  function applyMapDef(root){
    const d = window.MAP_DEF || {};
    try{
      if (typeof d.scale === "number") root.scaling.set(d.scale,d.scale,d.scale);
      root.rotation.y = (d.rotationY||0)*Math.PI/180;
      if (d.offset) root.position.set(d.offset.x||0, d.offset.y||0, d.offset.z||0);
    }catch(_){}
  }

  // ---------- fallback room (30x30m, ~900 sq ft) ----------
  function buildFallbackRoom(){
    label("Building fallback room…"); setBar(52);
    const w=30, h=3.2;
    const mat = new BABYLON.StandardMaterial("roomMat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.18,0.18,0.2);

    const floor = BABYLON.MeshBuilder.CreateGround("roomFloor", {width:w, height:w}, scene);
    floor.material = mat; floor.checkCollisions = true;

    const wall = BABYLON.MeshBuilder.CreateBox("wallN", {width:w, height:h, depth:0.2}, scene);
    wall.material = mat; wall.checkCollisions = true;

    const wallS = wall.clone("wallS"), wallE = wall.clone("wallE"), wallW = wall.clone("wallW");
    wall.position.set(0,h/2,-w/2);
    wallS.position.set(0,h/2, w/2);
    wallE.scaling.set(0.2,1,1); wallE.rotation.y = Math.PI/2; wallE.position.set( w/2, h/2, 0);
    wallW.scaling.set(0.2,1,1); wallW.rotation.y = Math.PI/2; wallW.position.set(-w/2, h/2, 0);

    const p = new BABYLON.PointLight("roomLight", new BABYLON.Vector3(0,h-0.4,0), scene);
    p.intensity = 0.85;

    camera.position.set(0,1.8,0);
    try{ camera.setTarget(new BABYLON.Vector3(0,1.8,2)); }catch(_){}
  }

  // ---------- import with timeout -> fallback ----------
  function withTimeout(promise, ms, labelText){
    let t; const timeout = new Promise((_,rej)=> t=setTimeout(()=> rej(new Error(labelText||"timeout")), ms));
    return Promise.race([promise, timeout]).finally(()=> clearTimeout(t));
  }

  async function importMap(meta){
    const file = meta?.file || "Abandoned_House.glb";
    await loadMapDef(file, meta?.def);
    label("Loading selected map…"); setBar(40);

    try{
      const res = await withTimeout(
        BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene),
        8000,
        "GLB import stalled"
      );
      const root = res.meshes[0] || null;
      if (root){
        applyMapDef(root);
        res.meshes.forEach(m=>{ try{ m.checkCollisions=true; m.receiveShadows=true; }catch(_){ } });
        label("Map ready."); setBar(55);
        return true;
      }
    }catch(e){
      console.warn("[bootstrap] import failed or timed out -> fallback", e);
    }
    buildFallbackRoom();
    return false;
  }

  // ---------- spawn / pointer lock / systems ----------
  function enforceSpawn(){
    label("Placing player…"); setBar(70);
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? {x:d.spawn.x||0,y:d.spawn.y||1.8,z:d.spawn.z||0} : {x:0,y:1.8,z:0};
    camera.position.set(sp.x,sp.y,sp.z);
    try{ camera.setTarget(new BABYLON.Vector3(sp.x, sp.y+1, sp.z+2)); }catch(_){}
  }
  function pointerLock(){
    label("Pointer lock…"); setBar(82);
    const canvas = $("#renderCanvas"); if (!canvas?.requestPointerLock) return;
    function lock(){ if (document.pointerLockElement !== canvas){ try{ canvas.requestPointerLock(); }catch(_){ } } }
    canvas.addEventListener("click", ()=> lock(), { passive:true });
    setTimeout(()=> lock(), 250);
  }
  function startSystems(){
    label("Finalizing…"); setBar(92);
    window.dispatchEvent(new CustomEvent("pp:start"));
  }
  function revealUI(){
    label("Ready."); setBar(100);
    setTimeout(()=> hideLoader(), 120);
    if (belt()) belt().style.display = "flex";
    try{ $("#renderCanvas")?.focus?.(); }catch(_){}
  }

  // ---------- pipeline ----------
  async function startGame(){
    if (started) return; started = true;
    showLoader(); if (belt()) belt().style.display = "none";

    try{
      const maps = await loadManifest();   setBar(12);
      await createEngineScene();           setBar(24);
      const meta = chosenMap(maps);
      await importMap(meta);               setBar(60);
      enforceSpawn();                      setBar(74);
      pointerLock();                       setBar(84);
      startSystems();                      setBar(96);
      revealUI();                          setBar(100);
    }catch(err){
      console.error("[bootstrap] fatal start error:", err);
      label("Boot failed. See console."); setBar(100);
    } finally {
      try{ $("#title-screen")?.remove(); }catch(_){}
    }
  }

  // ---------- wire only after click ----------
  (function wireStart(){
    const btn = $("#start-button");
    if (!btn) return;
    hideLoader();
    if (belt()) belt().style.display = "none";
    btn.addEventListener("click", startGame, { once:true });
  })();
})();
