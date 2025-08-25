
/* map_select.js — robust dropdown + manifest with timeout + fallbacks (classic script)
   - Populates #map-select
   - Exposes window.__MapList and window.__MapDefCandidates (ordered for spawn_fix)
   - Persists the chosen map in localStorage ("selectedMapName")
*/
(function(){
  if (window.__MapSelectReady) return; window.__MapSelectReady = true;

  var log = function(){ try{ console.log.apply(console, ["[map_select]"].concat([].slice.call(arguments))); }catch(_){} };
  var LS_KEY = "selectedMapName";

  function $(q){ return document.querySelector(q); }

  function timeout(ms){
    return new Promise(function(resolve){ setTimeout(resolve, ms, "__timeout__"); });
  }

  // Normalize manifest entries to a consistent shape
  function normEntry(e){
    if (!e) return null;
    if (typeof e === "string"){
      var base = e.replace(/^\.?\/*/,"");
      var title = base.split("/").pop().replace(/\.(config\.)?js$/i,"").replace(/_/g," ")
        .replace(/\b\w/g, function(c){ return c.toUpperCase(); });
      return { title: title, file: base.replace(/^assets\/models\/map\//,""), def: base };
    }
    if (typeof e === "object"){
      var title = e.title || e.name || e.file || e.config || "Map";
      return {
        title: title,
        file: (e.file || e.glb || "").replace(/^\.?\/*/,""),
        def:  (e.def  || e.config || "").replace(/^\.?\/*/,"")
      };
    }
    return null;
  }

  // Our known-good fallbacks that match your repo
  function fallbackList(){
    return [
      { title:"Abandoned House", file:"assets/models/map/Abandoned_House.glb", def:"assets/models/map/Abandoned_House.js" },
      { title:"Furnished House", file:"assets/models/map/furnished_house.glb", def:"assets/models/map/furnished_house.js" },
      { title:"Jailhouse",       file:"assets/models/map/jailhouse.glb",       def:"assets/models/map/jailhouse.js" }
    ];
  }

  function resolveFromManifest(json){
    var list = [];
    try{
      if (Array.isArray(json)) list = json.map(normEntry).filter(Boolean);
      else if (json && typeof json === "object"){
        if (Array.isArray(json.maps)) list = json.maps.map(normEntry).filter(Boolean);
        else {
          Object.keys(json).forEach(function(k){ list.push(normEntry({ title:k, def: json[k].config || json[k].def, file: json[k].glb || json[k].file })); });
          list = list.filter(Boolean);
        }
      }
    }catch(_){ list = []; }
    if (!list.length) list = fallbackList();
    // Ensure paths are prefixed with ./ for classic script tags
    list = list.map(function(it){
      var out = Object.assign({}, it);
      if (typeof out.file === "string" && !/^(\.|https?:|\/)/.test(out.file)) out.file = "./" + out.file;
      if (typeof out.def  === "string" && !/^(\.|https?:|\/)/.test(out.def )) out.def  = "./" + out.def;
      return out;
    });
    return list;
  }

  function setCandidatesFor(name, list){
    var chosen = list.find(function(m){ return (m.title||"").toLowerCase() === (name||"").toLowerCase(); }) || list[0];
    // Build ordered candidates for spawn_fix: try the exact def first, then some inferred alternates
    var cands = [];
    if (chosen && chosen.def) cands.push(chosen.def);
    if (chosen && chosen.file){
      var base = chosen.file.replace(/\.[^.]+$/,"");
      cands.push(base + ".config.js");
      cands.push(base + ".js");
    }
    // Some specific alternates seen in your repo
    if (chosen && /furnished/i.test(chosen.title||"")){
      cands.push("./assets/models/map/fully_furnished.config.js");
    }
    // De-dup
    var seen = {}; cands = cands.filter(function(p){ if (seen[p]) return false; seen[p]=1; return true; });
    window.__SelectedMap   = chosen;
    window.__MapDefCandidates = cands;
    log("Selected:", chosen, "candidates:", cands);
  }

  function populate(list){
    var sel = $("#map-select");
    if (!sel){
      // Create one if missing
      sel = document.createElement("select");
      sel.id = "map-select";
      sel.style.cssText = "position:fixed; top:12px; left:12px; z-index:9999;";
      document.body.appendChild(sel);
    }
    sel.innerHTML = "";
    list.forEach(function(m){
      var opt = document.createElement("option");
      opt.value = m.title;
      opt.textContent = m.title;
      sel.appendChild(opt);
    });

    // restore last choice or default to first
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch(_){}
    if (saved && list.some(function(m){ return (m.title||"")===saved; })) sel.value = saved;
    else sel.value = list[0].title;

    setCandidatesFor(sel.value, list);
    sel.addEventListener("change", function(){
      try{ localStorage.setItem(LS_KEY, sel.value); }catch(_){}
      setCandidatesFor(sel.value, list);
    });
  }

  async function loadManifest(){
    var url = "./assets/models/map/maps.json";
    try{
      var res = await Promise.race([ fetch(url, {cache:"no-store"}), timeout(1500) ]);
      if (res === "__timeout__") throw new Error("manifest timeout");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      return resolveFromManifest(json);
    }catch(e){
      log("manifest failed -> fallback:", e && e.message);
      return fallbackList();
    }
  }

  function boot(){
    loadManifest().then(function(list){
      window.__MapList = list.slice();
      populate(list);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive"){
    setTimeout(boot, 0);
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }
})();
