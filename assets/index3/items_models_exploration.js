// ./assets/index3/items_models_exploration.js — v1.0
// Scans exploration_objects.glb and links the found meshes to your item keys,
// with helpers to spawn/equip and (optionally) attach VideoFeed to "screen" meshes.

(function(){
  "use strict";
  if (window.ItemModels && window.ItemModels.__v === "1.0") return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA= ()=> window.camera || SCENE()?.activeCamera;
  const v3    = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  const PATH  = "./assets/models/items/";
  const FILE  = "exploration_objects.glb";

  // Map your item keys → group name + mesh names (and optional screen)
  // These names are from the GLB you uploaded.
  const ITEM_MODEL_LINKS = {
    thermometer:     { group:"Thermometer",     meshes:["Thermometer_Thermometer_0"] },
    emf:             { group:"EMF_Detector",    meshes:["EMF_Detector_EMF_Detector_0"] },
    spirit_box:      { group:"Cone.001",        meshes:["Cone.001_Spirit_Box_0"] },
    photo_camera:    { group:"Photo_Camera",    meshes:["Photo_Camera_Photo_Camera_0"], screen:"Photo_Camera_Pantalla_0" },
    thermal_camera:  { group:"Thermal_Camera",  meshes:["Thermal_Camera_Thermal_Camera_0"], screen:"Thermal_Camera_Pantalla_0" },
    voice_recorder:  { group:"Voice_Recorder",  meshes:["Voice_Recorder_Voice_Recorder_0"] },
    flashlight:      { group:"Flashlight",      meshes:["Flashlight_Flashlight_0"] },
    flashlight_pocket:{group:"Flashlight_Poquet", meshes:["Flashlight_Poquet_Flashlight_Poquet_0"] },
  };

  const ST = {
    loaded:false,
    // for each item key, we keep references to the *source* meshes to instance from
    sources: {},   // key -> { groupNode, meshes: AbstractMesh[], screenMesh?: AbstractMesh }
  };

  async function loadOnce(){
    if (ST.loaded) return true;

    const s = SCENE(); if (!s) return false;

    // Import the GLB
    try{
      await BABYLON.SceneLoader.ImportMeshAsync(null, PATH, FILE, s);
    }catch(err){
      console.error("[ItemModels] Could not import", PATH+FILE, err);
      return false;
    }

    // Build the sources per key
    Object.entries(ITEM_MODEL_LINKS).forEach(([key, def])=>{
      const groupNode = s.getNodeByName(def.group) || s.getTransformNodeByName?.(def.group) || s.getMeshByName(def.group);
      const meshRefs = [];
      def.meshes.forEach(nm=>{
        const m = s.getMeshByName(nm);
        if (m) meshRefs.push(m);
      });
      let screenRef = null;
      if (def.screen){
        screenRef = s.getMeshByName(def.screen) || null;
      }
      // Hide *source* meshes
      meshRefs.forEach(m=>{
        try{
          m.setEnabled(false);
          m.isPickable = false;
          m.visibility = 0;
        }catch{}
      });
      if (screenRef){
        try{
          screenRef.setEnabled(false);
          screenRef.isPickable = false;
          screenRef.visibility = 0;
        }catch{}
      }
      ST.sources[key] = { groupNode, meshes: meshRefs, screen: screenRef };
    });

    ST.loaded = true;
    console.log("[ItemModels] linked items:", Object.keys(ST.sources));
    return true;
  }

  // Create a TransformNode and instance each mesh under it
  function instanceItem(key, opts={}){
    const s = SCENE(); if (!s) return null;
    const src = ST.sources[key];
    if (!src || !src.meshes.length) {
      console.warn("[ItemModels] No source for", key);
      return null;
    }
    const root = new BABYLON.TransformNode(`Item_${key}_${Date.now().toString(36)}`, s);

    // instantiate meshes
    const instances = src.meshes.map(m=>{
      const inst = m.createInstance(`${m.name}_inst_${(Math.random()*1e6|0)}`);
      inst.parent = root;
      inst.isPickable = true;
      inst.alwaysSelectAsActiveMesh = true;
      // give each instance its own material (so we can tint/screens etc)
      try {
        // clone material if present; else Standard
        const mat = m.material ? m.material.clone(`${m.material.name}_for_${inst.name}`) : new BABYLON.StandardMaterial(`Mat_${inst.name}`, s);
        inst.material = mat;
      } catch {}
      return inst;
    });

    // optional screen instance
    let screenInst = null;
    if (src.screen){
      screenInst = src.screen.createInstance(`${src.screen.name}_inst_${(Math.random()*1e6|0)}`);
      screenInst.parent = root;
      screenInst.isPickable = false;
      try{
        // screen material: emissive for video feed
        const mat = new BABYLON.StandardMaterial(`ScreenMat_${screenInst.name}`, s);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1,1,1);
        screenInst.material = mat;
      }catch{}
    }

    // place / flags
    const p = opts.position || v3(0, 1.0, 0);
    root.position.copyFrom(p);
    if (opts.rotation) root.rotation = opts.rotation.clone?.() || opts.rotation;
    if (opts.scaling)  root.scaling  = opts.scaling.clone?.()  || opts.scaling;

    // item physics-ish flags
    const wantPick = opts.pickable ?? true;
    const wantToss = opts.tossable ?? true;
    root.metadata = Object.assign({}, root.metadata, {
      itemKey: key, pickable: wantPick, tossable: wantToss
    });
    instances.forEach(inst=> { inst.isPickable = wantPick; });

    // simple bounding-box drop to ground if requested
    if (opts.snapToGround){
      try {
        const bb = root.getHierarchyBoundingVectors();
        const center = bb.min.add(bb.max).scale(0.5);
        const from = new BABYLON.Vector3(center.x, bb.max.y + 3, center.z);
        const ray  = new BABYLON.Ray(from, v3(0,-1,0), 20);
        const hit  = s.pickWithRay(ray, m=> m && m.isPickable !== false);
        if (hit?.hit) root.position.y = hit.pickedPoint.y + 0.02;
      } catch {}
    }

    // optional: attach live VideoFeed if available and this item has a screen
    if (screenInst && opts.attachVideoFeed && window.VideoFeed){
      try {
        VideoFeed.setActive(true);
        const tex = VideoFeed.getTexture();
        if (screenInst.material) {
          screenInst.material.emissiveTexture = tex;
          screenInst.material.emissiveColor   = new BABYLON.Color3(1,1,1);
        }
      } catch(e){ console.warn("[ItemModels] feed attach failed", e); }
    }

    return { root, instances, screen: screenInst };
  }

  // Convenience for "equip" → makes a child of the player camera
  function equipToCamera(key, opts={}){
    const s = SCENE(), cam = CAMERA(); if (!s || !cam) return null;
    const out = instanceItem(key, opts);
    if (!out) return null;
    const x = opts.offset || v3(0.15, -0.08, 0.28);
    out.root.parent = cam;
    out.root.position.set(x.x, x.y, x.z);
    out.root.rotation.set(0,0,0);
    out.root.scaling.set(1,1,1);
    // optional screen feed
    if (out.screen && opts.attachVideoFeed && window.VideoFeed){
      try { VideoFeed.setActive(true); } catch {}
    }
    return out;
  }

  // Public API
  window.ItemModels = {
    __v:"1.0",
    load: loadOnce,
    links: ITEM_MODEL_LINKS,
    has: (key)=> !!ST.sources[key],
    getSourceNames: ()=> Object.fromEntries(Object.entries(ST.sources).map(([k,v])=>[k, { group:v.groupNode?.name||null, meshes:v.meshes.map(m=>m.name), screen:v.screen?.name || null }])),
    instance: (key, opts)=> instanceItem(key, opts),
    equipToCamera: (key, opts)=> equipToCamera(key, opts),
  };

  // lazy boot after scene is ready
  const boot = setInterval(()=>{
    try{
      if (SCENE()){
        clearInterval(boot);
        // don’t auto-import; caller will call ItemModels.load() after map loads
      }
    }catch{}
  },120);
})();
