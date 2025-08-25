// assets/models/map/Abandoned_House.config.js
(function(){
  window.MAP_DEF = {
    title: "Abandoned House",
    file: "./assets/models/map/Abandoned_House.glb",
    scale: 1,
    rotationY: 0,
    // Offset shifts the whole map so (23.54, -50.76) → (0,0)
    offset: { x: -23.54, y: 0, z: 50.76 },

    // Default player/van spawn relative to corrected origin
    spawn:    { x: 0,   y: 1.8, z: 0 },
    vanSpawn: { x: 0,   y: 1.8, z: -4 },

    // Treat the whole area outside the bounding box as exterior
    exteriorMode: "exterior",
    exterior: [
      {x:-50,z:-60}, {x:50,z:-60},
      {x:50,z:60},   {x:-50,z:60}
    ],

    rooms: [
      { name:"Van", poly:[ {x:-4,z:18}, {x:4,z:18}, {x:4,z:24}, {x:-4,z:24} ] },
      { name:"Living Room", poly:[ {x:-10,z:-5}, {x:10,z:-5}, {x:10,z:10}, {x:-10,z:10} ] },
      { name:"Kitchen", poly:[ {x:12,z:-5}, {x:20,z:-5}, {x:20,z:10}, {x:12,z:10} ] },
      { name:"Hallway", poly:[ {x:-5,z:-10}, {x:5,z:-10}, {x:5,z:-5}, {x:-5,z:-5} ] },
      { name:"Bedroom", poly:[ {x:-15,z:-10}, {x:-5,z:-10}, {x:-5,z:0}, {x:-15,z:0} ] }
    ]
  };
})();
