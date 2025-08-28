// rooms.js
// Attach to window so the rest of your code can read it.
(function () {
  // Helper to make a rectangle quickly
  function rect(x1, z1, x2, z2) {
    return [
      { x: x1, z: z1 },
      { x: x2, z: z1 },
      { x: x2, z: z2 },
      { x: x1, z: z2 }
    ];
  }

  // === Exterior/Ground layout ===
  const EXTERIOR = [
    // Matches the ghost roaming polygon you already use
    { x: 18.404, z: -96.040 },
    { x: 57.205, z: -94.031 },
    { x: 62.145, z: -105.142 },
    { x: 61.872, z: -149.928 },
    { x: 18.660, z: -149.900 }
  ];

  // Van zone from your current setup
  const VAN = (() => {
    const cx = 43.657, cz = -119.008, w = 9, h = 6;
    return [
      { x: cx - w, z: cz + h },
      { x: cx + w, z: cz + h },
      { x: cx + w, z: cz - h },
      { x: cx - w, z: cz - h }
    ];
  })();

  // === Interior starter rooms ===
  // These are **starter bounds** so everything runs right away.
  // Tweak these to your real floorplan (use Dev > Room Recorder, if you have it).
  const LIVING = rect(28, -108, 44, -124);
  const KITCHEN = rect(44, -108, 58, -124);
  const HALL = rect(36, -124, 50, -140);
  const BEDROOM_1 = rect(28, -124, 36, -140);
  const BEDROOM_2 = rect(50, -124, 58, -140);
  const BATH = rect(42, -140, 50, -149.5);
  const GARAGE = rect(18.6, -108, 28, -149.5); // rough left block as a starter

  // Optional basement stub (adjust if your map has one)
  const BASEMENT = rect(30, -140, 58, -149.5);

  // Export
  window.ROOMS = [
    { name: "Van",            poly: VAN,            type: "exterior" },
    { name: "Grounds",        poly: EXTERIOR,       type: "exterior" },

    // Interior starter set (edit as you refine)
    { name: "Living Room",    poly: LIVING,         type: "interior" },
    { name: "Kitchen",        poly: KITCHEN,        type: "interior" },
    { name: "Hallway",        poly: HALL,           type: "interior" },
    { name: "Bedroom 1",      poly: BEDROOM_1,      type: "interior" },
    { name: "Bedroom 2",      poly: BEDROOM_2,      type: "interior" },
    { name: "Bathroom",       poly: BATH,           type: "interior" },
    { name: "Garage",         poly: GARAGE,         type: "interior" },
    { name: "Basement",       poly: BASEMENT,       type: "interior" }
  ];

  // Optional: simple helper if you want to sanity-check in console
  window.debugRoomsToJSON = () => JSON.stringify(window.ROOMS, null, 2);
})();
