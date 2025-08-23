// assets/models/map/furnished_house.js
(function () {
  window.MAP_DEF = {
    title: "Furnished House",
    file:  "furnished_house.glb",
    scale: 0.10,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },
    // Updated spawn point
    spawn:    { x: -334.56, y: 3.76, z: -377.44 },
    vanSpawn: { x: 0, y: 1.8, z: 0 },
    // Treat this polygon as exterior by default (adjust later if needed)
    exteriorMode: "exterior",
    exterior: [
      {x:-15,z:-20}, {x:15,z:-20}, {x:15,z:20}, {x:-15,z:20}
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