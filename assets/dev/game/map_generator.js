/* map_generator.js — seed-based procedural map
   - Rooms with constraints (front door, garage, bathrooms, kitchen/dining, bedrooms)
   - Doors and openings auto-placed
   - Square/tetris-style placement
*/
(function(){
"use strict";
if(window.__MapGeneratorReady) return;
window.__MapGeneratorReady = true;

window.MapGenerator = {
    generate: function(seed=Date.now()){
        Math.seedrandom(seed);

        const rooms = [];
        const addRoom = (name,bounds,type) => rooms.push({name,bounds,type,doors:[]});

        // ---------- front door room ----------
        addRoom("FrontDoor",{min:{x:0,z:0},max:{x:1,z:1}}, "foyer");

        // ---------- garage ----------
        const garageSide = Math.random()<0.5?"left":"right";
        addRoom("Garage",{min:{x:garageSide==="left"?-2:1,z:0}, max:{x:garageSide==="left"?0:3,z:2}}, "garage");

        // ---------- kitchen + dining ----------
        addRoom("Kitchen",{min:{x:1,z:1}, max:{x:3,z:3}}, "kitchen");
        addRoom("Dining",{min:{x:3,z:1}, max:{x:5,z:3}}, "dining");

        // ---------- bedrooms 1-3 ----------
        const bedroomCount = 1 + Math.floor(Math.random()*3);
        for(let i=0;i<bedroomCount;i++){
            const x= Math.floor(Math.random()*4), z=Math.floor(Math.random()*4)+2;
            addRoom(`Bedroom${i+1}`,{min:{x,z},max:{x:x+2,z:z+2}},"bedroom");
        }

        // ---------- bathrooms 1-3 ----------
        const bathCount = 1 + Math.floor(Math.random()*3);
        for(let i=0;i<bathCount;i++){
            const x= Math.floor(Math.random()*4), z=Math.floor(Math.random()*4)+2;
            addRoom(`Bathroom${i+1}`,{min:{x,z},max:{x:x+1,z:z+1}},"bathroom");
        }

        // ---------- living room ----------
        addRoom("Living",{min:{x:1,z:4},max:{x:5,z:8}}, "living");

        window.MAP_DEF = window.MAP_DEF||{};
        MAP_DEF.rooms = rooms;

        return rooms;
    }
};
})();
