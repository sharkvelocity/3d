// assets/models/map/apartment_floor_plan.config.js
(function () {
  window.MAP_DEF = {
    title: "Apartment Floor Plan",
    file: "apartment_floor_plan.glb",

    // Start conservative; tweak after first load if needed
    scale: 0.020,
    rotationY: 0,

    // Adjust if the GLB origin isn't where you want it
    offset: { x: 0, y: 0, z: 0 },

    // Safe spawn roughly at entrance-height
    spawn:    { x: 0, y: 1.8, z: 0 },
    vanSpawn: { x: 0, y: 1.8, z: 0 },

    exteriorMode: "exterior",
    exterior: [
      { x: -40, z: -40 }, { x: 40, z: -40 }, { x: 40, z: 40 }, { x: -40, z: 40 }
    ],

    // Minimal room polys so UI has something to show; refine with Inspector later
    rooms: [
      { name:"Van",          poly:[ {x:-5,z:10}, {x:5,z:10}, {x:5,z:18}, {x:-5,z:18} ] },
      { name:"Entry",        poly:[ {x:-6,z:4},  {x:6,z:4},  {x:6,z:10}, {x:-6,z:10} ] },
      { name:"Living",       poly:[ {x:-10,z:-8},{x:10,z:-8},{x:10,z:4}, {x:-10,z:4} ] },
      { name:"Kitchen",      poly:[ {x:10,z:-8}, {x:18,z:-8},{x:18,z:2}, {x:10,z:2} ] },
      { name:"Bedroom",      poly:[ {x:-10,z:-18},{x:0,z:-18},{x:0,z:-8}, {x:-10,z:-8} ] },
      { name:"Bathroom",     poly:[ {x:0,z:-18}, {x:6,z:-18}, {x:6,z:-10},{x:0,z:-10} ] }
    ]
  };
})();
