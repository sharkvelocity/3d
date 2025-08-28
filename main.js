// Boot / Start
let __started = false;

async function safeStart(){
  if(__started) return;
  __started = true;

  if(!window.BABYLON || !BABYLON.Engine){
    toast("Engine not ready. Check Babylon includes.", 2200);
    __started = false;
    return;
  }

  const scr = document.getElementById('title-screen');
  if (scr) scr.style.display = 'none';

  try{
    await boot();
  }catch(err){
    __started = false;
    console.error(err);
    toast("Startup failed: " + (err?.message||err), 2800);
    if (scr) scr.style.display = 'flex';
    return;
  }

  const r = Math.random();
  const w = r < 0.40 ? 'Clear' : r < 0.65 ? 'Rain' : r < 0.85 ? 'Snow' : 'Blood Moon';
  setWeather(w);

  const keys = Object.keys(GHOSTS);
  currentGhostKey = keys[Math.floor(Math.random() * keys.length)];
  if ((currentGhostKey||"").toLowerCase()==='myling'){ ghost.footAudible = 8; }

  toast(`Investigation started. Weather: ${w}.`, 1600);
}

(function bindStart(){
  const btn = document.getElementById('start-button');
  const screen = document.getElementById('title-screen');
  if (btn){
    btn.onclick = safeStart;
    btn.onkeydown = e=>{ if(e.key==='Enter'||e.code==='Space'){ e.preventDefault(); safeStart(); } };
  }
  if (screen){
    screen.addEventListener('click', e=>{ if(e.target===screen) safeStart(); });
  }
  window.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.code==='Space') safeStart(); });
})();

async function boot(){
  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, disableWebGL2Support:false });
  try{ engine.setHardwareScalingLevel(1 / (window.devicePixelRatio||1)); }catch{}
  scene = new BABYLON.Scene(engine);
  scene.environmentTexture = null;
  const oldSky = scene.getMeshByName("BackgroundSkybox"); if (oldSky) oldSky.dispose();
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.5, 0);

  // Camera
  camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(43.657, 3, -119.008), scene);
  camera.attachControl(canvas, true);
  camera.applyGravity = true;
  camera.checkCollisions = true;
  camera.ellipsoid = new BABYLON.Vector3(0.35, 0.9, 0.35);
  camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0);
  camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
  camera.minZ = 0.1; camera.inertia = 0;
  camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

  // Atmosphere / lights
  setupNightAtmosphere();

  // Hemi fill
  hemiLight = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemiLight.intensity = 0.06;

  // Map + items + ghost + moon
  await loadMap().catch(()=>{});
  afterMapLoadedForShadows();
  if (!adoptExistingGltfLights()) buildHouseLights();
  await loadItems().catch(()=>{});
  await loadGhost().catch(()=>{});
  await loadMoon().catch(()=>{});

  // Breath stub (hook if you had particle FX inlined)
  function setupBreathFX(){ /* reserved for your breath particle impl */ }
  setupBreathFX();

  if (ghost.mesh){ moonShadows.addShadowCaster(ghost.mesh, true); flashShadows.addShadowCaster(ghost.mesh, true); }
  if (ghost.meshFast){ moonShadows.addShadowCaster(ghost.meshFast, true); flashShadows.addShadowCaster(ghost.meshFast, true); }

  // UI/inputs
  initUI();
  bindInputs();
  updateHUD();

  // Render loop + tickers
  scene.onBeforeRenderObservable.add(()=>{
    const dt = engine.getDeltaTime()/1000;
    handleMovement(dt);
    updatePlayerFootsteps(dt);
    sanityTick(dt);

    if (weather.state==='Rain' && weather.rainPS){
      weather.rainPS.emitRate = inVanZone(camera.position) ? 0 : 1800;
    }

    if(weather.state==='Rain'){
      weather.lightningTimer += dt;
      if(weather.lightningTimer > weather.nextStrike){ lightningStrike(); scheduleNextLightning(); }
    }

    if (ghost.hunting && flickerOn){
      flickerTimer += dt;
      if (flickerTimer > 0.08){
        flickerTimer = 0;
        houseLights.forEach(h=>{
          if (!housePower) return;
          h.light.intensity = (Math.random()<0.65) ? 0.2 + Math.random()*0.9 : 0.0;
        });
      }
    }
  });

  engine.runRenderLoop(()=> scene.render());
  window.addEventListener('resize', ()=> engine.resize());

  document.getElementById("hud").style.display="block";
  rebuildBelt();

  if (!houseRoot) ensureDebugCube();

  toast("Atmosphere ready. F=Flash, U=UV, I=IR, L=nearest light, P=power.", 3000);

  canvas.addEventListener("webglcontextlost", (e)=>{ e.preventDefault(); toast("WebGL context lost. Restoring…", 1800); });
  canvas.addEventListener("webglcontextrestored", ()=>{ toast("WebGL restored.", 1200); });
}

// ===== UI pieces pulled from your original (minimal to keep size) =====
let notebookOpen = false;
function labelForSlot(i){
  const item = inventory.slots[i] || '-';
  if (item==='Smudge' || item==='Salt'){
    const left = inventory.slotCharges[i] ?? 0;
    return `${item} (${left})`;
  }
  return item;
}
function rebuildBelt(){
  const belt = document.getElementById('belt'); if (!belt) return;
  belt.innerHTML='';
  for(let i=1;i<=5;i++){
    const slotDiv = document.createElement('div');
    slotDiv.className = 'slot' + (i===activeItemSlot?' active':''); slotDiv.dataset.slot = i;
    const key = document.createElement('div'); key.className='key'; key.textContent=i; slotDiv.appendChild(key);
    const span = document.createElement('div'); span.style.fontSize='11px'; span.style.color='#8ff'; span.style.textAlign='center'; span.textContent=labelForSlot(i);
    slotDiv.appendChild(span);
    slotDiv.onclick = (ev)=>{ ev.stopPropagation(); selectSlot(i); };
    belt.appendChild(slotDiv);
  }
  refreshHandPreview(); refreshCameraOverlay();
}
function selectSlot(n){
  activeItemSlot = n;
  if (notebookOpen && inventory.slots[n] !== 'Notebook') {/* closeNotebook();*/ }
  rebuildBelt();
  // syncHeldLights(); // if you had this
}
function refreshHandPreview(){
  const wrap = document.getElementById('hand-preview'); if (!wrap) return;
  wrap.innerHTML = '';
  const item = inventory.slots[activeItemSlot];
  if(!item || !itemsGlb){ wrap.style.display='none'; return; }
  const c = document.createElement('canvas'); c.width=180; c.height=140; c.style.width='100%'; c.style.height='100%'; wrap.appendChild(c);

  const pv = new BABYLON.Engine(c, true);
  const pvScene = new BABYLON.Scene(pv);
  const pvCam = new BABYLON.ArcRotateCamera("pvcam", Math.PI*1.2, Math.PI/3, 2.4, new BABYLON.Vector3(0,0.1,0), pvScene);
  pvCam.attachControl(c, false); pvCam.panningSensibility=0; pvCam.wheelPrecision=50;
  pvScene.clearColor = new BABYLON.Color4(0,0,0,0);
  const hem = new BABYLON.HemisphericLight("pvH", new BABYLON.Vector3(0,1,0), pvScene); hem.intensity=1.2;

  const meshName = ITEM_MODEL_MAP[item]; const src = meshName && inventory.models[meshName];
  if(!src){ wrap.style.display='none'; pv.dispose(); return; }
  const clone = src.clone("pv-"+meshName, null, true); pvScene.addMesh(clone);
  clone.rotation = new BABYLON.Vector3(-Math.PI/2, Math.PI, 0); clone.scaling = new BABYLON.Vector3(0.008,0.008,0.008);
  wrap.style.display='block'; pv.runRenderLoop(()=>pvScene.render()); window.addEventListener('resize', ()=> pv.resize());
}
function refreshCameraOverlay(){
  const item = inventory.slots[activeItemSlot];
  const show = (item==='Camera');
  document.getElementById('camera-overlay').style.display = show ? 'block' : 'none';
  // document.getElementById('camera-ir').style.display = (show && irOn) ? 'block' : 'none';
}

// Basic UI hooks (Notebook/Storage toggles etc.) trimmed; keep your originals as needed
function initUI(){
  const startBtn = document.getElementById('start-button');
  if (startBtn) startBtn.addEventListener('click', safeStart);
}
