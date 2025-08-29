// ./assets/index3/map.js — v2.2
// Robust loader + mapping hooks for Abandoned House.
// Works with Dev Tools v7.4 (Lights+, Rooms, Creator).

/* globals BABYLON, scene, camera */

(function () {
  "use strict";

  // Globals the rest of your code/devtools expect
  window.houseRoot   = window.houseRoot   || null;
  window.doorMeshes  = window.doorMeshes  || [];
  window.mapMeshes   = window.mapMeshes   || [];   // track what we loaded to enable reload
  window.MAP_URL     = window.MAP_URL     || "./assets/models/map/Abandoned_House.glb";

  // ---------- tiny helpers ----------
  const log = (...a) => console.log("[map]", ...a);
  const warn= (...a) => console.warn("[map]", ...a);
  const xyz  = (v)=>({x:+v.x.toFixed(6), y:+v.y.toFixed(6), z:+v.z.toFixed(6)});
  const showLoading = (on, pct=0, txt="")=>{
    try {
      if (typeof window.showLoading === "function") window.showLoading(on, pct, txt);
    } catch {}
  };

  // Pick a ground height at (x,z). If the project already defines it, keep theirs.
  window.pickGroundHeightAt ||= function pickGroundHeightAt(x, z) {
    const origin = new BABYLON.Vector3(x, 50, z);
    const ray    = new BABYLON.Ray(origin, new BABYLON.Vector3(0,-1,0), 200);
    const hit    = scene.pickWithRay(ray, m => m && m.isPickable !== false);
    return hit?.hit ? hit.pickedPoint.y : 0;
  };

  function getMapUrl() {
    // Allow devtools to override MAP_URL with a folder+file OR a single path
    const u = String(window.MAP_URL || "").trim() || "./assets/models/map/Abandoned_House.glb";
    return u;
  }

  function disposePreviousMap() {
    if (!window.mapMeshes.length) return;
    window.mapMeshes.forEach(m => { try { m.dispose?.(); } catch{} });
    window.mapMeshes.length = 0;
    window.doorMeshes.length = 0;
    if (window.houseRoot?.dispose) try { window.houseRoot.dispose(); } catch {}
    window.houseRoot = null;
  }

  // Thin/transparent? Disable collisions so you don’t “bump” on decals/glass/trim.
  function shouldDisableCollision(m) {
    try {
      const bb = m.getBoundingInfo?.().boundingBox;
      if (bb) {
        const size = bb.maximum.subtract(bb.minimum);
        const thin = (size.y < 0.12) || (size.x < 0.12) || (size.z < 0.12);
        if (thin) return true;
      }
      const mat = m.material;
      const alpha = (mat && (typeof mat.alpha === "number")) ? mat.alpha : 1;
      if (alpha < 0.9) return true;
    } catch {}
    return false;
  }

  function ensureFallbackGround() {
    if (scene.getMeshByName("fallbackGround")) return;
    const g = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width: 400, height: 400, subdivisions: 1 }, scene);
    g.position.y = 0;
    g.checkCollisions = true;
    g.isPickable = true;
    g.visibility = 0;
  }

  // Shadows: make everyone receive by default so Lights+ works well. No default generator here
  // (Dev Tools builds the rigs), but we expose refreshShadowCasters to rebuild renderLists.
  window.refreshShadowCasters = function refreshShadowCasters() {
    try {
      const casters = scene.meshes.filter(m => m.isVisible !== false && m.getTotalVertices?.() > 0);
      // Dev Tools rigs live on window.STATE.rigs (private), so just update all shadow generators in scene:
      scene.lights.forEach(L => {
        if (L.getShadowGenerator && L.getShadowGenerator()) {
          const g = L.getShadowGenerator();
          const sm = g.getShadowMap?.();
          if (sm) sm.renderList = casters;
        }
      });
    } catch (e) {
      warn("refreshShadowCasters error:", e);
    }
  };

  // Public scan helper for your “scan the glb for any and all nodes” need.
  window.scanMapNodes = function scanMapNodes() {
    const meshes = scene.meshes.map(m => ({ type: "Mesh", name: m.name, parent: m.parent?.name || null }));
    const trns   = scene.transformNodes?.map?.(n => ({ type: "TransformNode", name: n.name, parent: n.parent?.name || null })) || [];
    const bones  = [];
    scene.skeletons?.forEach(sk => sk.bones.forEach(b => bones.push({ type: "Bone", name: b.name, skel: sk.name })));
    const items = [...meshes, ...trns, ...bones];
    log(`scanMapNodes → ${items.length} nodes`);
    try {
      const blob=new Blob([JSON.stringify({ count: items.length, items }, null, 2)],{type:"application/json"});
      const a=document.createElement("a"); a.download = "nodes_scan.json"; a.href = URL.createObjectURL(blob); a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),0);
    } catch {}
    return items;
  };

  // Main loader
  async function loadMap() {
    disposePreviousMap();

    const url = getMapUrl();
    let root = "", file = url;
    const i = url.lastIndexOf("/");
    if (i >= 0) { root = url.slice(0, i + 1); file = url.slice(i + 1); }

    try {
      showLoading(true, 8, "loading map…");
      BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce(p => log(`Using loader plugin: ${p.name}`));

      // Import meshes into the existing scene
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", root, file, scene, (evt) => {
        if (evt.lengthComputable) {
          const pct = 8 + Math.floor((evt.loaded / evt.total) * 80);
          showLoading(true, pct, "loading map…");
        }
      });

      const meshes = result.meshes || [];
      window.mapMeshes.push(...meshes);

      // House root (prefer __root__ if present)
      window.houseRoot = meshes.find(m => m.name === "__root__") || meshes[0] || null;

      // Pass 1: apply collisions/pickable, collect likely doors
      window.doorMeshes.length = 0;
      meshes.forEach(m => {
        if (!m || !m.getBoundingInfo) return;
        m.isPickable = true;
        m.checkCollisions = !shouldDisableCollision(m);
        if (/door/i.test(m.name || "")) window.doorMeshes.push(m);
        // allow shadows everywhere (Lights+ rigs expect receivers)
        m.receiveShadows = true;
      });

      ensureFallbackGround();

      // Camera spawn: if you have a vanZone global with .center {x,z}, use it. Otherwise center of map bbox.
      try {
        const spawn = (() => {
          const vz = window.vanZone?.center;
          if (vz && Number.isFinite(vz.x) && Number.isFinite(vz.z)) return { x: vz.x, z: vz.z };
          // fallback: map bounds center
          const bounds = (() => {
            let min = new BABYLON.Vector3(+Infinity, +Infinity, +Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
            meshes.forEach(m => {
              const bb = m.getBoundingInfo?.().boundingBox;
              if (!bb) return;
              min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
              max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
            });
            const c = min.add(max).scale(0.5);
            return { x: c.x, z: c.z };
          })();
          return bounds;
        })();

        const y = window.pickGroundHeightAt(spawn.x, spawn.z);
        camera.position.copyFrom(new BABYLON.Vector3(spawn.x, y + 1.7, spawn.z));
      } catch {}

      // Doors: prepare door meshes for interactivity (you can wire actions elsewhere)
      window.doorMeshes.forEach(door => {
        try {
          door.actionManager = door.actionManager || new BABYLON.ActionManager(scene);
          door.isPickable = true;
        } catch {}
      });

      // Apply saved mapping from Dev Tools (if present)
      try { window.applyDoorsMapping && window.applyDoorsMapping(scene); } catch(e){ warn("applyDoorsMapping failed:", e); }
      try { window.applyItemsMapping && window.applyItemsMapping(scene); } catch(e){ warn("applyItemsMapping failed:", e); }

      // Everyone receives shadows by default; let Dev Tools “Refresh Casters” fill render lists.
      showLoading(false);
      log(`Loaded ${url} (meshes: ${meshes.length})`);
    } catch (e) {
      showLoading(false);
      warn("Map load failed:", e);
      // Fallback: create a simple room so you’re not stuck on a black screen.
      try {
        const g = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width: 20, height: 20 }, scene);
        g.checkCollisions = true; g.isPickable = true;
        const y = 0; camera.position.copyFrom(new BABYLON.Vector3(0, y + 1.7, 0));
      } catch {}
    }
  }

  // Reload convenience for Dev Tools
  async function reloadMap() {
    disposePreviousMap();
    await loadMap();
  }

  // Expose API
  window.loadMap   = loadMap;
  window.reloadMap = reloadMap;

  // If you prefer auto-load on script include, uncomment:
  // setTimeout(()=>loadMap(), 0);
})();
