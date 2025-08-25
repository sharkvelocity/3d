
/* spawn_fix.js — consumes __MapDefCandidates from map_select.js (classic script)
   - Loads map config via <script> tags (no modules/import())
   - Enforces MAP_DEF.spawn on camera / player_capsule
*/
(function(){
  if (window.__SpawnFixReady) return; window.__SpawnFixReady = true;

  var log = function(){ try{ console.log.apply(console, ["[spawn_fix]"].concat([].slice.call(arguments))); }catch(_){} };

  function docResolve(path){
    try { return new URL(path, document.baseURI).toString(); }
    catch(e){ return path; }
  }

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

  // Fallback candidates if map_select didn't run
  function defaultCandidates(){
    return [
      "./assets/models/map/Abandoned_House.js",
      "./assets/models/map/furnished_house.js",
      "./assets/models/map/jailhouse.js",
      "./assets/models/map/fully_furnished.config.js",
      "./assets/models/map/furnished_house.config.js"
    ];
  }

  async function tryLoadCandidates(cands){
    for (var i=0;i<cands.length;i++){
      var p = cands[i];
      var ok = await loadScriptOnce(p);
      if (ok && window.MAP_DEF && window.MAP_DEF.spawn){
        log("Loaded MAP_DEF from", p);
        return true;
      }
    }
    return false;
  }

  async function ensureMapDef(){
    try{
      if (window.MAP_DEF && window.MAP_DEF.spawn) return true;
      var list = (window.__MapDefCandidates && window.__MapDefCandidates.length) ? window.__MapDefCandidates : defaultCandidates();
      var ok = await tryLoadCandidates(list);
      if (!ok){
        // synthesize minimal MAP_DEF so spawn always works
        window.MAP_DEF = window.MAP_DEF || {
          title:"Fallback Map",
          file:null,
          scale:1, rotationY:0,
          offset:{x:0,y:0,z:0},
          spawn:{x:0,y:1.8,z:0}
        };
        log("Synthesized fallback MAP_DEF");
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
      var cam = scene && scene.activeCamera;
      if (cam && cam.position){
        cam.position.x = +sp.x || 0;
        cam.position.y = +sp.y || 1.8;
        cam.position.z = +sp.z || 0;
      }
      var pc = scene && scene.getMeshByName && scene.getMeshByName("player_capsule");
      if (pc && pc.position && pc.position.copyFromFloats) pc.position.copyFromFloats(+sp.x||0, +sp.y||1.8, +sp.z||0);
      log("Spawn enforced:", sp);
    }catch(e){
      log("enforceSpawn error:", e);
    }
  }

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
        }, 250);
      });
    }
  })();

  window.__SpawnFix = { ensureMapDef: ensureMapDef, enforceSpawn: enforceSpawn };
})();
