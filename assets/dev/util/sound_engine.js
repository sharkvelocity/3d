// ./assets/dev/util/sound_engine.js
window.PP = window.PP || {};
PP.audio = PP.audio || {};

(function soundEngine(){
  'use strict';

  // Central SFX registry. Update paths to match your repo.
  const SFX = {
    ambient:         './audio/clearWeather.mp3', // Clear weather ambient
    rainstorm:       './audio/rainstorm.mp3',
    snow:            './audio/snow.mp3',
    thunder1:        './audio/thunder.mp3',
    thunderLoud:     './audio/thunder_loud.mp3',
    thunderRumble:   './audio/thunder_rumble.mp3',
    step1:           './audio/step1.mp3',
    step2:           './audio/step2.mp3',
    step3:           './audio/step3.mp3',
    radio:           './audio/radio.mp3',
    singingGhost:    './audio/singingGhost.mp3',
    notebook:        './audio/notebook_open.mp3',
    toss:            './audio/Toss.wav',
    doorCreak:       './audio/door_creak.mp3',
    spiritboxLoop:   './audio/spiritbox.mp3'
  };

  // Register with the modular audio system
  PP.audio.register(Object.keys(SFX).reduce((m,k)=> (m[k]={url:SFX[k]}, m), {}));

  // Convenience wrappers
  PP.audio.playStep = (i)=> PP.audio.play(['step1','step2','step3'][i%3], { volume: 0.9 });
  PP.audio.playRadio = ()=> PP.audio.play('radio', { volume: 0.8 });
  PP.audio.playNotebook = ()=> PP.audio.play('notebook', { volume: 0.7 });
  PP.audio.loopAmbient = ()=> PP.audio.loop('ambient', 0.35);
  PP.audio.loopSnow = ()=> PP.audio.loop('snow', 0.25);
  PP.audio.loopRainstorm = ()=> PP.audio.loop('rainstorm', 0.6);

  // Weather manager (subtle rain + random thunder)
  PP.audio.weather = (function(){
    let rainAudio, thunderTimeout;
    const thunderFiles = ['thunder1','thunderLoud','thunderRumble'];

    function startRain(scene){
      rainAudio = PP.audio.loop('rainstorm', 0.6);
      scheduleThunder(scene);
    }

    function stopRain(){
      if(rainAudio) rainAudio.stop();
      clearTimeout(thunderTimeout);
    }

    function scheduleThunder(scene){
      // Random delay: 5–15s for subtle effect
      const delay = 5000 + Math.random()*10000;
      thunderTimeout = setTimeout(()=>{
        playRandomThunder(scene);
        scheduleThunder(scene);
      }, delay);
    }

    function playRandomThunder(scene){
      const file = thunderFiles[Math.floor(Math.random()*thunderFiles.length)];
      PP.audio.play(file, { volume: 0.4 + Math.random()*0.3 }); // subtle
      // Optionally add screen flash / lightning effect here
      if(scene?.effects?.flashLightning){
        scene.effects.flashLightning();
      }
    }

    return { startRain, stopRain };
  })();

  // Important: do NOT autoplay here; start from game logic after player starts
})();
