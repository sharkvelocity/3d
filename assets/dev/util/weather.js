// ./assets/dev/util/weather.js
// Compact weather system with indoor muffling (HTMLAudio routing via PP.audio)
// States: "Clear" | "Rainstorm" | "Bloodmoon" | "Snow"
(function(){
  "use strict";
  if (window.__PP_WEATHER_MINI__) return; window.__PP_WEATHER_MINI__ = true;

  const PP = (window.PP = window.PP || {});
  const W  = (PP.weather = PP.weather || {});

  // ---- Public state ----
  W.state     = W.state     || "Clear";
  W.intensity = W.intensity ?? 1.0;
  W.indoor    = W.indoor    || false;

  // ---- Config ----
  const INDOOR_CHECK_PERIOD = 500; // ms
  const INDOOR_MUFFLE       = 0.35; // ambient gain multiplier when indoors

  // ---- Internals ----
  let _nextBloodAt = Infinity;
  let _overlay = null;
  let _flashLight = null;
  let _boundTick = null;
  let _indoorTimer = 0;
  let _lastAmbientGainApplied = 1;

  // Helpers
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const S = () => window.SCENE || BABYLON.Engine?.LastCreatedScene || null;
  const nowS = () => performance.now() / 1000;

  // HUD
  function updateHUD(){
    const el = document.getElementById('hud-weather');
    if (!el) return;
    el.textContent = W.state + (W.indoor ? " (Indoor)" : "");
  }

  // ---- Audio routing ----
  // Map our 4 states to modular_audio weather buckets
  function routeAudioForState(st){
    const aState = (st==="Rainstorm" || st==="Bloodmoon") ? "Rain"
                  :  st==="Snow" ? "Snow" : "Clear";
    try { PP.audio?.applyWeather?.(aState); } catch {}
  }
  function applyIndoorMuffle(){
    const target = W.indoor ? INDOOR_MUFFLE : 1.0;
    if (target === _lastAmbientGainApplied) return;
    _lastAmbientGainApplied = target;
    // Only touch the ambient channel so SFX/UI balance remains
    try { PP.audio?.setGains?.({ ambient: target }); } catch {}
  }

  // ---- Bloodmoon lightning ----
  function ensureOverlay(){
    if (_overlay) return;
    const div = document.createElement('div');
    div.id = 'wx-blood-flash';
    Object.assign(div.style, {
      position:'fixed', inset:'0', pointerEvents:'none',
      background:'#f003', opacity:'0', transition:'opacity 80ms linear', zIndex:'5000'
    });
    document.body.appendChild(div);
    _overlay = div;
  }
  function scheduleBlood(minS=18, maxS=42){
    _nextBloodAt = nowS() + (minS + Math.random()*(maxS-minS)) * (0.85 + Math.random()*0.3);
  }
  function flashBlood(){
    const sc = S(); if (!sc) return;
    ensureOverlay();

    const cam = sc.activeCamera || window.camera;
    const camPos = cam?.globalPosition || cam?.position || new BABYLON.Vector3(0,1.7,0);
    const fwd = cam?.getDirection ? cam.getDirection(BABYLON.Vector3.Forward()) : new BABYLON.Vector3(0,0,1);
    const right = BABYLON.Vector3.Cross(fwd, BABYLON.Vector3.Up()).normalize();
    const az   = Math.random()*Math.PI*2;
    const dist = 120 + Math.random()*100;
    const dir2 = fwd.scale(Math.cos(az)).add(right.scale(Math.sin(az))).normalize();
    const pos  = camPos.add(dir2.scale(dist)).add(new BABYLON.Vector3(0, 12+Math.random()*8, 0));

    if (!_flashLight || _flashLight.isDisposed()){
      _flashLight = new BABYLON.PointLight("blood_flash", pos, sc);
      _flashLight.range = 250;
      _flashLight.diffuse  = new BABYLON.Color3(0.8,0.1,0.1);
      _flashLight.specular = _flashLight.diffuse;
      _flashLight.intensity = 0;
    } else {
      _flashLight.position.copyFrom(pos);
    }

    let pulses = 1 + (Math.random()<0.4 ? 1 : 0);
    const pulse = ()=>{
      if (pulses-- <= 0) return;
      _overlay.style.opacity = '0.18';
      setTimeout(()=> _overlay.style.opacity = '0', 100 + Math.random()*60);

      _flashLight.intensity = 0.6 + Math.random()*0.4;
      setTimeout(()=>{ if (_flashLight) _flashLight.intensity = 0; }, 120 + Math.random()*80);

      // Thunder ping: use any heavy SFX you have; slam is a decent boom fallback
      const td = 1200 + Math.random()*2300;
      setTimeout(()=>{ try{ PP.audio?.play?.slam?.(); }catch{} }, td);

      if (pulses > 0) setTimeout(pulse, 100 + Math.random()*140);
    };
    pulse();
  }

  // ---- Visual palette per state (fog) ----
  function applyVisuals(){
    const sc = S(); if (!sc) return;
    const fog = {
      Clear:     { c:[0.02,0.03,0.05], d:0.0045 },
      Rainstorm: { c:[0.02,0.03,0.04], d:0.0060 },
      Snow:      { c:[0.095,0.10,0.11], d:0.0035 },
      Bloodmoon: { c:[0.26,0.02,0.04], d:0.0055 }
    }[W.state] || { c:[0.02,0.03,0.05], d:0.0045 };

    sc.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    sc.fogColor   = new BABYLON.Color3(fog.c[0], fog.c[1], fog.c[2]);
    sc.fogDensity = fog.d * clamp(W.intensity, 0.25, 2.0);
  }

  // ---- Indoor detection ----
  function isIndoorAt(pos){
    const sc = S(); if (!sc || !pos) return false;

    // Van zone override → considered outdoor
    try{
      const V = window.PP?.CONFIG?.VAN;
      if (V && V.POSITION && typeof V.RADIUS === 'number') {
        if (BABYLON.Vector3.Distance(pos, V.POSITION) <= (V.RADIUS + 1.0)) return false;
      }
    } catch {}

    // Ray upward to detect a roof/ceiling-ish mesh
    const from = new BABYLON.Vector3(pos.x, pos.y + 0.5, pos.z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,1,0), 12);
    const hit  = sc.pickWithRay(ray, (m)=>{
      if (!m || m.isPickable === false) return false;
      if (m.metadata?.isRoof || m.metadata?.isCeiling) return true;
      const n = (m.name || '').toLowerCase();
      return /roof|ceiling|attic|upper|secondfloor/.test(n);
    });
    return !!(hit && hit.hit);
  }
  function indoorTick(dtMs){
    _indoorTimer += dtMs;
    if (_indoorTimer < INDOOR_CHECK_PERIOD) return;
    _indoorTimer = 0;

    const sc = S(); const cam = sc?.activeCamera || window.camera;
    const p = cam?.position;
    if (!p) return;

    const was = W.indoor;
    const isIn = isIndoorAt(p);
    if (isIn !== was){
      W.indoor = isIn;
      applyIndoorMuffle();
      updateHUD();
    }
  }

  // ---- Apply full state ----
  function applyState(){
    applyVisuals();
    routeAudioForState(W.state);
    applyIndoorMuffle();
    if (W.state === "Bloodmoon") scheduleBlood(); else _nextBloodAt = Infinity;
    updateHUD();
    window.dispatchEvent(new CustomEvent('pp:weather:changed', { detail:{ state:W.state, intensity:W.intensity, indoor:W.indoor } }));
  }

  // ---- Tick binding ----
  function bindTick(){
    const sc = S(); if (!sc || _boundTick) return;
    let _lastMS = performance.now();
    _boundTick = ()=>{
      const t = performance.now();
      const dtMs = t - _lastMS; _lastMS = t;

      if (W.state === "Bloodmoon" && nowS() >= _nextBloodAt){ flashBlood(); scheduleBlood(); }
      indoorTick(dtMs);
    };
    sc.onBeforeRenderObservable.add(_boundTick);
  }

  // ---- Public API ----
  W.set = function(state, opts){
    if (!/^(Clear|Rainstorm|Bloodmoon|Snow)$/.test(state||"")) return;
    W.state = state;
    if (opts && typeof opts.intensity === "number") W.intensity = clamp(opts.intensity, 0.1, 3);
    if (typeof opts?.indoor === "boolean") W.indoor = opts.indoor;
    applyState();
  };
  W.get  = ()=> ({ state: W.state, intensity: W.intensity, indoor: W.indoor });
  W.init = function(){ applyState(); bindTick(); };
  W.setIndoor = function(on){ W.indoor = !!on; applyIndoorMuffle(); updateHUD(); };

  // Legacy shim for code that reads window.weather.state
  window.weather = window.weather || {};
  Object.defineProperty(window.weather, "state", {
    get(){ return W.state; },
    set(v){ if (/^(Clear|Rainstorm|Bloodmoon|Snow)$/.test(v||"")) W.set(v); }
  });

  // ---- Boot after Start ----
  window.addEventListener('pp:start', ()=>{
    const go = ()=> {
      if (!S()) return setTimeout(go, 80);
      // Distribution: Clear 45%, Rainstorm 35%, Bloodmoon 10%, Snow 10%
      const r = Math.random();
      const init = r < 0.45 ? "Clear" : r < 0.80 ? "Rainstorm" : r < 0.90 ? "Bloodmoon" : "Snow";
      W.set(init, { intensity: 0.85 });
      W.init();
      console.log("[Weather] mini+indoor started:", init);
    };
    go();
  });
})();
