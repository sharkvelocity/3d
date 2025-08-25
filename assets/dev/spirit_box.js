<script>
(function(){
  const SB = (window.SpiritBoxAudio = window.SpiritBoxAudio || {});
  let scene=null, on=false, noise=null, voice=null;

  function whenScene(cb){ (function w(){ if(window.scene){ cb(window.scene); } else requestAnimationFrame(w); })(); }
  function ensure(sceneRef){
    scene=sceneRef;
    if (!noise) noise=new BABYLON.Sound('sb_noise','./assets/audio/static.mp3', scene, null, { loop:true, autoplay:false, volume:0.35 });
    if (!voice) voice=new BABYLON.Sound('sb_voice','./assets/audio/ghostVoice.mp3', scene, null, { loop:false, autoplay:false, volume:0.9, spatialSound:true, maxDistance:25, refDistance:2 });
  }
  SB.on = function(){ if(!scene) return; try{ noise?.play(); on=true; }catch(_){ } };
  SB.off=function(){ try{ noise?.stop(); on=false; }catch(_){ } };
  SB.isOn=()=>on;

  SB.speak=function(){
    if (!on || !scene) return;
    try{
      const cam=scene.activeCamera, gpos=(window.ghost?.position)||cam?.position||BABYLON.Vector3.Zero();
      voice?.setPosition?.(gpos); voice?.stop?.(); voice?.play?.();
    }catch(_){}
  };

  function nearGhost(){
    try{
      const cam=scene.activeCamera, gpos=(window.ghost?.position)||BABYLON.Vector3.Zero();
      return cam ? BABYLON.Vector3.Distance(cam.position,gpos)<5.5 : false;
    }catch(_){ return false; }
  }
  window.askSpiritBox = function(text){
    if (!on) return;
    const ok = (typeof ghostHasEvidence!=='function' || ghostHasEvidence('spiritbox')) && nearGhost() && Math.random()<0.20;
    if (ok) SB.speak(); else try{ toast?.(`...static... "${text||'Question'}"`); }catch(_){}
  };

  whenScene(ensure);
})();
</script>
