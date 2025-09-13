// File: assets/dev/ui/belt_manager.js
(function () {
  "use strict";
  if (window.__PP_BELT_V4__) return; window.__PP_BELT_V4__ = true;

  const PP = window.PP || (window.PP = {});
  PP.belt = PP.belt || {};

  const SLOT_COUNT = 4;                       // 1..3 = user items, 4 = lighter
  const LIGHTER_ID = "lighter";
  const ICONS = (id) => `./assets/icons/${id}.png`;

  const S = {
    slots: [null, null, null, null],
    active: 0,
    el: null,
    mounted: false
  };

  function qs(id){ return document.getElementById(id); }

  function slotLabel(item){
    if (!item) return "Empty";
    const base = item.name || item.id;
    if (typeof item.qty === "number" && item.qty >= 0 && !item.readonly) return `${base}\n(${item.qty})`;
    return base;
  }

  function buildSlot(idx, item){
    const wrap = document.createElement("div");
    wrap.className = "slot" + (idx === S.active ? " active" : "");
    wrap.dataset.idx = String(idx);

    if (item && item.icon){
      const img = document.createElement("img");
      img.className = "item-icon";
      img.src = item.icon; img.alt = item.name || item.id || "";
      wrap.appendChild(img);
    }

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = slotLabel(item);
    wrap.appendChild(label);

    if (!item?.readonly){
      wrap.addEventListener("click", () => selectSlot(idx));
    }
    return wrap;
  }

  function renderBelt(){
    if (!S.el) return;
    const need = SLOT_COUNT;
    while (S.el.children.length < need) S.el.appendChild(buildSlot(S.el.children.length, S.slots[S.el.children.length]));
    while (S.el.children.length > need) S.el.removeChild(S.el.lastChild);

    for (let i=0; i<need; i++){
      const node = S.el.children[i];
      const item = S.slots[i];
      node.classList.toggle("active", i === S.active);

      let img = node.querySelector("img.item-icon");
      if (item && item.icon){
        if (!img){ img = document.createElement("img"); img.className = "item-icon"; node.insertBefore(img, node.firstChild); }
        if (img.src !== new URL(item.icon, location.href).href){ img.src = item.icon; img.alt = item.name || item.id || ""; }
      } else if (img){ img.remove(); }

      const label = node.querySelector(".label") || (()=>{ const d=document.createElement("div"); d.className="label"; node.appendChild(d); return d; })();
      const txt = slotLabel(item);
      if (label.textContent !== txt) label.textContent = txt;
    }
  }

  function selectSlot(idx){
    if (idx < 0 || idx >= SLOT_COUNT) return;
    if (S.active === idx) return;
    const prev = S.slots[S.active];
    if (prev && !prev.readonly) document.dispatchEvent(new CustomEvent("pp:tool:unequip", { detail:{ id: prev.id, slot: S.active }}));
    S.active = idx;
    renderBelt();
    const cur = S.slots[idx];
    if (cur && !cur.readonly){
      document.dispatchEvent(new CustomEvent("pp:belt:select", { detail:{ slot: idx, id: cur.id }}));
      document.dispatchEvent(new CustomEvent("pp:tool:equip",  { detail:{ id: cur.id, slot: idx }}));
    }
  }

  // Public API
  PP.belt.getActiveIndex = () => S.active;
  PP.belt.getActiveItem  = () => S.slots[S.active];
  PP.belt.getSlots       = () => S.slots.slice();
  PP.belt.setSlot        = (idx, item)=>{ S.slots[idx] = item || null; renderBelt(); };
  PP.belt.clearSlot      = (idx)=>{ S.slots[idx] = null; renderBelt(); };
  PP.belt.consumeActive  = ()=>{ const it=S.slots[S.active]; if (!it||it.readonly) return; if (typeof it.qty==="number"){ it.qty=Math.max(0,it.qty-1); if(!it.qty) S.slots[S.active]=null; renderBelt(); } };

  // Receive loadout from inventory after start
  PP.belt.applyLoadout = (items)=> {
    S.slots[0] = items[0] || null;
    S.slots[1] = items[1] || null;
    S.slots[2] = items[2] || null;
    // Reserve lighter in slot 4 AFTER start only
    S.slots[3] = { id: LIGHTER_ID, name: "lighter", icon: ICONS(LIGHTER_ID), qty: 1, readonly: true };
    renderBelt();
    if (S.active > 3) S.active = 0;
  };

  function bindKeys(){
    window.addEventListener("keydown", (e)=>{
      const t = e.target;
      if (t && (t.tagName==="INPUT" || t.tagName==="TEXTAREA" || t.isContentEditable)) return;
      const map = { Digit1:0, Digit2:1, Digit3:2, Digit4:3, Numpad1:0, Numpad2:1, Numpad3:2, Numpad4:3 };
      const idx = map[e.code];
      if (idx !== undefined){ e.preventDefault(); e.stopPropagation(); selectSlot(idx); }
    }, true);
  }

  function mount(){
    if (S.mounted) return;
    S.el = qs("belt");
    if (!S.el){ const d=document.createElement("div"); d.id="belt"; document.body.appendChild(d); S.el=d; }
    // keep belt hidden until pp:start
    S.el.style.display = "flex";
    S.mounted = true;
    renderBelt();
    bindKeys();
  }

  // IMPORTANT: mount ONLY after game start
  window.addEventListener("pp:start", ()=> mount(), { once:true });

  // Do NOT auto-mount before start; avoids pre-start belt flicker
})();
