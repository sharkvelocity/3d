// rooms.js — optional static rooms list used by Dev Tools dropdown.
// You can store either strings: ["Kitchen", "Living Room"]
// or objects: [{ name: "Kitchen", zone: { type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 3 } }, ...]

export const ROOMS = [
  "Van",
  "Porch",
  "Entry",
  // Add more names here...
];

// Also expose on window for the inline script:
window.ROOMS = typeof ROOMS !== "undefined" ? ROOMS : [];
