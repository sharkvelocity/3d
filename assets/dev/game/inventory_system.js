// ./assets/dev/game/inventory_system.js
// Van inventory & loadout management. Belt gets updated via events only.
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.inventory = PP.inventory || {};

  // VAN STOCK (quantities)
  const VAN_STOCK = {
    dots: 2,
    smudge: 4,                 // sage-style smudge (consumable)
    motion_sensor: 4,          // placeable
    flashlight: 1,             // headgear (doesn't take belt space)
    video_camera: 4,           // placeable
    photo_camera: 4,           // consumable? (shots tracked elsewhere) – remove on placement if you treat as tripod
    writing_book: 2,           // placeable
    thermometer: 2,
    crucifix: 2,               // placeable
    lantern: 4,                // candles (consumable on burn-out OR placeable)
    emf: 2,
    spirit_box: 2,
    sanity_med: 4,             // NEW consumable with effects
    parabolic_mic: 1           // NEW tool (beam amp)
  };

  // Which items are consumables (decrement on "use")
  const CONSUMABLES = new Set(['smudge','lantern','sanity_med','photo_camera']);

  // Which items leave belt when placed
  const PLACEABLES = new Set([
    'motion_sensor','video_camera','writing_book','crucifix','lantern'
  ]);

  // Live state
  const state = {
    van: {...VAN_STOCK},
    // Current belt loadout: exactly 3 user-chosen items; slot 4 is lighter (managed by belt UI)
    loadout: { items: [null, null, null] },
    // Headgear flashlight is a separate toggle (does not consume belt space)
    headgear: { flashlight: false },
  };

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function copy(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Broadcast helpers
  function emit(name, detail){
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
  function publishVan(){ emit('pp:van:inventory-updated', { inventory: copy(state.van) }); }
  function publishLoadout(){ emit('pp:van:loadout-changed', { loadout: copy(state.loadout) }); }

  // Public API
  const API = {
    getVan(){ return copy(state.van); },
    getLoadout(){ return copy(state.loadout); },
    getHeadgear(){ return copy(state.headgear); },

    // Attempt to add an item from van to a belt slot (1..3). Returns true on success.
    takeToSlot(itemId, slotIndex){
      if (!itemId || slotIndex<1 || slotIndex>3) return false;
      if (!state.van[itemId] || state.van[itemId] <= 0) return false;
      // Put in belt slot
      state.loadout.items[slotIndex-1] = itemId;
      // Decrement van stock
      state.van[itemId] -= 1;
      publishVan(); publishLoadout();
      return true;
    },

    // Exchange: swap an item currently in the belt with another van item
    exchange(slotIndex, newItemId){
      if (slotIndex<1 || slotIndex>3) return false;
      const old = state.loadout.items[slotIndex-1];
      if (old){
        state.van[old] = (state.van[old]||0) + 1; // return old to van
      }
      if (newItemId){
        if (!state.van[newItemId] || state.van[newItemId]<=0){
          // cannot take, restore old if needed
          if (old){ state.loadout.items[slotIndex-1] = old; }
          publishVan(); publishLoadout();
          return false;
        }
        state.loadout.items[slotIndex-1] = newItemId;
        state.van[newItemId] -= 1;
      } else {
        // cleared slot: nothing new taken
        state.loadout.items[slotIndex-1] = null;
      }
      publishVan(); publishLoadout();
      return true;
    },

    // Called when player "uses" an item (consumables only)
    onItemUsed(slotIndex){
      const id = state.loadout.items[slotIndex-1];
      if (!id) return;
      if (CONSUMABLES.has(id)){
        // consumable disappears from belt; no return to van
        state.loadout.items[slotIndex-1] = null;
        publishLoadout();
        emit('pp:inventory:consumed', { item:id });
        return;
      }
      // Non-consumables remain; no-op
    },

    // Called when player "places" an item in the world (placeables leave belt)
    onItemPlaced(slotIndex){
      const id = state.loadout.items[slotIndex-1];
      if (!id) return;
      if (PLACEABLES.has(id)){
        state.loadout.items[slotIndex-1] = null;
        publishLoadout();
        emit('pp:inventory:placed', { item:id });
        return;
      }
      // If non-placeable, ignore
    },

    // Optional: return a placed item back to van (pickup)
    returnToVan(itemId){
      if (!itemId) return;
      state.van[itemId] = (state.van[itemId]||0) + 1;
      publishVan();
    },

    // Headgear flashlight toggle (doesn't consume inventory)
    setHeadgearFlashlight(on){
      state.headgear.flashlight = !!on;
      emit('pp:headgear:flashlight', { on: state.headgear.flashlight });
    }
  };

  // Expose
  PP.inventory.api = API;

  // Van should respond to UI requests by publishing current inventory
  window.addEventListener('pp:van:request-inventory', ()=> publishVan());
  // For convenience, publish once after pp:start
  window.addEventListener('pp:start', ()=> setTimeout(publishVan, 200));

  // Hooks from gameplay to inventory
  window.addEventListener('pp:item:used',  ev => {
    const slot = ev.detail?.slot|0;
    if (slot>=1 && slot<=3) API.onItemUsed(slot);
    // handle sanity med effect here too (bridge)
    if (ev.detail?.item === 'sanity_med'){
      emit('pp:effect:sanity-med', {}); // effects module will catch
    }
  });
  window.addEventListener('pp:item:placed', ev => {
    const slot = ev.detail?.slot|0;
    if (slot>=1 && slot<=3) API.onItemPlaced(slot);
  });

  // For van exchanges initiated by UI
  window.addEventListener('pp:van:take-to-slot', ev=>{
    const item = ev.detail?.item;
    const slot = ev.detail?.slot|0;
    API.takeToSlot(item, slot);
  });
  window.addEventListener('pp:van:exchange-slot', ev=>{
    const item = ev.detail?.item ?? null;
    const slot = ev.detail?.slot|0;
    API.exchange(slot, item);
  });

})();