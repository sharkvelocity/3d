/* game_bootstrap.js — unified controls + map select + load + spawn + scene-ready ping */
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  const $ = (s)=>document.querySelector(s);
  const log = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch(_){} };
  const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch(_){} };

  function docResolve(p){ try{ return new URL(p, document.baseURI).toString(); }catch(_){ return p; } }
  function loadScriptOnce(path){
    return new Promise(res=>{
      const s=document.createElement("script");
      s.src = docResolve(path) + (path.includes("?")?"":`?v=${Date.now()}`);
      s.async = true; s.onload=()=>res(true); s.onerror=()=>res(false);
      document.head.appendChild(s);
    });
  }
  async function fetchJSON(url){
    try{
      const r = await fetch(docResolve(url), {cache:"no-store"});
      if(!r.ok) throw new Error(r.statusText);
      return await r.json();
    }catch(e){ warn("fetchJSON failed", url, e); return null; }
  }

  // ---------- manifest / selector ----------
  let MAP_FILES = [];
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES = j;
    else if (j && Array.isArray(j.maps)) MAP_FILES = j.maps;
    if (!MAP_FILES.length){
      MAP_FILES = [
        { file:"Abandoned_House.glb", title:"Abandoned House", def:"Abandoned_House.js" },
        { file:"furnished_house.glb", title:"Furnished House", def:"furnished_house.js" },
        { file:"apartment_floor_plan.glb", title:"Apartment", def:"apartment_floor_plan.js" },
        { file:"jailhouse.glb", title:"Jailhouse", def:"jailhouse.js" },
      ];
    }
    const sel = $("#map-select");
    if (!sel) return;
    sel.innerHTML = MAP_FILES.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
    const saved = +localStorage.getItem("selectedMapIndex")||0;
    sel.value = String(Math.max(0, Math.min(saved, MAP_FILES.length-1)));
    sel.onchange = ()=>localStorage.setItem("selectedMapIndex", sel.value);
  }
  function getSelectedMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value||"0",10)||0));
    return MAP_FILES[idx];
  }

  // ---------- loader UI ----------
  const Loader = (() => {
    const box = ()=>$("#loading-box"), text=()=>$("#loading-text"), fill=()=>$("#loading-fill");
    let done=0,total=0,steps=[];
    function show(){ const b=box(); if(b) b.style.display="flex"; }
    function hide(){ const b=box(); if(b) b.style.display="none"; }
    function label(s){ const t=text(); if(t) t.textContent=s||""; }
    function draw(){ const f=fill(); if(!f) return; f.style.width = (total? (done/total)*100:0).toFixed(1)+"%"; }
    function add(lbl,fn){ steps.push({lbl,fn}); total=steps.length; }
    async function run(){ show(); draw();
      for(const s of steps){ label(s.lbl); draw(); try{ await s.fn(); }catch(e){ warn("step failed", s.lbl, e);} done++; draw(); }
      label("Finalizing…"); await new Promise(r=>setTimeout(r,120)); hide();
    }
    function reset(){ steps=[]; done=0; total=0; draw(); }
    return {add,run,reset,show,hide,label};
  })();

  // ---------- Babylon scene ----------
  let engine, scene, camera, hemi;
  async function prepareEngineScene(){
    const canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
    scene = new BABYLON.Scene(engine);

    // Fog/lighting (mild)
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);
    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    // Camera — single input stack, NOT inverted
    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.speed = Math.abs(camera.speed||0.45);      // ensure positive
    camera.angularSensibility = 2000;                 // comfortable mouse
    camera.minZ = 0.1;
    camera.applyGravity = true;
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    camera.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);

    // Kill any previously registered inputs and add only mouse+keyboard in the right order
    camera.inputs.clear();
    camera.inputs.addMouse();                         // look
    camera.inputs.addKeyboard();                      // WASD relative to look

    // Standard key maps
    camera.keysUp = [87];     // W
    camera.keysDown = [83];   // S
    camera.keysLeft = [65];   // A
    camera.keysRight = [68];  // D

    camera.attachControl(canvas, true);

    // Pointer lock on click
    canvas.addEventListener("click", ()=>{
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });

    // Render loop
    engine.runRenderLoop(()=> scene.render());
    window.addEventListener("resize", ()=> engine.resize());

    // HUD XYZ
    const hud=$("#hud-xyz"); if (hud) hud.style.display="block";
    scene.onBeforeRenderObservable.add(()=>{
      try{
        $("#hud-x").textContent = camera.position.x.toFixed(2);
        $("#hud-y").textContent = camera.position.y.toFixed(2);
        $("#hud-z").textContent = camera.position.z.toFixed(2);
      }catch(_){}
    });
  }

  // ---------- spawn helpers ----------
  function toRad(d){ return d*Math.PI/180; }
  function localToWorld(p, def){
    const s=(def?.scale ?? 1), yaw=toRad(def?.rotationY ?? 0);
    const cos=Math.cos(yaw), sin=Math.sin(yaw);
    const x=(p?.x||0)*s, y=(p?.y||0)*s, z=(p?.z||0)*s;
    const xr=x*cos - z*sin, zr=x*sin + z*cos;
    return new BABYLON.Vector3((def?.offset?.x||0)+xr, (def?.offset?.y||0)+y, (def?.offset?.z||0)+zr);
  }
  function computeSpawnWS(){
    if (window.MAP_DEF){
      if (MAP_DEF.vanZone?.center){
        const c = MAP_DEF.vanZone.center;
        const v = localToWorld({x:c.x, y:(c.y??1.8), z:c.z}, MAP_DEF);
        return new BABYLON.Vector3(v.x, (c.y??1.8), v.z);
      }
      if (MAP_DEF.spawn){
        return new BABYLON.Vector3(MAP_DEF.spawn.x||0, MAP_DEF.spawn.y||1.8, MAP_DEF.spawn.z||0);
      }
    }
    return new BABYLON.Vector3(0,1.8,0);
  }
  function enforceSpawn(){
    const p = computeSpawnWS();
    camera.position.copyFrom(p);
    // Look “forward” in +Z from spawn so WASD is intuitive relative to view
    camera.setTarget(p.add(new BABYLON.Vector3(0,1,2)));
  }

  // ---------- map def + import ----------
  async function tryLoadMapDef(defNameOrNull, mapFile){
    const base = (mapFile||"").replace(/\.[^.]+$/,"");
    const candidates = [];
    if (defNameOrNull) candidates.push(`./assets/models/map/${defNameOrNull}`);
    candidates.push(`./assets/models/map/${base}.js`);
    candidates.push(`./assets/models/map/${base}.config.js`);
    // known defs you have
    candidates.push("./assets/models/map/Abandoned_House.js");
    candidates.push("./assets/models/map/furnished_house.js");
    candidates.push("./assets/models/map/jailhouse.js");
    candidates.push("./assets/models/map/apartment_floor_plan.js");

    for (const c of candidates){
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) { log("Loaded MAP_DEF from", c); return true; }
    }
    warn("No MAP_DEF found; synthesizing fallback.");
    window.MAP_DEF = window.MAP_DEF || { spawn:{x:0,y:1.8,z:0} };
    return true;
  }

  async function loadSelectedMap(){
    const chosen = getSelectedMap();
    const file = chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, file);

    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      // collisions on all imported meshes
      res.meshes.forEach(m=>{ try{ m.checkCollisions = true; m.receiveShadows = true; }catch(_){ } });
      log("Map imported:", file);
    }catch(e){
      warn("Map import failed, creating ground fallback", e);
      BABYLON.MeshBuilder.CreateGround("fallback", {width:180, height:180}, scene).checkCollisions = true;
    }
  }

  // ---------- start flow ----------
  let started=false;
  async function safeStart(e){
    e?.preventDefault?.();
    if (started) return; started=true;

    const title=$("#title-screen"); if (title) title.style.display="none";

    Loader.reset();
    Loader.add("Loading map manifest…", loadManifest);
    Loader.add("Preparing engine…", prepareEngineScene);
    Loader.add("Loading selected map…", loadSelectedMap);
    Loader.add("Placing player…", async ()=> enforceSpawn());

    await Loader.run();

    // Focus/lock once after boot
    const canvas = document.getElementById("renderCanvas");
    try{ canvas?.focus?.(); }catch(_){}
    try{ canvas?.requestPointerLock?.(); }catch(_){}

    // ---- IMPORTANT: broadcast scene-ready so belt/minimap/whatever can hook
    window.dispatchEvent(new CustomEvent("pp:scene-ready", { detail:{ scene, camera } }));

    // Also directly seed belt if merge_patch is present
    try{
      const inv = (window.PP?.storage?.loadInventory?.() || {slots:[], equipped:0});
      if (!inv.slots.length){
        const def = { slots:['emf','spirit','uv'], equipped:0 };
        window.PP?.storage?.saveInventory?.(def);
      }
      if (window.buildBelt) window.buildBelt(window.PP.storage.loadInventory().slots);
    }catch(_){}
  }

  // UI hooks
  (function wireStart(){
    const btn=$("#start-button"); if (btn) btn.addEventListener("click", safeStart, {passive:false});
    document.addEventListener("keydown",(e)=>{
      if (!started && (e.key==="Enter" || e.code==="Space")) { e.preventDefault(); safeStart(e); }
    }, {passive:false});
    window.addEventListener("DOMContentLoaded", ()=>{ loadManifest().catch(()=>{}); });
  })();
})();
