/**
 * Modular audio (HTMLAudio) — Spirit Box = single static loop + layered whisper
 * Safe for builds without Babylon.Sound.
 */
(function(){
  if (window.__PP_AUDIO__) return; window.__PP_AUDIO__ = true;

  const PP = window.PP || (window.PP = {});
  PP.audio = PP.audio || {};

  // -------- Gains ------------------------------------------------------------
  PP.audio.gain = { master:1.0, ambient:1.0, sfx:1.0, ui:1.0 };

  // -------- Tracks -----------------------------------------------------------
  const A = PP.audio.tracks = {
    ambient:   new Audio("./assets/audio/ambient.mp3"),
    rain:      new Audio("./assets/audio/rainstorm.mp3"),
    clear:     new Audio("./assets/audio/clearWeather.mp3"),

    // Spirit Box: static bed (loop)
    spiritbox: new Audio("./assets/audio/spiritbox.mp3"),

    // Ghost voice layered into static
    whisper:   new Audio("./assets/audio/whisper.mp3"),

    doorCreak1:new Audio("./assets/audio/doorCreak1.mp3"),
    doorCreak2:new Audio("./assets/audio/doorCreak2.mp3"),
    slam1:     new Audio("./assets/audio/doorSlam1.mp3"),
    slam2:     new Audio("./assets/audio/doorSlam2.mp3"),
    ghostLaugh:new Audio("./assets/audio/ghostLaugh.mp3"),
    writing:   new Audio("./assets/audio/GhostWriting1.mp3"),
    steps: [
      new Audio("./assets/audio/step1.mp3"),
      new Audio("./assets/audio/step2.mp3"),
      new Audio("./assets/audio/step3.mp3")
    ]
  };

  // Loop flags
  Object.values(A).forEach(v=>{
    if (Array.isArray(v)) v.forEach(x=>{ if ('loop' in x) x.loop=false; });
    else if ('loop' in v) v.loop=false;
  });
  A.ambient.loop = true; A.rain.loop = true; A.clear.loop = true;
  A.spiritbox.loop = true; // Spirit box static loops

  // -------- Utils ------------------------------------------------------------
  function setVol(el, base, channel='sfx'){
    try {
      const g = PP.audio.gain;
      el.volume = Math.max(0, Math.min(1, base * (g.master||1) * (g[channel]||1)));
    } catch {}
  }
  function stop(el){ try{ el.pause(); el.currentTime=0; }catch{} }
  function play(el){ try{ el.play().catch(()=>{}); }catch{} }

  // -------- Weather routing (keep as-is; you can remove the 'ambient' bed if desired) ----
  const WEATHER = {
    Rain:  { start: ['rain', 0.35, 'ambient', 0.30] },
    Snow:  { start: ['clear',0.25, 'ambient', 0.25] },
    Clear: { start: ['clear',0.25, 'ambient', 0.30] }
  };
  let currentWeather = null;

  PP.audio.applyWeather = function(state){
    if (!state || !WEATHER[state] || currentWeather===state) return;
    currentWeather = state;
    [A.rain,A.clear,A.ambient].forEach(stop);
    const [primary, pVol, secondary, sVol] = WEATHER[state].start;
    setVol(A[primary],   pVol, 'ambient');   play(A[primary]);
    setVol(A[secondary], sVol, 'ambient');   play(A[secondary]);
    // If you want strictly weather-only ambience, comment out the two lines for "secondary".
  };

  // -------- Footsteps --------------------------------------------------------
  PP.audio.playStep = function(volume=0.45){
    const pool = A.steps; const s = pool[(Math.random()*pool.length)|0];
    try { s.currentTime=0; setVol(s, volume, 'sfx'); s.play().catch(()=>{}); } catch {}
  };

  // -------- Spirit Box: single static + layered whisper w/ ducking -----------
  let ctx=null, gStatic=null, gWhisper=null, biq=null, srcStatic=null, srcWhisper=null;

  function ensureGraph(){
    if (ctx) return true;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      srcStatic  = ctx.createMediaElementSource(A.spiritbox);
      srcWhisper = ctx.createMediaElementSource(A.whisper);

      gStatic  = ctx.createGain();   gStatic.gain.value = 1.0;
      gWhisper = ctx.createGain();   gWhisper.gain.value = 0.0;

      biq = ctx.createBiquadFilter();  // radio-ish timbre
      biq.type = 'bandpass'; biq.frequency.value = 1200; biq.Q.value = 1.2;

      srcStatic.connect(gStatic).connect(ctx.destination);
      srcWhisper.connect(biq).connect(gWhisper).connect(ctx.destination);
      return true;
    }catch(e){ console.warn('[audio] WebAudio unavailable; falling back', e); return false; }
  }

  PP.audio.spiritBox = {
    power(on){
      if (on){
        setVol(A.spiritbox, 0.55, 'sfx');
        try { A.spiritbox.play().catch(()=>{}); } catch {}
        if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{});
      } else {
        stop(A.spiritbox);
      }
    },

    // opts: {gain, duck, attack, hold, release, pitchMin, pitchMax, centerHz, Q}
    ghostSpeak(opts={}){
      const {
        gain=0.9, duck=0.65, attack=0.05, hold=0.8, release=0.35,
        pitchMin=0.92, pitchMax=1.08, centerHz=1200, Q=1.2
      } = opts;

      const ok = ensureGraph();
      const rate = pitchMin + Math.random()*(pitchMax-pitchMin);
      try { A.whisper.playbackRate = rate; } catch {}
      try { A.whisper.currentTime = 0; } catch {}
      setVol(A.whisper, 0.85, 'sfx');
      try { A.whisper.play().catch(()=>{}); } catch {}

      if (!ok){ // fallback: element-volume ducking
        const prev = A.spiritbox.volume, target = prev*duck, steps=6;
        const up = setInterval(()=>{},1); clearInterval(up); // just to ensure timers exist in some browsers
        let i=0;
        const stepUp = setInterval(()=>{ i++; A.spiritbox.volume = prev-(prev-target)*(i/steps); if(i>=steps){ clearInterval(stepUp);
          setTimeout(()=>{ let j=steps; const stepDn=setInterval(()=>{ j--; A.spiritbox.volume = prev-(prev-target)*(j/steps); if(j<=0){ clearInterval(stepDn); A.spiritbox.volume = prev; } }, (release*1000)/steps); }, hold*1000);
        } }, (attack*1000)/steps);
        return;
      }

      // WebAudio envelope + duck
      if (biq){ biq.frequency.setTargetAtTime(centerHz, ctx.currentTime, 0.01); biq.Q.setTargetAtTime(Q, ctx.currentTime, 0.01); }
      const now = ctx.currentTime, end = now+attack+hold+release;

      // Duck static
      const s0 = gStatic.gain.value;
      gStatic.gain.cancelScheduledValues(now);
      gStatic.gain.setValueAtTime(s0, now);
      gStatic.gain.linearRampToValueAtTime(s0*duck, now+attack);
      gStatic.gain.setValueAtTime(s0*duck, now+attack+hold);
      gStatic.gain.linearRampToValueAtTime(s0, end);

      // Whisper envelope
      gWhisper.gain.cancelScheduledValues(now);
      gWhisper.gain.setValueAtTime(0.0, now);
      gWhisper.gain.linearRampToValueAtTime(gain, now+attack);
      gWhisper.gain.setValueAtTime(gain, now+attack+hold);
      gWhisper.gain.linearRampToValueAtTime(0.0, end);
    }
  };

  // -------- SFX shortcuts (updated spiritbox control) ------------------------
  PP.audio.play = {
    // Turning the box "on" uses the power() API; turn off with power(false)
    spiritbox:   () => PP.audio.spiritBox.power(true),
    whisper:     () => PP.audio.spiritBox.ghostSpeak(), // optional direct trigger
    doorCreak:   () => { const x=Math.random()<0.5?A.doorCreak1:A.doorCreak2; setVol(x,0.7,'sfx'); play(x); },
    slam:        () => { const x=Math.random()<0.5?A.slam1:A.slam2; setVol(x,0.85,'sfx'); play(x); },
    ghostLaugh:  () => { setVol(A.ghostLaugh,0.75,'sfx'); play(A.ghostLaugh); },
    writing:     () => { setVol(A.writing,0.8,'sfx'); play(A.writing); }
  };

  // -------- Init / unlock ----------------------------------------------------
  PP.audio.init = function(initialWeather){
    // Silent unlock passes
    Object.values(A).forEach(v=>{
      if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=true; x.play().then(()=>x.pause()).catch(()=>{}); }catch{} });
      else { try{ v.muted=true; v.play().then(()=>v.pause()).catch(()=>{}); }catch{} }
    });
    setTimeout(()=>{
      Object.values(A).forEach(v=>{
        if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=false; }catch{} });
        else { try{ v.muted=false; }catch{} }
      });
      // Build WebAudio graph after user gesture (if supported)
      ensureGraph();
      PP.audio.applyWeather(initialWeather || (window.weather && window.weather.state) || 'Clear');
    }, 50);
  };

  // Optional: auto-adjust ambience if weather.state changes elsewhere
  (function pollWeather(){
    const ws = (window.weather && window.weather.state);
    if (ws && ws !== currentWeather) PP.audio.applyWeather(ws);
    setTimeout(pollWeather, 1000);
  })();

  // -------- Public helpers ---------------------------------------------------
  PP.audio.setGains = g => Object.assign(PP.audio.gain, g||{});
  PP.audio.stopAll = function(){
    try{
      Object.values(A).forEach(v=>{ if(Array.isArray(v)) v.forEach(stop); else stop(v); });
    }catch{}
  };
})();
