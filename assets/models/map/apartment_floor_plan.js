// assets/models/map/apartment_floor_plan.js
(function () {
  window.MAP_DEF = {
    title: "Apartment Floor Plan",
    file: "apartment_floor_plan.glb",
    scale: 1,
    rotationY: 0,

    // adjust once you check spawn point inside Blender/Inspector
    offset: { x: 0, y: 0, z: 0 },

    spawn: { x: 0, y: 1.8, z: 0 },
    vanSpawn: { x: 0, y: 1.8, z: 0 },

    exteriorMode: "exterior",
    exterior: [
      { x:-40, z:-40 }, { x:40, z:-40 }, { x:40, z:40 }, { x:-40, z:40 }
    ],

    rooms: [
      { name:"Van", poly:[ {x:-5,z:5}, {x:5,z:5}, {x:5,z:12}, {x:-5,z:12} ] }
      // TODO: break apartment into Living Room / Kitchen / Bedroom once polys are measured
    ]
  };
})();
