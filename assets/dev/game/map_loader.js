/* ./assets/dev/game/map_loader.js */
"use strict";

async function loadMap(mapData) {
  if (!window.scene) throw new Error("Scene not initialized");
  if (!mapData) mapData = window.PP?.manifest?.[0];
  if (!mapData) throw new Error("No map data provided");

  // Clear previous map
  if(window.mapMeshes){
    window.mapMeshes.forEach(m=>m.dispose && m.dispose());
    window.mapMeshes.length = 0;
  }

  // Procedural map
  if(mapData.def === "prohouse_generator" && window.ProHouseGenerator){
    console.log("[map_loader] Spawning Procedural ProHouse...");
    const meshes = await window.ProHouseGenerator.spawn(window.scene);
    window.mapMeshes = meshes;
    return meshes;
  }

  // Regular GLB map
  if(!mapData.file) throw new Error("Map has no file: "+(mapData.title||"unknown"));

  const path = "./assets/models/map/";
  try{
    console.log("[map_loader] Loading GLB map:", mapData.file);
    const res = await BABYLON.SceneLoader.ImportMeshAsync(
      "", path, mapData.file, window.scene
    );

    // position meshes
    res.meshes.forEach(m=>{
      if(!m.position) m.position = BABYLON.Vector3.Zero();
    });

    window.mapMeshes = res.meshes;
    return res.meshes;

  }catch(e){
    console.error("[map_loader] Failed to load map:", mapData.file, e);
    return [];
  }
}

// Optional: helper to get room by name (works with both procedural and GLB)
window.getRoomCenter = function(name){
  if(!window.mapMeshes) return null;

  // For procedural
  if(window.ProHouseGenerator && window.ProHouseGenerator.rooms){
    const r = window.ProHouseGenerator.rooms.find(r=>r.name===name);
    if(r) return new BABYLON.Vector3(r.gx*window.ProHouseGenerator.CELL_SIZE, 0, r.gz*window.ProHouseGenerator.CELL_SIZE);
  }

  // For static GLB maps: check metadata
  const mesh = window.mapMeshes.find(m=>m.metadata?.roomName===name);
  if(mesh) return mesh.position.clone();
  return null;
};

// Optional: helper to clear map completely
window.clearMap = function(){
  if(window.mapMeshes){
    window.mapMeshes.forEach(m=>m.dispose && m.dispose());
    window.mapMeshes.length = 0;
  }
  if(window.ProHouseGenerator && typeof window.ProHouseGenerator.clear === "function"){
    window.ProHouseGenerator.clear(window.scene);
  }
};
