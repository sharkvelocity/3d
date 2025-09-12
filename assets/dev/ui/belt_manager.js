// File: assets/dev/ui/belt_manager.js
(function(){
  "use strict";
  if (window.__PP_BELT_V3__) return; window.__PP_BELT_V3__ = true;

  const PP = window.PP || (window.PP = {});
  PP.belt = PP.belt || {};

  // --- Config ---
  const SLOT_COUNT = 4;            // 1-3 user items, 4 = lighter reserved
  const LIGHTER_ID = "lighter";
  const ICONS = (id)=> `./assets/icons/${id}.png`;   // icons live here

  // --- State ---
  const S = {
    slots: [
      null, // 0 -> slot index 1
      null, // 1 -> slot index 2
      null, // 2 -> slot index 3
      { id: LIGHTER_ID, name: "lighter", icon: ICONS(LIGHTER_ID), qty: 1, readonly: true } // 3 -> slot 4
    ],
    active: 0,     // currently selected slot index
    el: null,      // #belt element
    mounted: false
  };

  // --- Utilities ---
  function qs(id){ return document.getElementById(id); }

  function emit(name, detail){
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function slotLabel(item){
    if (!item) return "Empty";
    const base = item.name || item.id;
    if (typeof item.qty === "number" && item.qty >= 0 && !item.readonly){
      return `${base}\n(${item.qty})`;
    }
    return base;
  }

  function buildSlot(idx, item){
    const wrap = document.createElement('div');
    wrap.className = 'slot' + (idx === S.active ? ' active' : '');
    wrap.dataset.idx = String(idx);

    if (item && item.icon){
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = item.name || item.id;
      img.className = 'item-icon';
      wrap.appendChild(img);
    }

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = slotLabel(item);
    wrap.appendChild(label);

    if (!item?.readonly){
      wrap.addEventListener('click', ()=> selectSlot(idx));
    }

    return wrap;
  }

  function renderBelt(){
    if (!S.el) S.el = qs('belt');
    if (!S.el) return;

    // idempotent render: do not replace #belt; only patch children
    const need = SLOT_COUNT;
    const have = S.el.children.length;

    // create missing slots
    for (let i = have; i < need; i++){
      S.el.appendChild(buildSlot(i, S.slots[i]));
    }
    // remove extra nodes (shouldn't happen but safe)
    for (let i = have - 1; i >= need; i--){
      S.el.removeChild(S.el.children[i]);
    }
    // patch content + active class
    for (let i = 0; i < need; i++){
      const node = S.el.children[i];
      const item = S.slots[i];

      // keep the shell, just update inside
      node.classList.toggle('active', i === S.active);

      // ensure icon state
      let img = node.querySelector('img.item-icon');
      if (item && item.icon){
        if (!img){
          img = document.createElement('img');
          img.className = 'item-icon';
          node.insertBefore(img, node.firstChild);
        }
        if (img.src !== location.origin + '/' + item.icon){
          img.src = item.icon;
          img.alt = item.name || item.id || '';
        }
      } else if (img){
        img.remove();
      }

      // label
      const label = node.querySelector('.label') || (()=>{ const d=document.createElement('div'); d.className='label'; node.appendChild(d); return d; })();
      const txt = slotLabel(item);
      if (label.textContent !== txt) label.textContent = txt;
    }

    // ensure belt stays visible
    S.el.style.display = 'flex';
  }

  function selectSlot(idx){
    if (idx < 0 || idx >= SLOT_COUNT) return;
    if (S.active === idx) return;

    // Unequip previous if needed
    const prevItem = S.slots[S.active];
    if (prevItem && !prevItem.readonly){
      emit('pp:tool:unequip', { id: prevItem.id, slot: S.active });
    }

    S.active = idx;
    renderBelt();

    const cur = S.slots[idx];
    if (cur && !cur.readonly){
      emit('pp:belt:select', { slot: idx, id: cur.id });
      emit('pp:tool:equip',  { id: cur.id, slot: idx });
    }
  }

  // --- Public API ---
  PP.belt.getActiveIndex  = () => S.active;
  PP.belt.getActiveItem   = () => S.slots[S.active];
  PP.belt.getSlots        = () => S.slots.slice();
  PP.belt.setSlot         = (idx, item)=>{ S.slots[idx]=item||null; renderBelt(); };
  PP.belt.clearSlot       = (idx)=>{ S.slots[idx]=null; renderBelt(); };
  PP.belt.consumeActive   = ()=>{ const it=S.slots[S.active]; if (!it||it.readonly) return; if (typeof it.qty==='number'){ it.qty = Math.max(0, it.qty-1); if(it.qty===0) S.slots[S.active]=null; renderBelt(); } };

  // Sync from van/UI: full replace without destroying DOM
  PP.belt.applyLoadout = (items /* length 3 array for slots 0..2 */)=>{
    for (let i=0;i<3;i++) S.slots[i] = items[i] || null;
    // slot 4 is reserved lighter — keep whatever is there but ensure it’s lighter structure
    if (!S.slots[3] || S.slots[3].id !== LIGHTER_ID){
      S.slots[3] = { id: LIGHTER_ID, name: "lighter", icon: ICONS(LIGHTER_ID), qty: 1, readonly: true };
    }
    renderBelt();
    // keep the same active index if possible
    if (S.active > 3) S.active = 0;
  };

  // --- Key bindings (do NOT hide or re-create the belt) ---
  function bindKeys(){
    window.addEventListener('keydown', (e)=>{
      // ignore if focused in an input/textarea/contenteditable
      const t = e.target;
      if (t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.isContentEditable)) return;

      const code = e.code || e.key;
      // Digit1..Digit4 or Numpad1..Numpad4
      const map = { Digit1:0, Digit2:1, Digit3:2, Digit4:3, Numpad1:0, Numpad2:1, Numpad3:2, Numpad4:3 };
      if (code in map){
        e.preventDefault(); e.stopPropagation();
        selectSlot(map[code]);
      }
    }, true);
  }

  // --- Mount ---
  function mount(){
    if (S.mounted) return;
    S.el = qs('belt');
    if (!S.el){
      // create belt container if missing
      const div = document.createElement('div'); div.id = 'belt';
      document.body.appendChild(div);
      S.el = div;
    }
    S.el.style.display = 'flex';
    S.mounted = true;
    renderBelt();
    bindKeys();
  }

  // When the game actually starts
  window.addEventListener('pp:start', ()=> mount(), { once:true });

  // Also mount if belt exists before start (dev hot-reload safety)
  if (document.readyState !== 'loading') { if (qs('belt')) mount(); }
  else document.addEventListener('DOMContentLoaded', ()=>{ if (qs('belt')) mount(); });

})();
