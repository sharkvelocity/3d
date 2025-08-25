// create_map_select.js — builds the dropdown + exposes selection helpers
(function () {
  const MAP_DIR = "./assets/models/map/";

  // Safe path resolver that NEVER double-prefixes
  function resolvePath(p) {
    if (!p) return null;
    if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;  // absolute
    if (p.startsWith("./") || p.startsWith("assets/")) return p; // already relative to site root
    return MAP_DIR + p;                                          // filename only
  }

  function normalize(entry) {
    if (!entry) return null;
    // support both {file,def,title} and bare strings
    if (typeof entry === "string") {
      return {
        title: entry.replace(/\.(glb|js|config\.js)$/i, "").replace(/[_-]/g, " "),
        file: resolvePath(entry),
        def:  null
      };
    }
    return {
      title: entry.title || entry.name || (entry.file || entry.def || "Map"),
      file: resolvePath(entry.file),
      def:  resolvePath(entry.def)
    };
  }

  async function loadManifest() {
    try {
      const res = await fetch(MAP_DIR + "maps.json", { cache: "no-store" });
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : (raw.maps || raw || []);
      const maps = list.map(normalize).filter(Boolean);
      return maps.length ? maps : null;
    } catch {
      return null;
    }
  }

  function populateSelect(maps) {
    const sel = document.getElementById("map-select");
    if (!sel) return;
    sel.innerHTML = maps.map((m, i) =>
      `<option value="${i}">${m.title || ("Map " + (i + 1))}</option>`
    ).join("");
    try {
      const saved = localStorage.getItem("selectedMapIndex");
      if (saved !== null && maps[+saved]) sel.value = saved;
    } catch {}
    sel.addEventListener("change", () => {
      try { localStorage.setItem("selectedMapIndex", sel.value); } catch {}
    });
  }

  function currentSelection(maps) {
    const sel = document.getElementById("map-select");
    const idx = Math.max(0, Math.min(maps.length - 1, parseInt(sel?.value || "0", 10) || 0));
    return maps[idx];
  }

  (async function boot() {
    const maps = (window.__PP_MAPS = await loadManifest()) || [{
      title: "Abandoned House",
      file: resolvePath("Abandoned_House.glb"),
      def:  resolvePath("Abandoned_House.js"),
    }, {
      title: "Furnished House",
      file: resolvePath("furnished_house.glb"),
      def:  resolvePath("furnished_house.js"),
    }];
    populateSelect(maps);

    // expose helpers for other modules
    window.__PP_getSelectedMap = () => currentSelection(maps);
    window.__PP_resolvePath = resolvePath;
  })();
})();
