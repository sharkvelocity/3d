
/**
 * Modular settings extracted from the reference scene (index3.html).
 * Drop this BEFORE your game systems so the numbers are available globally.
 * window.PP is a safe namespace the rest of your modules can read.
 */
(function(){
  window.PP = window.PP || {};

  /* ------------ Controls (keys & movement tuning) ------------ */
  PP.controls = {
    keys: {
      forward: ['KeyW','ArrowUp'],
      back: ['KeyS','ArrowDown'],
      left: ['KeyA','ArrowLeft'],
      right: ['KeyD','ArrowRight'],
      sprint: ['ShiftLeft','ShiftRight'],
      slots: ['Digit1','Digit2','Digit3','Digit4','Digit5'],
      notebook: ['KeyN'],
      use: ['Space'],
      openDoor: ['KeyE'],
      flash: ['KeyF'],
      uv: ['KeyU'],
      ir: ['KeyI'],
      lightToggle: ['KeyL'],
      powerToggle: ['KeyP'],
      minimap: ['KeyM']
    },
    // From index3: strideWalk:1.2, strideRun:0.8; speedWalk:0.90; speedRun:1.80
    strideWalk: 1.2,
    strideRun: 0.8,
    speedWalk: 0.90,
    speedRun: 1.80,
    allowFly: false,
    godMode: false
  };

  /* ------------ Ghost / Hunt / Sanity tuning ------------ */
  PP.ghost = {
    // Sanity drain per second
    baseSanityDrain: 0.6/60,
    nearSanityDrain: 1.2/60,
    nearDistance: 7.0,

    // Hunt pacing
    huntSanityThreshold: 65,
    huntCooldownMin: 22,
    huntCooldownMax: 40, // 22 + Math.random()*18
    huntChanceBelow40: 0.85,
    huntChanceAbove40: 0.55,

    // Ghost locomotion
    speed: 1.4,
    stepIntervalWalk: 0.55,
    stepIntervalHunt: 0.48,
    footAudible: 18,

    // Twins behavior
    twinsSeparationMin: 10.0,
    twinsSeparationMax: 12.0,

    // Crucifix
    crucifixBaseRadius: 3.0,
    crucifixDemonRadius: 5.0
  };

  /* ------------ Weather modifiers (sanity/hunt multipliers) ------------ */
  PP.weatherMods = {
    Clear:       { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    Snow:        { sanity: 0.95, huntChance: 1.00, huntPace: 1.00 },
    Rain:        { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    'Blood Moon':{ sanity: 1.25, huntChance: 1.40, huntPace: 1.20 }
  };

  /* ------------ Placeables / rules ------------ */
  PP.rules = {
    crucifixBaseRadius: 3.0,
    crucifixDemonRadius: 5.0
  };

  // Lightweight state that other modules can use if desired
  PP.state = PP.state || {
    running: false,
    controls: { forward:false, back:false, left:false, right:false },
    selectedSlot: 1
  };
})();
