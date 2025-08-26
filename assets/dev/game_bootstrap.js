/* game_bootstrap.js — map transform applied + vanZone spawn + stray mesh tidy */
(function () {
  if (window.__GameBootstrapReady) return;
  window.__GameBootstrapReady = true;

  const $ = (s)=>document.querySelector(s);
  const log = (...a)=>{ try{ console.log("[bootstrap]", ...a);}catch(_){} };
  const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a);}catch(_){} };

  function docResolve(p){ try{ return new URL(p, document.baseURI).toString(); }catch(_){ return p; } }
  function loadScriptOnce(path){
    return new Promise(res=>{
      const s=document.createElement("script");
      s.src = docResolve(path) + (path.includes("?")?"":`?v=${Date.now()}`);
      s.async=true; s.onload=()=>res(true); s.onerror=()=>res(false);
      document.head.appendChild(s);
    });
  }
  async function fetchJSON(url){
    try{ const r=await fetch(docResolve(url),{cache:"no-store"}); if(!r.ok) throw 0; return await r.json(); }
    catch(e){ return null; }
  }

  /* ---------- manifest / selector (unchanged) ---------- */
  let MAP_FILES=[];
  async function loadManifest(){
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) MAP_FILES=j; else if (j?.maps) MAP_FILES=j.maps;
    if (!MAP_FILES.length){
      MAP_FILES = [
        { file:"Abandoned_House.glb",     title:"Abandoned House",   def:"Abandoned_House.js" },
        { file:"furnished_house.glb",     title:"Furnished House",   def:"furnished_house.js" },
        { file:"apartment_floor_plan.glb",title:"Apartment",         def:"apartment_floor_plan.js" },
        { file:"jailhouse.glb",           title:"Jailhouse",         def:"jailhouse.js" }
      ];
    }
    const sel=$("#map-select");
    if (sel){
      sel.innerHTML = MAP_FILES.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
      sel.value = String(Math.max(0, Math.min(+localStorage.getItem("selectedMapIndex")||0, MAP_FILES.length-1)));
      sel.onchange = ()=>localStorage.setItem("selectedMapIndex", sel.value);
    }
  }
  function getSelectedMap(){
    const sel=$("#map-select");
    const idx=Math.max(0, Math.min(MAP_FILES.length-1, parseInt(sel?.value||"0",10)||0));
    return MAP_FILES[idx];
  }

  /* ---------- loader UI (unchanged) ---------- */
  const Loader=(()=>{ const box=()=>$("#loading-box"), text=()=>$("#loading-text"), fill=()=>$("#loading-fill");
    let done=0,total=0,steps=[];
    function show(){ const b=box(); if(b) b.style.display="flex"; }
    function hide(){ const b=box(); if(b) b.style.display="none"; }
    function label(s){ const t=text(); if(t) t.textContent=s||""; }
    function draw(){ const f=fill(); if(!f) return; f.style.width=(total?(done/total)*100:0).toFixed(1)+"%"; }
    function add(lbl,fn){ steps.push({lbl,fn}); total=steps.length; }
    async function run(){ show(); draw(); for(const s of steps){ label(s.lbl); draw(); try{await s.fn();}catch(e){} done++; draw(); } label("Finalizing…"); await new Promise(r=>setTimeout(r,120)); hide(); }
    function reset(){ steps=[]; done=0; total=0; draw(); }
    return {add: add, run, reset};
  })();

  /* ---------- Babylon base (unchanged except inputs tidy) ---------- */
  let engine, scene, camera;
  async function prepareEngineScene(){
    const canvas=document.getElementById("renderCanvas");
    engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
    scene=new BABYLON.Scene(engine);
    scene.fogMode=BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity=0.0045; scene.fogColor=new BABYLON.Color3(0.02,0.03,0.05);
    const hemi=new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene); hemi.intensity=0.35;

    camera=new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.inputs.clear(); camera.inputs.addMouse(); camera.inputs.addKeyboard();
    camera.keysUp=[87]; camera.keysDown=[83]; camera.keysLeft=[65]; camera.keysRight=[68];
    camera.speed = Math.abs(camera.speed||0.45);
    camera.minZ=0.1; camera.applyGravity=true; camera.checkCollisions=true;
    camera.ellipsoid=new BABYLON.Vector3(0.35,0.9,0.35); camera.ellipsoidOffset=new BABYLON.Vector3(0,0.4,0);
    camera.attachControl(canvas,true);
    canvas.addEventListener("click", ()=>{ if (document.pointerLockElement!==canvas) canvas.requestPointerLock?.(); });

    engine.runRenderLoop(()=>scene.render());
    window.addEventListener("resize", ()=>engine.resize());

    const hud=$("#hud-xyz"); if (hud) hud.style.display="block";
    scene.onBeforeRenderObservable.add(()=>{
      try{
        $("#hud-x").textContent=camera.position.x.toFixed(2);
        $("#hud-y").textContent=camera.position.y.toFixed(2);
        $("#hud-z").textContent=camera.position.z.toFixed(2);
      }catch(_){}
    });
  }

  /* ---------- local<->world helpers + spawn ---------- */
  const toRad = (d)=>d*Math.PI/180;
  function localToWorld(p, def){
    const s=(def?.scale ?? 1), yaw=toRad(def?.rotationY ?? 0);
    const cos=Math.cos(yaw), sin=Math.sin(yaw);
    const x=(p?.x||0)*s, y=(p?.y||0)*s, z=(p?.z||0)*s;
    const xr=x*cos - z*sin, zr=x*sin + z*cos;
    return new BABYLON.Vector3((def?.offset?.x||0)+xr, (def?.offset?.y||0)+y, (def?.offset?.z||0)+zr);
  }
  function computeSpawnWS(){
    // Hard override if you want absolute world coords
    if (window.MAP_DEF?.forceSpawnWS){
      const f=MAP_DEF.forceSpawnWS; return new BABYLON.Vector3(f.x||0, f.y||1.8, f.z||0);
    }
    if (window.MAP_DEF?.vanZone?.center){
      const c = MAP_DEF.vanZone.center;
      return localToWorld({x:c.x, y:(c.y??1.8), z:c.z}, MAP_DEF);
    }
    if (window.MAP_DEF?.spawn){
      return new BABYLON.Vector3(MAP_DEF.spawn.x||0, MAP_DEF.spawn.y||1.8, MAP_DEF.spawn.z||0);
    }
    return new BABYLON.Vector3(0,1.8,0);
  }
  function enforceSpawn(){
    const p=computeSpawnWS();
    camera.position.copyFrom(p);
    camera.setTarget(p.add(new BABYLON.Vector3(0,1,2)));
    log("Spawn WS:", p.toString());
  }

  /* ---------- map def + import (APPLY TRANSFORM TO MESHES) ---------- */
  async function tryLoadMapDef(defName, mapFile){
    const base=(mapFile||"").replace(/\.[^.]+$/,"");
    const candidates=[];
    if (defName) candidates.push(`./assets/models/map/${defName}`);
    candidates.push(`./assets/models/map/${base}.js`);
    candidates.push(`./assets/models/map/${base}.config.js`);
    // known files
    candidates.push("./assets/models/map/Abandoned_House.js");
    candidates.push("./assets/models/map/furnished_house.js");
    candidates.push("./assets/models/map/apartment_floor_plan.js");
    candidates.push("./assets/models/map/jailhouse.js");

    for (const c of candidates){
      const ok=await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn){ log("Loaded MAP_DEF from", c); return true; }
    }
    window.MAP_DEF = window.MAP_DEF || { spawn:{x:0,y:1.8,z:0} };
    warn("No MAP_DEF found; using fallback.");
    return true;
  }

  async function loadSelectedMap(){
    const chosen=getSelectedMap();
    const file=chosen?.file || "Abandoned_House.glb";
    await tryLoadMapDef(chosen?.def, file);

    let container=null;
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", file, scene);
      // Create a container parent and move all imported nodes under it
      container = new BABYLON.TransformNode("map_root", scene);
      for (const m of res.meshes){ if (m && m !== scene.meshes[0]) m.setParent(container); }
      // APPLY MAP_DEF transform to the whole map
      const s = (MAP_DEF?.scale ?? 1);
      container.scaling = new BABYLON.Vector3(s, s, s);
      container.rotation = new BABYLON.Vector3(0, toRad(MAP_DEF?.rotationY ?? 0), 0);
      container.position = new BABYLON.Vector3(
        MAP_DEF?.offset?.x || 0,
        MAP_DEF?.offset?.y || 0,
        MAP_DEF?.offset?.z || 0
      );
      // collisions
      res.meshes.forEach(m=>{ try{ m.checkCollisions=true; m.receiveShadows=true; }catch(_){ } });
      log("Map imported + transformed:", file);
    }catch(e){
      warn("Map import failed, using ground", e);
      container = new BABYLON.TransformNode("map_root", scene);
      const g = BABYLON.MeshBuilder.CreateGround("fallback", {width:180, height:180}, scene);
      g.checkCollisions=true; g.setParent(container);
    }

    // Tidy obviously stray meshes by name (walkie/radio planes from old assets)
    try{
      const centerWS = computeSpawnWS();
      scene.meshes.forEach(m=>{
        const n=(m.name||"").toLowerCase();
        if (n.includes("walkie") || n.includes("radio")){
          m.position = new BABYLON.Vector3(centerWS.x, centerWS.y, centerWS.z);
        }
      });
    }catch(_){}
  }

  /* ---------- start flow ---------- */
  let started=false;
  async function safeStart(e){
    e?.preventDefault?.();
    if (started) return; started=true;
    const title=$("#title-screen"); if (title) title.style.display="none";

    Loader.reset();
    Loader.add("Loading map list…", loadManifest);
    Loader.add("Preparing engine…", prepareEngineScene);
    Loader.add("Importing map…", loadSelectedMap);
    Loader.add("Placing player…", async ()=> enforceSpawn());
    await Loader.run();

    const canvas=document.getElementById("renderCanvas");
    canvas?.focus?.(); canvas?.requestPointerLock?.();

    window.dispatchEvent(new CustomEvent("pp:scene-ready", { detail:{ scene, camera } }));

    // Seed belt if needed
    try{
      const inv = (window.PP?.storage?.loadInventory?.() || {slots:[], equipped:0});
      if (!inv.slots.length){
        window.PP?.storage?.saveInventory?.({slots:['uv','spirit','cam'], equipped:0});
      }
      if (window.buildBelt) window.buildBelt(window.PP.storage.loadInventory().slots);
    }catch(_){}
  }

  (function wire(){
    const btn=$("#start-button"); if (btn) btn.addEventListener("click", safeStart, {passive:false});
    document.addEventListener("keydown",(e)=>{ if(!started&&(e.key==="Enter"||e.code==="Space")){ e.preventDefault(); safeStart(e);}},{passive:false});
    window.addEventListener("DOMContentLoaded", ()=>{ loadManifest().catch(()=>{}); });
  })();
})();
