/* assets/dev/spawn_fix.js — ensure MAP_DEF is loaded and enforce spawn */
(function(){
  'use strict';
  const log = (...a)=>{ try{ console.log("[spawn_fix]", ...a);}catch(_){}};

  async function ensureMapDef(){
    if (window.MAP_DEF && window.MAP_DEF.spawn) return true;
    const candidates = [
      "./assets/models/map/furnished_house.js",
      "./assets/models/map/fully_furnished.config.js",
      "./assets/models/map/Abandoned_House.js",
      "./assets/models/map/abandoned_house.js",
      "./assets/models/map/furnished_house.config.js"
    ];
    for (const path of candidates){
      try { await import(path); if (window.MAP_DEF && window.MAP_DEF.spawn) { log("Loaded MAP_DEF from", path); return true; } }
      catch(e){ /* ignore 404s */ }
    }
    return false;
  }

  function enforceSpawn(scene){
    try {
      if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
      const sp = MAP_DEF.spawn;
      const cam = scene && scene.activeCamera;
      if (cam && cam.position){ cam.position.x = sp.x||0; cam.position.y = sp.y||1.8; cam.position.z = sp.z||0; }
      if (scene && scene.__playerBody && scene.__playerBody.position){
        scene.__playerBody.position.set(sp.x||0, sp.y||1.8, sp.z||0);
      }
      log("Spawn enforced:", sp);
    } catch(e){ log("Spawn enforcement error:", e); }
  }

  (function hookScene(){
    if (!window.BABYLON){ return; }
    const g = window;
    const origCreate = g.createScene;
    if (typeof origCreate === "function"){
      g.createScene = async function(){
        await ensureMapDef();
        const sc = await origCreate.apply(this, arguments);
        try { sc.executeWhenReady(()=> enforceSpawn(sc)); } catch { enforceSpawn(sc); }
        return sc;
      };
      log("Wrapped createScene with spawn enforcement");
    } else {
      window.addEventListener("load", async ()=>{
        await ensureMapDef();
        const sc = (g.scene || (g._scene && g._scene.scene));
        if (sc) enforceSpawn(sc);
      });
    }
  })();

  window.__SpawnFix = { ensureMapDef, enforceSpawn };
})();
