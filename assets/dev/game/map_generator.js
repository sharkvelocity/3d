/* map_generator.js — procedural house map generator for PhasmaPhoney */
(function(){
"use strict";
if(window.__MapGeneratorReady) return;
window.__MapGeneratorReady = true;

const BABYLONVec = BABYLON.Vector3;

const MapGenerator = window.MapGenerator = {
  rooms: [],
  seed: 0,
  gridSize: 2, // 1 "square" = 2 units
  bounds: {x:0, z:0}, // max house extents
  generate(seed = Date.now()){
    this.seed = seed;
    this.rooms = [];
    const rng = (max=1)=> {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x) * max;
    };

    // reset
    this.bounds = {x:0, z:0};

    // ----- fixed front door foyer -----
    const foyer = { type:"Foyer", x:0, z:0, w:1, d:1, doors:["front"] };
    this.rooms.push(foyer);

    // ----- garage -----
    const garage = { type:"Garage", x:2, z:0, w:2, d:2, doors:["interior"] };
    this.rooms.push(garage);

    // ----- kitchen + dining combo -----
    const kitchen = { type:"Kitchen", x:-2, z:0, w:2, d:1, doors:["hall"] };
    const dining = { type:"Dining", x:-2, z:1, w:2, d:1, doors:["hall"] };
    this.rooms.push(kitchen, dining);

    // ----- living room -----
    const living = { type:"Living", x:0, z:2, w:2, d:2, doors:["hall"] };
    this.rooms.push(living);

    // ----- bedrooms (1-3) -----
    const numBeds = Math.floor(rng()*3)+1;
    for(let i=0;i<numBeds;i++){
      const bed = {
        type:"Bedroom",
        w:Math.floor(rng()*3)+2,
        d:Math.floor(rng()*3)+2,
        x:Math.floor(rng()*4)-2,
        z:Math.floor(rng()*4),
        doors:["hall"]
      };
      this.rooms.push(bed);
    }

    // ----- bathrooms (1-3) -----
    const numBath = Math.floor(rng()*3)+1;
    for(let i=0;i<numBath;i++){
      const bath = {
        type:"Bathroom",
        w:1,
        d:1,
        x:Math.floor(rng()*4)-2,
        z:Math.floor(rng()*4),
        doors:["hall"]
      };
      this.rooms.push(bath);
    }

    // ----- update bounds -----
    this.rooms.forEach(r=>{
      this.bounds.x = Math.max(this.bounds.x, r.x+r.w);
      this.bounds.z = Math.max(this.bounds.z, r.z+r.d);
    });
  },

  // Returns random point inside room
  randomPointInRoom(room){
    const x = room.x + Math.random()*room.w*this.gridSize;
    const z = room.z + Math.random()*room.d*this.gridSize;
    return new BABYLONVec(x, 0, z);
  }
};

// export
window.MapGenerator = MapGenerator;
})();
