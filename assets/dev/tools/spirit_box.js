// spirit_box.js
// Spirit box logic + UI hook + audio stubs that rely on SoundEngine being present.

(function(){
  'use strict';
  if (window.SpiritBoxAudio) return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  let on = false, staticSnd=null, speakSnd=null;

  function ensure(){
    const s=SCENE(); if (!s) return;
    try{
      staticSnd = staticSnd || new BABYLON.Sound('sbox_static','./assets/audio/spiritbox_static.mp3', s, null, { loop:true, autoplay:false, volume:0.35 });
      speakSnd  = speakSnd  || new BABYLON.Sound('sbox_voice','./assets/audio/spiritbox_voice.mp3',  s, null, { loop:false, autoplay:false, volume:0.9 });
    }catch(_){}
  }

  const API = {};
  API.on = function(){ ensure(); try{ staticSnd?.play(); on=true; }catch(_){ on=true; } };
  API.off = function(){ try{ staticSnd?.stop(); }catch(_){ } on=false; };
  API.isOn = function(){ return on; };
  API.speak = function(){ ensure(); try{ speakSnd?.stop(); speakSnd?.play(); }catch(_){} };

  window.SpiritBoxAudio = API;

  // Optional UI binding (buttons with .sbox-q class)
  setTimeout(()=>{
    const wrap = document.getElementById('sbox-questions'); if (!wrap) return;
    function ask(q){
      if (!on) return;
      const near = true; // simplified; hook to ghost distance if needed
      const ok = (window.ghostHasEvidence? ghostHasEvidence('spiritbox') : true) && near && Math.random()<0.25;
      if (ok) API.speak();
    }
    wrap.querySelectorAll('.sbox-q').forEach(btn=>{
      btn.addEventListener('click', ()=> ask(btn.textContent?.trim()||'Question'));
    });
  }, 0);
})();
