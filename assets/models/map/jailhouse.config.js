(function () {
  window.MAP_DEF = {
    title: "Jailhouse",
    file:  "jailhouse.glb",       // put your .glb in the same folder
    scale: 0.10,                  // adjust if needed
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },

    // Player & van spawn locations
    spawn:    { x: 0, y: 1.8, z: 0 },
    vanSpawn: { x: 0, y: 1.8, z: -8 },

    // Exterior polygon (used for rain/ambient)
    exteriorMode: "exterior",
    exterior: [
      { x:-40, z:-60 }, { x:40, z:-60 },
      { x:40,  z:60 },  { x:-40, z:60 }
    ],

    // Rooms (placeholder polygons; you’ll want to refine with real coords)
    rooms: [
      { name:"Cell Block A", poly:[ {x:-20,z:-20}, {x:0,z:-20}, {x:0,z:20}, {x:-20,z:20} ] },
      { name:"Cell Block B", poly:[ {x:0,z:-20}, {x:20,z:-20}, {x:20,z:20}, {x:0,z:20} ] },
      { name:"Warden Office", poly:[ {x:-10,z:25}, {x:10,z:25}, {x:10,z:35}, {x:-10,z:35} ] },
      { name:"Cafeteria", poly:[ {x:-20,z:-40}, {x:20,z:-40}, {x:20,z:-20}, {x:-20,z:-20} ] },
      { name:"Yard", poly:[ {x:-30,z:40}, {x:30,z:40}, {x:30,z:60}, {x:-30,z:60} ] }
    ]
  };
})();
