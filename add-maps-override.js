(function(){
  // Drop-in override to include your repo maps in the dropdown.
  const EXTRAS = [
    { file:"Abandoned_House.glb",       title:"Abandoned House",       def:"Abandoned_House.js" },
    { file:"furnished_house.glb",      title:"Furnished House",       def:"furnished_house.config.js" },
    { file:"apartment_floor_plan.glb", title:"Apartment Floor Plan" }
  ];

  function unionExtras(list){
    const out = Array.isArray(list) ? list.slice() : [];
    const seen = new Set(out.map(m => (m.file||"").toLowerCase()));
    for (const e of EXTRAS){
      const key = (e.file||"").toLowerCase();
      if(!seen.has(key)){ out.push(e); seen.add(key); }
    }
    out.sort((a,b)=> (a.title||a.file||"").localeCompare(b.title||b.file||""));
    return out;
  }

  // Override loadManifest to always include extras
  const origLoad = window.loadManifest;
  window.loadManifest = async function(){
    let list = [];
    if (typeof origLoad === "function"){
      try { await origLoad(); list = (window.MAP_FILES||[]); } catch(e){ list = []; }
    } else {
      // Try to fetch maps.json directly if origLoad doesn't exist
      try{
        const res = await fetch("./assets/models/map/maps.json", { cache: "no-store" });
        const json = await res.json();
        list = Array.isArray(json) ? json : (json.maps || []);
      } catch(e) { list = []; }
    }
    window.MAP_FILES = unionExtras(list);
    if (typeof populateMapSelector === "function") populateMapSelector();
  };

  // Ensure default selection prefers Abandoned House
  const origPopulate = window.populateMapSelector;
  window.populateMapSelector = function(){
    if (typeof origPopulate === "function"){ try{ origPopulate(); }catch(e){} }
    const sel = document.getElementById('map-select');
    if(!sel || !window.MAP_FILES || !window.MAP_FILES.length) return;
    // Rebuild options to ensure extras appear
    sel.innerHTML = window.MAP_FILES.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join('');
    let defIndex = 0;
    for (let i=0;i<MAP_FILES.length;i++){
      const t = (MAP_FILES[i].title||MAP_FILES[i].file||'').toLowerCase();
      if (t.includes('abandoned')) { defIndex=i; break; }
    }
    sel.value = String(defIndex);
    window.CURRENT_MAP = window.MAP_FILES[defIndex];
  };
})();