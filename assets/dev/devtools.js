// scripts/devtools.js
// Minimal, safe devtools bus + panel wiring.
// Exported API: initDevTools({ scene, engine, state, getPlayer, getGhost, onEvidenceUsed, rooms })
// - state: your shared game state object (optional)
// - getPlayer(): () => { position: { x,y,z } } (required for XYZ + Map)
// - getGhost(): () => ghostState (optional; for ghost logs)
// - onEvidenceUsed(cb): subscribe callback when evidence items are used (optional)
// - rooms: array of room names to populate dropdown (optional)

export const devBus = new EventTarget();

const $ = (sel) => document.querySelector(sel);
const els = {
  toggle:   '#devtools-toggle',
  panel:    '#devtools-panel',
  enable:   '#devtools-enable',
  gGhost:   '#devtools-group-ghost',
  gEv:      '#devtools-group-evidence',
  gXYZ:     '#devtools-group-xyz',
  mapStart: '#devtools-map-start',
  mapPin:   '#devtools-map-pin',
  mapOk:    '#devtools-map-confirm',
  roomSel:  '#devtools-room-select',
  log:      '#devtools-log',
};

function missingWarnings() {
  for (const [k, sel] of Object.entries(els)) {
    if (!$(sel)) console.warn(`[devtools] Missing element ${k}: ${sel}`);
  }
}

function appendLog(msg) {
  const ta = $(els.log);
  if (!ta) return;
  const t = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  ta.value += t;
  ta.scrollTop = ta.scrollHeight;
  // Also mirror to console for convenience
  console.debug('%cDEV', 'color:#8af', msg);
}

function setEnabled(el, on) { if (el) { el.disabled = !on; el.style.opacity = on ? '1' : '0.6'; } }

// Singleton gizmo manager guard (prevents “already declared”)
function getGizmoManager(scene) {
  if (!window.__devtools) window.__devtools = {};
  if (!window.__devtools.gizmoMgr) {
    const gm = new BABYLON.GizmoManager(scene);
    gm.usePointerToAttachGizmos = true;
    gm.positionGizmoEnabled = false;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled = false;
    window.__devtools.gizmoMgr = gm;
  }
  return window.__devtools.gizmoMgr;
}

let xyzTicker = null;
let mappingSession = null; // { points: [{x,y,z}], name? }

export function initDevTools(opts) {
  missingWarnings();

  const {
    scene,
    engine,
    state = {},
    getPlayer,
    getGhost = () => null,
    onEvidenceUsed = null,
    rooms = [],
  } = opts || {};

  // Populate room select if provided
  const sel = $(els.roomSel);
  if (sel && rooms?.length) {
    sel.innerHTML = '<option value="">Select room…</option>' + rooms.map(r => `<option>${r}</option>`).join('');
  }

  // Toggle open/close
  const toggleBtn = $(els.toggle);
  const panel = $(els.panel);
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    });
  }

  // Enable listener: activates group subscriptions
  const enableBtn = $(els.enable);
  const chkGhost = $(els.gGhost);
  const chkEv = $(els.gEv);
  const chkXYZ = $(els.gXYZ);

  enableBtn?.addEventListener('click', () => {
    const on = enableBtn.dataset.on === '1' ? false : true;
    enableBtn.dataset.on = on ? '1' : '0';
    enableBtn.textContent = on ? 'Disable Developer Listen' : 'Enable Developer Listen';
    appendLog(on ? 'Developer Listen: ON' : 'Developer Listen: OFF');

    // Ghost tracking subscription
    if (chkGhost) {
      if (on && chkGhost.checked) {
        devBus.addEventListener('ghost', ghostLogger);
        appendLog('Ghost tracking subscribed.');
      } else {
        devBus.removeEventListener('ghost', ghostLogger);
      }
    }

    // Evidence subscription
    if (chkEv) {
      if (on && chkEv.checked && typeof onEvidenceUsed === 'function') {
        onEvidenceUsed(evidenceLogger); // your main game should call back into this
        appendLog('Evidence activity subscribed.');
      } else {
        // no-op: we can’t unsubscribe safely unless your onEvidenceUsed returns an off()
      }
    }

    // XYZ tracker
    if (chkXYZ) {
      if (on && chkXYZ.checked) {
        startXYZTicker(getPlayer);
      } else {
        stopXYZTicker();
      }
    }
  });

  // Keep groups reactive while enabled
  chkGhost?.addEventListener('change', () => {
    if (enableBtn?.dataset.on === '1') {
      if (chkGhost.checked) devBus.addEventListener('ghost', ghostLogger);
      else devBus.removeEventListener('ghost', ghostLogger);
    }
  });
  chkEv?.addEventListener('change', () => {
    // requires your main to wire onEvidenceUsed()
    appendLog(`Evidence group ${chkEv.checked
