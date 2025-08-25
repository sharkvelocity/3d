


// ==== Legacy API shims (from player_rig_controller_final.js) ====
window.S = window.S || function(){ /* shim for legacy API 'S' */ };
window.attachLoop = window.attachLoop || function(){ /* shim for legacy API 'attachLoop' */ };
window.doToggle = window.doToggle || function(){ /* shim for legacy API 'doToggle' */ };
window.ensurePlayerMesh = window.ensurePlayerMesh || function(){ /* shim for legacy API 'ensurePlayerMesh' */ };
window.ensureRig = window.ensureRig || function(){ /* shim for legacy API 'ensureRig' */ };
window.forwardOnXZ = window.forwardOnXZ || function(){ /* shim for legacy API 'forwardOnXZ' */ };
window.keyDown = window.keyDown || function(){ /* shim for legacy API 'keyDown' */ };
window.keyUp = window.keyUp || function(){ /* shim for legacy API 'keyUp' */ };
window.rightOnXZ = window.rightOnXZ || function(){ /* shim for legacy API 'rightOnXZ' */ };
window.tick = window.tick || function(){ /* shim for legacy API 'tick' */ };
window.whenReady = window.whenReady || function(){ /* shim for legacy API 'whenReady' */ };


// ==== SPAWN compatibility (for legacy scripts that referenced SPAWN) ====
(function(){
  if (!window.SPAWN){
    try{
      if (window.MAP_DEF && MAP_DEF.spawn){
        window.SPAWN = new BABYLON.Vector3(MAP_DEF.spawn.x||0, MAP_DEF.spawn.y||1.35, MAP_DEF.spawn.z||0);
      } else {
        window.SPAWN = new BABYLON.Vector3(0,1.35,0);
      }
    }catch(_){
      window.SPAWN = {x:0,y:1.35,z:0};
    }
  }
})();
