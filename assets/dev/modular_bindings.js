/**
 * modular_bindings.js (rewrite)
 * - Robust, UI-aware key bindings.
 * - Never hides the belt; just signals slot changes.
 * - Number keys (1–3) select belt slots; 4 is reserved for lighter (no slot select).
 * - Emits 'pp:slot:change' so tools can react (e.g., Spirit Box auto-off on deselect).
 * - Movement flags for rigs that want simple inputs.
 */
(function () {
  if (window.__PP_BINDINGS__) return; window.__PP_BINDINGS__ = true;

  const PP = (window.PP = window.PP || {});
  const C  = (PP.controls = PP.controls || {});
  PP.state = PP.state || {};
  PP.state.controls = PP.state.controls || { forward:false, back:false, left:false, right:false };
  PP.state.selectedSlot = PP.state.selectedSlot || 1;   // 1..3; 4 is lighter (no slot)

  const Keys = Object.create(null);
  const F = PP.state.controls;

  // ---------- helpers ----------
  const has = (arr, code) => Array.isArray(arr) && arr.includes(code);

  function S(){ 
    return window.SCENE || window.scene || 
           (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]) || null; 
  }

  function uiBusy() {
    // ignore keys while typing in inputs or when a modal is open
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return true;
    if (document.getElementById('notebook-modal')?.style?.display !== 'none') return true;
    return false;
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
  }

  // Centralized slot select (1..3 only)
  function selectSlot(n) {
    n = Math.max(1, Math.min(3, n|0));
    const prev = PP.state.selectedSlot;
    if (prev === n) {
      // re-select same slot -> optional confirm ping
      emit('pp:slot:confirm', { slot: n });
      return;
    }
    PP.state.selectedSlot = n;

    // Notify interested systems (belt UI, tools, etc.)
    emit('pp:slot:change', { prev, next: n });

    // Belt UI hooks (if your project exposes them)
    if (typeof window.selectSlot === 'function') window.selectSlot(n);
    if (typeof window.buildBelt === 'function')  { try { window.buildBelt(null); } catch {} }
    if (typeof window.refreshCameraOverlay === 'function') { try { window.refreshCameraOverlay(); } catch {} }
  }

  // Light helpers
  const syncHeldLights = () => { if (typeof window.syncHeldLights === 'function') window.syncHeldLights(); };
  const toggleNearestHouseLight = () => { if (typeof window.toggleNearestHouseLight === 'function') window.toggleNearestHouseLight(); };
  const setHousePower = (on) => { if (typeof window.setHousePower === 'function') window.setHousePower(on); };

  // Prevent page scroll/zoom side-effects on common game keys
  function preventIfNeeded(e){
    const block = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    if (block.includes(e.code)) e.preventDefault();
  }

  // ---------- Keydown ----------
  addEventListener('keydown', (e) => {
    Keys[e.code] = true;
    preventIfNeeded(e);
    if (uiBusy()) return;

    // Movement flags (WASD + arrows per your PP.controls map)
    if (has(C.keys?.forward, e.code)) F.forward = true;
    if (has(C.keys?.back,    e.code)) F.back    = true;
    if (has(C.keys?.left,    e.code)) F.left    = true;
    if (has(C.keys?.right,   e.code)) F.right   = true;
    if (has(C.keys?.sprint,  e.code)) PP.state.running = true;

    // Slots: only 1..3 modify belt; 4 is the lighter key (no belt slot)
    if (C.keys?.slots?.includes(e.code)) {
      const n = parseInt(e.code.replace(/\D/g, ''), 10) || 0;
      if (n >= 1 && n <= 3) {
        selectSlot(n);
        return;
      }
      // if (n === 4) lighter toggle is handled elsewhere (UI/button), do nothing here
    }

    // Discrete actions
    if (has(C.keys?.notebook, e.code) && typeof window.openNotebook === 'function') window.openNotebook();
    if (has(C.keys?.openDoor, e.code) && typeof window.openDoorNearby === 'function') window.openDoorNearby();
    if (has(C.keys?.use,      e.code) && typeof window.useActiveItem === 'function') window.useActiveItem();
    if (has(C.keys?.minimap,  e.code) && typeof window.toggleMinimap === 'function') window.toggleMinimap();

    if (has(C.keys?.flash, e.code)) { window.flashOn = !window.flashOn; window.uvOn=false; window.irOn=false; syncHeldLights(); }
    if (has(C.keys?.uv,    e.code)) { window.uvOn = !window.uvOn; window.flashOn=false; window.irOn=false; syncHeldLights(); }
    if (has(C.keys?.ir,    e.code)) { window.irOn = !window.irOn; window.flashOn=false; window.uvOn=false; syncHeldLights(); if (typeof window.refreshCameraOverlay==='function') window.refreshCameraOverlay(); }
    if (has(C.keys?.lightToggle, e.code)) toggleNearestHouseLight();
    if (has(C.keys?.powerToggle, e.code)) setHousePower(!(window.housePower === false ? false : true));
  }, { capture: true });

  // ---------- Keyup ----------
  addEventListener('keyup', (e) => {
    Keys[e.code] = false;
    if (has(C.keys?.forward, e.code)) F.forward = false;
    if (has(C.keys?.back,    e.code)) F.back    = false;
    if (has(C.keys?.left,    e.code)) F.left    = false;
    if (has(C.keys?.right,   e.code)) F.right   = false;
    if (has(C.keys?.sprint,  e.code)) PP.state.running = false;
  }, { capture: true });

  // ---------- Footstep pacing helper (optional) ----------
  (function footsteps() {
    const s = S(); if (!s || !s.activeCamera) return setTimeout(footsteps, 200);
    const cam = s.activeCamera, st = { last: null, acc: 0 };
    (function tick(){
      const now = cam.position?.clone?.() || cam.position || new BABYLON.Vector3();
      if (!st.last) st.last = now;
      const d = BABYLON.Vector3.Distance(now, st.last);
      st.last = now;

      const moving = F.forward || F.back || F.left || F.right;
      if (moving){
        st.acc += d;
        const stride = (PP.state.running ? (PP.controls.strideRun || 0.8) : (PP.controls.strideWalk || 1.2));
        if (st.acc >= stride){
          st.acc = 0;
          if (typeof window.playStep === 'function') { try { window.playStep(0.42); } catch {} }
        }
      }
      requestAnimationFrame(tick);
    })();
  })();

  // ---------- Exports ----------
  PP.getMovementFlags = () => ({ ...F, running: !!PP.state.running });
  PP.getSpeeds        = () => ({ walk: PP.controls.speedWalk || 0.9, run: PP.controls.speedRun || 1.8 });

  // Tell belt UI to render once at boot (keeps it visible)
  window.addEventListener('pp:start', () => {
    try { if (typeof window.buildBelt === 'function') window.buildBelt(null); } catch {}
  }, { once: true });

})();
