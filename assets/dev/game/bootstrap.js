/* ./assets/dev/game/bootstrap.js — unified bootstrap (engine, maps, prohouse, audio, rig, UI) */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

const $ = s => document.querySelector(s);
const bURL = p => { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };

async function fetchJSON(url){
  try{
    const r = await fetch(bURL(url), { cache: "no-store" });
    if(!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url, e); return null; }
}

function loadScriptOnce(path){
  return new Promise(resolve=>{
    if(document.querySelector(`script[src="${path}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
    s.async = true;
    s.onload = ()=>resolve(true);
    s.onerror = ()=>{ warn("Failed loading", path); resolve(false); };
    document.head.appendChild(s);
  });
}

// ---------- Loader UI ----------
const Loader = (()=>{
  const box = ()=>$("#loading-box");
  const text = ()=>$("#loading-text");
  const fill = ()=>$("#loading-fill");
  let stepsDone=0, stepsTotal=0, queue=[];
  function show(){ const b=box(); if(b) b.style.display="flex"; }
  function hide(){ const b=box(); if(b) b.style.display="none"; }
  function label(s){ const t=text(); if(t) t.textContent = s||""; }
  function draw(){ const f=fill(); if(f) f.style.width = (stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl,fn}); stepsTotal=queue.length; }
  async function run(){
    show(); draw();
    for(const s of queue){
      label(s.lbl); draw();
      try{ await s.fn(); }catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r,120));
    hide();
  }
  return { reset, addStep, run, show, hide, label };
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
let currentMap=null;
let mapMeshes = []; // meshes loaded by loadMap / generator
window.PP = window.PP || {};
PP.manifest = PP.manifest || []; // map manifest

// ---------- Map Manifest / Selector ----------
async function loadManifest(){
  // attempt JSON manifest
  const j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest = j;
  else if(j && Array.isArray(j.maps)) PP.manifest = j.maps;

  // Ensure defaults exist and include procedural ProHouse entry
  if(!PP.manifest || !PP.manifest.length){
    PP.manifest = [
      { file: "Abandoned_House.glb", title: "Abandoned House", def:"" },
      { file: "furnished_house.glb", title: "Furnished House", def:"" },
      { file: "jailhouse.glb", title: "Jailhouse", def:"" },
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator" },
      { file: "Abandoned_House2.glb", title: "Abandoned House 2", def:"" },
      { file: "farm_house.glb", title: "Farm House", def:"" }
    ];
  }

  populateMapSelector();
}

function populateMapSelector(){
  const sel = $("#map-select");
  if(!sel) return;
  if(!PP.manifest.length){
    sel.innerHTML = `<option value="-1">(no maps found)</option>`;
    return;
  }
  sel.innerHTML = PP.manifest.map((m,i)=>{
    return `<option value="${i}">${m.title || m.file || ("map#"+i)}</option>`;
  }).join("");

  // restore saved
  try{
    const saved = localStorage.getItem("selectedMapIndex");
    if(saved && PP.manifest[+saved]) sel.value = saved;
    else sel.value = "0";
  }catch(_){ sel.value = "0"; }

  sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){} };
}

function getSelectedMap(){
  const sel = $("#map-select");
  const idx = Math.max(0, Math.min((PP.manifest||[]).length-1, parseInt(sel?.value||"0",10)));
  return PP.manifest[idx];
}

// ---------- Engine & Scene ----------
function createEngineScene(){
  if(engine && scene) return;
  const canvas = $("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  if(!window.BABYLON) throw new Error("BABYLON is not loaded");

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
  scene  = new BABYLON.Scene(engine);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

  hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.35;

  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
  camera.minZ = 0.1;
  try{ camera.inputs.clear(); }catch(e){}

  // stable invisible ground to catch collisions if map has none
  const ground = BABYLON.MeshBuilder.CreateGround("pp_ground", {width:200, height:200}, scene);
  ground.isVisible = false;
  ground.checkCollisions = true;
  ground.receiveShadows = true;
  ground.metadata = { isGround:true };

  window.ENGINE = engine; window.SCENE = scene; window.camera = camera;

  engine.runRenderLoop(()=>{ try{ scene.render(); }catch(e){ /* swallow render errors */ }});
  window.addEventListener("resize", ()=> engine.resize());
  mark("engine+scene-created");
}

// ---------- ProHouse Generator (grid) ----------
window.ProHouseGenerator = window.ProHouseGenerator || (function(){
  const PG = {
    GRID_W: 10, GRID_D: 10, CELL_SIZE: 6, // room cell size
    rooms: [], roomMeshes: [], doorMeshes: [], lights: [], switches: [],
    async loadPrefab(prefab, scene){
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/prefabs/", prefab, scene);
      return res;
    },
    // simple generator that places modular rooms in grid and returns room descriptors
    generate(seed=Date.now()){
      const rng = (function(s){ let x = s%2147483647; return ()=>{ x = (x * 48271) % 2147483647; return (x-1)/2147483646; }; })(seed|0);
      const rooms = [];
      // fixed van at bottom center
      const vanX = Math.floor(this.GRID_W/2), vanZ = this.GRID_D-2;
      rooms.push({ type:"van", prefab:"van_room.glb", gx:vanX, gz:vanZ, w:1, d:1, name:"Van" });
      // place core rooms near front
      const prefabs = ["living_room.glb","kitchen.glb","bedroom.glb","bathroom.glb","garage.glb","closet.glb"];
      const total = Math.floor(8 + rng()*10);
      let attempts=0;
      while(rooms.length < total && attempts < 1000){
        attempts++;
        const x = Math.floor(rng()*this.GRID_W);
        const z = Math.floor(rng()*this.GRID_D);
        if(rooms.some(r=>r.gx===x && r.gz===z)) continue;
        const p = prefabs[(Math.random()*prefabs.length)|0];
        rooms.push({ type: p.includes("bedroom")?"bedroom": (p.includes("bath")?"bathroom": p.includes("garage")?"garage": (p.includes("closet")?"closet": "room")), prefab:p, gx:x, gz:z, w:1, d:1, name: (p.replace(".glb","") + "_" + rooms.length) });
      }
      this.rooms = rooms;
      return rooms;
    },
    async spawn(scene, seed){
      // cleanup previous
      this.clear(scene);

      if(!scene) throw new Error("No scene");

      const rooms = this.generate(seed);
      for(const r of rooms){
        try{
          const worldPos = new BABYLON.Vector3(r.gx*this.CELL_SIZE, 0, r.gz*this.CELL_SIZE);
          // prefer folder assets/models/map/ for full maps; prefabs in prefabs/
          const prefabPath = "./assets/models/map/prefabs/" + (r.prefab || "room_generic.glb");
          const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/prefabs/", r.prefab, scene);
          // attach and translate
          res.meshes.forEach(m=>{
            if(m.getTotalVertices && m.getTotalVertices()===0){} // ignore helpers
            m.position.addInPlace(worldPos);
            m.checkCollisions = true;
            m.isPickable = true;
            mapMeshes.push(m);
            this.roomMeshes.push(m);
          });
          r.meshes = res.meshes;
          // ceiling light: a PointLight placed at top center of room bounding box
          const bb = res.meshes[0].getBoundingInfo?.()?.boundingBox || null;
          const ceilY = bb ? (bb.maximumWorld.y + 0.4) : 2.5;
          const center = res.meshes[0].getBoundingInfo ? res.meshes[0].getBoundingInfo().boundingBox.centerWorld : worldPos;
          const light = new BABYLON.PointLight("light_"+r.name, new BABYLON.Vector3(worldPos.x, ceilY, worldPos.z), scene);
          light.intensity = 0.9;
          light.range = 12;
          light.metadata = { room: r.name };
          this.lights.push(light);

          // create a small "switch" box on southern side of room (south = -z direction)
          const sw = BABYLON.MeshBuilder.CreateBox("switch_"+r.name, {size:0.18}, scene);
          sw.position.set(worldPos.x + 0, ceilY - 0.9, worldPos.z - (this.CELL_SIZE/2) + 0.25);
          sw.isPickable = true;
          sw.metadata = { type:"switch", room:r.name, lightId: this.lights.length-1 };
          mapMeshes.push(sw);
          this.switches.push(sw);

        }catch(e){
          warn("spawn room failed for", r, e);
        }
      }

      // power breaker in a closet or garage if present, else random room
      let breakerRoom = this.rooms.find(r=>r.type==="closet" || r.type==="garage") || (this.rooms.length? this.rooms[(Math.random()*this.rooms.length)|0] : null);
      if(breakerRoom){
        // create small breaker box mesh and metadata
        const pos = new BABYLON.Vector3(breakerRoom.gx*this.CELL_SIZE, 1.2, breakerRoom.gz*this.CELL_SIZE);
        const bx = BABYLON.MeshBuilder.CreateBox("breaker_"+breakerRoom.name, {size:0.25}, scene);
        bx.position.copyFrom(pos.add(new BABYLON.Vector3(this.CELL_SIZE/2 - 0.4, 0, 0)));
        bx.isPickable=true;
        bx.metadata = { type:"breaker", room:breakerRoom.name };
        mapMeshes.push(bx);
        // store reference
        this.breaker = bx;
      }

      // door meshes placeholder: we'll mark door locations later if needed
      mark("prohouse-spawned", { count: this.roomMeshes.length });
      return { rooms: this.rooms, meshes: this.roomMeshes, lights: this.lights, switches: this.switches, breaker:this.breaker };
    },
    clear(scene){
      try{
        (this.roomMeshes||[]).forEach(m=>{ try{ m.dispose(); }catch{} });
        (this.doorMeshes||[]).forEach(m=>{ try{ m.dispose(); }catch{} });
        (this.lights||[]).forEach(l=>{ try{ l.dispose(); }catch{} });
        (this.switches||[]).forEach(s=>{ try{ s.dispose(); }catch{} });
        if(this.breaker){ try{ this.breaker.dispose(); }catch{} }
      }catch(e){}
      this.rooms=[]; this.roomMeshes=[]; this.doorMeshes=[]; this.lights=[]; this.switches=[]; this.breaker=null;
      // remove from global mapMeshes array
      mapMeshes = mapMeshes.filter(m => !m || (m && !m.name?.startsWith("switch_") && !m.name?.startsWith("light_") && !m.name?.startsWith("breaker_")));
    },
    getVanRoom(){
      return this.rooms.find(r=>r.type==="van" || r.name==="Van") || null;
    },
    getRoomCenter(name){
      const r = this.rooms.find(x=>x.name===name);
      if(!r) return null;
      return new BABYLON.Vector3(r.gx*this.CELL_SIZE, 0, r.gz*this.CELL_SIZE);
    }
  };
  return PG;
})();

// ---------- Helpers: clearMap/spawnPlayer/pointerlock ----------
function clearMap(){
  try{
    mapMeshes.forEach(m => {
      try{ if(m && !m.isDisposed()) m.dispose(); }catch{} 
    });
  }catch(e){ warn("clearMap failed", e); }
  mapMeshes.length = 0;
  currentMap = null;
  // also clear ProHouse generator if used
  try{ if(window.ProHouseGenerator) window.ProHouseGenerator.clear(scene); }catch(e){}
}

function spawnPlayer(){
  try{
    if(window.PP?.rig?.body){
      const b = window.PP.rig.body;
      if(window.__PP_SPAWN) b.position.copyFrom(window.__PP_SPAWN);
      else if(currentMap?.spawn) b.position.copyFrom(currentMap.spawn);
    }
  }catch(e){ warn("spawnPlayer failed", e); }
}

function enablePointerLockOnce(){
  const canvas = $("#renderCanvas");
  if(!canvas) return;
  // request pointer lock on a user gesture: click
  const onClick = ()=> {
    try{ if(canvas.requestPointerLock) canvas.requestPointerLock(); }catch(e){}
    document.removeEventListener("pointerdown", onClick);
  };
  document.addEventListener("pointerdown", onClick, { once:true });
  // also focus canvas
  try{ canvas.focus(); }catch(e){}
}

// ---------- Ghosts & PS5 Injection (optional) ----------
async function injectGhostsAndPS5(){
  // load ghost files & ps5 controller UI if present; ignore failures
  await loadScriptOnce("./assets/dev/ghost/ghost_data.js");
  await loadScriptOnce("./assets/dev/ghost/ghost_db.js");
  await loadScriptOnce("./assets/dev/ghost/phasma_map_and_ghost.js");
  await loadScriptOnce("./assets/dev/ui/ps5_controller.js");
  mark("ghosts+ps5-loaded");
}

// ---------- Map Loader ----------
async function loadMap(mapData){
  if(!scene) return;
  clearMap();

  if(mapData && mapData.def && mapData.def.includes("prohouse_generator")){
    // spawn procedural prohouse
    try{
      if(!window.ProHouseGenerator) {
        // nothing to load; generator included above
      }
      const res = await window.ProHouseGenerator.spawn(scene, Date.now());
      currentMap = { type: "prohouse", rooms: res.rooms, meshes: res.meshes, lights: res.lights, switches: res.switches, spawn: window.__PP_SPAWN || null };
      // wire switch picks: toggle respective lights on click
      scene.onPointerObservable.add((pi)=>{
        if(pi.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
        const pick = scene.pick(scene.pointerX, scene.pointerY, mesh => mesh && mesh.metadata && (mesh.metadata.type==="switch" || mesh.metadata.type==="breaker"));
        if(pick && pick.hit && pick.pickedMesh){
          const md = pick.pickedMesh.metadata;
          if(md.type === "switch"){
            const light = currentMap.lights[md.lightId];
            if(light){ light.setEnabled(!light.isEnabled); }
          } else if(md.type === "breaker"){
            // toggle all lights (power)
            const enabled = currentMap.lights.length ? currentMap.lights[0].isEnabled : true;
            currentMap.lights.forEach(l => l.setEnabled(!enabled));
          }
        }
      });
      log("[MapLoader] ProHouse spawned", currentMap.rooms?.length||0);
      return currentMap;
    }catch(e){
      console.error("ProHouse spawn failed:", e);
      return null;
    }
  } else if(mapData && mapData.file && mapData.file.toLowerCase().endsWith(".glb")){
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", mapData.file, scene);
      res.meshes.forEach(m=>{ try{ m.checkCollisions = true; m.receiveShadows = true; mapMeshes.push(m); }catch{} });
      currentMap = { type:"glb", file:mapData.file, meshes: res.meshes, spawn: mapData.spawn || new BABYLON.Vector3(0,1.8,0) };
      // position spawn if provided
      if(currentMap && currentMap.spawn) window.__PP_SPAWN = currentMap.spawn.clone();
      log("[MapLoader] GLB loaded", mapData.file, res.meshes.length);
      return currentMap;
    }catch(e){
      console.error("GLB map load failed:", e);
      return null;
    }
  } else {
    warn("Unknown mapData", mapData);
    return null;
  }
}

// ---------- Audio & Weather (deferred init) ----------
(function(){
  // Minimal modular audio focused on weather ambient + spirit box
  const PP = window.PP = window.PP || {};
  PP.audio = PP.audio || {};
  const tracks = {};
  let audioInitialized = false;

  function mkAudio(path, loop=false){
    const a = new Audio(bURL(path));
    a.loop = !!loop;
    a.preload = "auto";
    return a;
  }

  function initAudio(initialWeather){
    if(audioInitialized) return;
    // Create / register base tracks (paths expected to exist in your assets/audio)
    try{
      tracks.clear = mkAudio("./assets/audio/clearWeather.mp3", true);
      tracks.rain  = mkAudio("./assets/audio/rainstorm.mp3", true);
      tracks.snow  = mkAudio("./assets/audio/snow.mp3", true);
      tracks.spiritbox = mkAudio("./assets/audio/spiritbox.mp3", true);
      tracks.whisper = mkAudio("./assets/audio/whisper.mp3", false);
    }catch(e){ warn("Audio creation error", e); }

    PP.audio.tracks = tracks;

    PP.audio.play = function(name, opts={}){
      try{
        const a = tracks[name];
        if(!a) return false;
        if(typeof opts.volume === "number") a.volume = Math.max(0, Math.min(1, opts.volume));
        a.currentTime = opts.start || 0;
        a.play().catch(()=>{});
        return true;
      }catch(e){ return false; }
    };

    PP.audio.stop = function(name){
      try{ const a = tracks[name]; if(a){ a.pause(); a.currentTime = 0; } }catch(e){}
    };

    PP.audio.loop = function(name, vol=0.5){
      try{
        const a = tracks[name];
        if(!a) return null;
        a.volume = vol;
        a.loop = true;
        a.currentTime = 0;
        a.play().catch(()=>{});
        return {
          stop: ()=>{ try{ a.pause(); a.currentTime=0; }catch{} }
        };
      }catch(e){ return null; }
    };

    PP.audio.applyWeather = function(state){
      try{
        // stop both
        PP.audio.stop("rain"); PP.audio.stop("clear"); PP.audio.stop("snow");
        if(state === "Clear") PP.audio.loop("clear", 0.30);
        else if(state === "Rainstorm" || state === "Bloodmoon") PP.audio.loop("rain", 0.55);
        else if(state === "Snow") PP.audio.loop("snow", 0.25);
      }catch(e){ warn("applyWeather failed",e); }
    };

    audioInitialized = true;
    // apply initial weather if any
    PP.audio.applyWeather(initialWeather || "Clear");
    mark("audio-init");
  }

  // Expose init explicitly
  window.__PP_initAudio = initAudio;
})();

// ---------- Simple logger (fallback) ----------
window.GameLogger = window.GameLogger || (function(){
  let buf = [];
  let running = false;
  let t0 = Date.now();
  function _now(){ return (Date.now()-t0); }
  function record(entry){ buf.push(Object.assign({time:_now()}, entry)); }
  function start(){ running = true; t0 = Date.now(); buf = []; record({type:"logger_start"}); }
  function stop(){ running = false; record({type:"logger_stop"}); }
  function push(ev){ if(running) record(ev); }
  function dump(){ return JSON.stringify(buf, null, 2); }
  return { start, stop, push, dump, _buf: buf };
})();

// ---------- Player rig (WASD + mouse + physics + animations) ----------
(async function(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = window.PP = window.PP || {};
  PP.rig = PP.rig || {};
  PP.state = PP.state || {};
  PP.controls = PP.controls || {};

  // Avatar config
  const AVATAR = { file:"player.glb", eyeY:1.6, targetHeight:1.75, radius:0.35 };
  const SPEEDS = { walk:1.8, run:3.5, crouch:1.0 };
  const MAX_SLOPE = 45;

  let sc = null, cam = null;
  let body = null, avatarRoot = null, avatarMeshes = [];
  let animations = { idle:null, walk:null, crouch:null }, currentAnim = null;

  const input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
  let keysDown = {}, mouse = { dx:0, dy:0, locked:false }, gamepad = { axes:[0,0], buttons:[] };
  let lastCrouchPressed = false;

  // keyboard
  const keymap = {
    forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"], left:["KeyA","ArrowLeft"], right:["KeyD","ArrowRight"],
    sprint:["ShiftLeft","ShiftRight"], crouch:["KeyC"], toggleCamera:["KeyV"]
  };

  function has(arr, code){ return Array.isArray(arr) && arr.includes(code); }
  function uiBusy(){ const ae=document.activeElement; return ae && (ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.isContentEditable); }

  window.addEventListener("keydown",(e)=>{
    if(uiBusy()) return;
    keysDown[e.code] = true;
    if(has(keymap.forward, e.code)) input.forward = true;
    if(has(keymap.back, e.code)) input.back = true;
    if(has(keymap.left, e.code)) input.left = true;
    if(has(keymap.right, e.code)) input.right = true;
    if(has(keymap.sprint, e.code)) input.run = true;
    if(has(keymap.crouch, e.code)) input.crouch = !input.crouch;
    if(has(keymap.toggleCamera, e.code)){ window.dispatchEvent(new CustomEvent("pp:toggle-camera")); }
  }, true);

  window.addEventListener("keyup",(e)=>{
    keysDown[e.code] = false;
    if(has(keymap.forward, e.code)) input.forward = false;
    if(has(keymap.back, e.code)) input.back = false;
    if(has(keymap.left, e.code)) input.left = false;
    if(has(keymap.right, e.code)) input.right = false;
    if(has(keymap.sprint, e.code)) input.run = false;
  }, true);

  // mouse / pointerlock
  const canvas = $("#renderCanvas");
  if(canvas){
    canvas.addEventListener("click", ()=> { if(!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
    document.addEventListener("pointerlockchange", ()=> { mouse.locked = (document.pointerLockElement === canvas); });
    document.addEventListener("mousemove", (e)=>{
      if(!mouse.locked) return;
      mouse.dx = e.movementX; mouse.dy = e.movementY;
      window.dispatchEvent(new CustomEvent("pp:mouseMove",{detail:{dx:mouse.dx,dy:mouse.dy}}));
    });
  }

  // basic gamepad poll
  function pollGamepad(){
    try{
      const pads = navigator.getGamepads?.();
      const pad = pads?.[0];
      if(!pad){ requestAnimationFrame(pollGamepad); return; }
      gamepad.axes = [pad.axes[0]||0, pad.axes[1]||0];
      gamepad.buttons = pad.buttons.map(b=>b.pressed);
      input.left = gamepad.axes[0] < -0.2;
      input.right = gamepad.axes[0] > 0.2;
      input.forward = gamepad.axes[1] < -0.2;
      input.back = gamepad.axes[1] > 0.2;
      input.run = gamepad.buttons[0] || input.run;
      if(gamepad.buttons[1] && !lastCrouchPressed) input.crouch = !input.crouch;
      lastCrouchPressed = !!gamepad.buttons[1];
    }catch(e){}
    requestAnimationFrame(pollGamepad);
  }
  pollGamepad();

  // ensure scene
  function ensureScene(){ sc = sc || window.SCENE || BABYLON.EngineStore?.LastCreatedScene; cam = sc?.activeCamera; return !!(sc && cam); }

  function getSpawnPosition(){
    if(window.MAP_DEF?.spawn) return new BABYLON.Vector3(MAP_DEF.spawn.x||0, MAP_DEF.spawn.y||AVATAR.eyeY, MAP_DEF.spawn.z||0);
    if(window.__PP_SPAWN) return window.__PP_SPAWN.clone();
    return new BABYLON.Vector3(0, AVATAR.eyeY, 0);
  }

  function makeBody(){
    try{
      body = BABYLON.MeshBuilder.CreateCapsule("player_capsule", { height: AVATAR.targetHeight, radius: AVATAR.radius }, sc);
      body.isVisible = false;
      body.position.copyFrom(getSpawnPosition());
      // physics plugin: prefer Havok if available
      try{
        if(!body.physicsImpostor){
          body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.CapsuleImpostor, { mass: 70, restitution:0, friction:0.8 }, sc);
        }
      }catch(e){ warn("Physics Impostor failed:", e); }
      PP.rig.body = body;
      mapMeshes.push(body);
      return body;
    }catch(e){ warn("makeBody fail", e); return null; }
  }

  async function loadAvatar(){
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", AVATAR.file, sc);
      const root = res.meshes[0];
      if(root){
        root.scaling.setAll(1);
        const bb = root.getHierarchyBoundingVectors ? root.getHierarchyBoundingVectors() : null;
        if(bb){
          const rawH = bb.max.y - bb.min.y;
          const scale = (AVATAR.targetHeight || 1.75) / (rawH || 1.0);
          root.scaling.setAll(scale);
        }
        avatarRoot = root;
        avatarRoot.parent = body;
        avatarMeshes = root.getChildMeshes(true);
        // animations
        (res.animationGroups||[]).forEach(g=>{
          if(/idle/i.test(g.name)) animations.idle = g;
          if(/walk/i.test(g.name)) animations.walk = g;
          if(/crouch/i.test(g.name)) animations.crouch = g;
        });
      }
    }catch(e){ warn("loadAvatar failed", e); }
  }

  function playAnim(name){
    try{
      if(currentAnim === animations[name]) return;
      Object.values(animations).forEach(g=>g?.stop());
      animations[name]?.start(true);
      currentAnim = animations[name];
    }catch(e){}
  }

  function stickToGround(moveDir){
    try{
      if(!body || !sc) return moveDir;
      const origin = body.position.add(new BABYLON.Vector3(0,1,0));
      const ray = new BABYLON.Ray(origin, BABYLON.Axis.Y.scale(-1), 4);
      const pick = sc.pickWithRay(ray, m=> m.isPickable !== false);
      if(!pick.hit) return moveDir;
      const groundPoint = pick.pickedPoint;
      body.position.y = groundPoint.y + AVATAR.targetHeight/2;
      if(moveDir && moveDir.lengthSquared()>0.001){
        const groundNormal = pick.getNormal(true) || BABYLON.Axis.Y;
        const slopeAngle = BABYLON.Vector3.GetAngleBetweenVectors(BABYLON.Axis.Y, groundNormal, BABYLON.Vector3.Forward()) * (180/Math.PI);
        if(slopeAngle <= MAX_SLOPE) return moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir, groundNormal))).normalize();
        else return BABYLON.Vector3.Zero();
      }
      return moveDir || BABYLON.Vector3.Zero();
    }catch(e){ return moveDir; }
  }

  const footstepState = { lastPos:null, acc:0 };
  function handleFootsteps(moveVec){
    if(!moveVec || moveVec.lengthSquared()<0.001 || !body) return;
    if(!footstepState.lastPos) footstepState.lastPos = body.position.clone();
    const dist = BABYLON.Vector3.Distance(footstepState.lastPos, body.position);
    footstepState.acc += dist;
    const stride = input.crouch ? 0.3 : (input.run ? 0.8 : 0.5);
    if(footstepState.acc >= stride){
      footstepState.acc = 0;
      footstepState.lastPos.copyFrom(body.position);
      if(typeof window.playStep === "function") try{ window.playStep(0.42); }catch{}
      else if(window.PP?.audio?.play) window.PP.audio.play("writing"); // fallback small sfx
    }
  }

  function syncCamera(){
    if(!cam || !body) return;
    const pos = body.position;
    // assume FP, camera is parented to body/rig by fp-tp system or by the rig hooking later
    try{ if(!cam.parent) cam.position.set(pos.x,pos.y+AVATAR.eyeY,pos.z); }catch(e){}
  }

  function moveLoop(){
    if(!ensureScene()){ requestAnimationFrame(moveLoop); return; }
    const dt = sc.getEngine().getDeltaTime()/1000;
    if(!cam) cam = sc.activeCamera;
    const forward = cam.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right = cam.getDirection(BABYLON.Vector3.Right()).normalize();

    let move = new BABYLON.Vector3(0,0,0);
    if(input.forward) move.addInPlace(forward);
    if(input.back) move.subtractInPlace(forward);
    if(input.left) move.subtractInPlace(right);
    if(input.right) move.addInPlace(right);

    if(move.lengthSquared()>0.001){
      move.normalize();
      const speed = input.crouch ? SPEEDS.crouch : (input.run ? SPEEDS.run : SPEEDS.walk);
      const slopeMove = stickToGround(move);
      if(slopeMove.lengthSquared()>0.001 && body?.physicsImpostor){
        try{ body.physicsImpostor.applyImpulse(slopeMove.scale(speed* (body.getTotalMass? body.getTotalMass() : 1)), body.getAbsolutePosition()); }catch(e){}
      } else if(slopeMove.lengthSquared()>0.001){
        // fallback move via translate
        body.position.addInPlace(slopeMove.scale(speed*dt));
      }
      playAnim(input.crouch ? "crouch" : "walk");
      handleFootsteps(slopeMove);
    } else {
      playAnim("idle");
    }

    stickToGround();
    syncCamera();
    requestAnimationFrame(moveLoop);
  }

  async function startRig(){
    try{
      if(!ensureScene()){ setTimeout(startRig,100); return; }
      // initialize physics plugin if Havok exists (index typically provides HavokPhysics)
      try{
        if(typeof HavokPhysics === "function"){
          const havok = await HavokPhysics();
          sc.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true, havok));
        } else if(!sc.isPhysicsEnabled()){
          // no Havok: try to enable a basic plugin if available (skip if not included)
          try{ sc.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.NullEngine()); }catch(e){}
        }
      }catch(e){}
      makeBody();
      stickToGround(BABYLON.Vector3.Zero());
      await loadAvatar();
      stickToGround(BABYLON.Vector3.Zero());
      moveLoop();

      window.PP = window.PP || {};
      window.PP.rigReady = true;
      document.dispatchEvent(new Event("pp:rig-ready"));
      mark("rig-ready");
    }catch(e){ warn("startRig failed", e); }
  }
  // kick it off async
  setTimeout(startRig, 20);
})();

// ---------- Start Game (rewrite, robust, complete) ----------
async function startGame(){
  if(started) return;
  started = true;
  $("#title-screen")?.style.display = "none";
  log("[bootstrap] Starting game…");

  const STEP_TIMEOUT = 12000; // ms per step

  function safeStep(label, fn){
    Loader.addStep(label, async ()=>{
      try{
        await Promise.race([
          Promise.resolve().then(()=>fn()),
          new Promise((_, rej) => setTimeout(()=> rej(new Error("Step timeout: "+label)), STEP_TIMEOUT))
        ]);
      }catch(e){
        console.error(`[bootstrap] Step "${label}" failed:`, e);
      }
    });
  }

  try{
    Loader.reset();

    safeStep("Preparing engine…", async ()=> createEngineScene());
    safeStep("Injecting ghosts & PS5 controller…", async ()=> injectGhostsAndPS5());
    safeStep("Loading manifest (maps)…", async ()=> loadManifest());
    safeStep("Loading map…", async ()=>{
      const mapData = getSelectedMap();
      await loadMap(mapData);
    });
    safeStep("Initializing audio…", async ()=>{
      // initialize audio only now
      if(typeof window.__PP_initAudio === "function") window.__PP_initAudio("Clear");
      else if(typeof window.__PP_initAudio === "undefined") { /* already integrated above */ }
      // also initialize modular PP.audio.init if present
      try{ if(window.PP && typeof window.PP.audio?.init === "function") { window.PP.audio.init && window.PP.audio.init("Clear"); } }catch(e){}
    });
    safeStep("Loading player rig…", async ()=>{
      // rig script included inline above; wait for 'pp:rig-ready'
      await new Promise(r=>{
        if(window.PP?.rigReady) return r();
        const timeout = setTimeout(()=> { console.warn("rig ready timeout"); r(); }, STEP_TIMEOUT);
        document.addEventListener("pp:rig-ready", ()=> { clearTimeout(timeout); r(); }, { once:true });
      });
      log("[bootstrap] Player rig ready");
    });
    safeStep("Initializing player physics & movement…", async ()=>{
      const body = window.PP?.rig?.body;
      if(body && !body.physicsImpostor){
        try{ body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.CapsuleImpostor, { mass:80, restitution:0, friction:0.5 }, scene); }catch(e){}
      }
      // parent camera to body if camera exists and rig expects it
      if(camera && window.PP?.rig?.body) { try{ camera.parent = window.PP.rig.body; camera.position.set(0,1.6,0); }catch(e){} }
    });
    safeStep("Finalizing…", async ()=>{
      if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
      enablePointerLockOnce();
    });

    // Run loader queue
    await Loader.run();

    // trigger pp:start
    window.dispatchEvent(new CustomEvent("pp:start"));
    log("[bootstrap] Game started successfully.");
    try{ $("#renderCanvas")?.focus?.(); }catch(e){}
  }catch(err){
    console.error("[bootstrap] Error starting game:", err);
    started = false;
    $("#title-screen")?.style.display = "flex";
    alert("Boot failed. Check console for details.");
  }
}

// ---------- Settings Menu ----------
(function(){
  if(window.__PP_SETTINGS_MENU__) return;
  window.__PP_SETTINGS_MENU__ = true;

  const menuHTML = `
    <div id="pp-settings-menu" style="
      position: fixed; top: 10%; right: 10%;
      width: 300px; background: rgba(0,0,0,0.90); color: white; padding: 15px;
      font-family: sans-serif; font-size: 14px; border-radius: 8px; z-index: 9999;
      display: none; flex-direction: column; gap: 10px;">
      <h3 style="margin:0 0 10px 0;">Player Settings</h3>
      <label>Walk Speed: <input id="pp-walk-speed" type="number" step="0.1"></label>
      <label>Run Speed: <input id="pp-run-speed" type="number" step="0.1"></label>
      <label>Crouch Speed: <input id="pp-crouch-speed" type="number" step="0.1"></label>
      <label>Stand Multiplier: <input id="pp-stand-mult" type="number" step="0.1"></label>
      <button id="pp-toggle-menu">Close Menu</button>
    </div>
  `;
  const div = document.createElement("div");
  div.innerHTML = menuHTML;
  document.body.appendChild(div);

  const menu = document.getElementById("pp-settings-menu");
  const walkInp = document.getElementById("pp-walk-speed");
  const runInp = document.getElementById("pp-run-speed");
  const crouchInp = document.getElementById("pp-crouch-speed");
  const standInp = document.getElementById("pp-stand-mult");
  const toggleBtn = document.getElementById("pp-toggle-menu");

  function updateInputs(){
    walkInp.value = window.PP?.rig?.controller?.SPEEDS?.walk ?? 1.8;
    runInp.value = window.PP?.rig?.controller?.SPEEDS?.run ?? 3.5;
    crouchInp.value = window.PP?.rig?.controller?.SPEEDS?.crouch ?? 1.0;
    standInp.value = window.PLAYER?.standHeight && window.PLAYER.crouchHeight ? (window.PLAYER.standHeight / window.PLAYER.crouchHeight) : 2.0;
  }

  function applySettings(){
    const c = window.PP?.rig?.controller;
    if(c?.SPEEDS){
      c.SPEEDS.walk = parseFloat(walkInp.value) || c.SPEEDS.walk;
      c.SPEEDS.run = parseFloat(runInp.value) || c.SPEEDS.run;
      c.SPEEDS.crouch = parseFloat(crouchInp.value) || c.SPEEDS.crouch;
    }
    if(window.PLAYER && window.PLAYER.crouchHeight){
      const mult = parseFloat(standInp.value) || 2.0;
      window.PLAYER.setStandMultiplier(mult);
    }
  }

  [walkInp, runInp, crouchInp, standInp].forEach(i=>{
    if(!i) return;
    i.addEventListener("change", applySettings);
    i.addEventListener("input", applySettings);
  });

  toggleBtn.addEventListener("click", ()=> { menu.style.display = "none"; });

  window.addEventListener("keydown", (e)=>{
    if(e.code === "F1"){ menu.style.display = (menu.style.display === "flex" ? "none" : "flex"); updateInputs(); e.preventDefault(); }
  });

  console.log("[PP] Settings menu initialized (F1 to toggle)");
})();

// ---------- DOM Ready ----------
document.addEventListener("DOMContentLoaded", ()=>{
  loadManifest().catch(e=>console.error("Failed to load map manifest:", e));
  $("#start-button")?.addEventListener("click", startGame, { once:true });
});

})(); // end bootstrap IIFE
