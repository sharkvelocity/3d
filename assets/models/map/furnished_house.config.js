// assets/models/map/furnished_house.config.js
(function () {
  window.MAP_DEF = {
    title: "Furnished House",
    file: "furnished_house.glb",

    // Matches the tuned value you shared
    scale: 0.020,
    rotationY: 0,

    // Nudge if needed to align front door/origin
    offset: { x: 0, y: 0, z: 0 },

    // Your spawn that worked with scale 0.020
    spawn:    { x: -108.40, y: 0.40, z: -121.90 },
    vanSpawn: { x: -108.40, y: 0.40, z: -121.90 },

    exteriorMode: "exterior",
    exterior: [
      { x: -15, z: -20 }, { x: 15, z: -20 }, { x: 15, z: 20 }, { x: -15, z: 20 }
    ],

    rooms: [
      { name:"Van",          poly:[ {x:-4,z:18}, {x:4,z:18}, {x:4,z:24}, {x:-4,z:24} ] },
      { name:"Living Room",  poly:[ {x:-6,z:-2}, {x:8,z:-2}, {x:8,z:8}, {x:-6,z:8} ] },
      { name:"Kitchen",      poly:[ {x:8,z:-2}, {x:14,z:-2}, {x:14,z:8}, {x:8,z:8} ] },
      { name:"Hallway",      poly:[ {x:-6,z:-8}, {x:0,z:-8}, {x:0,z:-2}, {x:-6,z:-2} ] },
      { name:"Bedroom",      poly:[ {x:0,z:-8}, {x:8,z:-8}, {x:8,z:-2}, {x:0,z:-2} ] },
      { name:"Bathroom",     poly:[ {x:8,z:-8}, {x:14,z:-8}, {x:14,z:-2}, {x:8,z:-2} ] }
    ]
  };
})();
