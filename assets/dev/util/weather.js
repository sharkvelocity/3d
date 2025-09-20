// ./assets/dev/util/weather.js
// Single source of truth for ambience + weather.
(function () {
  "use strict";

  const lerp  = (a,b,t)=> a + (b-a)*Math.max(0, Math.min(1, t));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const v3    = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  function S() { return window.SCENE || BABYLON.Engine?.LastCreatedScene || null; }
  function cam(){ const s=S(); return s?.activeCamera || window.camera || null; }

  const ST = {
    state: "Clear",
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

    _flashLight: null,
    _flashLayer: null,

    _rainPS: null,
    _snowPS: null,

    _indoorLast: null,
    _indoorAcc: 0,
    _indoorPeriod: 0.5,
  };

  // ───────────────────────── sound setup
  function ensureSounds(){
    if (ST.ready) return;
    const s = S(); if (!s) return;

    try {
      ST.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });
      ST.sounds.rain = new BABYLON.Sound("rain", "./assets/audio/rainstorm.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });
      ST.sounds.snow = new BABYLON.Sound("snow", "./assets/audio/snow.mp3", s, null,
        { loop:true, autoplay:false, volume:0.0, spatialSound:false });
      ["thunder_loud.mp3","thunder_rumble.mp3","thunder.mp3"].forEach((f,i)=>{
        try{
          const th = new BABYLON.Sound("th"+i, "./assets/audio/"+f, s, null,
            { loop:false, autoplay:false, volume:ST.volBase.thunder, spatialSound:false });
          ST.sounds.thunder.push(th);
        }catch(_){}
      });
      ST.ready = true;
    } catch (e) { console.warn("[weather] sound init failed", e); }
  }

  // ───────────────────────── particles
  function disposeParticles(){
    try { ST._rainPS?.dispose(); } catch {}
    try { ST._snowPS?.dispose(); } catch {}
    ST._rainPS = null;
    ST._snowPS = null;
  }

  function spawnRainParticles(){
    const s=S(); if (!s) return;
    disposeParticles();
    const ps = new BABYLON.ParticleSystem("rainPS", 4000, s);
    ps.particleTexture = new BABYLON.Texture("./assets/textures/raindrop.png", s);
    ps.minEmitBox = new BABYLON.Vector3(-50, 40, -50);
    ps.maxEmitBox = new BABYLON.Vector3( 50, 40,  50);
    ps.emitRate = 3500;
    ps.minSize = 0.05; ps.maxSize = 0.15;
    ps.minLifeTime = 0.8; ps.maxLifeTime = 1.2;
    ps.color1 = new BABYLON.Color4(0.7,0.7,1.0,0.7);
    ps.color2 = new BABYLON.Color4(0.7,0.7,1.0,0.7);
    ps.direction1 = new BABYLON.Vector3(0, -1, 0);
    ps.direction2 = new BABYLON.Vector3(0, -1, 0);
    ps.minEmitPower = 18; ps.maxEmitPower = 22;
    ps.updateSpeed = 0.01;
    ps.start(); ST._rainPS = ps;
  }

  function spawnSnowParticles(){
    const s=S(); if (!s) return;
    disposeParticles();
    const ps = new BABYLON.ParticleSystem("snowPS", 3000, s);
    ps.particleTexture = new BABYLON.Texture("./assets/textures/snowflake.png", s);
    ps.minEmitBox = new BABYLON.Vector3(-50, 40, -50);
    ps.maxEmitBox = new BABYLON.Vector3( 50, 40,  50);
    ps.emitRate = 2000;
    ps.minSize = 0.2; ps.maxSize = 0.4;
    ps.minLifeTime = 2.5; ps.maxLifeTime = 4.0;
    ps.color1 = new BABYLON.Color4(1,1,1,0.9);
    ps.color2 = new BABYLON.Color4(1,1,1,0.9);
    ps.direction1 = new BABYLON.Vector3(-0.1,-1,-0.1);
    ps.direction2 = new BABYLON.Vector3( 0.1,-1, 0.1);
    ps.minEmitPower = 1; ps.maxEmitPower = 2;
    ps.updateSpeed = 0.02;
    ps.start(); ST._snowPS = ps;
  }

  // ───────────────────────── lightning
  function scheduleBloodmoonLightning(){
    const now = performance.now()/1000;
    const min = 18, max = 42;
    const delay = (min + Math.random()*(max-min)) * (0.85 + Math.random()*0.3);
    ST.nextLightningAt = now + delay;
  }

  function flashBloodmoon(){
    const s = S(); if (!s) return;
    if (!ST._flashLayer){
      const layer = document.createElement('div');
      layer.id = 'flash-overlay-blood';
      Object.assign(layer.style, { position:'fixed', inset:'0', pointerEvents:'none', background:'#f003', opacity:'0', transition:'opacity 80ms linear', zIndex:'5000' });
      document.body.appendChild(layer); ST._flashLayer = layer;
    }

    const c = cam();
    const camPos  = c?.globalPosition || c?.position || v3(0,1.7,0);
    const forward = c?.getDirection ? c.getDirection(BABYLON.Vector3.Forward()) : v3(0,0,1);
    const up = v3(0,1,0); const right = BABYLON.Vector3.Cross(forward, up).normalize();
    const az = Math.random()*Math.PI*2;
    const dist = 120 + Math.random()*100;
    const dir2D = forward.scale(Math.cos(az)).add(right.scale(Math.sin(az))).normalize();
    const pos = camPos.add(dir2D.scale(dist)).add(v3(0, 12 + Math.random()*8, 0));

    if (!ST._flashLight || ST._flashLight.isDisposed()){
      ST._flashLight = new BABYLON.PointLight("blood_flash", pos, s);
      ST._flashLight.range = 250;
      ST._flashLight.diffuse = new BABYLON.Color3(0.8, 0.1, 0.1);
      ST._flashLight.specular = ST._flashLight.diffuse;
      ST._flashLight.intensity = 0.0;
    } else { ST._flashLight.position.copyFrom(pos); }

    const pulses = 1 + (Math.random()<0.4 ? 1 : 0);
    let i = 0;
    const doPulse = () => {
      if (i++ >= pulses) return;
      ST._flashLayer.style.opacity = '0.18';
      setTimeout(()=> ST._flashLayer.style.opacity = '0', 100 + Math.random()*60);
      ST._flashLight.intensity = 0.6 + Math.random()*0.4;
      setTimeout(()=> ST._flashLight.intensity = 0, 120 + Math.random()*80);
      setTimeout(playThunder, 1200 + Math.random()*2300);
      if (i < pulses) setTimeout(doPulse, 100 + Math.random()*140);
    }; doPulse();
  }

  function playThunder(){
    const arr = ST.sounds.thunder || [];
    if (!arr.length) return;
    const pick = Math.random();
    const snd = pick < 0.2 ? arr[0] : pick < 0.7 ? arr[1] : arr[2];
    try { snd.setVolume(clamp(ST.volBase.thunder * (ST.indoor?0.55:1) * (0.75 + Math.random()*0.35), 0,1)); snd.play(); } catch {}
  }

  // ───────────────────────── indoor detection
  function isIndoorAt(pos){
    const s = S(); if (!s || !pos) return false;
    try{
      const V = window.PP?.CONFIG?.VAN;
      if (V && V.POSITION && typeof V.RADIUS === 'number') {
        if (BABYLON.Vector3.Distance(pos, V.POSITION) <= (V.RADIUS + 1.0)) return false;
      }
    } catch {}
    const from = v3(pos.x,pos.y+0.5,pos.z);
    const ray  = new BABYLON.Ray(from,v3(0,1,0),12);
    const hit  = s.pickWithRay(ray,m=>{
      if (!m) return false;
      if (m.isPickable === false) return false;
      if (m.metadata?.isRoof || m.metadata?.isCeiling) return true;
      return /roof|ceiling|attic|upper|secondfloor/.test((m.name||'').toLowerCase());
    });
    return !!(hit && hit.hit);
  }

  function indoorMonitor(dt){
    ST._indoorAcc += dt;
    if (ST._indoorAcc < ST._indoorPeriod) return;
    ST._indoorAcc = 0;
    const c = cam(); const p = c?.position; if (!p) return;
    const isIn = isIndoorAt(p);
    if (isIn !== ST._indoorLast){
      ST._indoorLast = isIn; ST.indoor = isIn;
      Weather.set(ST.state, { intensity:ST.intensity, immediate:true });
    }
  }

  // ───────────────────────── crossfade + loop control
  function _ensureLoopState(){
    try {
      const tA=ST.volTarget.ambient, tR=ST.volTarget.rain, tS=ST.volTarget.snow;
      if(ST.sounds.ambient){ if(tA>0.02 && !ST.sounds.ambient.isPlaying) ST.sounds.ambient.play(); if(tA<=0.01 && ST.sounds.ambient.isPlaying) ST.sounds.ambient.stop(); }
      if(ST.sounds.rain){ if(tR>0.02 && !ST.sounds.rain.isPlaying) ST.sounds.rain.play(); if(tR<=0.01 && ST.sounds.rain.isPlaying) ST.sounds.rain.stop(); }
      if(ST.sounds.snow){ if(tS>0.02 && !ST.sounds.snow.isPlaying) ST.sounds.snow.play(); if(tS<=0.01 && ST.sounds.snow.isPlaying) ST.sounds.snow.stop(); }
    } catch {}
  }

  function applyTargets(dt){
    if(!ST.ready) return;
    const k = clamp(dt*1.5,0,1);
    const muffle = ST.indoor?0.35:1.0;
    const tAmbient = ST.volTarget.ambient;
    const tRain = ST.volTarget.rain * ST.intensity * muffle;
    const tSnow = ST.volTarget.snow * ST.intensity * muffle;

    ST.volNow.ambient = lerp(ST.volNow.ambient, tAmbient, k);
    ST.volNow.rain = lerp(ST.volNow.rain, tRain, k);
    ST.volNow.snow = lerp(ST.volNow.snow, tSnow, k);

    try { ST.sounds.ambient?.setVolume(ST.volNow.ambient); } catch {}
    try { ST.sounds.rain?.setVolume(ST.volNow.rain); } catch {}
    try { ST.sounds.snow?.setVolume(ST.volNow.snow); } catch {}

    _ensureLoopState();
  }

  // ───────────────────────── frame loop
  function tick(){
    const s = S(); if(!s) return;
    const now = performance.now()/1000;
    const dt = Math.min(0.2, Math.max(0, now-ST.lastT));
    ST.lastT = now;
    if(ST.state==="Bloodmoon" && now>=ST.nextLightningAt){ flashBloodmoon(); scheduleBloodmoonLightning(); }
    indoorMonitor(dt); applyTargets(dt);
    const hw=document.getElementById('hud-weather');
    if(hw) hw.textContent=ST.state + (ST.indoor ? " (Indoor)" : "");
  }

  function hookLoop(){
    const s=S(); if(!s||ST._loopCB) return;
    ST._loopCB=tick;
    s.onBeforeRenderObservable.add(ST._loopCB);
  }

  // ───────────────────────── public API
  window.Weather = {
    init(){
      if(ST.started) return;
      const s=S(), c=cam();
      if(!s||!c){ setTimeout(Weather.init,100); return; }
      ensureSounds();
      Weather.set(ST.state,{immediate:true});
      hookLoop(); ST.started=true; console.log("[Weather] started:",ST.state);
    },

    set(state, opts={}){
      if(!/^(Clear|Rainstorm|Bloodmoon|Snow)$/.test(state)) return;
      ensureSounds();
      ST.state=state;
      if(typeof opts.intensity==='number') ST.intensity=clamp(opts.intensity,0,1);
      disposeParticles();

      if(state==="Clear"){ ST.volTarget.ambient=ST.volBase.ambient; ST.volTarget.rain=0; ST.volTarget.snow=0; ST.nextLightningAt=Infinity; }
      else if(state==="Rainstorm"){ ST.volTarget.ambient=0; ST.volTarget.rain=ST.volBase.rain; ST.volTarget.snow=0; ST.nextLightningAt=Infinity; spawnRainParticles(); }
      else if(state==="Bloodmoon"){ ST.volTarget.ambient=0; ST.volTarget.rain=ST.volBase.rain; ST.volTarget.snow=0; scheduleBloodmoonLightning(); spawnRainParticles(); }
      else{ ST.volTarget.ambient=0; ST.volTarget.rain=0; ST.volTarget.snow=ST.volBase.snow; ST.nextLightningAt=Infinity; spawnSnowParticles(); }

      const hw=document.getElementById('hud-weather'); if(hw) hw.textContent=ST.state + (ST.indoor ? " (Indoor)" : "");

      if(opts.immediate){
        try{
          ensureSounds(); if(!ST.ready) return;
          const muffle=ST.indoor?0.35:1.0;
          ST.volNow.ambient=ST.volTarget.ambient;
          ST.volNow.rain=ST.volTarget.rain*ST.intensity*muffle;
          ST.volNow.snow=ST.volTarget.snow*ST.intensity*muffle;
          ST.sounds.ambient?.setVolume(ST.volNow.ambient);
          ST.sounds.rain?.setVolume(ST.volNow.rain);
          ST.sounds.snow?.setVolume(ST.volNow.snow);
          _ensureLoopState();
        }catch{}
      }
    },

    setIndoor(on){ ST.indoor=!!on; Weather.set(ST.state,{intensity:ST.intensity, immediate:true}); },
    setVolumes(v){ Object.assign(ST.volBase,{ ambient:v.ambient??ST.volBase.ambient, rain:v.rain??ST.volBase.rain, snow:v.snow??ST.volBase.snow, thunder:v.thunder??ST.volBase.thunder }); Weather.set(ST.state,{intensity:ST.intensity, immediate:true}); },
    dispose(){
      try{ ST.sounds.ambient?.stop(); ST.sounds.rain?.stop(); ST.sounds.snow?.stop(); ST.sounds.thunder.forEach(s=>s.stop()); } catch {}
      disposeParticles();
      if(ST._flashLight && !ST._flashLight.isDisposed()) ST._flashLight.dispose();
      if(ST._flashLayer){ try{ST._flashLayer.remove();}catch{} ST._flashLayer=null; }
      if(ST._loopCB){ const s=S(); if(s?.onBeforeRenderObservable) s.onBeforeRenderObservable.removeCallback(ST._loopCB); ST._loopCB=null; }
      ST.started=false; ST.ready=false; console.log("[Weather] disposed");
    }
  };

})();
