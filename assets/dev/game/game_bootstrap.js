/* game_bootstrap.js — full bootstrap with ProHouse generator, ghost system, PS5 controls, player rig, and map loader */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };
const mark = (lbl, extra)=>{ try{ window.BOOTLOG?.mark(lbl, extra); }catch{} };

const $ = s=>document.querySelector(s);
const bURL = p=> { try { return new URL(p, document.baseURI).toString(); } catch { return p; } };

async function fetchJSON(url){
    try{
        const r = await fetch(bURL(url),{ cache:"no-store" });
        if(!r.ok) throw new Error(r.status+" "+r.statusText);
        return await r.json();
    }catch(e){ warn("fetchJSON failed:", url,e); return null; }
}

function loadScriptOnce(path){
    return new Promise(resolve=>{
        if(document.querySelector(`script[src="${path}"]`)) return resolve(true);
        const s = document.createElement("script");
        s.src = bURL(path)+(path.includes("?")?"":`?v=${Date.now()}`);
        s.async=true;
        s.onload=()=>resolve(true);
        s.onerror=()=>resolve(false);
        document.head.appendChild(s);
    });
}

// ---------- Loader UI ----------
const Loader = (()=>{
    const box=()=>$("#loading-box");
    const text=()=>$("#loading-text");
    const fill=()=>$("#loading-fill");
    let stepsDone=0, stepsTotal=0, queue=[];
    function show(){ const b=box(); if(b)b.style.display="flex"; }
    function hide(){ const b=box(); if(b)b.style.display="none"; }
    function label(s){ const t=text(); if(t)t.textContent=s||""; }
    function draw(){ const f=fill(); if(f) f.style.width = (stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
    function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
    function addStep(lbl, fn){ queue.push({lbl,fn}); stepsTotal=queue.length; }
    async function run(){
        show(); draw();
        for(const s of queue){
            label(s.lbl); draw();
            try{ await s.fn(); }catch(e){ warn("step failed:", s.lbl,e); }
            stepsDone++; draw();
        }
        label("Finalizing…"); draw();
        await new Promise(r=>setTimeout(r,100));
        hide();
    }
    return {reset, addStep, run, show, hide, label};
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;
let manifest=[];
let mapRoot=null;
let currentMap=null;

// ---------- Map Manifest ----------
async function loadManifest(){
    let j = await fetchJSON("./assets/models/map/maps.json");
    if(Array.isArray(j)) manifest=j;
    else if(j && Array.isArray(j.maps)) manifest=j.maps;
    if(!manifest.length){
        manifest=[
            {file:"prohouse_placeholder.glb", title:"ProHouse", def:"prohouse_generator.js"},
            {file:"Abandoned_House.glb", title:"Abandoned House", def:"Abandoned_House.config.js"},
            {file:"furnished_house.glb",  title:"Furnished House",  def:"furnished_house.js"}
        ];
    }
    populateMapSelector();
}

function populateMapSelector(){
    const sel=$("#map-select");
    if(!sel) return;
    if(!manifest.length){ sel.innerHTML=`<option value="-1">(no maps found)</option>`; return; }
    sel.innerHTML = manifest.map((m,i)=>`<option value="${i}">${m.title||m.file}</option>`).join("");
    try{
        const saved = localStorage.getItem("selectedMapIndex");
        if(saved && manifest[+saved]) sel.value = saved;
        else sel.value="0";
    }catch(_){ sel.value="0"; }
    sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch{} };
}

function getSelectedMap(){
    const sel=$("#map-select");
    const idx = Math.max(0, Math.min(manifest.length-1, parseInt(sel?.value||"0",10)||0));
    return manifest[idx];
}

// ---------- Engine & Scene ----------
function createEngineScene(){
    if(engine && scene) return;
    const canvas=$("#renderCanvas");
    if(!canvas) throw new Error("Missing #renderCanvas");
    if(!window.BABYLON) throw new Error("BABYLON is not loaded");

    engine = new BABYLON.Engine(canvas,true,{ preserveDrawingBuffer:true, stencil:true, antialias:true });
    scene  = new BABYLON.Scene(engine);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new BABYLON.Color3(0.02,0.03,0.05);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.35;

    camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0,1.8,0), scene);
    camera.minZ = 0.1;
    camera.inputs.clear();

    window.ENGINE=engine; window.SCENE=scene; window.camera=camera;

    engine.runRenderLoop(()=>scene.render());
    window.addEventListener("resize",()=>engine.resize());
    mark("engine+scene-created");
}

// ---------- Ghosts & PS5 Injection ----------
async function injectGhostsAndPS5(){
    await loadScriptOnce("./assets/dev/ghost/ghost_data.js");
    await loadScriptOnce("./assets/dev/ui/ps5_controller.js");
    mark("ghosts+ps5-loaded");
}

// ---------- Map Loader ----------
async function loadMap(mapData){
    if(!scene) return;
    clearMap?.();

    if(mapData.def && mapData.def.includes("prohouse_generator")){
        if(!window.ProHouseGenerator) await loadScriptOnce("./assets/models/map/prohouse_generator.js");
        currentMap = await window.ProHouseGenerator.generateMap(scene);
    } else if(mapData.file.toLowerCase().endsWith(".glb")){
        const res = await BABYLON.SceneLoader.ImportMeshAsync(
            "", "./assets/models/map/", mapData.file, scene
        );
        currentMap = { meshes: res.meshes, rooms: [], doors: [], spawn: mapData.spawn||new BABYLON.Vector3(0,1.8,0) };
        res.meshes.forEach(m=>{ try{ m.checkCollisions=true; m.receiveShadows=true; }catch{} });
    }

    if(currentMap && currentMap.spawn) window.__PP_SPAWN = currentMap.spawn.clone();

    spawnPlayer?.();
    if(window.GhostSystem?.onMapLoaded) GhostSystem.onMapLoaded(currentMap,scene);
    log("[MapLoader] Loaded:", mapData.title||mapData.file,currentMap);
}

// ---------- Start Game ----------
async function startGame(){
    if(started) return;
    started=true;
    $("#title-screen")?.style.display="none";
    log("[bootstrap] Starting game…");

    try{
        Loader.reset();
        Loader.addStep("Preparing engine…", async ()=>createEngineScene());
        Loader.addStep("Injecting ghosts & PS5 controller…", async ()=>injectGhostsAndPS5());
        Loader.addStep("Loading map…", async ()=>{
            const mapData=getSelectedMap();
            await loadMap(mapData);
        });
        Loader.addStep("Loading player rig…", async ()=>{
            await loadScriptOnce("./assets/dev/util/player_rig_controller_final.js");
            await new Promise(r=>{
                if(window.PP?.rigReady) return r();
                document.addEventListener("pp:rig-ready",r,{once:true});
            });
            log("[bootstrap] Player rig ready");
        });
        Loader.addStep("Initializing player physics & movement…", async ()=>{
            const body=window.PP?.rig?.body;
            if(body && !body.physicsImpostor){
                body.physicsImpostor=new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{ mass:80, restitution:0, friction:0.5 }, scene);
            }
            if(camera && body){ camera.parent=body; camera.position.set(0,1.6,0); }
            if(window.PP?.rig?.controller?.enable) window.PP.rig.controller.enable(scene);
        });
        Loader.addStep("Finalizing…", async ()=>{
            if(window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN);
            enablePointerLockOnce();
        });

        await Loader.run();
        window.dispatchEvent(new CustomEvent("pp:start"));
        log("[bootstrap] Game started successfully.");
        try{ $("#renderCanvas")?.focus?.(); }catch{}
    }catch(err){
        console.error("[bootstrap] Error starting game:",err);
        started=false;
        $("#title-screen")?.style.display="flex";
        alert("Boot failed. Check console for details.");
    }
}

// ---------- DOM Ready ----------
document.addEventListener("DOMContentLoaded",()=>{
    loadManifest().catch(e=>console.error("Failed to load map manifest:",e));
    $("#start-button")?.addEventListener("click",startGame,{once:true});
});
