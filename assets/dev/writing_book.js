<script>
(function(){
  let SCENE=null, ENGINE=null, CAMERA=null;
  let BOOK_PLACED=false, BOOK_POS=null, BOOK_WRITTEN=false, cooldown=0;
  const SFX={ write:null, toss:null };

  function whenScene(cb){ (function w(){ if(window.scene){ cb(window.scene); } else requestAnimationFrame(w); })(); }
  function say(msg){ try{ toast?.(msg); }catch(_){ console.log('[Book]',msg); } }
  function aimPointOnGround(scene, maxDist=5){
    try{
      const cam=scene.activeCamera, ray=cam.getForwardRay(maxDist);
      const pick=scene.pickWithRay(ray, m=>m?.isPickable!==false);
      return pick?.hit ? pick.pickedPoint : cam.position.add(ray.direction.scale(Math.min(maxDist,3.5)));
    }catch(_){ return BABYLON.Vector3.Zero(); }
  }
  function ensureSfx(scene){
    try{
      const base={ loop:false, autoplay:false, spatialSound:true, refDistance:2, rolloffFactor:1.2, maxDistance:25 };
      SFX.write=SFX.write||new BABYLON.Sound('bookWrite','./assets/audio/GhostWriting1.mp3', scene, null, { ...base, volume:0.9 });
      SFX.toss =SFX.toss ||new BABYLON.Sound('bookToss', './assets/audio/Toss.wav',        scene, null, { ...base, volume:0.85 });
    }catch(_){}
  }

  window.dropWritingBook = function(){
    if (!SCENE) return;
    BOOK_PLACED=true; BOOK_WRITTEN=false;
    const p=aimPointOnGround(SCENE,3.8) || CAMERA?.position || BABYLON.Vector3.Zero();
    BOOK_POS = new BABYLON.Vector3(p.x,p.y,p.z); cooldown=2; say('Book dropped');
  };

  function isShadeAndPlayerInRoom(){
    try{
      const isShade = ((window.ghost?.type||'').toLowerCase()==='shade');
      const same = (typeof window.currentRoomName==='function' && window.ghost?.roomName && currentRoomName()===window.ghost.roomName);
      return isShade && same;
    }catch(_){ return false; }
  }
  function hasWritingEvidence(){
    try{ return typeof ghostHasEvidence==='function' ? ghostHasEvidence('writing') : true; }catch(_){ return true; }
  }

  whenScene(function(scene){
    SCENE=scene; ENGINE=scene.getEngine?.(); CAMERA=scene.activeCamera; ensureSfx(scene);

    scene.onBeforeRenderObservable.add(()=>{
      const dt=(ENGINE?.getDeltaTime?.()||16.7)/1000;
      if (cooldown>0) cooldown-=dt;
      if (!BOOK_PLACED || !BOOK_POS || cooldown>0) return;

      const gpos = window.ghost?.position || BABYLON.Vector3.Zero();
      if (BABYLON.Vector3.Distance(BOOK_POS, gpos) >= 3.2) return;

      if (isShadeAndPlayerInRoom()) return;

      if (hasWritingEvidence()){
        if (Math.random() < 0.5){
          try{ SFX.write?.setPosition(BOOK_POS); SFX.write?.stop(); SFX.write?.play(); }catch(_){}
          BOOK_WRITTEN=true; cooldown=10; say('Ghost wrote in book!');
        }else{
          try{ SFX.toss?.setPosition(BOOK_POS); SFX.toss?.stop(); SFX.toss?.play(); }catch(_){}
          BOOK_PLACED=false; cooldown=5; say('The book was tossed!');
        }
      } else {
        try{ SFX.toss?.setPosition(BOOK_POS); SFX.toss?.stop(); SFX.toss?.play(); }catch(_){}
        BOOK_PLACED=false; cooldown=5; say('The book was tossed!');
      }
    });
  });
})();
</script>
