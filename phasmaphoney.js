
// =================================================================
// PhasmaPhoney Monolithic Game Script
// This file is a combination of all game-related JavaScript files.
// =================================================================

(function() { // Global wrapper

// =================================================================
// START: assets/dev/util/pp_runtime.js
// =================================================================
(function(){
  "use strict";
  if (window.PP?.runtime) return;

  const PP = (window.PP = window.PP || {});
  PP.globals = PP.globals || {};

  function trySet(obj, key, value){
    try { obj[key] = value; } catch { /* read-only getter – ignore */ }
  }

  PP.runtime = {
    exportGlobals(engine, scene, camera){
      // namespace copy
      PP.globals.engine = engine;
      PP.globals.scene  = scene;
      PP.globals.camera = camera;

      // best-effort global names
      trySet(window, "engine", engine);
      trySet(window, "scene",  scene);
      trySet(window, "camera", camera);

      // also stash underscored fallbacks for tools that check them
      trySet(window,"__ENGINE", engine);
      trySet(window,"__SCENE",  scene);
      trySet(window,"__camera", camera);
    }
  };
})();
// =================================================================
// END: assets/dev/util/pp_runtime.js
// =================================================================


// =================================================================
// START: assets/dev/util/modular_settings.js
// =================================================================
/**
 * modular_settings.js
 * Drop this BEFORE all other game systems.
 * Exposes global config on window.PP for controls, tuning, and rules.
 */
(function () {
  window.PP = window.PP || {};

  /* ------------ Controls (keys & movement tuning) ------------ */
  PP.controls = {
    keys: {
      // Movement
      forward:   ['KeyW','ArrowUp'],
      back:      ['KeyS','ArrowDown'],
      left:      ['KeyA','ArrowLeft'],
      right:     ['KeyD','ArrowRight'],
      sprint:    ['ShiftLeft','ShiftRight'],

      // Belt slots: exactly 1–3 (lighter is separate on Digit4)
      slots:     ['Digit1','Digit2','Digit3'],
      lighter:   ['Digit4'],

      // Core actions
      use:       ['Space'],   // “Use” active item
      interact:  ['KeyE'],    // Doors & ground/placed tools (e.g., Spirit Box on floor)
      notebook:  ['KeyN'],
      minimap:   ['KeyM'],

      // Lighting / environment
      flash:       ['KeyF'],  // flashlight (held/headgear)
      uv:          ['KeyU'],
      ir:          ['KeyI'],
      lightToggle: ['KeyL'],  // nearest house light
      powerToggle: ['KeyP'],  // house breaker

      // Camera
      cameraToggle: ['KeyV']  // FP <-> TP
    },

    // Movement tuning
    speedWalk:  1.80,
    speedRun:   3.20,

    // Camera feel (used by rig if present)
    mouseSens:       0.0022,
    touchLookSens:   0.0025,

    allowFly: false,
    godMode:  false
  };

  /* ------------ Ghost / Hunt / Sanity tuning ------------ */
  PP.ghost = {
    // Sanity drain per second
    baseSanityDrain: 0.6 / 60,
    nearSanityDrain: 1.2 / 60,
    nearDistance:    7.0,

    // Hunt pacing
    huntSanityThreshold: 65,
    huntCooldownMin:     22,
    huntCooldownMax:     40,   // 22 + Math.random()*18
    huntChanceBelow40:   0.85,
    huntChanceAbove40:   0.55,

    // Ghost locomotion
    speed:             1.4,
    stepIntervalWalk:  0.55,
    stepIntervalHunt:  0.48,
    footAudible:       18,

    // Twins behavior
    twinsSeparationMin: 10.0,
    twinsSeparationMax: 12.0,

    // Crucifix
    crucifixBaseRadius:  3.0,
    crucifixDemonRadius: 5.0
  };

  /* ------------ Weather modifiers (sanity/hunt multipliers) ------------ */
  // Match names used by env_and_sound.js exactly: Clear | Rainstorm | Snow | Bloodmoon
  PP.weatherMods = {
    Clear:     { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    Rainstorm: { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    Snow:      { sanity: 0.95, huntChance: 1.00, huntPace: 1.00 },
    Bloodmoon: { sanity: 1.25, huntChance: 1.40, huntPace: 1.20 }
  };

  /* ------------ Placeables / rules ------------ */
  PP.rules = {
    crucifixBaseRadius:  3.0,
    crucifixDemonRadius: 5.0
  };

  /* ------------ Lightweight shared state (initialized here) ------------ */
  PP.state = PP.state || {
    running: false,
    sanity: 100,
    controls: { forward:false, back:false, left:false, right:false },
    selectedSlot: 0   // 0=none, 1..3 (belt). Lighter is separate.
  };
  
  console.log("[ModularSettings] Global PP config initialized.");
})();
// =================================================================
// END: assets/dev/util/modular_settings.js
// =================================================================


// =================================================================
// START: assets/dev/game/ghost_data.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {};

  PP.GHOST_DATA = {"Spirit":{"name":"Spirit","evidence":["EMF Level 5","Spirit Box","Ghost Writing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will wait 180s after being incensed before attempting to hunt again, instead of the standard 90s","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Wraith":{"name":"Wraith","evidence":["EMF Level 5","Spirit Box","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will not be slowed down by tier 3 salt during a hunt","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Phantom":{"name":"Phantom","evidence":["Spirit Box","Ultraviolet","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Less visible during hunts","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Poltergeist":{"name":"Poltergeist","evidence":["Spirit Box","Ghost Writing","Ultraviolet"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"During hunts, Poltergeists will throw an item every 0.5s with an increased force","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Banshee":{"name":"Banshee","evidence":["Ultraviolet","DOTS Projector","Ghost Orbs"],"hunt_sanity":50,"speed_min_mps":null,"speed_max_mps":null,"notes":"Hunts based on target's sanity instead of average sanity","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Jinn":{"name":"Jinn","evidence":["EMF Level 5","Ultraviolet","Freezing"],"hunt_sanity":null,"speed_min_mps":2.5,"speed_max_mps":2.5,"notes":"With the breaker on, the Jinn will speed up during a hunt if a player is in LOS and further than 3m away","movement":{"model":"distance_scaled_far","roam_speed":2.5,"chase_speed":2.5,"los_speedup":false,"near_speed":1.7,"far_speed":2.5,"far_distance":6.0}},"Mare":{"name":"Mare","evidence":["Spirit Box","Ghost Writing","Ghost Orbs"],"hunt_sanity":60,"speed_min_mps":null,"speed_max_mps":null,"notes":"Won't hunt until 40% average sanity when light switch in its current room is in the on position (regardless of breaker state), 60% average sanity if light switch is in the off position or if the lights are broken (regard","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Revenant":{"name":"Revenant","evidence":["Ghost Writing","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":3.0,"speed_max_mps":3.0,"notes":"During a hunt, a Revenant will be slow (1.0m/s) until it detects a player (voice, active electronic equipment, or LOS) where it will immediately speed up to 3.0m/s and remain at that speed until it reaches the players la","movement":{"model":"revenant","roam_speed":3.0,"chase_speed":3.0,"los_speedup":true,"no_los_speed":1.1,"los_speed":3.0}},"Shade":{"name":"Shade","evidence":["EMF Level 5","Ghost Writing","Freezing"],"hunt_sanity":35,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will not hunt if in the same room as a player","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Demon":{"name":"Demon","evidence":["Ghost Writing","Ultraviolet","Freezing"],"hunt_sanity":70,"speed_min_mps":null,"speed_max_mps":null,"notes":"Can hunt 60s after being smudged instead of the standard 90s","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Yurei":{"name":"Yurei","evidence":["DOTS Projector","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Only ghost that can close or interact with an exit door outside of a hunt/event","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Oni":{"name":"Oni","evidence":["EMF Level 5","DOTS Projector","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Blinks more frequently during hunts, making them more visible","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Yokai":{"name":"Yokai","evidence":["Spirit Box","DOTS Projector","Ghost Orbs"],"hunt_sanity":80,"speed_min_mps":null,"speed_max_mps":null,"notes":"Hearing/detection distance is 2.5m and less during hunts","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Hantu":{"name":"Hantu","evidence":["Ultraviolet","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will have visible freezing breath during hunts when the breaker is off/broken","movement":{"model":"temperature_scaled","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false,"warm_speed":1.4,"cold_speed":2.7}},"Goryo":{"name":"Goryo","evidence":["EMF Level 5","Ultraviolet","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"DOTS only appear on video camera and will not show if a player is in the same room (DOTS state can start outside of room and enter a player's room)","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Myling":{"name":"Myling","evidence":["EMF Level 5","Ghost Writing","Ultraviolet"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Footsteps and vocals cannot be heard more than 12m away during hunts (normal is 20m)","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Onryo":{"name":"Onryo","evidence":["Spirit Box","Ghost Orbs","Freezing"],"hunt_sanity":60,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will attempt to hunt at any sanity after extinguishing every 3rd flame","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"The Twins":{"name":"The Twins","evidence":["EMF Level 5","Spirit Box","Freezing"],"hunt_sanity":null,"speed_min_mps":1.5,"speed_max_mps":1.5,"notes":"Ghost speed during hunts will be either 1.5m/s or 1.9m/s","movement":{"model":"twins","roam_speed":1.5,"chase_speed":1.5,"los_speedup":false,"primary_speed":1.7,"secondary_speed":1.2,"alternate_events":true}},"Raiju":{"name":"Raiju","evidence":["EMF Level 5","DOTS Projector","Ghost Orbs"],"hunt_sanity":65,"speed_min_mps":2.5,"speed_max_mps":2.5,"notes":"During events and hunts, causes electronic disturbance at a 15m range instead of 10m","movement":{"model":"electronics_scaled","roam_speed":2.5,"chase_speed":2.5,"los_speedup":false,"no_elec_speed":1.7,"elec_speed":2.9,"elec_radius":8.0}},"Obake":{"name":"Obake","evidence":["EMF Level 5","Ultraviolet","Ghost Orbs"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Special 6 fingered fingerprints ( Open 'Guides' tab )","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"The Mimic":{"name":"The Mimic","evidence":["Spirit Box","Ultraviolet","Ghost Orbs"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Mimics a different ghost every 30 - 120 seconds, taking on all behaviors, tells, and abilities of that ghost (excluding evidence), leading to inconsistent behavior","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Moroi":{"name":"Moroi","evidence":["Spirit Box","Ghost Writing","Freezing"],"hunt_sanity":null,"speed_min_mps":3.71,"speed_max_mps":3.71,"notes":"Incense blindness duration during hunts is increased from 5s to 7s","movement":{"model":"sanity_scaled","roam_speed":3.71,"chase_speed":3.71,"los_speedup":false,"min_speed":1.5,"max_speed":3.5}},"Deogen":{"name":"Deogen","evidence":["Spirit Box","Ghost Writing","DOTS Projector"],"hunt_sanity":40,"speed_min_mps":3.0,"speed_max_mps":3.0,"notes":"Very fast hunt speed, but will slow down as it nears the targeted player","movement":{"model":"distance_scaled","roam_speed":3.0,"chase_speed":3.0,"los_speedup":false,"min_speed":0.4,"max_speed":3.0,"distance_slow_radius":2.5}},"Thaye":{"name":"Thaye","evidence":["Ghost Writing","DOTS Projector","Ghost Orbs"],"hunt_sanity":75,"speed_min_mps":2.75,"speed_max_mps":2.75,"notes":"Hunts at 75% at its youngest, 15% at its oldest","movement":{"model":"age_scaled","roam_speed":2.75,"chase_speed":2.75,"los_speedup":false,"young_speed":2.75,"old_speed":1.0,"aging_minutes":20}}};

  // Derive the list of all possible evidence types directly from the ghost data
  // This ensures the journal and game logic are always in sync.
  const allEvidence = new Set();
  Object.values(PP.GHOST_DATA).forEach(ghost => {
    if (ghost.evidence) {
      ghost.evidence.forEach(ev => allEvidence.add(ev));
    }
  });
  PP.ALL_EVIDENCE = Array.from(allEvidence).sort();
})();
// =================================================================
// END: assets/dev/game/ghost_data.js
// =================================================================


// =================================================================
// START: assets/dev/game/map_loader.js
// =================================================================
(function(){
  "use strict";
  // This module provides the definitive map manifest for the game.
  // It directly sets the list of maps, ensuring consistency.
  window.PP = window.PP || {};

  // The corrected and complete list of maps available for investigation.
  const MAPS = [
      {
          id: 'default_map',
          title: 'Investigation Site',
          file: 'map.glb'
      }
  ];

  // Directly assign the manifest to ensure it's always correctly formatted.
  window.PP.mapManifest = MAPS;

  console.log("[map_loader] Map manifest created. Total maps:", window.PP.mapManifest.length);
})();
// =================================================================
// END: assets/dev/game/map_loader.js
// =================================================================


// =================================================================
// START: assets/dev/util/pointer_lock_manager.js
// =================================================================
(function(){
  "use strict";
  if (window.PP?.pointerLock) return;

  const PP = (window.PP = window.PP || {});
  const state = {
    canvas: null,
    uiOpenCount: 0,       // how many UIs are asking to keep the mouse free
    wantedLock: false,    // desire to be locked when allowed
    isLocked: false,
  };

  function getCanvas(){ return state.canvas || (state.canvas = document.getElementById("renderCanvas")); }

  function canLock(){ return state.uiOpenCount <= 0; }
  function isLocked(){ return document.pointerLockElement === getCanvas(); }

  function lockNow(){
    const c = getCanvas(); if (!c) return;
    try { c.requestPointerLock?.(); } catch(_){}
  }
  function unlockNow(){
    try { document.exitPointerLock?.(); } catch(_){}
  }

  function ensure(){
    state.isLocked = isLocked();
    if (state.wantedLock && canLock() && !state.isLocked) lockNow();
    if ((!state.wantedLock || !canLock()) && state.isLocked) unlockNow();
  }

  // Public API
  const api = PP.pointerLock = {
    lock(){ state.wantedLock = true; ensure(); },
    unlock(){ state.wantedLock = false; ensure(); },
    hold(reason){ // e.g. UI opened
      state.uiOpenCount = Math.max(1, state.uiOpenCount + 1);
      ensure();
    },
    release(reason){ // e.g. UI closed
      state.uiOpenCount = Math.max(0, state.uiOpenCount - 1);
      ensure();
    },
    isLocked: isLocked
  };

  // Observe native pointer lock changes
  ["pointerlockchange","mozpointerlockchange","webkitpointerlockchange"].forEach(ev=>{
    document.addEventListener(ev, ()=> { state.isLocked = isLocked(); }, false);
  });

  // Auto (re)lock on canvas click when allowed
  document.addEventListener("click", (e)=>{
    if (!getCanvas() || e.target !== getCanvas()) return;
    state.wantedLock = true;
    ensure();
  }, true);

  // Keep behavior after tab switches etc.
  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden) ensure();
  });

  // Start locked after the Start button is used
  window.addEventListener("pp:start", ()=>{
    state.wantedLock = true;
    setTimeout(ensure, 100); // short delay to allow UI to settle
  }, { once:true });

  // Listen for events from UI modules
  window.addEventListener("pp:notebook:open", ()=> api.hold("notebook"));
  window.addEventListener("pp:notebook:close",()=> api.release("notebook"));
  window.addEventListener("pp:van:open",      ()=> api.hold("van"));
  window.addEventListener("pp:van:close",     ()=> api.release("van"));
  
  console.log("[PointerLockManager] Initialized.");

})();
// =================================================================
// END: assets/dev/util/pointer_lock_manager.js
// =================================================================


// =================================================================
// START: assets/dev/util/input_manager.js
// =================================================================
/**
 * modular_bindings.js (now input_manager.js) (keyboard + PS5 controller)
 * - Unified input for keyboard and DualSense (PS5) controllers.
 * - Keyboard: WASD/keys as before.
 * - Controller: Maps Phasmophobia-like layout into the same state/slots/events.
 * - Exposes PP.getMovementFlags() and PP.getSpeeds().
 */
(function () {
  if (window.__PP_BINDINGS__) return; window.__PP_BINDINGS__ = true;

  const PP = (window.PP = window.PP || {});
  const C  = (PP.controls = PP.controls || {});
  PP.state = PP.state || {};
  PP.state.controls = PP.state.controls || { forward:false, back:false, left:false, right:false };
  PP.state.selectedSlot = PP.state.selectedSlot || 1;
  PP.state.running = false;

  const Keys = Object.create(null);
  const F = PP.state.controls;

  // ---------- helpers ----------
  const has = (arr, code) => Array.isArray(arr) && arr.includes(code);

  function S(){ 
    return window.SCENE || window.scene || 
           (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; 
  }

  function uiBusy() {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return true;
    if (document.getElementById('notebook-modal')?.style?.display !== 'none') return true;
    return false;
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
  }

  function selectSlot(n) {
    n = Math.max(1, Math.min(3, n|0));
    const prev = PP.state.selectedSlot;
    if (prev === n) {
      emit('pp:slot:confirm', { slot: n });
      return;
    }
    PP.state.selectedSlot = n;
    emit('pp:slot:change', { prev, next: n });

    if (typeof window.selectSlot === 'function') window.selectSlot(n);
    if (typeof window.buildBelt === 'function')  { try { window.buildBelt(null); } catch {} }
    if (typeof window.refreshCameraOverlay === 'function') { try { window.refreshCameraOverlay(); } catch {} }
  }

  const syncHeldLights = () => { if (typeof window.syncHeldLights === 'function') window.syncHeldLights(); };
  const toggleNearestHouseLight = () => { if (typeof window.toggleNearestHouseLight === 'function') window.toggleNearestHouseLight(); };
  const setHousePower = (on) => { if (typeof window.setHousePower === 'function') window.setHousePower(on); };

  function preventIfNeeded(e){
    const block = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    if (block.includes(e.code)) e.preventDefault();
  }

  // ---------- Keyboard ----------
  addEventListener('keydown', (e) => {
    Keys[e.code] = true;
    if (uiBusy()) return;
    preventIfNeeded(e);

    const keyMap = C.keys || {};
    if (has(keyMap.forward, e.code)) F.forward = true;
    if (has(keyMap.back,    e.code)) F.back    = true;
    if (has(keyMap.left,    e.code)) F.left    = true;
    if (has(keyMap.right,   e.code)) F.right   = true;
    if (has(keyMap.sprint,  e.code)) PP.state.running = true;

    if (keyMap.slots?.includes(e.code)) {
      const n = parseInt(e.code.replace(/\D/g, ''), 10) || 0;
      if (n >= 1 && n <= 3) {
        emit('pp:belt:select', { slot: n - 1 });
        return;
      }
    }

    if (has(keyMap.notebook, e.code) && typeof window.openNotebook === 'function') window.openNotebook();
    if (has(keyMap.interact, e.code) && typeof window.toggleNearestDoor === 'function') window.toggleNearestDoor();
    if (has(keyMap.use,      e.code)) emit('pp:item:use');
    if (has(keyMap.minimap,  e.code) && typeof window.toggleMinimap === 'function') window.toggleMinimap();
    
    if (has(keyMap.lighter, e.code)) emit('pp:lighter:toggle');
    if (has(keyMap.flash, e.code)) emit('pp:flashlight:toggle');
    if (has(keyMap.uv,    e.code)) emit('pp:uv_light:toggle');
    if (has(keyMap.ir,    e.code)) emit('pp:ir_light:toggle');
    
    if (has(keyMap.lightToggle, e.code)) toggleNearestHouseLight();
    if (has(keyMap.powerToggle, e.code)) setHousePower(!window.housePower);
  }, { capture: true });

  addEventListener('keyup', (e) => {
    Keys[e.code] = false;
    const keyMap = C.keys || {};
    if (has(keyMap.forward, e.code)) F.forward = false;
    if (has(keyMap.back,    e.code)) F.back    = false;
    if (has(keyMap.left,    e.code)) F.left    = false;
    if (has(keyMap.right,   e.code)) F.right   = false;
    if (has(keyMap.sprint,  e.code)) PP.state.running = false;
  }, { capture: true });

  // ---------- PS5 Controller ----------
  const ps5Bindings = {
    stick: { threshold: 0.25 },
    buttons: {
      0: () => { emit('pp:item:use') }, // X
      1: () => { emit('pp:item:drop') },           // Circle
      2: () => { emit('pp:item:pickup') },       // Square
      3: () => { emit('pp:belt:cycle', { direction: 1 }) },  // Triangle cycle
      9: () => { F.crouch = !F.crouch; emit('pp:crouch', { crouch: F.crouch }); },          // R3
      10: () => { F.crouch = !F.crouch; emit('pp:crouch', { crouch: F.crouch }); },         // L3
      4: () => { PP.state.running = true; },                                               // L1 hold = sprint
      6: () => { emit('pp:item:place') },         // L2
      7: () => { if (typeof window.toggleNearestDoor === 'function') window.toggleNearestDoor(); },           // R2
      13: () => { emit('pp:flashlight:toggle'); } // D-pad Down
    }
  };
  const ps5Pressed = new Set();
  function pollController() {
    try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = Array.from(pads).find(p => p && p.id.toLowerCase().includes('dualsense'));
        if (pad) {
          const axLH = pad.axes[0] || 0, axLV = pad.axes[1] || 0;
          F.left  = axLH < -ps5Bindings.stick.threshold;
          F.right = axLH >  ps5Bindings.stick.threshold;
          F.forward = axLV < -ps5Bindings.stick.threshold;
          F.back    = axLV >  ps5Bindings.stick.threshold;

          pad.buttons.forEach((btn, i) => {
            if (btn.pressed && !ps5Pressed.has(i) && ps5Bindings.buttons[i]) {
              try { ps5Bindings.buttons[i](); } catch {}
            }
            if (btn.pressed) ps5Pressed.add(i); else ps5Pressed.delete(i);
            
            if (i === 4 && !btn.pressed) PP.state.running = false; // release sprint
          });
        }
    } catch(e) {}
    requestAnimationFrame(pollController);
  }
  
  // ---------- Footsteps ----------
  (function footsteps() {
    let cam, st = { last: null, acc: 0 };
    function init(){
        const s = S(); if (!s || !s.activeCamera) return setTimeout(init, 200);
        cam = s.activeCamera;
        st.last = cam.position.clone();
        tick();
    }
    function tick(){
      const now = cam?.position;
      if (!st.last || !now) { requestAnimationFrame(tick); return; }
      const d = BABYLON.Vector3.Distance(now, st.last);
      st.last.copyFrom(now);

      const moving = F.forward || F.back || F.left || F.right;
      if (moving && cam.parent){ // parent check ensures we are not in free-cam
        st.acc += d;
        const stride = (PP.state.running ? (PP.controls.strideRun || 0.8) : (PP.controls.strideWalk || 1.2));
        if (st.acc >= stride){
          st.acc = 0;
          if (PP.audio?.playStep) { try { PP.audio.playStep(0.42); } catch {} }
        }
      }
      requestAnimationFrame(tick);
    }
    init();
  })();

  // ---------- Exports ----------
  PP.getMovementFlags = () => ({ ...F, running: !!PP.state.running, crouch: !!F.crouch });
  PP.getSpeeds        = () => ({ walk: PP.controls.speedWalk || 0.9, run: PP.controls.speedRun || 1.8 });

  window.addEventListener('pp:start', () => {
    try { if (typeof window.buildBelt === 'function') window.buildBelt(null); } catch {}
    pollController();
  }, { once: true });

})();
// =================================================================
// END: assets/dev/util/input_manager.js
// =================================================================


// =================================================================
// START: assets/dev/util/env_and_sound.js
// =================================================================
/**
 * Modular audio (HTMLAudio) — Weather-only ambience + Spirit Box (static loop + whisper)
 * Adds optional spatialization for the Spirit Box via a shared PannerNode.
 * Replaces the previous env_and_sound.js
 */
(function(){
  if (window.__PP_AUDIO__) return; window.__PP_AUDIO__ = true;

  const PP = window.PP || (window.PP = {});
  PP.audio = PP.audio || {};

  PP.audio.gain = { master:1.0, ambient:1.0, sfx:1.0, ui:1.0 };

  const A = PP.audio.tracks = {
    rain:      new Audio("./assets/audio/rainstorm.mp3"),
    clear:     new Audio("./assets/audio/clearWeather.mp3"),
    spiritbox: new Audio("./assets/audio/spiritbox.mp3"),
    whisper:   new Audio("./assets/audio/whisper.mp3"),
    doorCreak1:new Audio("./assets/audio/doorCreak1.mp3"),
    doorCreak2:new Audio("./assets/audio/doorCreak2.mp3"),
    slam1:     new Audio("./assets/audio/doorSlam1.mp3"),
    slam2:     new Audio("./assets/audio/doorSlam2.mp3"),
    ghostLaugh:new Audio("./assets/audio/ghostLaugh.mp3"),
    writing:   new Audio("./assets/audio/GhostWriting1.mp3"),
    steps: [
      new Audio("./assets/audio/step1.mp3"),
      new Audio("./assets/audio/step2.mp3"),
      new Audio("./assets/audio/step3.mp3")
    ]
  };

  // loop flags
  Object.values(A).forEach(v=>{
    if (Array.isArray(v)) v.forEach(x=>{ if ('loop' in x) x.loop=false; });
    else if ('loop' in v) v.loop=false;
  });
  A.rain.loop = true; A.clear.loop = true; A.spiritbox.loop = true;

  // utils
  function setVol(el, base, channel='sfx'){
    try {
      const g = PP.audio.gain;
      el.volume = Math.max(0, Math.min(1, base * (g.master||1) * (g[channel]||1)));
    } catch {}
  }
  function stop(el){ try{ el.pause(); el.currentTime=0; }catch{} }
  function play(el){ try{ el.play().catch(()=>{}); }catch{} }

  // weather
  let currentWeather = null;
  PP.audio.applyWeather = function(state){
    if (!state || currentWeather===state) return; currentWeather = state;
    stop(A.rain); stop(A.clear);
    switch(state){
      case "Clear":     setVol(A.clear, 0.30, 'ambient'); play(A.clear); break;
      case "Rain":
      case "Rainstorm":
      case "Bloodmoon": setVol(A.rain,  0.55, 'ambient'); play(A.rain);  break;
      case "Snow":
      default: break; // silence
    }
  };
  
  // This function is now exposed via the EnvAndSound interface
  function firstInteractionBoot() {
    Object.values(A).forEach(v=>{
      if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=true; x.play().then(()=>x.pause()).catch(()=>{});}catch{} });
      else { try{ v.muted=true; v.play().then(()=>v.pause()).catch(()=>{});}catch{} }
    });
    setTimeout(()=>{
      Object.values(A).forEach(v=>{
        if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=false; }catch{} });
        else { try{ v.muted=false; }catch{} }
      });
      ensureGraph();
      const initialWeather = (window.weather&&window.weather.state) || 'Clear';
      PP.audio.applyWeather(initialWeather);
      console.log("[Audio] System unmuted and ready.");
    }, 50);
  }

  PP.audio.playStep = function(volume=0.5){
    const s = A.steps[(Math.random()*A.steps.length)|0];
    try { s.currentTime=0; setVol(s, volume, 'sfx'); s.play().catch(()=>{});} catch {}
  };

  // ---- Spirit Box graph (adds optional shared panner) ----
  let ctx=null, srcStatic=null, srcWhisper=null, gStatic=null, gWhisper=null, biq=null, pan=null;
  const _duckTimers = { up:null, hold:null, down:null };

  function ensureGraph(){
    if (ctx) return true;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      srcStatic  = ctx.createMediaElementSource(A.spiritbox);
      srcWhisper = ctx.createMediaElementSource(A.whisper);
      gStatic  = ctx.createGain();   gStatic.gain.value = 1.0;
      gWhisper = ctx.createGain();   gWhisper.gain.value = 0.0;
      biq = ctx.createBiquadFilter(); biq.type='bandpass'; biq.frequency.value=1200; biq.Q.value=1.2;
      pan = ctx.createPanner();
      pan.panningModel = 'inverse'; pan.distanceModel = 'inverse';
      pan.rolloffFactor = 1.0; pan.refDistance = 2.0; pan.maxDistance = 40.0;
      pan.coneInnerAngle = 360; pan.coneOuterAngle = 360; pan.coneOuterGain = 0.6;
      try { pan.positionZ.setValueAtTime(0, ctx.currentTime); }catch{}
      srcStatic.connect(gStatic).connect(pan).connect(ctx.destination);
      srcWhisper.connect(biq).connect(gWhisper).connect(pan);
      return true;
    }catch(e){ console.warn('[audio] WebAudio unavailable; using HTMLAudio fallback', e); return false; }
  }
  function _clearFallbackTimers(){
    if (_duckTimers.up)   { clearInterval(_duckTimers.up);   _duckTimers.up=null; }
    if (_duckTimers.down) { clearInterval(_duckTimers.down); _duckTimers.down=null; }
    if (_duckTimers.hold) { clearTimeout(_duckTimers.hold);  _duckTimers.hold=null; }
  }

  PP.audio.spiritBox = {
    power(on){
      if (on){
        setVol(A.spiritbox, 0.55, 'sfx');
        try { A.spiritbox.play().catch(()=>{}); } catch {}
        if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{});
        return;
      }
      _clearFallbackTimers();
      try { A.whisper.pause(); A.whisper.currentTime=0; }catch{}
      try { A.spiritbox.pause(); A.spiritbox.currentTime=0; }catch{}
      try { A.spiritbox.volume = 0; } catch {}
      if (ctx){
        const now = ctx.currentTime||0;
        try{
          gStatic?.gain.cancelScheduledValues(now);  gStatic && (gStatic.gain.value=1.0);
          gWhisper?.gain.cancelScheduledValues(now); gWhisper && (gWhisper.gain.value=0.0);
        }catch{}
      }
    },
    ghostSpeak(opts={}){
      const { gain=0.9, duck=0.65, attack=0.05, hold=0.8, release=0.35, pitchMin=0.92, pitchMax=1.08, centerHz=1200, Q=1.2 } = opts;
      const ok = ensureGraph();
      const rate = pitchMin + Math.random()*(pitchMax-pitchMin);
      try { A.whisper.playbackRate = rate; A.whisper.currentTime=0; } catch {}
      setVol(A.whisper, 0.85, 'sfx');
      try { A.whisper.play().catch(()=>{}); } catch {}
      if (!ok){ /* Fallback logic here... */ return; }
      try {
        if (biq){ biq.frequency.setTargetAtTime(centerHz, ctx.currentTime, 0.01); biq.Q.setTargetAtTime(Q, ctx.currentTime, 0.01); }
        const now = ctx.currentTime, end = now + attack + hold + release;
        const s0 = gStatic.gain.value;
        gStatic.gain.cancelScheduledValues(now);
        gStatic.gain.setValueAtTime(s0, now);
        gStatic.gain.linearRampToValueAtTime(s0*duck, now+attack);
        gStatic.gain.setValueAtTime(s0*duck, now+attack+hold);
        gStatic.gain.linearRampToValueAtTime(s0, end);
        gWhisper.gain.cancelScheduledValues(now);
        gWhisper.gain.setValueAtTime(0.0, now);
        gWhisper.gain.linearRampToValueAtTime(gain, now+attack);
        gWhisper.gain.setValueAtTime(gain, now+attack+hold);
        gWhisper.gain.linearRampToValueAtTime(0.0, end);
      } catch {}
    },
    enableSpatial(on=true){
      if (!ensureGraph()) return;
      try {
        pan.refDistance = on ? 2.0 : 1e6;
        pan.rolloffFactor = on ? 1.0 : 0.0;
      } catch {}
    },
    setWorldPosition(x=0,y=0,z=0){
      if (!ensureGraph()) return;
      try {
        (pan.positionX||pan.setPosition).call(pan, x, y, z);
      } catch { try { pan.setPosition(x,y,z); } catch {} }
    },
    setListener(x,y,z, fx,fy,fz, ux,uy,uz){
      if (!ensureGraph()) return;
      const L = ctx.listener;
      try {
        (L.positionX||L.setPosition).call(L, x,y,z);
        (L.forwardX||L.setOrientation).call(L, fx,fy,fz, ux,uy,uz);
      } catch { try { L.setPosition(x,y,z); L.setOrientation(fx,fy,fz, ux,uy,uz); } catch {} }
    }
  };

  PP.audio.play = {
    spiritboxOn:  () => PP.audio.spiritBox.power(true),
    spiritboxOff: () => PP.audio.spiritBox.power(false),
    whisper:      () => PP.audio.spiritBox.ghostSpeak(),
    doorCreak: () => { const x=Math.random()<0.5?A.doorCreak1:A.doorCreak2; setVol(x,0.7,'sfx'); play(x); },
    slam:      () => { const x=Math.random()<0.5?A.slam1:A.slam2; setVol(x,0.85,'sfx'); play(x); },
    ghostLaugh:() => { setVol(A.ghostLaugh,0.75,'sfx'); play(A.ghostLaugh); },
    writing:   () => { setVol(A.writing,0.8,'sfx'); play(A.writing); }
  };

  PP.audio.setGains = g => Object.assign(PP.audio.gain, g||{});
  PP.audio.stopAll = function(){
    try{
      Object.values(A).forEach(v=>{ if(Array.isArray(v)) v.forEach(stop); else stop(v); });
      PP.audio.spiritBox.power(false);
    }catch{}
  };

  // Expose a compatible API on EnvAndSound
  window.EnvAndSound = {
      firstInteractionBoot: firstInteractionBoot,
      setWeather: PP.audio.applyWeather,
      // Add other functions if needed by bootstrap
  };

})();
// =================================================================
// END: assets/dev/util/env_and_sound.js
// =================================================================


// =================================================================
// START: assets/models/map/map_manager.js
// =================================================================
(function(){
"use strict";
if(window.PP && window.PP.mapManager) return;
window.PP = window.PP || {};

let currentMapRoot = null;
const log  = (...a)=>{ try{ console.log("[mapManager]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[mapManager]", ...a); }catch{} };

async function loadMap(mapData) {
    const scene = window.scene;
    if (!scene) {
        warn("Scene is not available for map loading.");
        return;
    }

    // Clean up the previous map if it exists
    if (currentMapRoot) {
        log("Disposing of previous map...");
        currentMapRoot.dispose();
        currentMapRoot = null;
    }

    if (!mapData || !mapData.file) {
        warn("Invalid map data provided.", mapData);
        throw new Error("Invalid map data. Cannot load map.");
    }

    const mapUrl = `./assets/models/map/${mapData.file}`;
    log(`Loading map: ${mapUrl}`);

    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync(null, "", mapUrl, scene);
        
        // Create a root node to parent all map meshes for easy management
        currentMapRoot = new BABYLON.TransformNode(`mapRoot_${mapData.file}`, scene);

        result.meshes.forEach(mesh => {
            mesh.parent = currentMapRoot;
            
            // A simple heuristic to avoid enabling collisions on small detail meshes like foliage
            const name = mesh.name.toLowerCase();
            if (!name.includes("plant") && !name.includes("leaf") && !name.includes("grass")) {
               mesh.checkCollisions = true;
            }
            
            mesh.receiveShadows = true;

            // Example of how you would add casters to a shadow generator if one exists
            // if (window.shadowGenerator) {
            //     window.shadowGenerator.addShadowCaster(mesh);
            // }
        });

        log(`Map '${mapData.title}' loaded and processed successfully.`);

    } catch (error) {
        warn(`Failed to load map file: ${mapUrl}`, error);
        // Re-throw the error so the loader in bootstrap.js can catch it
        throw error;
    }
}

PP.mapManager = {
    loadMap
};

log("Map Manager initialized.");
})();
// =================================================================
// END: assets/models/map/map_manager.js
// =================================================================


// =================================================================
// START: assets/dev/util/player_rig_controller.js
// =================================================================
/* fp_tp_sync.js — single-rig FP/TP with no rubberbanding (v2.3 - Modular Input)
   - Loads the player model from assets/models/player/ and attaches it to the rig.
   - Hides player model in first-person view.
   - MOVEMENT is now driven by the unified input_manager.js via PP.getMovementFlags().
   - Mouse look for camera control remains handled internally.
   - rigRoot -> yaw -> head -> handNode ; camera attaches to head (FP) or trails (TP)
*/
(function(){
  if (window.__FP_TP_SYNC_V2_3__) return; window.__FP_TP_SYNC_V2_3__ = true;

  const log  = (...a)=>{ try{ console.log("[PlayerRig v2.3]", ...a);}catch(_){} };
  const warn = (...a)=>{ try{ console.warn("[PlayerRig v2.3]", ...a);}catch(_){} };
  const toRad = d => d * Math.PI / 180;
  const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
  const cfg = ()=> window.PP?.controls;

  const S = {
    rigRoot:null, yawNode:null, head:null, handNode:null, body:null,
    mode:"fp",
    tpIdx:1, tpDists:[2.6,3.6,4.8,6.0],
    yaw:0, pitch:0,
    velY:0,
    gravity:-9.8, grounded:true,
    running:false,
    movementEnabled: false,
  };

  function scene(){ return window.scene || (BABYLON.Engine && BABYLON.Engine.LastCreatedScene) || null; }
  function cam(){ const s=scene(); return s && s.activeCamera; }

  async function ensureRig(s){
    if (S.rigRoot) return;
    const c = cam();
    const start = window.PP_SPAWN_POS || (c?.position?.clone?.()) || new BABYLON.Vector3(0,1.8,0);

    const rigRoot = new BABYLON.TransformNode("rigRoot", s);
    rigRoot.position.copyFrom(start);

    const yaw = new BABYLON.TransformNode("rigYaw", s);
    yaw.parent = rigRoot;

    const head = new BABYLON.TransformNode("rigHead", s);
    head.parent = yaw;
    head.position.set(0, 1.6, 0);

    const handNode = new BABYLON.TransformNode("handNode", s);
    handNode.parent = head;
    handNode.position.set(0.25, -0.4, 0.7);

    S.rigRoot=rigRoot; S.yawNode=yaw; S.head=head; S.handNode=handNode;
    
    try {
        const result = await BABYLON.SceneLoader.ImportMeshAsync(null, "./assets/models/player/", "main_player.glb", s);
        const body = result.meshes[0];
        if (body) {
            body.name = "player_body_root";
            body.parent = rigRoot;
            body.position.set(0, 0, 0);
            body.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI, 0);
            S.body = body;
            result.meshes.forEach(m => { m.isPickable = false; });
            log("Player model loaded and attached.");
        }
    } catch (e) {
        warn("Could not load player model. Creating a fallback capsule.", e);
        const body = BABYLON.MeshBuilder.CreateCapsule("player_capsule", {height: 1.7, radius: 0.3}, s);
        body.isPickable = false;
        body.parent = rigRoot;
        body.position.set(0, 1.7/2, 0);
        S.body = body;
    }

    if (c?.rotation){
      S.pitch = c.rotation.x||0;
      S.yaw   = c.rotation.y||0;
    }
    yaw.rotation.y = S.yaw;
  }

  function clearCameraInputs(s){
    const c = cam(); if (!c) return;
    try{ c.inputs.clear(); }catch(_){}
    c.checkCollisions = true;
    c.applyGravity = false;
    c.inertia = 0;
    c.parent = null;
  }

  function attachFP(s){
    const c=cam(); if(!c) return;
    c.parent = S.head;
    c.position.set(0,0,0);
    c.rotation.set(0,0,0);
    c.fov = 0.9;
    S.mode="fp";
    if (S.body) S.body.setEnabled(false);
  }

  function attachTP(s){
    const c=cam(); if(!c) return;
    c.parent = null;
    const d = S.tpDists[S.tpIdx]||3.6;
    const headWS = S.head.getAbsolutePosition();
    const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
    const back = new BABYLON.Vector3(-sin*d, 0.25, -cos*d);
    const pos = headWS.add(back);
    c.position.copyFrom(pos);
    c.setTarget(headWS);
    c.fov=0.9;
    S.mode="tp";
    if (S.body) S.body.setEnabled(true);
  }

  function toggleView(s, cycleOnly){
    if (S.mode==="tp" && cycleOnly){ S.tpIdx=(S.tpIdx+1)%S.tpDists.length; attachTP(s); return; }
    if (S.mode==="fp") attachTP(s); else attachFP(s);
  }

  function hookPointer(s){
    s.onPointerObservable.add((pi)=>{
      if (!S.movementEnabled || pi.type !== BABYLON.PointerEventTypes.POINTERMOVE) return;
      if (!PP.pointerLock?.isLocked()) return;
      
      const ev = pi.event;
      const dx = ev.movementX||0, dy = ev.movementY||0;
      const sens = cfg()?.mouseSens || 0.0022;

      S.yaw   += dx * sens;
      S.pitch  = clamp(S.pitch - dy * sens, -toRad(89), toRad(89));
      S.yaw = (S.yaw + Math.PI*2)%(Math.PI*2);
    });
  }

  function moveRig(dt){
    if (!S.movementEnabled) return;
    
    // Get movement state from the new input manager
    const flags = window.PP.getMovementFlags ? window.PP.getMovementFlags() : { forward:false, back:false, left:false, right:false, running:false };

    const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
    const fwd = new BABYLON.Vector3(sin, 0, cos);
    const right= new BABYLON.Vector3(cos, 0, -sin);

    let x=0, z=0;
    if (flags.forward) z += 1;
    if (flags.back) z -= 1;
    if (flags.right) x += 1;
    if (flags.left) x -= 1;

    const speeds = window.PP.getSpeeds ? window.PP.getSpeeds() : { walk: 1.8, run: 3.2 };
    let spd = flags.running ? speeds.run : speeds.walk;

    const dir = new BABYLON.Vector3(0,0,0);
    if (x) dir.addInPlace(right.scale(x));
    if (z) dir.addInPlace(fwd.scale(z));
    if (dir.lengthSquared()>0.0001) dir.normalize();

    const move = dir.scale(spd*dt);
    S.rigRoot.moveWithCollisions(move);

    if (!S.grounded) S.velY += S.gravity * dt;
    
    const gravMove = new BABYLON.Vector3(0, S.velY * dt, 0);
    S.rigRoot.moveWithCollisions(gravMove);
    
    const s = scene();
    const groundRay = new BABYLON.Ray(S.rigRoot.position, new BABYLON.Vector3(0, -1, 0), 1.1);
    const hit = s.pickWithRay(groundRay, (mesh) => mesh.isPickable && mesh.checkCollisions);
    if (hit && hit.hit) {
        S.velY = 0;
        S.grounded = true;
    } else {
        S.grounded = false;
    }
  }
  
  function applyRigToNodes(){
    S.yawNode.rotation.y = S.yaw;
    S.head.rotation.x = S.pitch;

    const c=cam(); if(!c) return;
    if (S.mode==="fp"){
      if (c.parent !== S.head) attachFP(scene());
      c.rotation.set(0,0,0);
      c.position.set(0,0,0);
    } else {
      if (c.parent) c.parent=null;
      const d=S.tpDists[S.tpIdx]||3.6;
      const headWS=S.head.getAbsolutePosition();
      const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
      const back=new BABYLON.Vector3(-sin*d, 0.25, -cos*d);
      const pos=headWS.add(back);
      c.position.copyFrom(pos);
      c.setTarget(headWS);
    }
  }

  function loop(){
    const s=scene(); if(!s||!cam()) { return; }
    const dt = Math.min(0.05, s.getEngine().getDeltaTime()/1000);
    moveRig(dt);
    applyRigToNodes();
  }
  
  async function start() {
    const s = scene();
    if (!s) { setTimeout(start, 100); return; }
    if (S.running) return;
    S.running = true;

    await ensureRig(s);
    clearCameraInputs(s);
    hookPointer(s);
    attachFP(s);
    log("online (FP default)");

    s.onBeforeRenderObservable.add(loop);
  }
  
  window.addEventListener('pp:start', start, { once: true });
  
  // Listen for camera toggle events from the input manager
  window.addEventListener('keydown', (e) => {
      const keys = cfg()?.keys?.cameraToggle;
      if (keys && keys.includes(e.code)) {
          toggleView(scene(), e.shiftKey);
      }
  });

  window.PlayerRig = {
    getHeadNode: () => S.head,
    getHandNode: () => S.handNode,
    getRigRoot: () => S.rigRoot,
    getState: () => S,
    enableMovement: (enable) => { S.movementEnabled = !!enable; }
  };

})();
// =================================================================
// END: assets/dev/util/player_rig_controller.js
// =================================================================


// =================================================================
// START: assets/dev/util/moon.js
// =================================================================
// moon.js
// Renders a visible billboarded moon using ./assets/textures/moon.jpg

(function(){
  'use strict';
  if (window.__MoonReady) return; window.__MoonReady = true;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  function createMoon(){
    const s=SCENE(); if (!s) { setTimeout(createMoon, 120); return; }
    const MOON_DIAM = 18;
    const MOON_POS  = new BABYLON.Vector3(0, 120, 160);

    const disc = BABYLON.MeshBuilder.CreateDisc('MoonMesh',{radius:MOON_DIAM*0.5, tessellation:64}, s);
    disc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    disc.isPickable = false; disc.applyFog = false; disc.renderingGroupId = 0; // Render behind other things

    const mat = new BABYLON.StandardMaterial('moonMat', s);
    mat.diffuseTexture = new BABYLON.Texture('./assets/textures/moon.jpg', s, true, false);
    mat.emissiveTexture = mat.diffuseTexture;
    mat.emissiveColor = new BABYLON.Color3(1,1,1);
    mat.specularColor = new BABYLON.Color3(0,0,0);
    mat.backFaceCulling = false;
    mat.disableLighting = true; // Make it always bright
    disc.material = mat;
    disc.position.copyFrom(MOON_POS);
  }
  
  window.addEventListener('pp:start', createMoon, { once: true });
})();
// =================================================================
// END: assets/dev/util/moon.js
// =================================================================


// =================================================================
// START: assets/dev/util/minimap_northup_xyz.js
// =================================================================
/* File: assets/dev/util/minimap_northup_xyz.js
   North-up minimap with toggle button. Also drives the XYZ HUD from player body.
*/
(function(){
  if (window.__PP_MINIMAP_V3__) return; window.__PP_MINIMAP_V3__ = true;

  const UI = {
    btn: null,
    wrap: null,
    canvas: null,
    open: false
  };

  function S(){ return window.scene || window.__SCENE || BABYLON.EngineStore?.LastCreatedScene || null; }
  function cfg() { return window.PP?.controls?.keys; }

  function ensureUI(){
    if (UI.wrap) return;
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position:'fixed', left:'10px', top:'10px', zIndex:8000,
      display:'flex', flexDirection:'column', gap:'6px'
    });

    const btn = document.createElement('button');
    btn.textContent = 'Map [M]';
    Object.assign(btn.style, {
      border:'1px solid transparent', borderRadius:'8px',
      padding:'6px 10px', background:'#0b1518', color:'#9ef',
      cursor:'pointer'
    });
    btn.addEventListener('click', toggle);

    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 220;
    Object.assign(cv.style, {
      display:'none',
      width:'220px', height:'220px',
      border:'none',
      borderRadius:'50%',           // circular look
      background:'rgba(0,0,0,0.45)',
      boxShadow:'0 0 0 1px rgba(0,255,255,0.15) inset, 0 2px 12px rgba(0,0,0,0.5)'
    });

    wrap.appendChild(btn);
    wrap.appendChild(cv);
    document.body.appendChild(wrap);

    UI.btn = btn; UI.wrap = wrap; UI.canvas = cv;
  }

  function toggle(){
    UI.open = !UI.open;
    UI.canvas.style.display = UI.open ? 'block' : 'none';
  }

  function playerPos(){
    // Use the new PlayerRig's root node for the most accurate position
    const rigRoot = window.PlayerRig?.getRigRoot();
    if (rigRoot) {
      return rigRoot.getAbsolutePosition?.() || rigRoot.position;
    }
    // Fallback for older systems
    return S()?.activeCamera?.position || null;
  }

  // XYZ HUD updater (pulls from the same source)
  function loopXYZ(){
    const el = document.getElementById('hud-xyz');
    if (!el) { requestAnimationFrame(loopXYZ); return; }
    function tick(){
      const p = playerPos();
      if (p) el.textContent = `XYZ: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
      requestAnimationFrame(tick);
    }
    tick();
  }

  // Very lightweight map: north-up top-down with player dot + heading
  function loopMap(){
    const s = S();
    const ctx = UI.canvas?.getContext('2d');
    if (!s || !ctx){ requestAnimationFrame(loopMap); return; }

    function tick(){
      if (UI.open){
        const w = UI.canvas.width, h = UI.canvas.height;
        ctx.clearRect(0,0,w,h);

        // subtle grid
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        for (let i=10;i<w;i+=20){ ctx.moveTo(i,0); ctx.lineTo(i,h); }
        for (let j=10;j<h;j+=20){ ctx.moveTo(0,j); ctx.lineTo(w,j); }
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,255,0.12)'; ctx.stroke();
        ctx.globalAlpha = 1;

        // player dot at center
        ctx.beginPath();
        ctx.arc(w/2, h/2, 4, 0, Math.PI*2);
        ctx.fillStyle = '#0ff'; ctx.fill();

        // heading arrow (camera forward projected onto XZ plane)
        const cam = s.activeCamera || window.camera;
        if (cam && cam.getDirection){
            const f = cam.getDirection(BABYLON.Vector3.Forward()); 
            // The forward vector in a north-up map is aligned with the Z axis.
            // We need to rotate this based on the player's yaw.
            const yaw = window.PlayerRig?.getState()?.yaw || 0;
            const headingX = Math.sin(yaw);
            const headingZ = Math.cos(yaw);

            const len = 18;
            ctx.beginPath();
            ctx.moveTo(w/2, h/2);
            // In canvas, +Y is down, so we use Z for Y. +X is right.
            ctx.lineTo(w/2 + headingX * len, h/2 - headingZ * len);
            ctx.lineWidth = 2; ctx.strokeStyle = '#8ff'; ctx.stroke();
        }


        // 'N' indicator (always at the top)
        ctx.font = '12px monospace';
        ctx.fillStyle = '#9ef';
        ctx.fillText('N', w/2 - 4, 14);
      }
      requestAnimationFrame(tick);
    }
    tick();
  }
  
  function bindKeys() {
      window.addEventListener('keydown', (e) => {
          const keyMap = cfg()?.minimap;
          if (keyMap?.includes(e.code)) {
              toggle();
          }
      });
  }

  function start(){
    ensureUI();
    loopXYZ();
    loopMap();
    bindKeys();
  }

  // mount on start
  window.addEventListener('pp:start', start, { once:true });
  if (window.__PP_ALREADY_STARTED__) start();
})();
// =================================================================
// END: assets/dev/util/minimap_northup_xyz.js
// =================================================================


// =================================================================
// START: assets/dev/util/ghost_cam.js
// =================================================================
// ./assets/dev/util/ghost_cam.js — v1.2
// Picture-in-picture camera that shows what the ghost sees (or over-shoulder).
// Independent of ghost visibility/alpha and resilient to scene/camera resets.

(function(){
  "use strict";
  if (window.GHOST_CAM && window.GHOST_CAM.__v === "1.2") return;

  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const MAIN   = ()=> window.camera || SCENE()?.activeCamera;
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const toast  = (m,ms=900)=> (window.toast? window.toast(m,ms) : console.log("[ghost-cam]", m));

  const ST = {
    s: null,
    cam: null,
    enabled: false,
    mode: "pov", // "pov" | "over"
    vp: { x:0.77, y:0.70, w:0.22, h:0.28 }, // bottom-right PIP
    obs: null,
    keepAliveObs: null
  };

  function ghostRoot(){
    // Prefer the dev-selected root; otherwise use whatever the runtime created
    if (window.PREFERRED_GHOST_ROOT && !window.PREFERRED_GHOST_ROOT.isDisposed?.()) return window.PREFERRED_GHOST_ROOT;
    // Try to find the ghost root node created by the game
    return SCENE()?.getTransformNodeByName("GhostRoot");
  }

  function ensureCamera(){
    const s = ST.s = SCENE(); if (!s) return null;
    // Reuse if alive
    if (ST.cam && !ST.cam.isDisposed()) return ST.cam;

    const main = MAIN();
    const cam = new BABYLON.FreeCamera("GhostPIP", v3(0,1.6,0), s, true);
    cam.minZ = 0.05;
    cam.maxZ = 2000;
    cam.fov  = 0.9;
    cam.layerMask = main?.layerMask ?? 0x0FFFFFFF;
    cam.viewport = new BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);
    cam.attachControl?.(false); // no input
    cam.inputs?.clear?.();      // make sure user cannot move this cam
    cam.getViewMatrix();        // warm up

    ST.cam = cam;
    return cam;
  }

  function enable(){
    const s = SCENE(); const main = MAIN();
    if (!s || !main) return;

    const cam = ensureCamera();
    if (!cam) return;

    // Make it a true PIP: activeCameras includes both
    const list = (s.activeCameras && s.activeCameras.length)
      ? s.activeCameras.slice()
      : [main];

    // Remove duplicates then append our cam
    const uniq = [];
    list.forEach(c=> { if (c && !uniq.includes(c)) uniq.push(c); });
    if (!uniq.includes(cam)) uniq.push(cam);

    s.activeCameras = uniq;

    // Keep viewport where we want it
    cam.viewport = new BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);

    if (!ST.obs){
      ST.obs = s.onBeforeRenderObservable.add(update);
    }
    if (!ST.keepAliveObs){
      // If something resets activeCameras, put ours back in on the next frame
      ST.keepAliveObs = s.onAfterRenderObservable.add(()=>{
        if (!s.activeCameras || s.activeCameras.length === 0){
          const m = MAIN(); if (m) s.activeCameras = [m];
        }
        if (s.activeCameras && !s.activeCameras.includes(ST.cam)){
          const arr = s.activeCameras.slice(); arr.push(ST.cam); s.activeCameras = arr;
        }
      });
    }

    ST.enabled = true;
    toast("Ghost Cam: ON");
  }

  function disable(){
    const s = SCENE(); if (!s) return;
    if (ST.obs){ s.onBeforeRenderObservable.remove(ST.obs); ST.obs = null; }
    if (ST.keepAliveObs){ s.onAfterRenderObservable.remove(ST.keepAliveObs); ST.keepAliveObs = null; }
    // Remove our camera from activeCameras but keep main
    if (s.activeCameras && ST.cam){
      s.activeCameras = s.activeCameras.filter(c=> c && c !== ST.cam);
    }
    ST.enabled = false;
    toast("Ghost Cam: OFF");
  }

  function toggle(){ ST.enabled ? disable() : enable(); }

  function setMode(m){
    ST.mode = (m === "over") ? "over" : "pov";
    toast("Ghost Cam mode: " + ST.mode.toUpperCase());
  }

  function cycleMode(){
    setMode(ST.mode === "pov" ? "over" : "pov");
  }

  function update(){
    const s = ST.s || SCENE(); if (!s) return;
    const cam = ST.cam || ensureCamera(); if (!cam) return;
    const root = ghostRoot(); if (!root) return;

    // Position/orient based on mode
    if (ST.mode === "pov"){
      // POV at ~eye height, a bit forward from root center
      const up = root.up || BABYLON.Axis.Y;
      const headOffset = v3(0, 1.6, 0); // relative to ghost origin
      // derive forward from root's rotation; we assume Y-rotation for heading
      const ry = root.rotationQuaternion ? BABYLON.Quaternion.FromRotationMatrix(root.getWorldMatrix()).toEulerAngles().y
                                         : (root.rotation?.y || 0);
      const fwd = v3(Math.sin(ry), 0, Math.cos(ry));
      const pos = root.getAbsolutePosition().add(headOffset).add(fwd.scale(0.05)); // tiny nose offset
      cam.position.copyFrom(pos);
      // look toward where the ghost is moving/looking
      const target = pos.add(fwd);
      cam.setTarget(target, true);
      cam.upVector.copyFrom(up);
    } else {
      // Over-shoulder: a little behind and above the ghost
      const ry = root.rotationQuaternion ? BABYLON.Quaternion.FromRotationMatrix(root.getWorldMatrix()).toEulerAngles().y
                                         : (root.rotation?.y || 0);
      const back = v3(-Math.sin(ry), 0, -Math.cos(ry));
      const pos = root.getAbsolutePosition()
        .add(back.scale(1.2))   // behind
        .add(v3(0, 1.8, 0));    // above
      cam.position.copyFrom(pos);
      const look = root.getAbsolutePosition().add(v3(0, 1.4, 0));
      cam.setTarget(look, true);
    }

    // Maintain viewport & layer mask in case main camera changed
    const main = MAIN();
    cam.layerMask = main?.layerMask ?? cam.layerMask;
    cam.viewport = new BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);
  }

  // Hotkeys
  window.addEventListener("keydown", (e)=>{
    if (e.altKey && (e.code === "KeyC" || e.key === "c" || e.key === "C")){
      if (e.shiftKey) cycleMode();
      else toggle();
    }
  });

  // Minimal API
  window.GHOST_CAM = {
    __v: "1.2",
    enable, disable, toggle, setMode, cycleMode,
    setViewport(x, y, w, h){
      ST.vp = { x, y, w, h };
      if (ST.cam) ST.cam.viewport = new BABYLON.Viewport(x, y, w, h);
    }
  };

  // Lazy boot: wait until scene exists, then create cam (disabled by default)
  const boot = setInterval(()=>{
    try{
      if (SCENE() && MAIN()){
        clearInterval(boot);
        ensureCamera(); // create but keep disabled until user toggles
      }
    }catch{}
  }, 150);
})();
// =================================================================
// END: assets/dev/util/ghost_cam.js
// =================================================================


// =================================================================
// START: assets/dev/game/inventory_system.js
// =================================================================
// File: assets/dev/game/inventory_system.js
// Van inventory & loadout (3 user slots). Belt is updated via events AND direct apply.
(function(){
  "use strict";
  const PP = (window.PP = window.PP || {});
  PP.inventory = PP.inventory || {};

  /* -------------------- Catalog (display + icons) -------------------- */
  // Icon paths are now loaded from an external URL to prevent 404 errors.
  const ITEM_META = {
    dots:           { id:'dots',           name:'DOTS',           icon: './assets/icons/dots.png' },
    smudge:         { id:'smudge',         name:'Smudge Stick',   icon: './assets/icons/smudge_sticks.png' },
    salt:           { id:'salt',           name:'Salt Shaker',    icon: './assets/icons/salt.png' },
    sanity:         { id:'sanity',         name:'Sanity Meds',    icon: './assets/icons/sanity_pills.png' },
    crucifix:       { id:'crucifix',       name:'Crucifix',       icon: './assets/icons/crucifix.png' },
    spirit:         { id:'spirit',         name:'Spirit Box',     icon: './assets/icons/spirit_box.png' },
    book:           { id:'book',           name:'Writing Book',   icon: './assets/icons/ghost_writing_book.png' },
    emf:            { id:'emf',            name:'EMF Reader',     icon: './assets/icons/emf.png' },
    uv:             { id:'uv',             name:'UV Flashlight',  icon: './assets/icons/uv_light.png' }
  };

  // This script contributes to the global item catalog.
  // Other scripts can add their items to PP.inventory.ITEM_META as well.
  PP.inventory.ITEM_META = Object.assign(PP.inventory.ITEM_META || {}, ITEM_META);
  
  // Placeholder for item model definitions, to be called by bootstrap
  PP.inventory.models = {
    init: function(scene) {
      console.log("[ItemModels] Init (placeholder). No models will be loaded for items.");
    }
  };

})();
// =================================================================
// END: assets/dev/game/inventory_system.js
// =================================================================


// =================================================================
// START: assets/dev/systems/salt_system.js
// =================================================================
(function(){
  "use strict";
  window.PP_SYSTEMS = window.PP_SYSTEMS || {};
  const sys = (window.PP_SYSTEMS.salt = {});
  sys.init = function(scene){ console.log("[Salt] Init"); };
  sys.trigger = function(pos){ console.log("[Salt] Triggered at", pos); };
})();
// =================================================================
// END: assets/dev/systems/salt_system.js
// =================================================================


// =================================================================
// START: assets/dev/systems/writing_book.js
// =================================================================
(function(){
  "use strict";
  window.PP_SYSTEMS = window.PP_SYSTEMS || {};
  const sys = (window.PP_SYSTEMS.writing_book = {});
  sys.init = function(scene){ console.log("[WritingBook] Init"); };
  sys.place = function(pos){ console.log("[WritingBook] Placed at", pos); };
})();
// =================================================================
// END: assets/dev/systems/writing_book.js
// =================================================================


// =================================================================
// START: assets/dev/systems/uv_prints.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.systems = PP.systems || {};
  
  const UV_SYSTEM = {
    _scene: null,
    _uvActive: false,
    _allPrints: [],
    _texture: null,
    LIFETIME_MS: 120 * 1000, // 2 minutes
  };

  UV_SYSTEM.init = function(scene) {
    this._scene = scene;
    this._texture = new BABYLON.Texture("./assets/textures/uv_texture.png", scene);
    
    window.addEventListener('pp:uv_light:toggle', () => {
      this._uvActive = !this._uvActive;
      window.toast(`UV Light ${this._uvActive ? 'ON' : 'OFF'}`, 1000);
      this.updatePrintVisibility();
    });

    // Clean up disposed prints from our tracking array periodically
    scene.onBeforeRenderObservable.add(() => {
      if (Math.random() < 0.01) { // Low-frequency check
        this._allPrints = this._allPrints.filter(p => p && !p.isDisposed());
      }
    });
  };

  UV_SYSTEM.updatePrintVisibility = function() {
    for (const print of this._allPrints) {
      if (print && print.material && !print.isDisposed()) {
        print.material.alpha = this._uvActive ? 1.0 : 0.0;
      }
    }
  };

  /**
   * Called by ghost logic to place a print.
   * @param {BABYLON.AbstractMesh} targetMesh The mesh to place the decal on.
   * @param {BABYLON.Vector3} hitPoint World position for the center of the decal.
   * @param {BABYLON.Vector3} hitNormal Normal of the surface at the hit point.
   */
  UV_SYSTEM.trigger = function(targetMesh, hitPoint, hitNormal) {
    if (!targetMesh || !this._scene || !hitPoint || !hitNormal) return;

    // Check if this is a valid piece of evidence for the current ghost
    if (!window.PP.checkForEvidence('Ultraviolet')) {
      return;
    }

    const size = new BABYLON.Vector3(0.4, 0.4, 0.2); // width, height, depth of decal projection
    const printDecal = BABYLON.MeshBuilder.CreateDecal("uvPrint", targetMesh, {
      position: hitPoint,
      normal: hitNormal,
      size: size,
      angle: Math.random() * Math.PI * 2 // Random rotation
    });

    const mat = new BABYLON.StandardMaterial("uvPrintMat", this._scene);
    mat.diffuseTexture = this._texture;
    mat.emissiveTexture = this._texture;
    mat.emissiveColor = new BABYLON.Color3(0.8, 1, 0.8);
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.backFaceCulling = false;
    mat.alpha = this._uvActive ? 1.0 : 0.0; // Initially visible only if UV is on
    mat.zOffset = -2; // Prevent z-fighting

    printDecal.material = mat;
    printDecal.isPickable = false;

    this._allPrints.push(printDecal);

    setTimeout(() => {
      try { 
        if(printDecal && !printDecal.isDisposed()) {
            printDecal.dispose(false, true); // Dispose mesh and its material
        }
      } catch(e) {}
    }, this.LIFETIME_MS);
    
    // Announce evidence found (only once is better, but this is simple)
    window.PP.foundEvidence('Ultraviolet');
    window.toast("You have found evidence: Ultraviolet", 2000);
  };

  PP.systems.uv_prints = UV_SYSTEM;
})();
// =================================================================
// END: assets/dev/systems/uv_prints.js
// =================================================================


// =================================================================
// START: assets/dev/game/lighter.js
// =================================================================
(function(){
  'use strict';
  if (window.LIGHTER) return;

  const log = (...a) => console.log("[Lighter]", ...a);

  const lighter = (window.LIGHTER = {
    mesh: null,
    flameEffect: null,
    light: null,
    isOn: false,
    _isInitialized: false,
  });

  lighter.init = function(scene){
    if (!scene || lighter._isInitialized) return;
    
    const playerRig = window.PlayerRig;
    const handNode = playerRig?.getHandNode();

    if (!handNode) {
        console.warn("[Lighter] HandNode not available on PlayerRig. Deferring init.");
        setTimeout(() => lighter.init(scene), 200);
        return;
    }
    
    log("Initializing...");

    const body = BABYLON.MeshBuilder.CreateBox("lighterBody", {width: 0.04, height: 0.06, depth: 0.015}, scene);
    
    lighter.light = new BABYLON.PointLight("lighterLight", BABYLON.Vector3.Zero(), scene);
    lighter.light.diffuse = new BABYLON.Color3(1, 0.7, 0.2);
    lighter.light.intensity = 0;
    lighter.light.range = 2.5;

    const flamePS = new BABYLON.ParticleSystem("lighterFlamePS", 500, scene);
    flamePS.particleTexture = new BABYLON.Texture("./assets/textures/flare.png", scene);
    
    flamePS.minEmitBox = new BABYLON.Vector3(-0.005, 0.03, -0.005);
    flamePS.maxEmitBox = new BABYLON.Vector3(0.005, 0.03, 0.005);
    
    flamePS.color1 = new BABYLON.Color4(1, 0.5, 0, 1.0);
    flamePS.color2 = new BABYLON.Color4(1, 0.8, 0.3, 1.0);
    flamePS.colorDead = new BABYLON.Color4(0.1, 0, 0, 0.0);

    flamePS.minSize = 0.04;
    flamePS.maxSize = 0.08;
    flamePS.minLifeTime = 0.1;
    flamePS.maxLifeTime = 0.3;
    flamePS.emitRate = 200;
    flamePS.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
    flamePS.gravity = new BABYLON.Vector3(0, 0.7, 0);
    flamePS.direction1 = new BABYLON.Vector3(0, 0.8, 0);
    flamePS.direction2 = new BABYLON.Vector3(0, 0.8, 0);
    flamePS.minAngularSpeed = 0;
    flamePS.maxAngularSpeed = Math.PI;
    flamePS.minEmitPower = 0.5;
    flamePS.maxEmitPower = 1.0;
    flamePS.updateSpeed = 0.007;
    
    lighter.flameEffect = flamePS;
    
    const rootMesh = new BABYLON.TransformNode("lighterRoot", scene);
    body.parent = rootMesh;
    lighter.light.parent = rootMesh;
    flamePS.emitter = rootMesh;
    
    lighter.light.position.y = 0.04;
    
    lighter.mesh = rootMesh;

    lighter.mesh.parent = handNode;
    lighter.mesh.position.set(0, 0, 0.05);
    lighter.mesh.rotation.set(Math.PI / 2, 0, 0);

    lighter.mesh.isPickable = false;
    lighter.mesh.getChildMeshes().forEach(m => m.isPickable = false);
    
    lighter.toggle(false);

    scene.onBeforeRenderObservable.add(() => lighter.update(scene.getEngine().getDeltaTime() / 1000));
    
    window.addEventListener('pp:lighter:toggle', () => lighter.toggle());

    lighter._isInitialized = true;
    log("Initialized successfully.");
  };

  lighter.toggle = function(state){
    const shouldBeOn = state ?? !lighter.isOn;
    if (shouldBeOn === lighter.isOn && lighter._isInitialized) return;

    lighter.isOn = shouldBeOn;
    
    if (lighter.light) lighter.light.intensity = lighter.isOn ? 2.0 : 0;
    
    if (lighter.flameEffect) {
        if (lighter.isOn) lighter.flameEffect.start();
        else lighter.flameEffect.stop();
    }
    
    if (lighter.mesh) {
        lighter.mesh.getChildMeshes().forEach(m => m.setEnabled(lighter.isOn));
    }
  };

  lighter.update = function(dt){
    if (!lighter.isOn) return;
    
    const ghostData = window.PP?.state?.selectedGhost;
    const ghostRoot = window.PP?.ghost?.root || window.GhostLogic?.ghost;
    const rigRoot = window.PlayerRig?.getRigRoot();

    if (!ghostData || !ghostRoot || !rigRoot) return;

    const distance = BABYLON.Vector3.Distance(ghostRoot.position, rigRoot.position);

    if (distance < 3 && ghostData.name !== 'Shade' && Math.random() < (0.2 * dt)) {
      lighter.toggle(false);
      window.toast("Your lighter was extinguished!", 1500);
      
      if(window.PP?.tools?.emf?.trigger) {
        window.PP.tools.emf.trigger(rigRoot.position, 2);
      }
    }
  };
  
  window.addEventListener('pp:belt:equip', () => {
    if (lighter.isOn) {
        lighter.toggle(false);
    }
  });

})();
// =================================================================
// END: assets/dev/game/lighter.js
// =================================================================


// =================================================================
// START: assets/dev/game/lantern.js
// =================================================================
(function(){
  "use strict";
  if (window.LANTERN) return;
  const sys = (window.LANTERN = {});
  sys.init = function(scene){ console.log("[Lantern] Init"); };
  sys.toggle = function(){ console.log("[Lantern] Toggled"); };
  window.addEventListener('pp:flashlight:toggle', ()=> sys.toggle());
})();
// =================================================================
// END: assets/dev/game/lantern.js
// =================================================================


// =================================================================
// START: assets/dev/tools/dots_system.js
// =================================================================
(function(){
  "use strict";
  window.PP_SYSTEMS = window.PP_SYSTEMS || {};
  const sys = (window.PP_SYSTEMS.dots = {});
  sys.init = function(scene){ console.log("[DOTS] Init"); };
  sys.place = function(pos){ console.log("[DOTS] Placed at", pos); };
})();
// =================================================================
// END: assets/dev/tools/dots_system.js
// =================================================================


// =================================================================
// START: assets/dev/tools/emf.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.tools = PP.tools || {};
  const sys = (PP.tools.emf = {});
  sys.init = function(scene){ console.log("[EMF] Init"); };
  sys.trigger = function(pos, level){ console.log(`[EMF] Triggered at ${pos} with level ${level}`); };
})();
// =================================================================
// END: assets/dev/tools/emf.js
// =================================================================


// =================================================================
// START: assets/dev/tools/spirit_box.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.tools = PP.tools || {};
  const sys = (PP.tools.spiritbox = {});
  sys.init = function(scene){ console.log("[SpiritBox] Init"); };
  sys.toggle = function(){ console.log("[SpiritBox] Toggled"); };
  sys.speak = function(){ console.log("[SpiritBox] Ghost speaking..."); };
})();
// =================================================================
// END: assets/dev/tools/spirit_box.js
// =================================================================


// =================================================================
// START: assets/dev/tools/parabolic_mic.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.tools = PP.tools || {};
  PP.tools.parabolic = PP.tools.parabolic || {};

  const CFG = {
    CONE_DEG: 16,       // half-angle of the beam
    RANGE: 30,          // meters
    BOOST: 1.30,        // +30%
    TICK_MS: 120
  };

  const S = {
    scn: null,
    timer: null,
    active: false,
    // cache original volumes so we can restore
    orig: new WeakMap()
  };

  function scene(){ return window.SCENE || BABYLON.Engine?.LastCreatedScene || null; }

  function inCone(origin, forward, p, deg){
    const dir = p.subtract(origin).normalize();
    const cos = BABYLON.Vector3.Dot(forward.normalize(), dir);
    const cosTheta = Math.cos(BABYLON.Angle.FromDegrees(deg).radians());
    const dist = BABYLON.Vector3.Distance(origin, p);
    return (cos >= cosTheta) && (dist <= CFG.RANGE);
  }

  function tick(){
    if (!S.active || !S.scn) return;

    // Define beam from active camera (or held mic emitter if you prefer)
    const cam = S.scn.activeCamera || window.camera;
    if (!cam) return;
    const origin = cam.globalPosition || cam.position;
    const forward = cam.getDirection ? cam.getDirection(BABYLON.Vector3.Forward()) : new BABYLON.Vector3(0,0,1);

    const sounds = S.scn.soundTracks?.flatMap(t=> t.soundCollection || []) || S.scn.mainSoundTrack?.soundCollection || [];
    if (!Array.isArray(sounds)) return;

    // First, restore everything
    for (const snd of sounds){
      if (!snd) continue;
      const base = S.orig.get(snd);
      if (typeof base === 'number'){
        try{ snd.setVolume(base); }catch{}
      }
    }

    // Then, boost those in cone with attached nodes
    for (const snd of sounds){
      if (!snd || !snd.spatialSound) continue;
      const n = snd.connectedTransformNode || snd._connectedTransformNode || null;
      const p = n?.getAbsolutePosition?.() || n?.position || null;
      if (!p) continue;

      // Save original if not cached
      if (!S.orig.has(snd)){
        try { S.orig.set(snd, snd.getVolume()); } catch { S.orig.set(snd, 1.0); }
      }

      if (inCone(origin, forward, p, CFG.CONE_DEG)){
        const base = S.orig.get(snd) || 1.0;
        try { snd.setVolume(Math.min(1.0, base * CFG.BOOST)); } catch {}
      }
    }
  }

  function enable(on){
    S.active = !!on;
    if (S.active){
      if (!S.scn) S.scn = scene();
      if (!S.timer) S.timer = setInterval(tick, CFG.TICK_MS);
    } else {
      if (S.timer) { clearInterval(S.timer); S.timer = null; }
      // restore volumes
      const s = S.scn;
      const sounds = s?.soundTracks?.flatMap(t=> t.soundCollection || []) || s?.mainSoundTrack?.soundCollection || [];
      if (Array.isArray(sounds)){
        for (const snd of sounds){
          const base = S.orig.get(snd);
          if (typeof base === 'number'){
            try{ snd.setVolume(base); }catch{}
          }
        }
      }
      S.orig = new WeakMap();
    }
  }

  PP.tools.parabolic.enable = enable;
})();
// =================================================================
// END: assets/dev/tools/parabolic_mic.js
// =================================================================


// =================================================================
// START: assets/dev/ui/reticle.js
// =================================================================
(function () {
  "use strict";

  let RETICLE_OPTS = Object.assign({
    visible: true,
    style: "cross",
    size: 18,
    thickness: 2,
    gap: 4,
    color: "rgba(0, 255, 255, 0.8)",
    hitColor: "rgba(0, 255, 0, 1)",
    opacity: 1,
    maxAimDistance: 3.0
  }, (window.RETICLE_OPTS || {}));

  let WRAP, SVG;

  function injectCSS() {
    if (document.getElementById("reticle-style")) return;
    const css = `
      #reticle{
        position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
        z-index:6500; pointer-events:none; opacity:${RETICLE_OPTS.opacity};
        transition: transform 120ms ease, opacity 120ms ease;
      }
      #reticle svg { display:block; filter: drop-shadow(0 0 2px rgba(0,0,0,0.7)); }
    `;
    const s = document.createElement("style");
    s.id = "reticle-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function makeCrossSVG({ size, thickness, gap, color }) {
    const s = size, g = gap, half = s / 2, len = half - g;
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <line x1="${half}" y1="${half - g - len}" x2="${half}" y2="${half - g}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
      <line x1="${half}" y1="${half + g}"       x2="${half}" y2="${half + g + len}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
      <line x1="${half - g - len}" y1="${half}" x2="${half - g}" y2="${half}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
      <line x1="${half + g}"       y1="${half}" x2="${half + g + len}" y2="${half}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
    </svg>`;
  }

  function makeDotSVG({ size, thickness, color, withCircle }) {
    const s = size, cx = s / 2, cy = s/2;
    let content = `<circle cx="${cx}" cy="${cy}" r="${Math.max(1, thickness)}" fill="${color}" />`;
    if (withCircle) {
      content = `<circle cx="${cx}" cy="${cy}" r="${(s / 2) - thickness}" fill="none" stroke="${color}" stroke-width="${thickness}" />` + content;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${content}</svg>`;
  }

  function buildSVG(opts) {
    if (opts.style === "dot")        return makeDotSVG(opts);
    if (opts.style === "circle-dot") return makeDotSVG(Object.assign({}, opts, { withCircle: true }));
    return makeCrossSVG(opts);
  }

  function mount() {
    injectCSS();
    WRAP = document.getElementById("reticle");
    if (!WRAP) {
      WRAP = document.createElement("div");
      WRAP.id = "reticle";
      document.body.appendChild(WRAP);
    }
    WRAP.innerHTML = buildSVG(RETICLE_OPTS);
    SVG = WRAP.firstElementChild;
    setReticleVisible(!!RETICLE_OPTS.visible);
  }

  function setReticleVisible(v) {
    if (WRAP) WRAP.style.display = v ? "block" : "none";
  }
  function setReticleColor(c) {
    if(!SVG) return;
    SVG.querySelectorAll("line,circle").forEach(el => {
      if (el.getAttribute("fill") !== "none") el.setAttribute("fill", c);
      else el.setAttribute("stroke", c);
    });
  }
  function reticleFlash(ms = 140, color = RETICLE_OPTS.hitColor) {
    if (!WRAP) return;
    const prevColor = RETICLE_OPTS.color;
    setReticleColor(color);
    WRAP.style.transform = "translate(-50%,-50%) scale(1.25)";
    setTimeout(() => {
      setReticleColor(prevColor);
      WRAP.style.transform = "translate(-50%,-50%) scale(1)";
    }, ms);
  }
  function reticleSetStyle(newOpts) {
    RETICLE_OPTS = Object.assign(RETICLE_OPTS, newOpts || {});
    mount();
  }

  window.setReticleVisible = setReticleVisible;
  window.setReticleColor   = setReticleColor;
  window.reticleFlash      = reticleFlash;
  window.reticleSetStyle   = reticleSetStyle;

  function startAimCheck() {
    const scene = window.scene || BABYLON.Engine?.LastCreatedScene;
    if (!scene) { setTimeout(startAimCheck, 100); return; }
    let last = 0;
    scene.onBeforeRenderObservable.add(() => {
      if(!RETICLE_OPTS.visible) return;
      const now = performance.now();
      if (now - last < 80) return; // ~12.5 fps check
      last = now;
      try {
        const cam = window.camera; if (!cam) return;
        const ray = scene.createPickingRay(scene.getEngine().getRenderWidth() / 2, scene.getEngine().getRenderHeight() / 2, null, cam);
        ray.length = RETICLE_OPTS.maxAimDistance;
        const hit = scene.pickWithRay(ray, m => m && m.isPickable !== false);
        setReticleColor(hit?.hit ? RETICLE_OPTS.hitColor : RETICLE_OPTS.color);
      } catch (_) {}
    });
  }

  window.addEventListener("keydown", (e) => {
    if ((e.key === "r" || e.key === "R") && e.altKey) {
      RETICLE_OPTS.visible = !RETICLE_OPTS.visible;
      setReticleVisible(RETICLE_OPTS.visible);
    }
  });

  document.addEventListener("DOMContentLoaded", () => { mount(); startAimCheck(); });
})();
// =================================================================
// END: assets/dev/ui/reticle.js
// =================================================================


// =================================================================
// START: assets/dev/ui/belt_manager.js
// =================================================================
(function(){
  "use strict";
  console.log('[BeltManager] Loaded placeholder.');
  // The logic for building the belt is in gameplay_patch.js and input_manager.js
})();
// =================================================================
// END: assets/dev/ui/belt_manager.js
// =================================================================


// =================================================================
// START: assets/dev/ui/hud_ui.js
// =================================================================
(function(){
  "use strict";
  window.toast = function(message, duration = 2000) {
    const container = document.querySelector('.toast-container') || (()=>{
        const el = document.createElement('div');
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    })();
    const toastElement = document.createElement('div');
    toastElement.className = 'toast';
    toastElement.textContent = message;
    container.appendChild(toastElement);
    setTimeout(() => {
        toastElement.remove();
    }, duration);
  };
  
  window.updateSanity = function(val) {
      const el = document.getElementById('hud-sanity');
      if (el) el.textContent = `Sanity: ${val}%`;
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('hud-xyz')) {
        const xyz = document.createElement('div');
        xyz.id = 'hud-xyz';
        Object.assign(xyz.style, {
            position: 'fixed', bottom: '10px', right: '10px', color: '#0ff',
            fontFamily: 'monospace', zIndex: '9000', textShadow: '0 0 4px black'
        });
        document.body.appendChild(xyz);
    }
  });
})();
// =================================================================
// END: assets/dev/ui/hud_ui.js
// =================================================================


// =================================================================
// START: assets/dev/ui/notebook_ui.js
// =================================================================
(function(){
  'use strict';
  if (window.NotebookUI_React) return;
  window.NotebookUI_React = true;

  const NOTEBOOK_ID = 'notebook-modal';
  let isOpen = false;

  function setOpen(shouldBeOpen) {
    const modal = document.getElementById(NOTEBOOK_ID);
    if (!modal) {
        console.warn("[NotebookUI] Modal element not found:", NOTEBOOK_ID);
        return;
    }

    if (isOpen === shouldBeOpen) return;
    
    isOpen = shouldBeOpen;
    modal.style.display = isOpen ? 'block' : 'none';
    
    if (isOpen) {
      window.PP?.pointerLock?.hold('notebook');
    } else {
      window.PP?.pointerLock?.release('notebook');
    }
    window.dispatchEvent(new CustomEvent(isOpen ? 'pp:notebook:open' : 'pp:notebook:close'));
  }

  window.openNotebook = function() {
    setOpen(!isOpen);
  };

  window.closeNotebook = function() {
    setOpen(false);
  };

  console.log('[NotebookUI] React-based notebook controller initialized.');

})();
// =================================================================
// END: assets/dev/ui/notebook_ui.js
// =================================================================


// =================================================================
// START: assets/dev/ui/van_ui.js
// =================================================================
(function(){
  "use strict";
  console.log('[VanUI] Loaded placeholder.');
  let isOpen = false;
  window.toggleVanUI = function() {
      isOpen = !isOpen;
      console.log(`Van UI is now ${isOpen ? 'open' : 'closed'}`);
      if (isOpen) window.PP?.pointerLock?.hold('van');
      else window.PP?.pointerLock?.release('van');
  };
})();
// =================================================================
// END: assets/dev/ui/van_ui.js
// =================================================================


// =================================================================
// START: assets/dev/effects/effects_sanity_med.js
// =================================================================
(function(){
  "use strict";

  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function applyEffects(){
    window.dispatchEvent(new CustomEvent('pp:player:stamina-boost', { detail:{ seconds:10 }}));
    window.toast("Stamina boost applied!", 1200);

    const total = 40, dur = 30, tick = 0.5;
    const perTick = total / (dur / tick);
    let elapsed = 0;

    const id = setInterval(()=>{
      elapsed += tick;
      try {
        if (typeof window.PP?.state?.sanity === 'number'){
            window.PP.state.sanity = clamp(window.PP.state.sanity + perTick, 0, 100);
            
            if (typeof window.updateSanity === "function") {
                window.updateSanity(Math.round(window.PP.state.sanity));
            }
        }
      } catch {}
      if (elapsed >= dur) {
        clearInterval(id);
        window.toast("Sanity restored.", 1500);
      }
    }, tick*1000);
  }

  window.addEventListener('pp:effect:sanity-med', applyEffects);
})();
// =================================================================
// END: assets/dev/effects/effects_sanity_med.js
// =================================================================


// =================================================================
// START: assets/dev/tools/devtools.js
// =================================================================
(function(){
  "use strict";

  const $ = (sel, root=document)=> root.querySelector(sel);
  const el = (tag, attrs={}, kids=[])=>{
    const n=document.createElement(tag);
    for (const k in attrs){
      if (k==="style") Object.assign(n.style, attrs[k]);
      else if (k in n) n[k]=attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const k of kids) n.appendChild(typeof k==="string"?document.createTextNode(k):k);
    return n;
  };
  const btn = (label, onclick, title='')=>{ const b=el('button',{className:'hud-btn', title},[label]); if(onclick) b.onclick=onclick; Object.assign(b.style, { border:'1px solid #244',background:'#0b0b0b',color:'#9ff',padding:'6px 10px',borderRadius:'8px',cursor:'pointer'}); return b; };
  const lab = (t)=> el('span',{style:{color:'#9ff',minWidth:'56px',display:'inline-block'}},[t]);
  const input = (type,id,val,attrs={})=>{
    return el('input',Object.assign({type,id,value:val,style:{padding:'4px',background:'#000',color:'#0ff',
      border:'1px solid #066',borderRadius:'4px'}},attrs),[]);
  };
  const check = (label,id,onChange,checked=false)=>{
    const w=el('label',{style:{display:'inline-flex',gap:'6px',alignItems:'center',cursor:'pointer'}},
      [el('input',{id,type:'checkbox',checked}), el('span',{style:{color:'#cff'}},[label])]);
    if(onChange) setTimeout(()=> $('#'+id).addEventListener('change', onChange),0);
    return w;
  };
  const sel = (id, opts)=>{ const s=el('select',{id,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px'}},[]);
    (opts||[]).forEach(([v,t])=> s.appendChild(el('option',{value:v},[t]))); return s; };

  const STATE = {
    ready:false, fpsEl:null, lastPick:null, clickTeleport:false,
    loggerLines:[], loggerMax:120,
    doors: []
  };
  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const ENGINE= ()=> window.engine || SCENE()?.getEngine?.();
  const toast = (msg,ms=1200)=> (window.toast? window.toast(msg,ms): console.log('[toast]',msg));

  function logLine(msg){
    STATE.loggerLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (STATE.loggerLines.length > STATE.loggerMax) STATE.loggerLines.shift();
    const out = $('#dev-log'); if (out) out.textContent = STATE.loggerLines.join('\n');
    try{ console.log('[Dev]', msg);}catch{}
  }
  function exportJSON(name,obj){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }
  function exportText(name, text){
    const blob=new Blob([text],{type:'text/plain'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }

  function pickUnderCursor(){
    const s=SCENE(); if(!s) return;
    const ray=s.createPickingRay(s.pointerX, s.pointerY, BABYLON.Matrix.Identity(), window.camera);
    const hit=s.pickWithRay(ray, m=>m && m.isPickable!==false);
    if(hit?.hit && hit.pickedMesh){ selectMesh(hit.pickedMesh); }
  }
  function selectMesh(mesh){
    STATE.lastPick = mesh;
    const name = $('#mesh-name'); if (name) name.textContent = mesh?.name || '(unnamed)';
    try{
      if (!STATE.gizmo){
        const gm = new BABYLON.GizmoManager(SCENE());
        gm.usePointerToAttachGizmos=false;
        gm.positionGizmoEnabled=true; gm.rotationGizmoEnabled=true; gm.scaleGizmoEnabled=false;
        STATE.gizmo = gm;
      }
      STATE.gizmo.attachToMesh(mesh);
    }catch(e){}
    if ($('#door-selected')) $('#door-selected').textContent = mesh?.name || '(none)';
    if ($('#door-preview-name')) $('#door-preview-name').textContent = mesh?.name || '(none)';
  }

  function scanSceneNodes(filterEmpty=true){
    const s=SCENE(); if(!s) return {count:0,items:[],summary:{}};
    const items=[];
    for (const m of s.meshes){ items.push({type:'Mesh',name:m.name||'',ref:m}); }
    const out = filterEmpty ? items.filter(x=>x.name && x.name.trim().length) : items;
    return {count: out.length, items: out, summary:{}};
  }

  const PANEL = { root:null, tabs:null, body:null };

  function ensurePanel(){
    const root = $('#devtools-panel');
    if (!root) return false;
    root.innerHTML = "";
    root.style.display = 'block';
    const hdr = el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}},[
      el('div',{style:{color:'#9ff',fontWeight:'bold'}},['Developer Tools (v4)']),
      (STATE.fpsEl = el('div',{style:{color:'#8ff',fontSize:'12px'}},['FPS: --']))
    ]);
    const tabs = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}},[]);
    const body = el('div',{style:{border:'1px solid #033',padding:'8px',borderRadius:'8px',background:'#0a0a0a'}},[]);
    PANEL.root=root; PANEL.tabs=tabs; PANEL.body=body;
    root.appendChild(hdr); root.appendChild(tabs); root.appendChild(body);
    return true;
  }
  function addTab(name, builder, active=false){
    const b = btn(name, ()=>{ PANEL.body.innerHTML=""; builder(); });
    if (active) setTimeout(()=> b.click(), 0);
    PANEL.tabs.appendChild(b);
  }

  function buildMapUI(){
    const row = el('div',{style:{display:'flex', gap:'8px'}},[
        btn('Generate New Map', async ()=>{ 
            if (window.ProHouseGenerator) { 
                logLine('Generating new procedural map...');
                await window.ProHouseGenerator.generateMap(SCENE());
                logLine('New map generated.');
            } else {
                logLine('ProHouseGenerator not found.');
            }
        }),
        btn('Clear Log', ()=>{ const o=$('#dev-log'); if(o) o.textContent=''; STATE.loggerLines.length=0; })
    ]);
    const log = el('pre',{id:'dev-log',style:{background:'#000',border:'1px solid #033',padding:'8px',minHeight:'120px',maxHeight:'220px',overflow:'auto',color:'#8ff',whiteSpace:'pre-wrap'}},[]);
    PANEL.body.appendChild(row);
    PANEL.body.appendChild(el('div',{style:{marginTop:'8px',color:'#8ff'}},["Log:"]));
    PANEL.body.appendChild(log);
  }

  function buildMeshPlusUI(){
    const q = input('text','meshq','door', {placeholder:'name contains…',style:{width:'220px'}});
    const isolate = check('Isolate results','mesh-isolate', refresh);
    const list = el('div',{id:'mesh-list',style:{marginTop:'6px',maxHeight:'300px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const bar = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'6px'}},[
      btn('Toggle Collisions', ()=> batch('collisions')),
      btn('Toggle Pickable',   ()=> batch('pickable')),
      btn('Toggle Visible',    ()=> batch('visible')),
    ]);
    const pickNow = btn('Pick Under Cursor', pickUnderCursor);
    const name = el('div',{id:'mesh-name',style:{color:'#9ff',marginTop:'6px'}},['(none)']);
    const top = el('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},[ lab('Find'), q, isolate, pickNow ]);
    PANEL.body.appendChild(top);
    PANEL.body.appendChild(list);
    PANEL.body.appendChild(bar);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px'}},[ lab('Selected'), name ]));
    refresh(); q.addEventListener('input', refresh);
    function current(){ const s=SCENE(); if(!s) return []; const v=q.value.trim().toLowerCase(); return s.meshes.filter(m=> (m.name||'').toLowerCase().includes(v)); }
    function refresh(){
      const s=SCENE(); if(!s) return;
      const items = current();
      const host=$('#mesh-list'); host.innerHTML='';
      if ($('#mesh-isolate input')?.checked){ s.meshes.forEach(m=> m.isVisible = items.includes(m)); }
      items.slice(0,400).forEach(m=>{
        const row=el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[m.name||'(unnamed)']),
          btn('Sel', ()=> selectMesh(m)),
          btn(m.checkCollisions?'Coll✓':'Coll×', ()=>{ m.checkCollisions=!m.checkCollisions; refresh(); }),
          btn(m.isPickable?'Pick✓':'Pick×', ()=>{ m.isPickable=!m.isPickable; refresh(); })
        ]);
        host.appendChild(row);
      });
    }
    function batch(kind){
      const items=current(); if (!items.length){ toast('No matches'); return; }
      if (kind==='collisions') items.forEach(m=> m.checkCollisions=!m.checkCollisions);
      if (kind==='pickable')   items.forEach(m=> m.isPickable=!m.isPickable);
      if (kind==='visible')    items.forEach(m=> m.isVisible = !(m.isVisible!==false && m.visibility!==0));
      refresh();
    }
  }

  function buildDoorsUI(){
    const s=SCENE(); if(!s){ PANEL.body.appendChild(el('div',{style:{color:'#faa'}},['Scene not ready'])); return; }

    const axisSel   = sel('door-axis',  [['Y','Axis: Y (typical)'],['X','Axis: X'],['Z','Axis: Z']]); axisSel.value='Y';
    const sideSel   = sel('door-side',  [['minX','Hinge: minX'],['maxX','Hinge: maxX'],['minZ','Hinge: minZ'],['maxZ','Hinge: maxZ']]);
    const angleIn   = input('number','door-angle','110',{step:'1',min:'-180',max:'180',title:'Open angle in degrees'});
    const durIn     = input('number','door-dur','700',{step:'10',min:'50',title:'Duration ms'});
    const easSel    = sel('door-ease',  [['CubicInOut','CubicInOut'],['SineInOut','SineInOut'],['BackOut','BackOut'],['Linear','Linear']]);

    const pickBtn   = btn('Pick Under Cursor', pickUnderCursor);
    const byNameIn  = input('text','door-name','',{placeholder:'mesh name…',style:{width:'220px'}});
    const selBtn    = btn('Select', ()=>{ const m=s.getMeshByName(byNameIn.value)||s.getNodeByName(byNameIn.value); if(m) selectMesh(m); else toast('Not found'); });

    const selected  = el('div',{style:{color:'#9ff'}},['Selected: ', el('b',{id:'door-selected'},[STATE.lastPick?.name||'(none)'])]);
    const pvTxt     = el('div',{id:'door-pivot-txt',style:{color:'#8ff'}},['Pivot: (—, —, —)']);
    const computeBtn= btn('Compute Hinge Pivot', ()=> { const mesh=STATE.lastPick; if(!mesh) return toast('Pick a mesh first'); const p = computeHingePivot(mesh, sideSel.value); pvTxt.textContent=`Pivot: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`; });
    const applyPivotBtn = btn('Apply Pivot', ()=>{ const mesh=STATE.lastPick; if(!mesh) return toast('Pick a mesh first'); const p = computeHingePivot(mesh, sideSel.value); mesh.setPivotPoint(p, BABYLON.Space.WORLD); toast('Pivot applied'); });

    const openBtn  = btn('Preview Open', ()=> playDoor(meshSel(), +angleIn.value||110, +durIn.value||700, axisSel.value, easSel.value));
    const closeBtn = btn('Preview Close',()=> playDoor(meshSel(), 0, +durIn.value||700, axisSel.value, easSel.value));

    const saveBtn  = btn('Save Door', ()=>{
      const mesh = meshSel(); if(!mesh) return;
      const pivot = computeHingePivot(mesh, sideSel.value);
      const rec = {
        name: mesh.name,
        axis: axisSel.value,
        hinge: sideSel.value,
        pivotWorld: { x:+pivot.x.toFixed(6), y:+pivot.y.toFixed(6), z:+pivot.z.toFixed(6) },
        openAngleDeg: +angleIn.value||110,
        durationMs: +durIn.value||700,
        easing: easSel.value
      };
      const i = STATE.doors.findIndex(d=>d.name===rec.name);
      if (i>=0) STATE.doors[i]=rec; else STATE.doors.push(rec);
      renderDoorList();
      toast('Door saved to buffer');
    });

    const exportJsonBtn = btn('Export doors.json', ()=> exportJSON('doors.json', STATE.doors));
    const exportJsBtn   = btn('Export doors.js',   ()=> exportText('doors.js', renderDoorsJS(STATE.doors)));
    
    const rowPick = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}},[ pickBtn, byNameIn, selBtn, selected ]);
    const rowHinge= el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'6px'}},[ axisSel, sideSel, angleIn, lab('deg'), durIn, lab('ms'), easSel ]);
    const rowPivot = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'6px'}}, [computeBtn, applyPivotBtn, pvTxt]);
    const rowPrev = el('div',{style:{display:'flex',gap:'8px',alignItems:'center',marginTop:'6px'}},[ lab('Preview:'), openBtn, closeBtn ]);

    const listHost = el('div',{id:'doors-list',style:{marginTop:'8px',maxHeight:'240px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const rowExport= el('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},[ saveBtn, exportJsonBtn, exportJsBtn ]);

    PANEL.body.appendChild(rowPick);
    PANEL.body.appendChild(rowHinge);
    PANEL.body.appendChild(rowPivot);
    PANEL.body.appendChild(rowPrev);
    PANEL.body.appendChild(listHost);
    PANEL.body.appendChild(rowExport);

    renderDoorList();

    function meshSel(){ return STATE.lastPick || null; }
    function renderDoorList(){
      const host = $('#doors-list'); host.innerHTML='';
      STATE.doors.forEach((d,idx)=>{
        const row = el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[`#${idx} ${d.name} — ${d.axis}/${d.hinge} ${d.openAngleDeg}° ${d.durationMs}ms`]),
          btn('Select', ()=> { const m=SCENE().getMeshByName(d.name)||SCENE().getNodeByName(d.name); if(m) selectMesh(m); }),
          btn('Remove', ()=> { STATE.doors.splice(idx,1); renderDoorList(); })
        ]);
        host.appendChild(row);
      });
    }
  }

  function computeHingePivot(mesh, side='minX'){
    const bb = mesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld, max = bb.maximumWorld;
    let x = (min.x+max.x)/2, y = (min.y+max.y)/2, z = (min.z+max.z)/2;
    if (side==='minX') x = min.x;
    if (side==='maxX') x = max.x;
    if (side==='minZ') z = min.z;
    if (side==='maxZ') z = max.z;
    return new BABYLON.Vector3(x,y,z);
  }

  function easingFromName(name){
    let e;
    switch(name){
      case 'CubicInOut': e = new BABYLON.CubicEase(); e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT); break;
      case 'SineInOut':  e = new BABYLON.SineEase();  e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT); break;
      case 'BackOut':    e = new BABYLON.BackEase();  e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT); break;
      default:           e = null;
    }
    return e;
  }

  function playDoor(mesh, targetAngleDeg, durationMs, axis='Y', easeName='CubicInOut'){
    if (!mesh) return toast('Pick a door mesh first');
    const s=SCENE(); if(!s) return;
    const fps = 60, frames=Math.round(durationMs/1000 * fps);
    const startAngle = mesh.rotation[axis.toLowerCase()] || 0;
    const endAngle = BABYLON.Tools.ToRadians(targetAngleDeg);

    const anim = new BABYLON.Animation('doorRot', `rotation.${axis.toLowerCase()}`, fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    anim.setKeys([{frame:0, value:startAngle}, {frame:frames, value:endAngle}]);
    const easing = easingFromName(easeName); if (easing) anim.setEasingFunction(easing);
    return s.beginDirectAnimation(mesh, [anim], 0, frames, false);
  }

  function renderDoorsJS(doors){
    const cfg = JSON.stringify(doors, null, 2);
    return `// Auto-generated by DevTools Doors tab
(function(){
  if (window.DOORS_RUNTIME) return;
  const DOORS_CONFIG = ${cfg};

  function easingFromName(name){
    let e;
    switch(name){
      case 'CubicInOut': e = new BABYLON.CubicEase(); e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT); break;
      case 'SineInOut':  e = new BABYLON.SineEase();  e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT); break;
      case 'BackOut':    e = new BABYLON.BackEase();  e.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT); break;
      default:           e = null;
    }
    return e;
  }
  function setPivotWorld(mesh, p){
    if(!mesh.isPivotSet) {
        mesh.setPivotPoint(new BABYLON.Vector3(p.x,p.y,p.z), BABYLON.Space.WORLD);
    }
  }

  const DoorRuntime = { byName:{} };
  window.DOORS_RUNTIME = DoorRuntime;

  window.applyDoorsConfig = function(scene, doors){
    (doors||DOORS_CONFIG||[]).forEach(d=>{
      const mesh = scene.getMeshByName(d.name);
      if (!mesh) return;
      setPivotWorld(mesh, d.pivotWorld);
      DoorRuntime.byName[d.name] = { open:false, mesh, cfg:d };
    });
  };

  window.toggleDoor = function(name){
    const ent = DoorRuntime.byName[name]; if (!ent) return;
    const { mesh, cfg } = ent;
    const isOpen = ent.open;
    const targetAngleDeg = isOpen ? 0 : cfg.openAngleDeg;
    const axis = cfg.axis.toLowerCase();
    
    const s = mesh.getScene();
    const fps = 60;
    const frames = Math.round(cfg.durationMs/1000 * fps);
    const startAngle = mesh.rotation[axis] || 0;
    const endAngle = BABYLON.Tools.ToRadians(targetAngleDeg);

    const anim = new BABYLON.Animation('doorToggle', \`rotation.\${axis}\`, fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    anim.setKeys([{frame:0, value:startAngle}, {frame:frames, value:endAngle}]);
    const easing = easingFromName(cfg.easing); if (easing) anim.setEasingFunction(easing);
    
    const a = s.beginDirectAnimation(mesh,[anim],0,frames,false);
    a.onAnimationEndObservable.add(()=>{ ent.open = !isOpen; });
  };

  window.toggleNearestDoor = function(maxDist=2.5){
    const cam = window.camera;
    if (!cam) return;
    let best=null, bestD=Infinity;
    for (const name in DoorRuntime.byName){
      const ent = DoorRuntime.byName[name];
      const pos = ent.mesh.getAbsolutePosition();
      const d = BABYLON.Vector3.Distance(cam.globalPosition || cam.position, pos);
      if (d < bestD && d <= maxDist){ best=ent; bestD=d; }
    }
    if (best){ toggleDoor(best.mesh.name); }
  };
})();`;
  }

  function buildPanel(){
    if (!ensurePanel()) return;
    const tabs = {
      Map: buildMapUI,
      "Mesh+": buildMeshPlusUI,
      Doors: buildDoorsUI,
    };
    Object.entries(tabs).forEach(([name,fn],i)=> addTab(name, fn, i===0));
  }

  function pointerObserver(){
    const s=SCENE(); if(!s) return;
    s.onPointerObservable.add((pi)=>{
      if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN && STATE.clickTeleport){
          const p = s.createPickingRay(s.pointerX, s.pointerY, BABYLON.Matrix.Identity(), window.camera);
          const hit = s.pickWithRay(p, m=>m && m.isPickable!==false);
          if (hit?.hit){ 
              const rig = window.PlayerRig?.getRigRoot();
              if (rig) {
                const t = hit.pickedPoint.clone();
                t.y += 1.0;
                rig.position.copyFrom(t);
                toast('Teleported'); 
              }
          }
      }
    });
  }
  function fpsLoop(){
    const eng=ENGINE(); if(!eng || !STATE.fpsEl) return;
    STATE.fpsEl.textContent = `FPS: ${eng.getFps().toFixed(0)}`;
  }
  function init(){
    if (STATE.ready) return;
    const toggle = $('#devtools-toggle'), panel = $('#devtools-panel');
    if (!toggle || !panel || !SCENE() || !window.camera) return;
    
    toggle.style.display='block';
    toggle.onclick = ()=>{ 
        const isHidden = panel.style.display ==='none' || !panel.style.display;
        panel.style.display = isHidden ? 'block' : 'none';
        if(isHidden) {
            PP.pointerLock?.hold('devtools');
        } else {
            PP.pointerLock?.release('devtools');
        }
    };
    
    buildPanel();
    pointerObserver();
    SCENE().onBeforeRenderObservable.add(fpsLoop);
    STATE.ready=true;
    toast('Dev Tools v4 ready', 900);
  }
  
  const id = setInterval(()=>{ try{ if ($('#devtools-panel') && SCENE() && window.camera){ clearInterval(id); init(); } }catch{} }, 200);

})();
// =================================================================
// END: assets/dev/tools/devtools.js
// =================================================================


// =================================================================
// START: assets/dev/tools/ghost_dev.js
// =================================================================
(function(){
  "use strict";

  const BASE = 'https://sharkvelocity.github.io/3d/assets/ghosts/';
  const FILES = ['ghost.glb'];
  const STORE_KEY = 'GHOST_DEV_SAVE_V1';

  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA = ()=> window.camera || SCENE()?.activeCamera;
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const toast  = (m,ms=1200)=> (window.toast? window.toast(m,ms) : console.log('[ghost-dev]', m));

  const ST = {
    ui:null,
    selector:null, scaleInput:null, visBtn:null, teleportBtn:null,
    barrierBtn:null, undoBtn:null, clearBtn:null,
    saveBtn:null, loadBtn:null, exportBtn:null, importBtn:null,

    open:false,
    devVisible:false,

    barrierMode:false,
    barrierPts:[],
    segments:[],
    lines:[],
    pointerObs:null,

    currentFile:null,
    lastScale: 1
  };

  function setDevVisible(on){
    ST.devVisible = !!on;
    window.GHOST_DEV_FORCE_VISIBLE = ST.devVisible;
    if (ST.visBtn) ST.visBtn.textContent = ST.devVisible ? 'Visible ✓' : 'Visible';
    window.PP?.ghost?.setVisible?.(ST.devVisible);
  }
  function toggleDevVisible(){ setDevVisible(!ST.devVisible); }

  function onScaleInput(){
    if (!ST.scaleInput) return;
    const v = parseFloat(ST.scaleInput.value)||1;
    ST.lastScale = v;
    updateScaleLabel(v);
    window.PP?.ghost?.setScale?.(v);
  }
  function updateScaleLabel(v){
    const t = ST.ui.querySelector('#gd-scalev'); if (t) t.textContent = v.toFixed(2);
  }

  function teleportToLook() {
      const rig = window.PlayerRig?.getRigRoot();
      const ghostRoot = window.PP?.ghost?.root;
      if (!rig || !ghostRoot) return toast("Player or Ghost not ready");
      const forward = rig.forward.scale(3);
      const pos = rig.position.add(forward);
      ghostRoot.position.copyFrom(pos);
      toast("Ghost teleported");
  }

  async function loadGhostByFile(fileName){
    console.log(`Requesting ghost model change to: ${fileName}`);
    if(window.PP?.ghost?.setModel) {
        await window.PP.ghost.setModel(fileName);
        toast(`Loaded ${fileName}`);
        ST.currentFile = fileName;
        if (ST.selector) ST.selector.value = fileName;
    } else {
        toast("Ghost controller not available.");
        console.log("Error: window.PP.ghost.setModel not found.");
    }
  }

  function toggleBarrierMode(){
    ST.barrierMode = !ST.barrierMode;
    if (ST.barrierBtn) ST.barrierBtn.textContent = 'Barrier: ' + (ST.barrierMode ? 'On' : 'Off');
    ensurePointerHook();
    toast(ST.barrierMode ? 'Barrier mode ON' : 'Barrier mode OFF');
  }
  function ensurePointerHook(){
    const s = SCENE(); if (!s) return;
    if (!ST.pointerObs){
      ST.pointerObs = s.onPointerObservable.add((info)=>{
        if (!ST.barrierMode) return;
        if (info.type !== BABYLON.PointerEventTypes.POINTERDOWN || info.event.button !== 0) return;

        const pick = s.pick(s.pointerX, s.pointerY, m=> m && m.isPickable !== false && !m.name.startsWith('GhostBarrier'));
        if (!pick?.hit || !pick.pickedPoint) return;
        const p = pick.pickedPoint.clone();

        const last = ST.barrierPts.length ? ST.barrierPts[ST.barrierPts.length-1] : null;
        if (!last){
          ST.barrierPts.push(p);
          drawPointMarker(p);
        } else {
          addSegment(last, p);
          ST.barrierPts.push(p);
          drawPointMarker(p);
        }
      });
    }
  }
  
  function addSegment(a, b){
    const s = SCENE(); if (!s) return;
    const seg = { a:{x:a.x,y:a.y,z:a.z}, b:{x:b.x,y:b.y,z:b.z} };
    ST.segments.push(seg);
    const line = BABYLON.MeshBuilder.CreateLines('GhostBarrierLine', { points:[a, b] }, s);
    line.color = new BABYLON.Color3(0.1, 1.0, 0.8);
    line.isPickable = false;
    ST.lines.push(line);
  }
  function drawPointMarker(p){
    const s=SCENE(); if (!s) return;
    const m = BABYLON.MeshBuilder.CreateSphere('GhostBarrierPt',{diameter:0.08}, s);
    m.position.copyFrom(p);
    const mat = new BABYLON.StandardMaterial('GBptMat', s);
    mat.emissiveColor = new BABYLON.Color3(0.1, 1.0, 0.8);
    m.material = mat; m.isPickable = false;
    ST.lines.push(m);
  }
  function undoLastSegment(){
    if (!ST.barrierPts.length) return;
    ST.barrierPts.pop();
    const m = ST.lines.pop(); try{ m.dispose(); }catch{}
    if (ST.segments.length > 0 && ST.lines.length > ST.segments.length) {
        ST.segments.pop();
        const line = ST.lines.pop(); try { line.dispose(); } catch {}
    }
  }
  function clearAllSegments(){
    ST.segments.length = 0;
    ST.barrierPts.length = 0;
    while (ST.lines.length){ try{ ST.lines.pop().dispose(); }catch{} }
  }
  
  function segSegIntersect(a, b, c, d){
    const ax=a.x, az=a.z, bx=b.x, bz=b.z, cx=c.x, cz=c.z, dx=d.x, dz=d.z;
    const abx = bx-ax, abz = bz-az, cdx = dx-cx, cdz = dz-cz;
    const denom = abx*cdz - abz*cdx;
    if (Math.abs(denom) < 1e-6) return false;
    const acx = cx-ax, acz = cz-az;
    const t = (acx*cdz - acz*cdx) / denom;
    const u = (acx*abz - acz*abx) / denom;
    return t>=0 && t<=1 && u>=0 && u<=1;
  }
  window.ghostDev_isBlockedRay = function(a, b){
    if (!ST.segments.length) return false;
    for (let i=0;i<ST.segments.length;i++){
        const s = ST.segments[i];
        if (segSegIntersect(a, b, s.a, s.b)) return true;
    }
    return false;
  };

  function captureState(){
    return {
      file: ST.currentFile || ST.selector?.value || null,
      scale: ST.lastScale || 1,
      segments: ST.segments
    };
  }
  function applyState(data){
    if (!data) return;
    clearAllSegments();
    (data.segments||[]).forEach(s=>{
        const ptA = new BABYLON.Vector3(s.a.x,s.a.y,s.a.z);
        const ptB = new BABYLON.Vector3(s.b.x,s.b.y,s.b.z);
        addSegment(ptA, ptB);
        if(ST.barrierPts.length === 0) {
            ST.barrierPts.push(ptA);
            drawPointMarker(ptA);
        }
        ST.barrierPts.push(ptB);
        drawPointMarker(ptB);
    });
    if (data.file){
      loadGhostByFile(data.file).then(()=>{
        const sc = data.scale || 1;
        if (ST.scaleInput){ ST.scaleInput.value = String(sc); onScaleInput(); }
      });
    } else if (typeof data.scale === 'number'){
      if (ST.scaleInput){ ST.scaleInput.value = String(data.scale); onScaleInput(); }
    }
  }
  function saveLocal(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(captureState())); toast('Saved locally'); }catch(e){ toast('Save failed'); }
  }
  function loadLocal(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { applyState(JSON.parse(raw)); toast('Loaded from local'); }
      else toast('No local save');
    }catch(e){ toast('Load failed'); }
  }
  function exportJSON(){
    const data = JSON.stringify(captureState(), null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ghost_layout.json';
    a.click(); URL.revokeObjectURL(a.href);
  }
  function importJSON(){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = ()=>{
      const f = inp.files?.[0]; if (!f) return;
      f.text().then(text => {
          try{ applyState(JSON.parse(text)); toast('Imported'); }
          catch(e){ toast('Import failed'); }
      });
    };
    inp.click();
  }

  function buildUI(){
    if (ST.ui) return ST.ui;
    const wrap = document.getElementById('ghostdev-panel');
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-weight:bold;color:#9ff">Ghost Dev</div>
        <button id="gd-close" style="border:1px solid #333;background:#181818;color:#ddd;padding:4px 8px;border-radius:6px;cursor:pointer">Close</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin:8px 0">
        <select id="gd-files" style="padding:4px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;flex-grow:1"></select>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin:8px 0">
        <label for="gd-scale" style="color:#cff">Scale:</label>
        <input type="range" id="gd-scale" min="0.2" max="3.0" step="0.05" value="1" style="flex-grow:1">
        <span id="gd-scalev" style="color:#9ef;font-family:monospace;min-width:32px">1.00</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
        <button id="gd-vis">Visible</button>
        <button id="gd-teleport">Teleport Here</button>
      </div>
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid #044">
        <div style="color:#9ff;font-weight:bold;margin-bottom:6px">Barriers</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="gd-barrier">Barrier: Off</button>
          <button id="gd-undo" title="Remove last point/segment">Undo</button>
          <button id="gd-clear">Clear</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button id="gd-save">Save Local</button>
          <button id="gd-load">Load Local</button>
          <button id="gd-export">Export</button>
          <button id="gd-import">Import</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll('button').forEach(b => Object.assign(b.style, {
      border:'1px solid #244', background:'#0b0b0b', color:'#9ff',
      padding:'6px 10px', borderRadius:'8px', cursor:'pointer'
    }));

    ST.ui = wrap;
    ST.selector   = wrap.querySelector('#gd-files');
    ST.scaleInput = wrap.querySelector('#gd-scale');
    ST.visBtn     = wrap.querySelector('#gd-vis');
    ST.teleportBtn= wrap.querySelector('#gd-teleport');
    ST.barrierBtn = wrap.querySelector('#gd-barrier');
    ST.undoBtn    = wrap.querySelector('#gd-undo');
    ST.clearBtn   = wrap.querySelector('#gd-clear');
    ST.saveBtn    = wrap.querySelector('#gd-save');
    ST.loadBtn    = wrap.querySelector('#gd-load');
    ST.exportBtn  = wrap.querySelector('#gd-export');
    ST.importBtn  = wrap.querySelector('#gd-import');

    FILES.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f; opt.textContent = f;
        ST.selector.appendChild(opt);
    });

    wrap.querySelector('#gd-close').onclick = ()=> ST.ui.style.display = 'none';
    ST.selector.onchange   = ()=> loadGhostByFile(ST.selector.value);
    ST.scaleInput.oninput  = onScaleInput;
    ST.visBtn.onclick      = toggleDevVisible;
    ST.teleportBtn.onclick = teleportToLook;
    ST.barrierBtn.onclick  = toggleBarrierMode;
    ST.undoBtn.onclick     = undoLastSegment;
    ST.clearBtn.onclick    = clearAllSegments;
    ST.saveBtn.onclick     = saveLocal;
    ST.loadBtn.onclick     = loadLocal;
    ST.exportBtn.onclick   = exportJSON;
    ST.importBtn.onclick   = importJSON;

    return wrap;
  }

  function init(){
    const toggle = document.getElementById('ghostdev-toggle');
    const panel  = document.getElementById('ghostdev-panel');
    if (!toggle || !panel) {
        console.warn("GhostDev UI anchors not found.");
        return;
    }
    
    toggle.style.display = 'block';
    panel.style.display = 'none';

    toggle.onclick = ()=>{
      const p = buildUI();
      const on = p.style.display !== 'none';
      p.style.display = on ? 'none' : 'block';
      if (!on) {
          if(window.PP?.pointerLock?.hold) window.PP.pointerLock.hold('ghostdev');
      } else {
          if(window.PP?.pointerLock?.release) window.PP.pointerLock.release('ghostdev');
      }
    };
  }

  window.addEventListener('pp:start', init, { once: true });
})();
// =================================================================
// END: assets/dev/tools/ghost_dev.js
// =================================================================


// =================================================================
// START: assets/dev/tools/logger.js
// =================================================================
(function(){
    if(window.SimLog) return;

    window.SimLog = {
        events: [],
        enabled: true,
        record: function(type, data){ 
            if(!this.enabled) return;
            this.events.push({ time: performance.now(), type, data }); 
        },
        exportJSON: function(){ return JSON.stringify(this.events,null,2); },
        saveToFile: function(filename="sim_log.json"){
            try{
                const blob = new Blob([this.exportJSON()], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                console.log("[SimLog] Saved", this.events.length, "events");
            }catch(e){ console.warn("[SimLog] Save failed", e); }
        }
    };

    const recordPlayer = ()=> {
        const rigRoot = window.PlayerRig?.getRigRoot();
        if(rigRoot) SimLog.record("playerTick", { pos: {x: rigRoot.position.x, y: rigRoot.position.y, z: rigRoot.position.z} });
    };
    const recordCamera = ()=> {
        const cam = window.camera;
        if(cam) SimLog.record("cameraTick", { pos: {x: cam.globalPosition.x, y: cam.globalPosition.y, z: cam.globalPosition.z}, rot: {x: cam.rotation.x, y: cam.rotation.y, z: cam.rotation.z} });
    };
    
    function startLogging() {
        const scene = window.scene;
        if (scene) {
            scene.onBeforeRenderObservable.add(()=>{
                recordPlayer();
                recordCamera();
            });
            console.log("[SimLog] Player and camera tick logging attached.");
        } else {
            console.warn("[SimLog] Scene not ready for logging hooks.");
        }
    }
    
    window.addEventListener("pp:ghost:attack", (e) => {
        SimLog.record("ghostAttack", { ghost: e.detail?.ghostType, target: e.detail?.target });
    });

    window.addEventListener("keydown",(e)=>{
        if(e.altKey && e.code==="KeyS"){
            e.preventDefault();
            SimLog.saveToFile();
        }
    });
    
    window.addEventListener("pp:start", startLogging, { once: true });

    console.log("[SimLog] Initialized — Alt+S to save log");
})();
// =================================================================
// END: assets/dev/tools/logger.js
// =================================================================


// =================================================================
// START: phasma_map_and_ghost.js
// =================================================================
(function(){
  if(window.ProHouseGenerator) return;

  window.ProHouseGenerator = {
    GRID_WIDTH: 10,
    GRID_DEPTH: 10,
    CELL_SIZE: 10,
    DEBUG_GRID: false,

    roomPrefabs: [
      { name:"living_room.glb", size:[2,2], doors:["north","east","south","west"] },
      { name:"kitchen.glb",     size:[2,2], doors:["south","west"] },
      { name:"bedroom.glb",     size:[1,1], doors:["north","east"] },
      { name:"bathroom.glb",    size:[1,1], doors:["west","south"] },
      { name:"hall.glb",        size:[1,1], doors:["north","south","east","west"] }
    ],

    _doorOffsets: {
      north: { x:0, z:-0.5, ry:0 },
      south: { x:0, z:0.5,  ry:Math.PI },
      east:  { x:0.5, z:0,  ry:Math.PI/2 },
      west:  { x:-0.5, z:0, ry:-Math.PI/2 }
    },

    generateMap: async function(scene){
      if(!scene) throw new Error("Scene required for map generation");

      const grid = Array.from({length:this.GRID_WIDTH}, ()=>Array(this.GRID_DEPTH).fill(null));
      const mapData = { rooms: [], meshes: [], doors: [], spawn: null };

      if(this.DEBUG_GRID){
        const ground = BABYLON.MeshBuilder.CreateGround("grid", {
          width: this.GRID_WIDTH*this.CELL_SIZE,
          height:this.GRID_DEPTH*this.CELL_SIZE
        }, scene);
        const gridMat = new BABYLON.GridMaterial("gridMat", scene);
        gridMat.majorUnitFrequency = this.CELL_SIZE;
        gridMat.minorUnitVisibility = 0.45;
        gridMat.gridRatio = 1;
        ground.material = gridMat;
      }

      const vanX = Math.floor(this.GRID_WIDTH/2);
      const vanZ = this.GRID_DEPTH-2;
      grid[vanX][vanZ] = { type:"van", prefab:"van_room.glb" };
      const vanWorldPos = new BABYLON.Vector3(vanX*this.CELL_SIZE,0,vanZ*this.CELL_SIZE);
      mapData.spawn = vanWorldPos.add(new BABYLON.Vector3(0,1.8,0));
      window.PP_SPAWN_POS = mapData.spawn;

      const frontier = [[vanX,vanZ]];
      const roomTarget = 15;
      let placed = 0;

      while(placed < roomTarget && frontier.length){
        const [cx,cz] = frontier.shift();
        const dirs = [
          [1,0,"east"],[-1,0,"west"],
          [0,1,"south"],[0,-1,"north"]
        ].sort(()=>Math.random()-0.5);

        for(const [dx,dz,dir] of dirs){
          const nx = cx+dx, nz = cz+dz;
          if(nx<0||nz<0||nx>=this.GRID_WIDTH||nz>=this.GRID_DEPTH) continue;
          if(grid[nx][nz]) continue;

          const prefab = this.roomPrefabs[Math.floor(Math.random()*this.roomPrefabs.length)];
          grid[nx][nz] = { type:"room", prefab:prefab.name };
          frontier.push([nx,nz]);
          placed++;
          if(placed>=roomTarget) break;
        }
      }

      for(let x=0;x<this.GRID_WIDTH;x++){
        for(let z=0;z<this.GRID_DEPTH;z++){
          const cell = grid[x][z];
          if(!cell) continue;

          const worldPos = new BABYLON.Vector3(x*this.CELL_SIZE,0,z*this.CELL_SIZE);
          try {
            const res = await BABYLON.SceneLoader.ImportMeshAsync(
              "", "./assets/models/map/prefabs/", cell.prefab, scene
            );
            res.meshes.forEach(m=>{
              m.position.copyFrom(worldPos);
              m.checkCollisions = true;
            });

            mapData.meshes.push(...res.meshes);
            mapData.rooms.push({ x, z, type: cell.type, prefab: cell.prefab });
          } catch(e){
              console.warn(`Could not load prefab: ${cell.prefab}`, e);
              const box = BABYLON.MeshBuilder.CreateBox(`placeholder_${x}_${z}`, {size: this.CELL_SIZE * 0.95}, scene);
              box.position.copyFrom(worldPos);
              box.position.y = this.CELL_SIZE * 0.5;
              box.checkCollisions = true;
              mapData.meshes.push(box);
          }

          const prefabMeta = this.roomPrefabs.find(r=>r.name===cell.prefab);
          if(prefabMeta && prefabMeta.doors){
            prefabMeta.doors.forEach(d=>{
              const offset = this._doorOffsets[d];
              if(!offset) return;
              const doorPos = worldPos.add(new BABYLON.Vector3(offset.x*this.CELL_SIZE,0,offset.z*this.CELL_SIZE));
              const doorId = `${cell.prefab}_${d}_${x}_${z}`;
              const hinge = BABYLON.MeshBuilder.CreateBox(doorId+"_hinge", {width:1, height:2, depth:0.1}, scene);
              hinge.position.copyFrom(doorPos);
              hinge.position.y = 1;
              hinge.rotation.y = offset.ry;
              hinge.isVisible = false;
              hinge.checkCollisions = true;
              mapData.doors.push({ id: doorId, position: doorPos, rotationY: offset.ry, type:"door", mesh: hinge });
            });
          }
        }
      }

      return mapData;
    }
  };
})();
// =================================================================
// END: phasma_map_and_ghost.js
// =================================================================


// =================================================================
// START: assets/dev/util/gameplay_patch.js
// =================================================================
(function(){
  "use strict";
  window.PP = window.PP || {}; PP.cfg = PP.cfg || {}; PP.state = PP.state || {};
  PP.cfg.spawnWS = PP.cfg.spawnWS || new BABYLON.Vector3(47.52, 0.22, -105.28);

  PP.storage = PP.storage || (function(){
    const KEY_INV='pp_inventory_v1', KEY_FLAGS='pp_flags_v1';
    function get(k,d){ try{return JSON.parse(localStorage.getItem(k)) ?? d;}catch(_){return d;} }
    function set(k,v){ localStorage.setItem(k, JSON.stringify(v)); return v; }
    return {
      saveInventory: inv => set(KEY_INV, inv),
      loadInventory: () => get(KEY_INV, {slots:[], equipped:0}),
      getFlag: (k,d=false)=>{ const f=get(KEY_FLAGS,{}); return (k in f)?f[k]:d; },
      setFlag: (k,v)=>{ const f=get(KEY_FLAGS,{}); f[k]=v; set(KEY_FLAGS,f); }
    };
  })();

  function getBelt(){ return document.getElementById('belt') || document.getElementById('item-belt'); }

  function buildBelt(slots){
    const bar = getBelt(); if (!bar) return;
    bar.innerHTML='';
    
    const inv = slots ? { slots, equipped: PP.storage.loadInventory().equipped } : PP.storage.loadInventory();
    if (!inv.slots) return;

    inv.slots.forEach((id,i)=>{
      const def = Object.values(PP.inventory.ITEM_META).find(d=>d.id===id) || {name:id,icon:''};
      const el=document.createElement('div');
      el.className='belt-slot'+(i===inv.equipped?' active':'');
      el.innerHTML = (def.icon?`<img src="${def.icon}" style="max-width:48px;max-height:48px;object-fit:contain">`:`<span style="font-size:10px;color:#adf">${def.name}</span>`)
      + `<div class="slot-key">${i+1}</div>`;
      el.onclick = ()=> setEquipped(i);
      bar.appendChild(el);
    });
  }
  window.buildBelt = buildBelt;

  function setEquipped(i){
    const inv = PP.storage.loadInventory();
    if (!inv.slots || !inv.slots.length) return;
    inv.equipped = Math.max(0, Math.min(i, inv.slots.length-1));
    PP.storage.saveInventory(inv);

    const bar = getBelt(); if (!bar) return;
    [...bar.children].forEach((el,idx)=> el.classList.toggle('active', idx===inv.equipped));
    
    const itemDef = Object.values(PP.inventory.ITEM_META).find(item => item.id === inv.slots[inv.equipped]);
    window.dispatchEvent(new CustomEvent('pp:belt:equip', { detail: { item: itemDef, slot: inv.equipped } }));
  }

  function computeSpawnWS(){
      if (window.PP_SPAWN_POS) {
          return window.PP_SPAWN_POS.clone();
      }
      return PP.cfg.spawnWS || new BABYLON.Vector3(0,1.8,0);
  }

  function forceSpawn(){
    const sc = BABYLON.Engine?.LastCreatedScene || window.scene;
    const rig = window.PlayerRig?.getRigRoot();
    const cam = sc?.activeCamera; 
    if (!rig || !cam) return;
    
    const p = computeSpawnWS();
    rig.position.copyFrom(p);
    cam.setTarget(p.add(new BABYLON.Vector3(0,0,5)));
  }

  (function attachAfterLoad(){
    function run() {
      try{
        forceSpawn();
        let inv = PP.storage.loadInventory();
        if (!inv || !Array.isArray(inv.slots) || !inv.slots.length) {
          inv = { slots: ['emf','spirit','uv'], equipped: 0 }; 
          PP.storage.saveInventory(inv);
        }
        buildBelt(inv.slots);
        setEquipped(inv.equipped);
      } catch(e){ console.warn('Gameplay patch post-load error', e); }
    }

    window.addEventListener('pp:start', () => setTimeout(run, 200), { once: true });
  })();
})();
// =================================================================
// END: assets/dev/util/gameplay_patch.js
// =================================================================


// =================================================================
// START: assets/dev/game/bootstrap.js
// =================================================================
(async function(){
"use strict";

const log = (...a) => console.log("[Bootstrap]", ...a);
const warn = (...a) => console.warn("[Bootstrap]", ...a);

let engine, scene, camera;

const state = {
    isStarted: false,
    selectedGhost: null,
    foundEvidence: new Set(),
};
window.PP = window.PP || {};
window.PP.state = state;
window.PP.gameHasRenderedFirstFrame = false;

function showLoading(show, percent, text) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');

    if (!loadingOverlay || !loadingBar || !loadingText) return;

    if (show) {
        loadingOverlay.style.display = 'flex';
        setTimeout(()=> loadingOverlay.style.opacity = '1', 10);
        if (percent !== undefined) {
             loadingBar.style.width = `${percent}%`;
        }
        if (text) {
             loadingText.textContent = text;
        }
    } else {
        loadingOverlay.style.opacity = '0';
        setTimeout(()=> loadingOverlay.style.display = 'none', 500);
    }
}
window.showLoading = showLoading;

async function setupEngine() {
    log("1. Setting up engine and scene...");
    showLoading(true, 10, "Initializing Engine...");
    
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) {
        throw new Error("renderCanvas not found!");
    }
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -9.81, 0);

    camera = new BABYLON.FreeCamera("mainCam", new BABYLON.Vector3(0, 1.8, -5), scene);
    camera.attachControl(canvas, true);
    scene.activeCamera = camera;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;
    scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.05, 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    scene.fogDensity = 0.01;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.05);

    const debugGround = BABYLON.MeshBuilder.CreateGround("debugGround", {width: 20, height: 20}, scene);
    debugGround.isPickable = false;
    const debugSphere = BABYLON.MeshBuilder.CreateSphere("debugSphere", {diameter: 1}, scene);
    debugSphere.position.y = 1;
    debugSphere.isPickable = false;
    const debugMat = new BABYLON.StandardMaterial("debugMat", scene);
    debugMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.5);
    debugGround.material = debugMat;
    debugSphere.material = debugMat;

    window.engine = engine;
    window.scene = scene;
    window.camera = camera;
    
    PP.runtime?.exportGlobals(engine, scene, camera);

    window.addEventListener('resize', () => engine.resize());
    log("Engine and scene OK.");
    
    // START RENDER LOOP IMMEDIATELY FOR SMOKE TEST
    engine.runRenderLoop(() => {
        if (scene && scene.activeCamera) {
            scene.render();
        }
    });
}

function setupPlayer() {
    log("2. Setting up player rig...");
    showLoading(true, 25, "Creating Player...");
}

async function loadSelectedMap(mapId) {
    const mapData = PP.mapManifest.find(m => m.id === mapId);
    if (!mapData) {
        throw new Error(`Map with id "${mapId}" not found in manifest.`);
    }

    log(`Loading map: ${mapData.title}`);
    if (mapData.id === 'procedural_house' && window.ProHouseGenerator) {
        await window.ProHouseGenerator.generateMap(scene);
        log("Procedural map generated.");
    } else if (mapData.file && window.PP.mapManager && typeof window.PP.mapManager.loadMap === 'function') {
        await window.PP.mapManager.loadMap(mapData);
        log("Static map loaded.");
    } else {
        throw new Error(`Map '${mapData.title}' has no valid loader defined.`);
    }
}

async function setupMapAndWeather(mapId) {
    log("3. Loading map and initializing weather...");
    showLoading(true, 40, "Building World...");
    try {
        await loadSelectedMap(mapId);

        if(window.EnvAndSound && typeof window.EnvAndSound.firstInteractionBoot === 'function') {
            window.EnvAndSound.firstInteractionBoot();
            const weathers = ["Clear", "Rainstorm", "Snow", "Bloodmoon"];
            const choice = weathers[Math.floor(Math.random() * weathers.length)];
            window.EnvAndSound.setWeather(choice, { intensity: 0.5 + Math.random() * 0.5 });
            log(`Initial weather set to: ${choice}`);
        } else {
            warn("EnvAndSound system not found.");
        }

        if (typeof window.applyDoorsConfig === 'function') {
            window.applyDoorsConfig(scene);
            log("Door configurations applied.");
        }

    } catch (error) {
        warn("Error during map and weather setup:", error);
        showLoading(true, 100, `Error loading map: ${error.message}`);
        throw error;
    }
}

function setupGameplaySystems() {
    log("4. Initializing gameplay systems...");
    showLoading(true, 75, "Waking Entities...");

    const ghostNames = Object.keys(PP.GHOST_DATA || {});
    if (ghostNames.length > 0) {
        const randomGhostName = ghostNames[Math.floor(Math.random() * ghostNames.length)];
        state.selectedGhost = PP.GHOST_DATA[randomGhostName];
        log(`Selected Ghost: ${state.selectedGhost.name}`);
        window.PP.ghost = state.selectedGhost;
    } else {
        warn("GHOST_DATA is empty! Cannot select a ghost.");
    }
    
    if (PP.inventory?.models?.init) {
        PP.inventory.models.init(scene);
        log("Initialized item models.");
    }
    
    Object.values(PP.tools || {}).forEach(tool => {
        if (typeof tool.init === 'function') {
            try {
                tool.init(scene);
                log(`Initialized tool: ${tool.constructor.name || 'anonymous tool'}`);
            } catch (e) {
                warn(`Error initializing a tool:`, e);
            }
        }
    });
    
    ['salt', 'writing_book', 'uv_prints', 'lantern', 'lighter'].forEach(sysName => {
        const sys = window.PP_SYSTEMS?.[sysName] || window[sysName.toUpperCase()];
        if(sys && typeof sys.init === 'function') {
             try {
                sys.init(scene);
                log(`Initialized system: ${sysName}`);
             } catch(e){
                warn(`Error initializing system ${sysName}:`, e);
             }
        }
    });
}

function runGameLoop() {
    log("5. Starting render loop.");
    showLoading(true, 90, "Finalizing...");
    
    // The render loop is already running from setupEngine. This function is now for post-init logic.
    setTimeout(() => {
        camera = scene.activeCamera;
        window.camera = camera;
        PP.runtime?.exportGlobals(engine, scene, camera);
        log("Camera reference captured from player rig.");
    }, 500);
}

async function startGame(mapId) {
    if (state.isStarted) return;
    log(`PhasmaPhoney starting with map: ${mapId}`);
    
    showLoading(true, 5, "Starting...");

    setupPlayer();
    await setupMapAndWeather(mapId);
    setupGameplaySystems();
    
    showLoading(true, 100, "Ready!");
    
    runGameLoop();
    
    setTimeout(() => {
        showLoading(false);
        state.isStarted = true;
        window.__PP_ALREADY_STARTED__ = true;
        window.dispatchEvent(new CustomEvent('pp:start'));
        log("Game started successfully!");

        if(window.PlayerRig) {
            log("Enabling player movement.");
            window.PlayerRig.enableMovement(true);
        }
        window.playerCanMove = true;
        
        PP.pointerLock?.lock();
    }, 500);
}

function setupGlobalHelpers() {
    window.PP.checkForEvidence = (evidenceKey) => {
        if (!state.selectedGhost) return false;
        return state.selectedGhost.evidence.includes(evidenceKey);
    };

    window.PP.foundEvidence = (evidenceKey) => {
        state.foundEvidence.add(evidenceKey);
        log(`Evidence found: ${evidenceKey}. Total: ${state.foundEvidence.size}/3`);
        window.dispatchEvent(new CustomEvent('pp:evidence:found', { detail: { evidence: evidenceKey }}));
    };

    window.addEventListener('pp:belt:equip', (e) => {
        const { item, slot } = e.detail;
        if (!item) return;
        log(`Equipping ${item.id} from slot ${slot}`);
        window.dispatchEvent(new CustomEvent('pp:belt:unequip_all', { detail: { except: item.id } }));
        window.dispatchEvent(new CustomEvent(`pp:tool:equip:${item.id}`));
    });

     window.addEventListener('pp:belt:unequip', (e) => {
        const { item, slot } = e.detail;
        if (!item) return;
        log(`Unequipping ${item.id}`);
        window.dispatchEvent(new CustomEvent(`pp:tool:unequip:${item.id}`));
    });
}

async function initialize() {
    const fallbackBtn = document.getElementById('fallback-refresh-btn');
    if (fallbackBtn) {
        fallbackBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    const fallbackTimeout = 15000;
    const fallbackTimer = setTimeout(() => {
        if (!window.PP.gameHasRenderedFirstFrame) {
            console.error("Fallback Triggered: Game failed to render a frame within the time limit.");
            showLoading(false);
            const fallbackOverlay = document.getElementById('fallback-overlay');
            if (fallbackOverlay) {
                fallbackOverlay.style.display = 'flex';
            }
        }
    }, fallbackTimeout);

    try {
        await setupEngine();
        
        scene.onAfterRenderObservable.addOnce(() => {
            log("First frame rendered successfully.");
            window.PP.gameHasRenderedFirstFrame = true;
            clearTimeout(fallbackTimer);
            
            const ground = scene.getMeshByName("debugGround");
            const sphere = scene.getMeshByName("debugSphere");
            const mat = scene.getMaterialByName("debugMat");
            ground?.dispose();
            sphere?.dispose();
            mat?.dispose();
            
            // Now that the engine is confirmed working, start loading the actual game
            startGame('default_map');
        });

    } catch(error) {
        console.error("Critical failure during engine setup:", error);
        clearTimeout(fallbackTimer);
        showLoading(false);
        const fallbackOverlay = document.getElementById('fallback-overlay');
        if (fallbackOverlay) {
            fallbackOverlay.style.display = 'flex';
        }
    }
}

setupGlobalHelpers();
document.addEventListener('DOMContentLoaded', initialize, { once: true });

})();
// =================================================================
// END: assets/dev/game/bootstrap.js
// =================================================================

})(); // End Global Wrapper
