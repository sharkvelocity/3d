// ./assets/index3/ui_input.js
// Input bindings + movement + minimal footsteps (uses BABYLON camera collisions)
// Hardened against events with missing e.key; ignores inputs/contenteditable.

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
    lastToggleAt: 0
  };

  function $(sel) { return document.querySelector(sel); }
  function on(el, ev, fn, opts) { el && el.addEventListener(ev, fn, opts); }

  function isTypingTarget(el){
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function keyNameSafe(e){
    // Return lowercased key string or "" if unavailable
    if (!e) return "";
    if (typeof e.key === "string" && e.key.length) return e.key.toLowerCase();
    // Fallback for older browsers
    if (typeof e.code === "string" && e.code.length) return e.code.toLowerCase();
    return "";
  }

  function preventIfMovementKey(k, e){
    if (!e) return;
    if (k === "w" || k === "a" || k === "s" || k === "d" ||
        k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright"){
      e.preventDefault?.();
    }
  }

  function debounceToggle(){
    const now = performance.now();
    if (now - state.lastToggleAt < 120) return false; // 120ms guard
    state.lastToggleAt = now;
    return true;
  }

  // === Keyboard ===
  function onKeyDown(e) {
    if (isTypingTarget(document.activeElement)) return;
    const k = keyNameSafe(e);
    if (!k) return;

    preventIfMovementKey(k, e);

    if (k === "shift"){
      if (debounceToggle()) state.running = !state.running;
      return;
    }
    if (k === "control"){
      if (debounceToggle()) state.crouch = !state.crouch;
      return;
    }

    state.keys.add(k);
  }

  function onKeyUp(e) {
    if (isTypingTarget(document.activeElement)) return;
    const k = keyNameSafe(e);
    if (!k) return;
    state.keys.delete(k);
  }

  // === Touch controls (already in your HTML) ===
  let touchDir = {x:0, y:0};
  on($('#t-up'),    'touchstart', ()=>{ touchDir.y =  1; }, {passive:true});
  on($('#t-left'),  'touchstart', ()=>{ touchDir.x = -1; }, {passive:true});
  on($('#t-right'), 'touchstart', ()=>{ touchDir.x =  1; }, {passive:true});
  on($('#t-use'),   'touchstart', ()=>{ try { window.onUse?.(); } catch{} }, {passive:true});

  ['t-up','t-left','t-right'].forEach(id=>{
    on($('#'+id),'touchend', ()=>{ touchDir = {x:0,y:0}; }, {passive:true});
    on($('#'+id),'touchcancel', ()=>{ touchDir = {x:0,y:0}; }, {passive:true});
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

    const moving = state.keys.has('w') || state.keys.has('a') ||
                   state.keys.has('s') || state.keys.has('d') ||
                   state.keys.has('arrowup') || state.keys.has('arrowdown') ||
                   state.keys.has('arrowleft') || state.keys.has('arrowright') ||
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
    window.addEventListener('keydown', onKeyDown, {capture:false});
    window.addEventListener('keyup', onKeyUp, {capture:false});

    // Show touch controls only on touch devices
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const tc = $('#touch-controls'); if (tc) tc.style.display = touch ? 'grid' : 'none';
  };

  // Auto-init
  try {
    if (document.readyState !== "loading") initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
  } catch {}

})();
