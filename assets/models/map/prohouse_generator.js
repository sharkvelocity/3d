// ./assets/models/map/prohouse_generator.js
// Procedural ProHouse generator fully wired with doors + spawn
(function(){
  if(window.ProHouseGenerator) return;

  window.ProHouseGenerator = {
    GRID_WIDTH: 10,
    GRID_DEPTH: 10,
    CELL_SIZE: 10,
    DEBUG_GRID: false,  // turn on for development

    // Room prefabs with metadata
    roomPrefabs: [
      { name:"living_room.glb", size:[2,2], doors:["north","east","south","west"] },
      { name:"kitchen.glb",     size:[2,2], doors:["south","west"] },
      { name:"bedroom.glb",     size:[1,1], doors:["north","east"] },
      { name:"bathroom.glb",    size:[1,1], doors:["west","south"] },
      { name:"hall.glb",        size:[1,1], doors:["north","south","east","west"] }
    ],

    // Direction helper for doors
    _doorOffsets: {
      north: { x:0, z:-0.5, ry:0 },
      south: { x:0, z:0.5,  ry:Math.PI },
      east:  { x:0.5, z:0,  ry:Math.PI/2 },
      west:  { x:-0.5, z:0, ry:-Math.PI/2 }
    },

    // Generate the map
    generateMap: async function(scene){
      if(!scene) throw new Error("Scene required for map generation");

      const grid = Array.from({length:this.GRID_WIDTH}, ()=>Array(this.GRID_DEPTH).fill(null));
      const mapData = { rooms: [], meshes: [], doors: [], spawn: null };

      // --- Debug ground
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

      // --- Place van spawn
      const vanX = Math.floor(this.GRID_WIDTH/2);
      const vanZ = this.GRID_DEPTH-2;
      grid[vanX][vanZ] = { type:"van", prefab:"van_room.glb" };
      const vanWorldPos = new BABYLON.Vector3(vanX*this.CELL_SIZE,0,vanZ*this.CELL_SIZE);
      mapData.spawn = vanWorldPos.add(new BABYLON.Vector3(0,1.8,0));

      // --- Grow rooms from van
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

      // --- Spawn meshes & doors
      for(let x=0;x<this.GRID_WIDTH;x++){
        for(let z=0;z<this.GRID_DEPTH;z++){
          const cell = grid[x][z];
          if(!cell) continue;

          const worldPos = new BABYLON.Vector3(x*this.CELL_SIZE,0,z*this.CELL_SIZE);
          const res = await BABYLON.SceneLoader.ImportMeshAsync(
            "", "./assets/models/map/prefabs/", cell.prefab, scene
          );
          res.meshes.forEach(m=>{
            m.position.copyFrom(worldPos);
            m.checkCollisions = true;
          });

          mapData.meshes.push(...res.meshes);
          mapData.rooms.push({ x, z, type: cell.type, prefab: cell.prefab });

          // --- Create doors for each prefab door
          const prefabMeta = this.roomPrefabs.find(r=>r.name===cell.prefab);
          if(prefabMeta && prefabMeta.doors){
            prefabMeta.doors.forEach(d=>{
              const offset = this._doorOffsets[d];
              if(!offset) return;
              const doorPos = worldPos.add(new BABYLON.Vector3(offset.x*this.CELL_SIZE,0,offset.z*this.CELL_SIZE));
              const doorId = `${cell.prefab}_${d}_${x}_${z}`;
              const hinge = BABYLON.MeshBuilder.CreateBox(doorId+"_hinge", {width:1, height:2, depth:0.1}, scene);
              hinge.position.copyFrom(doorPos);
              hinge.rotation.y = offset.ry;
              hinge.isVisible = false; // invisible mesh to toggle
              hinge.checkCollisions = true;
              mapData.doors.push({ id: doorId, position: doorPos, rotationY: offset.ry, type:"door" });
            });
          }
        }
      }

      return mapData;
    }
  };
})();
