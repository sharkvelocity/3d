(function () {
  window.MAP_DEF = {
    title: "Abandoned House",
    file: "Abandoned_House.glb",
    scale: 1,
    rotationY: 0,

    // You requested XZ: 23.54, -50.76 as origin
    offset: { x: -23.54, y: 0, z: 50.76 },

    spawn: { x: 0, y: 1.8, z: 0 },
    vanSpawn: { x: 0, y: 1.8, z: 0 },

    exteriorMode: "exterior",
    exterior: [
      {x:-20,z:-20}, {x:20,z:-20}, {x:20,z:20}, {x:-20,z:20}
    ],

    rooms: [
      { name:"Van", poly:[ {x:-4,z:3}, {x:4,z:3}, {x:4,z:-3}, {x:-4,z:-3} ] }
      // Add more room polys once you chart them
    ]
  };
})();
