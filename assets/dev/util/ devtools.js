// devtools.js
// Inspector/topmost + tiny WASD HUD + pointer lock status. No exports.

(function(){
  'use strict';
  if (window.__DevToolsReady) return; window.__DevToolsReady = true;

  // Inspector top-most lifter
  function elevate(){
    const nodes = Array.from(document.querySelectorAll(
      'iframe[id*="inspector"],iframe[src*="inspector"],div[id*="inspector"],div[class*="inspector"],.babylonjsInspector'
    ));
    nodes.forEach(el=>{ try{ el.style.zIndex='2147483647'; el.style.position='fixed'; }catch(_){} });
  }
  const mo = new MutationObserver(elevate);
  mo.observe(document.documentElement, {subtree:true, childList:true, attributes:true});
  elevate();

  // Small HUD
  const hud = document.getElementById('hud-xyz');
  function updateXYZ(){
    try{
      const s = window.scene || BABYLON.Engine?.LastCreatedScene;
      const cam = s?.activeCamera || window.camera;
      if (!cam || !hud) return;
      hud.style.display = 'block';
      document.getElementById('hud-x').textContent = cam.position.x.toFixed(2);
      document.getElementById('hud-y').textContent = cam.position.y.toFixed(2);
      document.getElementById('hud-z').textContent = cam.position.z.toFixed(2);
    }catch(_){}
  }
  function tickXYZ(){
    const s = window.scene || BABYLON.Engine?.LastCreatedScene;
    const eng = s?.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;
    if (s && s.onBeforeRenderObservable){
      s.onBeforeRenderObservable.add(updateXYZ);
    } else {
      setTimeout(tickXYZ, 120);
    }
  }
  tickXYZ();

  // Inspector button hookup
  const btn = document.getElementById('btn-inspector');
  btn && (btn.onclick = ()=>{ try{ (window.scene||BABYLON.Engine?.LastCreatedScene)?.debugLayer.show({embedMode:false}); setTimeout(elevate,0); }catch(_){ alert('Inspector not available'); } });
})();
