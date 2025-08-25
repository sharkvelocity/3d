/* game_bootstrap.js — one-stop controller
   - Populates map dropdown from ./assets/models/map/maps.json
   - Starts engine/scene on "Start Investigation"
   - Pointer-lock + mouse-look (no Babylon default mouse input conflicts)
   - Loads optional map config (.js) then GLB model
   - Applies MAP_DEF.spawn if provided
   - Updates XYZ HUD each frame
*/
(function(){
  if (window.__GameBootstrap) return; window.__GameBootstrap = true;

  /* ---------- tiny DOM helpers ---------- */
  const $ = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));

  /* ---------- loader UI ---------- */
  const LoaderUI = {
    show(label){ const b=$("#loading-box"); if(b) b.style.display="flex"; this.label(label||"Initializing…"); this.pct(0); },
    hide(){ const b=$("#loading-box"); if(b) b.style.display="none"; },
    label(s){ const t=$("#loading-text"); if(t) t.textContent = s||""; },
    pct(p01){ const f=$("#loading-fill"); if(f) f.style.width = ((p01||0)*100).toFixed(1)+"%"; }
  };

  /* ---------- manifest / maps ---------- */
  const MAPS_JSON = "./assets/models/map/maps.json";
  let MAP_LIST = [];

  async function loadManifest(){
    try{
      const res = await fetch(MAPS_JSON, { cache:"no-store" });
      if (!res.ok) throw new Error("HTTP "+res.status);
      const data = await res.json();
      let list = Array.isArray(data) ? data : (Array.isArray(data.maps) ? data.maps : []);
      // normalize
      MAP_LIST = list.map(m=>{
        if (typeof m === "string") return { title:m.replace(/\.(glb|js)$/i,""), file:m };
        return {
          title: m.title || m.name || (m.file||m.glb||"map").replace(/\.(glb|js)$/i,""),
          file:  m.file  || m.glb  || "Abandoned_House.glb",
          def:   m.def   || m.config || null
        };
      });
    }catch(e){
      console.warn("[bootstrap] manifest fallback:", e);
      MAP_LIST = [
        { title:"Abandoned House", file:"Abandoned_House.glb", def:"Abandoned_House.js" },
        { title:"Furnished House", file:"furnished_house.glb", def:"furnished_house.js" },
        { title:"Jailhouse",       file:"jailhouse.glb",       def:"jailhouse.config.js" }
      ];
    }
  }

  function populateMapSelect(){
    const sel = $("#map-select"); if (!sel) return;
    sel.innerHTML = MAP_LIST.map((m,i)=>`<option value="${i}">${m.title}</option>`).join("");
    try{
      const idx = Number(localStorage.getItem("selectedMapIndex") || "0") || 0;
      sel.value = String(Math.max(0, Math.min(MAP_LIST.length-1, idx)));
    }catch(_){}
    sel.onchange = ()=>{ try{ localStorage.setItem("selectedMapIndex", sel.value); }catch(_){ } };
  }

  function getSelectedMap(){
    const sel = $("#map-select");
    const i = Math.max(0, Math.min(MAP_LIST.length-1, parseInt(sel?.value||"0",10)||0));
    return MAP_LIST[i] || MAP_LIST[0];
  }

  /* ---------- script loader (classic) ---------- */
  function loadScriptOnce(url){
    return new Promise(resolve=>{
      const s = document.createElement("script");
      s.src = url; s.async = true;
      s.onload = ()=>resolve(true);
      s.onerror = ()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  /* ---------- engine/scene setup ---------- */
  async function ensureEngineScene(){
    if (window.engine && window.scene && window.camera) return;
    const canvas = $("#renderCanvas");
    const eng = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true });
    const sc  = new BABYLON.Scene(eng);
    sc.collisionsEnabled = true;
    sc.gravity = new BABYLON.Vector3(0,-0.9,0);

    const cam = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.8, 8), sc);
    cam.attachControl(canvas, true);
    cam.checkCollisions = true;
    cam.applyGravity = true;
    cam.ellipsoid = new BABYLON.Vector3(0.35,0.9,0.35);
    cam.ellipsoidOffset = new BABYLON.Vector3(0,0.4,0);
    cam.minZ = 0.1; cam.inertia = 0;

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), sc);
    hemi.intensity = 0.35;
    sc.clearColor = new BABYLON.Color4(0.01,0.01,0.02,1);

    window.engine = eng; window.scene = sc; window.camera = cam;
  }

  /* ---------- mouse look: pointer lock + custom rotation ---------- */
  function setupPointerLockAndLook(){
    const canvas = $("#renderCanvas");
    const cam = window.camera; const sc = window.scene; if (!canvas || !cam || !sc) return;

    // remove Babylon's conflicting inputs
    try { cam.inputs.removeByType("FreeCameraMouseInput"); } catch(_){}
    try { cam.inputs.removeByType("FreeCameraTouchInput"); } catch(_){}
    try { cam.inputs.removeByType("FreeCameraKeyboardMoveInput"); } catch(_){}

    canvas.tabIndex = 0;

    const reqLock = ()=> {
      if (document.pointerLockElement === canvas) return;
      (canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock)?.call(canvas);
      canvas.focus();
    };
    canvas.addEventListener("click", reqLock, { passive:true });
    document.addEventListener("pointerlockchange", ()=>{
      if (document.pointerLockElement !== canvas){
        try{ window.toast?.("Pointer unlocked — click to lock"); }catch(_){}
      }
    });

    let yaw   = cam.rotation?.y || 0;
    let pitch = cam.rotation?.x || 0;
    const SENS = 0.0025, MINP = -Math.PI/2 + 0.15, MAXP = Math.PI/2 - 0.15;

    function onMove(e){
      if (document.pointerLockElement !== canvas) return;
      yaw   += (e.movementX || 0) * SENS;
      // flip the sign below if you prefer invert-Y
      pitch += (e.movementY || 0) * SENS * 0.85;
      if (pitch < MINP) pitch = MINP;
      if (pitch > MAXP) pitch = MAXP;
      cam.rotation.y = yaw;
      cam.rotation.x = pitch;
    }
    window.addEventListener("mousemove", onMove, { passive:true });

    // keep compatibility if something calls applyLook
    window.applyLook = function(){ /* rotation is handled by onMove */ };
  }

  /* ---------- map loading ---------- */
  async function loadSelectedMap(){
    const sc = window.scene;
    const choice = getSelectedMap();
    const base = "./assets/models/map/";

    // Optional config first
    if (choice.def){
      const ok = await loadScriptOnce(base + choice.def);
      if (!ok) console.warn("[bootstrap] config not found:", choice.def);
    }

    // GLB
    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", base, choice.file, sc);
      const root = res.meshes[0] || res.meshes.find(m=>m.name==="__root__");
      if (root) { root.receiveShadows = true; }
    }catch(e){
      console.error("[bootstrap] GLB load failed:", choice.file, e);
      const g = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width:180, height:180 }, sc);
      g.checkCollisions = true; g.receiveShadows = true;
    }

    // Spawn from MAP_DEF if present
    try{
      if (window.MAP_DEF && MAP_DEF.spawn && sc.activeCamera){
        const s = MAP_DEF.spawn;
        sc.activeCamera.position.set(s.x||0, s.y||1.8, s.z||0);
      }
    }catch(_){}
  }

  /* ---------- simple moon (texture on sphere) ---------- */
  function ensureMoon(){
    if (window.__MoonSetup) return;
    const sc = window.scene;
    const m = BABYLON.MeshBuilder.CreateSphere("moon_sphere", { diameter:18, segments:16 }, sc);
    const mat = new BABYLON.StandardMaterial("moonMat", sc);
    mat.diffuseTexture  = new BABYLON.Texture("./assets/images/sky/moon.jpg", sc, true, false);
    mat.emissiveTexture = mat.diffuseTexture; mat.disableLighting = true; mat.specularColor = new BABYLON.Color3(0,0,0);
    m.material = mat; m.position = new BABYLON.Vector3(0,120,160);
    m.isPickable=false; m.applyFog=false;
    window.__MoonSetup = true;
  }

  /* ---------- HUD XYZ updater ---------- */
  function startHudXYZ(){
    const hud = $("#hud-xyz"); if (hud) hud.style.display = "block";
    const x = $("#hud-x"), y=$("#hud-y"), z=$("#hud-z");
    window.scene.onBeforeRenderObservable.add(()=>{
      const p = window.camera?.position;
      if (!p) return;
      if (x) x.textContent = p.x.toFixed(2);
      if (y) y.textContent = p.y.toFixed(2);
      if (z) z.textContent = p.z.toFixed(2);
    });
  }

  /* ---------- start button ---------- */
  async function safeStart(e){
    e?.preventDefault?.();
    if (window.__GameStarted) return;
    window.__GameStarted = true;

    const title = $("#title-screen"); if (title) title.style.display = "none";
    LoaderUI.show("Preparing engine…");

    await ensureEngineScene(); LoaderUI.pct(0.15);
    setupPointerLockAndLook();

    LoaderUI.label("Loading maps manifest…");
    await loadManifest(); populateMapSelect(); LoaderUI.pct(0.35);

    LoaderUI.label("Loading map…");
    await loadSelectedMap(); LoaderUI.pct(0.75);

    LoaderUI.label("Setting sky…");
    try{ ensureMoon(); }catch(_){}
    LoaderUI.pct(0.85);

    startHudXYZ();

    LoaderUI.label("Starting…");
    engine.runRenderLoop(()=>scene.render());
    window.addEventListener("resize", ()=>engine.resize());
    try { ($("#renderCanvas")).focus(); } catch(_){}
    try { BABYLON.Engine.audioEngine?.unlock?.(); } catch(_){}
    LoaderUI.pct(1); LoaderUI.hide();
  }

  /* ---------- wire UI ---------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    // Preload manifest just to fill the dropdown visually
    loadManifest().then(populateMapSelect).catch(()=>{});
    const startBtn = $("#start-button");
    startBtn?.addEventListener("click", safeStart, { passive:false });
    // Enter/Space
    document.addEventListener("keydown", (e)=>{
      if (window.__GameStarted) return;
      if (e.key === "Enter" || e.code === "Space"){ e.preventDefault(); safeStart(e); }
    }, { passive:false });
  });

  // expose for console debugging
  window.__safeStart = safeStart;
})();
