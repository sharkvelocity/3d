// assets/dev/game/map_loader.js
// This module provides map manifest and weather definitions.
// It does NOT handle UI population or event listeners.

window.PP = window.PP || {};

// Map Definitions (will be populated from maps.json in bootstrap)
PP.mapManifest = [];

// Weather Definitions
PP.weatherDefs = [
  { type: "Clear", tempRange: [15, 25], ambient: "clear.ogg" },
  { type: "Rain", tempRange: [10, 18], ambient: "rain.ogg" },
  { type: "Snow", tempRange: [-5, 2], ambient: "wind.ogg" },
  { type: "Foggy", tempRange: [8, 14], ambient: "fog.ogg" },
];

// If you have specific procedural generator definitions or settings that
// map_manager needs, you can put them here:
// PP.proceduralGenerators = {
//   prohouse_generator: { /* config for prohouse */ }
// };

console.log("[map_loader] Definitions loaded.");

// No IIAFE here, no DOM manipulation, no event listeners.
// Just data and simple utility functions.
