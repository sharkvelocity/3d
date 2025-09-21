// ./assets/dev/util/weather_glue.js
// Wires your Weather engine into the game lifecycle with audio hooks:
// - Loops ambient sounds
// - Plays thunder on lightning flashes
// - Plays subtle random rumbles
(function(){
  "use strict";

  const pick = arr => arr[(Math.random()*arr.length)|0];
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const URL_STATE = (new URLSearchParams(location.search)).get("weather") || (location.hash.match(/weather=([^&]+)/i)?.[1]);
  const STATE = { booted:false, inited:false, current:null, ambient:null, thunderTimers:[] };

  // --- Helpers ---
  function ensureAudioUnlock(){
    if (window.audioUnlocked) return true;
    try {} catch {}
    return !!window.audioUnlocked;
  }

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
    const thunderSound = pick(sounds);
    const vol = 0.25 + Math.random()*0.3; // subtle variation
    PP.audio.play(thunderSound, { volume: vol });
  }

  function scheduleRandomRumble(){
    const delay = 5000 + Math.random()*15000; // 5-20s
    const timer = setTimeout(()=>{
      if (STATE.current === "Rainstorm" && PP.audio){
        const rumbleSounds = window.WEATHER_AUDIO_MAP?.rumble || ["thunder_rumble1","thunder_rumble2"];
        PP.audio.play(pick(rumbleSounds), { volume: 0.2 + Math.random()*0.2 });
      }
      scheduleRandomRumble();
    }, delay);
    STATE.thunderTimers.push(timer);
  }

  function clearThunderTimers(){
    STATE.thunderTimers.forEach(t => clearTimeout(t));
    STATE.thunderTimers = [];
  }

  // --- Weather init & set ---
  function initWeatherOnce(){
    if (STATE.inited || !window.Weather) return false;

    try { if (typeof Weather.init === "function") Weather.init(); } catch {}

    // Determine starting state
    let state = (URL_STATE && /^(clear|rainstorm|snow)$/i.test(URL_STATE)) ? URL_STATE[0].toUpperCase()+URL_STATE.slice(1).toLowerCase() : null;
    if (!state){
      const r = Math.random();
      state = r < 0.55 ? "Clear" : (r < 0.85 ? "Rainstorm" : "Snow");
    }
    const intensity = state === "Clear" ? undefined
                     : state === "Rainstorm" ? (0.55 + Math.random()*0.4)
                     : (0.35 + Math.random()*0.45);

    setWeather(state, { intensity, immediate:true });
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

  // --- Public helpers ---
  function setWeather(state, opts={}){
    if (!window.Weather) return;
    opts = opts||{};
    try { Weather.set(state, opts); } catch(e){ console.warn(e); }

    STATE.current = state;

    // Stop old loops & timers
    stopAmbientLoop();
    clearThunderTimers();

    // Play new ambient loop
    if (state === "Clear") playAmbientLoop(window.WEATHER_AUDIO_MAP?.clear || "ambient", 0.25);
    if (state === "Rainstorm") playAmbientLoop(window.WEATHER_AUDIO_MAP?.rain || "rain_loop", 0.35);
    if (state === "Snow") playAmbientLoop(window.WEATHER_AUDIO_MAP?.snow || "snow_loop", 0.25);

    // Schedule subtle thunder rumbles only for Rainstorm
    if (state === "Rainstorm") scheduleRandomRumble();
  }

  function cycleWeather(){
    if (!window.Weather) return;
    const now = Weather.isRaining?.() ? "Rainstorm" : (Weather.isSnowing?.() ? "Snow" : "Clear");
    const next = now === "Clear" ? "Rainstorm" : (now === "Rainstorm" ? "Snow" : "Clear");
    setWeather(next, { intensity: next==="Clear"?undefined:(0.6+Math.random()*0.3) });
  }

  // Keybinds (Alt+1/2/3/W)
  function bindKeys(){
    window.addEventListener("keydown", (e)=>{
      if (!e.altKey) return;
      if (e.code === "Digit1"){ setWeather("Clear", { immediate:true }); }
      if (e.code === "Digit2"){ setWeather("Rainstorm", { intensity:0.8 }); }
      if (e.code === "Digit3"){ setWeather("Snow", { intensity:0.6 }); }
      if (e.code === "KeyW"){ cycleWeather(); }
    });
  }

  function expose(){
    window.setWeather = setWeather;
    window.cycleWeather = cycleWeather;
    window.playThunder = playThunder; // hook for lightning flashes
  }

  // Boot glue
  (function boot(){
    expose();
    bindKeys();
    firstInteractionBoot();
    if (window.Weather && ensureAudioUnlock()) initWeatherOnce();
  })();
})();
