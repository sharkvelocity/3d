// ./assets/models/map/prohouse_generator.js
// Procedural ProHouse map generator with guaranteed connectivity
(function(){
  if(window.ProHouseGenerator) return;

  window.ProHouseGenerator = {
    GRID_WIDTH: 10,
    GRID_DEPTH: 10,
    CELL_SIZE: 10,
    DEBUG_GRID: true,

    // Room prefabs with metadata
    roomPrefabs: [
      { name:"living_room.glb", size:[2,2], doors:["north","east","south","west"] },
      { name:"kitchen.glb",     size:[2,2], doors:["south","west"] },
      { name:"bedroom.glb",     size:[1,1], doors:["north","east"] },
      { name:"bathroom.glb",    size:[1,1], doors:["west","south"] },
      { name:"hall.glb",        size:[1,1], doors:["north","south","east","west"] }
    ],

    // Generate the map
    generateMap: async function(scene){
      if(!scene) throw new Error("Scene required for map generation");

      const grid = Array.from({length:this.GRID_WIDTH}, ()=>Array(this.GRID_DEPTH).fill(null));
      const mapData = { rooms: [], meshes: [], doors: [], spawn: null };

      // --- Place debug ground
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

      // --- Place van
      const vanX = Math.floor(this.GRID_WIDTH/2);
      const vanZ = this.GRID_DEPTH-2;
      grid[vanX][vanZ] = { type:"van", prefab:"van_room.glb" };
      const vanWorldPos = new BABYLON.Vector3(vanX*this.CELL_SIZE,0,vanZ*this.CELL_SIZE);
      mapData.spawn = vanWorldPos.add(new BABYLON.Vector3(0,1.8,0));

      // --- Grow rooms from van (connectivity guaranteed)
      const frontier = [[vanX,vanZ]];
      const roomTarget = 15;
      let placed = 0;

      while(placed < roomTarget && frontier.length){
        const [cx,cz] = frontier.shift();

        // shuffle 4 directions
        const dirs = [
          [1,0,"east"],[-1,0,"west"],
          [0,1,"south"],[0,-1,"north"]
        ].sort(()=>Math.random()-0.5);

        for(const [dx,dz,dir] of dirs){
          const nx = cx+dx, nz = cz+dz;
          if(nx<0||nz<0||nx>=this.GRID_WIDTH||nz>=this.GRID_DEPTH) continue;
          if(grid[nx][nz]) continue;

          // pick random prefab
          const prefab = this.roomPrefabs[Math.floor(Math.random()*this.roomPrefabs.length)];
          grid[nx][nz] = { type:"room", prefab:prefab.name };
          frontier.push([nx,nz]);
          placed++;
          if(placed>=roomTarget) break;
        }
      }

      // --- Spawn meshes
      for(let x=0;x<this.GRID_WIDTH;x++){
        for(let z=0;z<this.GRID_DEPTH;z++){
          const cell = grid[x][z];
          if(!cell) continue;

          const worldPos = new BABYLON.Vector3(x*this.CELL_SIZE,0,z*this.CELL_SIZE);
          const res = await BABYLON.SceneLoader.ImportMeshAsync(
            "", "./assets/models/map/prefabs/", cell.prefab, scene
          );
          res.meshes[0].position.copyFrom(worldPos);

          mapData.meshes.push(...res.meshes);
          mapData.rooms.push({x,z,type:cell.type,prefab:cell.prefab});
        }
      }

      return mapData;
    }
  };
})();
