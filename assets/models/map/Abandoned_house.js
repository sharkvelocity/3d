// Classic map definition for Abandoned House (used by game_bootstrap.js)
window.MAP_DEF = {
  title: "Abandoned House",
  file: "Abandoned_House.glb",

  // Uniform model scale + simple yaw. Tweak if your GLB faces the wrong way.
  scale: 1,
  rotationY: 0,

  // You said: “make XZ: 23.54, -50.76 the origin”.
  // To make that world point become (0,0,0), we shift the whole map by -point.
  // So offset = (-23.54, 0, +50.76)
  offset: { x: -23.54, y: 0, z: 50.76 },

  // Spawn at the new world origin (adjust if you want a different start spot)
  spawn: { x: 0, y: 1.8, z: 0 },

  // Optional rooms (keep empty if you don’t have them yet)
  rooms: [
    // Example shape if you want it later:
    // { name: "Van", poly: [{x:-4,z:3},{x:4,z:3},{x:4,z:-3},{x:-4,z:-3}] }
  ]
};
