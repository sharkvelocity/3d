// ./assets/index3/ui_input.js
// UI + Input glue for PhasmaPhoney (index3 split)

//
// ---------- HUD ----------
//
function updateHUD() {
  $('#hud-sanity').textContent = `${player.sanity | 0}%`;
  $('#hud-room').textContent = player.room;
}

//
// ---------- INPUT BINDINGS ----------
//
let keysDown = {};

function bindInputs() {
  window.addEventListener('keydown', (e) => {
    keysDown[e.key] = true;

    // movement
    if (e.key === 'w' || e.key === 'W') controls.forward = true;
    if (e.key === 's' || e.key === 'S') controls.back = true;
    if (e.key === 'a' || e.key === 'A') controls.left = true;
    if (e.key === 'd' || e.key === 'D') controls.right = true;
    if (e.key === 'Shift') player.running = true;

    // lights
    if (e.key === 'f' || e.key === 'F') {
      // Flashlight
      flashLight.intensity = flashLight.intensity > 0 ? 0 : 2.0;
    }
    if (e.key === 'u' || e.key === 'U') {
      // UV
      uvLight.intensity = uvLight.intensity > 0 ? 0 : 1.2;
    }
    if (e.key === 'i' || e.key === 'I') {
      // IR spotlight
      irLight.intensity = irLight.intensity > 0 ? 0 : 1.5;
      const irBadge = document.getElementById('camera-ir');
      if (irBadge) irBadge.style.display = irLight.intensity > 0 ? 'block' : 'none';
    }

    // house power toggle
    if (e.key === 'p' || e.key === 'P') setHousePower(!housePower);

    // use/interact (door)
    if (e.key === 'e' || e.key === 'E') openDoorNearby();
  });

  window.addEventListener('keyup', (e) => {
    keysDown[e.key] = false;

    if (e.key === 'w' || e.key === 'W') controls.forward = false;
    if (e.key === 's' || e.key === 'S') controls.back = false;
    if (e.key === 'a' || e.key === 'A') controls.left = false;
    if (e.key === 'd' || e.key === 'D') controls.right = false;
    if (e.key === 'Shift') player.running = false;
  });
}

//
// ---------- MOVEMENT ----------
//
function handleMovement(dt) {
  const speed = player.running ? player.speedRun : player.speedWalk;
  let move = new BABYLON.Vector3(0, 0, 0);

  if (controls.forward) move.z += 1;
  if (controls.back) move.z -= 1;
  if (controls.left) move.x -= 1;
  if (controls.right) move.x += 1;

  if (move.lengthSquared() > 0) {
    move.normalize();
    const fwd = camera.getForwardRay().direction;
    fwd.y = 0;
    fwd.normalize();
    const right = BABYLON.Vector3.Cross(fwd, BABYLON.Axis.Y).scale(-1);
    const desired = fwd.scale(move.z).add(right.scale(move.x)).normalize();
    camera.cameraDirection = desired.scale(speed * dt);
  } else {
    camera.cameraDirection = new BABYLON.Vector3(0, 0, 0);
  }

  // optional fly (dev)
  if (allowFly && dev.enabled) {
    if (keysDown['PageUp']) camera.position.y += 0.6 * dt * 60;
    if (keysDown['PageDown']) camera.position.y -= 0.6 * dt * 60;
  }

  // room detection + Storage button visibility
  player.room = inVanZone(camera.position) ? 'Van' : 'Grounds';
  const storageBtn = document.getElementById('storage-button');
  if (storageBtn) storageBtn.style.display = player.room === 'Van' ? 'block' : 'none';

  updateHUD();
}

//
// ---------- INTERACT: NEAR DOOR ----------
//
function openDoorNearby() {
  const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
  const pick = scene.pickWithRay(ray, (m) => /door/i.test(m.name || ''));
  if (pick.hit && pick.pickedMesh) {
    const d = BABYLON.Vector3.Distance(pick.pickedPoint, camera.position);
    if (d < 3.0) {
      const door = pick.pickedMesh;
      const open = !(door.metadata && door.metadata.open);
      const baseRot = door.metadata && door.metadata.baseRot !== undefined ? door.metadata.baseRot : door.rotation.y;

      if (open) {
        // swing 90 degrees by default (can be changed via Dev Tools → Doors)
        const angle = (door.metadata && door.metadata.hingeDeg !== undefined ? door.metadata.hingeDeg : 90) * Math.PI / 180;
        door.rotation = new BABYLON.Vector3(door.rotation.x, baseRot + angle, door.rotation.z);
        door.checkCollisions = false;
        (Math.random() > 0.5 ? audio.doorCreak1 : audio.doorCreak2).play().catch(() => {});
      } else {
        door.rotation = new BABYLON.Vector3(door.rotation.x, baseRot, door.rotation.z);
        door.checkCollisions = true;
      }
      door.metadata = Object.assign({}, door.metadata, { baseRot, open });
    }
  }
}

//
// ---------- PLAYER FOOTSTEPS ----------
//
const stepState = { lastPos: null, acc: 0, strideWalk: 1.2, strideRun: 0.8 };

function updatePlayerFootsteps(dt) {
  if (!stepState.lastPos) {
    stepState.lastPos = camera.position.clone();
    return;
  }
  const now = camera.position;
  const d = BABYLON.Vector3.Distance(now, stepState.lastPos);
  stepState.lastPos = now.clone();
  if (!(controls.forward || controls.back || controls.left || controls.right)) return;

  stepState.acc += d;
  const stride = player.running ? stepState.strideRun : stepState.strideWalk;
  if (stepState.acc >= stride) {
    stepState.acc = 0;
    playStep(0.42);
  }
}

//
// ---------- UI INIT (called from main.js → initUI()) ----------
//
function initUI() {
  // Title “Start” is already wired in main.js, but guard just in case:
  const startBtn = document.getElementById('start-button');
  if (startBtn) {
    startBtn.addEventListener('click', safeStart);
  }

  // Storage modal wiring
  if (typeof initStorageUI === 'function') {
    initStorageUI();
  }

  // HUD initial paint
  updateHUD();
}

//
// ---------- STORAGE UI (pick 3 items for slots 1–3) ----------
(function () {
  let selection = new Set();

  function makeItemCard(name) {
    const el = document.createElement('div');
    el.className = 'storage-item';
    el.style.cssText =
      'border:1px solid #044;padding:8px;border-radius:8px;cursor:pointer;background:#0008;color:#9ff;display:flex;justify-content:space-between;align-items:center;';
    const label = document.createElement('div');
    label.textContent = name;
    const check = document.createElement('div');
    check.textContent = '✚';
    check.style.opacity = '0.6';
    el.appendChild(label);
    el.appendChild(check);

    function refresh() {
      const picked = selection.has(name);
      el.style.borderColor = picked ? '#0ff' : '#044';
      el.style.boxShadow = picked ? '0 0 10px rgba(0,255,255,0.25) inset' : 'none';
      check.textContent = picked ? '✓' : '✚';
      check.style.opacity = picked ? '1' : '0.6';
    }

    el.onclick = () => {
      if (selection.has(name)) {
        selection.delete(name);
      } else {
        if (selection.size >= 3) {
          toast('Pick exactly 3 items (slots 1–3).', 1000);
          return;
        }
        selection.add(name);
      }
      refresh();
      updateInfo();
      refreshConfirmState();
    };

    refresh();
    return el;
  }

  function populateGrid() {
    const grid = document.getElementById('storage-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Show all selectable items except the fixed ones
    (window.STORAGE_ITEMS || []).forEach((name) => {
      if (name === 'Lighter' || name === 'Notebook') return; // fixed to slots 4 & 5
      grid.appendChild(makeItemCard(name));
    });
  }

  function updateInfo() {
    const info = document.getElementById('storage-info');
    if (info) info.textContent = `Selected: ${selection.size}/3`;
  }

  function refreshConfirmState() {
    const btn = document.getElementById('storage-confirm');
    if (!btn) return;
    btn.disabled = selection.size !== 3;
    btn.style.opacity = btn.disabled ? '0.5' : '1';
    btn.style.pointerEvents = btn.disabled ? 'none' : 'auto';
  }

  function applyChargesForSlot(slotIdx, itemName) {
    if (!itemName) {
      inventory.slotCharges[slotIdx] = 0;
      return;
    }
    if (itemName in (window.ITEM_DEFAULT_CHARGES || {})) {
      inventory.slotCharges[slotIdx] = ITEM_DEFAULT_CHARGES[itemName];
    } else {
      inventory.slotCharges[slotIdx] = Infinity;
    }
  }

  function writeSlotsFromSelection() {
    const picks = Array.from(selection);

    // Fill slots 1–3
    inventory.slots[1] = picks[0] || null;
    inventory.slots[2] = picks[1] || null;
    inventory.slots[3] = picks[2] || null;

    // Charges for 1–3
    applyChargesForSlot(1, inventory.slots[1]);
    applyChargesForSlot(2, inventory.slots[2]);
    applyChargesForSlot(3, inventory.slots[3]);

    // Fixed slots 4–5
    inventory.slots[4] = 'Lighter';
    inventory.slotCharges[4] = Infinity;
    inventory.slots[5] = 'Notebook';
    inventory.slotCharges[5] = Infinity;
  }

  function openStorage() {
    if (player.room !== 'Van') {
      toast('Storage only available in the Van.', 1200);
      return;
    }
    selection = new Set(); // reset each open
    storageOpen = true;

    populateGrid();
    updateInfo();
    refreshConfirmState();

    const modal = document.getElementById('storage-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeStorage() {
    storageOpen = false;
    const modal = document.getElementById('storage-modal');
    if (modal) modal.style.display = 'none';
  }

  function bindButtons() {
    const btnOpen = document.getElementById('storage-button');
    const btnClose = document.getElementById('storage-close');
    const btnConfirm = document.getElementById('storage-confirm');

    if (btnOpen) btnOpen.onclick = openStorage;
    if (btnClose) btnClose.onclick = closeStorage;

    if (btnConfirm) {
      btnConfirm.onclick = () => {
        if (selection.size !== 3) {
          toast('Pick exactly 3 items for slots 1–3.', 1200);
          return;
        }
        writeSlotsFromSelection();
        rebuildBelt();
        closeStorage();
        toast('Loadout updated.', 1000);
      };
      // subtle disabled animation
      btnConfirm.style.transition = 'opacity 140ms ease-out';
    }

    // ESC to close
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && storageOpen) {
        closeStorage();
      }
    });
  }

  // Expose initializer called by initUI()
  window.initStorageUI = function initStorageUI() {
    bindButtons();
  };
})();
/* --- harden init for Storage + DevTools --- */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // Ensure UI + Storage bind regardless of engine state.
    try { if (typeof initUI === 'function') initUI(); } catch (e) { console.warn(e); }
    try { if (typeof initStorageUI === 'function') initStorageUI(); } catch (e) { console.warn(e); }

    // Dev Tools toggle fallback: show button + open/close panel even if devtools.js hasn't inited yet.
    const t = document.getElementById('devtools-toggle');
    const p = document.getElementById('devtools-panel');
    if (t && p) {
      t.style.display = 'block';
      if (!t._wired) {
        t._wired = true;
        t.onclick = () => {
          p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
        };
      }
    }

    // Storage open/close fallback (the full selection logic still comes from ui_input.js).
    const sBtn = document.getElementById('storage-button');
    const sModal = document.getElementById('storage-modal');
    const sClose = document.getElementById('storage-close');
    if (sBtn && sModal) {
      if (!sBtn._wired) {
        sBtn._wired = true;
        sBtn.onclick = () => { sModal.style.display = 'flex'; };
      }
      if (sClose && !sClose._wired) {
        sClose._wired = true;
        sClose.onclick = () => { sModal.style.display = 'none'; };
      }
    }
  });
})();
