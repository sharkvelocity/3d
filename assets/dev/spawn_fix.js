
/* spawn_fix.js — robust MAP_DEF loader + spawn enforcement (document-relative paths)
   - Resolves candidate config URLs against document.baseURI to avoid "assets/dev/assets/..." bugs
   - Loads via <script> tags (classic) so it works with <script src="..."> (no ESM import())
   - Enforces MAP_DEF.spawn onto active camera (or player_capsule if present)
*/
(function(){
  if (window.__SpawnFixReady) return; window.__SpawnFixReady = true;

  var log = function(){ try{ console.log.apply(console, ["[spawn_fix]"].concat([].slice.call(arguments))); }catch(_){}};

  // Resolve a URL relative to the HTML document, NOT this JS file.
  function docResolve(path){
    try { return new URL(path, document.baseURI).toString(); }
    catch(e){ return path; }
  }

  // Load a script tag once (classic, not module), resolve relative to document
  function loadScriptOnce(path){
    return new Promise(function(resolve){
      var url = docResolve(path);
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function(){ resolve(true); };
      s.onerror = function(){ resolve(false); };
      document.head.appendChild(s);
    });
  }

  // Candidate map config files (document-relative)
  var candidates = [
    "./assets/models/map/furnished_house.js",
    "./assets/models/map/fully_furnished.config.js",
    "./assets/models/map/Abandoned_House.js",
    "./assets/models/map/abandoned_house.js",
    "./assets/models/map/furnished_house.config.js"
  ];

  async function ensureMapDef(){
    try{
      if (window.MAP_DEF && window.MAP_DEF.spawn) return true;

      // Try each candidate in order
      for (var i=0;i<candidates.length;i++){
        var ok = await loadScriptOnce(candidates[i]);
        if (ok && window.MAP_DEF && window.MAP_DEF.spawn){
          log("Loaded MAP_DEF from", candidates[i]);
          return true;
        }
      }

      // If still not present, synthesize a minimal one so the game keeps going
      if (!window.MAP_DEF){
        window.MAP_DEF = {
          title: "Fallback Map",
          file: null,
          scale: 1,
          rotationY: 0,
          offset: {x:0,y:0,z:0},
          spawn: {x:0, y:1.8, z:0}
        };
        log("Synthesized fallback MAP_DEF (no config found).");
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
      // Prefer player capsule if present
      var pc = (scene && scene.getMeshByName && scene.getMeshByName("player_capsule")) || null;
      if (pc && pc.position) { pc.position.copyFromFloats(sp.x||0, sp.y||1.8, sp.z||0); }
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

  // Hook Babylon createScene if present; else run after load
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
        // try a little later to let Babylon build scene
        setTimeout(async function(){
          await ensureMapDef();
          var sc = g.scene || (g._scene && g._scene.scene) || g.SCENE || null;
          if (sc) enforceSpawn(sc);
        }, 300);
      });
    }
  })();

  // Expose for debugging
  window.__SpawnFix = { ensureMapDef: ensureMapDef, enforceSpawn: enforceSpawn };
})();
