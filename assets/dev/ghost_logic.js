<script>
(function(){
  // Public ghost object + API
  const g = (window.ghost = window.ghost || {});
  if (!(g.position instanceof BABYLON.Vector3)) g.position = new BABYLON.Vector3(0,0,0);
  g.type = g.type || 'Spirit';
  g.roomCenter = g.roomCenter || new BABYLON.Vector3(2,0,2);
  g.wanderRadius = g.wanderRadius || 8;
  g.visible = !!g.visible;
  g.roomName = g.roomName || 'House'; // optional

  window.setGhostType = (name)=>{ g.type = String(name||'Spirit'); };
  window.getGhostType = ()=> g.type;

  // Optional current room helper (used by Shade/DOTS/Writing)
  window.currentRoomName = window.currentRoomName || function(){ return g.roomName || 'House'; };

  // Simple event bus
  function emit(name, detail){
    try{ window.dispatchEvent(new CustomEvent(name, { detail })); }catch(_){}
  }

  function whenScene(cb){ (function wait(){ if (window.scene) cb(window.scene); else requestAnimationFrame(wait); })(); }

  // SFX local
  const SFX = {};
  function ensureSfx(scene){
    const opt = { loop:false, autoplay:false };
    try{
      SFX.whisper = SFX.whisper || new BABYLON.Sound('ga_whisper','./assets/audio/whisper.mp3', scene, null, { ...opt, volume:0.7 });
      SFX.slam1   = SFX.slam1   || new BABYLON.Sound('ga_slam1','./assets/audio/doorSlam1.mp3', scene, null, { ...opt, volume:0.9 });
      SFX.slam2   = SFX.slam2   || new BABYLON.Sound('ga_slam2','./assets/audio/doorSlam2.mp3', scene, null, { ...opt, volume:0.9 });
      SFX.creak1  = SFX.creak1  || new BABYLON.Sound('ga_creak1','./assets/audio/doorCreak1.mp3', scene, null, { ...opt, volume:0.7 });
      SFX.creak2  = SFX.creak2  || new BABYLON.Sound('ga_creak2','./assets/audio/doorCreak2.mp3', scene, null, { ...opt, volume:0.7 });
      SFX.toss    = SFX.toss    || new BABYLON.Sound('ga_toss',  './assets/audio/Toss.wav',       scene, null, { ...opt, volume:0.85 });
      SFX.radio   = SFX.radio   || new BABYLON.Sound('ga_radio', './assets/audio/Radio.mp3',      scene, null, { ...opt, volume:0.85 });
    }catch(_){}
  }
  const randCreak = ()=>{ try{ (Math.random()<0.5?SFX.creak1:SFX.creak2)?.play(); }catch(_){} };
  const randSlam  = ()=>{ try{ (Math.random()<0.5?SFX.slam1:SFX.slam2)?.play(); }catch(_){} };

  whenScene(function(scene){
    ensureSfx(scene);
    let t=0, next=8+Math.random()*12, radioCD=0;
    let wanderTarget = g.roomCenter.clone();

    scene.onBeforeRenderObservable.add(()=>{
      const dt = (scene.getEngine()?.getDeltaTime?.()||16.7)/1000;

      // Wander
      if (Math.random()<0.01){
        const dx=(Math.random()-0.5)*4, dz=(Math.random()-0.5)*4;
        wanderTarget = g.roomCenter.add(new BABYLON.Vector3(dx,0,dz));
      }
      const to = wanderTarget.subtract(g.position); to.y=0;
      const L = to.length(); if (L>0.01) g.position = g.position.add(to.normalize().scale(Math.min(L, dt*0.6)));

      // Timer
      t += dt; if (radioCD>0) radioCD -= dt;
      if (t >= next){
        t=0; next=8+Math.random()*12;

        const isShade = (g.type||'').toLowerCase()==='shade';
        const sameRoom = typeof window.currentRoomName==='function' && g.roomName && currentRoomName()===g.roomName;
        if (!(isShade && sameRoom)){
          const r = Math.random();
          if (r < 0.25) { try{ SFX.whisper?.stop(); SFX.whisper?.play(); }catch(_){} emit('ghost:whisper',{pos:g.position.clone()}); }
          else if (r < 0.55) { randCreak(); emit('ghost:creak',{pos:g.position.clone()}); }
          else if (r < 0.80) { randSlam();  emit('ghost:slam',{pos:g.position.clone()}); }
          else { try{ SFX.toss?.stop(); SFX.toss?.play(); }catch(_){} emit('ghost:toss',{pos:g.position.clone()}); }
        }

        // EMF sustain if near player
        try{
          const cam = scene.activeCamera;
          if (cam && window.EMFAudio?.extend){
            const d = BABYLON.Vector3.Distance(cam.position, g.position||BABYLON.Vector3.Zero());
            if (d < 6.0) EMFAudio.extend(10 + Math.random()*5);
          }
        }catch(_){}

        // Occasional radio
        if (radioCD<=0 && Math.random()<0.2){
          try{ SFX.radio?.stop(); SFX.radio?.play(); }catch(_){}
          radioCD = 18 + Math.random()*20;
          emit('ghost:radio',{pos:g.position.clone()});
        }
      }
    });
  });
})();
</script>
