/* game_bootstrap.js — everything loads only AFTER Start (with loader)
   - Robust map filename resolver (case/space/underscore/encoding variants)
   - On-screen diagnostics when a map can't be found
   - No pre-start work; loader owns the full pipeline
*/
(function () {
  if (window.__GameBootstrapReady) return; window.__GameBootstrapReady = true;

  const $ = (s)=>document.querySelector(s);
  const log=(...a)=>{ try{ console.log("[bootstrap]",...a);}catch{} };
  const warn=(...a)=>{ try{ console.warn("[bootstrap]",...a);}catch{} };

  function u(url){ try{ return new URL(url, document.baseURI).toString(); }catch{ return url; } }
  async function fetchJSON(url){
    try{ const r=await fetch(u(url),{cache:"no-store"}); if(!r.ok) throw new Error(r.status+" "+r.statusText); return await r.json(); }
    catch(e){ warn("fetchJSON",url,e); return null; }
  }
  async function head(url){
    try{ const r=await fetch(u(url),{method:"HEAD",cache:"no-store"}); return r.ok; }catch{ return false; }
  }

  // ---------------- Toast (also used for errors) ----------------
  function toast(msg, kind="info", ms=4200){
    const t = $("#toast");
    if (!t) { console[kind==="error"?"error":"log"]("[toast]", msg); return; }
    t.textContent = msg;
    t.style.display = "block";
    t.style.borderColor = (kind==="error"?"#a33":"#066");
    t.style.color = (kind==="error"?"#fbb":"#0ff");
    clearTimeout(toast._h);
    toast._h = setTimeout(()=>{ t.style.display="none"; }, ms);
  }

  // ---------------- Loader UI ----------------
  const Loader=(()=>{
    const box=()=>$("#loading-box"), text=()=>$("#loading-text"), fill=()=>$("#loading-fill");
    let i=0,n=0,steps=[];
    function show(){ const b=box(); if(b) b.style.display="flex"; }
    function hide(){ const b=box(); if(b) b.style.display="none"; }
    function label(s){ const t=text(); if(t) t.textContent=s||""; }
    function draw(){ const f=fill(); if(f) f.style.width=(n?(i/n)*100:0).toFixed(1)+"%"; }
    function add(lbl,fn){ steps.push({lbl,fn}); n=steps.length; }
    async function run(){ show(); draw(); for(const s of steps){ label(s.lbl); draw(); try{ await s.fn(); }catch(e){ warn("step",s.lbl,e);} i++; draw(); } label("Finalizing…"); await new Promise(r=>setTimeout(r,120)); hide(); steps=[]; i=0; n=0; }
    return { add, run, show, hide, label };
  })();

  // ---------------- State ----------------
  let engine, scene, camera;
  let MAP_FILES = [];

  function chosenMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value||"0",10)||0));
    return MAP_FILES[idx];
  }

  // ---------------- Manifest (inside loader) ----------------
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;
    if (!MAP_FILES.length){
      MAP_FILES = [
        { file:"Abandoned_House.glb",        title:"Abandoned House", def:"Abandoned_House.config.js" },
        { file:"furnished_house.glb",        title:"Furnished House", def:"furnished_house.js" },
        { file:"jailhouse.glb",              title:"Jailhouse",       def:"jailhouse.config.js" },
        { file:"apartment_floor_plan.glb",   title:"Apartment",       def:"apartment_floor_plan.config.js" }
      ];
    }
    // Populate dropdown now (title screen still visible before Start)
    const sel = $("#map-select");
    if (sel){
      sel.innerHTML = MAP_FILES.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
      try{
        const saved = localStorage.getItem("selectedMapIndex");
        if (saved && MAP_FILES[+saved]) sel.value = saved; else sel.value = "0";
      }catch{ sel.value="0"; }
      sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value);}catch{} };
    }
  }

  // ---------------- Engine/Scene (inside loader) ----------------
  async function prepareEngineScene(){
    const canvas = $("#renderCanvas"); if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("Babylon is missing");
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);

    // mild night tint
    scene.clearColor = new BABYLON.Color4(0.09,0.10,0.14,1.0);
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

  // ---------------- MAP_DEF + Import (inside loader) ----------------
  async function tryLoadMapDef(defName, mapFile){
    const baseNoExt = (mapFile||"").replace(/\.[^.]+$/, "");
    const cands = [];
    if (defName) cands.push(`./assets/models/map/${defName}`);
    cands.push(`./assets/models/map/${baseNoExt}.config.js`);
    cands.push(`./assets/models/map/${baseNoExt}.js`);
    for (const c of cands){
      const ok = await new Promise(res=>{ const s=document.createElement("script"); s.src=u(c)+`?v=${Date.now()}`; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); });
      if (ok && window.MAP_DEF && (MAP_DEF.spawn || MAP_DEF.offset || MAP_DEF.scale)) return true;
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
    const d=MAP_DEF;
    try{
      if (typeof d.scale==="number") root.scaling = new BABYLON.Vector3(d.scale,d.scale,d.scale);
      const yaw = (d.rotationY||0) * Math.PI/180;
      root.rotation = new BABYLON.Vector3(0,yaw,0);
      if (d.offset){ root.position.x=d.offset.x||0; root.position.y=d.offset.y||0; root.position.z=d.offset.z||0; }
    }catch(e){ warn("applyMapDef", e); }
  }

  // Try many filename variants, report each attempt in console
  async function resolveMapFilename(orig){
    // Build candidate variants
    const variants = new Set();

    const push = (s)=>{ if (s) variants.add(s); };

    const base = (orig||"").trim();
    const uSpace = base.replace(/ /g, "_");
    const sSpace = base.replace(/_/g, " ");
    const lc = base.toLowerCase();
    const ucFirst = base.replace(/(^|[ _-])([a-z])/g, (m,pre,ch)=> pre + ch.toUpperCase());

    // raw names
    push(base); push(uSpace); push(sSpace);
    push(lc); push(ucFirst);

    // URL-encoded spaces
    push(encodeURIComponent(base).replace(/%2F/gi,"/"));
    push(encodeURIComponent(sSpace).replace(/%2F/gi,"/"));
    push(encodeURIComponent(uSpace).replace(/%2F/gi,"/"));

    // Common GLB/ext fixes
    const ensureGlb = (s)=> s.endsWith(".glb") ? s : (s + ".glb");
    [...Array.from(variants)].forEach(v=>{ push(ensureGlb(v)); });

    // Try each variant
    const tried = [];
    for (const v of variants){
      const rel = `./assets/models/map/${v}`;
      tried.push(rel);
      if (await head(rel)) {
        log("Map resolved:", rel);
        return { ok:true, file:v, tried };
      }
    }
    return { ok:false, tried };
  }

  async function loadSelectedMap(){
    const m = chosenMap();
    const target = (m?.file || "Abandoned_House.glb");

    const { ok, file, tried } = await resolveMapFilename(target);
    if (!ok){
      warn("Map file not found. Tried:", tried);
      toast(`Map not found. Tried:\n${tried.join("\n")}`, "error", 8000);
      // Show a simple ground so the scene still works
      const g = BABYLON.MeshBuilder.CreateGround("fallback", { width: 200, height: 200 }, scene);
      g.checkCollisions = true;
      return;
    }

    await tryLoadMapDef(m?.def, file);

    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      const root = res.meshes[0] || null;
      if (root){
        applyMapDefToRoot(root);
        res.meshes.forEach(me=>{ try{ me.checkCollisions=true; me.receiveShadows=true; }catch{} });
      }
      log("Map imported:", file);
    }catch(e){
      warn("Import failed, ground fallback", e);
      toast(`Failed to import "${file}". See console.`, "error", 8000);
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

  // ---------------- Start pipeline (fires AFTER Start button) ----------------
  async function startPipeline(){
    Loader.add("Loading maps…",        async ()=> await loadManifest());
    Loader.add("Preparing engine…",    async ()=> await prepareEngineScene());
    Loader.add("Loading selected map…",async ()=> await loadSelectedMap());
    Loader.add("Placing player…",      async ()=> setSpawn());
    Loader.add("Pointer lock…",        async ()=> enablePointerLockOnce());
    await Loader.run();
    try{ $("#renderCanvas")?.focus?.(); }catch{}
  }

  // Nothing loads before Start
  window.addEventListener("pp:start", ()=> {
    startPipeline().catch(e=>{ warn("bootstrap failed:", e); toast("Boot failed. See console.", "error"); });
  }, { once:true });
})();
