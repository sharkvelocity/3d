// sound_engine.js
// Consolidated SFX: footsteps + ghost SFX + radio + EMF tone + ambient weather

(function(){
  'use strict';
  if (window.SoundEngine) return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  // ----- EMF tone (WebAudio) -----
  const EMFAudio = (function(){
    let ctx=null, osc=null, gain=null;
    let emf5Until = 0, running=false;
    const MAX_EXTEND_MS = 120000;
    function ensure(){
      try{
        ctx = BABYLON.Engine.audioEngine?.audioContext || ctx;
        if(!ctx) return false;
        if(!gain){ gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); }
        if(!osc){ osc = ctx.createOscillator(); osc.type='square'; osc.frequency.value=1150; osc.connect(gain); try{osc.start();}catch(_){}} 
        return true;
      }catch(_){ return false; }
    }
    function now(){ return (typeof performance!=='undefined'?performance.now():Date.now()); }
    function _set(v){ try{ gain && gain.gain.setTargetAtTime(v, ctx.currentTime, 0.005);}catch(_){ } }
    function spike(){
      if(!ensure()) return;
      const pattern=[1,0,1,0,1,0], dur=0.12, gap=0.12; let t=0;
      pattern.forEach(on=>{ setTimeout(()=>_set(on?0.18:0.0), Math.round(t*1000)); t += on?dur:gap; });
      setTimeout(()=>_set(0.0), Math.round(t*1000)+20);
    }
    function startEMF5(seconds){
      if(!ensure()) return;
      const add = Math.max(0.5, seconds||10+Math.random()*5);
      const stopAt = now() + add*1000;
      emf5Until = Math.min(now()+MAX_EXTEND_MS, Math.max(emf5Until, stopAt));
      running=true; _set(0.22);
    }
    function extend(seconds){
      if(emf5Until<=now()) return;
      const add = Math.max(1.0, seconds||10+Math.random()*5);
      emf5Until = Math.min(now()+MAX_EXTEND_MS, emf5Until + add*1000);
    }
    function update(){
      if(emf5Until > now()){ if(!running){ running=true; _set(0.22);} }
      else if(running){ running=false; _set(0.0); }
    }
    (function poll(){
      const s=SCENE(); if (s && s.onBeforeRenderObservable){
        s.onBeforeRenderObservable.add(()=>{ try{ update(); }catch(_){ } });
      } else setTimeout(poll,120);
    })();
    return { spike, startEMF5, extend };
  })();

  // ----- Ghost SFX -----
  const GhostAudio = (function(){
    let whisperSnd=null, slamSnd1=null, slamSnd2=null, creakSnd1=null, creakSnd2=null, tossSnd=null;
    function ensure(){
      const s=SCENE(); if (!s) return;
      const opt = { loop:false, autoplay:false };
      whisperSnd = whisperSnd || new BABYLON.Sound('ga_whisper','./assets/audio/whisper.mp3', s, null, { ...opt, volume:0.7 });
      slamSnd1   = slamSnd1   || new BABYLON.Sound('ga_slam1','./assets/audio/doorSlam1.mp3', s, null, { ...opt, volume:0.9 });
      slamSnd2   = slamSnd2   || new BABYLON.Sound('ga_slam2','./assets/audio/doorSlam2.mp3', s, null, { ...opt, volume:0.9 });
      creakSnd1  = creakSnd1  || new BABYLON.Sound('ga_creak1','./assets/audio/doorCreak1.mp3', s, null, { ...opt, volume:0.7 });
      creakSnd2  = creakSnd2  || new BABYLON.Sound('ga_creak2','./assets/audio/doorCreak2.mp3', s, null, { ...opt, volume:0.7 });
      tossSnd    = tossSnd    || new BABYLON.Sound('ga_toss','./assets/audio/Toss.wav',         s, null, { ...opt, volume:0.85 });
    }
    function attachTo(node){ try{ whisperSnd?.attachToMesh?.(node); slamSnd1?.attachToMesh?.(node); slamSnd2?.attachToMesh?.(node); creakSnd1?.attachToMesh?.(node); creakSnd2?.attachToMesh?.(node); tossSnd?.attachToMesh?.(node);}catch(_){ } }
    return {
      ensure,
      attachTo,
      whisper(){ ensure(); try{ whisperSnd?.stop(); whisperSnd?.play(); }catch(_){} },
      doorSlam(){ ensure(); try{ (Math.random()<0.5?slamSnd1:slamSnd2)?.play(); }catch(_){} },
      doorCreak(){ ensure(); try{ (Math.random()<0.5?creakSnd1:creakSnd2)?.play(); }catch(_){} },
      toss(){ ensure(); try{ tossSnd?.stop(); tossSnd?.play(); }catch(_){} }
    };
  })();

  // ----- Radio SFX -----
  const RadioAudio = (function(){
    let clip=null;
    function ensure(){
      const s=SCENE(); if (!s) return;
      if(!clip){ clip = new BABYLON.Sound('radio','./assets/audio/Radio.mp3', s, null, { loop:false, autoplay:false, volume:0.85 }); }
    }
    return { ensure, playOnce(){ ensure(); try{ clip?.stop(); clip?.play(); }catch(_){} } };
  })();

  // ----- Footsteps (tick from movement loop) -----
  const Footsteps = (function(){
    let last=0, stepEvery=0.42, runEvery=0.28;
    let stepClips = {};
    function ensure(){
      const s=SCENE(); if (!s) return;
      // You can add more materials; default to a handful
      function snd(name, file, vol){ return new BABYLON.Sound(name, file, s, null, { loop:false, autoplay:false, volume:vol }); }
      if (!stepClips['default']){
        stepClips['default'] = [
          snd('fs1','./assets/audio/footstep.mp3', 0.25),
          snd('fs2','./assets/audio/footstep_gravel.mp3', 0.25),
          snd('fs3','./assets/audio/footstep_asphalt_2.mp3', 0.25),
        ];
      }
      if (!stepClips['wood']){
        stepClips['wood'] = [
          snd('fsw1','./assets/audio/footstep_wood_2.mp3', 0.28),
          snd('fsw2','./assets/audio/footstep_wood_3.mp3', 0.28),
        ];
      }
      if (!stepClips['carpet']){
        stepClips['carpet'] = [
          snd('fsc1','./assets/audio/footstep_carpet_2.mp3', 0.22),
          snd('fsc2','./assets/audio/footstep_carpet_3.mp3', 0.22),
        ];
      }
    }
    function playOne(arr){ try{ (arr[Math.floor(Math.random()*arr.length)]).play(); }catch(_){ } }
    function materialUnderCam(){
      try{
        const s=SCENE(); const cam=s.activeCamera;
        const ray = new BABYLON.Ray(cam.position.add(new BABYLON.Vector3(0,0.2,0)), new BABYLON.Vector3(0,-1,0), 2.5);
        const pick = s.pickWithRay(ray, m=>m && m.isPickable!==false);
        const name = (pick?.pickedMesh?.material?.name||'').toLowerCase();
        if (name.includes('wood')) return 'wood';
        if (name.includes('carpet')) return 'carpet';
      }catch(_){}
      return 'default';
    }
    return {
      tick(isMoving, running){
        ensure();
        const t = performance.now()/1000;
        if (!isMoving) { last = t; return; }
        const period = running ? runEvery : stepEvery;
        if (t - last >= period){
          last = t;
          const mat = materialUnderCam();
          const pool = stepClips[mat] || stepClips['default'];
          playOne(pool);
        }
      }
    };
  })();

  // Ambient/weather backing (minimal)
  const WeatherAmbient = (function(){
    let tracks={ clear:null, rain:null, snow:null, drone:null }, current='';
    function ensure(){
      const s=SCENE(); if (!s) return;
      tracks.clear = tracks.clear || new BABYLON.Sound('amb_clear','./assets/audio/clearWeather.mp3', s, null,{ loop:true, autoplay:false, volume:0.45 });
      tracks.rain  = tracks.rain  || new BABYLON.Sound('amb_rain','./assets/audio/rainstorm.mp3', s, null,{ loop:true, autoplay:false, volume:0.55 });
      tracks.snow  = tracks.snow  || new BABYLON.Sound('amb_snow','./assets/audio/ambient.mp3', s, null,{ loop:true, autoplay:false, volume:0.28 });
      tracks.drone = tracks.drone || new BABYLON.Sound('amb_drone','./assets/audio/ambient.mp3', s, null,{ loop:true, autoplay:false, volume:0.18 });
    }
    function fadeTo(target){
      ensure();
      if (current===target) return;
      const want={ clear:(target==='Clear'||target==='Sunset'), rain:(target==='Rain'||target==='Blood Moon'), snow:target==='Snow', drone:target==='Blood Moon' };
      for(const k of Object.keys(tracks)){
        const snd = tracks[k]; if(!snd) continue;
        const tgt = (k==='clear'&&want.clear)?0.45:(k==='rain'&&want.rain)?0.55:(k==='snow'&&want.snow)?0.28:(k==='drone'&&want.drone)?0.18:0.0;
        if(tgt>0){ if(!snd.isPlaying) { try{snd.setVolume(0); snd.play(); } catch(e){} } }
        const start = snd.getVolume();
        let i=0, steps=18, stepMs=40;
        const id=setInterval(()=>{
          i++; const a=i/steps; const ease=(x)=>x<.5?2*x*x:-1+(4-2*x)*x;
          snd.setVolume(start + (tgt-start)*ease(a));
          if(i>=steps){ clearInterval(id); if(tgt===0 && snd.isPlaying) try{snd.stop(); } catch(e){} }
        }, stepMs);
      }
      current=target;
    }
    return { set:fadeTo };
  })();

  window.SoundEngine = { EMFAudio, GhostAudio, RadioAudio, Footsteps, ambient: WeatherAmbient };
  window.EMFAudio = EMFAudio;     // convenience for existing code
  window.GhostAudio = GhostAudio;
  window.RadioAudio = RadioAudio;
  window.Footsteps = Footsteps;
})();
