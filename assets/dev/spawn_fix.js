/* spawn_fix.js — MAP_DEF loader + spawn enforcement with path normalization */
(function () {
  if (window.__SpawnFix) return;
  const MAP_DIR = "./assets/models/map/";

  function resolvePath(p) {
    if (!p) return null;
    if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
    if (p.startsWith("./") || p.startsWith("assets/")) return p;
    return MAP_DIR + p;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve) => {
      const url = resolvePath(src);
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function tryLoadCandidates(list) {
    for (const c of list) {
      const ok = await loadScriptOnce(c);
      if (ok && window.MAP_DEF && MAP_DEF.spawn) return true;
    }
    return false;
  }

  async function ensureMapDef() {
    if (window.MAP_DEF && MAP_DEF.spawn) return true;

    const pick = (typeof window.__PP_getSelectedMap === "function") ? __PP_getSelectedMap() : null;
    const cand = [];

    if (pick?.def) {
      cand.push(pick.def); // already normalized
    } else if (pick?.file) {
      const base = pick.file.replace(/^.*\//, "").replace(/\.(glb)$/i, "");
      cand.push(base + ".config.js", base + ".js");
    } else {
      cand.push(
        "furnished_house.config.js",
        "furnished_house.js",
        "Abandoned_House.js"
      );
    }

    const loaded = await tryLoadCandidates(cand);

    if (!loaded && pick?.file) {
      // Synthesize minimal MAP_DEF using GLB only
      window.MAP_DEF = {
        title: pick.title || "Map",
        file: pick.file,
        scale: 1,
        rotationY: 0,
        offset: { x: 0, y: 0, z: 0 },
        spawn: { x: 0, y: 1.8, z: 0 },
      };
      return true;
    }
    return !!(window.MAP_DEF && MAP_DEF.spawn);
  }

  function enforceSpawn(scene) {
    try {
      if (!(window.MAP_DEF && MAP_DEF.spawn)) return;
      const sp = MAP_DEF.spawn || { x: 0, y: 1.8, z: 0 };
      const cam = scene && scene.activeCamera;
      if (cam && cam.position) {
        cam.position.x = sp.x || 0;
        cam.position.y = sp.y || 1.8;
        cam.position.z = sp.z || 0;
      }
      const pc = scene?.getMeshByName?.("player_capsule");
      if (pc?.position) pc.position.set(sp.x || 0, sp.y || 1.8, sp.z || 0);
    } catch {}
  }

  window.__SpawnFix = { ensureMapDef, enforceSpawn, resolvePath };
})();
