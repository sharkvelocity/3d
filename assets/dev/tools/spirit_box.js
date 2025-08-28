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
      // Your originals:
      staticSnd = staticSnd || new BABYLON.Sound('sbox_static','./assets/audio/spiritbox.mp3', s, null, { loop:true, autoplay:false, volume:0.35 });
      speakSnd  = speakSnd  || new BABYLON.Sound('sbox_voice','./assets/audio/whisper.mp3',  s, null, { loop:false, autoplay:false, volume:0.9 });
    }catch(_){}
    // Fallback to a single file spiritbox.mp3 if those aren’t present
    try{ if (!staticSnd) staticSnd = new BABYLON.Sound('sbox_static','./assets/audio/spiritbox.mp3', s, null, { loop:true, autoplay:false, volume:0.35 }); }catch(_){}
    try{ if (!speakSnd)  speakSnd  = new BABYLON.Sound('sbox_voice','./assets/audio/spiritbox.mp3',  s, null, { loop:false, autoplay:false, volume:0.9  }); }catch(_){}
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

/* ---- Storage registration (Spirit Box item) ---- */
(function(){
  if (!window.registerItem) return;
  registerItem({
    id: "spirit_box",
    name: "Spirit Box",
    icon: "./assets/icons/spirit_box.png",
    defaultCharges: Infinity,
    onEquip(){ try{ window.SpiritBoxAudio?.on(); }catch(_){} }
  });

  // Optional hotkey: R to “ask” when equipped
  if (!window.__SBOX_keybound){
    window.__SBOX_keybound = true;
    window.addEventListener("keydown", (e)=>{
      if ((e.key === "r" || e.key === "R") && window.inventory){
        const slot = window.activeItemSlot || 1;
        if (window.inventory.slots?.[slot] === "Spirit Box"){
          try{ window.SpiritBoxAudio?.speak(); }catch(_){}
        }
      }
    });
  }
})();
