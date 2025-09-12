// ./assets/dev/ui/belt_manager.js
// Belt UI: starts empty (slots 1–3). Slot 4 is lighter (fixed). Updates on van loadout changes.
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.ui = PP.ui || {};
  PP.ui.belt = PP.ui.belt || {};

  const ICON = id => `./assets/icons/${id}.png`;
  const BELT = () => document.getElementById('belt');

  // Small badge to show remaining count for items that you treat as multi-stack (optional)
  function setBadge(slot, text){
    let b = slot.querySelector('.badge');
    if (!text){ if (b) b.remove(); return; }
    if (!b){
      b = document.createElement('div');
      Object.assign(b.style, {
        position:'absolute', right:'-6px', top:'-6px',
        background:'#0aa', color:'#012', font:'10px monospace',
        border:'1px solid #066', borderRadius:'10px', padding:'2px 6px'
      });
      b.className = 'badge';
      slot.appendChild(b);
    }
    b.textContent = text;
  }

  function ensureSlots() {
    const el = BELT(); if (!el) return;
    if (el.childElementCount >= 4) return;
    el.innerHTML = "";
    for (let i=1; i<=4; i++){
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.slot = String(i);
      s.innerHTML = `<div class="label">Empty</div>`;
      s.addEventListener('click', ()=> {
        const id = s.dataset.item || null;
        window.dispatchEvent(new CustomEvent('pp:belt:slot-selected', { detail:{ slot:i, item:id }}));
        document.querySelectorAll('#belt .slot').forEach(x=> x.classList.remove('active'));
        s.classList.add('active');
      });
      el.appendChild(s);
    }
    // Slot 4 = lighter (fixed)
    setSlot(4, 'lighter');
  }

  function setSlot(slotIndex, itemId){
    const el = BELT(); if (!el) return;
    const s = el.querySelector(`.slot[data-slot="${slotIndex}"]`);
    if (!s) return;
    s.innerHTML = "";
    s.dataset.item = itemId || "";
    setBadge(s, null);

    if (!itemId){
      s.innerHTML = `<div class="label">Empty</div>`;
      return;
    }
    const img = new Image();
    img.src = ICON(itemId);
    img.alt = itemId;
    img.className = "item-icon";
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = itemId.replace(/_/g, " ");
    s.appendChild(img);
    s.appendChild(lab);
  }

  function renderLoadout(loadout){
    ensureSlots();
    const items = (loadout && Array.isArray(loadout.items)) ? loadout.items : [null,null,null];
    for (let i=0;i<3;i++){
      setSlot(i+1, items[i] || null);
    }
    setSlot(4, 'lighter'); // keep fixed
  }

  // Optional: show remaining stacks for some items using van inventory
  function updateBadges(van){
    const el = BELT(); if (!el || !van) return;
    for (let i=1;i<=3;i++){
      const s = el.querySelector(`.slot[data-slot="${i}"]`);
      const id = s?.dataset?.item;
      if (!id) { setBadge(s, null); continue; }
      // badge for consumables (smudge, lantern, sanity_med, photo_camera)
      if (/^(smudge|lantern|sanity_med|photo_camera)$/.test(id)){
        const n = van[id] ?? 0;
        setBadge(s, String(n));
      } else {
        setBadge(s, null);
      }
    }
  }

  // Public API
  PP.ui.belt.render = renderLoadout;
  PP.ui.belt.clear = function(){
    ensureSlots();
    for (let i=1;i<=3;i++) setSlot(i, null);
    setSlot(4, 'lighter');
  };

  // Init empty belt
  function boot(){
    ensureSlots();
  }
  if (document.readyState === "complete" || document.readyState === "interactive") boot();
  else document.addEventListener('DOMContentLoaded', boot);

  // Events
  window.addEventListener('pp:van:loadout-changed', ev=>{
    renderLoadout(ev.detail?.loadout || { items:[null,null,null] });
  });
  window.addEventListener('pp:van:inventory-updated', ev=>{
    updateBadges(ev.detail?.inventory);
  });

  // Gameplay hooks: when item is used/placed, UI will refresh via pp:van:loadout-changed from inventory_system
})();