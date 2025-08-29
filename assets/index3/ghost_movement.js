// ./assets/index3/ghost_movement.js — v1.8
// + Ground follow (raycast snap), step-up/down smoothing
// + Faster roam + acceleration so movement is immediate
// + Auto-start roaming even if Start button not clicked
// + 45s hunt grace right after spawn
// + Keeps: dev force-visible, barriers, non-blocking when invisible, hunt-only kills

(function(){
  "use strict";
  if (window.ghostCtrl && window.ghostCtrl.__v === '1.8') return;

  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA = ()=> window.camera || SCENE()?.activeCamera;
  const toast  = (m,ms=900)=> (window.toast? window.toast(m,ms) : console.log('[ghost]', m));
  const clamp  = (v,min,max)=> Math.max(min, Math.min(max, v));
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const devForce = ()=> !!window.GHOST_DEV_FORCE_VISIBLE;

  const CFG = {
    // movement
    roamSpeed: 1.5,
    huntSpeed: 2.6,
    accelRate: 6.0,          // m/s^2 toward target speed
    steerAngles: [15,-15,30,-30,45,-45,60,-60,90,-90,120,-120,150,-150,180],
    barrierLookahead: 1.6,

    // visibility / events / sanity
    blinkMin: 0.10, blinkMax: 0.28,
    eventCooldown: 7.5, eventChance: 0.35,
    roamTargetRadius: 6.0, playerScareRadius: 6.5,
    sanityDrainPerMin: 2.5, sanityDrainProximity: 9, sanityDrainHunt: 22,
    minHuntCooldown: 35, maxHuntCooldown: 75, huntSanityThreshold: 50,
    lightFlickerRadius: 10, lightFlickerFactor: 0.35,
    randomSpawnDist: 8,
    killRadius: 1.25,

    // ground follow
    groundFollow: true,
    groundRayUp: 3.0,
    groundRayDown: 8.0,
    footOffset: 0.02,
    maxStepUp: 0.60,
    maxStepDown: 0.80,
    groundSnapLerp: 14.0
  };

  const ST = {
    __v:'1.8',
    ready:false, s:null, c:null,
    ghostRoot:null, modelName:null, ghostTypeKey:null,
    defaultVisibility:0, scale:1,
    target:null, mode:'idle',
    lastEventT:0, nextHuntReadyT:0,
    sanity:100, lastUpdateT:performance.now()/1000,
    lightCache:[],
    isVisible:false,
    curSpeed:0,
    lastPosY:null,
    autoStarted:false      // NEW: will auto-enter roam once ghost exists
  };

  const API = {
    __v:'1.8',
    init, startInvestigation, randomizeGhost,
    beginHunt, endHunt, triggerEvent,
    teleportGhostToLook, setGhostScale,
    getState: ()=>({ mode:ST.mode, type:ST.ghostTypeKey, model:ST.modelName,
      visible: ST.isVisible, sanity:ST.sanity,
      pos: ST.ghostRoot?.position && {x:+ST.ghostRoot.position.x.toFixed(2), y:+ST.ghostRoot.position.y.toFixed(2), z:+ST.ghostRoot.position.z.toFixed(2)} })
  };
  window.ghostCtrl = API;
  window.beginHunt = beginHunt; window.endHunt = endHunt;

  function init(){
    if (ST.ready) return;
    ST.s = SCENE(); ST.c = CAMERA(); if (!ST.s || !ST.c) return;
    ST.s.onBeforeRenderObservable.add(_tick);
    const btn = document.getElementById('start-button');
    if (btn) btn.addEventListener('click', ()=> startInvestigation());
    window.addEventListener('keydown',(e)=>{ if(e.altKey && (e.code==='KeyG'||e.key==='g'||e.key==='G')) teleportGhostToLook(2.8); });
    ST.ready = true; toast('Ghost ctrl ready');
  }
  const boot = setInterval(()=>{ try{ if (SCENE() && CAMERA()){ clearInterval(boot); init(); } }catch{} }, 150);

  function startInvestigation(){
    if (!ST.ghostRoot) randomizeGhost();
    setMode('roam'); ST.target = pickRoamTarget();
    ST.autoStarted = true; // ensure roaming
  }

  function randomizeGhost(){
    pickRandomGhostType();
    pickRandomGhostModelOrFallback();
    placeGhostAheadOfCamera(CFG.randomSpawnDist);
    setGhostVisible(devForce());
    // 45s grace before hunts can start
    ST.nextHuntReadyT = (performance.now()/1000) + 45;
  }
  function pickRandomGhostType(){
    try{
      const keys = Object.keys(window.GHOSTS||{});
      ST.ghostTypeKey = keys.length ? keys[(Math.random()*keys.length)|0] : 'Spirit';
      window.currentGhostKey = ST.ghostTypeKey;
    }catch{ ST.ghostTypeKey = 'Spirit'; }
  }
  function pickRandomGhostModelOrFallback(){
    if (window.PREFERRED_GHOST_ROOT && !window.PREFERRED_GHOST_ROOT.isDisposed?.()){
      ST.ghostRoot = window.PREFERRED_GHOST_ROOT;
      ST.modelName = window.PREFERRED_GHOST_MODEL_NAME || ST.ghostRoot.name || "dev_ghost";
      ST.scale = window.PREFERRED_GHOST_SCALE || 1; try{ ST.ghostRoot.scaling.set(ST.scale, ST.scale, ST.scale); }catch{}
      ST.defaultVisibility = 0.0; return;
    }
    if (window.PREFERRED_GHOST_MODEL_NAME){
      const m = getByName(window.PREFERRED_GHOST_MODEL_NAME);
      if (m){ const root = new BABYLON.TransformNode('GhostRoot_'+Date.now().toString(36), ST.s); m.parent = root;
        ST.ghostRoot = root; ST.modelName = m.name; ST.scale = window.PREFERRED_GHOST_SCALE || 1;
        try{ root.scaling.set(ST.scale,ST.scale,ST.scale);}catch{} ST.defaultVisibility=0.0; return; }
    }
    const candidates = rankedSceneNames();
    for (let i=0;i<candidates.length;i++){
      const name=candidates[(Math.random()*candidates.length)|0];
      const m=getByName(name); if (!m || badSceneName(name)) continue;
      const root = new BABYLON.TransformNode('GhostRoot_'+Date.now().toString(36), ST.s); m.parent = root;
      ST.ghostRoot=root; ST.modelName=name; ST.defaultVisibility=0.0; ST.scale=1; return;
    }
    const r=new BABYLON.TransformNode('GhostRoot', ST.s);
    const body=BABYLON.MeshBuilder.CreateSphere('GhostBall',{diameter:0.45,segments:16}, ST.s);
    const tail=BABYLON.MeshBuilder.CreateCylinder('GhostTail',{diameterTop:0.18,diameterBottom:0.4,height:0.8,tessellation:16}, ST.s);
    body.parent=r; tail.parent=r; tail.position.y=-0.6;
    const mat=new BABYLON.StandardMaterial('GhostMat', ST.s);
    mat.diffuseColor=new BABYLON.Color3(0.85,0.95,1.0); mat.emissiveColor=new BABYLON.Color3(0.2,0.4,0.5); mat.alpha=0.35;
    body.material=mat; tail.material=mat; ST.ghostRoot=r; ST.modelName='fallback_ghost'; ST.defaultVisibility=0.0; ST.scale=1;
  }
  function rankedSceneNames(){
    const names = ST.s.meshes.map(m=>m.name).filter(Boolean); const pri=[], rest=[];
    names.forEach(n=> (/ghost|spirit|entity|phantom|demon|thaye|deogen|revenant|shade|oni|yurei|wraith|mimic|poltergeist|apparition|armature|rig/i.test(n)?pri:rest).push(n));
    return [...new Set([...pri, ...rest])];
  }
  function getByName(n){ return ST.s.getMeshByName(n) || ST.s.getNodeByName(n); }
  function badSceneName(n){ return /ground|floor|terrain|room|house|wall|plane|door|window|light|lamp|roof|stairs|sky|skybox/i.test(n); }

  function setGhostScale(sc){
    ST.scale = clamp(+sc||1, 0.1, 5);
    if (ST.ghostRoot) ST.ghostRoot.scaling.set(ST.scale, ST.scale, ST.scale);
    try{ ST.ghostRoot.metadata = ST.ghostRoot.metadata||{}; ST.ghostRoot.metadata.ghostScale = ST.scale; }catch{}
  }

  // ---- Ground tagging helpers ----
  (function(){
    window.registerGroundRoots = window.registerGroundRoots || function registerGroundRoots(namesOrRegex){
      const s = window.scene; if (!s) return;
      const list = Array.isArray(namesOrRegex) ? namesOrRegex : [namesOrRegex];
      const isHit = (m)=> list.some(p=>{
        if (p instanceof RegExp) return p.test(m.name || "");
        return (m.name||"") === String(p) || (m.name||"").startsWith(String(p));
      });
      s.meshes.forEach(m=>{
        if (isHit(m)){ tagTree(m); }
        else {
          let p=m.parent;
          while (p){ if (isHit(p)){ tagTree(m); break; } p=p.parent; }
        }
      });
      function tagTree(node){
        const stack=[node];
        while (stack.length){
          const n=stack.pop();
          try {
            n.metadata = n.metadata || {};
            n.metadata.isGround = true;
            n.isPickable = (n.isPickable !== false);
          } catch {}
          n.getChildren?.().forEach(ch=> stack.push(ch));
        }
      }
    };
  })();

  function isGroundMesh(m){
    if (!m) return false;
    if (m === ST.ghostRoot || m.isDescendantOf?.(ST.ghostRoot)) return false;
    if (m.metadata?.isGround === true) return true;
    const hitName = (x)=> /(^|\/|_)Madera4\.001/i.test(x || "") || /^Madera/i.test(x || "");
    if (hitName(m.name) || hitName(m.id)) return true;
    let p = m.parent;
    while (p){
      if (hitName(p.name) || hitName(p.id)) return true;
      p = p.parent;
    }
    const n = (m.name||'') + ' ' + (m.id||'');
    if (/(^|[^a-z])(floor|ground|terrain|tile|carpet|stairs?|step|hall|room)([^a-z]|$)/i.test(n)) return true;
    return m.isPickable !== false;
  }
  function groundYAtXZ(x, z, approxY){
    const s = ST.s || SCENE(); if (!s) return null;
    const from = new BABYLON.Vector3(x, (approxY ?? 2) + CFG.groundRayUp, z);
    const ray  = new BABYLON.Ray(from, v3(0,-1,0), CFG.groundRayUp + CFG.groundRayDown);
    const hit  = s.pickWithRay(ray, isGroundMesh, false);
    return (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : null;
  }
  function snapY(pos, dt){
    if (!CFG.groundFollow) return;
    const gy = groundYAtXZ(pos.x, pos.z, ST.lastPosY ?? pos.y);
    if (gy == null) return;
    const targetY = gy + CFG.footOffset;
    const maxUp   = CFG.maxStepUp;
    const maxDown = CFG.maxStepDown;
    let y = ST.lastPosY ?? pos.y;
    const dy = targetY - y;
    const maxStepPerFrameUp   = maxUp   * dt * 8;
    const maxStepPerFrameDown = maxDown * dt * 8;
    if (dy > 0)      y += Math.min(dy, maxStepPerFrameUp);
    else if (dy < 0) y += Math.max(dy, -maxStepPerFrameDown);
    const k = clamp(dt * CFG.groundSnapLerp, 0, 1);
    y = y + (targetY - y) * k;
    pos.y = y;
    ST.lastPosY = y;
  }

  function placeGhostAheadOfCamera(dist){
    const c = CAMERA(), s = SCENE(); if (!c || !s){ return; }
    if (!ST.ghostRoot) pickRandomGhostModelOrFallback();
    if (!ST.ghostRoot) return;
    const ray = c.getForwardRay(50);
    let p = c.position.add(ray.direction.scale(dist||CFG.randomSpawnDist));
    const gy = groundYAtXZ(p.x, p.z, p.y);
    p.y = (gy != null ? gy + CFG.footOffset : p.y);
    ST.ghostRoot.position.copyFrom(p);
  }
  function teleportGhostToLook(distance){
    const d = isFinite(+distance) ? +distance : 2.8;
    ST.s = SCENE(); ST.c = CAMERA();
    const s = ST.s, c = ST.c;
    if (!s || !c) { console.log('teleport: scene/camera not ready'); return; }
    if (!ST.ghostRoot){ randomizeGhost(); if (!ST.ghostRoot){ console.log('teleport: no ghost'); return; } }
    const root = ST.ghostRoot;
    const fRay = c.getForwardRay(60);
    const pickable = (m)=>{
      if (!m) return false;
      if (m === root || m.isDescendantOf?.(root)) return false;
      if (/sky|skybox/i.test(m.name||"")) return false;
      return m.isPickable !== false;
    };
    let target = null;
    const hit = s.pickWithRay(fRay, pickable, false);
    if (hit?.hit && hit.pickedPoint){
      target = hit.pickedPoint.subtract(fRay.direction.scale(0.35));
    } else {
      target = c.position.add(fRay.direction.scale(d));
    }
    const gy = groundYAtXZ(target.x, target.z, target.y);
    if (gy != null) target.y = gy + CFG.footOffset;
    root.position.copyFrom(target);
    try{ root.rotationQuaternion = null; root.rotation.y = Math.atan2(fRay.direction.x, fRay.direction.z); }catch{}
    if (devForce()) setGhostVisible(true);
  }
  window.teleportGhostToLook = teleportGhostToLook;
  window.teleportGhost       = teleportGhostToLook;
  window.teleportGhostAhead  = (d)=> placeGhostAheadOfCamera(d || CFG.randomSpawnDist);

  function setCollisionsEnabled(enabled){
    const want = !!enabled && ST.mode==='hunt';
    const r = ST.ghostRoot; if (!r) return;
    const stack=[r];
    while (stack.length){
      const n=stack.pop();
      try{ if ('checkCollisions' in n) n.checkCollisions = want; }catch{}
      n.getChildren?.().forEach(ch=> stack.push(ch));
    }
  }
  function setGhostVisible(on){
    if (devForce()) on = true;
    ST.isVisible = !!on;
    const setNode=(node,vis)=>{
      if (!node) return;
      if (node.material && typeof node.material.alpha === 'number') node.material.alpha = vis ? 1 : 0.0;
      if ('visibility' in node) node.visibility = vis ? 1 : 0;
      if ('isVisible' in node)  node.isVisible  = !!vis;
    };
    if (ST.ghostRoot){
      const stack=[ST.ghostRoot];
      while (stack.length){ const n=stack.pop(); setNode(n,on); n.getChildren?.().forEach(ch=> stack.push(ch)); }
    }
    setCollisionsEnabled(ST.isVisible);
  }
  function blinkManifest(timeSec){
    if (devForce()) return;
    const dur = timeSec || (CFG.blinkMin + Math.random()*(CFG.blinkMax-CFG.blinkMin));
    setGhostVisible(true);
    setTimeout(()=> setGhostVisible(false), dur*1000);
    tryLightFlickerNear(ST.ghostRoot.position, dur);
  }

  function updateSanity(dt){
    ST.sanity -= (CFG.sanityDrainPerMin/60)*dt;
    const g=ST.ghostRoot?.position, p=ST.c?.position;
    if (g && p){
      const dx=g.x-p.x, dz=g.z-p.z, dist=Math.sqrt(dx*dx+dz*dz);
      if (dist <= CFG.playerScareRadius) ST.sanity -= (CFG.sanityDrainProximity/60)*dt;
    }
    if (ST.mode==='hunt') ST.sanity -= (CFG.sanityDrainHunt/60)*dt;
    ST.sanity = clamp(ST.sanity,0,100);
    const el = document.getElementById('hud-sanity'); if (el) el.textContent = `${Math.round(ST.sanity)}%`
    const huntEl = document.getElementById('hud-hunt-state'); if (huntEl) huntEl.textContent = ST.mode==='hunt' ? 'HUNTING' : (ST.mode==='cooldown'?'Cooling':'Calm');
  }
  function triggerEvent(type){
    const t=type||'blink';
    if (t==='blink'){ blinkManifest(); /* play sfx if available */ }
    else if (t==='flicker'){ tryLightFlickerNear(ST.ghostRoot.position, 0.6 + Math.random()*0.6); }
    else if (t==='whisper'){ /* optional */ }
  }
  function tryLightFlickerNear(pos, durSec){
    if (!pos || !ST.s) return;
    if (!ST.lightCache.length) ST.lightCache = (ST.s.lights||[]).slice();
    const lights = ST.lightCache.filter(L=>{
      try{ const P=L.getAbsolutePosition?.()||L.position; return P && BABYLON.Vector3.Distance(P,pos)<=CFG.lightFlickerRadius; }catch{return false;}
    });
    if (!lights.length) return;
    const saved = lights.map(L=>({L,intensity:L.intensity}));
    const id = setInterval(()=>{ lights.forEach(L=> L.intensity = saved.find(x=>x.L===L).intensity*(0.85+Math.random()*CFG.lightFlickerFactor)); },40);
    setTimeout(()=>{ clearInterval(id); saved.forEach(x=> x.L.intensity=x.intensity); }, durSec*1000);
  }

  function beginHunt(){
    if (!ST.ghostRoot) return;
    const now=performance.now()/1000; if (now < ST.nextHuntReadyT) return;
    setMode('hunt');
    blinkManifest(0.4 + Math.random()*0.4);
    setCollisionsEnabled(ST.isVisible);
  }
  function endHunt(){
    if (!ST.ghostRoot) return;
    setMode('cooldown');
    setGhostVisible(false);
    const now=performance.now()/1000;
    ST.nextHuntReadyT = now + (CFG.minHuntCooldown + Math.random()*(CFG.maxHuntCooldown-CFG.minHuntCooldown));
  }
  function setMode(m){
    ST.mode=m;
    const el=document.getElementById('hud-hunt-state');
    if (el) el.textContent = (m==='hunt'?'HUNTING':(m==='cooldown'?'Cooling':'Calm'));
    setCollisionsEnabled(ST.isVisible);
  }
  function canKillPlayer(){
    if (ST.mode !== 'hunt') return false;
    const g = ST.ghostRoot?.position, p = ST.c?.position; if (!g || !p) return false;
    const dx=g.x-p.x, dz=g.z-p.z, dist=Math.sqrt(dx*dx+dz*dz);
    if (dist > CFG.killRadius) return false;
    if (isSegmentBlocked(g, p)) return false;
    return true;
  }
  function performKill(){
    try{ window.onPlayerKilled?.(); }catch{}
    console.log('You died.');
    endHunt();
  }

  function isSegmentBlocked(a,b){
    try{
      if (typeof window.ghostDev_isBlockedRay === 'function') return !!window.ghostDev_isBlockedRay(a,b);
      const dir=b.subtract(a), len=dir.length(); if (len<=0.001) return false;
      const ray=new BABYLON.Ray(a, dir.normalize(), len);
      const hit=ST.s.pickWithRay(ray, m=> m && m.metadata?.isGhostBlocker===true);
      return !!(hit && hit.hit);
    }catch{ return false; }
  }

  function moveToward(target, targetSpeed, dt){
    const g=ST.ghostRoot; if (!g) return;
    const cur=g.position;
    const to=target.subtract(cur);
    let dist=to.length();
    if (dist < 1e-4) { ST.curSpeed = 0; return; }
    const desired = targetSpeed;
    if (ST.curSpeed < desired) ST.curSpeed = Math.min(desired, ST.curSpeed + CFG.accelRate*dt);
    else if (ST.curSpeed > desired) ST.curSpeed = Math.max(desired, ST.curSpeed - CFG.accelRate*dt);
    let dir = to.scale(1/dist);
    const aheadA=cur;
    const aheadB=cur.add(dir.scale(CFG.barrierLookahead));
    if (isSegmentBlocked(aheadA,aheadB)){
      const yaw=Math.atan2(dir.x,dir.z); let steered=null;
      for (const deg of CFG.steerAngles){
        const ang=yaw + (deg*Math.PI/180), tryDir=v3(Math.sin(ang),0,Math.cos(ang));
        const b=cur.add(tryDir.scale(CFG.barrierLookahead));
        if (!isSegmentBlocked(cur,b)){ steered=tryDir; break; }
      }
      if (steered) dir=steered; else { ST.curSpeed = 0; return; }
    }
    const step = ST.curSpeed * dt;
    const next = cur.add(dir.scale(step));
    snapY(next, dt);
    g.position.copyFrom(next);
    try{ g.rotationQuaternion=null; g.rotation.y=Math.atan2(dir.x,dir.z); }catch{}
  }

  function pickRoamTarget(){
    let min=new BABYLON.Vector3(+Infinity,+Infinity,+Infinity), max=new BABYLON.Vector3(-Infinity,-Infinity,-Infinity);
    ST.s.meshes.forEach(m=>{ try{ const bb=m.getBoundingInfo?.().boundingBox; if (bb){ min=BABYLON.Vector3.Minimize(min,bb.minimumWorld); max=BABYLON.Vector3.Maximize(max,bb.maximumWorld); } }catch{} });
    for (let i=0;i<20;i++){
      const p=v3(min.x+Math.random()*(max.x-min.x), ST.ghostRoot?.position?.y||0, min.z+Math.random()*(max.z-min.z));
      const c=ST.ghostRoot?.position||p; if (!isSegmentBlocked(c,p)) return p;
    }
    return ST.ghostRoot?.position.clone()||v3(0,0,0);
  }
  function pursuePlayerTarget(){ const p=ST.c?.position; return p ? p.clone() : (ST.ghostRoot?.position.clone()||null); }

  function _tick(){
    const now=performance.now()/1000, dt=Math.min(0.1, Math.max(0, now-ST.lastUpdateT)); ST.lastUpdateT=now;
    if (!ST.ghostRoot) return;

    // NEW: auto-start roaming once ghost exists if still idle
    if (!ST.autoStarted && ST.mode === 'idle') {
      setMode('roam');
      ST.target = pickRoamTarget();
      ST.autoStarted = true;
    }

    updateSanity(dt);

    if (now-ST.lastEventT>CFG.eventCooldown){
      ST.lastEventT=now;
      if (Math.random()<CFG.eventChance) triggerEvent(['blink','flicker','whisper'][(Math.random()*3)|0]);
    }

    if (ST.mode!=='hunt' && ST.sanity<=CFG.huntSanityThreshold && now>=ST.nextHuntReadyT){
      if (Math.random()<0.12) beginHunt();
    }

    if (ST.mode==='roam'){
      if (!ST.target || BABYLON.Vector3.Distance(ST.ghostRoot.position,ST.target)<=CFG.roamTargetRadius){ ST.target=pickRoamTarget(); }
      moveToward(ST.target, CFG.roamSpeed, dt);
    } else if (ST.mode==='hunt'){
      const t=pursuePlayerTarget(); if (t) moveToward(t, CFG.huntSpeed, dt);
      if (!devForce() && Math.random()<0.03) blinkManifest(0.12+Math.random()*0.18);
      if (canKillPlayer()) performKill();
      if (ST.sanity<=0) endHunt();
    } else if (ST.mode==='cooldown'){
      if (!ST.target || BABYLON.Vector3.Distance(ST.ghostRoot.position,ST.target)<=CFG.roamTargetRadius){ ST.target=pickRoamTarget(); }
      moveToward(ST.target, CFG.roamSpeed*0.6, dt);
      if (now>=ST.nextHuntReadyT - CFG.minHuntCooldown*0.5) setMode('roam');
    }
  }
})();
