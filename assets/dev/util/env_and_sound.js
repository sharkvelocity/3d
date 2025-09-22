// ./assets/dev/util/weather_combined.js
(function(){
  "use strict";

  const lerp = (a,b,t)=> a + (b-a)*Math.max(0,Math.min(1,t));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  function S(){ return window.SCENE || BABYLON.EngineStore.LastCreatedScene || null; }
  function cam(){ const s=S(); return s?.activeCamera || window.camera || null; }

  // ────── PP.audio (custom sound engine) ──────
  window.PP = window.PP || {};
  PP.audio = PP.audio || {};
  PP.audio.sfx = PP.audio.sfx || {
    ambient:         './assets/audio/clearWeather.mp3',
    rainstorm:       './assets/audio/rainstorm.mp3',
    snow:            './assets/audio/snow.mp3',
    thunder1:        './assets/audio/thunder.mp3',
    thunderLoud:     './assets/audio/thunder_loud.mp3',
    thunderRumble:   './assets/audio/thunder_rumble.mp3',
  };

  PP.audio.play = PP.audio.play || function(name, opts={volume:1.0}) {
    const url = PP.audio.sfx[name] || `./assets/audio/${name}.mp3`;
    const a = new Audio(url); a.volume = opts.volume ?? 1.0; a.play();
    return a;
  };
  PP.audio.loop = PP.audio.loop || function(name, volume=0.5) {
    const url = PP.audio.sfx[name] || `./assets/audio/${name}.mp3`;
    const a = new Audio(url); a.volume=volume; a.loop=true; a.play(); return a;
  };

  // ────── Weather State ──────
  const ST = {
    state: "Clear",
    intensity:1,
    indoor:false,
    ready:false,
    started:false,
    lastT:performance.now()/1000,
    nextLightningAt:Infinity,
    sounds:{ ambient:null, rain:null, snow:null, thunder:[] },
    volBase:{ ambient:0.7, rain:0.65, snow:0.5, thunder:0.9 },
    volTarget:{ ambient:0, rain:0, snow:0 },
    volNow:{ ambient:0, rain:0, snow:0 },
    _loopCB:null,
    _rainPS:null,
    _snowPS:null,
    _flashLight:null,
    _glowLayer:null,
    _indoorLast:null,
    _indoorAcc:0,
    _indoorPeriod:0.5,
    thunderTimers: [],
    bloodmoonTimers: [],
    ambientName:null
  };

  // ────── Helper Functions ──────
  function stopAmbientLoop(){
    if(ST.ambientName){ try{ PP.audio.stop?.(ST.ambientName); }catch{} ST.ambientName=null; }
  }
  function playAmbientLoop(name, volume=0.35){
    stopAmbientLoop();
    if(PP.audio.loop){ ST.ambientName=name; PP.audio.loop(name, volume); }
  }

  function pick(arr){ return arr[(Math.random()*arr.length)|0]; }
  function stopThunderTimers(){ ST.thunderTimers.forEach(t=>clearTimeout(t)); ST.thunderTimers=[]; }
  function stopBloodmoonTimers(){ ST.bloodmoonTimers.forEach(t=>clearTimeout(t)); ST.bloodmoonTimers=[]; }

  // ────── Particles ──────
  function disposeParticles(){ ST._rainPS?.dispose?.(); ST._snowPS?.dispose?.(); ST._rainPS=null; ST._snowPS=null; }
  function spawnRainParticles(tint=new BABYLON.Color3(0.5,0.5,1)){
    disposeParticles();
    const s=S(); if(!s) return;
    const ps=new BABYLON.ParticleSystem("rain",5000,s);
    ps.particleTexture = new BABYLON.Texture("assets/particles/raindrop.png",s);
    ps.emitter=v3(0,20,0); ps.minEmitBox=v3(-50,0,-50); ps.maxEmitBox=v3(50,0,50);
    ps.color1=new BABYLON.Color4(tint.r,tint.g,tint.b,0.7); ps.color2=new BABYLON.Color4(tint.r,tint.g,tint.b,0.7);
    ps.minSize=0.1; ps.maxSize=0.2; ps.minLifeTime=0.3; ps.maxLifeTime=0.5; ps.emitRate=1500;
    ps.gravity=v3(0,-30,0); ps.direction1=v3(0,-1,0); ps.direction2=v3(0,-1,0); ps.start();
    ST._rainPS=ps;
  }
  function spawnSnowParticles(){
    disposeParticles();
    const s=S(); if(!s) return;
    const ps=new BABYLON.ParticleSystem("snow",3000,s);
    ps.particleTexture=new BABYLON.Texture("assets/particles/snowflake.png",s);
    ps.emitter=v3(0,20,0); ps.minEmitBox=v3(-50,0,-50); ps.maxEmitBox=v3(50,0,50);
    ps.color1=ps.color2=new BABYLON.Color4(1,1,1,0.8); ps.minSize=0.2; ps.maxSize=0.4;
    ps.minLifeTime=3; ps.maxLifeTime=5; ps.emitRate=800; ps.gravity=v3(0,-1,0);
    ps.direction1=v3(-0.5,-1,-0.5); ps.direction2=v3(0.5,-1,0.5); ps.start();
    ST._snowPS=ps;
  }

  // ────── Lightning / Bloodmoon ──────
  function flashBloodmoon(){
    const s=S(); if(!s) return; const c=cam(); if(!c?.position) return;
    if(!ST._glowLayer){ ST._glowLayer=new BABYLON.GlowLayer("bloodmoonGlow",s,{intensity:0.25}); ST._glowLayer.blurKernelSize=64; }
    if(!ST._flashLight||ST._flashLight.isDisposed()){ ST._flashLight=new BABYLON.PointLight("blood_flash",c.position.add(v3(0,10,0)),s); ST._flashLight.range=250; ST._flashLight.diffuse=new BABYLON.Color3(0.8,0.1,0.1); ST._flashLight.specular=ST._flashLight.diffuse; ST._flashLight.intensity=0; }
    const pulses=1+(Math.random()<0.4?1:0); let i=0;
    const doPulse=()=>{
      if(i++>=pulses) return;
      const dir=v3(Math.random()-0.5,0,Math.random()-0.5).normalize().scale(80+Math.random()*40);
      ST._flashLight.position=c.position.add(dir).add(v3(0,12+Math.random()*8,0));
      ST._flashLight.intensity=0.6+Math.random()*0.4;
      setTimeout(()=>{ if(ST._flashLight) ST._flashLight.intensity=0; },120+Math.random()*80);
      setTimeout(playThunder,1200+Math.random()*2300);
      if(i<pulses) setTimeout(doPulse,100+Math.random()*140);
    }; doPulse();
  }
  function playThunder(){
    if(!PP.audio) return;
    const files=['thunder1','thunderLoud','thunderRumble'];
    const snd=pick(files); PP.audio.play(snd,{volume:0.4+Math.random()*0.3});
  }
  function scheduleRandomRumble(){
    stopThunderTimers();
    const delay = 5000+Math.random()*15000;
    const timer=setTimeout(()=>{
      if(ST.state==="Rainstorm") playThunder();
      scheduleRandomRumble();
    },delay);
    ST.thunderTimers.push(timer);
  }

  // ────── Indoor detection ──────
  function isIndoorAt(pos){
    const s=S(); if(!s||!pos) return false;
    try{
      const V=window.PP?.CONFIG?.VAN;
      if(V && V.POSITION && typeof V.RADIUS==='number') 
        if(BABYLON.Vector3.Distance(pos,V.POSITION)<=(V.RADIUS+1)) return false;
    }catch{}
    const from=v3(pos.x,pos.y+0.5,pos.z);
    const ray=new BABYLON.Ray(from,v3(0,1,0),12);
    const hit = s.pickWithRay(ray,m=>{
      if(!m) return false;
      if(m.isPickable===false) return false;
      if(m.metadata?.isRoof || m.metadata?.isCeiling) return true;
      return /roof|ceiling|attic|upper|secondfloor/.test((m.name||'').toLowerCase());
    });
    return !!(hit && hit.hit);
  }
  function indoorMonitor(dt){
    ST._indoorAcc+=dt;
    if(ST._indoorAcc<ST._indoorPeriod) return;
    ST._indoorAcc=0;
    const c=cam(); if(!c?.position) return;
    const inHouse=isIndoorAt(c.position);
    if(inHouse!==ST._indoorLast){
      ST._indoorLast=inHouse; ST.indoor=inHouse;
      Weather.set(ST.state,{intensity:ST.intensity,immediate:true});
    }
  }

  // ────── Volume & Loop ──────
  function applyTargets(dt){
    const k=clamp(dt*1.5,0,1);
    const muffle=ST.indoor?0.35:1;
    ST.volNow.ambient=lerp(ST.volNow.ambient,ST.volTarget.ambient,k);
    ST.volNow.rain=lerp(ST.volNow.rain,ST.volTarget.rain*ST.intensity*muffle,k);
    ST.volNow.snow=lerp(ST.volNow.snow,ST.volTarget.snow*ST.intensity*muffle,k);
    try{ ST.sounds.ambient?.setVolume(ST.volNow.ambient); }catch{}
    try{ ST.sounds.rain?.setVolume(ST.volNow.rain); }catch{}
    try{ ST.sounds.snow?.setVolume(ST.volNow.snow); }catch{}
  }

  // ────── Tick ──────
  function tick(){
    const now=performance.now()/1000, dt=Math.min(0.2,now-ST.lastT); ST.lastT=now;
    if(ST.state==="Bloodmoon" && now>=ST.nextLightningAt){ flashBloodmoon(); scheduleLightning(); }
    indoorMonitor(dt);
    applyTargets(dt);
    if(ST.state==="Rainstorm" && Math.random()<0.002) playThunder();
    const hw=document.getElementById('hud-weather');
    if(hw) hw.textContent=ST.state+(ST.indoor?" (Indoor)":"");
  }

  function hookLoop(){ const s=S(); if(!s||ST._loopCB) return; ST._loopCB=tick; s.onBeforeRenderObservable.add(ST._loopCB); }
  function scheduleLightning(){ ST.nextLightningAt = performance.now()/1000 + (18+Math.random()*24)*(0.85+Math.random()*0.3); }

  // ────── Weather API ──────
  function setWeather(state,opts={}) {
    opts=opts||{};
    ST.state=state;
    ST.intensity=opts.intensity??ST.intensity;
    stopThunderTimers(); stopBloodmoonTimers(); disposeParticles();

    const muffle=ST.indoor?0.35:1;
    switch(state){
      case "Clear": ST.volTarget={ambient:ST.volBase.ambient,rain:0,snow:0}; playAmbientLoop('ambient',0.35); ST.nextLightningAt=Infinity; break;
      case "Rainstorm": ST.volTarget={ambient:0,rain:ST.volBase.rain,snow:0}; spawnRainParticles(); playAmbientLoop('rainstorm',0.6); scheduleRandomRumble(); break;
      case "Snow": ST.volTarget={ambient:0,rain:0,snow:ST.volBase.snow}; spawnSnowParticles(); playAmbientLoop('snow',0.25); ST.nextLightningAt=Infinity; break;
      case "Bloodmoon": ST.volTarget={ambient:0,rain:ST.volBase.rain,snow:0}; spawnRainParticles(new BABYLON.Color3(1,0.1,0.1)); playAmbientLoop('rainstorm',0.6); scheduleLightning(); break;
    }

    if(opts.immediate){
      ST.volNow.ambient=ST.volTarget.ambient;
      ST.volNow.rain=ST.volTarget.rain*ST.intensity*muffle;
      ST.volNow.snow=ST.volTarget.snow*ST.intensity*muffle;
    }
  }

  // ────── Init ──────
  (function boot(){
    hookLoop();
    console.log("[Weather] Combined system initialized");
    window.Weather={set:setWeather,ST,playThunder};
  })();

})();
