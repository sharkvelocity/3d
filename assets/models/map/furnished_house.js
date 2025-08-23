// assets/models/map/furnished_house.js
(function () {
  window.MAP_DEF = {
    title: "Furnished House",
    file:  "furnished_house.glb",
    // Reduced overall model scale so the house is not gigantic
    scale: 0.020,
    rotationY: 0,
    // If your GLB's origin is not the front door, you can nudge it here:
    offset: { x: 0, y: 0, z: 0 },
    // Spawn adjusted for the new scale (was -541.99, 2.00, -609.52 at scale 0.1)
    spawn:    { x: -108.40, y: 0.40, z: -121.90 },
    vanSpawn: { x: -108.40, y: 0.40, z: -121.90 },
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
