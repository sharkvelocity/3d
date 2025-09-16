// ./assets/dev/util/weather.js
// Single source of truth for ambience + weather.
// Clear = crickets ambient only. Rainstorm = rain only.
// Bloodmoon = rain + distant red lightning + delayed thunder. Snow = snow only.
// Preserves indoor muffling & adds robust init/crossfade so UI and audio never disagree.
(function () {
  "use strict";

  // ───────────────────────── small utils
  const lerp  = (a,b,t)=> a + (b-a)*Math.max(0, Math.min(1, t));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const v3    = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  function S() { return window.SCENE || BABYLON.Engine?.LastCreatedScene || null; }
  function cam(){ const s=S(); return s?.activeCamera || window.camera || null; }

  // ───────────────────────── state
  const ST = {
    state: "Clear",                 // "Clear" | "Rainstorm" | "Bloodmoon" | "Snow"
    ready: false,
    started: false,
    sounds: { ambient:null, rain:null, snow:null, thunder:[] },
    volBase:   { ambient:0.7, rain:0.65, snow:0.5, thunder:0.9 },
    volTarget: { ambient:0.0, rain:0.0,  snow:0.0 },
    volNow:    { ambient:0.0, rain:0.0,  snow:0.0 },

    indoor: false,
    intensity: 1.0,

    nextLightningAt: Infinity,
    lastT: performance.now()/1000,
    _loopCB: null,

    // FX caches
    _flashLight: null,
    _flashLayer: null,

    // indoor detect cadence
    _indoorLast: null,
    _indoorAcc: 0,
    _indoorPeriod: 0.5, // s
  };

  // ───────────────────────── sound setup
  function ensureSounds(){
    if (ST.ready) return;
    const s = S(); if (!s) return;

    try {
      // CLEAR ambient bed (crickets) — ONLY for Clear
      ST.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });

      // Weather loops
      ST.sounds.rain = new BABYLON.Sound("rain", "./assets/audio/rainstorm.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });
      ST.sounds.snow = new BABYLON.Sound("snow", "./assets/audio/snow.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });

      // Thunder palette (Bloodmoon only)
      ["thunder_loud.mp3","thunder_rumble.mp3","thunder.mp3"].forEach((f,i)=>{
        try{
          const th = new BABYLON.Sound("th"+i, "./assets/audio/"+f, s, null,
            { loop:false, autoplay:false, volume:ST.volBase.thunder, spatialSound:false });
          ST.sounds.thunder.push(th);
        }catch(_){}
      });

      ST.ready = true;
    } catch (e) {
      console.warn("[weather] sound init failed", e);
    }
  }

  // ───────────────────────── lightning/thunder (Bloodmoon)
  function scheduleBloodmoonLightning(){
    const now = performance.now()/1000;
    const min = 18, max = 42;
    const delay = (min + Math.random()*(max-min)) * (0.85 + Math.random()*0.3);
    ST.nextLightningAt = now + delay;
  }

  function flashBloodmoon(){
    const s = S(); if (!s) return;

    // subtle red overlay (created once)
    if (!ST._flashLayer){
      const layer = document.createElement('div');
      layer.id = 'flash-overlay-blood';
      Object.assign(layer.style, {
        position:'fixed', inset:'0', pointerEvents:'none', background:'#f003',
        opacity:'0', transition:'opacity 80ms linear', zIndex:'5000'
      });
      document.body.appendChild(layer);
      ST._flashLayer = layer;
    }

    // distant red point light
    const c = cam();
    const camPos  = c?.globalPosition || c?.position || v3(0,1.7,0);
    const forward = c?.getDirection ? c.getDirection(BABYLON.Vector3.Forward()) : new BABYLON.Vector3(0,0,1);
    const up = BABYLON.Vector3.Up();
    const right = BABYLON.Vector3.Cross(forward, up).normalize();
    const az = Math.random()*Math.PI*2;
    const dist = 120 + Math.random()*100;   // 120–220m
    const dir2D = forward.scale(Math.cos(az)).add(right.scale(Math.sin(az))).normalize();
    const pos = camPos.add(dir2D.scale(dist)).add(new BABYLON.Vector3(0, 12 + Math.random()*8, 0));

    if (!ST._flashLight || ST._flashLight.isDisposed()){
      ST._flashLight = new BABYLON.PointLight("blood_flash", pos, s);
      ST._flashLight.range = 250;
      ST._flashLight.diffuse = new BABYLON.Color3(0.8, 0.1, 0.1);
      ST._flashLight.specular = ST._flashLight.diffuse;
      ST._flashLight.intensity = 0.0;
    } else {
      ST._flashLight.position.copyFrom(pos);
      ST._flashLight.diffuse.set(0.8,0.1,0.1);
      ST._flashLight.specular.set(0.8,0.1,0.1);
    }

    // 1–2 very dim pulses + red overlay
    const pulses = 1 + (Math.random()<0.4 ? 1 : 0);
    let i = 0;
    const doPulse = () => {
      if (i++ >= pulses) return;

      ST._flashLayer.style.opacity = '0.18';
      setTimeout(()=> ST._flashLayer.style.opacity = '0', 100 + Math.random()*60);

      const target = 0.6 + Math.random()*0.4;
      ST._flashLight.intensity = target;
      setTimeout(()=>{ ST._flashLight.intensity = 0; }, 120 + Math.random()*80);

      // delayed thunder (simulate distance): 1.2–3.5s
      const thunderDelay = 1200 + Math.random()*2300;
      setTimeout(playThunder, thunderDelay);

      if (i < pulses) setTimeout(doPulse, 100 + Math.random()*140);
    };
    doPulse();
  }

  function playThunder(){
    const arr = ST.sounds.thunder || [];
    if (!arr.length) return;
    const pick = Math.random();
    const snd = pick < 0.2 ? arr[0] : pick < 0.7 ? arr[1] : arr[2];
    try {
      const base = ST.volBase.thunder * (ST.indoor ? 0.55 : 1.0);
      snd.setVolume( clamp(base * (0.75 + Math.random()*0.35), 0, 1) );
      snd.play();
    } catch {}
  }

  // ───────────────────────── indoor detection
  function isIndoorAt(pos){
    const s = S(); if (!s || !pos) return false;
    // Van zone override → outdoor
    try{
      const V = window.PP?.CONFIG?.VAN;
      if (V && V.POSITION && typeof V.RADIUS === 'number') {
        if (BABYLON.Vector3.Distance(pos, V.POSITION) <= (V.RADIUS + 1.0)) return false;
      }
    } catch {}

    // Upward ray: hit roof/ceiling? then indoor
    const from = new BABYLON.Vector3(pos.x, pos.y + 0.5, pos.z);
    const ray  = new BABYLON.Ray(from, new BABYLON.Vector3(0,1,0), 12);
    const hit  = s.pickWithRay(ray, (m)=>{
      if (!m) return false;
      if (m.isPickable === false) return false;
      if (m.metadata?.isRoof || m.metadata?.isCeiling) return true;
      const n = (m.name || '').toLowerCase();
      return /roof|ceiling|attic|upper|secondfloor/.test(n);
    });
    return !!(hit && hit.hit);
  }

  function indoorMonitor(dt){
    ST._indoorAcc += dt;
    if (ST._indoorAcc < ST._indoorPeriod) return;
    ST._indoorAcc = 0;

    const c = cam(); const p = c?.position;
    if (!p) return;

    const isIn = isIndoorAt(p);
    if (isIn !== ST._indoorLast){
      ST._indoorLast = isIn;
      ST.indoor = isIn;
      Weather.set(ST.state, { intensity:ST.intensity, immediate:true }); // re-apply volumes consistently
    }
  }

  // ───────────────────────── crossfade + loop control
  function _ensureLoopState(){
    // Start/stop loops solely based on target volumes,
    // so UI label can never disagree with audible state.
    try {
      const tA = ST.volTarget.ambient, tR = ST.volTarget.rain, tS = ST.volTarget.snow;
      // Ambient
      if (ST.sounds.ambient){
        if (tA > 0.02 && !ST.sounds.ambient.isPlaying) ST.sounds.ambient.play();
        if (tA <= 0.01 && ST.sounds.ambient.isPlaying) ST.sounds.ambient.stop();
      }
      // Rain
      if (ST.sounds.rain){
        if (tR > 0.02 && !ST.sounds.rain.isPlaying) ST.sounds.rain.play();
        if (tR <= 0.01 && ST.sounds.rain.isPlaying) ST.sounds.rain.stop();
      }
      // Snow
      if (ST.sounds.snow){
        if (tS > 0.02 && !ST.sounds.snow.isPlaying) ST.sounds.snow.play();
        if (tS <= 0.01 && ST.sounds.snow.isPlaying) ST.sounds.snow.stop();
      }
    } catch {}
  }

  function applyTargets(dt){
    if (!ST.ready) return;
    const k = clamp(dt * 1.5, 0, 1);
    const muffle = ST.indoor ? 0.35 : 1.0;

    const tAmbient = ST.volTarget.ambient;
    const tRain    = ST.volTarget.rain * ST.intensity * muffle;
    const tSnow    = ST.volTarget.snow * ST.intensity * muffle;

    // track "now" for smooth fade (and to guard getVolume jitter)
    ST.volNow.ambient = lerp(ST.volNow.ambient, tAmbient, k);
    ST.volNow.rain    = lerp(ST.volNow.rain,    tRain,    k);
    ST.volNow.snow    = lerp(ST.volNow.snow,    tSnow,    k);

    try { ST.sounds.ambient?.setVolume( ST.volNow.ambient ); } catch {}
    try { ST.sounds.rain?.setVolume(    ST.volNow.rain    ); } catch {}
    try { ST.sounds.snow?.setVolume(    ST.volNow.snow    ); } catch {}

    _ensureLoopState();
  }

  // ───────────────────────── frame loop
  function tick(){
    const s = S(); if (!s) return;
    const now = performance.now()/1000;
    const dt  = Math.min(0.2, Math.max(0, now - ST.lastT));
    ST.lastT = now;

    if (ST.state === "Bloodmoon" && now >= ST.nextLightningAt){
      flashBloodmoon(); scheduleBloodmoonLightning();
    }
    indoorMonitor(dt);
    applyTargets(dt);

    const hw = document.getElementById('hud-weather');
    if (hw) hw.textContent = ST.state + (ST.indoor ? " (Indoor)" : "");
  }

  function hookLoop(){
    const s=S(); if (!s || ST._loopCB) return;
    ST._loopCB = tick;
    s.onBeforeRenderObservable.add(ST._loopCB);
  }

  // ───────────────────────── public API
  window.Weather = {
    init(){
      if (ST.started) return;
      const s=S(), c=cam();
      if (!s || !c){ setTimeout(Weather.init, 100); return; }

      ensureSounds();
      Weather.set(ST.state, { immediate:true });
      hookLoop();
      ST.started = true;
      console.log("[Weather] started:", ST.state);
    },

    set(state, opts={}){
      if (!/^(Clear|Rainstorm|Bloodmoon|Snow)$/.test(state)) return;
      ensureSounds();

      ST.state = state;
      if (typeof opts.intensity === 'number') ST.intensity = clamp(opts.intensity, 0, 1);

      // Assign target volumes for each regime & stop the others hard
      if (state === "Clear"){
        ST.volTarget.ambient = ST.volBase.ambient;
        ST.volTarget.rain    = 0.0;
        ST.volTarget.snow    = 0.0;
        ST.nextLightningAt = Infinity;
      } else if (state === "Rainstorm"){
        ST.volTarget.ambient = 0.0;
        ST.volTarget.rain    = ST.volBase.rain;
        ST.volTarget.snow    = 0.0;
        ST.nextLightningAt = Infinity;
      } else if (state === "Bloodmoon"){
        ST.volTarget.ambient = 0.0;
        ST.volTarget.rain    = ST.volBase.rain;
        ST.volTarget.snow    = 0.0;
        scheduleBloodmoonLightning();
      } else { // Snow
        ST.volTarget.ambient = 0.0;
        ST.volTarget.rain    = 0.0;
        ST.volTarget.snow    = ST.volBase.snow;
        ST.nextLightningAt = Infinity;
      }

      // HUD sync now
      const hw = document.getElementById('hud-weather');
      if (hw) hw.textContent = ST.state + (ST.indoor ? " (Indoor)" : "");

      // Immediate apply? (used on init or indoor flip)
      if (opts.immediate){
        try{
          ensureSounds();
          if (!ST.ready) return;
          const muffle = ST.indoor ? 0.35 : 1.0;

          ST.volNow.ambient = ST.volTarget.ambient;
          ST.volNow.rain    = ST.volTarget.rain * ST.intensity * muffle;
          ST.volNow.snow    = ST.volTarget.snow * ST.intensity * muffle;

          ST.sounds.ambient?.setVolume(ST.volNow.ambient);
          ST.sounds.rain?.setVolume(   ST.volNow.rain);
          ST.sounds.snow?.setVolume(   ST.volNow.snow);

          _ensureLoopState();
        }catch{}
      }
    },

    setIndoor(on){ 
      ST.indoor = !!on; 
      Weather.set(ST.state, { intensity:ST.intensity, immediate:true }); 
    },

    setVolumes(v){
      Object.assign(ST.volBase, {
        ambient: (v.ambient ?? ST.volBase.ambient),
        rain:    (v.rain    ?? ST.volBase.rain),
        snow:    (v.snow    ?? ST.volBase.snow),
        thunder: (v.thunder ?? ST.volBase.thunder),
      });
      Weather.set(ST.state, { intensity:ST.intensity, immediate:true });
    },

    flashNow(){ if (ST.state==="Bloodmoon") { flashBloodmoon(); scheduleBloodmoonLightning(); } },

    isRaining(){ return ST.state === "Rainstorm" || ST.state === "Bloodmoon"; },

    update(){ /* driven by scene onBeforeRender */ },

    debugSet(next){ Weather.set(next, { immediate:true, intensity: ST.intensity }); }
  };

  // Start only after the user clicks Start Investigation — and when scene+camera exist
  window.addEventListener('pp:start', ()=>{
    (function boot(){
      if (!S() || !cam()){ setTimeout(boot, 100); return; }
      ensureSounds();
      // choose initial weather (adjust as desired)
      const r = Math.random();
      // Clear 45%, Rainstorm 35%, Bloodmoon 10%, Snow 10%
      const next = r < 0.45 ? "Clear" : r < 0.80 ? "Rainstorm" : r < 0.90 ? "Bloodmoon" : "Snow";
      Weather.set(next, { immediate:true, intensity: 0.85 });
      Weather.init();
    })();
  });

})();
