// Auto-generated map definition for furnished_house.glb
// Tune 'scale' if the model appears too big/small relative to the player.
// You can also nudge 'offset' if the model origin is not centered on the floor.

window.MAP_DEF = {
  title: "Furnished House",
  // Model transform
  scale: 0.10,                // << adjust here if the house is giant (try 0.08 - 0.15)
  rotationY: 0,               // degrees
  offset: { x: 0, y: 0, z: 0 }, // meters

  // Player spawn
  spawn: { x: 0, y: 1.8, z: 3 },

  // Exterior bounds (rectangle around the house)
  exterior: [
    {x:-15,z:-20}, {x:15,z:-20}, {x:15,z:20}, {x:-15,z:20}
  ],

  // Room polygons (rough starter layout; tweak as needed)
  rooms: [
    { name:"Van",          poly:[ {x:-4,z:18}, {x:4,z:18}, {x:4,z:24}, {x:-4,z:24} ] },
    { name:"Living Room",  poly:[ {x:-6,z:-2}, {x:8,z:-2}, {x:8,z:8}, {x:-6,z:8} ] },
    { name:"Kitchen",      poly:[ {x:8,z:-2}, {x:14,z:-2}, {x:14,z:8}, {x:8,z:8} ] },
    { name:"Hallway",      poly:[ {x:-6,z:-8}, {x:0,z:-8}, {x:0,z:-2}, {x:-6,z:-2} ] },
    { name:"Bedroom",      poly:[ {x:0,z:-8}, {x:8,z:-8}, {x:8,z:-2}, {x:0,z:-2} ] },
    { name:"Bathroom",     poly:[ {x:8,z:-8}, {x:14,z:-8}, {x:14,z:-2}, {x:8,z:-2} ] }
  ]
};
