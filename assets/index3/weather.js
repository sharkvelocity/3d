// ./assets/index3/weather.js
// Weather system + ambient audio using BABYLON.Sound (Clear/Rainstorm)

(function(){
  "use strict";

  const S = {
    state: "Clear",          // "Clear" | "Rainstorm"
    ready: false,
    sounds: {
      ambient: null,
      clear:   null,         // optional separate clear loop if you want
      rain:    null
    },
    volumes: {
      ambient: 0.35,
      clear:   0.0,
      rain:    0.55
    }
  };

  // Create sounds once we have a scene and audio is unlocked
  function ensureSounds(){
    if (S.ready || !window.scene || !window.audioUnlocked) return;

    try {
      S.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", scene, null,
        { loop:true, autoplay:false, volume:S.volumes.ambient, spatialSound:false }
      );
      // Optional "clear" separate bed (disabled by default)
      S.sounds.clear   = new BABYLON.Sound("clear", "./assets/audio/clearWeather.mp3", scene, null,
        { loop:true, autoplay:false, volume:S.volumes.clear, spatialSound:false }
      );
      S.sounds.rain    = new BABYLON.Sound("rain", "./assets/audio/rainstorm.mp3", scene, null,
        { loop:true, autoplay:false, volume:S.volumes.rain, spatialSound:false }
      );

      S.ready = true;
    } catch (e) {
      console.warn("[weather] sound init failed", e);
    }
  }

  function playIf(snd){
    try { if (snd && !snd.isPlaying) snd.play(); } catch {}
  }
  function stopIf(snd){
    try { if (snd && snd.isPlaying) snd.stop(); } catch {}
  }

  function applyState(){
    if (!S.ready) return;

    // Always keep ambient on softly
    playIf(S.sounds.ambient);

    if (S.state === "Clear"){
      stopIf(S.sounds.rain);
      // you can also fade volumes if you prefer
      try { S.sounds.clear?.setVolume(S.volumes.clear); } catch {}
    } else if (S.state === "Rainstorm"){
      playIf(S.sounds.rain);
    }

    // Update HUD label if present
    try {
      const hw = document.getElementById('hud-weather');
      if (hw) hw.textContent = S.state;
    } catch {}
  }

  // Public API
  window.Weather = {
    set(state){
      if (state !== "Clear" && state !== "Rainstorm") return;
      S.state = state;
      applyState();
    },
    init(){
      ensureSounds();
      applyState();
    },
    update(dt){
      // hook for future effects (wind gusts, lightning)
    }
  };

  // Let main call Weather.init() after audio unlocked
})();
