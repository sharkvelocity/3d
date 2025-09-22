/* bootstrap.js — full bootstrap with ProHouse generator, ghost system, PS5 controls, player rig, map loader, and player movement */
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
let mapRoot=null;
let currentMap=null;

// ---------- Map Manifest / Selector ----------
window.PP = window.PP || {};
PP.manifest = [];

async function loadManifest() {
    const j = await fetchJSON("./assets/models/map/maps.json");
    if (Array.isArray(j)) PP.manifest = j;
    else if (j && Array.isArray(j.maps)) PP.manifest = j.maps;

    if (!PP.manifest.length) {
        PP.manifest = [
            { file: "Abandoned_House.glb", title: "Abandoned House", def: "Abandoned_House.config.js" },
            { file: "furnished_house.glb",  title: "Furnished House",  def: "furnished_house.js" },
            { file: "jailhouse.glb",        title: "Jailhouse",        def: "jailhouse.config.js" },
            { file: "apartment_floor_plan.glb", title: "Apartment",    def: "" }
        ];
    }

    populateMapSelector();
}

function populateMapSelector() {
    const sel = document.querySelector("#map-select");
    if (!sel) return;

    if (!PP.manifest.length) {
        sel.innerHTML = `<option value="-1">(no maps found)</option>`;
        return;
    }

    sel.innerHTML = PP.manifest.map((m, i) => 
        `<option value="${i}">${m.title || m.file}</option>`
    ).join("");

    try {
        const saved = localStorage.getItem("selectedMapIndex");
        if (saved && PP.manifest[+saved]) sel.value = saved;
        else sel.value = "0";
    } catch (_) { sel.value = "0"; }

    sel.onchange = () => {
        try { localStorage.setItem("selectedMapIndex", sel.value); } catch(_) {}
    };
}

function getSelectedMap() {
    const sel = document.querySelector("#map-select");
    const idx = Math.max(0, Math.min(PP.manifest.length - 1, parseInt(sel?.value || "0", 10)));
    return PP.manifest[idx];
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
    await loadScriptOnce("./assets/dev/ghost/ghost_db.js");
    await loadScriptOnce("./assets/dev/ghost/phasma_map_and_ghost.js");
    await loadScriptOnce("./assets/dev/ui/ps5_controller.js");
    mark("ghosts+ps5-loaded");
}

// ---------- Map Loader ----------
async function loadMap(mapData){
    if(!scene) return;
    if(typeof clearMap === "function") clearMap();

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

    if(typeof spawnPlayer === "function") spawnPlayer();
    if(window.GhostSystem?.onMapLoaded) GhostSystem.onMapLoaded(currentMap,scene);
    log("[MapLoader] Loaded:", mapData.title||mapData.file,currentMap);
}

// ---------- Player Rig (full WASD + PS5 + mouse + physics + animations) ----------
(async function(){
    if(window.__PP_RIG_READY__) return;
    window.__PP_RIG_READY__ = true;

    const PP = window.PP = window.PP || {};
    PP.rig = PP.rig || {};
    PP.state = PP.state || {};
    PP.controls = PP.controls || {};

    const AVATAR = { file:"./assets/models/player/player.glb", eyeY:1.6, targetHeight:1.75, meshYOffset:0.0 };
    const CAM3 = { back:2.8, up:1.25 };
    const SPEEDS = { walk:1.8, run:3.5, crouch:1.0 };
    const MAX_SLOPE = 45;

    let scene, camera;
    let body, avatarRoot, avatarMeshes=[];
    let isThird=false;
    let animations={ idle:null, walk:null, crouch:null };
    let currentAnim=null;

    const input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
    let lastCrouchPressed=false;
    const keysDown = {};
    const mouse = { dx:0, dy:0, locked:false };
    const gamepad = { axes:[0,0], buttons:[] };

    const defaultKeys = {
        forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"],
        left:["KeyA","ArrowLeft"], right:["KeyD","ArrowRight"],
        sprint:["ShiftLeft","ShiftRight"], crouch:["KeyC"],
        toggleCamera:["Backquote"], slots:["Digit1","Digit2","Digit3","Digit4"],
        notebook:["KeyN"], use:["KeyE"], openDoor:["KeyF"],
        flash:["KeyQ"], uv:["KeyU"], ir:["KeyI"],
        lightToggle:["KeyL"], powerToggle:["KeyP"], minimap:["KeyM"]
    };

    function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name,{detail})); }catch{} }
    function has(arr, code){ return Array.isArray(arr)&&arr.includes(code); }
    function uiBusy(){ const ae=document.activeElement; return ae&&(ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.isContentEditable); }

    function selectSlot(n){
        n=Math.max(1,Math.min(3,n|0));
        const prev=PP.state.selectedSlot;
        if(prev===n){ emit("pp:slot:confirm",{slot:n}); return; }
        PP.state.selectedSlot=n;
        emit("pp:slot:change",{prev,next:n});
        if(typeof window.selectSlot==="function") window.selectSlot(n);
        if(typeof window.buildBelt==="function"){ try{ window.buildBelt(null); }catch{} }
    }

    // Keyboard
    addEventListener("keydown",(e)=>{
        if(uiBusy()) return;
        keysDown[e.code]=true;
        if(has(defaultKeys.forward,e.code)) input.forward=true;
        if(has(defaultKeys.back,e.code)) input.back=true;
        if(has(defaultKeys.left,e.code)) input.left=true;
        if(has(defaultKeys.right,e.code)) input.right=true;
        if(has(defaultKeys.sprint,e.code)) input.run=true;
        if(has(defaultKeys.crouch,e.code)) input.crouch=!input.crouch;
        if(has(defaultKeys.toggleCamera,e.code)) { isThird=!isThird; e.preventDefault(); }
        if(has(defaultKeys.slots,e.code)){
            const n=parseInt(e.code.replace(/\D/g,""))||0;
            if(n>=1&&n<=3) selectSlot(n);
        }
    },true);

    addEventListener("keyup",(e)=>{
        keysDown[e.code]=false;
        if(has(defaultKeys.forward,e.code)) input.forward=false;
        if(has(defaultKeys.back,e.code)) input.back=false;
        if(has(defaultKeys.left,e.code)) input.left=false;
        if(has(defaultKeys.right,e.code)) input.right=false;
        if(has(defaultKeys.sprint,e.code)) input.run=false;
    },true);

    // Mouse
    const canvas = document.querySelector("canvas");
    if(canvas){
        canvas.addEventListener("click",()=>{ if(!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
        document.addEventListener("pointerlockchange",()=>{ mouse.locked = (document.pointerLockElement===canvas); });
        document.addEventListener("mousemove",(e)=>{
            if(!mouse.locked) return;
            mouse.dx = e.movementX; mouse.dy = e.movementY;
            emit("pp:mouseMove",{dx:mouse.dx,dy:mouse.dy});
        });
    }

    // Gamepad
    function pollGamepad(){
        const pads=navigator.getGamepads?.(); if(!pads) return;
        const pad=pads[0]; if(!pad) return;
        gamepad.axes=[pad.axes[0],pad.axes[1]];
        gamepad.buttons=pad.buttons.map(b=>b.pressed);
        input.left = gamepad.axes[0]<-0.2; input.right=gamepad.axes[0]>0.2;
        input.forward = gamepad.axes[1]<-0.2; input.back=gamepad.axes[1]>0.2;
        input.run = gamepad.buttons[0];
        if(gamepad.buttons[1] && !lastCrouchPressed) input.crouch = !input.crouch;
        lastCrouchPressed=gamepad.buttons[1];
        requestAnimationFrame(pollGamepad);
    }
    pollGamepad();

    // Scene / spawn
    function ensureScene(){ scene = scene || window.SCENE || BABYLON.EngineStore?.LastCreatedScene; camera = scene?.activeCamera; return !!(scene && camera); }
    function getSpawnPosition(){ if(window.MAP_DEF?.spawn) return new BABYLON.Vector3(MAP_DEF.spawn.x||0,MAP_DEF.spawn.y||AVATAR.eyeY,MAP_DEF.spawn.z||0); if(window.__PP_SPAWN) return window.__PP_SPAWN.clone(); return new BABYLON.Vector3(0,AVATAR.eyeY,0); }

    function makeBody(){
        body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule",{ height:AVATAR.targetHeight, radius:0.35 },scene);
        body.isVisible=false; body.position.copyFrom(getSpawnPosition());
        body.physicsImpostor=new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
        PP.rig.body = body; return body;
    }

    async function loadAvatar(){
        const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
        const root = res.meshes[0];
        normalizeAvatarScale(root);
        res.animationGroups.forEach(g=>{
            if(/Idle/i.test(g.name)) animations.idle=g;
            if(/Walk/i.test(g.name)) animations.walk=g;
            if(/Crouch/i.test(g.name)) animations.crouch=g;
        });
        playAnim("idle");
    }

    function normalizeAvatarScale(root){
        root.scaling.setAll(1);
        const bb=root.getHierarchyBoundingVectors();
        const rawH=bb.max.y-bb.min.y;
        const scale=AVATAR.targetHeight/rawH;
        root.scaling.setAll(scale);
        const bb2=root.getHierarchyBoundingVectors();
        root.position.y -= bb2.min.y;
        avatarRoot=root;
        avatarMeshes=root.getChildMeshes();
        avatarRoot.parent=body;
    }

    function playAnim(name){
        if(currentAnim===animations[name]) return;
        Object.values(animations).forEach(g=>g?.stop());
        animations[name]?.start(true);
        currentAnim=animations[name];
    }

    function syncCamera(){
        if(!camera||!body) return;
        const pos=body.position;
        if(!isThird) camera.position.set(pos.x,pos.y+AVATAR.eyeY,pos.z);
        else{
            const eye=new BABYLON.Vector3(pos.x,pos.y+AVATAR.eyeY,pos.z);
            const back=camera.getDirection(BABYLON.Vector3.Forward()).scale(-CAM3.back);
            camera.position.copyFrom(eye.add(new BABYLON.Vector3(0,CAM3.up,0)).add(back));
            camera.setTarget(eye);
        }
    }

    function stickToGround(moveDir){
        if(!body||!scene) return moveDir;
        const origin=body.position.add(new BABYLON.Vector3(0,1,0));
        const ray=new BABYLON.Ray(origin,BABYLON.Axis.Y.scale(-1),4);
        const pick=scene.pickWithRay(ray,m=>m.isPickable && m.name.toLowerCase().includes("ground"));
        if(!pick.hit) return moveDir;
        const groundPoint=pick.pickedPoint;
        const groundNormal=pick.getNormal(true);
        body.position.y = groundPoint.y + AVATAR.targetHeight/2;
        if(moveDir && moveDir.lengthSquared()>0.001){
            const slopeAngle=BABYLON.Vector3.GetAngleBetweenVectors(BABYLON.Axis.Y,groundNormal,BABYLON.Vector3.Forward())*(180/Math.PI);
            if(slopeAngle<=MAX_SLOPE) return moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir,groundNormal))).normalize();
            else return BABYLON.Vector3.Zero();
        }
        return moveDir||BABYLON.Vector3.Zero();
    }

    const footstepState = { lastPos:null, acc:0 };
    function handleFootsteps(moveVec){
        if(!moveVec || moveVec.lengthSquared()<0.001 || !body) return;
        if(!footstepState.lastPos) footstepState.lastPos=body.position.clone();
        const dist = BABYLON.Vector3.Distance(footstepState.lastPos, body.position);
        footstepState.acc += dist;
        const stride = input.crouch ? 0.3 : input.run ? 0.8 : 0.5;
        if(footstepState.acc >= stride){
            footstepState.acc=0;
            footstepState.lastPos.copyFrom(body.position);
            if(typeof window.playStep==="function") try{ window.playStep(0.42); }catch{}
        }
    }

    function moveLoop(){
        if(!ensureScene()){ requestAnimationFrame(moveLoop); return; }
        const dt=scene.getEngine().getDeltaTime()/1000;
        const forward=camera.getDirection(BABYLON.Vector3.Forward()).normalize();
        const right=camera.getDirection(BABYLON.Vector3.Right()).normalize();

        let move=new BABYLON.Vector3(0,0,0);
        if(input.forward) move.addInPlace(forward);
        if(input.back) move.subtractInPlace(forward);
        if(input.left) move.subtractInPlace(right);
        if(input.right) move.addInPlace(right);

        if(move.lengthSquared()>0.001){
            move.normalize();
            const speed=input.crouch?SPEEDS.crouch:(input.run?SPEEDS.run:SPEEDS.walk);
            const slopeMove=stickToGround(move);
            if(slopeMove.lengthSquared()>0.001) body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());
            playAnim(input.crouch?"crouch":"walk");
            handleFootsteps(slopeMove);
        } else playAnim("idle");

        stickToGround();
        syncCamera();
        requestAnimationFrame(moveLoop);
    }

    async function startRig(){
        if(!ensureScene()){ setTimeout(startRig,100); return; }
        const havok = await HavokPhysics();
        scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));
        makeBody();
        stickToGround(BABYLON.Vector3.Zero());
        await loadAvatar();
        stickToGround(BABYLON.Vector3.Zero());
        moveLoop();

        window.PP = window.PP || {};
        window.PP.rigReady = true;
        document.dispatchEvent(new Event("pp:rig-ready"));
    }

    startRig();
})();

// ---------- Start Game ----------
async function startGame() {
    if (started) return;
    started = true;

    const titleScreen = document.getElementById("title-screen");
    if (titleScreen) titleScreen.style.display = "none";

    log("[bootstrap] Starting game…");

    const STEP_TIMEOUT = 10000;

    function safeStep(label, fn) {
        Loader.addStep(label, async () => {
            try {
                await Promise.race([
                    fn(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error("Step timeout")), STEP_TIMEOUT))
                ]);
            } catch (e) {
                console.error(`[bootstrap] Step "${label}" failed:`, e);
            }
        });
    }

    try {
        Loader.reset();

        safeStep("Preparing engine…", () => createEngineScene());
        safeStep("Injecting ghosts & PS5 controller…", () => injectGhostsAndPS5());
        safeStep("Loading map…", async () => {
            const mapData = getSelectedMap();
            await loadMap(mapData);
        });
        safeStep("Initializing logger…", () => loadScriptOnce("./assets/dev/game/logger.js"));
        safeStep("Loading player rig…", async () => {
            await new Promise(r => {
                const timeout = setTimeout(() => { console.warn("Rig ready event timeout"); r(); }, STEP_TIMEOUT);
                if(window.PP?.rigReady) r();
                document.addEventListener("pp:rig-ready", () => { clearTimeout(timeout); r(); }, { once: true });
            });
            log("[bootstrap] Player rig ready");
        });
        safeStep("Initializing player physics & movement…", () => {});
        safeStep("Finalizing…", () => { if (window.__PP_SPAWN && camera) camera.position.copyFrom(window.__PP_SPAWN); enablePointerLockOnce(); });

        await Loader.run();

        window.dispatchEvent(new CustomEvent("pp:start"));
        log("[bootstrap] Game started successfully.");
        try { $("#renderCanvas")?.focus?.(); } catch {}

    } catch (err) {
        console.error("[bootstrap] Error starting game:", err);
        started = false;
        const titleScreen = document.getElementById("title-screen");
        if (titleScreen) titleScreen.style.display = "flex";
        alert("Boot failed. Check console for details.");
    }
}

// ---------- Settings Menu ----------
(function(){
    if(window.__PP_SETTINGS_MENU__) return;
    window.__PP_SETTINGS_MENU__ = true;

    const menuHTML = `
    <div id="pp-settings-menu" style="
        position: fixed; top: 10%; right: 10%;
        width: 300px; background: rgba(0,0,0,0.85); color: white; padding: 15px;
        font-family: sans-serif; font-size: 14px; border-radius: 8px; z-index: 9999;
        display: none; flex-direction: column; gap: 10px;
    ">
        <h3 style="margin:0 0 10px 0;">Player Settings</h3>
        <label>Walk Speed: <input id="pp-walk-speed" type="number" step="0.1"></label>
        <label>Run Speed: <input id="pp-run-speed" type="number" step="0.1"></label>
        <label>Crouch Speed: <input id="pp-crouch-speed" type="number" step="0.1"></label>
        <label>Stand Multiplier: <input id="pp-stand-mult" type="number" step="0.1"></label>
        <button id="pp-toggle-menu">Close Menu</button>
    </div>
    `;

    const div = document.createElement("div");
    div.innerHTML = menuHTML;
    document.body.appendChild(div);

    const menu = document.getElementById("pp-settings-menu");
    const walkInp = document.getElementById("pp-walk-speed");
    const runInp = document.getElementById("pp-run-speed");
    const crouchInp = document.getElementById("pp-crouch-speed");
    const standInp = document.getElementById("pp-stand-mult");
    const toggleBtn = document.getElementById("pp-toggle-menu");

    function updateInputs(){
        walkInp.value = window.PP?.rig?.controller?.SPEEDS?.walk ?? 1.8;
        runInp.value = window.PP?.rig?.controller?.SPEEDS?.run ?? 3.5;
        crouchInp.value = window.PP?.rig?.controller?.SPEEDS?.crouch ?? 1.0;
        standInp.value = window.PLAYER?.standHeight && window.PLAYER.crouchHeight 
            ? (window.PLAYER.standHeight / window.PLAYER.crouchHeight) 
            : 2.0;
    }

    function applySettings(){
        const c = window.PP?.rig?.controller;
        if(c?.SPEEDS){
            c.SPEEDS.walk = parseFloat(walkInp.value) || c.SPEEDS.walk;
            c.SPEEDS.run = parseFloat(runInp.value) || c.SPEEDS.run;
            c.SPEEDS.crouch = parseFloat(crouchInp.value) || c.SPEEDS.crouch;
        }
        if(window.PLAYER && window.PLAYER.crouchHeight){
            const mult = parseFloat(standInp.value) || 2.0;
            window.PLAYER.setStandMultiplier(mult);
        }
    }

    [walkInp, runInp, crouchInp, standInp].forEach(input => {
        input.addEventListener("change", applySettings);
        input.addEventListener("input", applySettings);
    });

    toggleBtn.addEventListener("click", () => {
        menu.style.display = "none";
    });

    window.addEventListener("keydown", (e) => {
        if(e.code === "F1"){
            menu.style.display = (menu.style.display === "flex" ? "none" : "flex");
            updateInputs();
            e.preventDefault();
        }
    });

    console.log("[PP] Settings menu initialized (F1 to toggle)");
})();

// ---------- DOM Ready ----------
document.addEventListener("DOMContentLoaded", () => {
    loadManifest().catch(e => console.error("Failed to load map manifest:", e));
    const startBtn = document.getElementById("start-button");
    if(startBtn) startBtn.addEventListener("click", startGame, { once: true });
});
