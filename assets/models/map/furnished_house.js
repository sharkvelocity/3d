// assets/models/map/furnished_house.js
(function(){
  window.MAP_DEF = {
    title: "Furnished House",
    file: "furnished_house.glb",
    scale: 0.020,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },

    // Prefer vanZone (local coords). You said current target is XZ: 23.23, -49.32
    vanZone: { center: { x: 23.23, y: 1.8, z: -49.32 }, radius: 4 },

    // (Optional) If you want to hard-override in world space instead, uncomment:
    // forceSpawnWS: { x: 23.23, y: 1.8, z: -49.32 },

    // Exterior in local coords (small polygon is fine)
    exterior: [ {x:-15,z:-20}, {x:15,z:-20}, {x:15,z:20}, {x:-15,z:20} ],

    rooms: [
      { name:"Van", poly:[ {x:-4,z:18}, {x:4,z:18}, {x:4,z:24}, {x:-4,z:24} ] },
      // … your other rooms …
    ]
  };
})();
