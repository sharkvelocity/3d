// ./assets/dev/devtools.js
// Lazy-loaded developer panel tools

// Helper: find coordinates for a given room name in the 3x3 map grid
function findRoomCoords(game, roomName) {
  for (let i = 0; i < game.roomNameMap.length; i++) {
    for (let j = 0; j < game.roomNameMap[i].length; j++) {
      if (game.roomNameMap[i][j] === roomName) {
        return [i, j];
      }
    }
  }
  return null;
}

// Attach everything under a single namespace
export function initDevTools({ game, scene }) {
  // Make some helpers available globally if you like
  window.DevTools = {
    refreshInfo,
    tpToGhost,
    revealGhost,
    sanity100,
    giveAllItems,
    logCoords,
    toggleHUD,
    endHunt,
  };

  // Wire panel buttons
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  panel.querySelectorAll('.dev-btn').forEach(btn => {
    const action = btn.getAttribute('data-dev');
    btn.addEventListener('click', () => {
      switch (action) {
        case 'tp-ghost':    tpToGhost(); break;
        case 'reveal':      revealGhost(); break;
        case 'sanity100':   sanity100(); break;
        case 'give-items':  giveAllItems(); break;
        case 'coords':      logCoords(); break;
        case 'toggle-nohud':toggleHUD(); break;
        case 'end-hunt':    endHunt(); break;
      }
      refreshInfo();
    });
  });

  // === Actions ===
  function tpToGhost() {
    if (!game || !game.ghostRoom) return;
    const coords = findRoomCoords(game, game.ghostRoom);
    if (!coords) return;
    game.position = coords; // integrate with your move/update
    if (typeof window.updateRoomLabel === 'function') window.updateRoomLabel();
    if (typeof window.simulateTyping === 'function') window.simulateTyping(`Teleported to ${game.ghostRoom}.`, "System");
  }

  function revealGhost() {
    if (!game || !game.ghost) return;
    const g = String(game.ghost).toUpperCase();
    if (typeof window.simulateTyping === 'function') window.simulateTyping(`Ghost is: ${g}`, "System");
    console.info("DEV: Ghost is", g);
  }

  function sanity100() {
    if (!game) return;
    game.sanity = 100;
    if (typeof window.updateStatus === 'function') window.updateStatus();
  }

  function giveAllItems() {
    if (!game) return;
    const all = [
      "EMF","Spirit Box","Thermometer","Crucifix","Salt","Smudge","Camera","UV Light","D.O.T.S","Ghost Writing Book","Motion Sensor","Flashlight","Thermal Camera"
    ];
    // merge unique
    const have = new Set(game.inventory || []);
    all.forEach(i => have.add(i));
    game.inventory = Array.from(have);

    // If you built a hotbar renderer, refresh it:
    if (window.GameHotbar && GameHotbar.renderHotbar) GameHotbar.renderHotbar();

    if (typeof window.simulateTyping === 'function') window.simulateTyping(`Gave all items (${game.inventory.length}).`, "System");
  }

  function logCoords() {
    if (!game) return;
    console.info("DEV: position =", game.position, "room =", game.roomNameMap?.[game.position[0]]?.[game.position[1]]);
  }

  let hudHidden = false;
  function toggleHUD() {
    hudHidden = !hudHidden;
    const ids = ['hotbar','active-item-label','status-bar','ada-modal']; // add or remove as you prefer
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = hudHidden ? '0' : '1';
    });
  }

  function endHunt() {
    // If you track hunts explicitly, hook this to your state
    // e.g., game.huntActive = false;
    if (typeof window.simulateTyping === 'function') window.simulateTyping(`Forced any active hunt to end.`, "System");
  }

  function refreshInfo() {
    const info = document.getElementById('dev-info');
    if (!info || !game) return;
    const room = game.roomNameMap?.[game.position[0]]?.[game.position[1]] || "Unknown";
    info.textContent = `Ghost: ${String(game.ghost || '???').toUpperCase()} | Ghost Room: ${game.ghostRoom || '???'} | Player Room: ${room} | Sanity: ${game.sanity}%`;
  }

  // Initial info
  refreshInfo();

  // Optional: keep it fresh every few seconds
  setInterval(refreshInfo, 2000);
}
