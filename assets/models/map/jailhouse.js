(function(){
  'use strict';
  async function ensureMapDef(){
    if (window.MAP_DEF && MAP_DEF.title==="Jailhouse") return true;
    try {
      await import("../models/map/jailhouse.config.js");
      return !!(window.MAP_DEF && MAP_DEF.title==="Jailhouse");
    } catch(e){
      console.warn("Could not load Jailhouse config", e);
      return false;
    }
  }

  function enforceSpawn(scene){
    try {
      if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
      const sp = MAP_DEF.spawn;
      const cam = scene.activeCamera;
      if (cam) {
        cam.position.set(sp.x, sp.y, sp.z);
        cam.setTarget(new BABYLON.Vector3(sp.x, sp.y, sp.z + 1));
      }
      if (scene.__playerBody){
        scene.__playerBody.position.set(sp.x, sp.y, sp.z);
      }
      console.log("Jailhouse spawn enforced:", sp);
    } catch(e){
      console.error("Jailhouse spawn enforcement error:", e);
    }
  }

  (function hookScene(){
    if (!window.BABYLON) return;
    const g = window;
    const origCreate = g.createScene;
    if (typeof origCreate === "function"){
      g.createScene = async function(){
        await ensureMapDef();
        const sc = await origCreate.apply(this, arguments);
        try {
          sc.executeWhenReady(()=> enforceSpawn(sc));
        } catch{ enforceSpawn(sc); }
        return sc;
      };
      console.log("Wrapped createScene for Jailhouse");
    } else {
      window.addEventListener("load", async ()=>{
        await ensureMapDef();
        const engineScene = (g.scene || (g._scene && g._scene.scene));
        if (engineScene) enforceSpawn(engineScene);
      });
    }
  })();
})();
