/* game_bootstrap.js — robust map bootstrap for GitHub Pages */
(function () {
  if (window.__GameBootstrapReady) return; window.__GameBootstrapReady = true;

  const $ = (s)=>document.querySelector(s);
  const log=(...a)=>{ try{ console.log("[bootstrap]",...a);}catch{} };
  const warn=(...a)=>{ try{ console.warn("[bootstrap]",...a);}catch{} };

  function u(url){ try{ return new URL(url, document.baseURI).toString(); }catch{ return url; } }
  async function fetchJSON(url){
    try{
      const r = await fetch(u(url), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status+" "+r.statusText);
      return await r.json();
    }catch(e){ warn("fetchJSON", url, e); return null; }
  }
  async function headExists(path){
    try{ const r = await fetch(u(path), { method:"HEAD", cache:"no-store" }); return r.ok; }catch{ return false; }
  }

  // ---- Loader UI ----
  const Loader=(()=>{
    const box=()=>$("#loading-box"), text=()=>$("#loading-text"), fill=()=>$("#loading-fill");
    let i=0, n=0;
    function show(){ const b=box(); if(b) b.style.display="flex"; }
    function hide(){ const b=box(); if(b) b.style.display="none"; }
    function label(s){ const t=text(); if(t) t.textContent=s||""; }
    function draw(){ const f=fill(); if(f) f.style.width = (n? (i/n)*100 : 0).toFixed(1)+"%"; }
    const steps=[];
    function add(lbl,fn){ steps.push({lbl,fn}); n=steps.length; }
    async function run(){ show(); draw(); for (const s of steps){ label(s.lbl); draw(); try{ await s.fn(); }catch(e){ warn("step", s.lbl, e);} i++; draw(); } label("Finalizing…"); await new Promise(r=>setTimeout(r,100)); hide(); steps.length=0; i=0; n=0; }
    return { add, run, show, hide, label };
  })();

  // ---- State ----
  let engine, scene, camera;
  let MAP_FILES = [];

  // ---- Manifest / selector ----
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;

    // Fallback candidates (try both underscore and space names)
    if (!MAP_FILES.length){
      MAP_FILES = [
        { file:"Abandoned_House.glb",        title:"Abandoned House", def:"Abandoned_House.config.js" },
        { file:"Abandoned House.glb",        title:"Abandoned House", def:"Abandoned_House.config.js" },
        { file:"furnished_house.glb",        title:"Furnished House", def:"furnished_house.js" },
        { file:"Furnished House.glb",        title:"Furnished House", def:"furnished_house.js" },
        { file:"jailhouse.glb",              title:"Jailhouse",       def:"jailhouse.config.js" },
        { file:"apartment_floor_plan.glb",   title:"Apartment",       def:"apartment_floor_plan.config.js" }
      ];
    }
    populateMapSelector();
  }

  function populateMapSelector(){
    const sel = $("#map-select"); if (!sel) return;
    const opts = MAP_FILES.map((m,i)=> `<option value="${i}">${m.title || m.file}</option>`).join("");
    sel.innerHTML = opts || `<option value="-1">(no maps found)</option>`;
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved && MAP_FILES[+saved]) sel.value = saved;
      else sel.value = "0";
    } catch { sel.value = "0"; }
    sel.onchange = ()=> { try{ localStorage.setItem("selectedMapIndex", sel.value);}catch{} };
  }

  function chosenMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value||"0",10)||0));
    return MAP_FILES[idx];
  }

  // ---- Engine / Scene ----
  async function prepareEngineScene(){
    const canvas = $("#renderCanvas"); if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("Babylon is missing");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

    const light = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    light.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1; camera.inertia = 0;
    camera.applyGravity = true; camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);

    camera.inputs.clear();
    camera.inputs.addMouse();
    camera.inputs.addKeyboard();
    camera.attachControl(canvas, true);

    engine.runRenderLoop(()=> scene && scene.render());
    addEventListener("resize", ()=> engine && engine.resize());
  }

  // ---- MAP_DEF loading ----
  async function tryLoadMapDef(defName, mapFile){
    const baseNoExt = (mapFile||"").replace(/\.[^.]+$/, "");
    const cands = [];
    if (defName) cands.push(`./assets/models/map/${defName}`);
    cands.push(`./assets/models/map/${baseNoExt}.config.js`);
    cands.push(`./assets/models/map/${baseNoExt}.js`);

    for (const c of cands){
      const ok = await new Promise(res=>{ const s=document.createElement("script"); s.src=u(c)+`?v=${Date.now()}`; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); });
      if (ok && window.MAP_DEF && (MAP_DEF.spawn || MAP_DEF.offset || MAP_DEF.scale)){ log("MAP_DEF:", c); return true; }
    }
    // synthesize minimal def
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
    const d=MAP_DEF;
    try{
      if (typeof d.scale==="number") root.scaling = new BABYLON.Vector3(d.scale,d.scale,d.scale);
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation = new BABYLON.Vector3(0,yaw,0);
      if (d.offset){ root.position.x=d.offset.x||0; root.position.y=d.offset.y||0; root.position.z=d.offset.z||0; }
    }catch(e){ warn("applyMapDef", e); }
  }

  async function loadSelectedMap(){
    const m = chosenMap();
    const filesToTry = [];

    // Try the manifest's path first
    if (m?.file) filesToTry.push(m.file);

    // If filename has spaces/underscores, try both variants
    if (m?.file && (m.file.includes("_") || m.file.includes(" "))){
      filesToTry.push(m.file.replace(/_/g," "));
      filesToTry.push(m.file.replace(/ /g,"_"));
    }

    // Ensure uniqueness
    const seen = new Set(); const uniq = [];
    for (const f of filesToTry){ const k=f.toLowerCase(); if (!seen.has(k)){ seen.add(k); uniq.push(f); } }

    // Pick the first that actually exists (HEAD)
    let chosen = null;
    for (const f of uniq){
      const rel = `./assets/models/map/${encodeURIComponent(f).replace(/%2F/gi,"/")}`;
      if (await headExists(rel)){ chosen = f; break; }
    }
    if (!chosen){
      warn("No map file found among:", uniq);
      throw new Error("Map file missing on server");
    }

    await tryLoadMapDef(m?.def, chosen);

    // Import the map
    const path = "./assets/models/map/";
    const file = chosen;
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", path, file, scene);
      const root = res.meshes[0] || null;
      if (root){
        applyMapDefToRoot(root);
        res.meshes.forEach(me=>{ try{ me.checkCollisions=true; me.receiveShadows=true; }catch{} });
      }
      log("Map imported:", file);
    }catch(e){
      warn("Import failed, fallback ground", e);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 200, height: 200 }, scene);
      g.checkCollisions = true;
    }
  }

  function setSpawn(){
    if (!scene?.activeCamera) return;
    const d = window.MAP_DEF || {};
    const sp = d.spawn ? { x:d.spawn.x||0, y:d.spawn.y||1.8, z:d.spawn.z||0 } : { x:0, y:1.8, z:0 };
    scene.activeCamera.position.set(sp.x, sp.y, sp.z);
    try{ scene.activeCamera.setTarget(new BABYLON.Vector3(sp.x, sp.y+1, sp.z+2)); }catch{}
  }

  function enablePointerLockOnce(){
    const canvas = $("#renderCanvas");
    if (!canvas?.requestPointerLock) return;
    const tryLock = ()=>{ if (document.pointerLockElement !== canvas) { try{ canvas.requestPointerLock(); }catch{} } };
    canvas.addEventListener("click", tryLock, { passive:true });
    setTimeout(tryLock, 250);
  }

  // ---- Start pipeline ----
  async function startPipeline(){
    Loader.add("Loading map list…",    async ()=> await loadManifest());
    Loader.add("Preparing engine…",    async ()=> await prepareEngineScene());
    Loader.add("Loading selected map…",async ()=> await loadSelectedMap());
    Loader.add("Placing player…",      async ()=> setSpawn());
    Loader.add("Pointer lock…",        async ()=> enablePointerLockOnce());
    await Loader.run();

    const canvas = $("#renderCanvas");
    try{ canvas?.focus?.(); }catch{}
  }

  // Wire the Start button
  window.addEventListener("pp:start", ()=> {
    startPipeline().catch(e=>{ warn("bootstrap failed:", e); });
  }, { once:true });

  // Preload manifest so the dropdown has options on title screen
  window.addEventListener("DOMContentLoaded", ()=> { loadManifest().catch(()=>{}); });
})();
