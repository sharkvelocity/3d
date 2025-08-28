// ./assets/index3/main.js
// Scene bootstrapping, camera/lights, render loop, belt UI, and safeStart().

(function () {
  "use strict";

  // Babylon globals expected everywhere
  window.engine = null;
  window.scene  = null;
  window.camera = null;

  // player-held lights toggled by input (ui_input.js)
  window.flashLight = null;
  window.uvLight    = null;
  window.irLight    = null;

  // belt
  window.activeItemSlot = 1;

  // ---------- scene creation ----------
  function createScene(canvas) {
    const eng = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
    const sc  = new BABYLON.Scene(eng);
    sc.collisionsEnabled = true;
    sc.gravity = new BABYLON.Vector3(0, -0.5, 0);

    // camera
    const cam = new BABYLON.FreeCamera("PlayerCam", new BABYLON.Vector3(44, 1.7, -119), sc);
    cam.attachControl(canvas, true);
    cam.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
    cam.applyGravity = true;
    cam.checkCollisions = true;
    cam.keysUp = cam.keysDown = cam.keysLeft = cam.keysRight = []; // movement driven by our code
    cam.minZ = 0.1;
    sc.activeCamera = cam;

    // basic ambient
    const hemi = new BABYLON.HemisphericLight("hemilight", new BABYLON.Vector3(0.2, 1, 0.1), sc);
    hemi.intensity = 0.4;

    // handheld lights attached to camera
    const fwd = new BABYLON.Vector3(0, 0, 1);
    const fl = new BABYLON.SpotLight("flash", cam.position, fwd, Math.PI / 3.2, 14, sc);
    fl.intensity = 0; // off by default
    fl.parent = cam;
    fl.diffuse = new BABYLON.Color3(1.0, 0.98, 0.9);

    const uv = new BABYLON.SpotLight("uv", cam.position, fwd, Math.PI / 3.0, 12, sc);
    uv.intensity = 0;
    uv.parent = cam;
    uv.diffuse = new BABYLON.Color3(0.4, 0.8, 1.0);

    const ir = new BABYLON.SpotLight("ir", cam.position, fwd, Math.PI / 3.0, 12, sc);
    ir.intensity = 0;
    ir.parent = cam;
    ir.diffuse = new BABYLON.Color3(0.8, 0.95, 1.0);

    // store
    window.engine = eng;
    window.scene  = sc;
    window.camera = cam;
    window.flashLight = fl;
    window.uvLight = uv;
    window.irLight = ir;

    // Temporary ground to prevent falling before the map loads.
    // We'll dispose this right after loadMap() completes.
    const ground = BABYLON.MeshBuilder.CreateGround("tmp_ground", { width: 400, height: 400, subdivisions: 2 }, sc);
    ground.checkCollisions = true;
    ground.position.y = -0.05; // sit slightly below to reduce visual clipping while loading
    const gm = new BABYLON.StandardMaterial("tmp_ground_mat", sc);
    gm.diffuseColor = new BABYLON.Color3(0.05, 0.08, 0.08);
    ground.material = gm;
    // Keep a handle so we can nuke it later
    window.tmpGround = ground;

    // ghost placeholder object remains for compatibility; real model is managed by GhostAPI
    window.ghost = window.ghost || { type: window.currentGhostKey || 'Spirit', position: new BABYLON.Vector3(43, 0.1, -130), speed: 1.2 };
    Object.defineProperty(window.ghost, 'position', {
      get(){ return this._pos || (this._pos = new BABYLON.Vector3(43,0.1,-130)); },
      set(v){ this._pos = v; }
    });

    return sc;
  }

  // ---------- belt UI ----------
  function slotLabel(n) { return String(n); }

  function slotIcon(itemName) {
    // minimal text fallback; swap to <img> icons when ready
    const span = document.createElement('span');
    span.textContent = itemName ? itemName.replace(/ .*/, '') : '—';
    span.style.fontSize = '11px';
    span.style.color = '#9ff';
    return span;
  }

  window.rebuildBelt = function rebuildBelt() {
    const host = $('#belt'); if (!host) return;
    host.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === window.activeItemSlot ? ' active' : '');
      const key = document.createElement('div');
      key.className = 'key';
      key.textContent = slotLabel(i);

      const item = inventory.slots[i];
      const inner = document.createElement('div');
      inner.style.display = 'flex';
      inner.style.flexDirection = 'column';
      inner.style.alignItems = 'center';
      inner.style.gap = '2px';

      inner.appendChild(slotIcon(item || ''));

      // charges
      const ch = inventory.slotCharges[i];
      if (isFinite(ch)) {
        const c = document.createElement('div');
        c.style.fontSize = '11px';
        c.style.color = '#cff';
        c.textContent = String(ch);
        inner.appendChild(c);
      }

      slot.appendChild(key);
      slot.appendChild(inner);
      slot.onclick = () => selectSlot(i);
      host.appendChild(slot);
    }
  };

  window.selectSlot = function selectSlot(n) {
    window.activeItemSlot = n;
    rebuildBelt();

    // notify item scripts (Storage bridge handles if available)
    const item = inventory.slots[n];
    if (item && window.ItemRegistry && typeof window.ItemRegistry.onEquip === 'function') {
      window.ItemRegistry.onEquip(item, n);
    }
  };

  // ---------- game loop ----------
  function startLoops() {
    let last = performance.now();

    engine.runRenderLoop(() => {
      if (!scene || scene.isDisposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      try {
        if (typeof handleMovement === 'function') handleMovement(dt);
        if (typeof updatePlayerFootsteps === 'function') updatePlayerFootsteps(dt);
        if (typeof updateGhost === 'function') updateGhost(dt); // idle-bob for visible ghosts
      } catch (e) { /* ignore */ }

      scene.render();
    });

    window.addEventListener('resize', () => engine?.resize());
  }

  // ---------- UI gates ----------
  function hideTitle() { const t = $('#title-screen'); if (t) t.style.display = 'none'; }
  function showHUD() { const h = $('#hud'); if (h) h.style.display = 'flex'; }

  function showLoading(on, pct = 0, msg = 'initializing…') {
    const o = $('#loading-overlay'); const bar = $('#loading-bar'); const tx = $('#loading-text'); const ti = $('#loading-title');
    if (!o) return;
    o.style.display = on ? 'flex' : 'none';
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (tx)  tx.textContent = `${Math.round(pct)}%`;
    if (ti)  ti.textContent = msg;
  }
  window.showLoading = showLoading; // allow loaders to pipe progress

  // ---------- public safeStart (used by the Start button & ui_input.js) ----------
  let _started = false;
  window.safeStart = async function safeStart() {
    if (_started) return;
    _started = true;

    showLoading(true, 8, 'creating scene');
    const canvas = $('#renderCanvas');
    if (!canvas) throw new Error('No #renderCanvas');

    createScene(canvas);

    // Load the house GLB via map.js, then apply shadow flags
    showLoading(true, 12, 'loading house');
    try {
      if (typeof loadMap === 'function') {
        await loadMap();                 // from map.js:contentReference[oaicite:2]{index=2}
        showLoading(true, 72, 'finalizing scene');
        if (typeof afterMapLoadedForShadows === 'function') afterMapLoadedForShadows();

        // Remove the temporary visible ground so it doesn't block movement
        if (window.tmpGround && !window.tmpGround.isDisposed()) {
          try {
            window.tmpGround.checkCollisions = false;
            window.tmpGround.isVisible = false;
            window.tmpGround.dispose();
          } catch {}
          window.tmpGround = null;
        }
      } else {
        console.warn('loadMap() was not found. Did map.js load?');
      }
    } catch (e) {
      console.error('Map failed', e);
    }

    // Load the real ghost (invisible by default; GhostAPI manages visibility)
    try {
      if (window.GhostAPI && typeof window.GhostAPI.loadGhost === 'function') {
        await window.GhostAPI.loadGhost(window.currentGhostKey || 'Spirit');
        // showLoading(true, 94, 'ghost ready'); // ghost.js may also update this
      }
    } catch (e) {
      console.error('Ghost load failed', e);
    }

    // basic belt draw
    rebuildBelt();
    selectSlot(1);

    // allow devtools to find things
    setTimeout(() => { const btn = $('#devtools-toggle'); if (btn) btn.style.display = 'block'; }, 50);

    // quick progress finish + HUD reveal
    let pct = 72;
    const id = setInterval(() => {
      pct = Math.min(100, pct + 7);
      showLoading(true, pct);
      if (pct >= 100) {
        clearInterval(id);
        showLoading(false);
        showHUD();
      }
    }, 80);

    hideTitle();
    startLoops();
  };

  // If someone presses Enter on the title screen, start
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('#title-screen')?.style.display !== 'none') safeStart();
  });

  // Initialize UI bindings immediately (initUI is defined in ui_input.js)
  if (typeof initUI === 'function') {
    try { initUI(); } catch (e) { /* ignore */ }
  } else {
    // If ui_input.js binds later, no harm.
    document.addEventListener('DOMContentLoaded', () => { try { initUI?.(); } catch {} });
  }

})();
