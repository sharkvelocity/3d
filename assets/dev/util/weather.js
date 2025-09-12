// ./assets/dev/util/weather.js
// Single source of truth for ambience + weather.
// Clear = crickets ambient only. Rainstorm = rain only. Bloodmoon = rain + distant red lightning + delayed thunder. Snow = snow only.
(function(){
  "use strict";
  const lerp = (a,b,t)=> a + (b-a)*Math.max(0, Math.min(1, t));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  const S = {
    state: "Clear",          // "Clear" | "Rainstorm" | "Bloodmoon" | "Snow"
    ready: false,
    sounds: { ambient:null, rain:null, snow:null, thunder:[] },
    volBase: { ambient:0.7, rain:0.65, snow:0.5, thunder:0.9 },
    volTarget: { ambient:0.0, rain:0.0, snow:0.0 },
    indoor: false,
    intensity: 1.0,
    nextLightningAt: Infinity,
    lastT: performance.now()/1000,
    boundUpdate: null,

    // FX caches
    _flashLight: null,
    _flashLayer: null,

    // indoor detect
    _indoorLast: null,
    _indoorAcc: 0,
    _indoorPeriod: 0.5, // s
  };

  function scn(){ return window.SCENE || BABYLON.Engine?.LastCreatedScene || null; }

  function ensureSounds(){
    if (S.ready || !scn()) return;
    const s = scn();
    try {
      // CLEAR ambient bed (crickets) — ONLY for Clear
      S.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });

      // Weather loops
      S.sounds.rain = new BABYLON.Sound("rain", "./assets/audio/rainstorm.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });
      S.sounds.snow = new BABYLON.Sound("snow", "./assets/audio/snow.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });

      // Thunder palette (Bloodmoon only)
      ["thunder_loud.mp3","thunder_rumble.mp3","thunder.mp3"].forEach((f,i)=>{
        try{
          const th = new BABYLON.Sound("th"+i, "./assets/audio/"+f, s, null,
            { loop:false, autoplay:false, volume:S.volBase.thunder, spatialSound:false });
          S.sounds.thunder.push(th);
        }catch(_){}
      });

      S.ready = true;
    } catch (e) { console.warn("[weather] sound init failed", e); }
  }

  // ────────── Lightning (Bloodmoon) ──────────
  function scheduleBloodmoonLightning(){
    const now = performance.now()/1000;
    const min = 18, max = 42;
    const delay = (min + Math.random()*(max-min)) * (0.85 + Math.random()*0.3);
    S.nextLightningAt = now + delay;
  }

  function flashBloodmoon(){
    const s = scn(); if (!s) return;

    // subtle red overlay (created once)
    if (!S._flashLayer){
      const layer = document.createElement('div');
      layer.id = 'flash-overlay-blood';
      Object.assign(layer.style, {
        position:'fixed', inset:'0', pointerEvents:'none', background:'#f003',
        opacity:'0', transition:'opacity 80ms linear', zIndex:'5000'
      });
      document.body.appendChild(layer);
      S._flashLayer = layer;
    }

    // distant red point light
    const cam = s.activeCamera || window.camera;
    const camPos = cam?.globalPosition || cam?.position || v3(0,1.7,0);
    const forward = cam?.getDirection ? cam.getDirection(BABYLON.Vector3.Forward()) : new BABYLON.Vector3(0,0,1);
    const up = BABYLON.Vector3.Up();
    const right = BABYLON.Vector3.Cross(forward, up).normalize();
    const az = Math.random()*Math.PI*2;
    const dist = 120 + Math.random()*100;   // 120–220m
    const dir2D = forward.scale(Math.cos(az)).add(right.scale(Math.sin(az))).normalize();
    const pos = camPos.add(dir2D.scale(dist)).add(new BABYLON.Vector3(0, 12 + Math.random()*8, 0));

    if (!S._flashLight || S._flashLight.isDisposed()){
      S._flashLight = new BABYLON.PointLight("blood_flash", pos, s);
      S._flashLight.range = 250;
      S._flashLight.diffuse = new BABYLON.Color3(0.8, 0.1, 0.1);
      S._flashLight.specular = S._flashLight.diffuse;
      S._flashLight.intensity = 0.0;
    } else {
      S._flashLight.position.copyFrom(pos);
      S._flashLight.diffuse.set(0.8,0.1,0.1);
      S._flashLight.specular.set(0.8,0.1,0.1);
    }

    // 1–2 very dim pulses + red overlay
    const pulses = 1 + (Math.random()<0.4 ? 1 : 0);
    let i = 0;
    const doPulse = () => {
      if (i++ >= pulses) return;

      S._flashLayer.style.opacity = '0.18';
      setTimeout(()=> S._flashLayer.style.opacity = '0', 100 + Math.random()*60);

      const target = 0.6 + Math.random()*0.4;
      S._flashLight.intensity = target;
      setTimeout(()=>{ S._flashLight.intensity = 0; }, 120 + Math.random()*80);

      // delayed thunder (simulate distance): 1.2–3.5s
      const thunderDelay = 1200 + Math.random()*2300;
      setTimeout(playThunder, thunderDelay);

      if (i < pulses) setTimeout(doPulse, 100 + Math.random()*140);
    };
    doPulse();
  }

  function playThunder(){
    const arr = S.sounds.thunder || [];
    if (!arr.length) return;
    const pick = Math.random();
    const snd = pick < 0.2 ? arr[0] : pick < 0.7 ? arr[1] : arr[2];
    try {
      const base = S.volBase.thunder * (S.indoor ? 0.55 : 1.0);
      snd.setVolume( clamp(base * (0.75 + Math.random()*0.35), 0, 1) );
      snd.play();
    } catch {}
  }
  // ───────────────────────────────────────────

  function applyTargets(dt){
    if (!S.ready) return;
    const muffle = S.indoor ? 0.35 : 1.0;
    const k = clamp(dt * 1.5, 0, 1);
    const tAmbient = S.volTarget.ambient;
    const tRain    = S.volTarget.rain * S.intensity * muffle;
    const tSnow    = S.volTarget.snow * S.intensity * muffle;

    try {
      S.sounds.ambient?.setVolume( lerp(S.sounds.ambient.getVolume(), tAmbient, k) );
      S.sounds.rain?.setVolume(    lerp(S.sounds.rain.getVolume(),    tRain,    k) );
      S.sounds.snow?.setVolume(    lerp(S.sounds.snow.getVolume(),    tSnow,    k) );
    } catch {}

    try { if (S.sounds.ambient && tAmbient > 0.02 && !S.sounds.ambient.isPlaying) S.sounds.ambient.play(); } catch {}
    try { if (S.sounds.rain    && tRain    > 0.02 && !S.sounds.rain.isPlaying)    S.sounds.rain.play();    } catch {}
    try { if (S.sounds.snow    && tSnow    > 0.02 && !S.sounds.snow.isPlaying)    S.sounds.snow.play();    } catch {}

    try { if (S.sounds.ambient && tAmbient <= 0.01 && S.sounds.ambient.isPlaying) S.sounds.ambient.stop(); } catch {}
    try { if (S.sounds.rain    && tRain    <= 0.01 && S.sounds.rain.isPlaying)    S.sounds.rain.stop();    } catch {}
    try { if (S.sounds.snow    && tSnow    <= 0.01 && S.sounds.snow.isPlaying)    S.sounds.snow.stop();    } catch {}
  }

  function update(dt){
    if (S.state === "Bloodmoon"){
      const now = performance.now()/1000;
      if (now >= S.nextLightningAt){ flashBloodmoon(); scheduleBloodmoonLightning(); }
    }
    indoorMonitor(dt);
    applyTargets(dt);
    const hw = document.getElementById('hud-weather');
    if (hw) hw.textContent = S.state + (S.indoor ? " (Indoor)" : "");
  }

  function hookSceneUpdate(){
    const s = scn(); if (!s || S.boundUpdate) return;
    S.boundUpdate = () => {
      const now = performance.now()/1000;
      const dt = Math.min(0.2, Math.max(0, now - S.lastT));
      S.lastT = now;
      update(dt);
    };
    s.onBeforeRenderObservable.add(S.boundUpdate);
  }

  // ────────── Indoor / Outdoor detection ──────────
  function isIndoorAt(pos){
    const s = scn(); if (!s || !pos) return false;
    // Van zone override → outdoor
    try{
      const V = window.PP?.CONFIG?.VAN;
      if (V && V.POSITION && typeof V.RADIUS === 'number') {
        if (BABYLON.Vector3.Distance(pos, V.POSITION) <= (V.RADIUS + 1.0)) return false;
      }
    } catch {}

    // Upward ray: hit a roof/ceiling? then indoor
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
    S._indoorAcc += dt;
    if (S._indoorAcc < S._indoorPeriod) return;
    S._indoorAcc = 0;

    const s = scn();
    const cam = s?.activeCamera || window.camera;
    const p = cam?.position;
    if (!p) return;

    const isIn = isIndoorAt(p);
    if (isIn !== S._indoorLast){
      S._indoorLast = isIn;
      S.indoor = isIn;
      Weather.set(S.state, { intensity:S.intensity }); // reapply volumes
    }
  }
  // ────────────────────────────────────────────────

  // Public API
  window.Weather = {
    init(){
      ensureSounds();
      Weather.set(S.state, { immediate:true });
      hookSceneUpdate();
    },
    set(state, opts={}){
      if (!/^(Clear|Rainstorm|Bloodmoon|Snow)$/.test(state)) return;
      S.state = state;
      if (typeof opts.intensity === 'number') S.intensity = clamp(opts.intensity, 0, 1);

      if (state === "Clear"){
        S.volTarget.ambient = S.volBase.ambient;  // ON
        S.volTarget.rain    = 0.0;
        S.volTarget.snow    = 0.0;
        S.nextLightningAt = Infinity;
      } else if (state === "Rainstorm"){
        S.volTarget.ambient = 0.0;
        S.volTarget.rain    = S.volBase.rain;     // rain only
        S.volTarget.snow    = 0.0;
        S.nextLightningAt = Infinity;             // no lightning
      } else if (state === "Bloodmoon"){
        S.volTarget.ambient = 0.0;
        S.volTarget.rain    = S.volBase.rain;     // rain + lightning
        S.volTarget.snow    = 0.0;
        scheduleBloodmoonLightning();
      } else { // Snow
        S.volTarget.ambient = 0.0;
        S.volTarget.rain    = 0.0;
        S.volTarget.snow    = S.volBase.snow;     // snow only
        S.nextLightningAt = Infinity;             // no lightning
      }

      const hw = document.getElementById('hud-weather');
      if (hw) hw.textContent = S.state + (S.indoor ? " (Indoor)" : "");

      if (opts.immediate){
        try{
          ensureSounds();
          if (!S.ready) return;
          const muffle = S.indoor ? 0.35 : 1.0;
          S.sounds.ambient?.setVolume(S.volTarget.ambient);
          S.sounds.rain?.setVolume(S.volTarget.rain * S.intensity * muffle);
          S.sounds.snow?.setVolume(S.volTarget.snow * S.intensity * muffle);

          // start/stop loops immediately
          if (S.volTarget.ambient > 0.02 && !S.sounds.ambient.isPlaying) S.sounds.ambient.play();
          else if (S.volTarget.ambient <= 0.01 && S.sounds.ambient?.isPlaying) S.sounds.ambient.stop();

          if (S.volTarget.rain > 0.02 && !S.sounds.rain.isPlaying) S.sounds.rain.play();
          else if (S.volTarget.rain <= 0.01 && S.sounds.rain?.isPlaying) S.sounds.rain.stop();

          if (S.volTarget.snow > 0.02 && !S.sounds.snow.isPlaying) S.sounds.snow.play();
          else if (S.volTarget.snow <= 0.01 && S.sounds.snow?.isPlaying) S.sounds.snow.stop();
        }catch{}
      }
    },
    setIndoor(on){ S.indoor = !!on; Weather.set(S.state, { intensity:S.intensity }); },
    setVolumes(v){
      Object.assign(S.volBase, {
        ambient: (v.ambient ?? S.volBase.ambient),
        rain:    (v.rain    ?? S.volBase.rain),
        snow:    (v.snow    ?? S.volBase.snow),
        thunder: (v.thunder ?? S.volBase.thunder),
      });
      Weather.set(S.state, { intensity:S.intensity });
    },
    flashNow(){ if (S.state==="Bloodmoon") { flashBloodmoon(); scheduleBloodmoonLightning(); } },
    isRaining(){ return S.state === "Rainstorm" || S.state === "Bloodmoon"; },
    update(){ /* driven by scene */ }
  };

  // Start only after the user clicks Start Investigation
  window.addEventListener('pp:start', ()=>{
    const boot = () => {
      if (!scn()) return setTimeout(boot, 100);
      ensureSounds();
      // choose initial weather (adjust/override as needed)
      const r = Math.random();
      // Clear 45%, Rainstorm 35%, Bloodmoon 10%, Snow 10%
      const next = r < 0.45 ? "Clear" : r < 0.80 ? "Rainstorm" : r < 0.90 ? "Bloodmoon" : "Snow";
      Weather.set(next, { immediate:true, intensity: 0.85 });
      Weather.init();
      console.log("[Weather] started:", next);
    };
    boot();
  });
})();