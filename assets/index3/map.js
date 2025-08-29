// ./assets/index3/map.js — v2.1
// Loads the Jailhouse map (jailhouse.glb) and applies basic ground tagging.
// Progress UI hooks the #loading-overlay bar if present.
// If window.MAP_URL is set before this file loads, it will use that URL instead.

(function(){
  "use strict";
  if (window.MapLoader && window.MapLoader.__v === "2.1") return;

  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;

  const UI = {
    overlay: null, bar:null, txt:null, title:null,
    ensure(){
      if (this.overlay) return;
      this.overlay = document.getElementById('loading-overlay');
      this.bar     = document.getElementById('loading-bar');
      this.txt     = document.getElementById('loading-text');
      this.title   = document.getElementById('loading-title');
    },
    show(on){
      this.ensure();
      if (!this.overlay) return;
      this.overlay.style.display = on ? 'flex' : 'none';
    },
    setTitle(t){
      this.ensure(); if (this.title) this.title.textContent = t;
    },
    setProgress(ratio){
      this.ensure();
      const r = Math.max(0, Math.min(1, ratio||0));
      if (this.bar) this.bar.style.width = (r*100).toFixed(0) + '%';
      if (this.txt) this.txt.textContent = (r*100).toFixed(0) + '%';
    }
  };

  const ST = { __v:"2.1", url:null, loaded:false };

  function tryPaths(paths, idx=0){
    const s = SCENE();
    if (!s){ setTimeout(()=> tryPaths(paths, idx), 150); return; }
    if (idx >= paths.length){
      console.warn('[map] failed to load any candidate', paths);
      UI.show(false);
      return;
    }
    const url = paths[idx];
    ST.url = url;
    UI.setTitle('loading map…');
    UI.show(true);
    UI.setProgress(0);

    // Use Append with full relative path
    BABYLON.SceneLoader.Append('', url, s,
      ()=> onSuccess(s, url),
      (evt)=> onProgress(evt),
      (_scene, msg, ex)=>{
        console.warn('[map] load failed', url, msg || ex);
        // try next candidate
        tryPaths(paths, idx+1);
      }
    );
  }

  function onProgress(evt){
    if (!evt) return;
    if (evt.lengthComputable){
      const r = evt.loaded / (evt.total || evt.loaded || 1);
      UI.setProgress(r);
    } else {
      // heuristics
      const cur = parseFloat((UI.txt?.textContent||'0').replace('%',''))/100 || 0;
      UI.setProgress(Math.min(0.98, cur + 0.02));
    }
  }

  function onSuccess(scene, url){
    ST.loaded = true;
    UI.setProgress(1);
    setTimeout(()=> UI.show(false), 200);
    window.CURRENT_MAP_NAME = 'jailhouse.glb';
    window.CURRENT_MAP_URL  = url;

    // Make things pickable by default, preserve explicit false
    scene.meshes.forEach(m=>{
      try {
        if (m.isPickable === undefined) m.isPickable = true;
      } catch {}
    });

    // Basic ground tagging now, plus integration with registerGroundRoots later
    applyGroundTags(scene);

    // Notify hooks
    try { window.onMapLoaded && window.onMapLoaded(url); } catch {}
  }

  function applyGroundTags(scene){
    const likely = [/floor/i, /ground/i, /hall/i, /cell/i, /yard/i, /concrete/i, /^Floor/i, /^Ground/i];
    const tagMesh = (mesh)=>{
      try{
        mesh.metadata = mesh.metadata || {};
        mesh.metadata.isGround = true;
        if (mesh.isPickable !== false) mesh.isPickable = true;
      }catch{}
    };
    scene.meshes.forEach(m=>{
      if (!m || !m.name) return;
      if (likely.some(re=> re.test(m.name))) {
        tagMesh(m);
        m.getChildMeshes?.().forEach(tagMesh);
      }
    });

    // If the ghost_movement registerGroundRoots is available later, call it too
    const callReg = ()=>{
      if (typeof window.registerGroundRoots === 'function'){
        window.registerGroundRoots([/floor/i, /ground/i, /hall/i, /cell/i, /yard/i, /concrete/i]);
        return true;
      }
      return false;
    };
    if (!callReg()){
      let tries=0;
      const id=setInterval(()=>{ tries++; if (callReg() || tries>40) clearInterval(id); }, 250);
    }
  }

  function loadJailhouse(){
    const candidates = [];
    if (window.MAP_URL) candidates.push(window.MAP_URL);
    // common locations
    candidates.push(
      './assets/models/maps/jailhouse.glb',
      './assets/models/jailhouse.glb',
      './jailhouse.glb'
    );
    tryPaths(candidates);
  }

  window.MapLoader = { __v:"2.1", loadJailhouse };

  // Auto-load when scene exists
  const boot = setInterval(()=>{
    try{
      if (SCENE()){
        clearInterval(boot);
        loadJailhouse();
      }
    }catch{}
  }, 150);
})();
