/* pointerlock_fix.js — make mouse-look + WASD work together via pointer lock */
(function () {
  if (window.__PointerLockFixed) return;
  window.__PointerLockFixed = true;

  function setup() {
    const scene  = window.scene || BABYLON.Engine?.LastCreatedScene;
    const engine = scene?.getEngine?.() || BABYLON.Engine?.LastCreatedEngine;
    const canvas = document.getElementById("renderCanvas") || document.querySelector("canvas");
    const cam    = window.camera || scene?.activeCamera;

    if (!scene || !engine || !canvas || !cam) return false;

    // 1) Remove Babylon’s built-in mouse inputs so we don’t fight them.
    try { cam.inputs.removeByType("FreeCameraMouseInput"); } catch (_) {}
    try { cam.inputs.removeByType("FreeCameraTouchInput"); } catch (_) {}
    try { cam.inputs.removeByType("FreeCameraGamepadInput"); } catch (_) {}
    // Keep keyboard removed (you already do this elsewhere), we drive movement ourselves:
    try { cam.inputs.removeByType("FreeCameraKeyboardMoveInput"); } catch (_) {}

    // 2) Make sure the canvas can receive focus and lock the pointer on click.
    try { canvas.tabIndex = 0; } catch (_) {}
    function lock() {
      if (document.pointerLockElement === canvas) return;
      const req = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
      try { req && req.call(canvas); } catch (_) {}
      try { canvas.focus(); } catch (_) {}
    }
    canvas.addEventListener("click", lock, { passive: true });

    // 3) Route raw mouse deltas (movementX/Y) into your applyLook().
    //    While not pointer-locked, ignore movement (prevents “free camera” feeling).
    function onMove(e) {
      if (document.pointerLockElement !== canvas) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (typeof window.applyLook === "function") {
        window.applyLook({ x: dx, y: dy });
      }
    }
    window.addEventListener("mousemove", onMove, { passive: true });

    // 4) Helpful toast when we lose lock (optional).
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) {
        try { window.toast?.("Pointer unlocked — click the game to lock"); } catch (_) {}
      }
    });

    return true;
  }

  // Try until scene/camera exist.
  let tries = 0;
  (function wait() {
    if (setup()) return;
    if (++tries > 100) return;
    setTimeout(wait, 100);
  })();
})();
