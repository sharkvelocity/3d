// File: assets/dev/tools/spirit_box.js
(function(){
  "use strict";
  if (window.__PP_TOOL_SPIRITBOX_V2__) return; window.__PP_TOOL_SPIRITBOX_V2__ = true;

  const PP = window.PP || (window.PP = {});
  PP.tools = PP.tools || {};

  const ID   = "spiritbox";
  const ICON = "./assets/icons/spiritbox.png";

  const S = {
    powered: false,
    held: false,              // in hand as active item
    lastAskAt: 0,
    askCooldown: 1.0,
    worldNode: null,          // TransformNode / mesh when dropped
    worldMesh: null,          // small proxy for raycast/select
    rayMax: 3.0,              // player can interact within 3m
    spatial: false
  };

  function scene(){ return window.SCENE || window.scene || BABYLON.Engine?.LastCreatedScene; }
  function camera(){ const s=scene(); return s && s.activeCamera; }
  function now(){ return performance.now()/1000; }

  function toast(msg){
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.style.display='block';
    clearTimeout(toast._t); toast._t = setTimeout(()=> el.style.display='none', 1000);
  }

  // ------- Audio glue (uses new spatial API) -------
  function power(on){
    if (!PP.audio?.spiritBox?.power) return;
    if (on && !S.powered){
      PP.audio.spiritBox.power(true);
      S.powered = true;
      // enable spatial and set initial position
      PP.audio.spiritBox.enableSpatial(!!S.worldNode && !S.held);
      updatePannerPosition(); // set panner once
      toast("Spirit Box: ON");
      return;
    }
    if (!on && S.powered){
      PP.audio.spiritBox.power(false);
      S.powered = false;
      toast("Spirit Box: OFF");
    }
  }
  function ask(){
    if (!S.powered) return;
    const t = now(); if (t - S.lastAskAt < S.askCooldown) return;
    S.lastAskAt = t;
    PP.audio.spiritBox.ghostSpeak({
      gain: 0.95, duck: 0.6, attack: 0.05, hold: 0.9, release: 0.35,
      centerHz: 1100, Q: 1.0, pitchMin: 0.92, pitchMax: 1.08
    });
  }

  // keep the panner on the box if dropped; otherwise keep at listener (no attenuation)
  function updatePannerPosition(){
    const s=scene(); if (!s || !PP.audio?.spiritBox?.setWorldPosition) return;
    const cam = camera(); if (!cam) return;
    // Update listener to camera
    try{
      const p = cam.globalPosition || cam.position || new BABYLON.Vector3(0,0,0);
      const f = cam.getForwardRay?.(1)?.direction || new BABYLON.Vector3(0,0,1);
      PP.audio.spiritBox.setListener(p.x,p.y,p.z,  f.x,f.y,f.z,  0,1,0);
    }catch{}

    if (S.worldNode && !S.held){
      const w = S.worldNode.getAbsolutePosition?.() || S.worldNode.position || cam.position;
      PP.audio.spiritBox.enableSpatial(true);
      PP.audio.spiritBox.setWorldPosition(w.x, w.y, w.z);
    } else {
      // held or no world instance -> make it effectively 2D
      PP.audio.spiritBox.enableSpatial(false);
      const p = cam.globalPosition || cam.position;
      PP.audio.spiritBox.setWorldPosition(p.x,p.y,p.z);
    }
  }

  // ------- World instance (dropped) -------
  function createWorldBoxAt(pos){
    const s=scene(); if (!s) return null;
    const node = new BABYLON.TransformNode("spiritbox_node", s);
    node.position.copyFrom(pos);

    // small pickable proxy
    const mesh = BABYLON.MeshBuilder.CreateBox("spiritbox_pick", {size:0.18}, s);
    mesh.position.set(0,0.09,0);
    mesh.parent = node; mesh.isPickable = true;
    mesh.metadata = { tool: ID };
    mesh.visibility = 0.2; // faint outline; swap to icon mesh later if you have one
    S.worldNode = node; S.worldMesh = mesh;
    return node;
  }

  function dropFromPlayer(){
    const cam = camera(); const s=scene(); if (!cam || !s) return;
    const origin = (s.__playerBody?.getAbsolutePosition?.() || cam.position).clone();
    const dir = cam.getForwardRay?.(1)?.direction || new BABYLON.Vector3(0,0,1);
    const pos = origin.add(dir.scale(0.6)); pos.y += 0.2;
    if (!S.worldNode) createWorldBoxAt(pos); else S.worldNode.position.copyFrom(pos);
    // After drop: if powered, keep playing + spatialize
    if (S.powered){
      PP.audio.spiritBox.enableSpatial(true);
      updatePannerPosition();
    }
  }

  // ------- Raycast interaction (look and press E) -------
  function lookingAtWorldBox(maxDist=S.rayMax){
    const s=scene(); const cam=camera(); if (!s||!cam||!S.worldMesh) return false;
    const ray = cam.getForwardRay?.(maxDist) || new BABYLON.Ray(cam.position, cam.getForwardRay().direction, maxDist);
    const hit = s.pickWithRay(ray, m=>m===S.worldMesh);
    return !!(hit && hit.hit && hit.pickedMesh === S.worldMesh);
  }

  // ------- Equip/unequip/lifecycle -------
  function onEquip(){
    S.held = true;
    // Switching items should turn it OFF unless it was dropped
    if (!S.worldNode) power(false);
    toast("Equipped: Spirit Box (F = Power, LMB = Ask, E = Use on dropped)");
  }
  function onUnequip(){
    S.held = false;
    // If not dropped (no worldNode), turn OFF when switching away
    if (!S.worldNode) power(false);
  }
  function onPlaceOrDrop(){
    // Player drops/places from hand
    dropFromPlayer();
    // keep current power state; if ON, it continues in-world
    updatePannerPosition();
  }

  // ------- Input -------
  function bindInput(){
    // Power toggle when held
    window.addEventListener('keydown', (e)=>{
      if (e.code==='KeyF' && S.held){ e.preventDefault(); e.stopPropagation(); power(!S.powered); }
      // Interact with dropped unit by looking at it: E
      if (e.code==='KeyE'){
        if (!S.held && lookingAtWorldBox()){
          e.preventDefault(); e.stopPropagation();
          power(!S.powered);
        }
      }
    }, true);

    // Ask (LMB or Use button) when held
    window.addEventListener('mousedown', (e)=>{
      if ((e.button|0)===0 && S.held){ e.preventDefault(); e.stopPropagation(); ask(); }
    }, true);

    // HUD Use button
    document.getElementById('btn-use')?.addEventListener('click', ()=>{ if (S.held) ask(); });

    // Per-frame spatial updates (listener + box position)
    (function loop(){
      try { updatePannerPosition(); } catch {}
      requestAnimationFrame(loop);
    })();
  }

  // ------- Hooks to other systems (optional events) -------
  function bindEvents(){
    // Startup
    window.addEventListener('pp:start', ()=>{ /* audio unlocked */ }, {once:true});

    document.addEventListener('pp:tool:equip',   e=>{ if (e?.detail?.id===ID) onEquip(); });
    document.addEventListener('pp:tool:unequip', e=>{ if (e?.detail?.id===ID) onUnequip(); });

    document.addEventListener('pp:tool:placed',  e=>{ if (e?.detail?.id===ID) onPlaceOrDrop(); });
    document.addEventListener('pp:tool:dropped', e=>{ if (e?.detail?.id===ID) onPlaceOrDrop(); });

    // Van inventory swap: if it leaves hand and not dropped, ensure OFF
    document.addEventListener('pp:van:swap', ()=>{ if (!S.held && !S.worldNode) power(false); });

    // Optional: ghost logic can trigger a response
    document.addEventListener('pp:ghost:spiritbox', ()=>{ if (S.powered) ask(); });
  }

  // ------- Registration with your inventory (if available) -------
  function registerTool(){
    try{
      PP.inventory?.registerTool && PP.inventory.registerTool({
        id: ID, name: "Spirit Box", icon: ICON, stackable: false,
        onEquip, onUnequip,
        onUsePrimary: ask,                // click/use while held
        onUseSecondary: ()=> power(!S.powered), // alt use toggles power
        onDrop: onPlaceOrDrop,
        onPlace: onPlaceOrDrop
      });
    } catch {}
  }

  // ------- Init -------
  (function init(){
    bindInput();
    bindEvents();
    registerTool();
    power(false); // default off
  })();

  // public handle
  PP.tools.spirit_box = {
    id: ID,
    power: (on)=>power(!!on),
    toggle: ()=>power(!S.powered),
    ask: ask,
    isPowered: ()=>S.powered,
    isHeld: ()=>S.held,
    getWorldNode: ()=>S.worldNode
  };

})();
