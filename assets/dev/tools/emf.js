// File: ./assets/dev/tools/emf.js
(function(){
  'use strict';
  if (window.__EMFReady) return; window.__EMFReady = true;

  const EMF = window.EMF = window.EMF || {};

  // ---------------- Configuration ----------------
  EMF.decayRate = 0.5;       // units per second
  EMF.maxLevel = 5;          // EMF 1–5
  EMF.readRadius = 3.0;      // player distance for EMF detection
  EMF.beepDuration = 0.15;   // seconds per beep
  EMF.beepCooldown = 0.1;    // seconds between beeps
  EMF.signals = [];

  // Distinct frequencies per EMF level (Hz)
  EMF.levelFreq = [220, 330, 440, 550, 660]; // EMF 1 → low, EMF 5 → high

  let lastBeepTime = 0;

  // ---------------- Trigger EMF ----------------
  EMF.trigger = function(source, {pos, level}){
    if (!pos || typeof level !== 'number') return;
    EMF.signals.push({
      pos: pos.clone(),
      level: Math.min(Math.max(level, 1), EMF.maxLevel),
      source,
      timestamp: performance.now()/1000
    });
  };

  // ---------------- Query EMF near player ----------------
  EMF.readLevelAt = function(playerPos){
    let maxLevel = 0;
    EMF.signals.forEach(sig=>{
      const dist = BABYLON.Vector3.Distance(sig.pos, playerPos);
      if (dist <= EMF.readRadius){
        const factor = 1 - (dist/EMF.readRadius);
        const level = Math.ceil(sig.level * factor);
        if (level > maxLevel) maxLevel = level;
      }
    });
    return Math.min(maxLevel, EMF.maxLevel);
  };

  // ---------------- Decay EMF ----------------
  function decayLoop(){
    const decayDelta = EMF.decayRate * (1/60);
    for (let i=EMF.signals.length-1; i>=0; i--){
      EMF.signals[i].level -= decayDelta;
      if (EMF.signals[i].level <= 0) EMF.signals.splice(i,1);
    }
    requestAnimationFrame(decayLoop);
  }
  decayLoop();

  // ---------------- Audio Beep ----------------
  function beep(freq, duration){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }catch(_){}
  }

  function handleBeep(){
    const now = performance.now()/1000;
    const player = window.player?.position || new BABYLON.Vector3(0,0,0);
    const level = EMF.readLevelAt(player);

    if (level > 0 && (now - lastBeepTime) >= EMF.beepCooldown){
      lastBeepTime = now;
      const freq = EMF.levelFreq[level-1]; // index 0 → level 1
      beep(freq, EMF.beepDuration);
    }

    requestAnimationFrame(handleBeep);
  }
  handleBeep();

  // ---------------- Optional Debug ----------------
  EMF.debug = true;
  function renderDebug(){
    if (!EMF.debug) return;
    const player = window.player?.position || new BABYLON.Vector3(0,0,0);
    const val = EMF.readLevelAt(player);
    let dbg = document.getElementById('emf-debug');
    if (!dbg){
      dbg = document.createElement('div'); dbg.id='emf-debug';
      dbg.style.position='fixed';
      dbg.style.bottom='120px';
      dbg.style.right='20px';
      dbg.style.color='cyan';
      dbg.style.background='rgba(0,0,0,0.5)';
      dbg.style.padding='4px 8px';
      dbg.style.fontFamily='monospace';
      dbg.style.zIndex=9999;
      document.body.appendChild(dbg);
    }
    dbg.textContent = `EMF Level: ${val} (${EMF.signals.length} signals)`;
    requestAnimationFrame(renderDebug);
  }
  renderDebug();

})();
