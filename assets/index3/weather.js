// ./assets/index3/weather.js
// Weather system + ambient/rain audio using BABYLON.Sound
(function(){
  "use strict";

  const S = {
    state: "Clear",          // "Clear" | "Rainstorm"
    ready: false,
    sounds: { ambient: null, clear: null, rain: null },
    volumes: {
      ambient: 0.7,          // bumped louder
      clear:   0.0,
      rain:    0.6
    }
  };

  function ensureSounds(){
    if (S.ready || !window.scene || !window.audioUnlocked) return;
    try {
      S.sounds.ambient = new BABYLON.Sound("amb", "./assets/audio/ambient.mp3", scene, null,
        { loop:true, autoplay:false, volume:S.volumes.ambient, spatialSound:false }
      );
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

  function applyState(){
    if (!S.ready) return;

    // Apply volumes (live-tweakable)
    try { S.sounds.ambient?.setVolume(S.volumes.ambient); } catch {}
    try { S.sounds.clear?.setVolume(S.volumes.clear); } catch {}
    try { S.sounds.rain?.setVolume(S.volumes.rain); } catch {}

    // Ambient always on
    try { if (S.sounds.ambient && !S.sounds.ambient.isPlaying) S.sounds.ambient.play(); } catch {}

    if (S.state === "Clear"){
      try { S.sounds.rain?.stop(); } catch {}
    } else if (S.state === "Rainstorm"){
      try { if (S.sounds.rain && !S.sounds.rain.isPlaying) S.sounds.rain.play(); } catch {}
    }

    const hw = document.getElementById('hud-weather');
    if (hw) hw.textContent = S.state;
  }

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
    update(dt){ /* reserved for future effects */ }
  };

})();
