(function () {
  window.MAP_DEF = {
    title: "Jailhouse",
    file: "jailhouse.glb",
    scale: 1,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },

    spawn: { x: 0, y: 1.8, z: 0 },
    vanSpawn: { x: 0, y: 1.8, z: 0 },

    exteriorMode: "exterior",
    exterior: [
      {x:-50,z:-50}, {x:50,z:-50}, {x:50,z:50}, {x:-50,z:50}
    ],

    rooms: [
      { name:"Van", poly:[ {x:-5,z:10}, {x:5,z:10}, {x:5,z:16}, {x:-5,z:16} ] }
      // Fill out later with real wing/cell polys
    ]
  };
})();
