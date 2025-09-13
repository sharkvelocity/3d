// assets/dev/util/pp_runtime.js
// Runtime bootstrap: engine + scene + loader UI + resize + globals.
// NO cameras, NO spawn, NO movement here. Those are owned by player_rig_controller_final.js.

(function () {
  "use strict";
  if (window.__PP_RUNTIME__) return;
  window.__PP_RUNTIME__ = true;

  // Namespace
  const PP = (window.PP = window.PP || {});
  PP.runtime = PP.runtime || {};

  // ---------- DOM ----------
  const canvas = () =>
    document.getElementById("renderCanvas") || document.querySelector("canvas");
  const $ = (id) => document.getElementById(id);

  // Loader UI handles (optional)
  const ui = {
    box: $("loading-box"),
    text: $("loading-text"),
    bar: $("loading-bar"),
    fill: $("loading-fill"),
  };

  function showLoading(msg) {
    if (!ui.box) return;
    ui.box.style.display = "flex";
    if (ui.text && msg) ui.text.textContent = String(msg);
    setProgress(0);
  }
  function hideLoading() {
    if (!ui.box) return;
    ui.box.style.display = "none";
  }
  function setProgress(p01) {
    const p = Math.max(0, Math.min(1, Number(p01) || 0));
    if (ui.fill) ui.fill.style.width = (p * 100).toFixed(1) + "%";
  }

  // ---------- Babylon globals ----------
  function exposeGlobals(engine, scene) {
    try {
      window.ENGINE = engine;
      window.SCENE = scene;
      // camera is set by player_rig_controller_final.js; don't touch it here
    } catch {}
  }
  function S() {
    return (
      window.SCENE ||
      BABYLON.EngineStore?.LastCreatedScene ||
      BABYLON.Engine?.LastCreatedScene ||
      null
    );
  }
  PP.runtime.S = S;

  // ---------- Engine + Scene ----------
  async function createEngineAndScene() {
    const cvs = canvas();
    if (!cvs) {
      throw new Error("[pp_runtime] #renderCanvas not found");
    }

    const engine = new BABYLON.Engine(cvs, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      doNotHandleContextLost: false,
      powerPreference: "high-performance",
    });

    const scene = new BABYLON.Scene(engine);

    // World defaults (safe; no camera/spawn)
    scene.useRightHandedSystem = false; // keep Babylon default (left-handed)
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -0.98, 0);

    // Optional environment (no camera):
    // You can remove this if your map provides its own env.
    try {
      scene.createDefaultEnvironment({
        createGround: false,
        createSkybox: false,
      });
    } catch {}

    // Resize
    window.addEventListener("resize", () => {
      try {
        engine.resize();
      } catch {}
    });

    exposeGlobals(engine, scene);

    // A lightweight render loop. Active camera is owned elsewhere.
    engine.runRenderLoop(() => {
      try {
        scene.render();
      } catch {}
    });

    // Let other modules know a scene exists (weather/inventory may listen).
    window.dispatchEvent(new CustomEvent("pp:scene-ready", { detail: { scene } }));

    return { engine, scene };
  }

  // ---------- Asset loading helpers ----------
  // Map config is expected in PP.CONFIG.MAPS (external). We only provide a loader shell.
  async function loadMapByDef(def) {
    const scene = S();
    if (!scene || !def) throw new Error("[pp_runtime] no scene or map def");

    // Accept either a .glb/.gltf file path or a pair {rootUrl, file}
    const isPair = def.rootUrl && def.file;
    const rootUrl = isPair ? def.rootUrl : (def.path ? def.path.replace(/[^/]+$/, "") : "");
    const file = isPair ? def.file : (def.path ? def.path.split("/").pop() : null);

    if (!file) {
      console.warn("[pp_runtime] Map def missing 'file/path'", def);
      return;
    }

    showLoading(`Loading map: ${def.name || file}`);

    // Hook Babylon's default loading observable into our UI
    let lastRatio = 0;
    const obs = scene.onDataLoadedObservable.add(() => {
      // No-op here; SceneLoader exposes progress below.
    });

    // Use SceneLoader.Append/ImportMesh — map should be authored to include its own lights/colliders, etc.
    await BABYLON.SceneLoader.AppendAsync(rootUrl, file, scene, (evt) => {
      // Progress
      if (evt.lengthComputable) {
        const r = evt.loaded / Math.max(1, evt.total);
        lastRatio = r;
        setProgress(0.1 + r * 0.85); // keep a bit of headroom
      } else {
        // Fallback to a soft ramp
        lastRatio = Math.min(1, lastRatio + 0.02);
        setProgress(0.1 + lastRatio * 0.85);
      }
    });

    // Let other systems post-process (navmesh bake, tags, etc.)
    window.dispatchEvent(new CustomEvent("pp:map:loaded", { detail: { def, scene } }));

    // Finish loader
    setProgress(1);
    setTimeout(hideLoading, 100);

    // Defer a tick to be safe for systems that need meshes ready
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("pp:map:ready", { detail: { def, scene } }));
    }, 0);
  }

  // Load map by id key from PP.CONFIG.MAPS
  async function loadMapById(id) {
    const def = PP?.CONFIG?.MAPS?.[id];
    if (!def) {
      console.warn("[pp_runtime] map id not found:", id);
      return;
    }
    return loadMapByDef(def);
  }

  // ---------- Public API ----------
  PP.runtime.init = async function initRuntime() {
    // Only build engine/scene once
    if (S()) return S();
    await createEngineAndScene();
    return S();
  };

  PP.runtime.loadMap = async function loadMap(idOrDef) {
    const scene = await PP.runtime.init();
    const def = typeof idOrDef === "string" ? (PP?.CONFIG?.MAPS?.[idOrDef] || null) : idOrDef;
    if (!def) {
      console.warn("[pp_runtime] loadMap: missing/unknown id", idOrDef);
      return;
    }
    return loadMapByDef(def);
  };

  PP.runtime.setLoadingMessage = function (msg) {
    showLoading(msg || "Loading…");
  };
  PP.runtime.setLoadingProgress = setProgress;
  PP.runtime.hideLoading = hideLoading;

  // When the game “Start” happens (index wires pp:start),
  // we make sure engine/scene exist — cameras/spawn handled elsewhere.
  window.addEventListener("pp:start", () => {
    PP.runtime.init().catch((e) => console.error(e));
  });

  // Optional: auto-init the scene early so modules (weather/inventory) that poll for SCENE will find it.
  // Comment this out if you want to delay until pp:start.
  (function eagerInit() {
    // If you prefer lazy, delete this IIFE.
    PP.runtime
      .init()
      .then(() => {
        // Scene ready; do nothing else here.
      })
      .catch(() => {});
  })();
})();
