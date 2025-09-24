// map_manager.js
window.PP = window.PP || {};
PP.mapManager = (function(){
  let currentMap = null;

  async function clearMap(){
    if(!window.scene) return;
    if(currentMap && Array.isArray(currentMap)){
      currentMap.forEach(m=>{
        try{ m.dispose(); }catch{} 
      });
    }
    currentMap = [];
  }

  async function loadMap(mapData){
    if(!window.scene) throw new Error("No scene available");

    // Clear previous map
    await clearMap();

    // Procedural generator
    if(mapData.def && typeof window[mapData.def] === "function"){
      console.log("[map_manager] Generating procedural map:", mapData.title||mapData.def);
      currentMap = await window[mapData.def](window.scene);
      return;
    }

    // GLB map
    if(mapData.file){
      console.log("[map_manager] Loading GLB map:", mapData.file);
      const res = await BABYLON.SceneLoader.AppendAsync("./assets/models/map/", mapData.file, window.scene);
      currentMap = res.meshes || [];
      currentMap.forEach(m=>{
        if(!m.metadata) m.metadata = {};
        m.metadata.isMap = true;
      });
      console.log("[map_manager] Map loaded:", currentMap.length, "meshes");
      return;
    }

    console.warn("[map_manager] Map data invalid:", mapData);
  }

  function getCurrentMap(){
    return currentMap;
  }

  return { loadMap, clearMap, getCurrentMap };
})();
