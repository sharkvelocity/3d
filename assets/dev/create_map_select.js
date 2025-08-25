// create_map_select.js — populate the Map dropdown from maps.json
(function () {
  const SEL_ID = "map-select";
  const MANIFEST = "./assets/models/map/maps.json";

  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      // Accept either array or {maps:[...]}
      const list = Array.isArray(data) ? data : (data.maps || []);
      return list.map(m => ({
        title: m.title || m.name || m.file || "Map",
        file:  m.file,
        def:   m.def || m.config || null
      }));
    } catch (e) {
      console.warn("[create_map_select] manifest failed:", e);
      // Fallback to the two GLBs you have
      return [
        { title:"Abandoned House", file:"Abandoned_House.glb", def:"Abandoned_House.config.js" },
        { title:"Furnished House", file:"furnished_house.glb",  def:"furnished_house.config.js" },
        { title:"Jailhouse",       file:"jailhouse.glb",        def:"jailhouse.config.js" },
      ];
    }
  }

  function getSel() { return document.getElementById(SEL_ID); }

  async function populate() {
    const sel = getSel();
    if (!sel) return;
    const maps = await loadManifest();
    if (!maps.length) {
      sel.innerHTML = `<option value="-1">(no maps found)</option>`;
      return;
    }
    sel.innerHTML = maps.map((m,i)=>`<option value="${i}">${m.title}</option>`).join("");
    // Persist selection
    const key = "pp_map_index";
    const saved = localStorage.getItem(key);
    if (saved !== null && maps[+saved]) sel.value = saved;
    sel.addEventListener("change", () => localStorage.setItem(key, sel.value));
    // Stash chosen on window for runtime
    window.__PP_MAPS = maps;
    window.__PP_getSelectedMap = () => maps[ Math.max(0, Math.min(maps.length-1, +(sel.value||0))) ];
  }

  // Run once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populate, { once:true });
  } else {
    populate();
  }
})();
