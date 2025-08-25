/* spawn_fix.js — MAP_DEF loader + spawn enforcement (document-relative to ./assets/models/map/)
   - Builds candidates under ./assets/models/map/ only (no root fetches)
   - Derives config names from the selected map file (e.g. Abandoned_House.glb → Abandoned_House.js/.config.js)
   - Loads via <script> (classic) so it works with non-module scripts
   - Enforces MAP_DEF.spawn on active camera and optional player capsule
*/
(function(){
  if (window.__SpawnFixReady) return; window.__SpawnFixReady = true;

  var log = function(){ try{ console.log.apply(console, ["[spawn_fix]"].concat([].slice.call(arguments))); }catch(_){} };

  // Resolve URL relative to the current document (avoids "assets/dev/assets/..." path bugs)
  function docResolve(path){
    try { return new URL(path, document.baseURI).toString(); }
    catch(e){ return path; }
  }

  // Classic <script> loader (NOT type="module")
  function loadScriptOnce(relPath){
    return new Promise(function(resolve){
      var url = docResolve(relPath);
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload  = function(){ resolve(true);  };
      s.onerror = function(){ resolve(false); };
      document.head.appendChild(s);
    });
  }

  // Helpers
  function baseNameNoExt(file){
    if (!file) return "";
    var last = file.split("/").pop();
    return last.replace(/\.[^.]+$/, ""); // strip last extension
  }

  // Build candidate config filenames (name only, no path)
  function configsForBase(base){
    if (!base) return [];
    return [
      base + ".config.js",
      base + ".js"
    ];
  }

  // Prefix all candidates with the correct folder
  function withMapFolder(names){
    var ROOT = "./assets/models/map/";
    return names.map(function(n){ return ROOT + n; });
  }

  // From the current UI (if present) get selected map file
  function getSelectedMapFile(){
    try{
      var sel = document.querySelector("#map-select, #mapSelect, select[name='map']");
      if (!sel) return null;
      var idx = parseInt(sel.value, 10);
      // If your app stores a full object somewhere, try to read it
      if (window.CURRENT_MAP && typeof window.CURRENT_MAP.file === "string") return window.CURRENT_MAP.file;
      // Fallback to options text → try to infer a filename-ish
      var optTxt = (sel.options[sel.selectedIndex]||{}).textContent || "";
      // Heuristics: if "Abandoned" in name, use Abandoned_House.glb, etc.
      var t = optTxt.toLowerCase();
      if (t.includes("abandoned")) return "Abandoned_House.glb";
      if (t.includes("furnished")) return "furnished_house.glb";
      if (t.includes("jail"))      return "jailhouse.glb";
      // nothing reliable
      return null;
    }catch(_){ return null; }
  }

  async function tryLoadCandidates(candidates){
    for (var i=0;i<candidates.length;i++){
      var path = candidates[i];
      var ok = await loadScriptOnce(path);
      if (ok && window.MAP_DEF && window.MAP_DEF.spawn){
        log("Loaded MAP_DEF from", path);
        return true;
      }
    }
    return false;
  }

  async function ensureMapDef(){
    try{
      if (window.MAP_DEF && window.MAP_DEF.spawn) return true;

      // 1) Try from CURRENT_MAP.file or selected dropdown
      var mapFile = (window.CURRENT_MAP && window.CURRENT_MAP.file) || getSelectedMapFile();
      if (mapFile && typeof mapFile === "string"){
        var base = baseNameNoExt(mapFile); // e.g. Abandoned_House
        var names = configsForBase(base);  // Abandoned_House.config.js, Abandoned_House.js
        var paths = withMapFolder(names);
        if (await tryLoadCandidates(paths)) return true;
      }

      // 2) Try known maps explicitly (order: selected common ones)
      var known = [
        "Abandoned_House.config.js","Abandoned_House.js",
        "furnished_house.config.js","furnished_house.js",
        "jailhouse.config.js","jailhouse.js"
      ];
      if (await tryLoadCandidates(withMapFolder(known))) return true;

      // 3) Last-resort fallback: synthesize a minimal MAP_DEF so game continues
      if (!window.MAP_DEF){
        window.MAP_DEF = {
          title: "Fallback Map",
          file: "./assets/models/map/furnished_house.glb",
          scale: 1,
          rotationY: 0,
          offset: {x:0,y:0,z:0},
          spawn: {x:0, y:1.8, z:0}
        };
        log("Synthesized MAP_DEF fallback (no config found).");
      }
      return !!(window.MAP_DEF && window.MAP_DEF.spawn);
    }catch(e){
      log("ensureMapDef error:", e);
      return false;
    }
  }

  function enforceSpawn(scene){
    try{
      if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
      var sp = MAP_DEF.spawn || {x:0,y:1.8,z:0};

      // Player capsule first if present
      try{
        var pc = scene && scene.getMeshByName && scene.getMeshByName("player_capsule");
        if (pc && pc.position) pc.position.copyFromFloats(sp.x||0, sp.y||1.8, sp.z||0);
      }catch(_){}

      // Camera
      var cam = scene && scene.activeCamera;
      if (cam && cam.position){
        cam.position.x = (sp.x||0);
        cam.position.y = (sp.y||1.8);
        cam.position.z = (sp.z||0);
      }
      log("Spawn enforced:", sp);
    }catch(e){
      log("enforceSpawn error:", e);
    }
  }

  // Hook Babylon createScene if it exists; else run after load
  (function hookScene(){
    var g = window;
    var origCreate = g.createScene;
    if (typeof origCreate === "function"){
      g.createScene = async function(){
        await ensureMapDef();
        var sc = await origCreate.apply(this, arguments);
        try { sc.executeWhenReady(function(){ enforceSpawn(sc); }); }
        catch(_){ enforceSpawn(sc); }
        return sc;
      };
      log("Wrapped createScene for spawn enforcement");
    } else {
      window.addEventListener("load", function(){
        setTimeout(async function(){
          await ensureMapDef();
          var sc = g.scene || (g._scene && g._scene.scene) || g.SCENE || null;
          if (sc) enforceSpawn(sc);
        }, 300);
      });
    }
  })();

  // Expose for debugging in console
  window.__SpawnFix = { ensureMapDef: ensureMapDef, enforceSpawn: enforceSpawn };
})();
