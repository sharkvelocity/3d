// ===== PhasmaPhoney GLUE PATCH =====
(function(){

  // --- tiny helpers ---
  function S(){ return window.SCENE || (BABYLON.EngineStore && BABYLON.EngineStore.LastCreatedScene) || null; }
  function C(){ const s=S(); return s && (s.activeCamera || (s.cameras && s.cameras[0])) || null; }
  function near(a,b,t){ return Math.abs(a-b) <= (t||1e-6); }

  // --- evidence check (noninvasive) ---
  // Looks for PP.evidence.has('spiritbox'), falls back to ghost_db.js style
  function ghostHasEvidence(key){
    try{
      if (window.PP && PP.evidence && typeof PP.evidence.has === 'function') { return !!PP.evidence.has(key); }
      const type = (window.ghost && ghost.type || (window.PP && PP.ghost && PP.ghost.type) || 'spirit').toLowerCase();
      const DB = window.GHOST_DB || window.ghost_db || [];
      const rec = DB.find(g => (g.name||'').toLowerCase() === type);
      return !!(rec && Array.isArray(rec.ev) && rec.ev.includes(key));
    }catch(_){ return false; }
  }

  // ==========================================================
  // Spirit Box: UI + logic
  // ==========================================================
  (function ensureSpiritBoxUI(){
    if (document.getElementById('sbox-questions')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sbox-questions';
    wrap.style.cssText = 'display:none; position:fixed; left:50%; bottom:12px; transform:translateX(-50%); z-index:7001; background:rgba(0,0,0,0.7); border:1px solid #066; border-radius:10px; padding:10px; color:#0ff; font:13px monospace; max-width:90vw;';
    wrap.innerHTML = '<div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">'
      + ['Where are you?','How old are you?','Are you friendly?','Give us a sign','Can you speak?','Do you want us here?']
        .map(q=>`<button class="hud-btn sbox-q">${q}</button>`).join('')
      + '</div>';
    document.body.appendChild(wrap);
  })();

  // spirit box audio facade (uses your audio engine if exposed)
  if (!window.SpiritBoxAudio){
    window.SpiritBoxAudio = (function(){
      let active=false, loop=null, voice=null, lastSpeakAt=0;
      function ensure(){
        const s=S(); if(!s) return;
        try{
          loop  = loop  || new BABYLON.Sound('spbox_loop','./assets/audio/spiritbox.mp3',s,null,{loop:true, autoplay:false, volume:0.45});
          voice = voice || new BABYLON.Sound('spbox_voice','./assets/audio/whisper.mp3',s,null,{loop:false, autoplay:false, volume:0.9});
        }catch(_){}
      }
      function on(){ active=true; ensure(); try{ if(loop && !loop.isPlaying) loop.play(); }catch(_){ } }
      function off(){ active=false; try{ loop&&loop.stop(); }catch(_){ } try{ voice&&voice.stop(); }catch(_){ } }
      function isOn(){ return !!active; }
      function speak(){
        if(!active || !ghostHasEvidence('spiritbox')) return;
        const now = (performance && performance.now? performance.now(): Date.now());
        if (now - lastSpeakAt < 1500) return;
        lastSpeakAt = now;
        ensure();
        try{ if(loop && !loop.isPlaying) loop.play(); }catch(_){}
        try{ voice && voice.play(); }catch(_){}
      }
      return { on, off, isOn, speak };
    })();
  }

  // show/hide logic (if your module already binds, this is inert)
  (function bindSBoxUI(){
    const wrap = document.getElementById('sbox-questions'); if(!wrap) return;
    wrap.addEventListener('click', (e)=>{
      const b = e.target.closest('.sbox-q'); if(!b) return;
      if(!SpiritBoxAudio.isOn()) return;
      // 20% on-click if near ghost AND has evidence; else show static toast
      try{
        const s=S(), cam=C(); if(!s || !cam) return;
        const gp = (window.ghost && ghost.position) ? ghost.position : (PP && PP.ghost && PP.ghost.position) || null;
        const near = gp ? BABYLON.Vector3.Distance(cam.position, gp) < 5.5 : true;
        if(ghostHasEvidence('spiritbox') && near && Math.random() < 0.20){ SpiritBoxAudio.speak(); }
      }catch(_){}
    });
  })();

  // passive 1% chance while ON and near
  (function passiveSpiritTick(){
    function tick(){
      try{
        if (!SpiritBoxAudio.isOn() || !ghostHasEvidence('spiritbox')) return setTimeout(tick, 900);
        const cam=C(); const gp = (window.ghost && ghost.position) ? ghost.position : (PP && PP.ghost && PP.ghost.position) || null;
        if (cam && gp && BABYLON.Vector3.Distance(cam.position, gp) < 5.5 && Math.random() < 0.01){ SpiritBoxAudio.speak(); }
      }catch(_){}
      setTimeout(tick, 900);
    }
    setTimeout(tick, 1200);
  })();

  // ==========================================================
  // EMF Audio (beeps + EMF-5 sustain)
  // ==========================================================
  if (!window.EMFAudio){
    window.EMFAudio = (function(){
      let ctx = (BABYLON.Engine && BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.audioContext) || null;
      let gain = null, osc = null, sustainUntil = 0;
      function ensure(){
        try{
          ctx = ctx || (BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.audioContext) || new (window.AudioContext||window.webkitAudioContext)();
          if(!gain){ gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); }
          if(!osc){ osc = ctx.createOscillator(); osc.type='square'; osc.frequency.setValueAtTime(660, ctx.currentTime); osc.connect(gain); try{osc.start();}catch(_){ } }
          return true;
        }catch(_){ return false; }
      }
      function setVol(v){ try{ gain && gain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);}catch(_){ } }
      function beep(){ if(!ensure()) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type='square'; o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.value=0; o.connect(g); g.connect(ctx.destination);
        o.start();
        g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.01);
        g.gain.linearRampToValueAtTime(0.0,  ctx.currentTime + 0.12);
        o.stop(ctx.currentTime + 0.14);
      }
      function startEMF5(seconds){
        if(!ensure()) return;
        const now = performance.now?performance.now():Date.now();
        const add = Math.max(0.5, seconds||10);
        sustainUntil = Math.max(sustainUntil, now + add*1000);
        setVol(0.20);
      }
      function extend(seconds){
        if(!ensure()) return;
        const now = performance.now?performance.now():Date.now();
        const add = Math.max(0.5, seconds||10);
        sustainUntil = Math.max(sustainUntil, now + add*1000);
      }
      // poll to drop sustain
      (function poll(){
        const now = performance.now?performance.now():Date.now();
        if (sustainUntil && now > sustainUntil) setVol(0.0);
        requestAnimationFrame(poll);
      })();
      return { beep, startEMF5, extend };
    })();
  }

  // Patch a global EMF ping if present
  if (typeof window.pingEMF === 'function'){
    const orig = window.pingEMF;
    window.pingEMF = function(){
      try{
        EMFAudio.beep();
        if (ghostHasEvidence('emf')){
          // near player? try generous default
          const cam=C(), gp = (window.ghost && ghost.position) ? ghost.position : (PP && PP.ghost && PP.ghost.position) || null;
          const near = cam && gp ? BABYLON.Vector3.Distance(cam.position, gp) < 4.0 : true;
          if (near){ EMFAudio.startEMF5(10 + Math.random()*5); }
        }
      }catch(_){}
      try{ return orig.apply(this, arguments); }catch(_){}
    };
  }

  // ==========================================================
  // Footsteps
  // ==========================================================
  (function Footsteps(){
    const s=S(); if(!s) return;
    let s1=null,s2=null,s3=null,last=0;
    try{
      s1 = new BABYLON.Sound('step1','./assets/audio/step1.wav',s,null,{volume:0.6});
      s2 = new BABYLON.Sound('step2','./assets/audio/step2.wav',s,null,{volume:0.6});
      s3 = new BABYLON.Sound('step3','./assets/audio/step3.wav',s,null,{volume:0.6});
    }catch(_){}
    let prev = null;
    function tick(){
      const cam=C(); if(!cam) return requestAnimationFrame(tick);
      const now = performance.now?performance.now():Date.now();
      if(prev){
        const dx = cam.position.x - prev.x;
        const dy = cam.position.y - prev.y;
        const dz = cam.position.z - prev.z;
        const dist = Math.hypot(dx, dz);
        const moving = dist > 0.01;
        const grounded = Math.abs(dy) < 0.02 || (cam.applyGravity===true);
        if(moving && grounded && now - last > 260){
          last = now;
          const pick = [s1,s2,s3][Math.floor(Math.random()*3)];
          try{ pick && pick.play(); }catch(_){}
        }
      }
      prev = {x: cam.position.x, y: cam.position.y, z: cam.position.z};
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  // ==========================================================
  // Safety floor at origin (after map load)
  // ==========================================================
  (function safetyFloor(){
    function add(){
      const s=S(); if(!s) return setTimeout(add, 200);
      if (s.__safetyFloor) return;
      const g = BABYLON.MeshBuilder.CreateGround('safetyFloor',{width:24,height:24}, s);
      g.position = new BABYLON.Vector3(0,0,0);
      g.checkCollisions = true; g.receiveShadows = true;
      s.__safetyFloor = g;
    }
    // try both: once soon, and again after 2s in case map loads late
    setTimeout(add, 300);
    setTimeout(add, 2500);
  })();

  // Expose a tiny facade if your ghost logic wants to explicitly extend EMF-5
  window.PP_SDK = window.PP_SDK || {};
  window.PP_SDK.extendEMF5 = function(sec){ try{ EMFAudio.extend(sec||10); }catch(_){ } };

})();
