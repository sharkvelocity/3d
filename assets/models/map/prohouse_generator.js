// ./assets/models/map/prohouse_generator.js
// Procedural ProHouse map generator
// Grid-based modular room placement with van spawn
(function(){
  if(window.ProHouseGenerator) return;
  window.ProHouseGenerator = {
    GRID_WIDTH: 10,
    GRID_DEPTH: 10,
    CELL_SIZE: 10,

    // Generate the map
    generateMap: async function(scene){
      if(!scene) throw new Error("Scene required for map generation");

      // Initialize grid
      const grid = Array.from({length:this.GRID_WIDTH}, ()=>Array(this.GRID_DEPTH).fill(null));

      // Place van in fixed location
      const vanX = Math.floor(this.GRID_WIDTH/2);
      const vanZ = this.GRID_DEPTH-2;
      grid[vanX][vanZ] = { type: "van", prefab: "van_room.glb" };

      // List of modular rooms
      const roomPrefabs = ["living_room.glb","kitchen.glb","bedroom.glb","bathroom.glb"];

      // Randomly place other rooms
      const roomCount = 15;
      for(let i=0;i<roomCount;i++){
        let x,z;
        do {
          x=Math.floor(Math.random()*this.GRID_WIDTH);
          z=Math.floor(Math.random()*this.GRID_DEPTH);
        } while(grid[x][z]);
        const prefab = roomPrefabs[Math.floor(Math.random()*roomPrefabs.length)];
        grid[x][z] = { type:"room", prefab };
      }

      // Spawn rooms
      const mapData = { rooms: [], meshes: [], doors: [], spawn: null };
      for(let x=0;x<this.GRID_WIDTH;x++){
        for(let z=0;z<this.GRID_DEPTH;z++){
          const cell = grid[x][z];
          if(!cell) continue;
          const worldPos = new BABYLON.Vector3(x*this.CELL_SIZE,0,z*this.CELL_SIZE);
          const res = await BABYLON.SceneLoader.ImportMeshAsync(
            "", "./assets/models/map/prefabs/", cell.prefab, scene
          );
          res.meshes[0].position.copyFrom(worldPos);
          cell.meshes = res.meshes;
          mapData.meshes.push(...res.meshes);

          // Van spawn point
          if(cell.type==="van") mapData.spawn = worldPos.add(new BABYLON.Vector3(0,1.8,0));
        }
      }

      return mapData;
    }
  };
})();
