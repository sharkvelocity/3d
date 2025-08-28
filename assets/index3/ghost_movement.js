// ./assets/index3/ghost_movement.js
// Movement mechanics driven by window.GHOST_DATA[type].
// Models: default, revenant, distance_scaled (Deogen), sanity_scaled (Moroi),
// age_scaled (Thaye), distance_scaled_far (Jinn), temperature_scaled (Hantu),
// electronics_scaled (Raiju), twins.
(function () {
  "use strict";
  const S = {
    root: null,
    type: "Spirit",
    data: null,
    mode: "idle",          // "idle" | "hunt"
    ageSec: 0,
    spawn: null,
    wanderTimer: 0,
    wanderDir: new BABYLON.Vector3(0,0,0),
  };
  function ensureScene() {
    if (!window.scene || !window.camera) throw new Error("[GhostMove] scene/camera not ready");
  }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function lerp(a,b,t){ return a + (b - a) * t; }
  function hasLOS() {
    try {
      if (!S.root || !window.scene || !window.camera) return false;
      const origin = S.root.getAbsolutePosition();
      const target = window.camera.position.clone();
      const dir = target.subtract(origin);
      const dist = dir.length();
      if (dist < 0.001) return true;
      dir.normalize();
      const ray = new BABYLON.Ray(origin, dir, dist - 0.1);
      const hit = scene.pickWithRay(ray, (m)=> !!m && m !== S.root && m.isPickable !== false);
      return !(hit && hit.hit);
    } catch { return false; }
  }
  function getLocalTemperature() {
    try {
      const w = window.Weather;
      const state = (w && w.state) ? w.state : "Clear";
      return state === "Rainstorm" ? 10 : 18;
    } catch { return 18; }
  }
  function electronicsActiveNear(radius){
    try {
      const camPos = camera.position;
      const lights = [window.flashLight, window.uvLight, window.irLight].filter(Boolean);
      const on = lights.some(L => (L.intensity || 0) > 0);
      if (!on) return false;
      if (!S.root) return false;
      return BABYLON.Vector3.Distance(S.root.position, camPos) <= (radius || 8.0);
    } catch { return false; }
  }
  function computeSpeed(dt) {
    const mv = (S.data && S.data.movement) || {};
    const type = mv.model || "default";
    let roam = mv.roam_speed ?? 1.4;
    let chase = mv.chase_speed ?? 2.6;
    const dist = S.root ? BABYLON.Vector3.Distance(S.root.position, camera.position) : 0;
    switch (type) {
      case "revenant":
        return hasLOS() ? (mv.los_speed ?? 3.0) : (mv.no_los_speed ?? 1.1);
      case "distance_scaled": {
        const min = mv.min_speed ?? 0.4;
        const max = mv.max_speed ?? 3.0;
        const r   = mv.distance_slow_radius ?? 2.5;
        const t   = clamp(dist / (r * 3), 0, 1);
        return lerp(min, max, t);
      }
      case "sanity_scaled": {
        const s = clamp(window.playerSanity ?? 100, 0, 100);
        const min = mv.min_speed ?? 1.5;
        const max = mv.max_speed ?? 3.5;
        return lerp(max, min, s/100);
      }
      case "age_scaled": {
        S.ageSec += dt;
        const T = (mv.aging_minutes ?? 20) * 60;
        const a = clamp(S.ageSec / Math.max(1, T), 0, 1);
        const young = mv.young_speed ?? 2.75;
        const old   = mv.old_speed ?? 1.0;
        return lerp(young, old, a);
      }
      case "distance_scaled_far": {
        const farD = mv.far_distance ?? 6.0;
        return (dist >= farD) ? (mv.far_speed ?? 2.5) : (mv.near_speed ?? 1.7);
      }
      case "temperature_scaled": {
        const t = getLocalTemperature();
        return t <= 12 ? (mv.cold_speed ?? 2.7) : (mv.warm_speed ?? 1.4);
      }
      case "electronics_scaled": {
        return electronicsActiveNear(mv.elec_radius) ? (mv.elec_speed ?? 2.9) : (mv.no_elec_speed ?? 1.7);
      }
      case "twins": {
        return (S.mode === "hunt") ? (mv.primary_speed ?? 1.7) : (mv.secondary_speed ?? 1.2);
      }
      default:
        return (S.mode === "hunt") ? chase : roam;
    }
  }
  function faceDirection(dir) {
    try {
      const yOnly = new BABYLON.Vector3(dir.x, 0, dir.z);
      if (yOnly.lengthSquared() > 1e-6) {
        S.root.rotationQuaternion = S.root.rotationQuaternion || BABYLON.Quaternion.Identity();
        const up = new BABYLON.Vector3(0,1,0);
        const fwd = yOnly.normalize();
        const right = BABYLON.Vector3.Cross(up, fwd).normalize();
        const up2 = BABYLON.Vector3.Cross(fwd, right).normalize();
        const m = BABYLON.Matrix.FromXYZAxes(right, up2, fwd);
        m.decompose(undefined, S.root.rotationQuaternion, undefined);
      }
    } catch {}
  }
  function wander(dt) {
    if (!S.spawn) S.spawn = S.root ? S.root.position.clone() : new BABYLON.Vector3(0,0,0);
    S.wanderTimer -= dt;
    if (S.wanderTimer <= 0) {
      S.wanderTimer = 1.5 + Math.random()*2.0;
      const angle = Math.random()*Math.PI*2;
      S.wanderDir = new BABYLON.Vector3(Math.cos(angle), 0, Math.sin(angle));
      if (Math.random()<0.25) S.wanderDir.scaleInPlace(0);
    }
    const spd = computeSpeed(dt) * 0.35;
    const delta = S.wanderDir.scale(spd * dt);
    S.root.position.addInPlace(delta);
    faceDirection(S.wanderDir);
    S.root.position.y = S.spawn.y + Math.sin(performance.now()*0.003)*0.06;
  }
  function chase(dt) {
    const origin = S.root.getAbsolutePosition();
    const target = camera.position.clone();
    const to = target.subtract(origin); to.y = 0;
    const dist = to.length();
    if (dist < 0.01) return;
    const spd = computeSpeed(dt);
    const dir = to.normalize();
    const delta = dir.scale(spd * dt);
    S.root.position.addInPlace(delta);
    faceDirection(dir);
  }
  window.GhostMove = {
    attach(root){
      ensureScene();
      S.root = root;
      S.spawn = root.position.clone();
      S.ageSec = 0;
    },
    setType(type, data){
      S.type = type || "Spirit";
      S.data = data || (window.GHOST_DATA ? window.GHOST_DATA[S.type] : null) || {};
      S.ageSec = 0;
    },
    setMode(mode){ S.mode = (mode === "hunt" ? "hunt" : "idle"); },
    update(dt){
      if (!S.root || !window.scene || !window.camera) return;
      const hunting = (S.mode === "hunt") || !!window.isGhostHunting;
      if (hunting) chase(dt); else wander(dt);
    }
  };
})();