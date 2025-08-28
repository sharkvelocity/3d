// ./assets/index3/devtools_ghosttypes.js
// Populates a ghost-type dropdown and wires it to GhostAPI + GhostMove.
(function(){
  "use strict";
  function getTypes() {
    if (window.GhostAPI && typeof GhostAPI.types === "function") return GhostAPI.types();
    if (window.GHOST_DATA) return Object.keys(window.GHOST_DATA);
    return ["Spirit","Wraith","Banshee"];
  }
  function populate() {
    const root = document.querySelector('#devtools-panel') || document;
    const sel =
      root.querySelector('#ghost-type-select') ||
      root.querySelector('[data-role="ghost-type"]') ||
      root.querySelector('select.ghost-type') ||
      null;
    if (!sel) return;
    const types = getTypes();
    const current = window.currentGhostKey || types[0];
    sel.innerHTML = "";
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      if (t === current) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = async () => {
      const t = sel.value;
      window.currentGhostKey = t;
      try {
        // (re)load model via GhostAPI if available
        if (window.GhostAPI && typeof GhostAPI.loadGhost === "function") {
          await GhostAPI.loadGhost(t);
        }
        // retype movement
        window.GhostMove?.setType(t, window.GHOST_DATA?.[t]);
      } catch (e) { console.warn("[devtools] ghost change failed", e); }
    };
  }
  if (document.readyState !== "loading") populate();
  else document.addEventListener('DOMContentLoaded', populate);
})();