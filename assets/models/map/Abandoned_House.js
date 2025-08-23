<!-- assets/models/map/Abandoned_House.js -->
<script>
/*
  NOTE: Global map definition consumed by index.html.
  - exterior: winding order doesn't matter; we treat it as a simple polygon in XZ.
  - rooms: each room has a name and a polygon (XZ). The "Van" is special: sanity recovers there.
  - vanSpawn: where the player starts.
  Replace these with your exported marker JSON later if you like.
*/
window.MAP_DEF = {
  name: "Abandoned House",

  // --- Exterior boundary (simple rectangle sample; replace with your wall loop) ---
  exterior: [
    {x: -20, z: -30}, {x:  20, z: -30},
    {x:  20, z:  30}, {x: -20, z:  30}
  ],

  // --- Rooms (simple partition; replace with your room loops) ---
  rooms: [
    { name: "Van",   poly: [{x:-6,z:32},{x:6,z:32},{x:6,z:22},{x:-6,z:22}] },
    { name: "Foyer", poly: [{x:-6,z:-30},{x:6,z:-30},{x:6,z:-12},{x:-6,z:-12}] },
    { name: "Living",poly: [{x:-20,z:-12},{x:6,z:-12},{x:6,z:10},{x:-20,z:10}] },
    { name: "Kitchen",poly:[{x:6,z:-12},{x:20,z:-12},{x:20,z:10},{x:6,z:10}] },
    { name: "Hall",  poly: [{x:-6,z:10},{x:6,z:10},{x:6,z:30},{x:-6,z:30}] }
  ],

  // --- Where to spawn the player (Y is adjusted to floor at runtime) ---
  vanSpawn: { x: 0, y: 2, z: 24 },

  // --- Optional: fixed item spawn pads (we’ll also randomize if not used) ---
  itemPads: [
    { x:-14, z:  6 }, { x: 14, z:  4 }, { x:  0, z:-20 },
    { x:-10, z:-6 }, { x:  8, z:-6 }, { x: -4, z: 8 }
  ]
};
</script>
