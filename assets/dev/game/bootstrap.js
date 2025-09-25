/* bootstrap.js — unified game bootstrap with player rig + maps + audio + weather + controls */
(function(){
"use strict";
if(window.__GameBootstrapReady) return;
window.__GameBootstrapReady = true;

const log  = (...a)=>{ try{ console.log("[bootstrap]", ...a); }catch{} };
const warn = (...a)=>{ try{ console.warn("[bootstrap]", ...a); }catch{} };

const $ = s => document.querySelector(s);

// ---------- Loader UI ----------
const Loader = (() => {
  const box = () => $("#loading-box");
  const text = () => $("#loading-text");
  const fill = () => $("#loading-fill");
  let stepsDone=0, stepsTotal=0, queue=[];
  function show(){ const b=box(); if(b) b.style.display="flex"; }
  function hide(){ const b=box(); if(b) b.style.display="none"; }
  function label(s){ const t=text(); if(t) t.textContent = s||""; }
  function draw(){ const f=fill(); if(f) f.style.width = (stepsTotal?(stepsDone/stepsTotal*100):0).toFixed(1)+"%"; }
  function reset(){ queue.length=0; stepsDone=0; stepsTotal=0; draw(); }
  function addStep(lbl, fn){ queue.push({lbl,fn}); stepsTotal=queue.length; }
  async function run(){
    show(); draw();
    for(const s of queue){
      label(s.lbl); draw();
      try{ await s.fn(); }catch(e){ warn("step failed:", s.lbl, e); }
      stepsDone++; draw();
    }
    label("Finalizing…"); draw();
    await new Promise(r=>setTimeout(r,120));
    hide();
  }
  return { reset, addStep, run, show, hide, label, addStep };
})();

// ---------- State ----------
let engine=null, scene=null, camera=null;
let hemi=null;
let started=false;

window.PP = window.PP || {};
PP.manifest = PP.manifest || [];
PP.rig = PP.rig || {};
PP.state = PP.state || {};
PP.controls = PP.controls || {};
PP.weather = PP.weather || { current:null };

// ---------- Map Manifest / Selector ----------
async function fetchJSON(url){
  try{
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  }catch(e){ warn("fetchJSON failed:", url,e); return null; }
}

async function loadManifest(){
  const j = await fetchJSON("./assets/models/map/maps.json");
  if(Array.isArray(j)) PP.manifest = j;
  else if(j && Array.isArray(j.maps)) PP.manifest = j.maps;

  if(!PP.manifest || !PP.manifest.length){
    PP.manifest = [
      { file: "Abandoned_House.glb", title: "Abandoned House" },
      { file: "furnished_house.glb", title: "Furnished House" },
      { file: "jailhouse.glb", title: "Jailhouse" },
      { title: "Procedural ProHouse (grid)", def: "prohouse_generator" },
      { file: "Abandoned_House2.glb", title: "Abandoned House 2" },
      { file: "farm_house.glb", title: "Farm House" }
    ];
  }

  const sel = $("#map-select");
  if(sel){
    sel.innerHTML = PP.manifest.map((m,i)=>`<option value="${i}">${m.title||m.file||("map#"+i)}</option>`).join("");
    let saved = parseInt(localStorage.getItem("selectedMapIndex"));
    if(isNaN(saved)||saved<0||saved>=PP.manifest.length) saved=0;
    sel.value=saved;
    sel.onchange=()=>{ localStorage.setItem("selectedMapIndex", sel.value); };
  }
}

function getSelectedMap(){
  const sel = $("#map-select");
  const idx = Number(sel?.value);
  if(isNaN(idx)||idx<0||idx>=PP.manifest.length) return PP.manifest[0];
  return PP.manifest[idx];
}

// ---------- Engine & Scene ----------
function createEngineScene(){
  if(engine&&scene) return;
  const canvas=$("#renderCanvas");
  if(!canvas) throw new Error("Missing #renderCanvas");
  engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,antialias:true});
  scene=new BABYLON.Scene(engine);
  scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity=0.0045;
  scene.fogColor=new BABYLON.Color3(0.02,0.03,0.05);

  hemi=new BABYLON.HemisphericLight("hemi",new BABYLON.Vector3(0,1,0),scene);
  hemi.intensity=0.35;

  camera=new BABYLON.UniversalCamera("playerCam",new BABYLON.Vector3(0,1.8,0),scene);
  camera.minZ=0.1;
  try{ camera.inputs.clear(); }catch(e){}

  // Ground
  const ground=BABYLON.MeshBuilder.CreateGround("pp_ground",{width:200,height:200},scene);
  ground.isVisible=false;
  ground.checkCollisions=true;
  ground.receiveShadows=true;
  ground.metadata={isGround:true};

  // Enable Babylon physics
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.CannonJSPlugin());

  window.ENGINE=engine; window.SCENE=scene; window.camera=camera;
  engine.runRenderLoop(()=>{ try{ if(scene) scene.render(); }catch(e){} });
  window.addEventListener("resize",()=>engine.resize());
}

// ---------- Weather + Audio ----------
const WEATHER_TYPES=["clear","rain","snow","fog"];
const WEATHER_SOUNDS={
  clear:null,
  rain:"./assets/audio/weather/rain_loop.mp3",
  snow:"./assets/audio/weather/wind_loop.mp3",
  fog:"./assets/audio/weather/fog_wind.mp3"
};
let weatherSound=null;

function pickRandomWeather(){
  const idx=Math.floor(Math.random()*WEATHER_TYPES.length);
  return WEATHER_TYPES[idx];
}

function applyWeather(type){
  if(!scene) return;
  log("Applying weather:",type);
  PP.weather.current=type;

  // Clear any particle systems / sound
  if(weatherSound){ weatherSound.stop(); weatherSound.dispose(); weatherSound=null; }
  scene.meshes.filter(m=>m.metadata?.isWeather).forEach(m=>m.dispose());

  switch(type){
    case "rain":{
      const ps = new BABYLON.ParticleSystem("rain", 2000, scene);
      ps.particleTexture = new BABYLON.Texture("./assets/textures/rain.png", scene);
      ps.emitter = new BABYLON.Vector3(0,15,0);
      ps.minEmitBox = new BABYLON.Vector3(-20,0,-20);
      ps.maxEmitBox = new BABYLON.Vector3(20,0,20);
      ps.color1=new BABYLON.Color4(0.7,0.7,1,0.6);
      ps.color2=new BABYLON.Color4(0.7,0.7,1,0.6);
      ps.minSize=0.05; ps.maxSize=0.1;
      ps.minLifeTime=0.3; ps.maxLifeTime=0.6;
      ps.emitRate=1500;
      ps.direction1=new BABYLON.Vector3(0,-1,0);
      ps.direction2=new BABYLON.Vector3(0,-1,0);
      ps.gravity=new BABYLON.Vector3(0,-9.81,0);
      ps.updateSpeed=0.01;
      ps.start();
      ps.meshesAreEmitters=true;
      ps._rootMesh.metadata={isWeather:true};
      break;
    }
    case "snow":{
      const ps = new BABYLON.ParticleSystem("snow", 1000, scene);
      ps.particleTexture = new BABYLON.Texture("./assets/textures/snowflake.png", scene);
      ps.emitter = new BABYLON.Vector3(0,15,0);
      ps.minEmitBox = new BABYLON.Vector3(-20,0,-20);
      ps.maxEmitBox = new BABYLON.Vector3(20,0,20);
      ps.color1=new BABYLON.Color4(1,1,1,1);
      ps.color2=new BABYLON.Color4(0.9,0.9,0.9,1);
      ps.minSize=0.15; ps.maxSize=0.25;
      ps.minLifeTime=2; ps.maxLifeTime=4;
      ps.emitRate=300;
      ps.direction1=new BABYLON.Vector3(-0.2,-1,0.2);
      ps.direction2=new BABYLON.Vector3(0.2,-1,-0.2);
      ps.gravity=new BABYLON.Vector3(0,-1,0);
      ps.updateSpeed=0.01;
      ps.start();
      ps.meshesAreEmitters=true;
      ps._rootMesh.metadata={isWeather:true};
      break;
    }
    case "fog":{
      scene.fogDensity=0.02;
      break;
    }
    default:{
      scene.fogDensity=0.0045;
    }
  }

  const soundFile=WEATHER_SOUNDS[type];
  if(soundFile){
    weatherSound=new BABYLON.Sound("weather", soundFile, scene, null, {loop:true, autoplay:true, volume:0.6});
  }
}

// ---------- Player Rig (same as before, shortened for brevity) ----------
// ... [the Player Rig code from your version above goes here unchanged] ...

// ---------- Start Game ----------
async function startGame(){
  if(started) return;
  started=true;
  $("#title-screen")?.style.display="none";

  Loader.reset();
  Loader.addStep("Preparing engine…", async ()=>createEngineScene());
  Loader.addStep("Loading manifest…", async ()=>loadManifest());
  Loader.addStep("Loading map…", async ()=>{ const mapData=getSelectedMap(); if(typeof PP.mapManager?.loadMap==="function") await PP.mapManager.loadMap(mapData); });
  Loader.addStep("Starting player rig…", async ()=>startPlayerRig());
  Loader.addStep("Applying weather…", async ()=>{
    let w=localStorage.getItem("pp_weather");
    if(!w){ w=pickRandomWeather(); localStorage.setItem("pp_weather",w); }
    applyWeather(w);
  });

  await Loader.run();
  $("#renderCanvas")?.focus();
  log("Game fully initialized");
}

// Bind start button
document.addEventListener("DOMContentLoaded",()=>{ const startBtn=$("#start-button"); if(startBtn) startBtn.addEventListener("click",()=>startGame()); });
window.startGame=startGame;

})();
