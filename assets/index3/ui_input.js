// ./assets/index3/ui_input.js
// UI + Input glue for PhasmaPhoney (index3 split)

// ---------- HUD ----------
function updateHUD() {
  $('#hud-sanity').textContent = `${player.sanity | 0}%`;
  $('#hud-room').textContent = player.room;
}

// ---------- INPUT BINDINGS ----------
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

// ---------- MOVEMENT ----------
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

// ---------- INTERACT: NEAR DOOR ----------
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
        // swing by default hinge angle (can be edited in Dev Tools → Doors)
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

// ---------- PLAYER FOOTSTEPS ----------
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

// ---------- UI INIT (called from main.js → initUI()) ----------
function initUI() {
  // Title “Start”
  const startBtn = document.getElementById('start-button');
  if (startBtn) startBtn.addEventListener('click', safeStart);

  // Storage modal wiring
  if (typeof initStorageUI === 'function') initStorageUI();

  // HUD initial paint
  updateHUD();

  // Bind inputs (once)
  if (!initUI._bound) { bindInputs(); initUI._bound = true; }
}

/* ======== Dev-Tools Items Bridge (./assets/dev/tools/*) ======== */

// Global registry
window.ItemRegistry = window.ItemRegistry || (function () {
  const items = new Map();

  function idFor(def) { return def.id || def.name; }
  function findByName(name) {
    for (const it of items.values()) if (it.name === name || it.id === name) return it;
    return null;
  }

  return {
    register(def) {
      const id = idFor(def);
      if (!id) { console.warn("[ItemRegistry] Ignored item with no id/name", def); return; }
      def.name = def.name || id;
      def.defaultCharges = (def.defaultCharges == null) ? Infinity : def.defaultCharges;
      items.set(id, def);
      // feed model map if provided
      if (def.modelMeshName && typeof ITEM_MODEL_MAP !== "undefined") {
        ITEM_MODEL_MAP[def.name] = def.modelMeshName;
      }
      // expose a global registerItem(name) API for convenience
      window.registerItem = window.registerItem || ((d) => window.ItemRegistry.register(d));
    },
    list() { return Array.from(items.values()); },
    find: findByName,
    onEquip(name, slot) {
      const def = findByName(name);
      if (def && typeof def.onEquip === "function") {
        try { def.onEquip({ slot, name, camera, scene, inventory }); } catch (e) { console.warn(e); }
      }
    }
  };
})();

// Helper to load <script> files (no module build required)
function __loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

// Load manifest + scripts
async function loadToolItems(manifestUrl = "./assets/dev/tools/manifest.json") {
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("manifest not found");
    const list = await res.json(); // ["emf.js","spiritbox.js"] or [{src:"emf.js"}]
    for (const entry of list) {
      const path = (typeof entry === "string") ? entry : (entry.src || entry.path);
      if (path) await __loadScript(`./assets/dev/tools/${path}`);
    }
    console.log("[ItemRegistry] Loaded dev tool items.");
  } catch (e) {
    console.warn("[ItemRegistry] No manifest or load failed:", e.message);
  }
}

// Prefer registry items; fall back to core lists
function __getStorageItemsList() {
  const reg = (window.ItemRegistry && window.ItemRegistry.list && window.ItemRegistry.list()) || [];
  if (reg.length) return reg.map(i => i.name);
  if (typeof STORAGE_ITEMS !== "undefined" && Array.isArray(STORAGE_ITEMS)) return STORAGE_ITEMS;
  if (Array.isArray(window.STORAGE_ITEMS)) return window.STORAGE_ITEMS;
  return [];
}

// Optional icon from registered item
function __getItemIcon(name) {
  const def = window.ItemRegistry?.find?.(name);
  return def?.icon || null;
}

// Per-item default charges
function __getItemDefaultCharges(name) {
  const def = window.ItemRegistry?.find?.(name);
  if (def && def.defaultCharges != null) return def.defaultCharges;
  if (name in (window.ITEM_DEFAULT_CHARGES || {})) return ITEM_DEFAULT_CHARGES[name];
  return Infinity;
}

/* ============ STORAGE UI (pick 3 items) ============ */
(function () {
  let selection = new Set();
  window.storageOpen = window.storageOpen || false;

  // build item card
  function makeItemCard(name) {
    const el = document.createElement('div');
    el.className = 'storage-item';
    el.style.cssText = 'border:1px solid #044;padding:8px;border-radius:8px;cursor:pointer;background:#0008;color:#9ff;display:flex;justify-content:space-between;align-items:center;';
    const label = document.createElement('div');
    label.textContent = name;
    const check = document.createElement('div');
    check.textContent = '✚';
    check.style.opacity = '0.6';
    el.appendChild(label); el.appendChild(check);

    // optional icon
    const icon = __getItemIcon(name);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon; img.alt = name;
      img.style.cssText = 'max-width:24px;max-height:24px;margin-right:8px;filter:drop-shadow(0 0 6px rgba(0,255,255,0.3))';
      el.insertBefore(img, label);
    }

    function refresh() {
      const picked = selection.has(name);
      el.style.borderColor = picked ? '#0ff' : '#044';
      el.style.boxShadow = picked ? '0 0 10px rgba(0,255,255,0.25) inset' : 'none';
      check.textContent = picked ? '✓' : '✚';
      check.style.opacity = picked ? '1' : '0.6';
    }
    el.onclick = ()=>{
      if(selection.has(name)){ selection.delete(name); }
      else {
        if(selection.size >= 3) { toast('Pick exactly 3 items (slots 1–3).', 1000); return; }
        selection.add(name);
      }
      refresh(); updateInfo(); refreshConfirmState();
    };
    refresh();
    return el;
  }

  function populateGrid() {
    const grid = document.getElementById('storage-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = __getStorageItemsList();
    items.forEach((name)=>{
      if (name === 'Lighter' || name === 'Notebook') return; // fixed
      grid.appendChild(makeItemCard(name));
    });
  }

  function updateInfo(){
    const info = document.getElementById('storage-info');
    if (info) info.textContent = `Selected: ${selection.size}/3`;
  }

  function refreshConfirmState(){
    const btn = document.getElementById('storage-confirm');
    if (!btn) return;
    btn.disabled = selection.size !== 3;
    btn.style.opacity = btn.disabled ? '0.5' : '1';
    btn.style.pointerEvents = btn.disabled ? 'none' : 'auto';
  }

  function applyChargesForSlot(slotIdx, itemName){
    inventory.slotCharges[slotIdx] = itemName ? __getItemDefaultCharges(itemName) : 0;
  }

  function writeSlotsFromSelection(){
    const picks = Array.from(selection);
    // Fill slots 1–3 with chosen items
    inventory.slots[1] = picks[0] || null;
    inventory.slots[2] = picks[1] || null;
    inventory.slots[3] = picks[2] || null;

    // Charges
    applyChargesForSlot(1, inventory.slots[1]);
    applyChargesForSlot(2, inventory.slots[2]);
    applyChargesForSlot(3, inventory.slots[3]);

    // Fixed slots
    inventory.slots[4] = 'Lighter';
    inventory.slotCharges[4] = Infinity;
    inventory.slots[5] = 'Notebook';
    inventory.slotCharges[5] = Infinity;
  }

  async function openStorage(){
    if (player.room !== 'Van') { toast('Storage only available in the Van.', 1200); return; }

    // lazy-load dev items if none registered yet
    if (!(window.ItemRegistry?.list?.() || []).length) {
      await loadToolItems().catch(()=>{});
    }

    selection = new Set(); // reset each time you open
    storageOpen = true;

    populateGrid();
    updateInfo();
    refreshConfirmState();

    document.getElementById('storage-modal').style.display = 'flex';
  }

  function closeStorage(){
    storageOpen = false;
    document.getElementById('storage-modal').style.display = 'none';
  }

  function bindButtons(){
    const btnOpen = document.getElementById('storage-button');
    const btnClose = document.getElementById('storage-close');
    const btnConfirm = document.getElementById('storage-confirm');

    if (btnOpen) btnOpen.onclick = openStorage;
    if (btnClose) btnClose.onclick = closeStorage;

    if (btnConfirm) {
      btnConfirm.onclick = ()=>{
        if (selection.size !== 3) {
          toast('Pick exactly 3 items for slots 1–3.', 1200);
          return;
        }
        writeSlotsFromSelection();
        rebuildBelt();
        // notify onEquip hooks
        [1,2,3,4,5].forEach(slot=>{
          const it = inventory.slots[slot];
          if (it && window.ItemRegistry?.onEquip) window.ItemRegistry.onEquip(it, slot);
        });
        closeStorage();
        toast('Loadout updated.', 1000);
      };
      // esc to close
      window.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape' && storageOpen) closeStorage();
      });
      // subtle disabled animation
      btnConfirm.style.transition = 'opacity 140ms ease-out';
    }
  }

  // call this from initUI()
  window.initStorageUI = function initStorageUI(){
    bindButtons();
  };
})();

/* --- harden init for Storage + DevTools toggle --- */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    try { if (typeof initUI === 'function') initUI(); } catch (e) { console.warn(e); }

    // Dev Tools toggle fallback
    const t = document.getElementById('devtools-toggle');
    const p = document.getElementById('devtools-panel');
    if (t && p) {
      t.style.display = 'block';
      if (!t._wired) {
        t._wired = true;
        t.onclick = () => { p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none'; };
      }
    }
  });
})();
