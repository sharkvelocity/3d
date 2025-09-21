// ./assets/dev/util/weather_glue.js
// Wires Weather engine into the game lifecycle with audio hooks and Bloodmoon support
(function(){
  "use strict";

  const pick = arr => arr[(Math.random()*arr.length)|0];
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const URL_STATE = (new URLSearchParams(location.search)).get("weather") || (location.hash.match(/weather=([^&]+)/i)?.[1]);
  const STATE = { booted:false, inited:false, current:null, ambient:null, thunderTimers:[], bloodmoonTimers:[] };

  // --- Helpers ---
  function ensureAudioUnlock(){ return !!window.audioUnlocked; }

  function stopAmbientLoop(){
    if (STATE.ambient){
      try { PP.audio.stop(STATE.ambient); } catch{}
      STATE.ambient = null;
    }
  }

  function playAmbientLoop(name, volume=0.35){
    stopAmbientLoop();
    if (PP.audio && PP.audio.loop) {
      STATE.ambient = name;
      PP.audio.loop(name, volume);
    }
  }

  function playThunder(){
    if (!PP.audio) return;
    const sounds = window.WEATHER_AUDIO_MAP?.thunder || ["thunder1","thunder2","thunder3"];
    PP.audio.play(pick(sounds), { volume:0.25 + Math.random()*0.3 });
  }

  function scheduleRandomRumble(){
    const delay = 5000 + Math.random()*15000; // 5-20s
    const timer = setTimeout(()=>{
      if (STATE.current === "Rainstorm" && PP.audio){
        const rumbleSounds = window.WEATHER_AUDIO_MAP?.rumble || ["thunder_rumble1","thunder_rumble2"];
        PP.audio.play(pick(rumbleSounds), { volume:0.2 + Math.random()*0.2 });
      }
      scheduleRandomRumble();
    }, delay);
    STATE.thunderTimers.push(timer);
  }

  function clearThunderTimers(){
    STATE.thunderTimers.forEach(t => clearTimeout(t));
    STATE.thunderTimers = [];
  }

  function clearBloodmoonTimers(){
    STATE.bloodmoonTimers.forEach(t => clearTimeout(t));
    STATE.bloodmoonTimers = [];
  }

  // --- Weather init & set ---
  function initWeatherOnce(){
    if (STATE.inited || !window.Weather) return false;

    try { if (typeof Weather.init === "function") Weather.init(); } catch {}

    let state = (URL_STATE && /^(clear|rainstorm|snow|bloodmoon)$/i.test(URL_STATE)) ? URL_STATE[0].toUpperCase()+URL_STATE.slice(1).toLowerCase() : null;
    if (!state){
      const r = Math.random();
      state = r < 0.55 ? "Clear" : (r < 0.85 ? "Rainstorm" : "Snow");
    }

    setWeather(state, { intensity: state==="Clear"?undefined:(0.5+Math.random()*0.5), immediate:true });
    STATE.inited = true;
    return true;
  }

  function firstInteractionBoot(){
    if (STATE.booted) return;
    const boot = ()=>{
      STATE.booted = true;
      document.removeEventListener("pointerdown", boot);
      document.removeEventListener("keydown", boot);
      window.audioUnlocked = true;
      initWeatherOnce();
    };
    document.addEventListener("pointerdown", boot, { once:true, capture:true });
    document.addEventListener("keydown", boot, { once:true, capture:true });
  }

  // --- Bloodmoon helpers ---
  function startBloodmoonEffects(){
    if (!PP.audio || !window.Weather || STATE.current!=="Bloodmoon") return;
    // Red ambient tint and red rain
    if (scene){
      scene.fogColor = new BABYLON.Color3(0.5,0.05,0.05);
    }
    playAmbientLoop(window.WEATHER_AUDIO_MAP?.bloodmoon || "bloodmoon_loop", 0.4);
    // Thunder on random interval
    function thunderPulse(){
      if (STATE.current==="Bloodmoon") {
        playThunder();
        const t = setTimeout(thunderPulse, 5000 + Math.random()*15000);
        STATE.bloodmoonTimers.push(t);
      }
    }
    thunderPulse();
  }

  function stopBloodmoonEffects(){
    clearBloodmoonTimers();
    if (scene) scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);
  }

  // --- Public helpers ---
  function setWeather(state, opts={}){
    if (!window.Weather) return;
    opts = opts||{};
    try { Weather.set(state, opts); } catch(e){ console.warn(e); }

    // Reset old loops & timers
    stopAmbientLoop();
    clearThunderTimers();
    stopBloodmoonEffects();

    STATE.current = state;

    if (state === "Clear") playAmbientLoop(window.WEATHER_AUDIO_MAP?.clear || "ambient", 0.25);
    if (state === "Rainstorm") { playAmbientLoop(window.WEATHER_AUDIO_MAP?.rain || "rain_loop",0.35); scheduleRandomRumble(); }
    if (state === "Snow") playAmbientLoop(window.WEATHER_AUDIO_MAP?.snow || "snow_loop",0.25);
    if (state === "Bloodmoon") startBloodmoonEffects();
  }

  function cycleWeather(){
    if (!window.Weather) return;
    const now = STATE.current || "Clear";
    const next = now==="Clear"?"Rainstorm":(now==="Rainstorm"?"Snow":(now==="Snow"?"Bloodmoon":"Clear"));
    setWeather(next, { intensity: next==="Clear"?undefined:(0.5+Math.random()*0.5) });
  }

  function bindKeys(){
    window.addEventListener("keydown", (e)=>{
      if (!e.altKey) return;
      if (e.code==="Digit1") setWeather("Clear",{immediate:true});
      if (e.code==="Digit2") setWeather("Rainstorm",{intensity:0.8});
      if (e.code==="Digit3") setWeather("Snow",{intensity:0.6});
      if (e.code==="Digit4") setWeather("Bloodmoon",{intensity:0.7});
      if (e.code==="KeyW") cycleWeather();
    });
  }

  function expose(){
    window.setWeather = setWeather;
    window.cycleWeather = cycleWeather;
    window.playThunder = playThunder;
  }

  // --- Boot glue ---
  (function boot(){
    expose();
    bindKeys();
    firstInteractionBoot();
    if (window.Weather && ensureAudioUnlock()) initWeatherOnce();
  })();

})();
