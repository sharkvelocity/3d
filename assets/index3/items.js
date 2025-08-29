// ./assets/index3/items.js — v2.0
// Belt + icons + Use/Drop/Throw always visible.
// Integrates models from items_models_exploration.js (exploration_objects.glb).
// Auto-attaches VideoFeed texture to cams with screens when equipped.
// Safe to include once; exposes window.Items API.

(function(){
  "use strict";
  if (window.Items && window.Items.__v === "2.0") return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA= ()=> window.camera || SCENE()?.activeCamera;
  const v3    = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const toast = (m,ms=1200)=> (window.toast? window.toast(m,ms) : console.log('[items]', m));

  const ICON_PATH = "./assets/icons/"; // {key}.png

  // Inventory setup
  // Slot 4: Lighter (fixed), Slot 5: Notebook (fixed) — as per your UI note
  const DEFAULT_LOADOUT = ['flashlight', 'spirit_box', 'emf', 'lighter', 'notebook'];

  // Items registry → UI label + per-item handlers (optional)
  // NOTE: You can add/remove keys here freely; belt + icons render dynamically.
  const REGISTRY = {
    flashlight:  { label:'Flashlight',  modelKey:'flashlight',        hasModel:true,  onUse: useFlashlight },
    flashlight_pocket:{label:'Pocket Light', modelKey:'flashlight_pocket', hasModel:true, onUse: useFlashlight },
    emf:         { label:'EMF',         modelKey:'emf',               hasModel:true,  onUse: useEMF },
    spirit_box:  { label:'Spirit Box',  modelKey:'spirit_box',        hasModel:true,  onUse: useSpiritBox },
    thermometer: { label:'Thermometer', modelKey:'thermometer',       hasModel:true,  onUse: useThermometer },
    photo_camera:{ label:'Photo Cam',   modelKey:'photo_camera',      hasModel:true,  onUse: usePhotoCam, attachFeed:true },
    thermal_camera:{label:'Thermal Cam',modelKey:'thermal_camera',    hasModel:true,  onUse: useThermalCam, attachFeed:true },

    // Fixed slots (4 & 5)
    lighter:     { label:'Lighter',     modelKey:null,                hasModel:false, onUse: useLighter },
    notebook:    { label:'Notebook',    modelKey:null,                hasModel:false, onUse: useNotebook },

    // Other game items you already have (no model in this GLB → fallback)
    salt:        { label:'Salt',        modelKey:null,                hasModel:false, onUse: useSalt, tossable:true },
    writing_book:{ label:'Writing',     modelKey:null,                hasModel:false, onUse: useWritingBook },
    uv_prints:   { label:'UV',          modelKey:null,                hasModel:false, onUse: useUV },
    voice_recorder:{label:'Recorder',   modelKey:'voice_recorder',    hasModel:true,  onUse: useVoiceRecorder },
  };

  const ST = {
    slots: DEFAULT_LOADOUT.slice(),   // string keys
    active: 0,                        // slot index 0..4
    equippedRoot: null,               // TransformNode for current equipped model (if any)
    equippedKey: null,                // item key
    equippedInfo: null,               // {root, instances, screen}
    belt: null, actions: null,        // DOM
    initialized:false,
    awaitingItemModels:false,
  };

  // ---------- UI: belt + actions ----------
  function ensureUI(){
    if (ST.belt && ST.actions) return;
    // Belt container already exists in your HTML as #belt — we’ll populate it.
    let belt = document.getElementById('belt');
    if (!belt){
      belt = document.createElement('div');
      belt.id = 'belt';
      Object.assign(belt.style, {
        position:'fixed', left:'50%', bottom:'18px', transform:'translateX(-50%)',
        display:'flex', gap:'12px', zIndex:6000, alignItems:'center',
        background:'rgba(0,0,0,0.55)', border:'1px solid #066', padding:'8px 10px', borderRadius:'10px'
      });
      document.body.appendChild(belt);
    }
    ST.belt = belt;

    // Actions row (always visible)
    let actions = document.getElementById('belt-actions');
    if (!actions){
      actions = document.createElement('div');
      actions.id = 'belt-actions';
      Object.assign(actions.style, {
        position:'fixed', left:'50%', bottom:'100px', transform:'translateX(-50%)',
        display:'flex', gap:'8px', zIndex:6000, alignItems:'center',
        background:'rgba(0,0,0,0.5)', border:'1px solid #066', padding:'6px 8px', borderRadius:'8px'
      });
      actions.innerHTML = `
        <button id="act-use"   class="hud-btn">Use</button>
        <button id="act-drop"  class="hud-btn">Drop</button>
        <button id="act-throw" class="hud-btn">Throw</button>
      `;
      document.body.appendChild(actions);
    }
    ST.actions = actions;

    actions.querySelector('#act-use').onclick   = ()=> doUse();
    actions.querySelector('#act-drop').onclick  = ()=> doDrop();
    actions.querySelector('#act-throw').onclick = ()=> doThrow();

    // build belt slots
    renderBelt();
  }

  function iconUrlFor(key){
    // prefer exact match
    return `${ICON_PATH}${key}.png`;
  }

  function renderBelt(){
    const belt = ST.belt; if (!belt) return;
    belt.innerHTML = '';
    for (let i=0;i<ST.slots.length;i++){
      const key = ST.slots[i];
      const slot = document.createElement('div');
      slot.className = 'slot' + (i===ST.active ? ' active':'');
      slot.dataset.index = String(i);
      slot.style.width = '72px';
      slot.style.height= '72px';
      slot.style.position = 'relative';
      slot.style.cursor = 'pointer';
      slot.onclick = ()=> selectSlot(i);

      const keyTag = document.createElement('div');
      keyTag.className = 'key';
      keyTag.textContent = String(i+1);
      slot.appendChild(keyTag);

      const img = document.createElement('img');
      img.alt = key;
      img.draggable = false;
      img.style.maxWidth = '60px';
      img.style.maxHeight= '60px';
      img.style.imageRendering = 'crisp-edges';
      const url = iconUrlFor(key);
      img.src = url;
      img.onerror = ()=> { img.remove(); slot.appendChild(document.createTextNode(REGISTRY[key]?.label || key)); };
      slot.appendChild(img);

      belt.appendChild(slot);
    }
  }

  function selectSlot(i){
    if (i<0 || i>=ST.slots.length) return;
    ST.active = i;
    renderBelt();
    equipActive();
  }

  // ---------- Equip / Unequip ----------
  async function equipActive(){
    const key = ST.slots[ST.active];
    if (!key) return;
    await unequip();

    ST.equippedKey = key;

    const reg = REGISTRY[key] || { label:key };
    const hasModel = !!reg.hasModel && !!reg.modelKey;

    // Try to use ItemModels to equip the real model
    if (hasModel && window.ItemModels){
      if (!ItemModels.load) {
        // not ready yet; retry soon
        if (!ST.awaitingItemModels){
          ST.awaitingItemModels = true;
          const retry = setInterval(()=>{
            if (window.ItemModels && ItemModels.load){
              clearInterval(retry);
              ST.awaitingItemModels = false;
              equipActive();
            }
          }, 120);
        }
        return;
      }
      try{
        await ItemModels.load();
        const opts = {
          offset: new BABYLON.Vector3(0.15, -0.08, 0.28),
          attachVideoFeed: !!reg.attachFeed,
        };
        const out = ItemModels.equipToCamera(reg.modelKey, opts);
        if (out){
          ST.equippedInfo = out;
          ST.equippedRoot = out.root;
        }
      }catch(e){
        console.warn('[items] equip model fail', key, e);
      }
    }

    toast(`Equipped: ${reg.label || key}`);
  }

  async function unequip(){
    // detach model, if any
    if (ST.equippedInfo?.root){
      try{
        ST.equippedInfo.root.setParent(null);
        ST.equippedInfo.root.dispose();
      }catch{}
    }
    ST.equippedInfo = null;
    ST.equippedRoot = null;
    ST.equippedKey  = null;
  }

  // ---------- Use / Drop / Throw ----------
  function doUse(){
    const key = ST.slots[ST.active]; if (!key) return;
    const reg = REGISTRY[key] || {};
    if (typeof reg.onUse === 'function'){ reg.onUse(key); return; }
    toast(`Use ${reg.label || key}`);
  }

  function doDrop(){
    const key = ST.slots[ST.active]; if (!key) return;
    // if we have a model in hand, we can drop it to the floor
    if (ST.equippedInfo?.root){
      const s = SCENE(), c = CAMERA();
      const r = ST.equippedInfo.root;
      r.setParent(null);
      // put at feet
      const from = c.position.add(new BABYLON.Vector3(0, 0.5, 0));
      const ray  = new BABYLON.Ray(from, v3(0,-1,0), 5);
      const hit  = s.pickWithRay(ray, m=> m && m.isPickable !== false);
      r.position.copyFrom(hit?.hit ? hit.pickedPoint.add(v3(0,0.02,0)) : c.position.add(c.getForwardRay(1).direction.scale(0.5)));
      // keep it pickable on ground
      r.getChildMeshes?.().forEach(m=> m.isPickable = true);
      ST.equippedInfo = null;
      ST.equippedRoot = null;
    }
    toast('Dropped');
  }

  function doThrow(){
    const key = ST.slots[ST.active]; if (!key) return;
    const s = SCENE(), c = CAMERA();
    if (!s || !c) return;
    if (ST.equippedInfo?.root){
      const r = ST.equippedInfo.root;
      r.setParent(null);
      const f = c.getForwardRay(1.5).direction;
      r.position.copyFrom(c.position.add(v3(0,0.6,0)));
      // simple toss animation
      const target = r.position.add(f.scale(2.0)).add(v3(0,-0.3,0));
      const anim = new BABYLON.Animation('toss','position','60',
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      anim.setKeys([{frame:0, value:r.position.clone()},{frame:20, value:target}]);
      r.animations = [anim];
      s.beginAnimation(r, 0, 20, false);
      ST.equippedInfo = null;
      ST.equippedRoot = null;
      toast('Threw');
    }
  }

  // ---------- Per-item handlers ----------
  function useFlashlight(){
    // Prefer your existing light system if present
    if (window.Lights?.toggleFlashlight) { Lights.toggleFlashlight(); return; }
    // Fallback: toggle emissive on the equipped meshes
    const mats = collectEquippedMaterials();
    mats.forEach(m=>{
      const on = (m.emissiveColor?.r||0) < 0.2;
      m.emissiveColor = on ? new BABYLON.Color3(1,1,1) : new BABYLON.Color3(0,0,0);
    });
  }

  function useEMF(){
    if (window.EMF?.toggle) { EMF.toggle(); return; }
    toast('EMF toggled');
  }

  function useSpiritBox(){
    // your spirit_box.js probably exports SpiritBox.toggle() or similar
    if (window.SpiritBox?.toggle) { SpiritBox.toggle(); return; }
    // basic audio fallback
    try{
      const a = document.getElementById('spiritbox-audio') || new Audio('./assets/audio/spiritbox.mp3');
      a.loop = true;
      if (a.paused) a.play(); else a.pause();
    }catch{}
    toast('Spirit box');
  }

  function useThermometer(){
    if (window.Thermo?.toggle) { Thermo.toggle(); return; }
    if (window.Temperature?.showHUD) { Temperature.showHUD(true); return; }
    toast('Thermometer');
  }

  function usePhotoCam(){
    try { if (window.VideoFeed){ VideoFeed.setActive(true); VideoFeed.setLight(true, 0.8);} } catch {}
    toast('Photo camera');
  }

  function useThermalCam(){
    try { if (window.VideoFeed){ VideoFeed.setActive(true); VideoFeed.setLight(true, 0.8);} } catch {}
    toast('Thermal camera');
  }

  function useLighter(){ toast('Flick'); }
  function useNotebook(){
    // open notebook modal
    const nb = document.getElementById('notebook-modal');
    if (nb){ nb.style.display = 'flex'; } else toast('Notebook');
  }

  function useSalt(){ if (window.SaltSystem?.use) { SaltSystem.use(); return; } toast('Salt'); }
  function useWritingBook(){ if (window.WritingBook?.use) { WritingBook.use(); return; } toast('Writing'); }
  function useUV(){ if (window.UVPrints?.toggle){ UVPrints.toggle(); return; } toast('UV'); }
  function useVoiceRecorder(){ toast('Recorder'); }

  function collectEquippedMaterials(){
    const mats = [];
    try{
      if (ST.equippedInfo?.instances){
        ST.equippedInfo.instances.forEach(i => { if (i.material) mats.push(i.material); });
      }
      if (ST.equippedInfo?.screen?.material) mats.push(ST.equippedInfo.screen.material);
    }catch{}
    return mats;
  }

  // ---------- Boot / Hotkeys ----------
  function init(){
    if (ST.initialized) return;
    ensureUI();

    // Number keys 1..5 select slots
    window.addEventListener('keydown', (e)=>{
      if (e.repeat) return;
      if (e.key>='1' && e.key<='5'){ selectSlot((+e.key)-1); }
    });

    // initial equip
    selectSlot(0);
    ST.initialized = true;
  }

  // public API
  window.Items = {
    __v:"2.0",
    init,
    getActiveKey: ()=> ST.slots[ST.active],
    setLoadout: (arr)=>{
      if (!Array.isArray(arr) || arr.length!==5) return;
      ST.slots = arr.slice(0,5);
      renderBelt();
      equipActive();
    },
    equipActive,
    unequip,
    use: doUse, drop: doDrop, throw: doThrow,
    selectSlot,
    getRegistry: ()=> JSON.parse(JSON.stringify(REGISTRY)),
  };

  // lazy boot when scene exists
  const boot = setInterval(()=>{
    try{
      if (SCENE()){
        clearInterval(boot);
        init();
      }
    }catch{}
  }, 120);
})();
