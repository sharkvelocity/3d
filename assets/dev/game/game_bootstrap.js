/* game_bootstrap.js — full bootstrap with map loader, player rig, and ghost integration
   - Loads manifest from assets/models/map/maps.json
   - Starts Babylon.js engine + scene
   - Imports selected map, applies MAP_DEF
   - Integrates player rig, WASD/PS5 movement, camera, physics
   - Automatically injects ghost_data.js
*/
(function () {
"use strict";
if (window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

// ---------- Logging ----------
const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

// ---------- Tiny Utilities ----------
const $  = (s)=> document.querySelector(s);
const bURL = (p)=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };
async function fetchJSON(url){
    try {
        const r = await fetch(bURL(url), { cache: "no-store" });
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return await r.json();
    } catch (e) { warn("fetchJSON failed:", url, e); return null; }
}
function loadScriptOnce(path){
    return new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = bURL(path) + (path.includes("?") ? "" : `?v=${Date.now()}`);
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

// ---------- Loader UI ----------
const Loader = (() => {
    const box  = ()=> $("#loading-box");
    const text = ()=> $("#loading-text");
    const fill = ()=> $("#loading-fill");
    let stepsDone = 0, stepsTotal = 0, queue = [];
    function show(){ const b=box(); if (b) b.style.display="flex"; }
    function hide(){ const b=box(); if (b) b.style.display="none"; }
    function label(s){ const t=text(); if (t) t.textContent = s || ""; }
    function draw(){ const f=fill(); if (!f) return; f.style.width = (stepsTotal? (stepsDone/stepsTotal)*100 : 0).toFixed(1)+"%"; }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    function addStep(lbl, fn){ queue.push({lbl, fn}); stepsTotal = queue.length; }
    async function run(){
        show(); draw();
        for (const s of queue){
            label(s.lbl); draw();
            try { await s.fn(); } catch(e){ warn("step failed:", s.lbl, e); }
            stepsDone++; draw();
        }
        label("Finalizing…"); draw();
        await new Promise(r=>setTimeout(r, 100));
        hide();
    }
    return { reset, addStep, run, show, hide, label };
})();

// ---------- State ----------
let engine = null, scene = null, camera = null;
let hemi = null;
let started = false;
let manifest = [];   // [{file, title, def?}]
let currentMap = null;

// ---------- Map List / Selector ----------
async function loadManifest() {
    try {
        const j = await fetchJSON("./assets/models/map/maps.json");
        if (Array.isArray(j)) manifest = j;
        else if (j && Array.isArray(j.maps)) manifest = j.maps;

        if (!manifest.length) {
            manifest = [
                { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
                { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
                { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
                { file: "apartment_floor_plan.glb", title: "Apartment",    def: "apartment_floor_plan.config.js" }
            ];
        }
        populateMapSelector();
        log("[bootstrap] Map manifest loaded:", manifest);
    } catch (e) {
        console.error("Failed to load map manifest:", e);
    }
}

function populateMapSelector(){
    const sel = $("#map-select");
    if (!sel) return;
    if (!manifest.length){
        sel.innerHTML = `<option value="-1">(no maps found)</option>`;
        return;
    }
    sel.innerHTML = manifest.map((m,i)=> `<option value="${i}">${m.title || m.file}</option>`).join("");
    try {
        const saved = localStorage.getItem("selectedMapIndex");
        if (saved && manifest[+saved]) sel.value = saved;
        else sel.value = "0";
    } catch(_){ sel.value = "0"; }
    sel.onchange = () => { try { localStorage.setItem("selectedMapIndex", sel.value); } catch(_){} };
}

function getSelectedMap(){
    const sel = $("#map-select");
    const idx = Math.max(0, Math.min(manifest.length-1, parseInt(sel?.value || "0", 10) || 0));
    return manifest[idx];
}

// ---------- Engine + Scene ----------
function createEngineScene(){
    if (engine && scene) return;
    const canvas = $("#renderCanvas");
    if (!canvas) throw new Error("Missing #renderCanvas");
    if (!window.BABYLON) throw new Error("BABYLON is not loaded");

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);
    scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor   = new BABYLON.Color3(0.02,0.03,0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inputs.clear();

    window.ENGINE = engine; window.SCENE = scene; window.camera = camera;

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());
    mark("engine+scene-created");
}

// ---------- Unified Map Loader ----------
async function loadMap(mapData){
    if(!scene) return;

    currentMap = {
        file: mapData.file,
        title: mapData.title || mapData.file,
        type: null,
        meshes: [],
        rooms: [],
        doors: [],
        spawn: new BABYLON.Vector3(0,1.8,0)
    };

    if(mapData.file.toLowerCase().endsWith(".glb")){
        const res = await BABYLON.SceneLoader.ImportMeshAsync(
            "", "./assets/models/map/", mapData.file, scene
        );
        currentMap.type = "glb";
        currentMap.meshes = res.meshes;
        currentMap.spawn = mapData.spawn ?
            new BABYLON.Vector3(mapData.spawn.x, mapData.spawn.y, mapData.spawn.z) :
            new BABYLON.Vector3(0,1.8,0);

        res.meshes.forEach(m => { 
            try { m.checkCollisions = true; m.receiveShadows = true; } catch(_){} 
        });

    } else if(mapData.file.toLowerCase().endsWith(".config.js")){
        currentMap.type = "procedural";
        if (window.MapGenerator) {
            await window.MapGenerator.spawnRooms();
            currentMap.rooms = window.MapGenerator.rooms || [];
            currentMap.doors = window.MapGenerator.doors || [];
            currentMap.meshes = window.MapGenerator.roomMeshes || [];
            const van = window.MapGenerator.getVanRoom && window.MapGenerator.getVanRoom();
            if(van){
                currentMap.spawn = new BABYLON.Vector3(van.position.x, 1.8, van.position.z);
            }
        }
    }

    window.__PP_SPAWN = currentMap.spawn.clone();

    if (typeof spawnPlayer === "function") spawnPlayer();

    // 🔥 Hook into ghost system
    if (window.GhostSystem?.onMapLoaded) {
        GhostSystem.onMapLoaded(currentMap, scene);
    }

    log("[MapLoader] Loaded:", currentMap.title, currentMap);
}

// ---------- Start Game ----------
async function startGame(){
    if (started) return;
    started = true;

    const title = document.querySelector("#title-screen");
    if (title) title.style.display = "none";

    log("[bootstrap] Starting game…");

    try {
        Loader.reset();
        Loader.addStep("Preparing engine…", async () => createEngineScene());

        Loader.addStep("Loading map…", async () => {
            const mapData = getSelectedMap();
            await loadMap(mapData);
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
            enablePointerLockOnce?.();
        });

        await Loader.run();
        window.dispatchEvent(new CustomEvent("pp:start"));
        log("[bootstrap] Game started successfully.");
        try { $("#renderCanvas")?.focus?.(); } catch{}

    } catch (err) {
        console.error("[bootstrap] Error starting game:", err);
        started = false;
        if (title) title.style.display = "flex";
        alert("Boot failed. Check console for details.");
    }
}

// ---------- DOM Ready ----------
document.addEventListener("DOMContentLoaded", async () => {
    // 🔥 Inject ghost_data.js first
    await loadScriptOnce("./assets/dev/ghost_data.js");
    log("[bootstrap] ghost_data.js injected");

    // Load maps and hook up UI
    await loadManifest();
    $("#start-button")?.addEventListener("click", startGame, { once:true });
});
})();
