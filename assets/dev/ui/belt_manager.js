// File: assets/dev/ui/belt_manager.js
(function(){
  "use strict";
  if (window.__PP_BELT_V4__) return; window.__PP_BELT_V4__ = true;

  const PP = window.PP || (window.PP = {});
  PP.belt = PP.belt || {};

  /* -------------------- Config -------------------- */
  const SLOT_COUNT = 4;                      // 0..2 = user items (shown as 1..3), 3 = lighter (reserved)
  const LIGHTER_ID = "lighter";
  const ICONS = (id)=> `./assets/icons/${id}.png`;

  /* -------------------- State -------------------- */
  const S = {
    slots: [
      null, // idx 0 -> user slot #1
      null, // idx 1 -> user slot #2
      null, // idx 2 -> user slot #3
      { id: LIGHTER_ID, name: "lighter", icon: ICONS(LIGHTER_ID), qty: 1, readonly: true } // idx 3 -> lighter
    ],
    active: 0,      // active slot index (0..3)
    el: null,
    mounted: false
  };

  /* -------------------- Helpers -------------------- */
  const $id = (id)=> document.getElementById(id);
  const isInput = (el)=> !!el && (el.tagName==='INPUT' || el.tagName==='TEXTAREA' || el.isContentEditable);

  function emitWin(name, detail){ window.dispatchEvent(new CustomEvent(name, { detail })); }
  function emitDoc(name, detail){ document.dispatchEvent(new CustomEvent(name, { detail })); }

  function slotLabel(item){
    if (!item) return "Empty";
    const n = item.name || item.id || "item";
    if (!item.readonly && typeof item.qty === "number") return `${n}\n(${item.qty})`;
    return n;
  }

  function makeSlotNode(idx){
    const node = document.createElement('div');
    node.className = 'slot';
    node.dataset.idx = String(idx);
    if (!S.slots[idx]?.readonly){
      node.addEventListener('click', ()=> selectSlot(idx));
      node.style.cursor = 'pointer';
    }else{
      node.style.cursor = 'default';
    }
    const label = document.createElement('div');
    label.className = 'label';
    node.appendChild(label);
    return node;
  }

  function patchSlotNode(node, idx, item){
    node.classList.toggle('active', idx === S.active);

    // icon
    let img = node.querySelector('img.item-icon');
    if (item && item.icon){
      if (!img){
        img = document.createElement('img');
        img.className = 'item-icon';
        node.insertBefore(img, node.firstChild);
      }
      // avoid origin/path pitfalls on GH Pages: only set when different
      if (!img.src.endsWith(item.icon)) {
        img.src = item.icon;
        img.alt = item.name || item.id || '';
      }
    } else if (img){
      img.remove();
    }

    // label
    let label = node.querySelector('.label');
    if (!label){
      label = document.createElement('div');
      label.className = 'label';
      node.appendChild(label);
    }
    const txt = slotLabel(item);
    if (label.textContent !== txt) label.textContent = txt;
  }

  function renderBelt(){
    if (!S.el) S.el = $id('belt');
    if (!S.el) return;

    S.el.style.display = 'flex'; // force-visible

    // ensure correct number of slot shells
    const need = SLOT_COUNT;
    while (S.el.children.length < need) S.el.appendChild(makeSlotNode(S.el.children.length));
    while (S.el.children.length > need) S.el.removeChild(S.el.lastChild);

    // patch each
    for (let i=0;i<need;i++){
      patchSlotNode(S.el.children[i], i, S.slots[i]);
    }
  }

  function unequipPrev(){
    const prev = S.slots[S.active];
    if (prev && !prev.readonly){
      emitWin('pp:tool:unequip', { id: prev.id, slot: S.active });
    }
  }

  function equipCur(){
    const cur = S.slots[S.active];
    if (cur && !cur.readonly){
      emitWin('pp:belt:select', { slot: S.active, id: cur.id });
      emitWin('pp:tool:equip',  { id: cur.id, slot: S.active });
    }
  }

  function selectSlot(idx){
    if (idx < 0 || idx >= SLOT_COUNT) return;
    if (S.active === idx) return;

    unequipPrev();
    S.active = idx;
    renderBelt();
    equipCur();

    emitWin('pp:active-slot-changed', { slot: idx, item: S.slots[idx] });
  }

  /* -------------------- Public API -------------------- */
  PP.belt.getActiveIndex  = () => S.active;
  PP.belt.getActiveItem   = () => S.slots[S.active] || null;
  PP.belt.getSlots        = () => S.slots.slice();
  PP.belt.setSlot         = (idx, item)=>{ if (idx>=0 && idx<SLOT_COUNT){ S.slots[idx]=item||null; renderBelt(); } };
  PP.belt.clearSlot       = (idx)=>{ if (idx>=0 && idx<SLOT_COUNT){ S.slots[idx]=null; renderBelt(); } };
  PP.belt.consumeActive   = ()=>{
    const it=S.slots[S.active];
    if (!it || it.readonly) return;
    if (typeof it.qty === "number"){
      it.qty = Math.max(0, it.qty-1);
      if (it.qty===0) S.slots[S.active]=null;
      renderBelt();
    }
  };
  PP.belt.applyLoadout = (items /* array of length >=3: objects or ids */)=>{
    // Normalize to objects with id/name/icon
    const toObj = (x)=> (x && typeof x === 'string')
      ? { id:x, name:(PP.inventory?.META?.[x]?.name||x), icon:(PP.inventory?.META?.[x]?.icon||ICONS(x)) }
      : (x || null);

    for (let i=0;i<3;i++) S.slots[i] = toObj(items?.[i]) || null;

    // ensure lighter stays intact
    if (!S.slots[3] || S.slots[3].id !== LIGHTER_ID){
      S.slots[3] = { id: LIGHTER_ID, name: "lighter", icon: ICONS(LIGHTER_ID), qty: 1, readonly: true };
    }

    // keep current active slot if still valid; otherwise fallback to first non-null or 0
    if (S.active > 3) S.active = 0;
    if (!S.slots[S.active] || S.slots[S.active]?.readonly){
      const first = [0,1,2].find(i => S.slots[i]);
      S.active = (first ?? 0);
    }

    renderBelt();
  };
  PP.belt.selectSlot = (idx)=> selectSlot(idx|0); // external control
  PP.belt.show = ()=>{ if (!S.el) S.el = $id('belt'); if (S.el){ S.el.style.display='flex'; } };

  /* -------------------- Key bindings -------------------- */
  function bindKeys(){
    const map = { Digit1:0, Digit2:1, Digit3:2, Digit4:3, Numpad1:0, Numpad2:1, Numpad3:2, Numpad4:3 };
    // capture=true so we stop other listeners from swallowing or hiding the belt
    window.addEventListener('keydown', (e)=>{
      // don't hijack when typing
      if (isInput(e.target)) return;

      const code = e.code || e.key;
      if (code in map){
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        selectSlot(map[code]);
      }
    }, true);
  }

  /* -------------------- Event wiring -------------------- */
  // Keep belt in sync with inventory system (van applies loadout)
  window.addEventListener('pp:van:loadout-changed', (ev)=>{
    const items = (ev.detail?.loadout?.items || []).map(id => id || null);
    // Belt expects objects or ids; we’ll pass ids to applyLoadout (it normalizes)
    PP.belt.applyLoadout(items);
  });

  // Allow outside systems to force selection
  window.addEventListener('pp:belt:force-select', (ev)=>{
    const idx = ev.detail?.slot;
    if (Number.isFinite(idx)) selectSlot(idx|0);
  });

  /* -------------------- Mount -------------------- */
  function mount(){
    if (S.mounted) return;
    S.el = $id('belt');
    if (!S.el){
      const div = document.createElement('div'); div.id = 'belt';
      document.body.appendChild(div);
      S.el = div;
    }
    S.el.style.display = 'flex';
    S.mounted = true;
    renderBelt();
    bindKeys();
  }

  // Mount when game starts
  window.addEventListener('pp:start', ()=> mount(), { once:true });

  // Also mount on ready if the belt is already in DOM (dev reload safety)
  if (document.readyState !== 'loading') { if ($id('belt')) mount(); }
  else document.addEventListener('DOMContentLoaded', ()=>{ if ($id('belt')) mount(); });

})();
