// File: assets/dev/util/player_rig_controller_final.js
// Single-file rig + input system. No external bindings needed.
(function () {
  "use strict";
  if (window.__PP_RIG_V4__) return; window.__PP_RIG_V4__ = true;

  const PP = (window.PP = window.PP || {});
  const TWO_PI = Math.PI * 2;

  // ------- small helpers -------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const nowMs = () => performance.now();
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const on = (t, n, f, o) => t.addEventListener(n, f, o);

  function S() {
    // get the current scene if available
    return window.SCENE || BABYLON.EngineStore?.LastCreatedScene || BABYLON.Engine?.LastCreatedScene || null;
  }

  // ------- player rig -------
  const Rig = {
    scene: null,
    canvas: null,
    body: null,            // TransformNode (movement root)
    fpCam: null,           // UniversalCamera (first person)
    tpCam: null,           // ArcRotateCamera (third person)
    mode: "fp",            // 'fp' | 'tp'
    speeds: { walk: 2.7, run: 5.4, crouch: 1.4 }, // m/s
    state: {
      move: { f: false, b: false, l: false, r: false },
      run: false,
      crouch: false,
      mouseLocked: false,
      rightHeld: false,
      pttLocal: false,
      pttGlobal: false
    },
    lastStepDist: 0,
    stepStride: { walk: 1.2, run: 0.8 },

    init(scene) {
      this.scene = scene || S();
      if (!this.scene) return console.warn("[rig] no scene yet");

      // body root
      this.body = new BABYLON.TransformNode("playerBody", this.scene);
      this.body.position = new BABYLON.Vector3(0, 1.8, 0);

      // FIRST PERSON camera
      this.fpCam = new BABYLON.UniversalCamera("playerFP", this.body.position.clone(), this.scene);
      this.fpCam.minZ = 0.1;
      this.fpCam.inertia = 0;
      this.fpCam.angularSensibility = 800; // mouse look sensitivity
      this.fpCam.checkCollisions = true;
      this.fpCam.applyGravity = true;
      this.fpCam.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
      this.fpCam.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);

      // THIRD PERSON camera (orbiting the body)
      this.tpCam = new BABYLON.ArcRotateCamera("playerTP",
        Math.PI / 2, 1.05, 3.6, this.body.position, this.scene);
      this.tpCam.lowerBetaLimit = 0.2;
      this.tpCam.upperBetaLimit = Math.PI * 0.49;
      this.tpCam.panningSensibility = 0;
      this.tpCam.checkCollisions = true;
      this.tpCam.attachControl(true);

      // Start in FP mode
      this.activate("fp");

      // Follow the body (keep cameras aligned to body Yaw)
      this.scene.onBeforeRenderObservable.add(() => this._tick());

      // Try to export handles for other modules
      this.scene.__playerBody = this.body;
      window.PP.rig = this;
    },

    activate(mode) {
      mode = mode === "tp" ? "tp" : "fp";
      this.mode = mode;

      if (mode === "fp") {
        this._detachAll();
        this.scene.activeCamera = this.fpCam;
        this.fpCam.position = this.body.position.clone();
        this.fpCam.attachControl(this._canvas(), true);
      } else {
        this._detachAll();
        this.scene.activeCamera = this.tpCam;
        this.tpCam.target = this.body.position;
        this.tpCam.attachControl(this._canvas(), true);
      }
      // focus
      try { this._canvas().focus(); } catch {}
    },

    toggleMode() {
      this.activate(this.mode === "fp" ? "tp" : "fp");
    },

    _detachAll() {
      try { this.fpCam.detachControl(); } catch {}
      try { this.tpCam.detachControl(); } catch {}
    },

    _canvas() {
      return this.canvas || (this.canvas = document.getElementById("renderCanvas"));
    },

    // movement integration each frame
    _tick() {
      const dt = this.scene.getEngine().getDeltaTime() / 1000; // seconds
      if (!dt) return;

      // Determine facing yaw: in FP use camera yaw, in TP use tpCam alpha around target
      let yaw;
      if (this.mode === "fp") {
        // derive yaw from FP camera rotation
        yaw = this.fpCam.rotation.y || 0;
      } else {
        // ArcRotate alpha is clockwise around Y
        yaw = -this.tpCam.alpha + Math.PI / 2;
      }

      // WASD movement vector in local space
      let x = 0, z = 0;
      if (this.state.move.f) z += 1;
      if (this.state.move.b) z -= 1;
      if (this.state.move.l) x -= 1;
      if (this.state.move.r) x += 1;

      let moving = false;
      if (x !== 0 || z !== 0) {
        moving = true;
        // normalize
        const len = Math.hypot(x, z) || 1;
        x /= len; z /= len;

        // rotate by yaw to world space
        const dx = x * Math.cos(yaw) - z * Math.sin(yaw);
        const dz = x * Math.sin(yaw) + z * Math.cos(yaw);

        // speed
        const sp = this.state.crouch
          ? this.speeds.crouch
          : (this.state.run ? this.speeds.run : this.speeds.walk);

        this.body.position.x += dx * sp * dt;
        this.body.position.z += dz * sp * dt;

        // keep cameras with body
        if (this.mode === "fp") {
          this.fpCam.position.copyFrom(this.body.position);
        } else {
          this.tpCam.target.copyFrom(this.body.position);
        }

        // footsteps (distance based)
        this.lastStepDist += sp * dt;
        const stride = this.state.run ? this.stepStride.run : this.stepStride.walk;
        if (this.lastStepDist >= stride) {
          this.lastStepDist = 0;
          try { window.playStep && window.playStep(0.45); } catch {}
        }
      } else {
        this.lastStepDist = 0;
      }

      // sync yaw of body with camera so other systems can use it
      if (!this.body.rotation) this.body.rotation = new BABYLON.Vector3();
      this.body.rotation.y = yaw;

      // crouch height (simple)
      const desiredY = this.state.crouch ? 1.2 : 1.8;
      this.body.position.y = BABYLON.Scalar.Lerp(this.body.position.y, desiredY, clamp(12 * dt, 0, 1));
      if (this.mode === "fp") this.fpCam.position.y = this.body.position.y;
    }
  };

  // ------- input wiring (baked here) -------
  const Keys = Object.create(null);
  const pressed = (code) => !!Keys[code];

  function pointerLockTry(canvas) {
    if (!canvas || !canvas.requestPointerLock) return;
    if (document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch {}
    }
  }

  function setupInputs() {
    const scene = S();
    if (!scene) return setTimeout(setupInputs, 100);

    // init rig once scene exists
    Rig.init(scene);

    const canvas = document.getElementById("renderCanvas");

    // Mouse lock on click
    on(canvas, "click", () => pointerLockTry(canvas), { passive: true });

    // Keyboard
    on(window, "keydown", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      Keys[e.code] = true;

      // Movement
      if (e.code === "KeyW" || e.code === "ArrowUp")    Rig.state.move.f = true;
      if (e.code === "KeyS" || e.code === "ArrowDown")  Rig.state.move.b = true;
      if (e.code === "KeyA" || e.code === "ArrowLeft")  Rig.state.move.l = true;
      if (e.code === "KeyD" || e.code === "ArrowRight") Rig.state.move.r = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") Rig.state.run = true;

      // Crouch
      if (e.code === "KeyC") Rig.state.crouch = true;

      // Backquote ` -> toggle first/third
      if (e.code === "Backquote") { e.preventDefault(); Rig.toggleMode(); }

      // Actions (from your screenshots)
      if (e.code === "KeyE") emit("pp:action", { type: "grab" });      // Grab / Interact key
      if (e.code === "KeyG") emit("pp:action", { type: "drop" });      // Drop
      if (e.code === "KeyF") emit("pp:action", { type: "place" });     // Place
      if (e.code === "KeyQ") emit("pp:action", { type: "cycle" });     // Cycle
      if (e.code === "KeyJ") emit("pp:action", { type: "journal" });   // Journal

      // T tap / hold (special vs headgear toggle)
      if (e.code === "KeyT") {
        // start measuring hold
        Keys.__T_down_at = nowMs();
      }

      // Push-to-talk
      if (e.code === "KeyV" && !Rig.state.pttLocal) {
        Rig.state.pttLocal = true; emit("pp:action", { type: "ptt_local" });
      }
      if (e.code === "KeyB" && !Rig.state.pttGlobal) {
        Rig.state.pttGlobal = true; emit("pp:action", { type: "ptt_global" });
      }
    }, true);

    on(window, "keyup", (e) => {
      Keys[e.code] = false;

      if (e.code === "KeyW" || e.code === "ArrowUp")    Rig.state.move.f = false;
      if (e.code === "KeyS" || e.code === "ArrowDown")  Rig.state.move.b = false;
      if (e.code === "KeyA" || e.code === "ArrowLeft")  Rig.state.move.l = false;
      if (e.code === "KeyD" || e.code === "ArrowRight") Rig.state.move.r = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") Rig.state.run = false;

      if (e.code === "KeyC") Rig.state.crouch = false;

      // T tap vs hold
      if (e.code === "KeyT") {
        const held = (nowMs() - (Keys.__T_down_at || 0));
        delete Keys.__T_down_at;
        if (held > 300) emit("pp:action", { type: "headgear" });
        else emit("pp:action", { type: "special" });
      }

      // PTT end
      if (e.code === "KeyV" && Rig.state.pttLocal)  { Rig.state.pttLocal = false;  emit("pp:action", { type: "ptt_local_end"  }); }
      if (e.code === "KeyB" && Rig.state.pttGlobal) { Rig.state.pttGlobal = false; emit("pp:action", { type: "ptt_global_end" }); }
    }, true);

    // Mouse buttons
    on(window, "mousedown", (e) => {
      const btn = e.button;
      if (btn === 0) { // left
        emit("pp:action", { type: "interact" });
      } else if (btn === 2) { // right
        Rig.state.rightHeld = true;
        emit("pp:action", { type: "use_hold" });
      }
    }, true);

    on(window, "mouseup", (e) => {
      const btn = e.button;
      if (btn === 2) { // right
        const wasHold = Rig.state.rightHeld;
        Rig.state.rightHeld = false;
        // short tap is 'use', otherwise end of hold
        if (e.detail <= 1) emit("pp:action", { type: "use" });
        emit("pp:action", { type: "use_hold_end" });
      }
    }, true);

    // context menu off for right-button gameplay
    on(window, "contextmenu", (e) => { e.preventDefault(); }, true);

    // Pointer lock on pp:start too
    on(window, "pp:start", () => setTimeout(() => pointerLockTry(canvas), 150), { once: true });
  }

  // boot when a scene exists or on start
  if (document.readyState === "loading") {
    on(document, "DOMContentLoaded", setupInputs, { once: true });
  } else {
    setupInputs();
  }
  on(window, "pp:start", setupInputs, { once: true });

})();
