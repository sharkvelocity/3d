// assets/dev/ui/van_ui.js
(function(){
  "use strict";
  if (window.__vanUI_v1) return; window.__vanUI_v1 = true;

  // Van stock as per your spec (counted items)
  const VAN_STOCK = {
    dots:2, smudge:4, motion:4, flashlight:1, headgear:1,
    video_cam:4, photo_cam:4, writing:2, thermo:2, crucifix:2,
    lantern:4, emf:2, spiritbox:2, sanity_med:4, parabolic:1
  };

  window.PP = window.PP || {};
  PP.inventory = PP.inventory || {};
  // Initialize stock only if not already set by save/load
  PP.inventory.van = PP.inventory.van || structuredClone(VAN_STOCK);
  // Belt: 3 empty slots + fixed lighter in slot 4 (doesn’t consume van space)
  PP.inventory.belt = PP.inventory.belt || { 1:null, 2:null, 3:null, 4:"lighter" };

  function changeVan(item, delta){
    const v = PP.inventory.van;
    if (!(item in v)) return false;
    const nv = Math.max(0, (v[item]||0) + delta);
    v[item] = nv;
    return true;
  }

  // Equip or clear a belt slot (1–3). Returns true if changed.
  function equip(slot, itemId){
    if (slot < 1 || slot > 3) return false;
    const belt = PP.inventory.belt;
    const cur = belt[slot];

    if (itemId === cur) return false;

    // return current to van
    if (cur) changeVan(cur, +1);

    if (itemId){
      // take from van if available
      if (!changeVan(itemId, -1)) return false;
      belt[slot] = itemId;
    } else {
      belt[slot] = null;
    }

    // Let the belt manager update icons/labels without DOM rebuild
    window.dispatchEvent(new CustomEvent('pp:van:loadout-changed', {
      detail:{ belt: PP.inventory.belt, van: PP.inventory.van }
    }));
    return true;
  }

  // Consuming an item (e.g., smudge, sanity meds). Removes from belt.
  function consumeActive(slot){
    if (slot < 1 || slot > 3) return false;
    const belt = PP.inventory.belt;
    if (!belt[slot]) return false;
    belt[slot] = null;
    window.dispatchEvent(new CustomEvent('pp:van:loadout-changed', {
      detail:{ belt: PP.inventory.belt, van: PP.inventory.van }
    }));
    return true;
  }

  // Public API for the van panel
  PP.vanUI = { equip, consumeActive, changeVan, stock: PP.inventory.van, belt: PP.inventory.belt };

  // Example: van access area can call PP.vanUI.equip(slot, itemId) when player interacts
  // Your existing van UI should bind to this API.
})();
