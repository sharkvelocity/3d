// ./assets/index3/ui_input.js
// Input bindings + movement + minimal footsteps (uses BABYLON camera collisions)

(function(){
  "use strict";

  const state = {
    keys: new Set(),
    speedWalk: 1.6,   // m/s
    speedRun: 3.0,    // m/s
    crouch: false,
    running: false,   // toggle by Shift
    footTimer: 0,
    footInterval: 0.42, // seconds between footfalls while moving
  };

  // Helper
  function on(el, ev, fn) { el && el.addEventListener(ev, fn); }
  function $(sel) { return document.querySelector(sel); }

  // === Keyboard ===
  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === "shift") { state.running = !state.running; return; }
    if (k === "control") { state.crouch = !state.crouch; return; }
    state.keys.add(k);
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    state.keys.delete(k);
  }

  // === Touch controls (already in your HTML) ===
  let touchDir = {x:0, y:0};
  on($('#t-up'),    'touchstart', ()=>{ touchDir.y =  1; });
  on($('#t-left'),  'touchstart', ()=>{ touchDir.x = -1; });
  on($('#t-right'), 'touchstart', ()=>{ touchDir.x =  1; });
  on($('#t-use'),   'touchstart', ()=>{ try { window.onUse?.(); } catch{} });

  ['t-up','t-left','t-right'].forEach(id=>{
    on($('#'+id),'touchend', ()=>{ touchDir = {x:0,y:0}; });
  });

  // === Movement integrator (called from main.js) ===
  window.handleMovement = function handleMovement(dt){
    if (!window.scene || !window.camera) return;

    // Determine intent
    let fwd = 0, str = 0;
    if (state.keys.has('w') || state.keys.has('arrowup'))    fwd += 1;
    if (state.keys.has('s') || state.keys.has('arrowdown'))  fwd -= 1;
    if (state.keys.has('a') || state.keys.has('arrowleft'))  str -= 1;
    if (state.keys.has('d') || state.keys.has('arrowright')) str += 1;

    // Merge touch
    fwd += touchDir.y;
    str += touchDir.x;

    if (fwd === 0 && str === 0) return; // no movement

    // Normalize
    const len = Math.hypot(fwd, str) || 1;
    fwd /= len; str /= len;

    // Speed
    const base = state.running ? state.speedRun : state.speedWalk;
    const speed = state.crouch ? base * 0.55 : base;

    // Direction in world space based on camera yaw
    const yaw = window.camera.rotation.y;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const dx = ( str * cos + fwd * sin) * speed * dt;
    const dz = (-str * sin + fwd * cos) * speed * dt;

    // Move with collisions
    const move = new BABYLON.Vector3(dx, 0, dz);
    try { window.camera.moveWithCollisions(move); } catch {}

    // Slight head bob while walking (optional)
    try {
      const bob = state.crouch ? 0.005 : 0.01;
      window.camera.position.y += Math.sin(performance.now()*0.02) * bob * dt;
    } catch {}
  };

  // === Simple footsteps (rate-limited) ===
  // Wire to BABYLON.Sound when available by Weather/Sound init.
  let footSound = null;
  function ensureFootSound(){
    if (footSound || !window.scene || !window.audioUnlocked) return;
    try {
      footSound = new BABYLON.Sound("footstep",
        "./assets/audio/footstep_wood_2.mp3", // swap for your preferred default
        scene,
        null,
        { loop:false, autoplay:false, volume:0.35, spatialSound:false }
      );
    } catch {}
  }

  window.updatePlayerFootsteps = function updatePlayerFootsteps(dt){
    ensureFootSound();

    // Moving?
    const moving = state.keys.has('w') || state.keys.has('a') ||
                   state.keys.has('s') || state.keys.has('d') ||
                   Math.abs(touchDir.x)+Math.abs(touchDir.y) > 0;

    if (!moving) { state.footTimer = 0; return; }

    state.footTimer += dt;
    if (state.footTimer >= state.footInterval){
      state.footTimer = 0;
      try { footSound?.play(); } catch {}
    }
  };

  // Public toggle hooks (optional)
  window.toggleRun    = ()=>{ state.running = !state.running; };
  window.toggleCrouch = ()=>{ state.crouch  = !state.crouch; };

  // === Init ===
  window.initUI = function initUI(){
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Show touch controls only on touch devices
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const tc = $('#touch-controls'); if (tc) tc.style.display = touch ? 'grid' : 'none';

    // Also bind Start button to unlock audio (Weather will set audioUnlocked=true)
    const start = document.getElementById('start-button');
    if (start) start.addEventListener('click', ()=>{ /* no-op; main handles audio unlock */ });
  };

  // Auto-init if main loaded first
  try { if (document.readyState !== "loading") initUI(); else document.addEventListener('DOMContentLoaded', initUI); } catch {}

})();
