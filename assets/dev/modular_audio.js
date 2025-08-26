
/**
 * Modular audio settings + wiring extracted from index3.html.
 * Uses HTMLAudioElement for compatibility with existing assets.
 * Safe to include in modular builds that don't have Babylon.Sound.
 */
(function(){
  if (window.__PP_AUDIO__) return; window.__PP_AUDIO__ = true;

  const PP = window.PP || (window.PP = {});
  PP.audio = PP.audio || {};

  // Channel gains (scaled into individual HTMLAudioElement.volume)
  PP.audio.gain = {
    master: 1.0,
    ambient: 1.0,
    sfx: 1.0,
    ui: 1.0
  };

  // Create audio elements (paths mirror index3.html)
  const A = PP.audio.tracks = {
    ambient: new Audio("./assets/audio/ambient.mp3"),
    rain: new Audio("./assets/audio/rainstorm.mp3"),
    clear: new Audio("./assets/audio/clearWeather.mp3"),
    spiritbox: new Audio("./assets/audio/spiritbox.mp3"),
    spiritStatic: new Audio("./assets/audio/spiritBoxStatic.mp3"),
    whisper: new Audio("./assets/audio/whisper.mp3"),
    doorCreak1: new Audio("./assets/audio/doorCreak1.mp3"),
    doorCreak2: new Audio("./assets/audio/doorCreak2.mp3"),
    slam1: new Audio("./assets/audio/doorSlam1.mp3"),
    slam2: new Audio("./assets/audio/doorSlam2.mp3"),
    ghostLaugh: new Audio("./assets/audio/ghostLaugh.mp3"),
    writing: new Audio("./assets/audio/GhostWriting1.mp3"),
    // Shared footstep pool
    steps: [
      new Audio("./assets/audio/step1.mp3"),
      new Audio("./assets/audio/step2.mp3"),
      new Audio("./assets/audio/step3.mp3")
    ]
  };

  // Disable loops by default except ambience
  Object.values(A).forEach(v => {
    if (Array.isArray(v)) v.forEach(x => { if (x && 'loop' in x) x.loop = false; });
    else { if (v && 'loop' in v) v.loop = false; }
  });
  A.ambient.loop = true; A.rain.loop = true; A.clear.loop = true;

  // Utility to set element volume using channel gains
  function setVol(el, base, channel='sfx'){
    try {
      const g = PP.audio.gain;
      const v = Math.max(0, Math.min(1, base * (g.master||1) * ((g[channel]||1))));
      el.volume = v;
    } catch {}
  }

  // Weather → ambient routing (volumes from index3.html)
  const WEATHER = {
    Rain:  { start: ['rain', 0.35, 'ambient', 0.30] },
    Snow:  { start: ['clear',0.25, 'ambient', 0.25] },
    Clear: { start: ['clear',0.25, 'ambient', 0.30] }
  };
  let currentWeather = null;

  function stop(el){ try { el.pause(); el.currentTime = 0; } catch {} }
  function play(el){ try { el.play().catch(()=>{}); } catch {} }

  PP.audio.applyWeather = function(state){
    if (!state || !WEATHER[state]) return;
    if (currentWeather === state) return;
    currentWeather = state;

    // Stop all ambience first
    [A.rain, A.clear, A.ambient].forEach(stop);
    // Start primary + pad (ambient bed)
    const cfg = WEATHER[state];
    const [primary, pVol, secondary, sVol] = cfg.start;

    setVol(A[primary], pVol, 'ambient'); play(A[primary]);
    setVol(A[secondary], sVol, 'ambient'); play(A[secondary]);
  };

  // Footsteps (pool) — index3 defaults: 0.45–0.60
  PP.audio.playStep = function(volume=0.45){
    const pool = A.steps;
    const s = pool[(Math.random()*pool.length) | 0];
    try { s.currentTime = 0; setVol(s, volume, 'sfx'); s.play().catch(()=>{}); } catch {}
  };

  // SFX helpers
  PP.audio.play = {
    spiritbox:     () => { setVol(A.spiritbox, 0.8, 'sfx'); play(A.spiritbox); },
    spiritStatic:  () => { setVol(A.spiritStatic, 0.8, 'sfx'); play(A.spiritStatic); },
    whisper:       () => { setVol(A.whisper, 0.7, 'sfx'); play(A.whisper); },
    doorCreak:     () => { const x = Math.random()<0.5?A.doorCreak1:A.doorCreak2; setVol(x, 0.7, 'sfx'); play(x); },
    slam:          () => { const x = Math.random()<0.5?A.slam1:A.slam2; setVol(x, 0.85, 'sfx'); play(x); },
    ghostLaugh:    () => { setVol(A.ghostLaugh, 0.75, 'sfx'); play(A.ghostLaugh); },
    writing:       () => { setVol(A.writing, 0.8, 'sfx'); play(A.writing); }
  };

  // Unlock playback on user gesture (Start button)
  PP.audio.init = function(initialWeather){
    // Try to resume context by touching all tracks silently
    Object.values(A).forEach(v => {
      if (Array.isArray(v)) v.forEach(x=>{ try { x.muted=true; x.play().then(()=>x.pause()).catch(()=>{}); } catch {} });
      else { try { v.muted=true; v.play().then(()=>v.pause()).catch(()=>{}); } catch {} }
    });
    // After unlock, unmute
    setTimeout(()=>{
      Object.values(A).forEach(v => {
        if (Array.isArray(v)) v.forEach(x=>{ try { x.muted=false; } catch {} });
        else { try { v.muted=false; } catch {} }
      });
      if (initialWeather) PP.audio.applyWeather(initialWeather);
      else {
        // Detect weather if global available
        const ws = (window.weather && window.weather.state) || 'Clear';
        PP.audio.applyWeather(ws);
      }
    }, 50);
  };

  // Optional: poll global weather.state and auto-adjust ambience
  (function pollWeather(){
    const ws = (window.weather && window.weather.state);
    if (ws && ws !== currentWeather) PP.audio.applyWeather(ws);
    setTimeout(pollWeather, 1000);
  })();

  // Export simple API for other modules
  PP.audio.setGains = function(g){ Object.assign(PP.audio.gain, g||{}); };
  PP.audio.stopAll = function(){
    try{
      Object.values(A).forEach(v => {
        if (Array.isArray(v)) v.forEach(stop); else stop(v);
      });
    }catch{}
  };
})();
