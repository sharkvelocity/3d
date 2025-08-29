// ./assets/index3/ghost_movement.js — v1.0
// Ghost AI + Events + Sanity + Hunt + Barrier-aware movement
//
// Integrations:
//  - Uses ghost barriers created by ./assets/index3/ghost_dev.js (metadata.isGhostBlocker or window.ghostDev_isBlockedRay).
//  - Random ghost TYPE from window.GHOSTS registry (ghost.js) at investigation start.
//  - Random ghost MODEL picked from scene (ghost-like names) or a lightweight fallback mesh.
//  - Blinking / manifest events (visibility flicker) + light flicker nearby (soft).
//  - Simple hunting logic: pursue player, avoid barrier segments, try alternate headings or doorways.
//  - Sanity system with time-based drain + proximity/hunt drain, HUD updates (#hud-sanity, #hud-hunt-state).
//  - Public API: window.ghostCtrl.{init,startInvestigation,randomizeGhost,beginHunt,endHunt,triggerEvent,teleportGhostToLook,setGhostScale}
//
// Safe to include multiple times; guards itself.

(function(){
  "use strict";

  if (window.ghostCtrl && window.ghostCtrl.__v === '1.0') return;

  // -------- scene refs + small helpers --------
  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA = ()=> window.camera || SCENE()?.activeCamera;
  const toast  = (m,ms=900)=> (window.toast? window.toast(m,ms) : console.log('[ghost]', m));
  const clamp  = (v,min,max)=> Math.max(min, Math.min(max, v));
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const xyz    = (v)=>({x:+v.x.toFixed(4), y:+v.y.toFixed(4), z:+v.z.toFixed(4)});

  // -------- config (tweak in-game if you like) --------
  const CFG = {
    roamSpeed: 0.9,           // m/s
    huntSpeed: 2.2,           // m/s
    blinkMin: 0.10,           // seconds
    blinkMax: 0.28,           // seconds
    eventCooldown: 7.5,       // seconds between ambient events
    eventChance: 0.35,        // probability per cooldown
    roamTargetRadius: 6.0,    // new roam target once this close
    playerScareRadius: 6.5,   // proximity for extra sanity drain
    sanityDrainPerMin: 2.5,   // base drain per minute
    sanityDrainProximity: 9,  // extra per minute when near ghost
    sanityDrainHunt: 22,      // extra per minute when hunting
    minHuntCooldown: 35,      // seconds after hunt before next
    maxHuntCooldown: 75,
    huntSanityThreshold: 50,  // hunts become possible below this
    barrierLookahead: 1.6,    // meters ahead to test collision steer
    steerAngles: [15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180],
    lightFlickerRadius: 10,   // meters
    lightFlickerFactor: 0.35, // intensity multiplier during flicker
    randomSpawnDist: 8,       // meters in front of camera for first spawn
  };

  // -------- internal state --------
  const ST = {
    ready:false,
    s:null, c:null,
    ghost:null,                 // mesh or transform node
    ghostRoot:null,             // transform node parent
    ghostTypeKey:null,          // from window.GHOSTS
    modelName:null,             // chosen model name
    defaultVisibility:0,        // what we restore to when not manifesting
    scale:1,
    target:null,                // roaming target (Vector3)
    mode:'idle',                // idle | roam | hunt | event | cooldown
    lastEventT:0,
    nextHuntReadyT:0,
    sanity: 100,
    lastUpdateT:performance.now()/1000,
    lightCache: [],
  };

  // ===== PUBLIC API =====
  const API = {
    __v: '1.0',
    init,
    startInvestigation,
    randomizeGhost,
    beginHunt, endHunt,
    triggerEvent,
    teleportGhostToLook,
    setGhostScale,
    getState: ()=>({ mode: ST.mode, type: ST.ghostTypeKey, model: ST.modelName, sanity: ST.sanity, pos: ST.ghost?.position && xyz(ST.ghost.position) }),
  };

  // expose for devtools glue
  window.ghostCtrl = API;
  // allow devtools buttons to hook these names
  window.beginHunt = beginHunt;
  window.endHunt   = endHunt;

  // -------- init / boot --------
  function init(){
    if (ST.ready) return;
    ST.s = SCENE(); ST.c = CAMERA();
    if (!ST.s || !ST.c) return; // wait until ready — we’ll call init() again in a timer below

    // per-frame update
    ST.s.onBeforeRenderObservable.add(_tick);

    // optional: wire to Start Investigation button if present
    const btn = document.getElementById('start-button');
    if (btn) btn.addEventListener('click', ()=> startInvestigation());

    ST.ready = true;
    toast('Ghost ctrl ready');
  }

  // try until scene exists
  const boot = setInterval(()=>{ try{ if (SCENE() && CAMERA()){ clearInterval(boot); init(); } }catch{} }, 150);

  // -------- main entry: prepare ghost & start roam --------
  function startInvestigation(){
    // Only randomize once per run (unless user asks explicitly)
    if (!ST.ghost) randomizeGhost();
    // kick off roam
    setMode('roam');
    ST.target = pickRoamTarget();
  }

  // -------- random ghost type + model --------
  function randomizeGhost(){
    pickRandomGhostType();
    pickRandomGhostModelOrFallback();
    placeGhostAheadOfCamera(CFG.randomSpawnDist);
    // invisible by default; manifest only in events/hunt or dev-visible via ghost_dev.js
    setGhostVisible(false);
  }

  function pickRandomGhostType(){
    try{
      const keys = Object.keys(window.GHOSTS||{});
      ST.ghostTypeKey = keys.length ? keys[Math.floor(Math.random()*keys.length)] : 'Spirit';
      window.currentGhostKey = ST.ghostTypeKey;
      // light notebook/evidence UI if you have it
    }catch{ ST.ghostTypeKey = 'Spirit'; }
  }

  function findGhostLikeNames(){
    const names = ST.s.meshes.map(m=>m.name).filter(Boolean);
    const pri = [], rest=[];
    names.forEach(n=>{
      if (/ghost|spirit|entity|phantom|demon|thaye|deogen|revenant|shade|oni|yurei|wraith|mimic|poltergeist|apparition|model|armature/i.test(n)) pri.push(n);
      else rest.push(n);
    });
    return [...new Set([...pri, ...rest])];
  }

  function pickRandomGhostModelOrFallback(){
    const list = findGhostLikeNames();
    let chosen = null, mesh = null;
    // prefer single meshes that aren't obvious scenery
    for (let i=0;i<list.length;i++){
      const name = list[(Math.random()*list.length)|0];
      const m = ST.s.getMeshByName(name) || ST.s.getNodeByName(name);
      if (!m) continue;
      // skip huge or floor/terrain obvious matches
      if (/ground|floor|terrain|room|house|wall|plane|door|window|light|lamp|roof|stairs/i.test(name)) continue;
      chosen = name; mesh = m; break;
    }
    if (!mesh){
      // fallback capsule-ish ghost
      const r = new BABYLON.TransformNode('GhostRoot', ST.s);
      const body = BABYLON.MeshBuilder.CreateSphere('GhostBall',{diameter:0.45, segments:16}, ST.s);
      const tail = BABYLON.MeshBuilder.CreateCylinder('GhostTail',{diameterTop:0.18, diameterBottom:0.4, height:0.8, tessellation:16}, ST.s);
      body.parent = r; tail.parent = r; tail.position.y = -0.6;
      const mat = new BABYLON.StandardMaterial('GhostMat', ST.s);
      mat.diffuseColor = new BABYLON.Color3(0.85, 0.95, 1.0);
      mat.emissiveColor= new BABYLON.Color3(0.2, 0.4, 0.5);
      mat.alpha = 0.35; body.material = mat; tail.material = mat;
      ST.ghostRoot = r; ST.ghost = r; ST.modelName = 'fallback_ghost';
      ST.defaultVisibility = 0.0; ST.scale = 1;
      return;
    }
    // use/clone a transform so we can move whole model
    const root = new BABYLON.TransformNode('GhostRoot_'+(Date.now().toString(36)), ST.s);
    mesh.setEnabled(true);
    // if it's already a transform node, parent directly; else parent the mesh
    mesh.parent = root;
    ST.ghostRoot = root; ST.ghost = root;
    ST.modelName = chosen;
    ST.defaultVisibility = 0.0;
    ST.scale = 1;
  }

  function setGhostScale(sc){
    ST.scale = clamp(+sc||1, 0.1, 5);
    if (ST.ghostRoot) ST.ghostRoot.scaling.set(ST.scale, ST.scale, ST.scale);
    try{ if (ST.ghostRoot) { ST.ghostRoot.metadata = ST.ghostRoot.metadata||{}; ST.ghostRoot.metadata.ghostScale = ST.scale; } }catch{}
  }

  function placeGhostAheadOfCamera(dist){
    const c = ST.c, s = ST.s; if (!c || !s || !ST.ghostRoot) return;
    const ray = c.getForwardRay(50);
    let p = c.position.add(ray.direction.scale(dist||CFG.randomSpawnDist));
    // drop to ground
    const down = new BABYLON.Ray(p.add(v3(0,5,0)), v3(0,-1,0), 30);
    const hit  = s.pickWithRay(down, m=> m && m.isPickable!==false);
    if (hit?.hit) p = hit.pickedPoint;
    ST.ghostRoot.position.copyFrom(p);
  }

  function teleportGhostToLook(distance){
    const d = isFinite(+distance) ? +distance : 2.5;
    const c = ST.c, s = ST.s; if (!c || !s || !ST.ghostRoot) return;
    const ray = c.getForwardRay(50);
    const hit = s.pickWithRay(ray, m=> m && m.isPickable!==false);
    let target;
    if (hit?.hit){
      const back = ray.direction.scale(0.25);
      target = hit.pickedPoint.subtract(back);
    } else {
      target = c.position.add(ray.direction.scale(d));
      const down = new BABYLON.Ray(target.add(v3(0,5,0)), v3(0,-1,0), 30);
      const ghit = s.pickWithRay(down, m=> m && m.isPickable!==false);
      if (ghit?.hit) target = ghit.pickedPoint;
    }
    ST.ghostRoot.position.copyFrom(target);
  }

  // -------- visibility / blink --------
  function setGhostVisible(on){
    try{
      // if Ghost Dev made it dev-visible, let that override invis while panel is open
      if (window.GHOST_DEV && $('#ghostdev-panel')?.style.display !== 'none'){
        // respect its toggle; but we still allow temporary blink stronger
      }
    }catch{}
    // Visibility on the root transform doesn't show; set on children meshes.
    const setNode = (node, vis)=>{
      if (!node) return;
      if (node.material && typeof node.material.alpha === 'number'){
        node.material.alpha = vis ? 1 : 0.0;
      }
      if ('visibility' in node) node.visibility = vis ? 1 : 0;
      if ('isVisible' in node)  node.isVisible  = !!vis;
    };
    if (ST.ghostRoot){
      // affect all descendants
      const stack=[ST.ghostRoot];
      while (stack.length){
        const n=stack.pop();
        setNode(n, on);
        n.getChildren?.().forEach(ch=> stack.push(ch));
      }
    }
  }

  function blinkManifest(timeSec){
    const t0 = ST.s.getEngine().getDeltaTime ? performance.now()/1000 : 0;
    const dur = timeSec || (CFG.blinkMin + Math.random()*(CFG.blinkMax-CFG.blinkMin));
    setGhostVisible(true);
    setTimeout(()=> setGhostVisible(false), dur*1000);
    // mild light flicker nearby
    tryLightFlickerNear(ST.ghostRoot.position, dur);
  }

  // -------- sanity --------
  function updateSanity(dt){
    // base drain per minute
    ST.sanity -= (CFG.sanityDrainPerMin/60)*dt;

    // extra when near ghost (2D distance)
    const gpos = ST.ghostRoot?.position, cpos = ST.c?.position;
    if (gpos && cpos){
      const dx=gpos.x-cpos.x, dz=gpos.z-cpos.z;
      const dist2 = Math.sqrt(dx*dx + dz*dz);
      if (dist2 <= CFG.playerScareRadius){
        ST.sanity -= (CFG.sanityDrainProximity/60)*dt;
      }
    }
    // extra during hunt
    if (ST.mode==='hunt'){
      ST.sanity -= (CFG.sanityDrainHunt/60)*dt;
    }

    ST.sanity = clamp(ST.sanity, 0, 100);
    tryUpdateSanityHUD();
  }

  function tryUpdateSanityHUD(){
    const el = document.getElementById('hud-sanity');
    if (el) el.textContent = `${Math.round(ST.sanity)}%`;
    const huntEl = document.getElementById('hud-hunt-state');
    if (huntEl) huntEl.textContent = ST.mode==='hunt' ? 'HUNTING' : 'Calm';
  }

  // -------- events / audio --------
  function triggerEvent(type){
    // Types: 'blink' (default), 'flicker', 'whisper'
    const t = type || 'blink';
    if (t === 'blink'){
      blinkManifest();
      playOneOf(['spook1','spook2','whisper1','whisper2']); // only plays if available
    } else if (t === 'flicker'){
      tryLightFlickerNear(ST.ghostRoot.position, 0.6 + Math.random()*0.6);
      playOneOf(['lightbuzz1','lightbuzz2']);
    } else if (t === 'whisper'){
      playOneOf(['whisper1','whisper2','breath1']);
    }
  }

  function playOneOf(keys){
    // hook to your audio registry if present (window.SFX or window.playSfx)
    try{
      if (window.playSfx){ return window.playSfx(keys[(Math.random()*keys.length)|0]); }
      // otherwise try simple audio elements by id
      for (let i=0;i<keys.length;i++){
        const a = document.getElementById(keys[i]);
        if (a){ a.currentTime=0; a.play().catch(()=>{}); return; }
      }
    }catch{}
  }

  // -------- lights (soft flicker without breaking scene) --------
  function tryLightFlickerNear(pos, durSec){
    if (!pos || !ST.s) return;
    if (!ST.lightCache.length){
      ST.lightCache = (ST.s.lights||[]).slice();
    }
    const lights = ST.lightCache.filter(L=>{
      try{
        const Lpos = L.getAbsolutePosition?.() || L.position || null;
        if (!Lpos) return false;
        return BABYLON.Vector3.Distance(Lpos, pos) <= CFG.lightFlickerRadius;
      }catch{return false;}
    });
    if (!lights.length) return;
    const saved = lights.map(L=>({L, intensity:L.intensity}));
    const tick = ()=>{
      lights.forEach(L=> L.intensity = saved.find(x=>x.L===L).intensity * (0.85 + Math.random()*CFG.lightFlickerFactor));
    };
    const id = setInterval(tick, 40);
    setTimeout(()=>{
      clearInterval(id);
      lights.forEach(({intensity,L})=>{}); // noop to satisfy linter
      saved.forEach(x=> x.L.intensity = x.intensity);
    }, durSec*1000);
  }

  // -------- hunts --------
  function beginHunt(){
    if (!ST.ghostRoot) return;
    const now = performance.now()/1000;
    if (now < ST.nextHuntReadyT) return; // still cooling down
    setMode('hunt');
    blinkManifest(0.4 + Math.random()*0.4); // pop-in
  }

  function endHunt(){
    if (!ST.ghostRoot) return;
    setMode('cooldown');
    setGhostVisible(false);
    const now = performance.now()/1000;
    ST.nextHuntReadyT = now + (CFG.minHuntCooldown + Math.random()*(CFG.maxHuntCooldown-CFG.minHuntCooldown));
  }

  // -------- movement (barrier-aware) --------
  function setMode(m){
    ST.mode = m;
    const huntEl = document.getElementById('hud-hunt-state');
    if (huntEl) huntEl.textContent = (m==='hunt'?'HUNTING':(m==='cooldown'?'Cooling':'Calm'));
  }

  function isSegmentBlocked(a, b){
    try{
      // prefer ghost_dev’s function
      if (typeof window.ghostDev_isBlockedRay === 'function') return !!window.ghostDev_isBlockedRay(a,b);
      // fallback: ray against meshes flagged as ghost blockers
      const dir = b.subtract(a); const len = dir.length();
      if (len <= 0.001) return false;
      const ray = new BABYLON.Ray(a, dir.normalize(), len);
      const hit = ST.s.pickWithRay(ray, m=> m && m.metadata?.isGhostBlocker===true);
      return !!(hit && hit.hit);
    }catch(e){ return false; }
  }

  function moveToward(target, speed, dt){
    const g = ST.ghostRoot; if (!g) return;
    const cur = g.position;
    const to  = target.subtract(cur);
    const dist = to.length();
    if (dist < 0.001) return;
    let dir = to.scale(1/dist);

    // barrier look-ahead
    const aheadA = cur;
    const aheadB = cur.add(dir.scale(CFG.barrierLookahead));
    if (isSegmentBlocked(aheadA, aheadB)){
      // try steer angles around dir
      const yaw = Math.atan2(dir.x, dir.z);
      let steered = null;
      for (const deg of CFG.steerAngles){
        const ang = yaw + (deg * Math.PI / 180);
        const tryDir = v3(Math.sin(ang), 0, Math.cos(ang));
        const b = cur.add(tryDir.scale(CFG.barrierLookahead));
        if (!isSegmentBlocked(cur, b)){ steered = tryDir; break; }
      }
      if (steered) dir = steered;
      // else we’re boxed in; stop this frame
    }

    const step = speed * dt;
    const delta = dir.scale(step);
    g.position.addInPlace(delta);

    // face move direction
    try{
      g.rotationQuaternion = null;
      g.rotation.y = Math.atan2(dir.x, dir.z);
    }catch{}
  }

  function pickRoamTarget(){
    // pick within map extents
    let min = new BABYLON.Vector3(+Infinity,+Infinity,+Infinity);
    let max = new BABYLON.Vector3(-Infinity,-Infinity,-Infinity);
    ST.s.meshes.forEach(m=>{
      try{
        const bb = m.getBoundingInfo?.().boundingBox;
        if (!bb) return;
        min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
      }catch{}
    });
    const tries = 20;
    for (let i=0;i<tries;i++){
      const p = v3(
        min.x + Math.random()*(max.x-min.x),
        ST.ghostRoot?.position?.y || 0,
        min.z + Math.random()*(max.z-min.z)
      );
      // don’t pick positions completely boxed by immediate barriers in all directions
      const c = ST.ghostRoot?.position || p;
      if (!isSegmentBlocked(c, p)) return p;
    }
    return ST.ghostRoot?.position.clone() || v3(0,0,0);
  }

  function pursuePlayerTarget(){
    const player = ST.c?.position; if (!player) return ST.ghostRoot?.position.clone() || null;
    return player.clone();
  }

  // -------- per-frame tick --------
  function _tick(){
    const now = performance.now()/1000;
    const dt  = Math.min(0.1, Math.max(0, now - ST.lastUpdateT));
    ST.lastUpdateT = now;

    if (!ST.ghostRoot) return;

    // sanity & event scheduler
    updateSanity(dt);
    if (now - ST.lastEventT > CFG.eventCooldown){
      ST.lastEventT = now;
      if (Math.random() < CFG.eventChance) triggerEvent(['blink','flicker','whisper'][(Math.random()*3)|0]);
    }

    // auto-enter hunts when sanity low and off cooldown
    if (ST.mode!=='hunt' && ST.sanity <= CFG.huntSanityThreshold && now >= ST.nextHuntReadyT){
      if (Math.random() < 0.12) beginHunt(); // small chance per tick window
    }

    // movement
    if (ST.mode==='roam'){
      if (!ST.target || BABYLON.Vector3.Distance(ST.ghostRoot.position, ST.target) <= CFG.roamTargetRadius){
        ST.target = pickRoamTarget();
      }
      moveToward(ST.target, CFG.roamSpeed, dt);
    }
    else if (ST.mode==='hunt'){
      const t = pursuePlayerTarget();
      if (t) moveToward(t, CFG.huntSpeed, dt);
      // brief intermittent manifests while hunting
      if (Math.random() < 0.03) blinkManifest(0.12 + Math.random()*0.18);
      // stop the hunt if player is far away and sanity tanked further
      if (ST.sanity <= 0){ endHunt(); }
    }
    else if (ST.mode==='cooldown'){
      // drift slowly
      if (!ST.target || BABYLON.Vector3.Distance(ST.ghostRoot.position, ST.target) <= CFG.roamTargetRadius){
        ST.target = pickRoamTarget();
      }
      moveToward(ST.target, CFG.roamSpeed*0.6, dt);
      // return to roam after a bit
      if (now >= ST.nextHuntReadyT - CFG.minHuntCooldown*0.5) setMode('roam');
    }
  }

  // -------- tiny DOM helper (for dev-visible guard) --------
  function $(sel, root=document){ return root.querySelector(sel); }

})();
