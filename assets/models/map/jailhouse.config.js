(function(){
  // Minimal config for the Jailhouse map. This is DATA ONLY.
  // Your loader will import this file and then import MAP_DEF.file (the GLB).
  // Adjust spawn/offset/rotationY/scale as you refine the layout.
  window.MAP_DEF = {
    title: "Jailhouse",
    // Put your actual GLB here (same folder by default):
    file: "./assets/models/map/jailhouse.glb",
    // Global transforms if your GLB needs nudging in world space:
    scale: 1.0,
    rotationY: 0,          // degrees
    offset: { x: 0, y: 0, z: 0 },
    // Initial player position (camera/capsule). Tweak as needed:
    spawn: { x: 2, y: 1.8, z: -8 },

    // Optional exterior polygon for rain/snow systems. Coarse rectangle for now.
    // Update to your real yard footprint when known.
    exteriorMode: "exterior",
    exterior: [
      { x: -60, z: -80 },
      { x:  60, z: -80 },
      { x:  60, z:  80 },
      { x: -60, z:  80 }
    ],

    // Rooms can be filled in later for more accurate logic (temperature, ghost room, etc.).
    // Leave empty if you don't have per-room polygons yet.
    rooms: []
  };
  console.log("[MapConfig] MAP_DEF set for Jailhouse:", window.MAP_DEF);
})();