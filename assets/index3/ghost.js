// ./assets/index3/ghost.js
// Real ghost loader + minimal control surface (visibility, position, simple update)

(function () {
  "use strict";

  // === Config ===============================================================
  // Point these at your real models. You can add more and map by type below.
  const GHOST_MODELS = [
    { key: "ghost1", file: "ghost1.glb" },
    { key: "ghost2", file: "ghost2.glb" },
    { key: "ghost3", file: "ghost3.glb" },
  ];

  const MODEL_DIR = "./assets/models/ghosts/"; // adjust if needed

  // Map ghost "type" -> preferred model key (fallback to random)
  function chooseModelKeyFor(type) {
    // You can customize assignments here per ghost type
    // e.g., if (type === "Revenant") return "ghost2";
    return null; // null -> random from GHOST_MODELS
  }

  // === State ================================================================
  const state = {
    type: null,
    root: null,        // TransformNode (parent)
    meshes: [],        // Loaded meshes
    loaded: false,
    visible: false,
    speed: 1.2,
  };

  // Expose a shared ghost object on window for other systems to inspect
  window.ghost = window.ghost || state;

  function setVisible(on) {
    state.visible = !!on;
    state.meshes.forEach(m => { m.isVisible = !!on; });
  }

  function setPosition(vec3) {
    if (!state.root) return;
    state.root.position.copyFrom(vec3);
  }

  function getPosition() {
    if (!state.root) return BABYLON.Vector3.Zero();
    return state.root.position.clone();
  }

  // Simple idle “float” so you can tell it exists when visible
  let t = 0;
  function updateGhost(dt) {
    if (!state.root || !state.visible) return;
    t += dt;
    state.root.position.y += Math.sin(t * 1.5) * 0.002; // subtle bob
  }
  window.updateGhost = updateGhost;

  // === Loading ==============================================================
  async function _importModel(filename, onProgress) {
    const res = await BABYLON.SceneLoader.ImportMeshAsync(
      "", MODEL_DIR, filename, scene,
      onProgress
    );
    return res;
  }

  function pickModelFile(type) {
    const pref = chooseModelKeyFor(type);
    if (pref) {
      const m = GHOST_MODELS.find(x => x.key === pref);
      if (m) return m.file;
    }
    // otherwise random
    const i = Math.floor(Math.random() * GHOST_MODELS.length);
    return GHOST_MODELS[Math.max(0, Math.min(i, GHOST_MODELS.length - 1))].file;
  }

  // Optional progress hook into your loading overlay
  function pipeProgressToOverlay(evt) {
    if (!evt || !evt.lengthComputable) return;
    const pct = Math.min(100, Math.max(0, (evt.loaded / evt.total) * 20 + 72)); // 72–92% range
    if (typeof window.showLoading === "function") {
      window.showLoading(true, pct, "loading ghost");
    }
  }

  async function loadGhost(typeIn) {
    if (!window.scene) throw new Error("Scene not ready");
    const type = typeIn || window.currentGhostKey || "Spirit";
    state.type = type;

    // clear previous
    if (state.root) { try { state.root.dispose(); } catch {} }
    state.root = new BABYLON.TransformNode("GhostRoot", scene);
    state.meshes = [];
    state.loaded = false;

    const file = pickModelFile(type);
    try {
      const result = await _importModel(file, pipeProgressToOverlay);
      result.meshes.forEach(m => {
        if (!m || !m.getClassName) return;
        if (m.getClassName() === "AbstractMesh") {
          // Ghost visuals & physics expectations
          m.checkCollisions = false;    // ghosts pass through
          m.isPickable = false;
          m.parent = state.root;
          state.meshes.push(m);

          // Slightly ethereal look (non-destructive if PBR exists)
          try {
            if (!m.material) {
              const mat = new BABYLON.StandardMaterial(`${m.name}_ghostMat`, scene);
              mat.emissiveColor = new BABYLON.Color3(0.85, 0.95, 1.0);
              mat.alpha = 0.18;
              m.material = mat;
            } else if ("alpha" in m.material) {
              m.material.alpha = Math.min(m.material.alpha ?? 1.0, 0.5);
            }
          } catch {}
        }
      });

      // Default pose/position—put it near the typical house origin
      state.root.position.copyFrom(new BABYLON.Vector3(43, 0.1, -130));
      setVisible(false);    // universal rule: invisible by default

      state.loaded = true;
      if (typeof window.showLoading === "function") {
        window.showLoading(true, 94, "ghost ready");
      }
      return state;
    } catch (err) {
      console.error("[ghost] failed to load model", file, err);
      // Safe fallback: invisible sphere (keeps systems alive)
      const fallback = BABYLON.MeshBuilder.CreateSphere("ghost_fallback", { diameter: 0.6 }, scene);
      fallback.parent = state.root;
      fallback.isVisible = false;
      state.meshes = [fallback];
      state.loaded = true;
      return state;
    }
  }

  // Visibility API (events/hunts can call these)
  window.GhostAPI = {
    loadGhost,
    setVisible,
    setPosition,
    getPosition,
    state,
  };

})();
