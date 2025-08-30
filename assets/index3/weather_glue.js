// ./assets/index3/weather_glue.js — v1.0
// Wires your Weather engine into the game lifecycle.
// - Initializes Weather after the first user interaction (to ensure audio is unlocked)
// - Picks a random starting state (Clear / Rainstorm / Snow) unless ?weather=... is in the URL
// - Exposes helpers on window: setWeather(state, opts), cycleWeather()
// - Respects window.WEATHER_AUDIO_MAP if you set it in HTML (for thunder file, etc.)
(function(){
  "use strict";
  const pick = arr => arr[(Math.random()*arr.length)|0];
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const URL_STATE = (new URLSearchParams(location.search)).get("weather") || (location.hash.match(/weather=([^&]+)/i)?.[1]);

  const STATE = { booted:false, inited:false };

  function ensureAudioUnlock(){
    if (window.audioUnlocked) return true;
    // Many engines set this in your core.js; but just in case, poke sounds here if Weather already loaded
    try {
      // No-op that just toggles the flag if your core does it on pointer
    } catch {}
    return !!window.audioUnlocked;
  }

  function initWeatherOnce(){
    if (STATE.inited || !window.Weather) return false;
    // Run engine init if not already
    try { if (typeof Weather.init === "function") Weather.init(); } catch {}
    // Choose a state
    let state = (URL_STATE && /^(clear|rainstorm|snow)$/i.test(URL_STATE)) ? URL_STATE[0].toUpperCase()+URL_STATE.slice(1).toLowerCase() : null;
    if (!state){
      // Weighted random: Clear 55%, Rainstorm 30%, Snow 15%
      const r = Math.random();
      state = r < 0.55 ? "Clear" : (r < 0.85 ? "Rainstorm" : "Snow");
    }
    const intensity = state === "Clear" ? undefined
                     : state === "Rainstorm" ? (0.55 + Math.random()*0.4)   // 0.55..0.95
                     : (0.35 + Math.random()*0.45);                          // Snow 0.35..0.8
    try { Weather.set(state, { intensity, immediate:true }); } catch {}
    STATE.inited = true;
    // HUD will be updated by Weather internally
    return true;
  }

  function firstInteractionBoot(){
    if (STATE.booted) return;
    const boot = ()=>{
      STATE.booted = true;
      document.removeEventListener("pointerdown", boot);
      document.removeEventListener("keydown", boot);
      // make sure audio is considered unlocked
      window.audioUnlocked = true;
      initWeatherOnce();
    };
    document.addEventListener("pointerdown", boot, { once:true, capture:true });
    document.addEventListener("keydown", boot, { once:true, capture:true });
  }

  // Public helpers
  function setWeather(state, opts){ try { Weather.set(state, opts||{}); } catch(e){ console.warn(e); } }
  function cycleWeather(){
    if (!window.Weather) return;
    const now = Weather.isRaining?.() ? "Rainstorm" : (Weather.isSnowing?.() ? "Snow" : "Clear");
    const next = now === "Clear" ? "Rainstorm" : (now === "Rainstorm" ? "Snow" : "Clear");
    setWeather(next, { intensity: next==="Clear"?undefined:(0.6+Math.random()*0.3) });
  }

  // keybinds (optional): Alt+1 Clear, Alt+2 Rainstorm, Alt+3 Snow, Alt+W cycle
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
  }

  // Boot glue
  (function boot(){
    expose();
    bindKeys();
    firstInteractionBoot();
    // If Weather is already present and audio was unlocked earlier, init immediately
    if (window.Weather && ensureAudioUnlock()){
      initWeatherOnce();
    }
  })();
})();