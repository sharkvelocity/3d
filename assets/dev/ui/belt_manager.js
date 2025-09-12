// ./assets/dev/ui/belt_manager.js
// Belt UI: empty at start; populates only when van sends a loadout.
(function(){
  "use strict";
  window.PP = window.PP || {};
  PP.ui = PP.ui || {};
  PP.ui.belt = PP.ui.belt || {};

  const ICON_PATH = (id) => `./assets/icons/${id}.png`;
  const BELT = () => document.getElementById('belt');

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
        // simple visual active state (optional)
        document.querySelectorAll('#belt .slot').forEach(x=> x.classList.remove('active'));
        s.classList.add('active');
      });
      BELT().appendChild(s);
    }
  }

  function setSlot(slotIndex, itemId){
    const el = BELT(); if (!el) return;
    const s = el.querySelector(`.slot[data-slot="${slotIndex}"]`);
    if (!s) return;
    s.innerHTML = ""; // clear
    s.dataset.item = itemId || "";
    if (!itemId){
      s.innerHTML = `<div class="label">Empty</div>`;
      return;
    }
    const img = new Image();
    img.src = ICON_PATH(itemId);
    img.alt = itemId;
    img.className = "item-icon";
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = itemId.replace(/_/g, " ");
    s.appendChild(img);
    s.appendChild(lab);
  }

  function renderLoadout(loadout){
    // Expect loadout.items = array of chosen item ids (length 1..3)
    const chosen = Array.isArray(loadout?.items) ? loadout.items.slice(0,3) : [];
    ensureSlots();
    // slots 1–3 from chosen, slot 4 = lighter (always)
    for (let i=0;i<3;i++){
      setSlot(i+1, chosen[i] || null);
    }
    setSlot(4, 'lighter');
  }

  // Public API
  PP.ui.belt.setLoadout = renderLoadout;
  PP.ui.belt.clear = function(){
    ensureSlots();
    for (let i=1;i<=4;i++) setSlot(i, null);
  };

  // Initialize empty belt at DOM ready / after pp:start (visual only; no items)
  function boot(){
    ensureSlots();
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Listen for van loadout changes ONLY (no pre-population at start)
  window.addEventListener('pp:van:loadout-changed', (ev)=>{
    const lo = ev.detail?.loadout || null;
    renderLoadout(lo || { items: [] });
  });

})();