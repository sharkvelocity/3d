// ./assets/dev/game_bootstrap.js
// Main bootstrapper for initializing game engine, maps, player, physics, ghosts, etc.

"use strict";

let engine, scene, camera;
let started = false;
let title = document.getElementById("title-screen");

// ---------- Logging ----------
function log(...args) { console.log(...args); }

// ---------- Loader ----------
const Loader = {
    steps: [],
    reset() { this.steps = []; },
    addStep(label, fn) { this.steps.push({ label, fn }); },
    async run() {
        for (const step of this.steps) {
            log("[bootstrap] Step:", step.label);
            await step.fn();
        }
    }
};

// ---------- Utilities ----------
async function loadScriptOnce(url) {
    if (document.querySelector(`script[src="${url}"]`)) return;
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
    });
}

// ---------- Engine + Scene ----------
async function createEngineScene() {
    const canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true);
    scene = new BABYLON.Scene(engine);
    window.scene = scene;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.6, 0), scene);
    camera.attachControl(canvas, true);
    window.camera = camera;

    const light = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    engine.runRenderLoop(() => {
        if (scene.activeCamera) scene.render();
    });

    window.addEventListener("resize", () => engine.resize());
}

// ---------- Maps ----------
function getSelectedMap() {
    const sel = document.getElementById("map-select");
    if (!sel) return null;
    return window.MAP_MANIFEST?.[sel.value] || null;
}

async function loadMap(mapData) {
    if (!mapData) throw new Error("No map data selected.");
    log("[bootstrap] Loading map:", mapData);

    if (mapData.type === "procedural") {
        await loadScriptOnce(mapData.script);
        if (typeof window.spawnProceduralMap === "function") {
            await window.spawnProceduralMap(scene);
        }
    }
    if (mapData.glb) {
        await BABYLON.SceneLoader.AppendAsync(mapData.baseUrl || "./", mapData.glb, scene);
    }
}

// ---------- Pointer lock ----------
function enablePointerLockOnce() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return;
    canvas.addEventListener("click", () => {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.msRequestPointerLock;
        if (canvas.requestPointerLock) canvas.requestPointerLock();
    }, { once: true });
}

// ---------- Game Start ----------
async function startGame() {
    if (started) return;
    started = true;
    log("[bootstrap] Starting game…");

    try {
        Loader.reset();

        Loader.addStep("Preparing engine…", async () => createEngineScene());

        Loader.addStep("Loading map…", async () => {
            const mapData = getSelectedMap();
            await loadMap(mapData);
        });

        Loader.addStep("Injecting ghost data…", async () => {
            await loadScriptOnce("./assets/dev/data/ghost_data.js");
            if (window.GhostSystem?.init) {
                GhostSystem.init(scene);
                log("[bootstrap] Ghost system initialized.");
            }
        });

        Loader.addStep("Loading player rig…", async () => {
            await loadScriptOnce("./assets/dev/util/player_rig_controller_final.js");
            await new Promise((resolve) => {
                if (window.PP?.rigReady) return resolve();
                document.addEventListener("pp:rig-ready", resolve, { once: true });
            });
            log("[bootstrap] Player rig ready");
        });

        Loader.addStep("Initializing player physics & movement…", async () => {
            const body = window.PP?.rig?.body;
            if (!body) return;
            if (!body.physicsImpostor) {
                body.physicsImpostor = new BABYLON.PhysicsImpostor(
                    body,
                    BABYLON.PhysicsImpostor.CapsuleImpostor,
                    { mass: 80, restitution: 0, friction: 0.5 },
                    scene
                );
            }
            if (camera && body) {
                camera.parent = body;
                camera.position.set(0, 1.6, 0);
            }
            if (window.PP?.rig?.controller?.enable) {
                window.PP.rig.controller.enable(scene);
            }
        });

        Loader.addStep("Finalizing…", async () => {
            if (window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
            enablePointerLockOnce();
        });

        await Loader.run();

        window.dispatchEvent(new CustomEvent("pp:start"));
        log("[bootstrap] Game started successfully.");

        try { document.getElementById("renderCanvas")?.focus?.(); } catch {}

    } catch (err) {
        console.error("[bootstrap] Error starting game:", err);
        started = false;
        if (title) title.style.display = "flex";
        alert("Boot failed. Check console for details.");
    }
}

// ---------- DOM Ready ----------
async function loadManifest() {
    try {
        await loadScriptOnce("./assets/dev/maps_manifest.js");
        log("[bootstrap] Map manifest loaded");
    } catch (e) {
        console.error("Failed to load map manifest:", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadManifest();
    document.getElementById("start-button")?.addEventListener("click", startGame, { once: true });
});
