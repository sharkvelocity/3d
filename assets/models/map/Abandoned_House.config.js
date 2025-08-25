// Abandoned_House.config.js — Map definition for Abandoned House
(function(){
  if (window.MAP_DEF && MAP_DEF.file === "./assets/models/map/Abandoned_House.glb") return;

  window.MAP_DEF = {
    title: "Abandoned House",
    file: "./assets/models/map/Abandoned_House.glb",
    scale: 1.0,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },

    // Spawn points
    spawn:    { x: -2.0, y: 1.8, z: 4.0 },   // Player start inside house
    vanSpawn: { x: 0.0,  y: 1.8, z: 12.0 },  // Where van/outside loads

    // Exterior polygon (rough bounding box around house)
    exteriorMode: "exterior",
    exterior: [
      { x:-20, z:-25 },
      { x: 20, z:-25 },
      { x: 20, z: 25 },
      { x:-20, z: 25 }
    ],

    // Room polygons (adjust to real floor layout if needed)
    rooms: [
      { name:"Living Room", poly:[ {x:-8,z:-6}, {x:8,z:-6}, {x:8,z:6}, {x:-8,z:6} ] },
      { name:"Kitchen",     poly:[ {x:-8,z:6},  {x:8,z:6},  {x:8,z:12}, {x:-8,z:12} ] },
      { name:"Bedroom 1",   poly:[ {x:-14,z:-6},{x:-8,z:-6},{x:-8,z:6},{x:-14,z:6} ] },
      { name:"Bedroom 2",   poly:[ {x:8,z:-6},  {x:14,z:-6},{x:14,z:6},{x:8,z:6} ] },
      { name:"Bathroom",    poly:[ {x:-14,z:6}, {x:-8,z:6}, {x:-8,z:12},{x:-14,z:12} ] },
    ]
  };

  console.log("[MapConfig] Abandoned House loaded:", window.MAP_DEF);
})();
