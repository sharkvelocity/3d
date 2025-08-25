// spawn_fix.js
// Loads MAP_DEF from common locations and enforces spawn on scene load.

(function(){
  'use strict';
  if (window.__SpawnFixReady) return; window.__SpawnFixReady = true;

  const CANDIDATES = [
    "./assets/models/map/furnished_house.js",
    "./assets/models/map/fully_furnished.config.js",
    "./assets/models/map/Abandoned_House.js",
    "./assets/models/map/abandoned_house.js",
    "./assets/models/map/furnished_house.config.js"
  ];

  async function ensureMapDef(){
    if (window.MAP_DEF && window.MAP_DEF.spawn) return true;
    for (const path of CANDIDATES){
      try {
        await import(path);
        if (window.MAP_DEF && window.MAP_DEF.spawn) return true;
      } catch(e){ /* ignore */ }
    }
    return false;
  }

  function enforceSpawn(scene){
    try {
      if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
      const sp = MAP_DEF.spawn;
      const cam = (scene && scene.activeCamera) || null;
      if (cam) {
        cam.position.x = sp.x ?? 0;
        cam.position.y = sp.y ?? 1.8;
        cam.position.z = sp.z ?? 0;
      }
      if (scene.__playerBody){
        scene.__playerBody.position.set(sp.x ?? 0, sp.y ?? 1.8, sp.z ?? 0);
      }
      console.log("[spawn_fix] Spawn enforced:", sp);
    } catch(e){
      console.warn("[spawn_fix] Spawn error:", e);
    }
  }

  (function hook(){
    if (!window.BABYLON){ return; }
    const g = window;
    const origCreate = g.createScene;
    if (typeof origCreate === "function"){
      g.createScene = async function(){
        await ensureMapDef();
        const sc = await origCreate.apply(this, arguments);
        try { sc.executeWhenReady(()=> enforceSpawn(sc)); } catch{ enforceSpawn(sc); }
        return sc;
      };
      console.log("[spawn_fix] Wrapped createScene");
    } else {
      window.addEventListener("load", async ()=>{
        await ensureMapDef();
        const sc = window.scene || BABYLON.Engine?.LastCreatedScene;
        if (sc) enforceSpawn(sc);
      });
    }
  })();

  window.__SpawnFix = { ensureMapDef, enforceSpawn };
})();
