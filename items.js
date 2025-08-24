
/* =========================================================================
   PhasmoPhoney Items Module
   - Drop this <script> after Babylon is loaded and your scene exists.
   - Call: Items.init(SCENE || scene);
   - Keys: 1-5 to equip, F to use, R to alt/toggle.
   - Asset folder: ./assets/images/items/  (configurable; see Items.setAssetBase)
   ========================================================================= */
(function(global){
  const Items = {};

  // -------- Item Model Library (GLB: assets/models/items/exploration_objects.glb) --------
  let ITEMS_MODEL_PATH = "assets/models/items/exploration_objects.glb";
  const ItemModelLib = { loaded:false, promise:null, assets:{}, root:null };

  Items.setItemsModelPath = function(path){ ITEMS_MODEL_PATH = path; };

  Items.loadItemModels = async function(s){
    if (ItemModelLib.loaded) return ItemModelLib;
    if (ItemModelLib.promise) return ItemModelLib.promise;
    s = getScene(s);
    const full = ITEMS_MODEL_PATH;
    const lastSlash = full.lastIndexOf("/");
    const folder = lastSlash>=0 ? full.substring(0,lastSlash+1) : "";
    const file   = lastSlash>=0 ? full.substring(lastSlash+1) : full;
    ItemModelLib.promise = BABYLON.SceneLoader.ImportMeshAsync("", folder, file, s).then((r)=>{
      ItemModelLib.root = r.meshes[0];
      // index by exact names
      r.meshes.forEach(m=>{
        if (!m || !m.name) return;
        ItemModelLib.assets[m.name] = m;
        try { m.setEnabled(false); } catch(_){}
      });
      ItemModelLib.loaded = true;
      return ItemModelLib;
    }).catch((e)=>{ console.warn("Items.loadItemModels failed:", e); ItemModelLib.loaded = true; return ItemModelLib; });
    return ItemModelLib.promise;
  };

  Items.getItemPrototype = function(name){
    // Accept .obj names -> strip .obj for GLB nodes
    name = (name||"").replace(/\.obj$/i,"");
    return ItemModelLib.assets[name] || null;
  };

  
  const DEVICE_MODEL = {
    "EMF Reader": "EMF_Detector_EMF_Detector_0",
    "Spirit Box": "Cone.001_Spirit_Box_0",
    "Video Camera": "Photo_Camera_Photo_Camera_0",
    "Video Camera Screen": "Photo_Camera_Pantalla_0",
    "UV Flashlight": "Flashlight_Poquet_Flashlight_Poquet_0",
    "Flashlight": "Flashlight_Flashlight_0",
    "Thermometer": "Thermometer_Thermometer_0",
    "Thermal Camera": "Thermal_Camera_Thermal_Camera_0",
    "Thermal Camera Screen": "Thermal_Camera_Pantalla_0",
    "Voice Recorder": "Voice_Recorder_Voice_Recorder_0"
  };

  async function ensureItemModelFor(item, deviceKey, s){
    s = getScene(s);
    try { await Items.loadItemModels(s); } catch(_){}
    const name = DEVICE_MODEL[deviceKey];
    if (!name) return null;
    const m = Items.cloneItemMesh(name, s);
    if (m){ m.name = (deviceKey.replace(/\s+/g,"_").toLowerCase()) + "_model"; }
    return m;
  }


Items.cloneItemMesh = function(name, s){
    s = getScene(s);
    const proto = Items.getItemPrototype(name);
    if (!proto) return null;
    const inst = proto.clone(name+"_inst", null);
    if (!inst) return null;
    try {
      inst.setEnabled(true);
      // ensure materials are instanced but shared textures
      if (inst.material && inst.material.getClassName && inst.material.getClassName()==="PBRMaterial"){
        inst.material = inst.material.clone(name+"_mat"); // shallow clone keeps textures
      }
      // Some GLBs pack parts as children; enable all
      if (inst.getChildMeshes) inst.getChildMeshes().forEach(ch=>{ try{ ch.setEnabled(true); }catch(_){} });
    } catch(_){}
    return inst;
  };

  let ASSET_BASE = "./assets/icons/"; // change with Items.setAssetBase()

  function getScene(s){
    return s || global.SCENE || global.scene || (global.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null;
  }
  function getCam(s){
    s = getScene(s);
    return global.camera || (s && s.activeCamera) || null;
  }
  function vec3(x,y,z){ return new BABYLON.Vector3(x,y,z); }

  // ---------------- Inventory core ----------------
  const inventory = { list: [], equippedIndex: -1 };
  function addItem(def){
    inventory.list.push(def);
    return def;
  }
  function equip(idx, s){
    if (idx<0 || idx>=inventory.list.length) return;
    inventory.equippedIndex = idx;
    const it = inventory.list[idx];
    try { if (typeof it.onEquip==="function") it.onEquip(getScene(s)); } catch(e){}
    renderHud();
  }
  function equipped(){ return inventory.list[inventory.equippedIndex] || null; }
  function useEquipped(s){ const it = equipped(); if (!it) return; try{ it.use && it.use(getScene(s)); }catch(e){} }
  function altEquipped(s){ const it = equipped(); if (!it) return; try{ it.alt && it.alt(getScene(s)); }catch(e){} }

  // ---------------- HUD ----------------
  let hudUI = null, txtEquipped = null;
  function ensureHud(s){
    s = getScene(s);
    if (hudUI) return hudUI;
    hudUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("itemsHUD", true, s);
    const panel = new BABYLON.GUI.StackPanel();
    panel.isVertical = false;
    panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.paddingBottom = "16px";
    hudUI.addControl(panel);

    // item buttons 1..5
    for (let i=0;i<5;i++){
      const b = BABYLON.GUI.Button.CreateImageWithCenterText(
        "i"+i, (i+1).toString(), ASSET_BASE+"slot.png"
      );
      b.width = "110px"; b.height = "64px"; b.thickness = 0; b.color = "#A0FFFF";
      b.onPointerUpObservable.add(()=>equip(i, s));
      panel.addControl(b);
    }

    txtEquipped = new BABYLON.GUI.TextBlock();
    txtEquipped.color = "white"; txtEquipped.fontSize = 18;
    txtEquipped.text = "—";
    txtEquipped.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    txtEquipped.textVerticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    txtEquipped.paddingBottom = "88px";
    hudUI.addControl(txtEquipped);
    return hudUI;
  }
  function renderHud(){
    if (!txtEquipped) return;
    const it = equipped();
    txtEquipped.text = it ? `Equipped: ${it.name}  (F: Use, R: Alt)` : "—";
  }

  // ---------------- Helpers ----------------
  function planePickup(name, tex, s){
    s = getScene(s);
    const mat = new BABYLON.StandardMaterial(name+"_mat", s);
    mat.diffuseTexture = new BABYLON.Texture(ASSET_BASE + tex, s);
    mat.emissiveColor = new BABYLON.Color3(1,1,1);
    mat.backFaceCulling = false;
    const m = BABYLON.MeshBuilder.CreatePlane(name, {size:1}, s);
    m.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    m.material = mat;
    m.isPickable = true;
    return m;
  }
  function attachToCam(mesh, s){
    s = getScene(s);
    const cam = getCam(s); if (!cam || !mesh) return;
    mesh.setParent(cam);
    mesh.position = vec3(0.45, -0.35, 1.0);
    mesh.scaling  = vec3(0.6, 0.6, 0.6);
    mesh.isPickable = false;
  }

  // ---------------- Item definitions ----------------

  
  // --- EMF UI + Beep helpers ---
  let __emf_leds = null;
  let __emf_container = null;

  function makeEmfUI(s){
    try{
      s = getScene(s);
      const ui = ensureHud(s); // reuse main ADT
      if (__emf_container) return __emf_leds;
      const wrap = new BABYLON.GUI.StackPanel();
      wrap.isVertical = false;
      wrap.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      wrap.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
      wrap.top = "6px";
      ui.addControl(wrap);
      __emf_container = wrap;

      const leds = [];
      const colors = ["#2ecc71","#a3e048","#f7d038","#ff8f1f","#ff3b30"]; // 1..5
      for (let i=0;i<5;i++){
        const r = new BABYLON.GUI.Rectangle();
        r.width = "28px"; r.height = "12px";
        r.thickness = 0;
        r.color = "transparent";
        r.background = "rgba(255,255,255,0.06)";
        r.paddingLeft = "6px";
        wrap.addControl(r);
        leds.push({rect:r, color:colors[i]});
      }
      __emf_leds = leds;
      return leds;
    }catch(e){ return null; }
  }

  function setEmfLevel(n){
    try{
      makeEmfUI();
      if (!__emf_leds) return;
      for (let i=0;i<__emf_leds.length;i++){
        const on = i < n;
        const it = __emf_leds[i];
        it.rect.background = on ? it.color : "rgba(255,255,255,0.06)";
      }
    }catch(_){}
  }

  // Simple WebAudio beep
  function beep(level){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (beep.__ctx = beep.__ctx || new AC());
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 500 + 120 * (level||1);
      g.gain.setValueAtTime(0.0, now);
      g.gain.linearRampToValueAtTime(0.05, now + 0.01);
      g.gain.linearRampToValueAtTime(0.0, now + 0.09);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.1);
    }catch(_){}
  }
// 1) EMF READER
  
  // 1) EMF READER  (event-driven)
  // EMF now reacts to ghost interactions/events/hunts instead of raw distance.
  // Public API:
  //   Items.EMF.trigger(level, durationSeconds, {position})
  //   document.dispatchEvent(new CustomEvent('ghost:interaction', {detail:{level:2, duration:3, position: new BABYLON.Vector3(0,0,0)}}));
  //   document.dispatchEvent(new CustomEvent('ghost:event',       {detail:{level:3}}));
  //   document.dispatchEvent(new CustomEvent('ghost:hunt:start'));
  //   document.dispatchEvent(new CustomEvent('ghost:hunt:end'));
  const EMF = addItem({
    name: "EMF Reader",
    icon: "emf.png",
    pickupMesh: null,
    ui: null,
    _level: 0,          // smoothed visual level [0..5]
    _target: 0,         // target level after spikes/decay
    _spikeUntil: 0,     // ms timestamp until which target is held
    _lastBeepLevel: 0,
    _huntTimer: null,
    _pos: null,
    onEquip(s){ 
      (async ()=>{
        if (!this.pickupMesh) {
          try { const mdl = await ensureItemModelFor(this, "EMF Reader", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
        }
        if (!this.pickupMesh) this.pickupMesh = planePickup("emf_pickup", this.icon, s);
        attachToCam(this.pickupMesh, s);
        if (!this.ui) this.ui = makeEmfUI(s);
      })();
    }, 
    use(s){ /* tap to poll current level (no-op, render updates in loop) */ },
  });

  // EMF engine functions
  function emfNow(){ try { return (typeof performance!=='undefined'?performance.now():Date.now()); } catch(_){ return Date.now(); } }
  function emfSetLevelImmediate(n){
    n = Math.max(0, Math.min(5, n|0));
    EMF._level = EMF._target = n;
    EMF._spikeUntil = 0;
    setEmfLevel(n);
  }
  function emfSpike(level, duration, pos){
    let n = Math.max(0, Math.min(5, level|0));
    let d = (duration==null ? 3000 : Math.max(200, duration*1000|0));
    // distance falloff if a position is provided
    try {
      if (pos){
        const s = getScene();
        const cam = getCam(s);
        if (cam && cam.position){
          const dist = BABYLON.Vector3.Distance(cam.position, pos);
          if (dist > 12) n = Math.max(0, n-2);
          else if (dist > 6) n = Math.max(0, n-1);
        }
      }
    } catch(_){}
    // raise target and hold for duration
    EMF._target = Math.max(EMF._target, n);
    EMF._spikeUntil = Math.max(EMF._spikeUntil, emfNow() + d);
  }
  function emfSetHunt(on){
    try { if (EMF._huntTimer) { clearInterval(EMF._huntTimer); EMF._huntTimer = null; } } catch(_){}
    if (!on) return;
    EMF._huntTimer = setInterval(function(){
      // random spikes during hunt
      const lvl = 3 + Math.floor(Math.random()*3); // 3..5
      emfSpike(lvl, 1.1);
    }, 900 + Math.floor(Math.random()*700));
  }
  function emfUpdate(dt){
    const now = emfNow();
    if (EMF._spikeUntil > now){
      // hold target
    } else {
      // decay target slowly back to 0
      EMF._target = Math.max(0, EMF._target - dt*1.2); // per second
    }
    // ease current level toward target
    const old = EMF._level;
    EMF._level += (EMF._target - EMF._level) * Math.min(1, dt*5);
    // update integer visual level + beep on rising edges
    const vis = Math.max(0, Math.min(5, Math.round(EMF._level)));
    setEmfLevel(vis);
    if (vis > EMF._lastBeepLevel){
      beep(vis);
      EMF._lastBeepLevel = vis;
    } else if (vis < EMF._lastBeepLevel){
      EMF._lastBeepLevel = vis;
    }
  }

  // Expose EMF API
  (function exposeEMF(){
    if (!window.Items) window.Items = {};
    window.Items.EMF = {
      trigger: function(level, durationSeconds, opts){
        emfSpike(level, durationSeconds, opts && opts.position);
      },
      set: emfSetLevelImmediate,
      hunt: emfSetHunt,
      _state: EMF
    };
  })();

  // Wire global events -> EMF
  (function wireEMFEvents(){
    addEventListener("ghost:interaction", function(e){
      const d = e.detail||{}; emfSpike(d.level!=null?d.level:2, d.duration!=null?d.duration:2.5, d.position);
    });
    addEventListener("ghost:event", function(e){
      const d = e.detail||{}; emfSpike(d.level!=null?d.level:3, d.duration!=null?d.duration:3.0, d.position);
    });
    addEventListener("ghost:hunt:start", function(){ emfSetHunt(true); emfSpike(4, 1.0); });
    addEventListener("ghost:hunt:end",   function(){ emfSetHunt(false); });
  })();
// 2) UV FLASHLIGHT
  const UV = addItem({
    name: "UV Flashlight",
    icon: "uv.png",
    light: null,
    pickupMesh: null,
    onEquip(s){ 
      (async ()=>{
        if (!this.pickupMesh) {
          try { const mdl = await ensureItemModelFor(this, "UV Flashlight", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
        }
        if (!this.pickupMesh) this.pickupMesh = planePickup("uv_pickup", this.icon, s);
        attachToCam(this.pickupMesh, s);
        if (!this.light){
          const cam = getCam(s); if (!cam) return;
          this.light = new BABYLON.SpotLight("uvLight", cam.position, vec3(0,0,1), Math.PI/4, 10, s);
          this.light.parent = cam;
          this.light.diffuse = new BABYLON.Color3(0.7,0.2,1.0);
          this.light.intensity = 0.0; // off by default
          this.light.range = 25;
        }
      })();
    }, 
    use(s){ // toggle
      if (!this.light) return;
      this.light.intensity = this.light.intensity > 0 ? 0.0 : 1.6;
    },
    alt(s){ // momentary flash
      if (!this.light) return;
      this.light.intensity = 2.0;
      setTimeout(()=>{ this.light.intensity = 0.0; }, 250);
    }
  });

  // 3) SPIRIT BOX
  const SpiritBox = addItem({
    name: "Spirit Box",
    icon: "spirit.png",
    pickupMesh: null,
    noise: null,
    onEquip(s){ 
      (async ()=>{
        if (!this.pickupMesh) {
          try { const mdl = await ensureItemModelFor(this, "Spirit Box", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
        }
        if (!this.pickupMesh) this.pickupMesh = planePickup("spirit_pickup", this.icon, s);
        attachToCam(this.pickupMesh, s);
      })();
    }, 
    use(s){ this.playResponse(s); },
    alt(s){ this.toggleNoise(s); },
    toggleNoise(s){
      if (this.noise){ try{ this.noise.stop(); }catch(_){} this.noise=null; return; }
      try{
        const ctx = BABYLON.Engine.audioEngine.audioContext || new (window.AudioContext||window.webkitAudioContext)();
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++){ output[i] = Math.random() * 2 - 1; }
        const whiteNoise = ctx.createBufferSource(); whiteNoise.buffer = noiseBuffer;
        const gain = ctx.createGain(); gain.gain.value = 0.02;
        whiteNoise.connect(gain); gain.connect(ctx.destination); whiteNoise.loop = true; whiteNoise.start(0);
        this.noise = whiteNoise;
      }catch(_){}
    },
    playResponse(s){
      // Look for global 'playSpiritBox' or any BABYLON.Sound registered with "spirit_box_*"
      try{
        if (typeof global.playSpiritBox === "function"){ global.playSpiritBox(); return; }
        const name = "spirit_box_" + Math.floor(Math.random()*5+1);
        new BABYLON.Sound(name, "./assets/audio/spirit/"+name+".mp3", getScene(s), function(){}, { autoplay:true, volume:0.7 });
      }catch(_){}
    }
  });

  // 4) VIDEO CAMERA
  const VideoCam = addItem({
    name: "Video Camera",
    icon: "camera.png",
    pickupMesh: null,
    rec:false,
    rt:null,
    onEquip(s){ 
      (async ()=>{
        if (!this.pickupMesh) {
          try { const mdl = await ensureItemModelFor(this, "Video Camera", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
        }
        if (!this.pickupMesh) this.pickupMesh = planePickup("cam_pickup", "camera.png", s);
        attachToCam(this.pickupMesh, s);
      })();
    }, 
    use(s){ // take photo
      const canvas = (getScene(s) && getScene(s).getEngine && getScene(s).getEngine().getRenderingCanvas && getScene(s).getEngine().getRenderingCanvas()) || document.querySelector("canvas");
      if (!canvas) return;
      BABYLON.Tools.CreateScreenshotUsingRenderTarget(getScene(s).getEngine(), getCam(s), {width:1920,height:1080});
    },
    alt(s){ // toggle recording overlay (fake)
      this.rec = !this.rec;
      try{
        const ui = ensureHud(s);
        if (!this.recRect){
          const r = new BABYLON.GUI.Rectangle(); r.width="120px"; r.height="36px"; r.thickness=0; r.background="#0008";
          r.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
          r.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
          const t = new BABYLON.GUI.TextBlock(); t.color="red"; t.text="● REC"; r.addControl(t);
          ui.addControl(r); this.recRect = r;
        }
        this.recRect.isVisible = this.rec;
      }catch(_){}
    }
  });

  // 5) SPELL BOOK / JOURNAL
  const Book = addItem({
    name: "Journal",
    icon: "notenotebook.png",
    pickupMesh: null,
    panel:null,
    onEquip(s){
      if (!this.pickupMesh) this.pickupMesh = planePickup("book_pickup", this.icon, s);
      attachToCam(this.pickupMesh, s);
      ensureHud(s);
    },
    use(s){
      const ui = ensureHud(s);
      if (!this.panel){
        const p = new BABYLON.GUI.Rectangle(); p.width="60%"; p.height="70%"; p.thickness=2; p.color="#dde"; p.background="#111e";
        const grid = new BABYLON.GUI.Grid();
        grid.addRowDefinition(0.1); grid.addRowDefinition(0.8); grid.addRowDefinition(0.1);
        grid.addColumnDefinition(1.0);
        p.addControl(grid);

        const h = new BABYLON.GUI.TextBlock(); h.text="Journal"; h.color="#fff"; h.fontSize=26; h.textHorizontalAlignment = 2; h.paddingLeft="12px";
        const body = new BABYLON.GUI.InputText(); body.text="Notes..."; body.color="#fff"; body.background="#0000"; body.height = "100%"; body.width="98%"; body.paddingLeft="12px"; body.autoStretchWidth=false; body.textWrapping=true; body.top="4px";
        const close = BABYLON.GUI.Button.CreateSimpleButton("close","Close (F)");
        close.thickness=1; close.color="#fff"; close.width="120px"; close.height="32px"; close.onPointerUpObservable.add(()=>{ p.isVisible=false; });

        grid.addControl(h,0,0); grid.addControl(body,1,0); grid.addControl(close,2,0);
        ui.addControl(p); p.isVisible=false; this.panel=p; this.body=body;
      }
      this.panel.isVisible = !this.panel.isVisible;
    }
  });

  
  // Plain FLASHLIGHT (white)
  const Flashlight = addItem({
    name: "Flashlight",
    icon: "flashlight.png",
    pickupMesh: null,
    light: null,
    onEquip: async function(s){
      if (!this.pickupMesh){
        try { const mdl = await ensureItemModelFor(this, "Flashlight", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
      }
      if (!this.pickupMesh) this.pickupMesh = planePickup("flash_pickup", this.icon, s);
      attachToCam(this.pickupMesh, s);
      if (!this.light){
        const cam = getCam(s); if (!cam) return;
        this.light = new BABYLON.SpotLight("whiteLight", cam.position, vec3(0,0,1), Math.PI/4, 10, s);
        this.light.parent = cam;
        this.light.diffuse = new BABYLON.Color3(1,1,1);
        this.light.intensity = 0.0;
        this.light.range = 30;
      }
    },
    use(){ if (!this.light) return; this.light.intensity = this.light.intensity>0?0:1.8; },
    alt(){ if (!this.light) return; this.light.intensity = 2.4; setTimeout(()=>{ this.light.intensity = 0; }, 250); }
  });

  // THERMOMETER (visual only)
  const Thermometer = addItem({
    name: "Thermometer",
    icon: "thermo.png",
    pickupMesh: null,
    onEquip: async function(s){
      if (!this.pickupMesh){
        try { const mdl = await ensureItemModelFor(this, "Thermometer", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
      }
      if (!this.pickupMesh) this.pickupMesh = planePickup("thermo_pickup", this.icon, s);
      attachToCam(this.pickupMesh, s);
    },
    use(){ /* hook to temp system */ }
  });

  // THERMAL CAMERA
  const ThermalCam = addItem({
    name: "Thermal Camera",
    icon: "thermal.png",
    pickupMesh: null,
    onEquip: async function(s){
      if (!this.pickupMesh){
        try { const mdl = await ensureItemModelFor(this, "Thermal Camera", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
      }
      if (!this.pickupMesh) this.pickupMesh = planePickup("thermal_pickup", this.icon, s);
      attachToCam(this.pickupMesh, s);
    },
    use(){ /* TODO */ }
  });

  // VOICE RECORDER
  const VoiceRecorder = addItem({
    name: "Voice Recorder",
    icon: "recorder.png",
    pickupMesh: null,
    onEquip: async function(s){
      if (!this.pickupMesh){
        try { const mdl = await ensureItemModelFor(this, "Voice Recorder", s); if (mdl) this.pickupMesh = mdl; } catch(_){}
      }
      if (!this.pickupMesh) this.pickupMesh = planePickup("recorder_pickup", this.icon, s);
      attachToCam(this.pickupMesh, s);
    },
    use(){ /* TODO */ }
  });

// ---------------- Public API ----------------
  Items.init = function(s){
    s = getScene(s); if (!s) { console.warn("Items.init: no scene yet"); return; }
    ensureHud(s);
    // EMF updates every frame
    try {
      s.onBeforeRenderObservable.add(function(){
        var eng=(s.getEngine&&s.getEngine())||window.ENGINE;
        var dt=((eng&&eng.getDeltaTime)?eng.getDeltaTime():16.7)/1000;
        emfUpdate(dt);
      });
    } catch(_) {}

    // world pickups (optional): drop them near spawn/camera
    try{
      const cam = getCam(s);
      const start = cam && cam.position ? cam.position.clone() : vec3(0,1,0);
      [Book, EMF, UV, SpiritBox, VideoCam, Flashlight, Thermometer, ThermalCam, VoiceRecorder].forEach((it, i)=>{
        if (!it.pickupMesh){
          it.pickupMesh = planePickup("pickup_"+i, it.icon, s);
        }
        it.pickupMesh.setParent(null);
        it.pickupMesh.position = start.add(vec3(i*0.8-1.6, -0.2, 2.0));
        it.pickupMesh.actionManager = new BABYLON.ActionManager(s);
        it.pickupMesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, ()=>{
          equip(i, s);
        }));
      });
    }catch(_){}

    // hotkeys
    addEventListener("keydown", (e)=>{
      if (e.repeat) return;
      const k=e.key||""; if (k>="1" && k<="5"){ equip(parseInt(k)-1, s); }
      if (k==="f" || e.keyCode===70) { useEquipped(s); }
      if (k==="r" || e.keyCode===82) { altEquipped(s); }
    }, {passive:true});
  };

  Items.setAssetBase = function(path){ ASSET_BASE = path.endsWith("/") ? path : (path+"/"); };
  Items.inventory = inventory;
  Items.equip = equip;
  Items.use = useEquipped;
  Items.alt  = altEquipped;

  // Expose
  global.Items = Items;
})(window);
