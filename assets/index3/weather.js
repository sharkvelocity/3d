// ./assets/index3/weather.js — v2.1
// Weather system with crossfades, indoor muffling, lightning flashes, and optional thunder.
// Keeps your original audio file names and HUD updates.
// Requires: BABYLON, window.scene, window.audioUnlocked

(function(){
  "use strict";

  const lerp = (a,b,t)=> a + (b-a)*Math.max(0, Math.min(1, t));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  const S = {
    state: "Clear",          // "Clear" | "Rainstorm"
    ready: false,
    // sounds
    sounds: { ambient:null, clear:null, rain:null, thunder:[] },
    // target volumes (we interpolate current audio to these)
    volBase: { ambient:0.7, clear:0.25, rain:0.6, thunder:0.9 },
    volTarget: { ambient:0.7, clear:0.0,  rain:0.0, thunder:0.9 },
    // runtime
    indoor: false,           // if true, muffle rain/thunder
    intensity: 1.0,          // 0..1 for rain/thunder strength
    nextLightningAt: 0,      // perf.now()/1000 timestamp for next flash
    lastT: performance.now()/1000,
    boundUpdate: null,
    lightCache: [],
  };

  function ensureSounds(){
    if (S.ready || !window.scene || !window.audioUnlocked) return;
    try {
      S.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", scene, null,
        { loop:true, autoplay:false, volume:S.volBase.ambient, spatialSound:false }
      );
      S.sounds.clear   = new BABYLON.Sound("clear", "./assets/audio/clearWeather.mp3", scene, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false }
      );
      S.sounds.rain    = new BABYLON.Sound("rain", "./assets/audio/rainstorm.mp3", scene, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false }
      );

      // Optional thunders (load if files exist; failures are fine)
      ["thunder1.mp3","thunder2.mp3","thunder3.mp3"].forEach((f,i)=>{
        try {
          const th = new BABYLON.Sound("th"+i, "./assets/audio/"+f, scene, null,
            { loop:false, autoplay:false, volume:S.volBase.thunder, spatialSound:false }
          );
          S.sounds.thunder.push(th);
        } catch(_) {}
      });

      // start ambient immediately (low)
      S.sounds.ambient && S.sounds.ambient.play();

      S.ready = true;
    } catch (e) {
      console.warn("[weather] sound init failed", e);
    }
  }

  function _applyTargets(dt){
    if (!S.ready) return;

    // Compute effective targets, factoring indoor muffling + intensity
    const muffle = S.indoor ? 0.35 : 1.0;   // 35% volume indoors
    const tAmbient = S.volTarget.ambient;   // stays global
    const tClear   = S.volTarget.clear;     // only in Clear
    const tRain    = S.volTarget.rain * S.intensity * muffle;
    const tThunder = S.volTarget.thunder * muffle;

    const k = clamp(dt * 1.5, 0, 1); // fade speed (1.5x per second)

    try {
      if (S.sounds.ambient) S.sounds.ambient.setVolume( lerp(S.sounds.ambient.getVolume(), tAmbient, k) );
      if (S.sounds.clear)   S.sounds.clear.setVolume(   lerp(S.sounds.clear.getVolume(),   tClear,   k) );
      if (S.sounds.rain)    S.sounds.rain.setVolume(    lerp(S.sounds.rain.getVolume(),    tRain,    k) );
      // thunder is one-shot; its volume is set when played
    } catch {}

    // Play/stop loopers according to targets
    try { if (S.sounds.clear && tClear > 0.02 && !S.sounds.clear.isPlaying) S.sounds.clear.play(); } catch {}
    try { if (S.sounds.rain  && tRain  > 0.02 && !S.sounds.rain.isPlaying)  S.sounds.rain.play();  } catch {}
    try { if (S.sounds.rain  && tRain  <= 0.01 && S.sounds.rain.isPlaying)  S.sounds.rain.stop();  } catch {}
    try { if (S.sounds.clear && tClear <= 0.01 && S.sounds.clear.isPlaying) S.sounds.clear.stop(); } catch {}
  }

  function _scheduleLightningSoon(min=7, max=18){
    const now = performance.now()/1000;
    const k = clamp(S.intensity, 0.15, 1); // heavier rain = more frequent
    const delay = lerp(max, min, k) * (0.6 + Math.random()*0.8); // jitter
    S.nextLightningAt = now + delay;
  }

  function _flashLightning(){
    const layer = document.getElementById('flash-overlay');
    if (!layer) return;

    // multi-pulse flash
    const pulses = 1 + (Math.random()<0.6 ? 1 : 0);
    let i = 0;
    const doPulse = () => {
      if (i++ >= pulses) return;
      const alpha = 0.6 + Math.random()*0.35;
      layer.style.opacity = String(alpha);
      setTimeout(()=> layer.style.opacity = '0', 80 + Math.random()*90);

      _flickerNearbyLights(0.5 + Math.random()*0.6);

      // thunder slightly after flash
      setTimeout(_playThunder, 140 + Math.random()*220);

      if (i < pulses) setTimeout(doPulse, 120 + Math.random()*140);
    };
    doPulse();
  }

  function _playThunder(){
    const arr = S.sounds.thunder || [];
    if (!arr.length) return; // optional
    const s = arr[(Math.random()*arr.length)|0];
    try {
      s.setVolume( clamp(S.volBase.thunder * (0.7 + Math.random()*0.5) * (S.indoor?0.6:1.0), 0, 1) );
      s.play();
    } catch {}
  }

  function _flickerNearbyLights(durSec){
    try{
      const sc = scene;
      if (!S.lightCache.length) S.lightCache = (sc.lights||[]).slice();
      // use camera position as reference
      const cam = scene.activeCamera || window.camera;
      const ref = cam?.position || v3(0,0,0);
      const lights = S.lightCache.filter(L=>{
        const p = L.getAbsolutePosition?.() || L.position;
        if (!p) return false;
        return BABYLON.Vector3.Distance(p, ref) <= 16;
      });
      if (!lights.length) return;
      const saved = lights.map(L=>({L, i:L.intensity}));
      const id = setInterval(()=>{
        lights.forEach(({L,i})=> L.intensity = i * (0.7 + Math.random()*0.7));
      }, 40);
      setTimeout(()=>{
        clearInterval(id);
        saved.forEach(({L,i})=> L.intensity = i);
      }, durSec*1000);
    }catch{}
  }

  function _update(dt){
    if (S.state === "Rainstorm"){
      const now = performance.now()/1000;
      if (now >= S.nextLightningAt){
        _flashLightning();
        _scheduleLightningSoon();
      }
    }
    _applyTargets(dt);

    // HUD
    const hw = document.getElementById('hud-weather');
    if (hw) hw.textContent = S.state + (S.indoor ? " (Indoor)" : "");
  }

  function _hookSceneUpdate(){
    if (!scene || S.boundUpdate) return;
    S.boundUpdate = () => {
      const now = performance.now()/1000;
      const dt = Math.min(0.2, Math.max(0, now - S.lastT));
      S.lastT = now;
      _update(dt);
    };
    scene.onBeforeRenderObservable.add(S.boundUpdate);
  }

  // ----- Public API -----
  window.Weather = {
    init(){
      ensureSounds();
      // start in whatever state is set
      Weather.set(S.state, { immediate:true });
      _hookSceneUpdate();
    },
    set(state, opts={}){
      if (state !== "Clear" && state !== "Rainstorm") return;
      S.state = state;

      // options: { intensity, immediate }
      if (typeof opts.intensity === 'number') S.intensity = clamp(opts.intensity, 0, 1);

      if (state === "Clear"){
        S.volTarget.ambient = S.volBase.ambient;
        S.volTarget.clear   = S.volBase.clear;
        S.volTarget.rain    = 0.0;
        _scheduleLightningSoon(999,999); // effectively disable
      } else {
        S.volTarget.ambient = S.volBase.ambient * 0.9; // keep a bit of room tone
        S.volTarget.clear   = 0.0;
        S.volTarget.rain    = S.volBase.rain;
        _scheduleLightningSoon();
      }

      if (opts.immediate && S.ready){
        try{
          S.sounds.ambient?.setVolume(S.volTarget.ambient);
          S.sounds.clear?.setVolume(S.volTarget.clear);
          S.sounds.rain?.setVolume( S.volTarget.rain * (S.indoor?0.35:1.0) * S.intensity );
        }catch{}
      }

      // ensure loopers are running appropriately
      try { if (S.sounds.ambient && !S.sounds.ambient.isPlaying) S.sounds.ambient.play(); } catch {}
      try { if (S.sounds.clear   && S.volTarget.clear>0.02 && !S.sounds.clear.isPlaying) S.sounds.clear.play(); } catch {}
      try { if (S.sounds.rain    && S.volTarget.rain>0.02  && !S.sounds.rain.isPlaying)  S.sounds.rain.play();  } catch {}

      // HUD update
      const hw = document.getElementById('hud-weather');
      if (hw) hw.textContent = S.state + (S.indoor ? " (Indoor)" : "");
    },
    setIndoor(on){
      S.indoor = !!on;
      // targets remain the same; muffling is applied in _applyTargets
    },
    setVolumes(v){
      // v: { ambient?, clear?, rain?, thunder? } in 0..1
      Object.assign(S.volBase, {
        ambient: (v.ambient ?? S.volBase.ambient),
        clear:   (v.clear   ?? S.volBase.clear),
        rain:    (v.rain    ?? S.volBase.rain),
        thunder: (v.thunder ?? S.volBase.thunder),
      });
      // nudge targets to new bases respecting current state
      Weather.set(S.state, { intensity:S.intensity });
    },
    flashNow(){
      if (S.state!=="Rainstorm") return;
      _flashLightning();
      _scheduleLightningSoon(); // schedule the next one anew
    },
    isRaining(){ return S.state === "Rainstorm"; },
    // kept for compatibility with your older code
    update(/*dt*/){ /* no-op: auto-updates via scene hook */ }
  };

  // Auto-init when scene & audio are available
  const boot = setInterval(()=> {
    try {
      if (window.scene && window.audioUnlocked !== undefined){
        clearInterval(boot);
        Weather.init();
      }
    } catch {}
  }, 200);

})();
