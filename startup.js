// startup.js
/* global BABYLON */
const $ = (id) => document.getElementById(id);

const LOADOUT = [
  "EMF","Spirit Box","Thermometer","Notebook",
  "Photo Camera","Flashlight","Thermal Camera","Voice Recorder","UV Light","D.O.T.S"
];

// ---------- Startup / Loadout ----------
function buildLoadoutChooser() {
  const box = $("loadoutBox");
  if (!box) return;
  box.innerHTML = "";
  LOADOUT.forEach((name) => {
    const id = "ld_" + name.replace(/\W+/g, "_");
    const def = (name === "Notebook" || name === "EMF" || name === "Spirit Box" || name === "Thermometer");
    const wrap = document.createElement("label");
    wrap.style.marginRight = "10px";
    wrap.innerHTML = `<input type="checkbox" id="${id}" ${def ? "checked" : ""}> ${name}`;
    box.appendChild(wrap);
  });
}

function wireStartButton() {
  const btn = $("startBtn");
  if (!btn || btn.__wired) return;
  btn.addEventListener("click", async () => {
    // hide start overlay
    const start = $("start");
    if (start) start.style.display = "none";

    // push selections into the global game object (created by your main code)
    const g = (window.game = window.game || {});
    g.mapFile = $("preMap")?.value || g.mapFile || "Abandoned_House.glb";
    g.spawnChoice = $("preSpawn")?.value || g.spawnChoice || "van";
    g.weather = $("preWeather")?.value || g.weather || "Clear";
    g.loadout = [];
    LOADOUT.forEach((name) => {
      const id = "ld_" + name.replace(/\W+/g, "_");
      const c = $(id);
      if (c && c.checked) g.loadout.push(name);
    });
    if (g.loadout.length > 5) g.loadout = g.loadout.slice(0, 5);

    // kick your existing boot if provided
    if (typeof window.boot === "function") {
      try {
        await window.boot();
      } catch (e) {
        console.error("boot() failed:", e);
        showBoot("[Startup] boot() failed: " + (e?.message || e));
      }
    } else {
      showBoot("[Startup] window.boot() not found. Ensure your main script defines boot().");
    }
  });
  btn.__wired = true;

  // also support Enter/Space to start if overlay visible
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const st = $("start");
      if (st && getComputedStyle(st).display !== "none") {
        e.preventDefault();
        btn.click();
      }
    }
  });
}

function showBoot(msg) {
  const d = $("bootDiag");
  if (!d) return;
  d.style.display = "block";
  d.textContent = msg;
}

// ---------- Notebook (evidence list render) ----------
function buildNotebook() {
  const evBox = $("evBox");
  const ghostBox = $("ghostBox");
  if (!evBox || !ghostBox) return;

  const EVIDENCE = ["EMF 5","Spirit Box","Fingerprints","Freezing Temps","Ghost Writing","DOTS","Ghost Orb"];
  const selected = new Set();

  function renderGhostList() {
    // Use the same 25 ghosts list your main script defines (window.ghostProfiles)
    // If not available yet, just show placeholder text.
    ghostBox.innerHTML = "";
    const gp = window.ghostProfiles;
    if (!gp) { ghostBox.textContent = "(ghost list populates after core script loads)"; return; }

    const names = Object.keys(gp).sort();
    const filter = Array.from(selected);
    names.forEach((g) => {
      const prof = gp[g];
      if (filter.length && !filter.every((ev) => (prof.evidence || []).includes(ev))) return;
      const row = document.createElement("div");
      row.style.margin = "6px 0";
      row.innerHTML = `<b>${g}</b> — <span class="muted">${(prof.evidence || []).join(", ")}</span><br><span class="muted" style="font-size:11px">${prof.info || ""}</span>`;
      ghostBox.appendChild(row);
    });
  }

  evBox.innerHTML = "";
  EVIDENCE.forEach((e) => {
    const id = "ev_" + e.replace(/\W+/g, "_");
    const label = document.createElement("label");
    label.style.marginRight = "8px";
    label.innerHTML = `<input type="checkbox" id="${id}"> ${e}`;
    evBox.appendChild(label);
    $(id).addEventListener("change", (evn) => {
      if (evn.target.checked) selected.add(e);
      else selected.delete(e);
      renderGhostList();
    });
  });

  renderGhostList();
}

// ---------- Dev Overlay (panel wiring + external overlay window) ----------
function wireDevOverlay() {
  const openBtn = $("devOpenBtn");
  const panel = $("devPanel");
  const prompt = $("devPrompt");
  const yes = $("devYes");
  const no = $("devNo");
  const closeDev = $("closeDev");
  const openExt = $("openExtOverlay");
  const toggleListen = $("toggleDevListen");

  if (openBtn) openBtn.onclick = () => (prompt.style.display = "flex");
  if (no) no.onclick = () => (prompt.style.display = "none");
  if (yes) {
    yes.onclick = () => {
      prompt.style.display = "none";
      panel.style.display = "flex";
      toast("Developer options enabled");
    };
  }
  if (closeDev) closeDev.onclick = () => (panel.style.display = "none");

  // External overlay
  let overlayWin = null;
  function postToOverlay(payload) {
    if (overlayWin && !overlayWin.closed) {
      try { overlayWin.postMessage(payload, "*"); } catch {}
    }
  }
  if (openExt) {
    openExt.onclick = () => {
      try {
        overlayWin = window.open("./devtools_overlay.html", "devtools_overlay", "width=560,height=760");
        setTimeout(() => postToOverlay({ type: "handshake", hello: true }), 400);
      } catch (e) {
        toast("Popup blocked. Allow popups for this site.");
      }
    };
  }

  // Listen mode — stream logs & telemetry
  let listenOn = false;
  let ticker = null;

  // piggyback the on-page dev log if present
  const devLog = $("devLog");
  function appendLog(line) {
    if (devLog) {
      devLog.textContent += line + "\n";
      devLog.scrollTop = devLog.scrollHeight;
    }
  }

  // patch toast so both in-page and external overlay get messages
  const oldToast = window.toast || ((m) => console.log("[DEV]", m));
  window.toast = function (msg) {
    oldToast(msg);
    appendLog(msg);
    postToOverlay({ type: "log", text: String(msg) });
  };

  function startListen() {
    if (ticker) return;
    ticker = setInterval(() => {
      const g = window.game || {};
      const cam = g.camera || {};
      const cap = g.playerCapsule || {};
      const ghost = g.ghostPivot || {};
      const payload = {
        type: "telemetry",
        player: {
          x: (cap.position && cap.position.x) || (cam.position && cam.position.x) || 0,
          y: (cap.position && cap.position.y) || (cam.position && cam.position.y) || 0,
          z: (cap.position && cap.position.z) || (cam.position && cam.position.z) || 0,
          room: document.getElementById("roomName")?.textContent || ""
        },
        ghost: ghost.position
          ? { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z }
          : null,
        meta: {
          hunting: !!(g.ghost && g.ghost.hunting),
          weather: g.weather || ""
        }
      };
      postToOverlay(payload);
    }, 1000);
  }
  function stopListen() { if (ticker) { clearInterval(ticker); ticker = null; } }

  if (toggleListen) {
    toggleListen.onclick = () => {
      listenOn = !listenOn;
      toggleListen.textContent = listenOn ? "Disable Dev Listen" : "Enable Dev Listen";
      toast(`Dev Listen: ${listenOn ? "ON" : "OFF"}`);
      if (listenOn) startListen(); else stopListen();
    };
  }
}

// ---------- Safe boot diagnostics ----------
function safeBootProbe() {
  setTimeout(() => {
    const msg = [
      "[SafeBoot] Babylon: " + (!!(window.BABYLON && BABYLON.Engine) ? "OK" : "MISSING"),
      "Start overlay in DOM: " + !!$("start"),
      "Start overlay visible: " + ($("start") ? getComputedStyle($("start")).display !== "none" : "n/a"),
      "HUD visible: " + !!$("hud")
    ].join("\n");
    const d = $("bootDiag");
    if (d) { d.style.display = "block"; d.textContent = msg; }
  }, 800);
}

// ---------- Init (non-destructive; works alongside your main script) ----------
(function init() {
  buildLoadoutChooser();
  buildNotebook();
  wireStartButton();
  wireDevOverlay();
  safeBootProbe();

  // handy hotkeys
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && (e.key === "D" || e.key === "d")) {
      const p = $("devPanel");
      if (p) p.style.display = "flex";
    }
    if (e.ctrlKey && e.altKey && (e.key === "S" || e.key === "s")) {
      const s = $("start");
      if (s) s.style.display = "flex";
    }
  });
})();
