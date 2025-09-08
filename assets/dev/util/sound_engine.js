// ./assets/dev/util/sound_engine.js  (FULL FILE: registry + helpers; no autoplay)
window.PP = window.PP || {};
PP.audio = PP.audio || {};

(function soundEngine(){
  'use strict';

  // Central SFX registry. Update paths to match your repo.
  const SFX = {
    ambient:        './audio/ambient_loop.mp3',
    step1:          './audio/step1.mp3',
    step2:          './audio/step2.mp3',
    step3:          './audio/step3.mp3',
    radio:          './audio/Radio.mp3',
    singingGhost:   './audio/singingGhost.mp3',
    notebook:       './audio/Notebook.mp3',
    toss:           './audio/Toss.wav',
    doorCreak:      './audio/door_creak.mp3',
    spiritboxLoop:  './audio/spiritbox.mp3'
  };

  // Register with the modular audio system
  PP.audio.register(Object.keys(SFX).reduce((m,k)=> (m[k]={url:SFX[k]}, m), {}));

  // Convenience wrappers (optional)
  PP.audio.playStep = (i)=> PP.audio.play(['step1','step2','step3'][i%3], { volume: 0.9 });
  PP.audio.playRadio = ()=> PP.audio.play('radio', { volume: 0.8 });
  PP.audio.playAmbientLoop = ()=> PP.audio.loop('ambient', 0.35);
  PP.audio.playNotebook = ()=> PP.audio.play('notebook', { volume: 0.7 });

  // IMPORTANT: do NOT auto-play anything here.
  // Ambient or spiritbox loops should start from your game logic after:
  //  1) Start button click (PP.audio.init)
  //  2) Optional PP.audio.stagePrewarm() finished (not required to play)
})();