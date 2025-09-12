// File: assets/dev/game/inventory_system.js
// Van inventory & loadout (3 user slots). Belt is updated via events AND direct apply.
(function(){
  "use strict";
  const PP = (window.PP = window.PP || {});
  PP.inventory = PP.inventory || {};

  // ---------- Catalog (display + icons) ----------
  const ICON = id => `./assets/icons/${id}.png`;
  const ITEM_META = {
    dots:           { id:'dots',           name:'DOTS',            icon: ICON('dots') },
    smudge:         { id:'smudge',         name:'Smudge',          icon: ICON('smudge') },
    motion_sensor:  { id:'motion_sensor',  name:'Motion Sensor',   icon: ICON('motion_sensor') },
    flashlight:     { id:'flashlight',     name:'Flashlight',      icon: ICON('flashlight') }, // headgear
    video_camera:   { id:'video_camera',   name:'Video Cam',       icon: ICON('video_camera') },
    photo_camera:   { id:'photo_camera',   name:'Photo Cam',       icon: ICON('photo_camera') },
    writing_book:   { id:'writing_book',   name:'Writing Book',    icon: ICON('writing_book') },
    thermometer:    { id:'thermometer',    name:'Thermometer',     icon: ICON('thermometer') },
    crucifix:       { id:'crucifix',       name:'Crucifix',        icon: ICON('crucifix') },
    lantern:        { id:'lantern',        name:'Lantern',         icon: ICON('lantern') },
    emf:            { id:'emf',            name:'EMF',             icon: ICON('emf') },
    spirit_box:     { id:'spirit_box',     name:'Spirit Box',      icon: ICON('spirit_box') },
    sanity_med:     { id:'sanity_med',     name:'Sanity Meds',     icon: ICON('sanity_med') },
    parabolic_mic:  { id:'parabolic_mic',  name:'Parabolic Mic',   icon: ICON('parabolic_mic') },
  };
  const metaOf = id => (id ? ITEM_META[id] || { id, name:id, icon:ICON(id) } : null);

  // ---------- Van stock (quantities) ----------
  const VAN_STOCK = {
    dots: 2,
    smudge: 4,
    motion_sensor: 4,
    flashlight: 1,            // headgear (not a belt slot)
    video_camera: 4,
    photo_camera: 4,
    writing_book: 2,
    thermometer: 2,
    crucifix: 2,
    lantern: 4,
    emf: 2,
    spirit_box: 2,
    sanity_med: 4,
    parabolic_mic: 1
  };

  // Consumables (decrement on "use"); Placeables (leave belt on place)
  const CONSUMABLES = new Set(['smudge','lantern','sanity_med','photo_camera']);
  const PLACEABLES  = new Set(['motion_sensor','video_camera','writing_book','crucifix','lantern']);

  // ---------- State ----------
  const state = {
    van: { ...VAN_STOCK },
    loadout: { items: [null, null, null] },   // slot 1..3 -> itemId or null
    headgear: { flashlight: false },          // separate toggle
  };

  // ---------- Helpers ----------
  const deepCopy = o => JSON.parse(JSON.stringify(o));
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  function publishVan(){
    emit('pp:van:inventory-updated', { inventory: deepCopy(state.van) });
  }

  function _loadoutObjects(){
    // Convert ids to objects for belt (qty shown only for consumables if you track per-slot uses; here null)
    return state.loadout.items.map(id => id ? deepCopy(metaOf(id)) : null);
  }

  function publishLoadout(){
    const loadoutCopy = deepCopy(state.loadout);
    emit('pp:van:loadout-changed', { loadout: loadoutCopy });
    // Also update the belt UI immediately with display objects (id,name,icon[,qty])
    try { PP.belt?.applyLoadout && PP.belt.applyLoadout(_loadoutObjects()); } catch {}
  }

  function inRangeSlot(slotIndex){
    return Number.isFinite(slotIndex) && slotIndex >= 1 && slotIndex <= 3;
  }

  // ---------- Public API ----------
  const API = {
    getVan(){ return deepCopy(state.van); },
    getLoadout(){ return deepCopy(state.loadout); },
    getHeadgear(){ return deepCopy(state.headgear); },

    // Take one unit of item from van and place into belt slot 1..3
    takeToSlot(itemId, slotIndex){
      if (!itemId || !inRangeSlot(slotIndex)) return false;
      if (!state.van[itemId] || state.van[itemId] <= 0) return false;

      // If slot already had something, return it to van first
      const prev = state.loadout.items[slotIndex-1];
      if (prev) state.van[prev] = (state.van[prev]||0) + 1;

      state.loadout.items[slotIndex-1] = itemId;
      state.van[itemId] -= 1;

      publishVan(); publishLoadout();
      return true;
    },

    // Swap item in a belt slot with a van item (or clear if newItemId is null)
    exchange(slotIndex, newItemId){
      if (!inRangeSlot(slotIndex)) return false;

      const prev = state.loadout.items[slotIndex-1];
      if (prev) state.van[prev] = (state.van[prev]||0) + 1; // return previous to van

      if (newItemId){
        if (!state.van[newItemId] || state.van[newItemId] <= 0){
          // restore previous if cannot take
          state.loadout.items[slotIndex-1] = prev || null;
          publishVan(); publishLoadout();
          return false;
        }
        state.loadout.items[slotIndex-1] = newItemId;
        state.van[newItemId] -= 1;
      } else {
        // clear
        state.loadout.items[slotIndex-1] = null;
      }

      publishVan(); publishLoadout();
      return true;
    },

    // Called when player uses an item (consumables disappear from belt)
    onItemUsed(slotIndex){
      if (!inRangeSlot(slotIndex)) return;
      const id = state.loadout.items[slotIndex-1]; if (!id) return;

      if (CONSUMABLES.has(id)){
        state.loadout.items[slotIndex-1] = null;
        publishLoadout();
        emit('pp:inventory:consumed', { item:id });
      }
    },

    // Called when player places an item (placeables leave belt)
    onItemPlaced(slotIndex){
      if (!inRangeSlot(slotIndex)) return;
      const id = state.loadout.items[slotIndex-1]; if (!id) return;

      if (PLACEABLES.has(id)){
        state.loadout.items[slotIndex-1] = null;
        publishLoadout();
        emit('pp:inventory:placed', { item:id });
      }
    },

    // Return a placed item back to van (pickup)
    returnToVan(itemId){
      if (!itemId) return;
      state.van[itemId] = (state.van[itemId]||0) + 1;
      publishVan();
    },

    // Headgear flashlight toggle (no belt usage)
    setHeadgearFlashlight(on){
      state.headgear.flashlight = !!on;
      emit('pp:headgear:flashlight', { on: state.headgear.flashlight });
    }
  };

  PP.inventory.api = API;

  // ---------- Event wiring ----------
  // Van UI asks for current inventory
  window.addEventListener('pp:van:request-inventory', publishVan);

  // On game start, publish van & loadout so UI/belt initialize
  window.addEventListener('pp:start', ()=>{
    setTimeout(()=>{ publishVan(); publishLoadout(); }, 150);
  }, { once:true });

  // Gameplay hooks
  window.addEventListener('pp:item:used',  ev => {
    const slot = ev.detail?.slot|0;
    if (inRangeSlot(slot)) API.onItemUsed(slot);
    if (ev.detail?.item === 'sanity_med'){
      window.dispatchEvent(new CustomEvent('pp:effect:sanity-med'));
    }
  });
  window.addEventListener('pp:item:placed', ev => {
    const slot = ev.detail?.slot|0;
    if (inRangeSlot(slot)) API.onItemPlaced(slot);
  });

  // Van-side requests to take/exchange
  window.addEventListener('pp:van:take-to-slot',   ev => API.takeToSlot(ev.detail?.item, ev.detail?.slot|0));
  window.addEventListener('pp:van:exchange-slot',  ev => API.exchange(ev.detail?.slot|0, ev.detail?.item ?? null));

})();
