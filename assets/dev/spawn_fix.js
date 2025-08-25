(function spawnFix(){
  function getScene() {
    return window.SCENE || window.scene ||
           (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null;
  }
  (function wait(){
    const s = getScene();
    if(!s){ return requestAnimationFrame(wait); }

    let once = false;
    s.onBeforeRenderObservable.add(function(){
      if (once) return; once = true;

      const sp = (window.MAP_DEF && window.MAP_DEF.spawn) ? window.MAP_DEF.spawn : null;
      const body = s.__playerBody || (s.getMeshByName && s.getMeshByName("player_capsule"));
      if (sp && body) {
        try {
          body.position.set(sp.x||0, sp.y||1.35, sp.z||0);
        } catch(e) {
          body.position = new BABYLON.Vector3(sp.x||0, sp.y||1.35, sp.z||0);
        }
      }
    });
  })();
})();
