/**
 * assets/dev/sound_engine.js
 * Modular audio system for Babylon.js with surface auto-detection (raycast).
 * Expanded with UI, ambient, and SFX categories.
 */
(function(){
  'use strict';

  const SoundEngine = window.SoundEngine = window.SoundEngine || {};

  const _state = {
    scene: null,
    masterVolume: 0.85,
    categories: {},
    unlocked: false,
    ready: false,
  };

  const BASE = "./assets/audio/";
  const MANIFEST = {
    footsteps: {
      gravel: [
        BASE + "footsteps/footstep_gravel.mp3",
        BASE + "footsteps/footstep_gravel_2.mp3"
      ],
      wood: [
        BASE + "footsteps/footstep_wood_2.mp3",
        BASE + "footsteps/footstep_wood_3.mp3"
      ],
      carpet: [
        BASE + "footsteps/footstep_carpet_2.mp3",
        BASE + "footsteps/footstep_carpet_3.mp3"
      ],
      asphalt: [
        BASE + "footsteps/footstep_asphalt_2.mp3",
        BASE + "footsteps/footstep_asphalt_3.mp3"
      ],
      generic: [
        BASE + "footsteps/footstep.mp3"
      ]
    },

    ui: {
      notebook: [ BASE + "notebook_open.mp3" ],
      tarot:    [ BASE + "tarot_card_flip.mp3" ],
      toss:     [ BASE + "Toss.wav" ]
    },

    ambient: {
      ambient:      [ BASE + "ambient.mp3" ],
      clearWeather: [ BASE + "clearWeather.mp3" ],
      rain:         [ BASE + "rainstorm.mp3" ]
    },

    sfx: {
      doorCreak:   [ BASE + "doorCreak1.mp3", BASE + "doorCreak2.mp3" ],
      doorSlam:    [ BASE + "doorSlam1.mp3", BASE + "doorSlam2.mp3" ],
      gameKilled:  [ BASE + "gameKilled.mp3" ],
      ghostLaugh:  [ BASE + "ghostLaugh.mp3" ],
      ghostWriting:[ BASE + "GhostWriting1.mp3" ],
      radio:       [ BASE + "Radio.mp3" ],
      spiritbox:   [ BASE + "spiritbox.mp3" ],
      whisper:     [ BASE + "whisper.mp3" ],
      musicBox:    [ BASE + "music_box_play.mp3" ]
    }
  };

  function S(){ return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; }
  function clamp(v,a,b){ return Math.min(Math.max(v,a),b); }
  function log(){ try{ console.log("[SoundEngine]", ...arguments);}catch(_){ } }
  function warn(){ try{ console.warn("[SoundEngine]", ...arguments);}catch(_){ } }

  function unlockIfNeeded(scene){
    if (_state.unlocked) return;
    const audioEngine = BABYLON.Engine.audioEngine;
    if (!audioEngine) return;
    const handler = ()=>{
      try{ audioEngine.unlock(); _state.unlocked = true; log("Audio unlocked"); }catch(e){ warn("Audio unlock failed", e); }
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  SoundEngine.init = function(scene){
    _state.scene = scene || S();
    if (!_state.scene) { warn("No scene for SoundEngine.init"); return; }
    unlockIfNeeded(_state.scene);

    const categories = {};
    Object.keys(MANIFEST).forEach(catName=>{
      const group = MANIFEST[catName];
      categories[catName] = {};
      Object.keys(group).forEach(key=>{
        const arr = group[key];
        if (!Array.isArray(arr)) return;
        const sounds = [];
        arr.forEach((url)=>{
          try{
            const s = new BABYLON.Sound(url.split("/").pop(), url, _state.scene, null, { volume: _state.masterVolume, spatialSound: false });
            sounds.push(s);
          }catch(e){ warn("Failed to create sound for", url, e); }
        });
        categories[catName][key] = sounds;
      });
    });
    _state.categories = categories;
    _state.ready = true;
    log("Initialized with categories:", Object.keys(categories));
  };

  SoundEngine.setVolume = function(v){ _state.masterVolume = clamp(v,0,1); SoundEngine.refreshVolumes(); };
  SoundEngine.refreshVolumes = function(){
    Object.values(_state.categories).forEach(group=>{
      Object.values(group).forEach(list=>{
        list.forEach(snd=>{ try{ snd.setVolume(_state.masterVolume); }catch(_){ } });
      });
    });
  };
  SoundEngine.mute = function(flag){
    const val = !!flag ? 0 : _state.masterVolume || 0.85;
    Object.values(_state.categories).forEach(group=>{
      Object.values(group).forEach(list=>{
        list.forEach(snd=>{ try{ snd.setVolume(val); }catch(_){ } });
      });
    });
  };

  // -------- Surface detection helpers --------
  function _raycastDown(scene, origin){
    try{
      const o = origin || BABYLON.Vector3.Zero();
      const ray = new BABYLON.Ray(o.add(new BABYLON.Vector3(0, 0.5, 0)), new BABYLON.Vector3(0,-1,0), 6);
      const predicate = function(m){
        if (!m) return false;
        const n = (m.name||"").toLowerCase();
        if (n.includes("player_capsule") || n.includes("player") || n.includes("rig") || n.includes("helper")) return false;
        return m.isPickable !== false;
      };
      return scene.pickWithRay(ray, predicate);
    }catch(e){ return null; }
  }

  function _surfaceFromString(s){
    if (!s) return null;
    s = (""+s).toLowerCase();
    if (s.includes("wood") || s.includes("plank") || s.includes("floorboard")) return "wood";
    if (s.includes("carpet") || s.includes("rug")) return "carpet";
    if (s.includes("gravel") || s.includes("pebble")) return "gravel";
    if (s.includes("asphalt") || s.includes("road") || s.includes("concrete") || s.includes("pavement")) return "asphalt";
    if (s.includes("grass") || s.includes("dirt") || s.includes("soil") || s.includes("mud")) return "gravel";
    if (s.includes("tile") || s.includes("stone") || s.includes("marble") || s.includes("granite")) return "asphalt";
    if (s.includes("sand") || s.includes("beach")) return "gravel";
    return null;
  }

  function _surfaceFromMesh(mesh){
    if (!mesh) return null;
    try{
      const meta = mesh.metadata;
      if (meta && meta.surface){
        const v = (typeof meta.surface === "string") ? meta.surface : (meta.surface.type || meta.surface.name);
        const m = _surfaceFromString(v);
        if (m) return m;
      }
    }catch(_){}
    const n = (mesh.name||"");
    let m = _surfaceFromString(n);
    if (m) return m;
    try{
      const matName = mesh.material && mesh.material.name;
      m = _surfaceFromString(matName);
      if (m) return m;
    }catch(_){}
    try{
      let p = mesh.parent, hops=0;
      while(p && hops++<3){
        m = _surfaceFromString(p.name);
        if (m) return m;
        p = p.parent;
      }
    }catch(_){}
    return null;
  }

  // -------- Footstep auto-trigger helper --------
  SoundEngine.attachFootsteps = function(scene, opts){
    scene = scene || S(); if (!scene) return;
    if (!_state.ready) SoundEngine.init(scene);

    opts = opts || {};
    const isMoving = opts.isMoving || (function(){
      const k = window.__keys || window.K;
      return !!(k && (k.w||k.a||k.s||k.d));
    });

    const getSurface = opts.getSurface || (function(){
      const b = (scene.__playerBody || (scene.getMeshByName && scene.getMeshByName("player_capsule")));
      const origin = b ? b.position : (scene.activeCamera && scene.activeCamera.position) || BABYLON.Vector3.Zero();
      const pick = _raycastDown(scene, origin);
      if (pick && pick.hit){
        const surf = _surfaceFromMesh(pick.pickedMesh);
        return surf || "generic";
      }
      return "generic";
    });

    const getPos = opts.getPosition || (function(){
      const b = (scene.__playerBody || (scene.getMeshByName && scene.getMeshByName("player_capsule")));
      return b ? b.position : (scene.activeCamera && scene.activeCamera.position) || BABYLON.Vector3.Zero();
    });

    let lastPos = getPos().clone();
    let acc = 0;
    const stepBase = (typeof opts.stepDistance === "number") ? opts.stepDistance : 1.6;

    let lastSurface = "generic";
    let surfaceCooldown = 0;

    scene.onBeforeRenderObservable.add(()=>{
      const now = getPos();
      const d = BABYLON.Vector3.Distance(now, lastPos);
      lastPos.copyFrom(now);
      if (!isMoving()) { acc = 0; return; }

      if (surfaceCooldown-- <= 0){
        lastSurface = getSurface();
        surfaceCooldown = 6; // ~100ms
      }

      acc += d;
      const running = !!(window.K && window.K.run);
      const stepDist = running ? (stepBase * 0.72) : stepBase;
      if (acc >= stepDist){
        acc = 0;
        SoundEngine.playFootstep(lastSurface);
      }
    });
  };

  SoundEngine.playFootstep = function(surface){
    if (!_state.ready) SoundEngine.init();
    const group = _state.categories.footsteps || {};
    const list = group[surface] || group.generic || [];
    if (!list.length) return;
    const choice = list[(Math.random() * list.length) | 0];
    try{ choice.play(); }catch(e){ warn("playFootstep error:", e); }
  };

  SoundEngine.play = function(category, key){
    if (!_state.ready) SoundEngine.init();
    const group = _state.categories[category] || {};
    const list = group[key] || [];
    if (!list.length) return;
    const choice = list[(Math.random() * list.length) | 0];
    try{ choice.play(); }catch(e){ warn("play error:", e); }
  };

  window.addEventListener("DOMContentLoaded", function(){
    const s = S(); if (!s) return;
    SoundEngine.init(s);
  });

})();
