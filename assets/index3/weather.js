// ./assets/index3/weather.js — v2.4 (adds "Snow" using snow.mp3)
// States: "Clear" | "Rainstorm" | "Snow"
// Crossfades, indoor muffling, lightning (rain only), optional thunder.
//
// Optional remap BEFORE this script (filenames in ./assets/audio/):
// <script>
//   window.WEATHER_AUDIO_MAP = {
//     ambient:'ambient.mp3',
//     clear:'clearWeather.mp3',
//     rain:'rainstorm.mp3',
//     snow:'snow.mp3',
//     thunder:['thunder.mp3'] // or multiple: ['thunder1.mp3','thunder2.mp3']
//   };
// </script>

(function(){
  "use strict";
  const lerp=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const v3=(x,y,z)=>new BABYLON.Vector3(x,y,z);

  // Default file map (can be overridden via window.WEATHER_AUDIO_MAP)
  const MAP = Object.assign({
    ambient:'ambient.mp3',
    clear:'clearWeather.mp3',
    rain:'rainstorm.mp3',
    snow:'snow.mp3',
    thunder:['thunder.mp3','thunder1.mp3','thunder2.mp3','thunder3.mp3'] // optional
  }, (window.WEATHER_AUDIO_MAP||{}));

  const S = {
    state: "Clear",    // "Clear" | "Rainstorm" | "Snow"
    ready:false,
    sounds:{ ambient:null, clear:null, rain:null, snow:null, thunder:[] },
    // base volumes (tweakable via Weather.setVolumes)
    volBase:{ ambient:0.7, clear:0.25, rain:0.6, snow:0.55, thunder:0.9 },
    // target mix (we crossfade actual players toward these)
    volTarget:{ ambient:0.7, clear:0.0, rain:0.0, snow:0.0, thunder:0.9 },
    indoor:false,      // muffles rain/snow/thunder
    intensity:1.0,     // scales rain/snow (0..1)
    nextLightningAt:0,
    lastT: performance.now()/1000,
    boundUpdate:null,
    lightCache:[]
  };

  function ensureSounds(){
    if (S.ready || !window.scene || !window.audioUnlocked) return;
    try{
      const path=f=>`./assets/audio/${f}`;
      S.sounds.ambient = new BABYLON.Sound("amb",   path(MAP.ambient), scene, null, {loop:true,autoplay:false,volume:S.volBase.ambient,spatialSound:false});
      S.sounds.clear   = new BABYLON.Sound("clear", path(MAP.clear),   scene, null, {loop:true,autoplay:false,volume:0.0,               spatialSound:false});
      S.sounds.rain    = new BABYLON.Sound("rain",  path(MAP.rain),    scene, null, {loop:true,autoplay:false,volume:0.0,               spatialSound:false});
      S.sounds.snow    = new BABYLON.Sound("snow",  path(MAP.snow),    scene, null, {loop:true,autoplay:false,volume:0.0,               spatialSound:false});
      (MAP.thunder||[]).forEach((f,i)=>{
        if(!f) return;
        try{
          const th=new BABYLON.Sound(`th${i}`, path(f), scene, null, {loop:false,autoplay:false,volume:S.volBase.thunder,spatialSound:false});
          S.sounds.thunder.push(th);
        }catch(_){}
      });
      S.sounds.ambient && S.sounds.ambient.play();
      S.ready=true;
    }catch(e){ console.warn("[weather] sound init failed", e); }
  }

  function _applyTargets(dt){
    if(!S.ready) return;
    const muffle = S.indoor ? 0.35 : 1.0;
    const tAmb   = S.volTarget.ambient;
    const tClr   = S.volTarget.clear;
    const tRain  = S.volTarget.rain * S.intensity * muffle;
    const tSnow  = S.volTarget.snow * S.intensity * muffle;
    const k = clamp(dt*1.5, 0, 1);

    try{
      if(S.sounds.ambient) S.sounds.ambient.setVolume( lerp(S.sounds.ambient.getVolume(), tAmb,  k) );
      if(S.sounds.clear)   S.sounds.clear.setVolume(   lerp(S.sounds.clear.getVolume(),   tClr,  k) );
      if(S.sounds.rain)    S.sounds.rain.setVolume(    lerp(S.sounds.rain.getVolume(),    tRain, k) );
      if(S.sounds.snow)    S.sounds.snow.setVolume(    lerp(S.sounds.snow.getVolume(),    tSnow, k) );
    }catch{}

    // manage loopers
    try { if(S.sounds.clear && tClr  > 0.02 && !S.sounds.clear.isPlaying) S.sounds.clear.play(); } catch {}
    try { if(S.sounds.rain  && tRain > 0.02 && !S.sounds.rain.isPlaying)  S.sounds.rain.play();  } catch {}
    try { if(S.sounds.snow  && tSnow > 0.02 && !S.sounds.snow.isPlaying)  S.sounds.snow.play();  } catch {}
    try { if(S.sounds.rain  && tRain <= 0.01 && S.sounds.rain.isPlaying)  S.sounds.rain.stop();  } catch {}
    try { if(S.sounds.snow  && tSnow <= 0.01 && S.sounds.snow.isPlaying)  S.sounds.snow.stop();  } catch {}
    try { if(S.sounds.clear && tClr  <= 0.01 && S.sounds.clear.isPlaying) S.sounds.clear.stop(); } catch {}
  }

  function _scheduleLightningSoon(min=7,max=18){
    const now=performance.now()/1000;
    const k=clamp(S.intensity,0.15,1);
    const delay=(min+Math.random()*(max-min))*(0.6+Math.random()*0.8);
    S.nextLightningAt = now + delay;
  }

  function _flashLightning(){
    const layer=document.getElementById('flash-overlay');
    if(!layer) return;
    const pulses=1+(Math.random()<0.6?1:0);
    let i=0;
    const doPulse=()=>{
      if(i++>=pulses) return;
      const alpha=0.6+Math.random()*0.35;
      layer.style.opacity=String(alpha);
      setTimeout(()=>layer.style.opacity='0', 80+Math.random()*90);
      _flickerNearbyLights(0.5+Math.random()*0.6);
      setTimeout(_playThunder, 140+Math.random()*220);
      if(i<pulses) setTimeout(doPulse, 120+Math.random()*140);
    };
    doPulse();
  }

  function _playThunder(){
    const list=S.sounds.thunder||[];
    if(!list.length) return;
    const s=list[(Math.random()*list.length)|0];
    try{
      const vol=clamp(S.volBase.thunder*(0.7+Math.random()*0.5)*(S.indoor?0.6:1.0),0,1);
      s.setVolume(vol); s.play();
    }catch{}
  }

  function _flickerNearbyLights(dSec){
    try{
      const sc=scene;
      if(!S.lightCache.length) S.lightCache=(sc.lights||[]).slice();
      const cam=sc.activeCamera||window.camera;
      const ref=cam?.position||v3(0,0,0);
      const lights=S.lightCache.filter(L=>{
        const p=L.getAbsolutePosition?.()||L.position;
        return p && BABYLON.Vector3.Distance(p,ref)<=16;
      });
      if(!lights.length) return;
      const saved=lights.map(L=>({L,i:L.intensity}));
      const id=setInterval(()=>{ lights.forEach(({L,i})=> L.intensity=i*(0.7+Math.random()*0.7)); },40);
      setTimeout(()=>{ clearInterval(id); saved.forEach(({L,i})=> L.intensity=i); }, dSec*1000);
    }catch{}
  }

  function _update(dt){
    if(S.state==="Rainstorm"){
      const now=performance.now()/1000;
      if(now>=S.nextLightningAt){ _flashLightning(); _scheduleLightningSoon(); }
    }
    _applyTargets(dt);
    const hw=document.getElementById('hud-weather');
    if(hw) hw.textContent = S.state + (S.indoor?" (Indoor)":"");
  }

  function _hookSceneUpdate(){
    if(!scene || S.boundUpdate) return;
    S.boundUpdate=()=>{
      const now=performance.now()/1000;
      const dt=Math.min(0.2, Math.max(0, now-S.lastT));
      S.lastT=now;
      _update(dt);
    };
    scene.onBeforeRenderObservable.add(S.boundUpdate);
  }

  // Public API
  window.Weather = {
    init(){
      ensureSounds();
      Weather.set(S.state, { immediate:true });
      _hookSceneUpdate();
    },
    set(state, opts={}){
      if (state!=="Clear" && state!=="Rainstorm" && state!=="Snow") return;
      S.state = state;
      if (typeof opts.intensity==='number') S.intensity = clamp(opts.intensity,0,1);

      if (state==="Clear"){
        S.volTarget.ambient = S.volBase.ambient;
        S.volTarget.clear   = S.volBase.clear;
        S.volTarget.rain    = 0.0;
        S.volTarget.snow    = 0.0;
        _scheduleLightningSoon(999,999); // disable
      }
      else if (state==="Rainstorm"){
        S.volTarget.ambient = S.volBase.ambient*0.9;
        S.volTarget.clear   = 0.0;
        S.volTarget.rain    = S.volBase.rain;
        S.volTarget.snow    = 0.0;
        _scheduleLightningSoon();
      }
      else if (state==="Snow"){
        S.volTarget.ambient = S.volBase.ambient*0.95; // a touch of room tone
        S.volTarget.clear   = 0.0;
        S.volTarget.rain    = 0.0;
        S.volTarget.snow    = S.volBase.snow;
        _scheduleLightningSoon(999,999); // no lightning for snow by default
      }

      if (opts.immediate && S.ready){
        try{
          S.sounds.ambient?.setVolume(S.volTarget.ambient);
          S.sounds.clear?.setVolume(S.volTarget.clear);
          S.sounds.rain?.setVolume( S.volTarget.rain * (S.indoor?0.35:1.0) * S.intensity );
          S.sounds.snow?.setVolume( S.volTarget.snow * (S.indoor?0.35:1.0) * S.intensity );
        }catch{}
      }

      try { if (S.sounds.ambient && !S.sounds.ambient.isPlaying) S.sounds.ambient.play(); } catch {}
      try { if (S.sounds.clear   && S.volTarget.clear>0.02 && !S.sounds.clear.isPlaying) S.sounds.clear.play(); } catch {}
      try { if (S.sounds.rain    && S.volTarget.rain>0.02  && !S.sounds.rain.isPlaying)  S.sounds.rain.play();  } catch {}
      try { if (S.sounds.snow    && S.volTarget.snow>0.02  && !S.sounds.snow.isPlaying)  S.sounds.snow.play();  } catch {}

      const hw=document.getElementById('hud-weather');
      if(hw) hw.textContent = S.state + (S.indoor?" (Indoor)":"");
    },
    setIndoor(on){ S.indoor=!!on; },
    setVolumes(v){
      Object.assign(S.volBase, {
        ambient:(v.ambient ?? S.volBase.ambient),
        clear:(v.clear ?? S.volBase.clear),
        rain:(v.rain ?? S.volBase.rain),
        snow:(v.snow ?? S.volBase.snow),
        thunder:(v.thunder ?? S.volBase.thunder),
      });
      Weather.set(S.state, { intensity:S.intensity });
    },
    flashNow(){
      if (S.state!=="Rainstorm") return;
      _flashLightning();
      _scheduleLightningSoon();
    },
    isRaining(){ return S.state==="Rainstorm"; },
    isSnowing(){ return S.state==="Snow"; },
    update(){ /* no-op: hooked to scene */ }
  };

  // Auto-init
  const boot=setInterval(()=>{ try{
    if(window.scene && window.audioUnlocked !== undefined){
      clearInterval(boot); Weather.init();
    }
  }catch{} },200);

})();
