// This file acts as the main entry point and script loader for the game.
// It ensures all game modules are loaded in the correct sequence before starting the game.

// FIX: Define a more specific type for the global PP object to satisfy TypeScript.
// Properties are marked as optional to allow for progressive initialization across different scripts.
// This resolves multiple errors related to property access and initialization.
declare global {
  interface Window {
    PP: {
      // From settings
      controls?: any;
      ghost?: any;
      weatherMods?: any;
      rules?: any;
      // FIX: Made state a required property.
      state: any;

      // From runtime
      globals?: {
          engine?: any;
          scene?: any;
          camera?: any;
      };
      runtime?: {
          exportGlobals: (engine: any, scene: any, camera: any) => void;
      };
      readySignals?: { [key: string]: Promise<void> };
      _resolveReady?: { [key: string]: () => void };
      signalReady?: (name: string) => void;
      waitFor?: (names: string | string[]) => Promise<any[]>;
      
      // From other files
      // FIX: Made GHOST_DATA and ALL_EVIDENCE required to match TS inference from JS files.
      GHOST_DATA: any;
      ALL_EVIDENCE: string[];
      // FIX: Made cfg a required property.
      cfg: any;
      // FIX: Made storage a required property.
      storage: any;
      mapManifest?: any;
      mapManager?: any;
      inventory?: any;
      tools?: any;
      spiritBox?: any;
      vanUI?: any;
      ps5?: any;
      pointerLock?: any;
      getMovementFlags?: () => any;
      getSpeeds?: () => any;
      gameHasRenderedFirstFrame?: boolean;
      audio?: any;
      rig?: any;
      
      // Allow other properties to be added by various modules
      [key: string]: any;
    };
    // FIX: Added missing global properties to the Window interface.
    scene?: any;
    // FIX: Add missing `engine` and `camera` properties to the Window interface.
    engine?: any;
    camera?: any;
    BABYLON?: any;
    PlayerRig?: any;
    PP_SPAWN_POS?: any;
    GHOST_DEV_FORCE_VISIBLE?: boolean;
    ProHouseGenerator?: any;
    showLoading?: any;
    EnvAndSound?: any;
    openNotebook?: any;
    closeNotebook?: any;
    toast?: any;
    UVPrints?: any;
    LIGHTER?: any;
    LANTERN?: any;
    BeltManager?: any;
    HUDManager?: any;
    updateSanity?: any;
    SimLog?: any;
    setReticleVisible?: any;
    setReticleColor?: any;
    reticleFlash?: any;
    reticleSetStyle?: any;
    EMF?: any;
  }
}

const BASE_URL = "https://sharkvelocity.github.io/3d/";

/**
 * Initializes the global PP settings object.
 * This logic was moved from modular_settings.js to fix a loading error.
 */
function initializeSettings() {
  // FIX: Cast to Window['PP'] to inform TypeScript of the object's full potential shape, resolving assignment errors.
  // FIX: Provide default values for required properties GHOST_DATA and ALL_EVIDENCE.
  // FIX: Add `cfg`, `state`, and `storage` to the initial object to satisfy TypeScript's inferred global type for PP, which requires these properties.
  // FIX: Use `null` for GHOST_DATA to satisfy the inferred type, which expects a complex object, not `{}`.
  // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
  window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];

  /* ------------ Controls (keys & movement tuning) ------------ */
  window.PP.controls = {
    keys: {
      // Movement
      forward:   ['KeyW','ArrowUp'],
      back:      ['KeyS','ArrowDown'],
      left:      ['KeyA','ArrowLeft'],
      right:     ['KeyD','ArrowRight'],
      sprint:    ['ShiftLeft','ShiftRight'],
      // Belt slots: exactly 1–3 (lighter is separate on Digit4)
      slots:     ['Digit1','Digit2','Digit3'],
      lighter:   ['Digit4'],
      // Core actions
      use:       ['Space'],   // “Use” active item
      interact:  ['KeyE'],    // Doors & ground/placed tools (e.g., Spirit Box on floor)
      notebook:  ['KeyN'],
      minimap:   ['KeyM'],
      // Lighting / environment
      flash:       ['KeyF'],  // flashlight (held/headgear)
      uv:          ['KeyU'],
      ir:          ['KeyI'],
      lightToggle: ['KeyL'],  // nearest house light
      powerToggle: ['KeyP'],  // house breaker
      // Camera
      cameraToggle: ['KeyV']  // FP <-> TP
    },
    // Movement tuning
    speedWalk:  1.80,
    speedRun:   3.20,
    // Camera feel (used by rig if present)
    mouseSens:       0.0022,
    touchLookSens:   0.0025,
    allowFly: false,
    godMode:  false
  };

  /* ------------ Ghost / Hunt / Sanity tuning ------------ */
  window.PP.ghost = {
    // Sanity drain per second
    baseSanityDrain: 0.6 / 60,
    nearSanityDrain: 1.2 / 60,
    nearDistance:    7.0,
    // Hunt pacing
    huntSanityThreshold: 65,
    huntCooldownMin:     22,
    huntCooldownMax:     40,
    huntChanceBelow40:   0.85,
    huntChanceAbove40:   0.55,
    // Ghost locomotion
    speed:             1.4,
    stepIntervalWalk:  0.55,
    stepIntervalHunt:  0.48,
    footAudible:       18,
    // Twins behavior
    twinsSeparationMin: 10.0,
    twinsSeparationMax: 12.0,
    // Crucifix
    crucifixBaseRadius:  3.0,
    crucifixDemonRadius: 5.0
  };

  /* ------------ Weather modifiers (sanity/hunt multipliers) ------------ */
  window.PP.weatherMods = {
    Clear:     { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    Rainstorm: { sanity: 1.00, huntChance: 1.00, huntPace: 1.00 },
    Snow:      { sanity: 0.95, huntChance: 1.00, huntPace: 1.00 },
    Bloodmoon: { sanity: 1.25, huntChance: 1.40, huntPace: 1.20 }
  };

  /* ------------ Placeables / rules ------------ */
  window.PP.rules = {
    crucifixBaseRadius:  3.0,
    crucifixDemonRadius: 5.0
  };

  /* ------------ Lightweight shared state (initialized here) ------------ */
  window.PP.state = window.PP.state || {
    running: false,
    sanity: 100,
    controls: { forward:false, back:false, left:false, right:false },
    selectedSlot: 0   // 0=none, 1..3 (belt). Lighter is separate.
  };
  
  console.log("[Settings] Global PP config initialized.");
}

/**
 * Initializes the global PP runtime helpers.
 * This logic was moved from pp_runtime.js to fix a loading error.
 */
function initializeRuntime() {
    // FIX: Cast to Window['PP'] to fix assignment and subsequent property access errors.
    // FIX: Provide default values for required properties.
    // FIX: Add `cfg`, `state`, and `storage` to the initial object to satisfy TypeScript's inferred global type for PP, which requires these properties.
    // FIX: Use `null` for GHOST_DATA to satisfy the inferred type, which expects a complex object, not `{}`.
    // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
    const PP = (window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP']);
    if (PP.runtime) return;

    PP.globals = PP.globals || {};

    function trySet(obj: any, key: string, value: any) {
        try { obj[key] = value; } catch { /* read-only getter – ignore */ }
    }

    PP.runtime = {
        exportGlobals(engine: any, scene: any, camera: any) {
            PP.globals.engine = engine;
            PP.globals.scene  = scene;
            PP.globals.camera = camera;
            
            trySet(window, "engine", engine);
            trySet(window, "scene",  scene);
            trySet(window, "camera", camera);
            
            trySet(window,"__ENGINE", engine);
            trySet(window,"__SCENE",  scene);
            trySet(window,"__camera", camera);
        }
    };
    
    PP.readySignals = {};
    PP._resolveReady = {};

    PP.signalReady = function(name: string) {
        if (PP._resolveReady[name]) {
            PP._resolveReady[name]();
        } else {
            PP.readySignals[name] = Promise.resolve();
        }
        console.log(`[Runtime] Signal '${name}' is ready.`);
    };

    PP.waitFor = function(names: string | string[]) {
        if (!Array.isArray(names)) {
            names = [names];
        }
        const promises = names.map(name => {
            if (!PP.readySignals[name]) {
                PP.readySignals[name] = new Promise<void>(resolve => {
                    PP._resolveReady[name] = resolve;
                });
            }
            return PP.readySignals[name];
        });
        return Promise.all(promises);
    };
    
    console.log("[Runtime] Global PP runtime helpers initialized.");
}

/**
 * Initializes the Player Rig Controller.
 * This logic was moved from player_rig_controller.js to fix a loading error.
 */
function initializePlayerRigController() {
    /* fp_tp_sync.js — single-rig FP/TP with no rubberbanding (v2.3 - Modular Input)
       - Loads the player model from assets/models/player/ and attaches it to the rig.
       - Hides player model in first-person view.
       - MOVEMENT is now driven by the unified input_manager.js via PP.getMovementFlags().
       - Mouse look for camera control remains handled internally.
       - rigRoot -> yaw -> head -> handNode ; camera attaches to head (FP) or trails (TP)
    */
    (function(){
      if ((window as any).__FP_TP_SYNC_V2_3__) return; (window as any).__FP_TP_SYNC_V2_3__ = true;
    
      const log  = (...a: any[])=>{ try{ console.log("[PlayerRig v2.3]", ...a);}catch(_){} };
      const warn = (...a: any[])=>{ try{ console.warn("[PlayerRig v2.3]", ...a);}catch(_){} };
      const toRad = (d: number) => d * Math.PI / 180;
      const clamp = (v: number,min: number,max: number)=> Math.max(min, Math.min(max,v));
      const cfg = ()=> window.PP?.controls;
    
      const S = {
        rigRoot:null as any, yawNode:null as any, head:null as any, handNode:null as any, body:null as any,
        mode:"fp",
        tpIdx:1, tpDists:[2.6,3.6,4.8,6.0],
        yaw:0, pitch:0,
        velY:0,
        gravity:-9.8, grounded:true,
        running:false,
        movementEnabled: false,
      };
    
      // FIX: Use window.scene which is now typed on the Window interface.
      function scene(){ return window.scene || (window.BABYLON && window.BABYLON.Engine.LastCreatedScene) || null; }
      function cam(){ const s=scene(); return s && s.activeCamera; }
    
      async function ensureRig(s: any){
        if (S.rigRoot) return;
        const c = cam();
        // FIX: Remove `(window as any)` casts
        const start = window.PP_SPAWN_POS || (c?.position?.clone?.()) || new window.BABYLON.Vector3(0,1.8,0);
    
        const rigRoot = new window.BABYLON.TransformNode("rigRoot", s);
        rigRoot.position.copyFrom(start);
    
        const yaw = new window.BABYLON.TransformNode("rigYaw", s);
        yaw.parent = rigRoot;
    
        const head = new window.BABYLON.TransformNode("rigHead", s);
        head.parent = yaw;
        head.position.set(0, 1.6, 0);
    
        const handNode = new window.BABYLON.TransformNode("handNode", s);
        handNode.parent = head;
        handNode.position.set(0.25, -0.4, 0.7);
    
        S.rigRoot=rigRoot; S.yawNode=yaw; S.head=head; S.handNode=handNode;
        
        try {
            // FIX: Remove `(window as any)` cast
            const result = await window.BABYLON.SceneLoader.ImportMeshAsync(null, `${BASE_URL}assets/models/player/`, "main_player.glb", s);
            const body = result.meshes[0];
            if (body) {
                body.name = "player_body_root";
                body.parent = rigRoot;
                body.position.set(0, 0, 0);
                // FIX: Remove `(window as any)` cast
                body.rotationQuaternion = window.BABYLON.Quaternion.FromEulerAngles(0, Math.PI, 0);
                S.body = body;
                result.meshes.forEach((m: any) => { m.isPickable = false; });
                log("Player model loaded and attached.");
            }
        } catch (e) {
            warn("Could not load player model. Creating a fallback capsule.", e);
            // FIX: Remove `(window as any)` cast
            const body = window.BABYLON.MeshBuilder.CreateCapsule("player_capsule", {height: 1.7, radius: 0.3}, s);
            body.isPickable = false;
            body.parent = rigRoot;
            body.position.set(0, 1.7/2, 0);
            S.body = body;
        }
    
        if (c?.rotation){
          S.pitch = c.rotation.x||0;
          S.yaw   = c.rotation.y||0;
        }
        yaw.rotation.y = S.yaw;
      }
    
      function clearCameraInputs(s: any){
        const c = cam(); if (!c) return;
        try{ c.inputs.clear(); }catch(_){}
        c.checkCollisions = true;
        c.applyGravity = false;
        c.inertia = 0;
        c.parent = null;
      }
    
      function attachFP(s: any){
        const c=cam(); if(!c) return;
        c.parent = S.head;
        c.position.set(0,0,0);
        c.rotation.set(0,0,0);
        c.fov = 0.9;
        S.mode="fp";
        if (S.body) S.body.setEnabled(false);
      }
    
      function attachTP(s: any){
        const c=cam(); if(!c) return;
        c.parent = null;
        const d = S.tpDists[S.tpIdx]||3.6;
        const headWS = S.head.getAbsolutePosition();
        const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
        // FIX: Remove `(window as any)` cast
        const back = new window.BABYLON.Vector3(-sin*d, 0.25, -cos*d);
        const pos = headWS.add(back);
        c.position.copyFrom(pos);
        c.setTarget(headWS);
        c.fov=0.9;
        S.mode="tp";
        if (S.body) S.body.setEnabled(true);
      }
    
      function toggleView(s: any, cycleOnly: boolean){
        if (S.mode==="tp" && cycleOnly){ S.tpIdx=(S.tpIdx+1)%S.tpDists.length; attachTP(s); return; }
        if (S.mode==="fp") attachTP(s); else attachFP(s);
      }
    
      function hookPointer(s: any){
        s.onPointerObservable.add((pi: any)=>{
          // FIX: Remove `(window as any)` cast
          if (!S.movementEnabled || pi.type !== window.BABYLON.PointerEventTypes.POINTERMOVE) return;
          if (!window.PP.pointerLock?.isLocked()) return;
          
          const ev = pi.event;
          const dx = ev.movementX||0, dy = ev.movementY||0;
          const sens = cfg()?.mouseSens || 0.0022;
    
          S.yaw   += dx * sens;
          S.pitch  = clamp(S.pitch - dy * sens, -toRad(89), toRad(89));
          S.yaw = (S.yaw + Math.PI*2)%(Math.PI*2);
        });
      }
    
      function moveRig(dt: number){
        if (!S.movementEnabled) return;
        
        const flags = window.PP.getMovementFlags ? window.PP.getMovementFlags() : { forward:false, back:false, left:false, right:false, running:false };
    
        const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
        // FIX: Remove `(window as any)` cast
        const fwd = new window.BABYLON.Vector3(sin, 0, cos);
        const right= new window.BABYLON.Vector3(cos, 0, -sin);
    
        let x=0, z=0;
        if (flags.forward) z += 1;
        if (flags.back) z -= 1;
        if (flags.right) x += 1;
        if (flags.left) x -= 1;
    
        const speeds = window.PP.getSpeeds ? window.PP.getSpeeds() : { walk: 1.8, run: 3.2 };
        let spd = flags.running ? speeds.run : speeds.walk;
    
        // FIX: Remove `(window as any)` cast
        const dir = new window.BABYLON.Vector3(0,0,0);
        if (x) dir.addInPlace(right.scale(x));
        if (z) dir.addInPlace(fwd.scale(z));
        if (dir.lengthSquared()>0.0001) dir.normalize();
    
        const move = dir.scale(spd*dt);
        S.rigRoot.moveWithCollisions(move);
    
        if (!S.grounded) S.velY += S.gravity * dt;
        
        // FIX: Remove `(window as any)` cast
        const gravMove = new window.BABYLON.Vector3(0, S.velY * dt, 0);
        S.rigRoot.moveWithCollisions(gravMove);
        
        const s = scene();
        // FIX: Remove `(window as any)` casts
        const groundRay = new window.BABYLON.Ray(S.rigRoot.position, new window.BABYLON.Vector3(0, -1, 0), 1.1);
        const hit = s.pickWithRay(groundRay, (mesh: any) => mesh.isPickable && mesh.checkCollisions);
        if (hit && hit.hit) {
            S.velY = 0;
            S.grounded = true;
        } else {
            S.grounded = false;
        }
      }
      
      function applyRigToNodes(){
        S.yawNode.rotation.y = S.yaw;
        S.head.rotation.x = S.pitch;
    
        const c=cam(); if(!c) return;
        if (S.mode==="fp"){
          if (c.parent !== S.head) attachFP(scene());
          c.rotation.set(0,0,0);
          c.position.set(0,0,0);
        } else {
          if (c.parent) c.parent=null;
          const d=S.tpDists[S.tpIdx]||3.6;
          const headWS=S.head.getAbsolutePosition();
          const yaw=S.yaw, cos=Math.cos(yaw), sin=Math.sin(yaw);
          // FIX: Remove `(window as any)` cast
          const back=new window.BABYLON.Vector3(-sin*d, 0.25, -cos*d);
          const pos=headWS.add(back);
          c.position.copyFrom(pos);
          c.setTarget(headWS);
        }
      }
    
      function loop(){
        const s=scene(); if(!s||!cam()) { return; }
        const dt = Math.min(0.05, s.getEngine().getDeltaTime()/1000);
        moveRig(dt);
        applyRigToNodes();
      }
      
      async function start() {
        const s = scene();
        if (!s) { setTimeout(start, 100); return; }
        if (S.running) return;
        S.running = true;
    
        await ensureRig(s);
        clearCameraInputs(s);
        hookPointer(s);
        attachFP(s);
        log("online (FP default)");
    
        s.onBeforeRenderObservable.add(loop);
      }
      
      window.addEventListener('pp:start', start, { once: true });
      
      window.addEventListener('keydown', (e) => {
          const keys = cfg()?.keys?.cameraToggle;
          if (keys && keys.includes(e.code)) {
              toggleView(scene(), e.shiftKey);
          }
      });
    
      // FIX: Remove `(window as any)` cast
      window.PlayerRig = {
        getHeadNode: () => S.head,
        getHandNode: () => S.handNode,
        getRigRoot: () => S.rigRoot,
        getState: () => S,
        enableMovement: (enable: boolean) => { S.movementEnabled = !!enable; }
      };
      
      if (window.PP?.signalReady) {
        window.PP.signalReady('playerRig');
      }
    
    })();
    console.log("[Loader] Player Rig Controller inlined and initialized.");
}

/**
 * Initializes the global ghost data from an inlined object.
 * This logic was moved from ghost_data.js to fix a loading error.
 */
function initializeGhostData() {
    window.PP.GHOST_DATA = {"Spirit":{"name":"Spirit (EMF Level 5, Spirit Box, Ghost Writing)","evidence":["EMF Level 5","Spirit Box","Ghost Writing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will wait 180s after being incensed before attempting to hunt again, instead of the standard 90s","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Wraith":{"name":"Wraith (EMF Level 5, Spirit Box, DOTS Projector)","evidence":["EMF Level 5","Spirit Box","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will not be slowed down by tier 3 salt during a hunt","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Phantom":{"name":"Phantom (Spirit Box, Ultraviolet, DOTS Projector)","evidence":["Spirit Box","Ultraviolet","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Less visible during hunts","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Poltergeist":{"name":"Poltergeist (Spirit Box, Ghost Writing, Ultraviolet)","evidence":["Spirit Box","Ghost Writing","Ultraviolet"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"During hunts, Poltergeists will throw an item every 0.5s with an increased force","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Banshee":{"name":"Banshee (Ultraviolet, DOTS Projector, Ghost Orbs)","evidence":["Ultraviolet","DOTS Projector","Ghost Orbs"],"hunt_sanity":50,"speed_min_mps":null,"speed_max_mps":null,"notes":"Hunts based on target's sanity instead of average sanity","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Jinn":{"name":"Jinn (EMF Level 5, Ultraviolet, Freezing)","evidence":["EMF Level 5","Ultraviolet","Freezing"],"hunt_sanity":null,"speed_min_mps":2.5,"speed_max_mps":2.5,"notes":"With the breaker on, the Jinn will speed up during a hunt if a player is in LOS and further than 3m away","movement":{"model":"distance_scaled_far","roam_speed":2.5,"chase_speed":2.5,"los_speedup":false,"near_speed":1.7,"far_speed":2.5,"far_distance":6.0}},"Mare":{"name":"Mare (Spirit Box, Ghost Writing, Ghost Orbs)","evidence":["Spirit Box","Ghost Writing","Ghost Orbs"],"hunt_sanity":60,"speed_min_mps":null,"speed_max_mps":null,"notes":"Won't hunt until 40% average sanity when light switch in its current room is in the on position (regardless of breaker state), 60% average sanity if light switch is in the off position or if the lights are broken (regard","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Revenant":{"name":"Revenant (Ghost Writing, Ghost Orbs, Freezing)","evidence":["Ghost Writing","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":3.0,"speed_max_mps":3.0,"notes":"During a hunt, a Revenant will be slow (1.0m/s) until it detects a player (voice, active electronic equipment, or LOS) where it will immediately speed up to 3.0m/s and remain at that speed until it reaches the players la","movement":{"model":"revenant","roam_speed":3.0,"chase_speed":3.0,"los_speedup":true,"no_los_speed":1.1,"los_speed":3.0}},"Shade":{"name":"Shade (EMF Level 5, Ghost Writing, Freezing)","evidence":["EMF Level 5","Ghost Writing","Freezing"],"hunt_sanity":35,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will not hunt if in the same room as a player","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Demon":{"name":"Demon (Ghost Writing, Ultraviolet, Freezing)","evidence":["Ghost Writing","Ultraviolet","Freezing"],"hunt_sanity":70,"speed_min_mps":null,"speed_max_mps":null,"notes":"Can hunt 60s after being smudged instead of the standard 90s","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Yurei":{"name":"Yurei (DOTS Projector, Ghost Orbs, Freezing)","evidence":["DOTS Projector","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Only ghost that can close or interact with an exit door outside of a hunt/event","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Oni":{"name":"Oni (EMF Level 5, DOTS Projector, Freezing)","evidence":["EMF Level 5","DOTS Projector","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Blinks more frequently during hunts, making them more visible","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Yokai":{"name":"Yokai (Spirit Box, DOTS Projector, Ghost Orbs)","evidence":["Spirit Box","DOTS Projector","Ghost Orbs"],"hunt_sanity":80,"speed_min_mps":null,"speed_max_mps":null,"notes":"Hearing/detection distance is 2.5m and less during hunts","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Hantu":{"name":"Hantu (Ultraviolet, Ghost Orbs, Freezing)","evidence":["Ultraviolet","Ghost Orbs","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will have visible freezing breath during hunts when the breaker is off/broken","movement":{"model":"temperature_scaled","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false,"warm_speed":1.4,"cold_speed":2.7}},"Goryo":{"name":"Goryo (EMF Level 5, Ultraviolet, DOTS Projector)","evidence":["EMF Level 5","Ultraviolet","DOTS Projector"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"DOTS only appear on video camera and will not show if a player is in the same room (DOTS state can start outside of room and enter a player's room)","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Myling":{"name":"Myling (EMF Level 5, Ghost Writing, Ultraviolet)","evidence":["EMF Level 5","Ghost Writing","Ultraviolet"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Footsteps and vocals cannot be heard more than 12m away during hunts (normal is 20m)","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Onryo":{"name":"Onryo (Spirit Box, Ghost Orbs, Freezing)","evidence":["Spirit Box","Ghost Orbs","Freezing"],"hunt_sanity":60,"speed_min_mps":null,"speed_max_mps":null,"notes":"Will attempt to hunt at any sanity after extinguishing every 3rd flame","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"The Twins":{"name":"The Twins (EMF Level 5, Spirit Box, Freezing)","evidence":["EMF Level 5","Spirit Box","Freezing"],"hunt_sanity":null,"speed_min_mps":1.5,"speed_max_mps":1.5,"notes":"Ghost speed during hunts will be either 1.5m/s or 1.9m/s","movement":{"model":"twins","roam_speed":1.5,"chase_speed":1.5,"los_speedup":false,"primary_speed":1.7,"secondary_speed":1.2,"alternate_events":true}},"Raiju":{"name":"Raiju (EMF Level 5, DOTS Projector, Ghost Orbs)","evidence":["EMF Level 5","DOTS Projector","Ghost Orbs"],"hunt_sanity":65,"speed_min_mps":2.5,"speed_max_mps":2.5,"notes":"During events and hunts, causes electronic disturbance at a 15m range instead of 10m","movement":{"model":"electronics_scaled","roam_speed":2.5,"chase_speed":2.5,"los_speedup":false,"no_elec_speed":1.7,"elec_speed":2.9,"elec_radius":8.0}},"Obake":{"name":"Obake (EMF Level 5, Ultraviolet, Ghost Orbs)","evidence":["EMF Level 5","Ultraviolet","Ghost Orbs"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Special 6 fingered fingerprints ( Open 'Guides' tab )","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"The Mimic":{"name":"The Mimic (Spirit Box, Ultraviolet, Freezing)","evidence":["Spirit Box","Ultraviolet","Freezing"],"hunt_sanity":null,"speed_min_mps":null,"speed_max_mps":null,"notes":"Mimics a different ghost every 30 - 120 seconds, taking on all behaviors, tells, and abilities of that ghost (excluding evidence), leading to inconsistent behavior. Will always present Ghost Orbs as a fourth, fake evidence.","movement":{"model":"default","roam_speed":1.4,"chase_speed":2.6,"los_speedup":false}},"Moroi":{"name":"Moroi (Spirit Box, Ghost Writing, Freezing)","evidence":["Spirit Box","Ghost Writing","Freezing"],"hunt_sanity":null,"speed_min_mps":3.71,"speed_max_mps":3.71,"notes":"Incense blindness duration during hunts is increased from 5s to 7s","movement":{"model":"sanity_scaled","roam_speed":3.71,"chase_speed":3.71,"los_speedup":false,"min_speed":1.5,"max_speed":3.5}},"Deogen":{"name":"Deogen (Spirit Box, Ghost Writing, DOTS Projector)","evidence":["Spirit Box","Ghost Writing","DOTS Projector"],"hunt_sanity":40,"speed_min_mps":3.0,"speed_max_mps":3.0,"notes":"Very fast hunt speed, but will slow down as it nears the targeted player","movement":{"model":"distance_scaled","roam_speed":3.0,"chase_speed":3.0,"los_speedup":false,"min_speed":0.4,"max_speed":3.0,"distance_slow_radius":2.5}},"Thaye":{"name":"Thaye (Ghost Writing, DOTS Projector, Ghost Orbs)","evidence":["Ghost Writing","DOTS Projector","Ghost Orbs"],"hunt_sanity":75,"speed_min_mps":2.75,"speed_max_mps":2.75,"notes":"Hunts at 75% at its youngest, 15% at its oldest","movement":{"model":"age_scaled","roam_speed":2.75,"chase_speed":2.75,"los_speedup":false,"young_speed":2.75,"old_speed":1.0,"aging_minutes":20}}};

    // Derive the list of all possible evidence types directly from the ghost data
    // This ensures the journal and game logic are always in sync.
    const allEvidence = new Set<string>();
    Object.values(window.PP.GHOST_DATA).forEach((ghost: any) => {
      if (ghost.evidence) {
        ghost.evidence.forEach((ev: string) => allEvidence.add(ev));
      }
    });
    window.PP.ALL_EVIDENCE = Array.from(allEvidence).sort();
    console.log("[Loader] Ghost Data inlined and initialized.");
}

/**
 * Initializes the core ghost logic.
 * This logic was moved from ghost_logic.js to fix a loading error.
 */
function initializeGhostLogic() {
    if (window.PP?.ghost?.logic) return;

    const log = (...a: any[]) => console.log("[GhostLogic]", ...a);
    const warn = (...a: any[]) => console.warn("[GhostLogic]", ...a);
    
    const GhostLogic = {
        _scene: null as any,
        _isInitialized: false,
        
        data: null as any,
        root: null as any,
        modelRoot: null as any,
        
        init: function(scene: any) {
          if (this._isInitialized || !scene) return;
          this._scene = scene;
          
          this.root = new window.BABYLON.TransformNode("GhostRoot", scene);
          this.root.position.set(0, -100, 0);
          
          this.setModel('ghost.glb');
          
          scene.onBeforeRenderObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000));
          
          this._isInitialized = true;
          log("Initialized.");
        },
        
        setModel: async function(fileName: string) {
          if (!this.root || !this._scene) {
            warn("Cannot set model, logic not initialized properly.");
            return;
          }
          
          if (this.modelRoot) {
            this.modelRoot.dispose();
            this.modelRoot = null;
          }
          
          const fullUrl = `${BASE_URL}assets/ghosts/${fileName}`;
          log(`Loading ghost model from: ${fullUrl}`);
          
          try {
            const result = await window.BABYLON.SceneLoader.ImportMeshAsync(null, "", fullUrl, this._scene);
            const loadedRoot = result.meshes[0];
            
            if (!loadedRoot) {
                throw new Error("No meshes found in the loaded GLB file.");
            }
            
            loadedRoot.name = "ghostModelRoot";
            loadedRoot.parent = this.root;
            loadedRoot.position.set(0, 0, 0);
            
            this.modelRoot = loadedRoot;
            log("Ghost model loaded successfully.");
            
            this.setVisible(window.GHOST_DEV_FORCE_VISIBLE || false);

          } catch (error) {
            warn(`Failed to load ghost model: ${fullUrl}`, error);
          }
        },
        
        setScale: function(scale: number) {
          if (this.modelRoot) {
            this.modelRoot.scaling.setAll(scale);
          }
        },
        
        setVisible: function(isVisible: boolean) {
          const shouldBeVisible = window.GHOST_DEV_FORCE_VISIBLE || isVisible;
          
          if (this.modelRoot) {
            this.modelRoot.getChildMeshes(false).forEach((m: any) => m.setEnabled(shouldBeVisible));
            this.modelRoot.setEnabled(shouldBeVisible);
          }
        },
        
        update: function(dt: number) {
          if (!this.root || !this.data) return;
          // Future AI and movement logic would go here.
        }
    };
    
    // Ensure window.PP.ghost exists before assigning to it
    // FIX: Add `state` and `storage` to the initial object to satisfy TypeScript's inferred global type for PP, which requires these properties.
    // FIX: Use `null` for GHOST_DATA to satisfy the inferred type, which expects a complex object, not `{}`.
    // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
    window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
    window.PP.ghost = Object.assign(window.PP.ghost || {}, GhostLogic);
    window.PP.ghost.logic = true;
    
    if (window.PP?.signalReady) {
        window.PP.signalReady('ghostLogic');
    }

    console.log("[Loader] Ghost Logic inlined and initialized.");
}

// =================================================================================================
// SCRIPT INLINING
// To prevent script loading errors, all external game scripts have been moved into this file.
// They are wrapped in initializer functions and called sequentially in the main() function.
// =================================================================================================

function initializeInputManager() {
    /**
     * modular_bindings.js (now input_manager.js) (keyboard + PS5 controller)
     * - Unified input for keyboard and DualSense (PS5) controllers.
     * - Keyboard: WASD/keys as before.
     * - Controller: Maps Phasmophobia-like layout into the same state/slots/events.
     * - Exposes PP.getMovementFlags() and PP.getSpeeds().
     */
    (function () {
      if ((window as any).__PP_BINDINGS__) return; (window as any).__PP_BINDINGS__ = true;

      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      const PP = (window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} })) as Window['PP'];
      const C  = (PP.controls = PP.controls || {});
      PP.state = PP.state || {};
      PP.state.controls = PP.state.controls || { forward:false, back:false, left:false, right:false };
      PP.state.selectedSlot = PP.state.selectedSlot || 1;
      PP.state.running = false;

      const Keys: { [key: string]: boolean } = Object.create(null);
      const F = PP.state.controls;

      // ---------- helpers ----------
      const has = (arr: string[], code: string) => Array.isArray(arr) && arr.includes(code);

      function S(){ 
        // FIX: Accessing window.engine is now type-safe.
        return window.scene || (window.engine && window.engine.scenes && window.engine.scenes[0]) || null; 
      }

      function uiBusy() {
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return true;
        const notebook = document.getElementById('notebook-modal');
        if (notebook && notebook.style.display !== 'none') return true;
        return false;
      }

      function emit(name: string, detail?: any) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
      }

      const syncHeldLights = () => { if (typeof (window as any).syncHeldLights === 'function') (window as any).syncHeldLights(); };
      const toggleNearestHouseLight = () => { if (typeof (window as any).toggleNearestHouseLight === 'function') (window as any).toggleNearestHouseLight(); };
      const setHousePower = (on: boolean) => { if (typeof (window as any).setHousePower === 'function') (window as any).setHousePower(on); };

      function preventIfNeeded(e: KeyboardEvent){
        const block = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
        if (block.includes(e.code)) e.preventDefault();
      }

      // ---------- Keyboard ----------
      addEventListener('keydown', (e) => {
        Keys[e.code] = true;
        if (uiBusy()) return;
        preventIfNeeded(e);

        const keyMap = C.keys || {};
        if (has(keyMap.forward, e.code)) F.forward = true;
        if (has(keyMap.back,    e.code)) F.back    = true;
        if (has(keyMap.left,    e.code)) F.left    = true;
        if (has(keyMap.right,   e.code)) F.right   = true;
        if (has(keyMap.sprint,  e.code)) PP.state.running = true;

        if (keyMap.slots?.includes(e.code)) {
          const n = parseInt(e.code.replace(/\D/g, ''), 10) || 0;
          if (n >= 1 && n <= 3) {
            emit('pp:belt:select', { slot: n - 1 });
            return;
          }
        }

        if (has(keyMap.notebook, e.code) && typeof window.openNotebook === 'function') window.openNotebook();
        if (has(keyMap.interact, e.code) && typeof (window as any).toggleNearestDoor === 'function') (window as any).toggleNearestDoor();
        if (has(keyMap.use,      e.code)) emit('pp:item:use');
        if (has(keyMap.minimap,  e.code) && typeof (window as any).toggleMinimap === 'function') (window as any).toggleMinimap();
        
        if (has(keyMap.lighter, e.code)) emit('pp:lighter:toggle');
        if (has(keyMap.flash, e.code)) emit('pp:flashlight:toggle');
        if (has(keyMap.uv,    e.code)) emit('pp:uv_light:toggle');
        if (has(keyMap.ir,    e.code)) emit('pp:ir_light:toggle');
        
        if (has(keyMap.lightToggle, e.code)) toggleNearestHouseLight();
        if (has(keyMap.powerToggle, e.code)) setHousePower(!(window as any).housePower);
      }, { capture: true });

      addEventListener('keyup', (e) => {
        Keys[e.code] = false;
        const keyMap = C.keys || {};
        if (has(keyMap.forward, e.code)) F.forward = false;
        if (has(keyMap.back,    e.code)) F.back    = false;
        if (has(keyMap.left,    e.code)) F.left    = false;
        if (has(keyMap.right,   e.code)) F.right   = false;
        if (has(keyMap.sprint,  e.code)) PP.state.running = false;
      }, { capture: true });

      // ---------- PS5 Controller ----------
      const ps5Bindings = {
        stick: { threshold: 0.25 },
        buttons: {
          0: () => { emit('pp:item:use') }, // X
          1: () => { emit('pp:item:drop') },           // Circle
          2: () => { emit('pp:item:pickup') },       // Square
          3: () => { emit('pp:belt:cycle', { direction: 1 }) },  // Triangle cycle
          9: () => { F.crouch = !F.crouch; emit('pp:crouch', { crouch: F.crouch }); },          // R3
          10: () => { F.crouch = !F.crouch; emit('pp:crouch', { crouch: F.crouch }); },         // L3
          4: () => { PP.state.running = true; },                                               // L1 hold = sprint
          6: () => { emit('pp:item:place') },         // L2
          7: () => { if (typeof (window as any).toggleNearestDoor === 'function') (window as any).toggleNearestDoor(); },           // R2
          13: () => { emit('pp:flashlight:toggle'); } // D-pad Down
        } as {[key: number]: () => void}
      };
      const ps5Pressed = new Set();
      function pollController() {
        try {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = Array.from(pads).find(p => p && p.id.toLowerCase().includes('dualsense'));
            if (pad) {
              const axLH = pad.axes[0] || 0, axLV = pad.axes[1] || 0;
              F.left  = axLH < -ps5Bindings.stick.threshold;
              F.right = axLH >  ps5Bindings.stick.threshold;
              F.forward = axLV < -ps5Bindings.stick.threshold;
              F.back    = axLV >  ps5Bindings.stick.threshold;

              pad.buttons.forEach((btn, i) => {
                if (btn.pressed && !ps5Pressed.has(i) && ps5Bindings.buttons[i]) {
                  try { ps5Bindings.buttons[i](); } catch {}
                }
                if (btn.pressed) ps5Pressed.add(i); else ps5Pressed.delete(i);
                
                if (i === 4 && !btn.pressed) PP.state.running = false; // release sprint
              });
            }
        } catch(e) {}
        requestAnimationFrame(pollController);
      }
      
      // ---------- Footsteps ----------
      (function footsteps() {
        let cam: any, st = { last: null as any, acc: 0 };
        function init(){
            const s = S(); if (!s || !s.activeCamera) return setTimeout(init, 200);
            cam = s.activeCamera;
            st.last = cam.position.clone();
            tick();
        }
        function tick(){
          const now = cam?.position;
          if (!st.last || !now) { requestAnimationFrame(tick); return; }
          const d = window.BABYLON.Vector3.Distance(now, st.last);
          st.last.copyFrom(now);

          const moving = F.forward || F.back || F.left || F.right;
          if (moving && cam.parent){ // parent check ensures we are not in free-cam
            st.acc += d;
            const stride = (PP.state.running ? (PP.controls.strideRun || 0.8) : (PP.controls.strideWalk || 1.2));
            if (st.acc >= stride){
              st.acc = 0;
              if (PP.audio?.playStep) { try { PP.audio.playStep(0.42); } catch {} }
            }
          }
          requestAnimationFrame(tick);
        }
        init();
      })();

      // ---------- Exports ----------
      PP.getMovementFlags = () => ({ ...F, running: !!PP.state.running, crouch: !!F.crouch });
      PP.getSpeeds        = () => ({ walk: PP.controls.speedWalk || 0.9, run: PP.controls.speedRun || 1.8 });

      window.addEventListener('pp:start', () => {
        try { if (typeof (window as any).buildBelt === 'function') (window as any).buildBelt(null); } catch {}
        pollController();
      }, { once: true });
      
      if (window.PP?.signalReady) {
        window.PP.signalReady('inputManager');
      }

    })();
    console.log("[Loader] Input Manager inlined.");
}

function initializePointerLockManager() {
    (function(){
      "use strict";
      if (window.PP?.pointerLock) return;

      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      const PP = (window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} })) as Window['PP'];
      const state = {
        canvas: null as HTMLElement | null,
        uiOpenCount: 0,       // how many UIs are asking to keep the mouse free
        wantedLock: false,    // desire to be locked when allowed
        isLocked: false,
      };

      function getCanvas(){ return state.canvas || (state.canvas = document.getElementById("renderCanvas")); }

      function canLock(){ return state.uiOpenCount <= 0; }
      function isLocked(){ return document.pointerLockElement === getCanvas(); }

      function lockNow(){
        const c = getCanvas(); if (!c) return;
        try { c.requestPointerLock?.(); } catch(_){}
      }
      function unlockNow(){
        try { document.exitPointerLock?.(); } catch(_){}
      }

      function ensure(){
        state.isLocked = isLocked();
        if (state.wantedLock && canLock() && !state.isLocked) lockNow();
        if ((!state.wantedLock || !canLock()) && state.isLocked) unlockNow();
      }

      // Public API
      const api = PP.pointerLock = {
        lock(){ state.wantedLock = true; ensure(); },
        unlock(){ state.wantedLock = false; ensure(); },
        hold(reason: string){ // e.g. UI opened
          state.uiOpenCount = Math.max(1, state.uiOpenCount + 1);
          ensure();
        },
        release(reason: string){ // e.g. UI closed
          state.uiOpenCount = Math.max(0, state.uiOpenCount - 1);
          ensure();
        },
        isLocked: isLocked
      };

      // Observe native pointer lock changes
      ["pointerlockchange","mozpointerlockchange","webkitpointerlockchange"].forEach(ev=>{
        document.addEventListener(ev, ()=> { state.isLocked = isLocked(); }, false);
      });

      // Auto (re)lock on canvas click when allowed
      document.addEventListener("click", (e)=>{
        if (!getCanvas() || e.target !== getCanvas()) return;
        state.wantedLock = true;
        ensure();
      }, true);

      // Keep behavior after tab switches etc.
      document.addEventListener("visibilitychange", ()=>{
        if (!document.hidden) ensure();
      });

      // Start locked after the Start button is used
      window.addEventListener("pp:start", ()=>{
        state.wantedLock = true;
        setTimeout(ensure, 100); // short delay to allow UI to settle
      }, { once:true });

      // Listen for events from UI modules
      window.addEventListener("pp:notebook:open", ()=> api.hold("notebook"));
      window.addEventListener("pp:notebook:close",()=> api.release("notebook"));
      window.addEventListener("pp:van:open",      ()=> api.hold("van"));
      window.addEventListener("pp:van:close",     ()=> api.release("van"));
      
      console.log("[PointerLockManager] Initialized.");
      
      if (window.PP?.signalReady) {
        window.PP.signalReady('pointerLock');
      }

    })();
    console.log("[Loader] Pointer Lock Manager inlined.");
}

function initializeEnvAndSound() {
    /**
     * Modular audio (HTMLAudio) — Weather-only ambience + Spirit Box (static loop + whisper)
     * Adds optional spatialization for the Spirit Box via a shared PannerNode.
     * Replaces the previous env_and_sound.js
     */
    (function(){
      if ((window as any).__PP_AUDIO__) return; (window as any).__PP_AUDIO__ = true;

      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
      const PP = window.PP;
      PP.audio = PP.audio || {};
      
      PP.audio.gain = { master:1.0, ambient:1.0, sfx:1.0, ui:1.0 };

      const A = PP.audio.tracks = {
        rain:      new Audio(`${BASE_URL}assets/audio/rainstorm.mp3`),
        clear:     new Audio(`${BASE_URL}assets/audio/clearWeather.mp3`),
        spiritbox: new Audio(`${BASE_URL}assets/audio/spiritbox.mp3`),
        whisper:   new Audio(`${BASE_URL}assets/audio/whisper.mp3`),
        doorCreak1:new Audio(`${BASE_URL}assets/audio/doorCreak1.mp3`),
        doorCreak2:new Audio(`${BASE_URL}assets/audio/doorCreak2.mp3`),
        slam1:     new Audio(`${BASE_URL}assets/audio/doorSlam1.mp3`),
        slam2:     new Audio(`${BASE_URL}assets/audio/doorSlam2.mp3`),
        ghostLaugh:new Audio(`${BASE_URL}assets/audio/ghostLaugh.mp3`),
        writing:   new Audio(`${BASE_URL}assets/audio/GhostWriting1.mp3`),
        steps: [
          new Audio(`${BASE_URL}assets/audio/step1.mp3`),
          new Audio(`${BASE_URL}assets/audio/step2.mp3`),
          new Audio(`${BASE_URL}assets/audio/step3.mp3`)
        ]
      };

      // loop flags
      Object.values(A).forEach((v: any)=>{
        if (Array.isArray(v)) v.forEach(x=>{ if ('loop' in x) x.loop=false; });
        else if ('loop' in v) v.loop=false;
      });
      A.rain.loop = true; A.clear.loop = true; A.spiritbox.loop = true;

      // utils
      function setVol(el: HTMLAudioElement, base: number, channel='sfx'){
        try {
          const g = PP.audio.gain;
          el.volume = Math.max(0, Math.min(1, base * (g.master||1) * (g[channel as keyof typeof g]||1)));
        } catch {}
      }
      function stop(el: HTMLAudioElement){ try{ el.pause(); el.currentTime=0; }catch{} }
      function play(el: HTMLAudioElement){ try{ el.play().catch(()=>{}); }catch{} }

      // weather
      let currentWeather: string | null = null;
      PP.audio.applyWeather = function(state: string){
        if (!state || currentWeather===state) return; currentWeather = state;
        stop(A.rain); stop(A.clear);
        switch(state){
          case "Clear":     setVol(A.clear, 0.30, 'ambient'); play(A.clear); break;
          case "Rain":
          case "Rainstorm":
          case "Bloodmoon": setVol(A.rain,  0.55, 'ambient'); play(A.rain);  break;
          case "Snow":
          default: break; // silence
        }
      };
      
      // This function is now exposed via the EnvAndSound interface
      function firstInteractionBoot() {
        Object.values(A).forEach((v: any)=>{
          if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=true; x.play().then(()=>x.pause()).catch(()=>{});}catch{} });
          else { try{ v.muted=true; v.play().then(()=>v.pause()).catch(()=>{});}catch{} }
        });
        setTimeout(()=>{
          Object.values(A).forEach((v: any)=>{
            if (Array.isArray(v)) v.forEach(x=>{ try{ x.muted=false; }catch{} });
            else { try{ v.muted=false; }catch{} }
          });
          ensureGraph();
          const initialWeather = ((window as any).weather&&(window as any).weather.state) || 'Clear';
          PP.audio.applyWeather(initialWeather);
          console.log("[Audio] System unmuted and ready.");
        }, 50);
      }

      PP.audio.playStep = function(volume=0.5){
        const s = A.steps[(Math.random()*A.steps.length)|0];
        try { s.currentTime=0; setVol(s, volume, 'sfx'); s.play().catch(()=>{});} catch {}
      };

      // ---- Spirit Box graph (adds optional shared panner) ----
      let ctx: AudioContext | null=null, srcStatic: MediaElementAudioSourceNode|null=null, srcWhisper: MediaElementAudioSourceNode|null=null, gStatic: GainNode|null=null, gWhisper: GainNode|null=null, biq: BiquadFilterNode|null=null, pan: PannerNode|null=null;
      const _duckTimers = { up:null as any, hold:null as any, down:null as any };

      function ensureGraph(){
        if (ctx) return true;
        try{
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          ctx = new AudioContext();
          srcStatic  = ctx.createMediaElementSource(A.spiritbox);
          srcWhisper = ctx.createMediaElementSource(A.whisper);
          gStatic  = ctx.createGain();   gStatic.gain.value = 1.0;
          gWhisper = ctx.createGain();   gWhisper.gain.value = 0.0;
          biq = ctx.createBiquadFilter(); biq.type='bandpass'; biq.frequency.value=1200; biq.Q.value=1.2;
          pan = ctx.createPanner();
          // FIX: Use a valid value for panningModel. 'inverse' is for distanceModel. 'HRTF' is a good choice for spatial audio.
          pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
          pan.rolloffFactor = 1.0; pan.refDistance = 2.0; pan.maxDistance = 40.0;
          pan.coneInnerAngle = 360; pan.coneOuterAngle = 360; pan.coneOuterGain = 0.6;
          try { pan.positionZ.setValueAtTime(0, ctx.currentTime); }catch{}
          srcStatic.connect(gStatic).connect(pan).connect(ctx.destination);
          srcWhisper.connect(biq).connect(gWhisper).connect(pan);
          return true;
        }catch(e){ console.warn('[audio] WebAudio unavailable; using HTMLAudio fallback', e); return false; }
      }
      function _clearFallbackTimers(){
        if (_duckTimers.up)   { clearInterval(_duckTimers.up);   _duckTimers.up=null; }
        if (_duckTimers.down) { clearInterval(_duckTimers.down); _duckTimers.down=null; }
        if (_duckTimers.hold) { clearTimeout(_duckTimers.hold);  _duckTimers.hold=null; }
      }

      PP.audio.spiritBox = {
        power(on: boolean){
          if (on){
            setVol(A.spiritbox, 0.55, 'sfx');
            try { A.spiritbox.play().catch(()=>{}); } catch {}
            if (ctx && ctx.state==='suspended') ctx.resume().catch(()=>{});
            return;
          }
          _clearFallbackTimers();
          try { A.whisper.pause(); A.whisper.currentTime=0; }catch{}
          try { A.spiritbox.pause(); A.spiritbox.currentTime=0; }catch{}
          try { A.spiritbox.volume = 0; } catch {}
          if (ctx){
            const now = ctx.currentTime||0;
            try{
              gStatic?.gain.cancelScheduledValues(now);  gStatic && (gStatic.gain.value=1.0);
              gWhisper?.gain.cancelScheduledValues(now); gWhisper && (gWhisper.gain.value=0.0);
            }catch{}
          }
        },
        ghostSpeak(opts: any={}){
          const { gain=0.9, duck=0.65, attack=0.05, hold=0.8, release=0.35, pitchMin=0.92, pitchMax=1.08, centerHz=1200, Q=1.2 } = opts;
          const ok = ensureGraph();
          const rate = pitchMin + Math.random()*(pitchMax-pitchMin);
          try { A.whisper.playbackRate = rate; A.whisper.currentTime=0; } catch {}
          setVol(A.whisper, 0.85, 'sfx');
          try { A.whisper.play().catch(()=>{}); } catch {}
          if (!ok || !ctx){ /* Fallback logic here... */ return; }
          try {
            if (biq){ biq.frequency.setTargetAtTime(centerHz, ctx.currentTime, 0.01); biq.Q.setTargetAtTime(Q, ctx.currentTime, 0.01); }
            const now = ctx.currentTime, end = now + attack + hold + release;
            const s0 = gStatic!.gain.value;
            gStatic!.gain.cancelScheduledValues(now);
            gStatic!.gain.setValueAtTime(s0, now);
            gStatic!.gain.linearRampToValueAtTime(s0*duck, now+attack);
            gStatic!.gain.setValueAtTime(s0*duck, now+attack+hold);
            gStatic!.gain.linearRampToValueAtTime(s0, end);
            gWhisper!.gain.cancelScheduledValues(now);
            gWhisper!.gain.setValueAtTime(0.0, now);
            gWhisper!.gain.linearRampToValueAtTime(gain, now+attack);
            gWhisper!.gain.setValueAtTime(gain, now+attack+hold);
            gWhisper!.gain.linearRampToValueAtTime(0.0, end);
          } catch {}
        },
        enableSpatial(on=true){
          if (!ensureGraph() || !pan) return;
          try {
            pan.refDistance = on ? 2.0 : 1e6;
            pan.rolloffFactor = on ? 1.0 : 0.0;
          } catch {}
        },
        // FIX: Replace incorrect `.call` on AudioParam with modern API.
        setWorldPosition(x=0,y=0,z=0){
          if (!ensureGraph() || !pan || !ctx) return;
          try {
            if (pan.positionX) {
                pan.positionX.setValueAtTime(x, ctx.currentTime);
                pan.positionY.setValueAtTime(y, ctx.currentTime);
                pan.positionZ.setValueAtTime(z, ctx.currentTime);
            } else {
                (pan as any).setPosition(x, y, z);
            }
          } catch {}
        },
        // FIX: Replace incorrect `.call` on AudioParam with modern API.
        setListener(x:number,y:number,z:number, fx:number,fy:number,fz:number, ux:number,uy:number,uz:number){
          if (!ensureGraph() || !ctx) return;
          const L = ctx.listener;
          try {
            if (L.positionX) {
                const time = ctx.currentTime;
                L.positionX.setValueAtTime(x, time);
                L.positionY.setValueAtTime(y, time);
                L.positionZ.setValueAtTime(z, time);
                L.forwardX.setValueAtTime(fx, time);
                L.forwardY.setValueAtTime(fy, time);
                L.forwardZ.setValueAtTime(fz, time);
                L.upX.setValueAtTime(ux, time);
                L.upY.setValueAtTime(uy, time);
                L.upZ.setValueAtTime(uz, time);
            } else {
                (L as any).setPosition(x,y,z);
                (L as any).setOrientation(fx,fy,fz, ux,uy,uz);
            }
          } catch {}
        }
      };

      PP.audio.play = {
        spiritboxOn:  () => PP.audio.spiritBox.power(true),
        spiritboxOff: () => PP.audio.spiritBox.power(false),
        whisper:      () => PP.audio.spiritBox.ghostSpeak(),
        doorCreak: () => { const x=Math.random()<0.5?A.doorCreak1:A.doorCreak2; setVol(x,0.7,'sfx'); play(x); },
        slam:      () => { const x=Math.random()<0.5?A.slam1:A.slam2; setVol(x,0.85,'sfx'); play(x); },
        ghostLaugh:() => { setVol(A.ghostLaugh,0.75,'sfx'); play(A.ghostLaugh); },
        writing:   () => { setVol(A.writing,0.8,'sfx'); play(A.writing); }
      };

      PP.audio.setGains = (g:any) => Object.assign(PP.audio.gain, g||{});
      PP.audio.stopAll = function(){
        try{
          Object.values(A).forEach((v: any)=>{ if(Array.isArray(v)) v.forEach(stop); else stop(v); });
          PP.audio.spiritBox.power(false);
        }catch{}
      };

      // Expose a compatible API on EnvAndSound
      window.EnvAndSound = {
          firstInteractionBoot: firstInteractionBoot,
          setWeather: PP.audio.applyWeather,
          // Add other functions if needed by bootstrap
      };
      
      if (window.PP?.signalReady) {
        window.PP.signalReady('envAndSound');
      }

    })();
    console.log("[Loader] Env and Sound inlined.");
}

function initializeMapLoader() {
    (function(){
      "use strict";
      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
      
      const MAPS = [
          {
              id: 'main_map',
              title: 'Investigation Site',
              file: 'map.glb'
          },
          {
              id: 'procedural_house',
              title: 'Procedural House',
              file: null
          }
      ];

      window.PP.mapManifest = MAPS;

      console.log("[map_loader] Map manifest set. Total maps:", window.PP.mapManifest.length);
      
      if (window.PP.signalReady) {
        window.PP.signalReady('mapLoader');
      }
    })();
    console.log("[Loader] Map Loader inlined.");
}

function initializeMapManager() {
    (function(){
    "use strict";
    if(window.PP && window.PP.mapManager) return;
    // FIX: Initialize window.PP with required properties to satisfy the global type.
    // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
    window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
    
    let currentMapRoot: any = null;
    const log  = (...a: any[])=>{ try{ console.log("[mapManager]", ...a); }catch{} };
    const warn = (...a: any[])=>{ try{ console.warn("[mapManager]", ...a); }catch{} };

    async function loadMap(mapData: any) {
        const scene = window.scene;
        if (!scene) {
            warn("Scene is not available for map loading.");
            return;
        }

        if (currentMapRoot) {
            log("Disposing of previous map...");
            currentMapRoot.dispose();
            currentMapRoot = null;
        }

        if (!mapData || !mapData.file) {
            warn("Invalid map data provided.", mapData);
            throw new Error("Invalid map data. Cannot load map.");
        }

        const mapUrl = `${BASE_URL}assets/models/map/${mapData.file}`;
        log(`Loading map: ${mapUrl}`);

        try {
            const result = await window.BABYLON.SceneLoader.ImportMeshAsync(null, "", mapUrl, scene);
            
            currentMapRoot = new window.BABYLON.TransformNode(`mapRoot_${mapData.file}`, scene);

            result.meshes.forEach((mesh: any) => {
                mesh.parent = currentMapRoot;
                
                const name = mesh.name.toLowerCase();
                if (!name.includes("plant") && !name.includes("leaf") && !name.includes("grass")) {
                   mesh.checkCollisions = true;
                }
                
                mesh.receiveShadows = true;
            });

            log(`Map '${mapData.title}' loaded and processed successfully.`);

        } catch (error) {
            warn(`Failed to load map file: ${mapUrl}`, error);
            throw error;
        }
    }

    PP.mapManager = {
        loadMap
    };

    log("Map Manager initialized.");
    })();
    console.log("[Loader] Map Manager inlined.");
}

function initializePhasmaMapAndGhost() {
    (function(){
      "use strict";
      if (window.ProHouseGenerator) return;

      const WALL_HEIGHT = 3.0;
      const WALL_THICKNESS = 0.15;
      const DOOR_WIDTH = 1.2;
      const DOOR_HEIGHT = 2.2;
      const CELL_SIZE = 5;

      function createDoorCutoutBox(scene: any) {
        const box = window.BABYLON.MeshBuilder.CreateBox("doorCutout", {
          width: DOOR_WIDTH,
          height: DOOR_HEIGHT,
          depth: WALL_THICKNESS * 2 
        }, scene);
        box.position.y = DOOR_HEIGHT / 2;
        box.isVisible = false;
        return box;
      }

      function buildCellGeometry(scene: any, roomData: any, gridPos: any, materials: any) {
        const roomNode = new window.BABYLON.TransformNode(`room_${gridPos.x}_${gridPos.z}`, scene);

        const floor = window.BABYLON.MeshBuilder.CreateGround("floor", { width: CELL_SIZE, height: CELL_SIZE }, scene);
        floor.position.y = 0;
        floor.material = materials.floor;
        floor.checkCollisions = true;
        floor.parent = roomNode;

        const ceiling = floor.clone("ceiling");
        ceiling.position.y = WALL_HEIGHT;
        ceiling.rotation.x = Math.PI;
        ceiling.material = materials.ceiling;
        ceiling.parent = roomNode;

        const wallDefs = [
          { name: 'north', hasDoor: roomData.doors.north, pos: new window.BABYLON.Vector3(0, WALL_HEIGHT / 2, CELL_SIZE / 2), rotY: 0, len: CELL_SIZE },
          { name: 'south', hasDoor: roomData.doors.south, pos: new window.BABYLON.Vector3(0, WALL_HEIGHT / 2, -CELL_SIZE / 2), rotY: Math.PI, len: CELL_SIZE },
          { name: 'east',  hasDoor: roomData.doors.east,  pos: new window.BABYLON.Vector3(CELL_SIZE / 2, WALL_HEIGHT / 2, 0), rotY: Math.PI / 2, len: CELL_SIZE },
          { name: 'west',  hasDoor: roomData.doors.west,  pos: new window.BABYLON.Vector3(-CELL_SIZE / 2, WALL_HEIGHT / 2, 0), rotY: -Math.PI / 2, len: CELL_SIZE },
        ];
        
        for (const def of wallDefs) {
          let finalWall;
          if (def.hasDoor) {
            const wallBoxSource = window.BABYLON.MeshBuilder.CreateBox("csg_wall_source", { width: def.len, height: WALL_HEIGHT, depth: WALL_THICKNESS }, scene);
            wallBoxSource.isVisible = false;

            const doorCutoutBox = createDoorCutoutBox(scene);
            
            const wallCSG = window.BABYLON.CSG.FromMesh(wallBoxSource);
            const doorCSG = window.BABYLON.CSG.FromMesh(doorCutoutBox);

            const wallWithDoorCSG = wallCSG.subtract(doorCSG);
            
            finalWall = wallWithDoorCSG.toMesh(`wall_${def.name}`, materials.wall, scene, true);

            wallBoxSource.dispose();
            doorCutoutBox.dispose();
          } else {
            finalWall = window.BABYLON.MeshBuilder.CreateBox(`wall_${def.name}`, { width: def.len, height: WALL_HEIGHT, depth: WALL_THICKNESS }, scene);
          }
          
          finalWall.position = def.pos;
          finalWall.rotation.y = def.rotY;
          finalWall.material = materials.wall;
          finalWall.checkCollisions = true;
          finalWall.parent = roomNode;
        }

        const worldPos = new window.BABYLON.Vector3(gridPos.x * CELL_SIZE, 0, gridPos.z * CELL_SIZE);
        roomNode.position = worldPos;
        return roomNode;
      }

      window.ProHouseGenerator = {
        GRID_SIZE: 8,

        generateMap: async function(scene: any) {
          console.log("[ProHouseGenerator] Starting map generation with primitives...");
          const grid = Array.from({ length: this.GRID_SIZE }, () => Array(this.GRID_SIZE).fill(null));
          const mapRoot = new window.BABYLON.TransformNode("ProceduralMapRoot", scene);

          const layout = [ {x:3, z:3}, {x:3, z:4}, {x:4, z:4}, {x:5, z:4} ];
          layout.forEach(p => {
            grid[p.x][p.z] = { doors: { north: false, south: false, east: false, west: false } };
          });
          
          window.PP_SPAWN_POS = new window.BABYLON.Vector3(3 * CELL_SIZE, 1.8, 6 * CELL_SIZE);

          for (let x = 0; x < this.GRID_SIZE; x++) {
            for (let z = 0; z < this.GRID_SIZE; z++) {
              if (!grid[x][z]) continue;
              if (x + 1 < this.GRID_SIZE && grid[x + 1][z]) { grid[x][z].doors.east = true; grid[x + 1][z].doors.west = true; }
              if (z + 1 < this.GRID_SIZE && grid[x][z + 1]) { grid[x][z].doors.north = true; grid[x][z + 1].doors.south = true; }
            }
          }

          const materials = {
            wall: new window.BABYLON.StandardMaterial("wallMat", scene),
            floor: new window.BABYLON.StandardMaterial("floorMat", scene),
            ceiling: new window.BABYLON.StandardMaterial("ceilingMat", scene)
          };
          materials.wall.diffuseColor = new window.BABYLON.Color3(0.9, 0.85, 0.8);
          materials.floor.diffuseColor = new window.BABYLON.Color3(0.6, 0.5, 0.4);
          materials.ceiling.diffuseColor = new window.BABYLON.Color3(0.95, 0.95, 0.95);

          for (let x = 0; x < this.GRID_SIZE; x++) {
            for (let z = 0; z < this.GRID_SIZE; z++) {
              if (grid[x][z]) {
                const roomNode = buildCellGeometry(scene, grid[x][z], { x, z }, materials);
                roomNode.parent = mapRoot;
              }
            }
          }
          
          console.log("[ProHouseGenerator] Map generation complete.");
          return { root: mapRoot, doors: [] };
        }
      };

      if (window.PP?.signalReady) {
        window.PP.signalReady('proceduralGenerator');
      }

    })();
    console.log("[Loader] Procedural House Generator inlined.");
}

function initializeInventorySystem() {
    (function(){
      "use strict";
      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      const PP = (window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} })) as Window['PP'];
      PP.inventory = PP.inventory || {};

      const ITEM_META = {
        dots:           { id:'dots',           name:'DOTS',           icon: `${BASE_URL}assets/icons/dots.png` },
        smudge:         { id:'smudge',         name:'Smudge Stick',   icon: `${BASE_URL}assets/icons/smudge_sticks.png` },
        salt:           { id:'salt',           name:'Salt Shaker',    icon: `${BASE_URL}assets/icons/salt.png` },
        sanity:         { id:'sanity',         name:'Sanity Meds',    icon: `${BASE_URL}assets/icons/sanity_pills.png` },
        crucifix:       { id:'crucifix',       name:'Crucifix',       icon: `${BASE_URL}assets/icons/crucifix.png` },
        spirit:         { id:'spirit',         name:'Spirit Box',     icon: `${BASE_URL}assets/icons/spirit_box.png` },
        book:           { id:'book',           name:'Writing Book',   icon: `${BASE_URL}assets/icons/ghost_writing_book.png` },
        emf:            { id:'emf',            name:'EMF Reader',     icon: `${BASE_URL}assets/icons/emf.png` },
        uv:             { id:'uv',             name:'UV Flashlight',  icon: `${BASE_URL}assets/icons/uv_light.png` }
      };

      PP.inventory.ITEM_META = Object.assign(PP.inventory.ITEM_META || {}, ITEM_META);

    })();
    console.log("[Loader] Inventory System inlined.");
}

function initializeSaltSystem() {
    (function(){
        // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Salt System inlined.");
}

function initializeWritingBook() {
    (function(){
        // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Writing Book System inlined.");
}

function initializeUvPrints() {
    (function(){
      'use strict';
      if (window.UVPrints) return;

      const SCENE = ()=> window.scene || window.BABYLON.Engine?.LastCreatedScene;

      const TEX = `${BASE_URL}assets/textures/uv_footprint.png`;
      const TTL = 60, FADE = 15, SCALE = 0.45, HEIGHT = 0.02;

      let mat: any=null;
      function ensureMat(s: any){
        if (mat) return mat;
        mat = new window.BABYLON.StandardMaterial('uv_print_mat', s);
        mat.diffuseTexture  = new window.BABYLON.Texture(TEX, s, true, false);
        mat.emissiveTexture = mat.diffuseTexture;
        mat.opacityTexture  = mat.diffuseTexture;
        mat.diffuseColor    = new window.BABYLON.Color3(0.0, 0.6, 0.2);
        mat.emissiveColor   = new window.BABYLON.Color3(0.2, 1.0, 0.4);
        mat.specularColor   = new window.BABYLON.Color3(0,0,0);
        mat.backFaceCulling = false;
        mat.freeze?.();
        return mat;
      }

      const PRINTS: any[] = [];
      function now(){ return (performance?.now?.() ?? Date.now())/1000; }

      function makePrintNode(s: any, pos: any, rotY=0, flip=false){
        const plane = window.BABYLON.MeshBuilder.CreatePlane('uv_print', { size: SCALE, sideOrientation: window.BABYLON.Mesh.DOUBLESIDE }, s);
        plane.material = ensureMat(s);
        plane.rotation = new window.BABYLON.Vector3(Math.PI/2, 0, flip ? Math.PI : 0);
        plane.position = new window.BABYLON.Vector3(pos.x, (pos.y||0)+HEIGHT, pos.z);
        plane.rotation.y = rotY;
        plane.isPickable = false;
        (plane as any).doNotSyncBoundingInfo = true;
        plane.freezeWorldMatrix?.();
        return plane;
      }

      function snapToGround(s: any, p: any){
        try{
          const ray = new window.BABYLON.Ray(new window.BABYLON.Vector3(p.x, (p.y||2)+5, p.z), new window.BABYLON.Vector3(0,-1,0), 20);
          const hit = s.pickWithRay(ray, (m: any) => m && m.isPickable !== false);
          if (hit?.hit && hit.pickedPoint) return hit.pickedPoint;
        }catch(_){}
        return p;
      }

      const API: any = {};
      API.addFootprint = function(pos: any, rotY=0){
        const s=SCENE(); if (!s) return null;
        const p = snapToGround(s, pos);
        const flip = Math.random() < 0.5;
        const mesh = makePrintNode(s, p, rotY, flip);
        PRINTS.push({ mesh, born: now() });
        return mesh;
      };
      API.addStepPair = function(centerPos: any, dirYRad: number){
        const s=SCENE(); if (!s) return null;
        const dir = new window.BABYLON.Vector3(Math.sin(dirYRad), 0, Math.cos(dirYRad));
        const side = window.BABYLON.Vector3.Cross(dir, window.BABYLON.Axis.Y).normalize();
        const stride = 0.35, width = 0.12;
        const pL = centerPos.add(dir.scale(stride)).add(side.scale(+width));
        const pR = centerPos.add(dir.scale(stride*1.9)).add(side.scale(-width));
        API.addFootprint(pL, dirYRad);
        API.addFootprint(pR, dirYRad);
      };
      API.clear = function(){
        for (const it of PRINTS){ try{ it.mesh.dispose(); }catch(_){ } }
        PRINTS.length = 0;
      };

      function attachLoop(){
        const s=SCENE(); if (!s){ setTimeout(attachLoop, 120); return; }
        s.onBeforeRenderObservable.add(()=>{
          const t = now();
          for (let i=PRINTS.length-1; i>=0; i--){
            const it = PRINTS[i], age = t - it.born;
            if (age >= TTL){
              try{ it.mesh.dispose(); }catch(_){}
              PRINTS.splice(i,1);
              continue;
            }
            if (age >= (TTL - FADE)){
              const a = 1 - ((age - (TTL - FADE))/FADE);
              const m = it.mesh.material;
              if (m) { m.alpha = Math.max(0, Math.min(1, a)); }
            }
          }
        });
      }
      attachLoop();

      window.UVPrints = API;
    })();
    console.log("[Loader] UV Prints System inlined.");
}

function initializeLighter() {
    (function(){
      'use strict';
      if (window.LIGHTER) return;

      const log = (...a: any[]) => console.log("[Lighter]", ...a);
      
      // FIX: Cast the lighter object to `any` to allow adding properties dynamically.
      const lighter: any = (window.LIGHTER = {
        mesh: null as any,
        flameEffect: null as any,
        light: null as any,
        isOn: false,
        _isInitialized: false,
      });

      lighter.init = function(scene: any){
        if (!scene || lighter._isInitialized) return;
        
        const playerRig = window.PlayerRig;
        const handNode = playerRig?.getHandNode();

        if (!handNode) {
            console.warn("[Lighter] HandNode not available on PlayerRig. Deferring init.");
            setTimeout(() => lighter.init(scene), 200);
            return;
        }
        
        log("Initializing...");

        const body = window.BABYLON.MeshBuilder.CreateBox("lighterBody", {width: 0.04, height: 0.06, depth: 0.015}, scene);
        
        lighter.light = new window.BABYLON.PointLight("lighterLight", window.BABYLON.Vector3.Zero(), scene);
        lighter.light.diffuse = new window.BABYLON.Color3(1, 0.7, 0.2);
        lighter.light.intensity = 0;
        lighter.light.range = 2.5;

        const flamePS = new window.BABYLON.ParticleSystem("lighterFlamePS", 500, scene);
        flamePS.particleTexture = new window.BABYLON.Texture(`${BASE_URL}assets/textures/flare.png`, scene);
        
        flamePS.minEmitBox = new window.BABYLON.Vector3(-0.005, 0.03, -0.005);
        flamePS.maxEmitBox = new window.BABYLON.Vector3(0.005, 0.03, 0.005);
        
        flamePS.color1 = new window.BABYLON.Color4(1, 0.5, 0, 1.0);
        flamePS.color2 = new window.BABYLON.Color4(1, 0.8, 0.3, 1.0);
        flamePS.colorDead = new window.BABYLON.Color4(0.1, 0, 0, 0.0);

        flamePS.minSize = 0.04;
        flamePS.maxSize = 0.08;
        flamePS.minLifeTime = 0.1;
        flamePS.maxLifeTime = 0.3;
        flamePS.emitRate = 200;
        flamePS.blendMode = window.BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        flamePS.gravity = new window.BABYLON.Vector3(0, 0.7, 0);
        flamePS.direction1 = new window.BABYLON.Vector3(0, 0.8, 0);
        flamePS.direction2 = new window.BABYLON.Vector3(0, 0.8, 0);
        flamePS.minAngularSpeed = 0;
        flamePS.maxAngularSpeed = Math.PI;
        flamePS.minEmitPower = 0.5;
        flamePS.maxEmitPower = 1.0;
        flamePS.updateSpeed = 0.007;
        
        lighter.flameEffect = flamePS;
        
        const rootMesh = new window.BABYLON.TransformNode("lighterRoot", scene);
        body.parent = rootMesh;
        lighter.light.parent = rootMesh;
        flamePS.emitter = rootMesh;
        
        lighter.light.position.y = 0.04;
        
        lighter.mesh = rootMesh;

        lighter.mesh.parent = handNode;
        lighter.mesh.position.set(0, 0, 0.05);
        lighter.mesh.rotation.set(Math.PI / 2, 0, 0);

        lighter.mesh.isPickable = false;
        lighter.mesh.getChildMeshes().forEach((m: any) => m.isPickable = false);
        
        lighter.toggle(false);

        scene.onBeforeRenderObservable.add(() => lighter.update(scene.getEngine().getDeltaTime() / 1000));
        
        lighter._isInitialized = true;
        log("Initialized successfully.");
      };

      lighter.toggle = function(state?: boolean){
        const shouldBeOn = state ?? !lighter.isOn;
        if (shouldBeOn === lighter.isOn && lighter._isInitialized) return;

        lighter.isOn = shouldBeOn;
        
        if (lighter.light) lighter.light.intensity = lighter.isOn ? 2.0 : 0;
        
        if (lighter.flameEffect) {
            if (lighter.isOn) lighter.flameEffect.start();
            else lighter.flameEffect.stop();
        }
        
        if (lighter.mesh) {
            lighter.mesh.setEnabled(lighter.isOn);
        }
      };

      lighter.update = function(dt: number){
        if (!lighter.isOn) return;
        
        const ghostData = window.PP?.state?.selectedGhost;
        const ghostRoot = window.PP?.ghost?.root;
        const rigRoot = window.PlayerRig?.getRigRoot();

        if (!ghostData || !ghostRoot || !rigRoot) return;

        const distance = window.BABYLON.Vector3.Distance(ghostRoot.position, rigRoot.position);

        if (distance < 3 && ghostData.name !== 'Shade' && Math.random() < (0.2 * dt)) {
          lighter.toggle(false);
          window.toast?.("Your lighter was extinguished!", 1500);
          
          if(window.PP?.tools?.emf?.trigger) {
            window.PP.tools.emf.trigger(rigRoot.position, 2);
          }
        }
      };
      
      window.addEventListener('pp:belt:equip', () => {
        if (lighter.isOn) {
            lighter.toggle(false);
        }
      });

    })();
    console.log("[Loader] Lighter System inlined.");
}

function initializeLantern() {
    (function(){
      'use strict';
      if (window.LANTERN) return;

      // FIX: Cast the lantern object to `any` to allow adding properties dynamically.
      const lantern: any = (window.LANTERN = {
        mesh: null as any,
        flameMaterial: null as any,
        flameTexture: null as any,
      });

      lantern.init = function(scene: any, mesh: any){
        if (!scene || !mesh) return;

        lantern.mesh = mesh;

        lantern.flameTexture = new window.BABYLON.FireProceduralTexture(
          "lanternFlame",
          256,
          scene,
          undefined,
          true
        );
        (lantern.flameTexture as any).fragmentUrl = `${BASE_URL}assets/dev/game/flame.fragment.fx`;

        lantern.flameMaterial = new window.BABYLON.StandardMaterial("lanternFlameMat", scene);
        lantern.flameMaterial.emissiveTexture = lantern.flameTexture;
        lantern.flameMaterial.backFaceCulling = false;

        lantern.mesh.material = lantern.flameMaterial;
      };

      lantern.update = function(dt: number){
        if (!lantern.flameTexture) return;
        (lantern.flameTexture as any).time += dt;
      };

    })();
    console.log("[Loader] Lantern System inlined.");
}

function initializeDotsSystem() {
    (function(){
      "use strict";
      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
      PP.tools = PP.tools || {};
      const V3 = window.BABYLON.Vector3, Q = window.BABYLON.Quaternion, M = window.BABYLON.Matrix;

      const CFG = {
        MAX_DOTS: 520,
        RAYS_PER_TICK: 200,
        TICK_MS: 90,
        CONE_DEG: 28,
        SPLIT_COUNT: 9,
        SPLIT_SPREAD_DEG: 12,
        DOT_SIZE: 0.055,
        MAX_DIST: 18,
        COLOR: new window.BABYLON.Color3(0.35,1.0,0.8),
        ALPHA: 0.95,
        EMISSIVE_BOOST: 1.0,
        NORMAL_OFFSET: 0.0015,
      };

      const S = {
        scn: null as any,
        enabled: false,
        emitter: null as any,
        mat: null as any,
        unit: null as any,
        matrices: null as any,
        used: 0,
        timer: null as any,
        lastCam: null as any,
        coneDeg: CFG.CONE_DEG,
        splitCount: CFG.SPLIT_COUNT,
        splitSpreadDeg: CFG.SPLIT_SPREAD_DEG,
        maxDist: CFG.MAX_DIST,
        color: CFG.COLOR.clone(),
        alpha: CFG.ALPHA
      };

      function scene(){ return window.scene || window.BABYLON.Engine?.LastCreatedScene || null; }

      function ensureMaterial(){
        if (S.mat && !S.mat.isDisposed()) return S.mat;
        const sc = S.scn || scene(); if (!sc) return null;
        const mat = new window.BABYLON.StandardMaterial("dots_mat", sc);
        mat.disableLighting = true;
        mat.emissiveColor = S.color.scale(CFG.EMISSIVE_BOOST);
        mat.alpha = S.alpha;
        mat.backFaceCulling = false;
        S.mat = mat;
        return mat;
      }

      function ensureMesh(){
        if (S.unit && !S.unit.isDisposed()) return S.unit;
        const sc = S.scn || scene(); if (!sc) return null;

        const unit = window.BABYLON.MeshBuilder.CreatePlane("dots_unit", { size: CFG.DOT_SIZE }, sc);
        unit.material = ensureMaterial();
        unit.setEnabled(false);
        (unit as any).thinInstanceEnablePicking = false;

        S.matrices = new Float32Array(16 * CFG.MAX_DOTS);
        for (let i=0;i<CFG.MAX_DOTS;i++){
          M.Identity().copyToArray(S.matrices, i*16);
        }
        unit.thinInstanceSetBuffer("matrix", S.matrices, 16, true);
        S.unit = unit;
        return unit;
      }

      function setColor(col: any){
        if (col){
          if (typeof col.r === "number") S.color.r = col.r;
          if (typeof col.g === "number") S.color.g = col.g;
          if (typeof col.b === "number") S.color.b = col.b;
          if (typeof col.alpha === "number") S.alpha = col.alpha;
        }
        if (S.mat && !S.mat.isDisposed()){
          S.mat.emissiveColor = S.color.scale(CFG.EMISSIVE_BOOST);
          S.mat.alpha = S.alpha;
        }
      }

      function setMaxDist(m: number){ if (typeof m === "number" && m>0) S.maxDist = m; }

      function setSplit(o: any){
        if (!o) return;
        if (typeof o.count === "number") S.splitCount = Math.max(0, Math.floor(o.count));
        if (typeof o.spreadDeg === "number") S.splitSpreadDeg = Math.max(0, o.spreadDeg);
      }

      function setEmitter(node: any){ S.emitter = node || null; }

      function randomInCone(forward: any, up: any, deg: number){
        const theta = window.BABYLON.Angle.FromDegrees(deg).radians();
        const u = Math.random();
        const v = Math.random();
        const cosTheta = 1 - u*(1 - Math.cos(theta));
        const sinTheta = Math.sqrt(1 - cosTheta*cosTheta);
        const phi = 2*Math.PI*v;

        const f = forward.normalizeToNew();
        const w = up && up.length() > 0.001 ? up.normalizeToNew() : V3.Up();
        const t = V3.Cross(w, f).normalizeToNew();
        const b = V3.Cross(f, t).normalizeToNew();

        return new V3(
          t.x * (Math.cos(phi)*sinTheta) + b.x * (Math.sin(phi)*sinTheta) + f.x * cosTheta,
          t.y * (Math.cos(phi)*sinTheta) + b.y * (Math.sin(phi)*sinTheta) + f.y * cosTheta,
          t.z * (Math.cos(phi)*sinTheta) + b.z * (Math.sin(phi)*sinTheta) + f.z * cosTheta
        ).normalize();
      }

      function raycast(origin: any, dir: any){
        const sc = S.scn; if (!sc) return null;
        const ray = new window.BABYLON.Ray(origin, dir, S.maxDist);
        const hit = sc.pickWithRay(ray, (m: any)=>{
          if (!m) return false;
          if (m.isPickable === false) return false;
          const n = (m.name||"").toLowerCase();
          if (/player_capsule|player|camera|dot_unit|dots_unit/.test(n)) return false;
          return true;
        });
        return (hit && hit.hit && hit.pickedPoint) ? hit : null;
      }

      function placeDot(idx: number, pos: any){
        const cam = S.scn.activeCamera || S.lastCam || null;
        let rotQ;
        if (cam){
          const toCam = cam.globalPosition.subtract(pos).normalize();
          rotQ = Q.FromLookDirectionLH(toCam, V3.Up());
          S.lastCam = cam;
        } else {
          rotQ = Q.Identity();
        }
        const mat = M.Compose(V3.One(), rotQ, pos);
        mat.copyToArray(S.matrices, idx*16);
      }

      function tick(){
        if (!S.enabled || !S.emitter || !S.scn || !S.unit) return;

        const em = S.emitter;
        const origin = em.getAbsolutePosition ? em.getAbsolutePosition() : (em.position || V3.Zero());
        let fwd = V3.Forward();
        if (em.getDirection) {
          try { fwd = em.getDirection(V3.Forward()); } catch {}
        } else if (em.rotationQuaternion) {
          fwd = V3.TransformNormal(V3.Forward(), em.rotationQuaternion.toRotationMatrix());
        }

        const up = V3.Up();
        const raysThisTick = S.splitCount > 0 ? Math.ceil(CFG.RAYS_PER_TICK / (S.splitCount+1)) : CFG.RAYS_PER_TICK;

        let placed = 0;
        function castRay(dir: any){
          const hit = raycast(origin, dir);
          if (!hit) return;
          const p = hit.pickedPoint.add(hit.getNormal(true).scale(CFG.NORMAL_OFFSET));
          const idx = S.used % CFG.MAX_DOTS;
          placeDot(idx, p);
          S.used++;
          placed++;
        }

        for (let i=0;i<raysThisTick;i++){
          const d = randomInCone(fwd, up, S.coneDeg);
          castRay(d);
        }
        for (let s=0; s<S.splitCount; s++){
          for (let i=0;i<Math.max(1, Math.floor(raysThisTick/6)); i++){
            const d = randomInCone(fwd, up, S.splitSpreadDeg);
            castRay(d);
          }
        }

        if (placed>0){
          S.unit.thinInstanceBufferUpdated("matrix");
        }
      }

      function start(){
        stop();
        S.timer = setInterval(tick, CFG.TICK_MS);
        S.scn.onBeforeRenderObservable.add(_keepCamRef);
      }
      function stop(){
        if (S.timer){ clearInterval(S.timer); S.timer = null; }
        try { S.scn.onBeforeRenderObservable.removeCallback(_keepCamRef); } catch {}
      }
      function _keepCamRef(){ S.lastCam = S.scn.activeCamera || S.lastCam; }

      function clearDots(){
        if (!S.unit || !S.matrices) return;
        for (let i=0;i<CFG.MAX_DOTS;i++) M.Identity().copyToArray(S.matrices, i*16);
        S.unit.thinInstanceBufferUpdated("matrix");
        S.used = 0;
      }

      function enable(on: boolean){
        S.enabled = !!on;
        if (S.enabled){ start(); } else { stop(); clearDots(); }
      }

      function init(){
        S.scn = scene();
        ensureMaterial();
        ensureMesh();
        setColor({ r:S.color.r, g:S.color.g, b:S.color.b, alpha:S.alpha });
      }

      function dispose(){
        stop();
        if (S.unit){ S.unit.dispose(); S.unit = null; }
        if (S.mat){ S.mat.dispose(); S.mat = null; }
        S.matrices = null;
      }

      PP.tools.dots = {
        init, enable, dispose,
        setEmitter, setSplit, setColor, setMaxDist
      };
    })();
    console.log("[Loader] DOTS System inlined.");
}

function initializeEmf() {
    (function(){
      'use strict';
      if ((window as any).__PP_EMF__) return; (window as any).__PP_EMF__ = true;

      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      const PP = (window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} })) as Window['PP'];
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      let ctx: AudioContext | null = null;
      try {
        ctx = new AudioContext();
      } catch(e) {
        console.warn("Could not create AudioContext for EMF sounds.");
      }

      const EMF = {
        level: 0,
        maxLevel: 5,
        decayRate: 0.4,
        active: false,
        beepTimers: [] as any[],
        position: ()=> PP.rig?.body?.position || {x:0,y:0,z:0},
        range: 4.0,
        lastSpikeTime: 0
      };

      function distance(pos1: any, pos2: any){
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
      }

      function beep(level: number){
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const base = 220;
        const step = 80;
        osc.frequency.value = base + (level-1)*step;
        gain.gain.value = 0.25;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }

      function spike(level: number){
        EMF.level = Math.max(EMF.level, Math.min(level, EMF.maxLevel));
        beep(level);
        EMF.lastSpikeTime = performance.now();
      }

      function decay(dt: number){
        if (EMF.level>0){
          EMF.level -= EMF.decayRate * dt;
          if (EMF.level<0) EMF.level=0;
        }
      }

      function isNear(pos: any){
        return distance(pos, EMF.position()) <= EMF.range;
      }

      function handleGhostEvent(ev: any){
        const ghost = (window as any).ghost || {};
        const ghostPos = ghost.position || {x:0,y:0,z:0};
        if (!isNear(ghostPos)) return;

        switch(ev.type){
          case 'throw':
          case 'book_write':
          case 'plate_interact':
          case 'cross_burn':
          case 'breaker':
          case 'salt':
            spike(1 + Math.floor(Math.random()*5));
            break;
          case 'hunt':
            const huntRange = ghost.type==='Raiju'? 10:4;
            if (distance(ghostPos, EMF.position()) <= huntRange){
              spike(1 + Math.floor(Math.random()*5));
            }
            break;
        }
      }

      const ghostEvents = [
        'pp:ghost:throw', 'pp:ghost:book_write', 'pp:ghost:plate',
        'pp:ghost:cross_burn', 'pp:ghost:breaker', 'pp:ghost:salt', 'pp:ghost:hunt'
      ];

      ghostEvents.forEach(evt=>{
        window.addEventListener(evt, (e: any)=> handleGhostEvent({type:e.type.split(':').pop(), detail:e.detail}));
      });

      let last = performance.now();
      function tick(){
        const now = performance.now();
        const dt = (now-last)/1000;
        last=now;
        decay(dt);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      window.EMF = EMF;
    })();
    console.log("[Loader] EMF System inlined.");
}

function initializeParabolicMic() {
    (function(){
      "use strict";
      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
      PP.tools = PP.tools || {};
      PP.tools.parabolic = PP.tools.parabolic || {};

      const CFG = {
        CONE_DEG: 16,
        RANGE: 30,
        BOOST: 1.30,
        TICK_MS: 120
      };

      const S = {
        scn: null as any,
        timer: null as any,
        active: false,
        orig: new WeakMap()
      };

      function scene(){ return (window as any).SCENE || window.scene || window.BABYLON.Engine?.LastCreatedScene || null; }

      function inCone(origin: any, forward: any, p: any, deg: number){
        const dir = p.subtract(origin).normalize();
        const cos = window.BABYLON.Vector3.Dot(forward.normalize(), dir);
        const cosTheta = Math.cos(window.BABYLON.Angle.FromDegrees(deg).radians());
        const dist = window.BABYLON.Vector3.Distance(origin, p);
        return (cos >= cosTheta) && (dist <= CFG.RANGE);
      }

      function tick(){
        if (!S.active || !S.scn) return;

        const cam = S.scn.activeCamera || (window as any).camera;
        if (!cam) return;
        const origin = cam.globalPosition || cam.position;
        const forward = cam.getDirection ? cam.getDirection(window.BABYLON.Vector3.Forward()) : new window.BABYLON.Vector3(0,0,1);

        const sounds = S.scn.soundTracks?.flatMap((t: any)=> t.soundCollection || []) || S.scn.mainSoundTrack?.soundCollection || [];
        if (!Array.isArray(sounds)) return;

        for (const snd of sounds){
          if (!snd) continue;
          const base = S.orig.get(snd);
          if (typeof base === 'number'){
            try{ snd.setVolume(base); }catch{}
          }
        }

        for (const snd of sounds){
          if (!snd || !snd.spatialSound) continue;
          const n = snd.connectedTransformNode || snd._connectedTransformNode || null;
          const p = n?.getAbsolutePosition?.() || n?.position || null;
          if (!p) continue;

          if (!S.orig.has(snd)){
            try { S.orig.set(snd, snd.getVolume()); } catch { S.orig.set(snd, 1.0); }
          }

          if (inCone(origin, forward, p, CFG.CONE_DEG)){
            const base = S.orig.get(snd) || 1.0;
            try { snd.setVolume(Math.min(1.0, base * CFG.BOOST)); } catch {}
          }
        }
      }

      function enable(on: boolean){
        S.active = !!on;
        if (S.active){
          if (!S.scn) S.scn = scene();
          if (!S.timer) S.timer = setInterval(tick, CFG.TICK_MS);
        } else {
          if (S.timer) { clearInterval(S.timer); S.timer = null; }
          const s = S.scn;
          const sounds = s?.soundTracks?.flatMap((t: any)=> t.soundCollection || []) || s?.mainSoundTrack?.soundCollection || [];
          if (Array.isArray(sounds)){
            for (const snd of sounds){
              const base = S.orig.get(snd);
              if (typeof base === 'number'){
                try{ snd.setVolume(base); }catch{}
              }
            }
          }
          S.orig = new WeakMap();
        }
      }

      PP.tools.parabolic.enable = enable;
    })();
    console.log("[Loader] Parabolic Mic System inlined.");
}

function initializeSpiritBox() {
    (function(){
        // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Spirit Box System inlined.");
}

function initializeBeltManager() {
    (function(){
      if ((window as any).BeltManager) return;

      const state = {
        activeSlot: 1
      };

      function createBeltUI() {
        const existing = document.getElementById('item-belt-container');
        if (existing) return existing;

        const container = document.createElement('div');
        container.id = 'item-belt-container';
        container.className = 'item-belt';
        document.body.appendChild(container);

        for (let i = 1; i <= 3; i++) {
          const slot = document.createElement('div');
          slot.id = `belt-slot-${i}`;
          slot.className = 'belt-slot';
          (slot as any).dataset.slot = i;
          
          const key = document.createElement('div');
          key.className = 'slot-key';
          key.textContent = i.toString();
          
          slot.appendChild(key);
          container.appendChild(slot);
        }
        
        return container;
      }
      
      function updateBelt(inventoryData: any) {
        createBeltUI();
        const slots = inventoryData?.slots || [];
        
        for (let i = 1; i <= 3; i++) {
          const slotEl = document.getElementById(`belt-slot-${i}`);
          if (!slotEl) continue;

          const img = slotEl.querySelector('img');
          if (img) img.remove();
          
          const itemId = slots[i-1];
          if (itemId) {
            const itemMeta = window.PP?.inventory?.ITEM_META?.[itemId];
            if (itemMeta) {
              const itemImg = document.createElement('img');
              itemImg.src = itemMeta.icon;
              itemImg.alt = itemMeta.name;
              itemImg.title = itemMeta.name;
              slotEl.appendChild(itemImg);
            }
          }
        }
      }
      
      function setActiveSlot(slotNumber: number) {
        if (slotNumber < 1 || slotNumber > 3) return;
        state.activeSlot = slotNumber;
        
        for (let i = 1; i <= 3; i++) {
          const slotEl = document.getElementById(`belt-slot-${i}`);
          if(slotEl) slotEl.classList.toggle('active', i === state.activeSlot);
        }

        const inventory = window.PP?.inventory?.slots;
        const itemId = inventory ? inventory[slotNumber - 1] : null;
        const itemMeta = itemId ? (window.PP?.inventory?.ITEM_META?.[itemId] || null) : null;
        
        window.dispatchEvent(new CustomEvent('pp:belt:equip', {
          detail: { item: itemMeta, slot: slotNumber }
        }));
      }

      window.BeltManager = {
        update: updateBelt,
        setActive: setActiveSlot,
        state: state
      };
      
      window.addEventListener('pp:inventory:changed', (e: any) => {
        updateBelt(e.detail);
      });
      
      window.addEventListener('pp:belt:select', (e: any) => {
        setActiveSlot(e.detail.slot + 1);
      });

      document.addEventListener("DOMContentLoaded", createBeltUI);
    })();
    console.log("[Loader] Belt Manager inlined.");
}

function initializeHudUi() {
    (function(){
        "use strict";
        if (window.HUDManager) return;

        function createHUD() {
            if (document.getElementById('hud-container')) return;

            const container = document.createElement('div');
            container.id = 'hud-container';
            Object.assign(container.style, {
                position: 'fixed',
                bottom: '80px',
                left: '10px',
                zIndex: '5000',
                color: '#0ff',
                fontFamily: "'Courier New', monospace",
                textShadow: '0 0 5px #0ff',
                fontSize: '16px',
                background: 'rgba(0, 20, 30, 0.5)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 255, 0.2)'
            });

            container.innerHTML = `
                <div id="hud-sanity">Sanity: --%</div>
                <div id="hud-xyz" style="margin-top: 4px;">XYZ: --, --, --</div>
            `;

            document.body.appendChild(container);
        }

        function updateSanity(value: number) {
            const el = document.getElementById('hud-sanity');
            if (el) {
                el.textContent = `Sanity: ${Math.round(value)}%`;
            }
        }

        function updateXYZ(vector3: any) {
            const el = document.getElementById('hud-xyz');
            if (el && vector3) {
                el.textContent = `XYZ: ${vector3.x.toFixed(2)}, ${vector3.y.toFixed(2)}, ${vector3.z.toFixed(2)}`;
            }
        }

        window.HUDManager = {
            updateSanity,
            updateXYZ
        };
        
        window.updateSanity = updateSanity;

        document.addEventListener('DOMContentLoaded', createHUD);

    })();
    console.log("[Loader] HUD UI inlined.");
}

function initializeNotebookUi() {
    (function(){
      'use strict';
      if ((window as any).PP_Notebook_Vanilla) return;
      (window as any).PP_Notebook_Vanilla = true;

      const NOTEBOOK_ID = 'notebook-modal';
      
      const state = {
        isOpen: false,
        selectedEvidence: new Set<string>(),
        activeGhostName: null as string | null,
      };

      const ICONS: {[key: string]: string} = {
        ghost: `<svg class="w-12 h-12 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>`,
        reset: `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.691v4.99" /></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
        'EMF Level 5': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>`,
        'Spirit Box': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>`,
        'Ultraviolet': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.588 8.188a15.048 15.048 0 0 1-3.478 2.555c-1.994.88-4.223.96-6.147.234a15.086 15.086 0 0 1-4.76-1.688A7.5 7.5 0 0 1 7.864 4.243Z" /></svg>`,
        'Ghost Writing': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`,
        'Freezing': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m10.5 6.75 1.5-1.5-1.5-1.5m1.5 3-1.5-1.5 1.5-1.5m-3.75 9.75 1.5-1.5-1.5-1.5m1.5 3-1.5-1.5 1.5-1.5M15 21a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 15 3H9a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 9 21h6Z" /></svg>`,
        'Ghost Orbs': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75v.008H12V9.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM12 12.75v.008H12V12.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.75 2.25v.008H12V15Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
        'DOTS Projector': `<svg class="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>`,
        checkCircle: `<svg class="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
        checkCircleSmall: `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
        xCircle: `<svg class="w-12 h-12 mx-auto text-red-500/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
        brain: `<svg class="w-16 h-16 opacity-30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>`,
        strength: `<svg class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>`,
        weakness: `<svg class="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.311a7.5 7.5 0 0 1-7.5 0c.411.02.824.037 1.25.052m6.25-.052c.426-.015.839-.032 1.25-.052M12 9a6.75 6.75 0 0 0-6.75 6.75v1.5a6.75 6.75 0 0 0 6.75 6.75h.036a6.75 6.75 0 0 0 6.75-6.75v-1.5a6.75 6.75 0 0 0-6.75-6.75H12Z" /></svg>`,
      };

      const GHOST_DATA = Object.values(window.PP?.GHOST_DATA || {}).map((g: any) => ({
          name: g.name,
          evidence: g.evidence,
          description: g.notes || "No detailed description available.",
          strength: g.notes || "No specific strength listed.",
          weakness: g.notes || "No specific weakness listed.",
      }));
      const ALL_EVIDENCE = window.PP?.ALL_EVIDENCE || [];
      
      const elements: {[key: string]: HTMLElement} = {};

      function init() {
        const modal = document.getElementById(NOTEBOOK_ID);
        if (!modal) {
            console.warn("[NotebookUI] Modal element not found:", NOTEBOOK_ID);
            return;
        }
        buildInitialDOM(modal);
        cacheDOMElements();
        attachEventListeners();
        console.log('[NotebookUI] Vanilla journal initialized.');
      }

      function buildInitialDOM(modal: HTMLElement) {
        modal.innerHTML = `
          <div style="min-height: 100vh; background-color: #1a202c; color: #a0deff; padding: 1rem; background-image: radial-gradient(rgba(0, 100, 120, 0.1) 1px, transparent 1px); background-size: 15px 15px;">
            <div style="max-width: 1280px; margin: auto; position: relative;">
              <button id="notebook-close-btn" style="position: absolute; top: 1rem; right: 1rem; z-index: 20; padding: 0.5rem; border-radius: 9999px; background: rgba(0,0,0,0.3); color: #63b3ed;" title="Close Journal (N)" aria-label="Close Journal">
                ${ICONS.close}
              </button>
              
              <header style="display: flex; align-items: center; gap: 1rem; padding-bottom: 1rem; border-bottom: 2px solid rgba(0, 128, 128, 0.5);">
                ${ICONS.ghost}
                <div>
                  <h1 style="font-size: 1.875rem; font-weight: bold; color: #e0ffff; letter-spacing: 0.1em;">PhasmaPhoney</h1>
                  <p style="color: #63b3ed; font-size: 0.875rem;">Digital Ghost-Hunting Journal</p>
                </div>
              </header>

              <main style="margin-top: 1.5rem; display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(0, 128, 128, 0.5); border-radius: 0.5rem; padding: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2 style="font-size: 1.25rem; font-weight: bold; color: #e0ffff; letter-spacing: 0.05em;">EVIDENCE LOG</h2>
                    <button id="evidence-reset-btn" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; background: rgba(0, 128, 128, 0.5); border: 1px solid #00a0a0; border-radius: 0.375rem; cursor: pointer;">
                      ${ICONS.reset} Reset
                    </button>
                  </div>
                  <div id="evidence-selector-container" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;"></div>
                </div>

                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(0, 128, 128, 0.5); border-radius: 0.5rem; padding: 1rem;">
                  <h2 style="font-size: 1.25rem; font-weight: bold; color: #e0ffff; letter-spacing: 0.05em; margin-bottom: 1rem;">ENTITY IDENTIFICATION</h2>
                  <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
                    <div>
                      <div id="ghost-list-header" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;"></div>
                      <ul id="ghost-list-container" style="space-y: 0.5rem; overflow-y: auto; padding-right: 0.5rem; max-height: calc(100vh - 300px);"></ul>
                    </div>
                    <div id="ghost-details-container" style="background: rgba(0, 10, 20, 0.5); border-radius: 0.5rem; padding: 1rem; border: 1px solid rgba(0, 128, 128, 0.4); display: flex; flex-direction: column;"></div>
                  </div>
                </div>
              </main>
            </div>
          </div>`;
          // Basic responsive styles
          if (window.innerWidth >= 1024) {
            (document.querySelector('main') as HTMLElement).style.gridTemplateColumns = 'repeat(3, 1fr)';
            const mainChildren = (document.querySelector('main') as HTMLElement).children;
            (mainChildren[0] as HTMLElement).style.gridColumn = 'span 1';
            (mainChildren[1] as HTMLElement).style.gridColumn = 'span 2';
            ((mainChildren[1] as HTMLElement).querySelector('div') as HTMLElement).style.gridTemplateColumns = 'repeat(2, 1fr)';
            (document.getElementById('evidence-selector-container') as HTMLElement).style.gridTemplateColumns = 'repeat(2, 1fr)';
          }
      }

      function cacheDOMElements() {
        const ids = ['notebook-close-btn', 'evidence-reset-btn', 'evidence-selector-container', 'ghost-list-header', 'ghost-list-container', 'ghost-details-container'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) elements[id] = el;
        });
      }

      function attachEventListeners() {
        // FIX: closeNotebook is now on the window object and typed.
        elements['notebook-close-btn']?.addEventListener('click', window.closeNotebook);
        elements['evidence-reset-btn']?.addEventListener('click', handleReset);
      }
      
      function render() {
        // FIX: Explicitly type GHOST_DATA to avoid `unknown` type on elements.
        const GHOST_DATA: any[] = Object.values(window.PP?.GHOST_DATA || {});
        if (GHOST_DATA.length === 0) return;

        const filteredGhosts = GHOST_DATA.filter(ghost => {
            for (const evidence of state.selectedEvidence) {
                if (!ghost.evidence.includes(evidence)) return false;
            }
            return true;
        });

        const possibleFutureEvidence = new Set(filteredGhosts.flatMap(ghost => ghost.evidence));
        const impossibleEvidence = new Set(ALL_EVIDENCE.filter(ev => !state.selectedEvidence.has(ev) && !possibleFutureEvidence.has(ev)));
        
        if (filteredGhosts.length === 1 && state.activeGhostName !== filteredGhosts[0].name) {
            state.activeGhostName = filteredGhosts[0].name;
        } else if (filteredGhosts.length > 1 && state.activeGhostName && !filteredGhosts.some(g => g.name === state.activeGhostName)) {
            state.activeGhostName = null;
        } else if (filteredGhosts.length === 0) {
            state.activeGhostName = null;
        }
        
        renderEvidenceSelector(impossibleEvidence);
        renderGhostList(filteredGhosts);
        renderGhostDetails(filteredGhosts);
      }

      function renderEvidenceSelector(impossibleEvidence: Set<string>) {
        if (!elements['evidence-selector-container']) return;
        elements['evidence-selector-container'].innerHTML = ALL_EVIDENCE.map(evidence => {
          const isSelected = state.selectedEvidence.has(evidence);
          const isImpossible = impossibleEvidence.has(evidence);
          let buttonClasses = "padding: 0.75rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; text-align: center; border-radius: 0.5rem; border-width: 1px; transition: all 0.2s; cursor: pointer; ";
          if (isSelected) {
            buttonClasses += "background-color: rgba(0, 255, 255, 0.2); border-color: #00ffff; color: #e0ffff;";
          } else if (isImpossible) {
            buttonClasses += "background-color: rgba(55, 65, 81, 0.5); border-color: #4a5568; color: #a0aec0; opacity: 0.6; cursor: not-allowed; text-decoration: line-through;";
          } else {
            buttonClasses += "background-color: rgba(31, 41, 55, 0.3); border-color: rgba(0, 128, 128, 0.7); color: #63b3ed;";
          }
          return `<button data-evidence="${evidence}" ${isImpossible ? 'disabled' : ''} style="${buttonClasses}">
              ${ICONS[evidence] || '?'}
              <span style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em;">${evidence}</span>
            </button>`;
        }).join('');

        elements['evidence-selector-container'].querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => handleEvidenceToggle(btn.dataset.evidence!));
        });
      }

      function renderGhostList(filteredGhosts: any[]) {
        if (!elements['ghost-list-header'] || !elements['ghost-list-container']) return;
        elements['ghost-list-header'].innerHTML = `
            <p style="font-size: 0.875rem; color: #63b3ed;">${filteredGhosts.length} possible entities found</p>
            ${state.selectedEvidence.size > 0 && filteredGhosts.length > 1 ? `<p style="font-size: 0.875rem; color: #f6e05e;">Evidence missing: ${3 - state.selectedEvidence.size}</p>` : ''}
        `;

        if (filteredGhosts.length > 0) {
          elements['ghost-list-container'].innerHTML = filteredGhosts.map(ghost => {
            const isActive = state.activeGhostName === ghost.name;
            return `<li data-ghost-name="${ghost.name}" style="padding: 0.75rem 1rem; border-radius: 0.375rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${isActive ? 'background-color: rgba(0, 200, 200, 0.3); border: 1px solid #00c0c0;' : 'background-color: rgba(31, 41, 55, 0.4); border: 1px solid transparent;'}">
                <span style="font-weight: 600; letter-spacing: 0.05em;">${ghost.name.split(' (')[0]}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${ghost.evidence.map((ev: string) => state.selectedEvidence.has(ev) ? ICONS.checkCircle : `<div style="width: 0.5rem; height: 0.5rem; border-radius: 9999px; background-color: #008080;"></div>`).join('')}
                </div>
              </li>`;
          }).join('');
          elements['ghost-list-container'].querySelectorAll('li').forEach(item => {
            item.addEventListener('click', () => handleGhostSelect(item.dataset.ghostName!));
          });
        } else {
          elements['ghost-list-container'].innerHTML = `<div style="text-align: center; padding: 2.5rem 1rem; background-color: rgba(31, 41, 55, 0.4); border-radius: 0.5rem;">
              ${ICONS.xCircle}
              <p style="margin-top: 1rem; font-size: 1.125rem; color: #f56565;">No Matching Ghost</p>
              <p style="font-size: 0.875rem; color: #63b3ed;">The selected evidence does not match any known entity.</p>
            </div>`;
        }
      }

      function renderGhostDetails(filteredGhosts: any[]) {
          if (!elements['ghost-details-container']) return;
          const activeGhost = GHOST_DATA.find(g => g.name === state.activeGhostName);
          if (activeGhost) {
              elements['ghost-details-container'].innerHTML = `
                <h3 style="font-size: 1.5rem; font-weight: bold; color: #e0ffff; margin-bottom: 0.5rem;">${activeGhost.name.split(' (')[0]}</h3>
                <p style="color: #63b3ed; font-size: 0.875rem; margin-bottom: 1rem; font-style: italic;">${activeGhost.description}</p>
                <div style="margin-bottom: 1rem;">
                  <h4 style="font-weight: 600; color: #b0e0e6; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(0, 128, 128, 0.5); padding-bottom: 0.25rem;">Required Evidence:</h4>
                  <ul style="font-size: 0.875rem; list-style: none; padding: 0;">
                    ${activeGhost.evidence.map((ev:string) => `
                      <li style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; ${state.selectedEvidence.has(ev) ? 'color: #68d391;' : 'color: #63b3ed;'}">
                        ${state.selectedEvidence.has(ev) ? ICONS.checkCircleSmall : '<div style="width: 0.375rem; height: 0.375rem; border-radius: 9999px; background-color: #008080;"></div>'}
                        ${ev}
                      </li>`).join('')}
                  </ul>
                </div>
                <div style="font-size: 0.875rem;">
                  <div style="display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem;">
                    ${ICONS.strength}
                    <div>
                      <h4 style="font-weight: 600; color: #f56565;">Strength</h4>
                      <p style="color: #63b3ed;">${activeGhost.strength}</p>
                    </div>
                  </div>
                  <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                    ${ICONS.weakness}
                    <div>
                      <h4 style="font-weight: 600; color: #f6e05e;">Weakness</h4>
                      <p style="color: #63b3ed;">${activeGhost.weakness}</p>
                    </div>
                  </div>
                </div>
              `;
          } else {
              elements['ghost-details-container'].innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; height: 100%; color: #4a5568;">
                  ${ICONS.brain}
                  <p style="margin-top: 1rem; font-weight: 600;">Select a ghost to view details</p>
                  <p style="font-size: 0.875rem; opacity: 0.7;">${filteredGhosts.length === 0 ? "No entity matches current evidence." : "Or narrow down the list to one."}</p>
                </div>
              `;
          }
      }

      function handleEvidenceToggle(evidence: string) {
        if (state.selectedEvidence.has(evidence)) {
          state.selectedEvidence.delete(evidence);
        } else if (state.selectedEvidence.size < 3) {
          state.selectedEvidence.add(evidence);
        }
        render();
      }

      function handleReset() {
        state.selectedEvidence.clear();
        state.activeGhostName = null;
        render();
      }
      
      function handleGhostSelect(ghostName: string) {
          state.activeGhostName = ghostName;
          render();
      }

      function setOpen(shouldBeOpen: boolean) {
        const modal = document.getElementById(NOTEBOOK_ID);
        if (!modal || state.isOpen === shouldBeOpen) return;
        
        state.isOpen = shouldBeOpen;
        modal.style.display = state.isOpen ? 'block' : 'none';
        
        if (state.isOpen) {
          window.PP?.pointerLock?.hold('notebook');
          render();
        } else {
          window.PP?.pointerLock?.release('notebook');
        }
        window.dispatchEvent(new CustomEvent(state.isOpen ? 'pp:notebook:open' : 'pp:notebook:close'));
      }

      window.openNotebook = function() { setOpen(!state.isOpen); };
      window.closeNotebook = function() { setOpen(false); };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
    console.log("[Loader] Notebook UI inlined.");
}

function initializeReticle() {
    (function () {
      "use strict";

      let RETICLE_OPTS = Object.assign({
        visible: true,
        style: "cross",
        size: 18,
        thickness: 2,
        gap: 4,
        color: "rgba(0, 255, 255, 0.8)",
        hitColor: "rgba(0, 255, 0, 1)",
        opacity: 1,
        maxAimDistance: 3.0
      }, ((window as any).RETICLE_OPTS || {}));

      let WRAP: HTMLElement, SVG: SVGElement;

      function injectCSS() {
        if (document.getElementById("reticle-style")) return;
        const css = `
          #reticle{
            position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
            z-index:6500; pointer-events:none; opacity:${RETICLE_OPTS.opacity};
            transition: transform 120ms ease, opacity 120ms ease;
          }
          #reticle svg { display:block; filter: drop-shadow(0 0 2px rgba(0,0,0,0.7)); }
        `;
        const s = document.createElement("style");
        s.id = "reticle-style";
        s.textContent = css;
        document.head.appendChild(s);
      }

      function makeCrossSVG({ size, thickness, gap, color }: any) {
        const s = size, g = gap, half = s / 2, len = half - g;
        return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
          <line x1="${half}" y1="${half - g - len}" x2="${half}" y2="${half - g}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
          <line x1="${half}" y1="${half + g}"       x2="${half}" y2="${half + g + len}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
          <line x1="${half - g - len}" y1="${half}" x2="${half - g}" y2="${half}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
          <line x1="${half + g}"       y1="${half}" x2="${half + g + len}" y2="${half}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" />
        </svg>`;
      }

      function makeDotSVG({ size, thickness, color, withCircle }: any) {
        const s = size, cx = s / 2, cy = s/2;
        let content = `<circle cx="${cx}" cy="${cy}" r="${Math.max(1, thickness)}" fill="${color}" />`;
        if (withCircle) {
          content = `<circle cx="${cx}" cy="${cy}" r="${(s / 2) - thickness}" fill="none" stroke="${color}" stroke-width="${thickness}" />` + content;
        }
        return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${content}</svg>`;
      }

      function buildSVG(opts: any) {
        if (opts.style === "dot")        return makeDotSVG(opts);
        if (opts.style === "circle-dot") return makeDotSVG(Object.assign({}, opts, { withCircle: true }));
        return makeCrossSVG(opts);
      }

      function mount() {
        injectCSS();
        WRAP = document.getElementById("reticle")!;
        if (!WRAP) {
          WRAP = document.createElement("div");
          WRAP.id = "reticle";
          document.body.appendChild(WRAP);
        }
        WRAP.innerHTML = buildSVG(RETICLE_OPTS);
        SVG = WRAP.firstElementChild as SVGElement;
        setReticleVisible(!!RETICLE_OPTS.visible);
      }

      function setReticleVisible(v: boolean) {
        if (WRAP) WRAP.style.display = v ? "block" : "none";
      }
      function setReticleColor(c: string) {
        if(!SVG) return;
        SVG.querySelectorAll("line,circle").forEach(el => {
          if (el.getAttribute("fill") !== "none") el.setAttribute("fill", c);
          else el.setAttribute("stroke", c);
        });
      }
      function reticleFlash(ms = 140, color = RETICLE_OPTS.hitColor) {
        if (!WRAP) return;
        const prevColor = RETICLE_OPTS.color;
        setReticleColor(color);
        WRAP.style.transform = "translate(-50%,-50%) scale(1.25)";
        setTimeout(() => {
          setReticleColor(prevColor);
          WRAP.style.transform = "translate(-50%,-50%) scale(1)";
        }, ms);
      }
      function reticleSetStyle(newOpts: any) {
        RETICLE_OPTS = Object.assign(RETICLE_OPTS, newOpts || {});
        mount();
      }

      window.setReticleVisible = setReticleVisible;
      window.setReticleColor   = setReticleColor;
      window.reticleFlash      = reticleFlash;
      window.reticleSetStyle   = reticleSetStyle;

      function startAimCheck() {
        const scene = window.scene || window.BABYLON.Engine?.LastCreatedScene;
        if (!scene) { setTimeout(startAimCheck, 100); return; }
        let last = 0;
        scene.onBeforeRenderObservable.add(() => {
          if(!RETICLE_OPTS.visible) return;
          const now = performance.now();
          if (now - last < 80) return;
          last = now;
          try {
            // FIX: Accessing window.camera is now type-safe.
            const cam = window.camera; if (!cam) return;
            const ray = scene.createPickingRay(scene.getEngine().getRenderWidth() / 2, scene.getEngine().getRenderHeight() / 2, null, cam);
            ray.length = RETICLE_OPTS.maxAimDistance;
            const hit = scene.pickWithRay(ray, (m: any) => m && m.isPickable !== false);
            setReticleColor(hit?.hit ? RETICLE_OPTS.hitColor : RETICLE_OPTS.color);
          } catch (_) {}
        });
      }

      window.addEventListener("keydown", (e) => {
        if ((e.key === "r" || e.key === "R") && e.altKey) {
          RETICLE_OPTS.visible = !RETICLE_OPTS.visible;
          setReticleVisible(RETICLE_OPTS.visible);
        }
      });

      document.addEventListener("DOMContentLoaded", () => { mount(); startAimCheck(); });
    })();
    console.log("[Loader] Reticle UI inlined.");
}

function initializeVanUi() {
    (function(){
      'use strict';
      if (window.PP?.vanUI) return;

      const log = (...a: any[]) => console.log("[VanUI]", ...a);

      const state = {
        isVisible: false,
      };

      function createUI() {
        let modal = document.getElementById('van-ui-modal') as HTMLElement;
        if (modal) { // If it exists from HTML, just ensure it's styled correctly
            modal.style.display = 'none';
            return modal;
        }

        modal = document.createElement('div');
        modal.id = 'van-ui-modal';
        modal.className = 'ui-overlay ui-modal';
        modal.style.cssText = `
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 9998;
          color: #0ff;
          font-family: 'Courier New', monospace;
          position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8);
        `;

        const mapOptions = (window.PP?.mapManifest || [])
          .map((map: any) => `<option value="${map.id}">${map.title}</option>`)
          .join('');

        modal.innerHTML = `
          <div style="width: 90%; max-width: 500px; background: rgba(10, 20, 30, 0.9); border: 1px solid #088; border-radius: 12px; padding: 24px; text-align: center;">
            <h1 style="font-size: 2em; text-shadow: 0 0 8px #0ff; margin-bottom: 24px;">MISSION SETUP</h1>
            
            <div style="margin-bottom: 24px;">
              <label for="map-selector" style="display: block; margin-bottom: 8px; font-size: 1.1em; color: #0aa;">Select Investigation Site:</label>
              <select id="map-selector" style="width: 100%; padding: 10px; background: #000; color: #0ff; border: 1px solid #088; border-radius: 5px; font-size: 1em;">
                ${mapOptions}
              </select>
            </div>

            <button id="start-investigation-btn" style="padding: 12px 24px; font-size: 1.2em; background: #088; color: #fff; border: 2px solid #0ff; border-radius: 8px; cursor: pointer; transition: background-color 0.2s;">
              START INVESTIGATION
            </button>
          </div>
        `;

        document.body.appendChild(modal);

        const startBtn = document.getElementById('start-investigation-btn');
        if (startBtn) {
          startBtn.addEventListener('click', handleStart);
        }

        log("UI created.");
        return modal;
      }

      function handleStart() {
        const mapSelector = document.getElementById('map-selector') as HTMLSelectElement;
        if (!mapSelector) {
          console.error("[VanUI] Map selector not found!");
          return;
        }
        const selectedMapId = mapSelector.value;
        log(`Starting investigation for map: ${selectedMapId}`);

        window.dispatchEvent(new CustomEvent('pp:start-investigation', { 
          detail: { mapId: selectedMapId }
        }));
        
        hide();
      }

      function show() {
        const modal = createUI();
        modal.style.display = 'flex';
        state.isVisible = true;
        log("UI shown.");
      }

      function hide() {
        const modal = document.getElementById('van-ui-modal');
        if (modal) {
          modal.style.display = 'none';
        }
        state.isVisible = false;
        log("UI hidden.");
      }

      // FIX: Initialize window.PP with required properties to satisfy the global type.
      // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
      window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
      window.PP.vanUI = {
        show,
        hide,
      };

      log("Van UI initialized.");

    })();
    console.log("[Loader] Van UI inlined.");
}

function initializeEffectsSanityMed() {
    (function(){
      "use strict";

      function clamp(n: number,a: number,b: number){ return Math.max(a, Math.min(b,n)); }

      function applyEffects(){
        window.dispatchEvent(new CustomEvent('pp:player:stamina-boost', { detail:{ seconds:10 }}));
        window.toast?.("Stamina boost applied!", 1200);

        const total = 40, dur = 30, tick = 0.5;
        const perTick = total / (dur / tick);
        let elapsed = 0;

        const id = setInterval(()=>{
          elapsed += tick;
          try {
            if (typeof window.PP?.state?.sanity === 'number'){
                window.PP.state.sanity = clamp(window.PP.state.sanity + perTick, 0, 100);
                
                if (typeof window.updateSanity === "function") {
                    window.updateSanity(Math.round(window.PP.state.sanity));
                }
            }
          } catch {}
          if (elapsed >= dur) {
            clearInterval(id);
            window.toast?.("Sanity restored.", 1500);
          }
        }, tick*1000);
      }

      window.addEventListener('pp:effect:sanity-med', applyEffects);
    })();
    console.log("[Loader] Sanity Effects inlined.");
}

function initializeGhostCam() {
    (function(){
      "use strict";
      if ((window as any).GHOST_CAM && (window as any).GHOST_CAM.__v === "1.2") return;

      const SCENE  = ()=> window.scene || window.BABYLON.Engine?.LastCreatedScene;
      const MAIN   = ()=> window.camera || SCENE()?.activeCamera;
      const v3     = (x: number,y: number,z: number)=> new window.BABYLON.Vector3(x,y,z);
      const toast  = (m: string,ms=900)=> (window.toast? window.toast(m,ms) : console.log("[ghost-cam]", m));

      const ST = {
        s: null as any,
        cam: null as any,
        enabled: false,
        mode: "pov",
        vp: { x:0.77, y:0.70, w:0.22, h:0.28 },
        obs: null as any,
        keepAliveObs: null as any
      };

      function ghostRoot(){
        if ((window as any).PREFERRED_GHOST_ROOT && !(window as any).PREFERRED_GHOST_ROOT.isDisposed?.()) return (window as any).PREFERRED_GHOST_ROOT;
        return SCENE()?.getTransformNodeByName("GhostRoot");
      }

      function ensureCamera(){
        const s = ST.s = SCENE(); if (!s) return null;
        if (ST.cam && !ST.cam.isDisposed()) return ST.cam;

        const main = MAIN();
        const cam = new window.BABYLON.FreeCamera("GhostPIP", v3(0,1.6,0), s, true);
        cam.minZ = 0.05;
        cam.maxZ = 2000;
        cam.fov  = 0.9;
        cam.layerMask = main?.layerMask ?? 0x0FFFFFFF;
        cam.viewport = new window.BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);
        cam.attachControl?.(false);
        cam.inputs?.clear?.();
        cam.getViewMatrix();

        ST.cam = cam;
        return cam;
      }

      function enable(){
        const s = SCENE(); const main = MAIN();
        if (!s || !main) return;

        const cam = ensureCamera();
        if (!cam) return;

        const list = (s.activeCameras && s.activeCameras.length)
          ? s.activeCameras.slice()
          : [main];

        const uniq: any[] = [];
        list.forEach(c=> { if (c && !uniq.includes(c)) uniq.push(c); });
        if (!uniq.includes(cam)) uniq.push(cam);

        s.activeCameras = uniq;

        cam.viewport = new window.BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);

        if (!ST.obs){
          ST.obs = s.onBeforeRenderObservable.add(update);
        }
        if (!ST.keepAliveObs){
          ST.keepAliveObs = s.onAfterRenderObservable.add(()=>{
            if (!s.activeCameras || s.activeCameras.length === 0){
              const m = MAIN(); if (m) s.activeCameras = [m];
            }
            if (s.activeCameras && !s.activeCameras.includes(ST.cam)){
              const arr = s.activeCameras.slice(); arr.push(ST.cam); s.activeCameras = arr;
            }
          });
        }

        ST.enabled = true;
        toast("Ghost Cam: ON");
      }

      function disable(){
        const s = SCENE(); if (!s) return;
        if (ST.obs){ s.onBeforeRenderObservable.remove(ST.obs); ST.obs = null; }
        if (ST.keepAliveObs){ s.onAfterRenderObservable.remove(ST.keepAliveObs); ST.keepAliveObs = null; }
        if (s.activeCameras && ST.cam){
          s.activeCameras = s.activeCameras.filter(c=> c && c !== ST.cam);
        }
        ST.enabled = false;
        toast("Ghost Cam: OFF");
      }

      function toggle(){ ST.enabled ? disable() : enable(); }

      function setMode(m: string){
        ST.mode = (m === "over") ? "over" : "pov";
        toast("Ghost Cam mode: " + ST.mode.toUpperCase());
      }

      function cycleMode(){
        setMode(ST.mode === "pov" ? "over" : "pov");
      }

      function update(){
        const s = ST.s || SCENE(); if (!s) return;
        const cam = ST.cam || ensureCamera(); if (!cam) return;
        const root = ghostRoot(); if (!root) return;

        if (ST.mode === "pov"){
          const up = root.up || window.BABYLON.Axis.Y;
          const headOffset = v3(0, 1.6, 0);
          const ry = root.rotationQuaternion ? window.BABYLON.Quaternion.FromRotationMatrix(root.getWorldMatrix()).toEulerAngles().y
                                             : (root.rotation?.y || 0);
          const fwd = v3(Math.sin(ry), 0, Math.cos(ry));
          const pos = root.getAbsolutePosition().add(headOffset).add(fwd.scale(0.05));
          cam.position.copyFrom(pos);
          const target = pos.add(fwd);
          cam.setTarget(target, true);
          cam.upVector.copyFrom(up);
        } else {
          const ry = root.rotationQuaternion ? window.BABYLON.Quaternion.FromRotationMatrix(root.getWorldMatrix()).toEulerAngles().y
                                             : (root.rotation?.y || 0);
          const back = v3(-Math.sin(ry), 0, -Math.cos(ry));
          const pos = root.getAbsolutePosition()
            .add(back.scale(1.2))
            .add(v3(0, 1.8, 0));
          cam.position.copyFrom(pos);
          const look = root.getAbsolutePosition().add(v3(0, 1.4, 0));
          cam.setTarget(look, true);
        }

        const main = MAIN();
        cam.layerMask = main?.layerMask ?? cam.layerMask;
        cam.viewport = new window.BABYLON.Viewport(ST.vp.x, ST.vp.y, ST.vp.w, ST.vp.h);
      }

      window.addEventListener("keydown", (e)=>{
        if (e.altKey && (e.code === "KeyC" || e.key === "c" || e.key === "C")){
          if (e.shiftKey) cycleMode();
          else toggle();
        }
      });

      (window as any).GHOST_CAM = {
        __v: "1.2",
        enable, disable, toggle, setMode, cycleMode,
        setViewport(x: number, y: number, w: number, h: number){
          ST.vp = { x, y, w, h };
          if (ST.cam) ST.cam.viewport = new window.BABYLON.Viewport(x, y, w, h);
        }
      };

      const boot = setInterval(()=>{
        try{
          if (SCENE() && MAIN()){
            clearInterval(boot);
            ensureCamera();
          }
        }catch{}
      }, 150);
    })();
    console.log("[Loader] Ghost Cam inlined.");
}

function initializeMinimap() {
    (function(){
      if ((window as any).__PP_MINIMAP_V3__) return; (window as any).__PP_MINIMAP_V3__ = true;

      const UI = {
        btn: null as HTMLElement | null,
        wrap: null as HTMLElement | null,
        canvas: null as HTMLCanvasElement | null,
        open: false
      };

      function S(){ return window.scene || (window as any).__SCENE || window.BABYLON.EngineStore?.LastCreatedScene || null; }
      function cfg() { return window.PP?.controls?.keys; }

      function ensureUI(){
        if (UI.wrap) return;
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
          position:'fixed', left:'10px', top:'10px', zIndex:'8000',
          display:'flex', flexDirection:'column', gap:'6px'
        });

        const btn = document.createElement('button');
        btn.textContent = 'Map [M]';
        Object.assign(btn.style, {
          border:'1px solid transparent', borderRadius:'8px',
          padding:'6px 10px', background:'#0b1518', color:'#9ef',
          cursor:'pointer'
        });
        btn.addEventListener('click', toggle);

        const cv = document.createElement('canvas');
        cv.width = 220; cv.height = 220;
        Object.assign(cv.style, {
          display:'none',
          width:'220px', height:'220px',
          border:'none',
          borderRadius:'50%',
          background:'rgba(0,0,0,0.45)',
          boxShadow:'0 0 0 1px rgba(0,255,255,0.15) inset, 0 2px 12px rgba(0,0,0,0.5)'
        });

        wrap.appendChild(btn);
        wrap.appendChild(cv);
        document.body.appendChild(wrap);

        UI.btn = btn; UI.wrap = wrap; UI.canvas = cv;
      }

      function toggle(){
        UI.open = !UI.open;
        if (UI.canvas) UI.canvas.style.display = UI.open ? 'block' : 'none';
      }

      function playerPos(){
        const rigRoot = window.PlayerRig?.getRigRoot();
        if (rigRoot) {
          return rigRoot.getAbsolutePosition?.() || rigRoot.position;
        }
        return S()?.activeCamera?.position || null;
      }

      function loopXYZ(){
        const el = document.getElementById('hud-xyz');
        if (!el) { requestAnimationFrame(loopXYZ); return; }
        function tick(){
          const p = playerPos();
          if (p) el.textContent = `XYZ: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
          requestAnimationFrame(tick);
        }
        tick();
      }

      function loopMap(){
        const s = S();
        const ctx = UI.canvas?.getContext('2d');
        if (!s || !ctx){ requestAnimationFrame(loopMap); return; }

        function tick(){
          if (UI.open && UI.canvas){
            const w = UI.canvas.width, h = UI.canvas.height;
            ctx.clearRect(0,0,w,h);

            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            for (let i=10;i<w;i+=20){ ctx.moveTo(i,0); ctx.lineTo(i,h); }
            for (let j=10;j<h;j+=20){ ctx.moveTo(0,j); ctx.lineTo(w,j); }
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,255,0.12)'; ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(w/2, h/2, 4, 0, Math.PI*2);
            ctx.fillStyle = '#0ff'; ctx.fill();

            // FIX: Accessing window.camera is now type-safe.
            const cam = s.activeCamera || window.camera;
            if (cam && cam.getDirection){
                const yaw = window.PlayerRig?.getState()?.yaw || 0;
                const headingX = Math.sin(yaw);
                const headingZ = Math.cos(yaw);

                const len = 18;
                ctx.beginPath();
                ctx.moveTo(w/2, h/2);
                ctx.lineTo(w/2 + headingX * len, h/2 - headingZ * len);
                ctx.lineWidth = 2; ctx.strokeStyle = '#8ff'; ctx.stroke();
            }

            ctx.font = '12px monospace';
            ctx.fillStyle = '#9ef';
            ctx.fillText('N', w/2 - 4, 14);
          }
          requestAnimationFrame(tick);
        }
        tick();
      }
      
      function bindKeys() {
          window.addEventListener('keydown', (e) => {
              const keyMap = cfg()?.minimap;
              if (keyMap?.includes(e.code)) {
                  toggle();
              }
          });
      }

      function start(){
        ensureUI();
        loopXYZ();
        loopMap();
        bindKeys();
      }

      window.addEventListener('pp:start', start, { once:true });
      if ((window as any).__PP_ALREADY_STARTED__) start();
    })();
    console.log("[Loader] Minimap inlined.");
}

function initializeMoon() {
    (function(){
      'use strict';
      if ((window as any).__MoonReady) return; (window as any).__MoonReady = true;

      const SCENE = ()=> window.scene || window.BABYLON.Engine?.LastCreatedScene;

      function createMoon(){
        const s=SCENE(); if (!s) { setTimeout(createMoon, 120); return; }
        const MOON_DIAM = 18;
        const MOON_POS  = new window.BABYLON.Vector3(0, 120, 160);

        const disc = window.BABYLON.MeshBuilder.CreateDisc('MoonMesh',{radius:MOON_DIAM*0.5, tessellation:64}, s);
        disc.billboardMode = window.BABYLON.Mesh.BILLBOARDMODE_ALL;
        disc.isPickable = false; (disc as any).applyFog = false; disc.renderingGroupId = 0;

        const mat = new window.BABYLON.StandardMaterial('moonMat', s);
        mat.diffuseTexture = new window.BABYLON.Texture(`${BASE_URL}assets/textures/moon.jpg`, s, true, false);
        mat.emissiveTexture = mat.diffuseTexture;
        mat.emissiveColor = new window.BABYLON.Color3(1,1,1);
        mat.specularColor = new window.BABYLON.Color3(0,0,0);
        mat.backFaceCulling = false;
        mat.disableLighting = true;
        disc.material = mat;
        disc.position.copyFrom(MOON_POS);
      }
      
      window.addEventListener('pp:start', createMoon, { once: true });
    })();
    console.log("[Loader] Moon inlined.");
}

function initializeGameplayPatch() {
    (function(){
        // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Gameplay Patch inlined.");
}

function initializePs5Controller() {
    (function(){
        if (window.PP?.ps5) return;

        const log = (...a: any[]) => console.log("[PS5_Enhancements]", ...a);
        const state = {
            gamepad: null as Gamepad | null,
            gamepadIndex: -1,
        };

        function findDualSense() {
            try {
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (let i = 0; i < gamepads.length; i++) {
                    const gp = gamepads[i];
                    if (gp && gp.id.toLowerCase().includes('dualsense')) {
                        if (state.gamepadIndex !== i) {
                            log(`DualSense controller found at index ${i}.`);
                            state.gamepad = gp;
                            state.gamepadIndex = i;
                        }
                        return;
                    }
                }
            } catch(e) {
                console.warn("[PS5_Enhancements] Error while polling for gamepads.", e);
            }
            
            if (state.gamepad) {
                log("DualSense controller disconnected.");
                state.gamepad = null;
                state.gamepadIndex = -1;
            }
        }
        
        function pulse(strong = 0.8, weak = 0.4, duration = 150) {
            if (!state.gamepad || !(state.gamepad as any).vibrationActuator) return;

            (state.gamepad as any).vibrationActuator.playEffect("dual-rumble", {
                startDelay: 0,
                duration: duration,
                weakMagnitude: weak,
                strongMagnitude: strong,
            }).catch((e: any) => {});
        }

        let heartbeatInterval: any = null;
        function startHeartbeat() {
            if (heartbeatInterval) return;
            stopHeartbeat();
            heartbeatInterval = setInterval(() => {
                pulse(0.9, 0, 80);
                setTimeout(() => pulse(0.5, 0, 60), 120);
            }, 800);
            log("Heartbeat effect started.");
        }
        
        function stopHeartbeat() {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
                log("Heartbeat effect stopped.");
            }
        }

        function attachEventListeners() {
            window.addEventListener('pp:ghost:interact', () => pulse(1.0, 1.0, 300));
            window.addEventListener('pp:ghost:hunt_start', () => pulse(0.8, 0.8, 1000));
            window.addEventListener('pp:sanity:changed', (e: any) => {
                const sanity = e.detail?.sanity;
                if (typeof sanity === 'number') {
                    if (sanity < 30) {
                        startHeartbeat();
                    } else {
                        stopHeartbeat();
                    }
                }
            });
            window.addEventListener('pp:player:hit', () => pulse(1.0, 0.2, 200));
        }

        function init() {
            window.addEventListener("gamepadconnected", findDualSense, { passive: true });
            window.addEventListener("gamepaddisconnected", findDualSense, { passive: true });
            findDualSense();
            attachEventListeners();
            log("Initialized.");
        }
        
        const api = {
            pulse,
        };

        // FIX: Initialize window.PP with required properties to satisfy the global type.
        // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
        window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
        window.PP.ps5 = api;

        window.addEventListener('pp:start', init, { once: true });
    })();
    console.log("[Loader] PS5 Controller inlined.");
}

function initializeDevtools() {
    (function(){
      "use strict";
      // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Devtools inlined.");
}

function initializeGhostDev() {
    (function(){
      "use strict";
      // This script is intentionally left blank as its logic has been moved.
    })();
    console.log("[Loader] Ghost Dev inlined.");
}

function initializeLogger() {
    (function(){
        if(window.SimLog) return;

        window.SimLog = {
            events: [] as any[],
            enabled: true,
            record: function(type: string, data: any){ 
                if(!this.enabled) return;
                this.events.push({ time: performance.now(), type, data }); 
            },
            exportJSON: function(){ return JSON.stringify(this.events,null,2); },
            saveToFile: function(filename="sim_log.json"){
                try{
                    const blob = new Blob([this.exportJSON()], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    console.log("[SimLog] Saved", this.events.length, "events");
                }catch(e){ console.warn("[SimLog] Save failed", e); }
            }
        };

        const recordPlayer = ()=> {
            const rigRoot = window.PlayerRig?.getRigRoot();
            if(rigRoot) window.SimLog?.record("playerTick", { pos: {x: rigRoot.position.x, y: rigRoot.position.y, z: rigRoot.position.z} });
        };
        const recordCamera = ()=> {
            // FIX: Accessing window.camera is now type-safe.
            const cam = window.camera;
            if(cam) window.SimLog?.record("cameraTick", { pos: {x: cam.globalPosition.x, y: cam.globalPosition.y, z: cam.globalPosition.z}, rot: {x: cam.rotation.x, y: cam.rotation.y, z: cam.rotation.z} });
        };
        
        function startLogging() {
            const scene = window.scene;
            if (scene) {
                scene.onBeforeRenderObservable.add(()=>{
                    recordPlayer();
                    recordCamera();
                });
                console.log("[SimLog] Player and camera tick logging attached.");
            } else {
                console.warn("[SimLog] Scene not ready for logging hooks.");
            }
        }
        
        window.addEventListener("pp:ghost:attack", (e: any) => {
            window.SimLog?.record("ghostAttack", { ghost: e.detail?.ghostType, target: e.detail?.target });
        });

        window.addEventListener("keydown",(e)=>{
            if(e.altKey && e.code==="KeyS"){
                e.preventDefault();
                window.SimLog?.saveToFile();
            }
        });
        
        window.addEventListener("pp:start", startLogging, { once: true });

        console.log("[SimLog] Initialized — Alt+S to save log");
    })();
    console.log("[Loader] Logger inlined.");
}

function initializeBootstrap() {
    (function(){
    "use strict";

    const log = (...a: any[]) => console.log("[Bootstrap]", ...a);
    const warn = (...a: any[]) => console.warn("[Bootstrap]", ...a);

    let engine: any, scene: any, camera: any;

    const state = {
        isStarted: false,
        selectedGhost: null,
        foundEvidence: new Set(),
    };
    // FIX: Initialize window.PP with required properties to satisfy the global type.
    // FIX: Add `spawnWS: null` to the cfg object to satisfy the inferred global type for PP.
    window.PP = (window.PP || { GHOST_DATA: null, ALL_EVIDENCE: [], cfg: { spawnWS: null }, state: {}, storage: {} }) as Window['PP'];
    window.PP.state = Object.assign(window.PP.state || {}, state);
    window.PP.gameHasRenderedFirstFrame = false;

    function showLoading(show: boolean, percent?: number, text?: string, subText?: string) {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');
        const loadingSubText = document.getElementById('loading-sub-text');

        if (!loadingOverlay || !loadingBar || !loadingText || !loadingSubText) return;

        if (show) {
            loadingOverlay.style.display = 'flex';
            setTimeout(()=> loadingOverlay.style.opacity = '1', 10);
            if (percent !== undefined) {
                 (loadingBar as HTMLElement).style.width = `${percent}%`;
            }
            if (text) {
                 loadingText.textContent = text;
            }
            if (subText !== undefined) {
                loadingSubText.textContent = subText;
            }
        } else {
            loadingOverlay.style.opacity = '0';
            setTimeout(()=> loadingOverlay.style.display = 'none', 500);
        }
    }
    window.showLoading = showLoading;

    async function setupEngine() {
        log("1. Setting up engine and scene...");
        
        const canvas = document.getElementById('renderCanvas');
        if (!canvas) {
            throw new Error("renderCanvas element not found in the DOM!");
        }
        
        engine = new window.BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        scene = new window.BABYLON.Scene(engine);
        scene.collisionsEnabled = true;
        scene.gravity = new window.BABYLON.Vector3(0, -9.81, 0);

        camera = new window.BABYLON.FreeCamera("mainCam", new window.BABYLON.Vector3(0, 1.8, -5), scene);
        camera.attachControl(canvas, false);
        scene.activeCamera = camera;

        const hemi = new window.BABYLON.HemisphericLight("hemi", new window.BABYLON.Vector3(0, 1, 0), scene);
        hemi.intensity = 0.8;
        scene.clearColor = new window.BABYLON.Color4(0.0, 0.0, 0.0, 1.0);

        const debugGround = window.BABYLON.MeshBuilder.CreateGround("debugGround", {width: 20, height: 20}, scene);
        debugGround.isPickable = false;
        const debugSphere = window.BABYLON.MeshBuilder.CreateSphere("debugSphere", {diameter: 1}, scene);
        debugSphere.position.y = 1;
        debugSphere.isPickable = false;
        const debugMat = new window.BABYLON.StandardMaterial("debugMat", scene);
        debugMat.diffuseColor = new window.BABYLON.Color3(1.0, 0.0, 1.0);
        debugGround.material = debugMat;
        debugSphere.material = debugMat;

        (window as any).engine = engine;
        window.scene = scene;
        (window as any).camera = camera;
        
        window.PP.runtime?.exportGlobals(engine, scene, camera);

        window.addEventListener('resize', () => engine.resize());
        
        engine.runRenderLoop(() => {
            if (scene && scene.activeCamera) {
                scene.render();
            }
        });
        
        log("Engine and scene OK. Render loop started for smoke test.");
    }

    async function loadSelectedMap(mapId: string) {
        const mapData = window.PP.mapManifest.find((m: any) => m.id === mapId);
        if (!mapData) {
            throw new Error(`Map with id "${mapId}" not found in manifest.`);
        }

        log(`Loading map: ${mapData.title}`);
        if (mapData.id === 'procedural_house' && window.ProHouseGenerator) {
            await window.ProHouseGenerator.generateMap(scene);
            log("Procedural map generated.");
        } else if (mapData.file && window.PP.mapManager && typeof window.PP.mapManager.loadMap === 'function') {
            await window.PP.mapManager.loadMap(mapData);
            log("Static map loaded.");
        } else {
            throw new Error(`Map '${mapData.title}' has no valid loader defined.`);
        }
    }

    async function setupMapAndWeather(mapId: string) {
        log("3. Loading map and initializing weather...");
        showLoading(true, 40, "Building World...", "Loading map data...");
        
        await loadSelectedMap(mapId);

        showLoading(true, 70, "Building World...", "Initializing weather systems...");
        if(window.EnvAndSound && typeof window.EnvAndSound.firstInteractionBoot === 'function') {
            window.EnvAndSound.firstInteractionBoot();
            const weathers = ["Clear", "Rainstorm", "Snow", "Bloodmoon"];
            const choice = weathers[Math.floor(Math.random() * weathers.length)];
            window.EnvAndSound.setWeather(choice, { intensity: 0.5 + Math.random() * 0.5 });
            log(`Initial weather set to: ${choice}`);
        } else {
            warn("EnvAndSound system not found.");
        }

        if (typeof (window as any).applyDoorsConfig === 'function') {
            (window as any).applyDoorsConfig(scene);
            log("Door configurations applied.");
        }
    }

    function setupGameplaySystems() {
        log("4. Initializing gameplay systems...");
        showLoading(true, 75, "Waking Entities...", "Initializing ghost logic...");

        if (window.PP.ghost?.init) {
            window.PP.ghost.init(scene);
            log("Initialized ghost logic.");
        } else {
            warn("Ghost logic module not found for initialization.");
        }

        showLoading(true, 80, "Waking Entities...", "Selecting a ghost...");
        const ghostNames = Object.keys(window.PP.GHOST_DATA || {});
        if (ghostNames.length > 0) {
            const randomGhostName = ghostNames[Math.floor(Math.random() * ghostNames.length)];
            window.PP.state.selectedGhost = window.PP.GHOST_DATA[randomGhostName];
            log(`Selected Ghost: ${window.PP.state.selectedGhost.name}`);
            if (window.PP.ghost) {
                window.PP.ghost.data = window.PP.state.selectedGhost;
            }
        } else {
            warn("GHOST_DATA is empty! Cannot select a ghost.");
        }
        
        showLoading(true, 85, "Waking Entities...", "Initializing tools and systems...");
        if (window.PP.inventory?.models?.init) {
            window.PP.inventory.models.init(scene);
            log("Initialized item models.");
        }
        
        Object.values(window.PP.tools || {}).forEach((tool: any) => {
            if (typeof tool.init === 'function') {
                try {
                    tool.init(scene);
                } catch (e) {
                    warn(`Error initializing a tool:`, e);
                }
            }
        });
        
        ['salt', 'writing_book', 'uv_prints', 'lantern', 'lighter'].forEach(sysName => {
            const sys = (window as any).PP_SYSTEMS?.[sysName] || (window as any)[sysName.toUpperCase()];
            if(sys && typeof sys.init === 'function') {
                 try {
                    sys.init(scene);
                 } catch(e){
                    warn(`Error initializing system ${sysName}:`, e);
                 }
            }
        });
    }

    async function startGame(mapId: string) {
        if (window.PP.state.isStarted) return;
        log(`Starting game content loading for map: ${mapId}`);
        
        showLoading(true, 25, "Creating Player...", "");
        
        await setupMapAndWeather(mapId);
        setupGameplaySystems();
        
        showLoading(true, 90, "Finalizing...");
        
        window.PP.state.isStarted = true;
        (window as any).__PP_ALREADY_STARTED__ = true;
        window.dispatchEvent(new CustomEvent('pp:start'));
        log("Game start event dispatched!");

        if(window.PlayerRig) {
            log("Enabling player movement.");
            window.PlayerRig.enableMovement(true);
        }
        
        window.PP.pointerLock?.lock();
        
        setTimeout(() => {
            showLoading(false);
        }, 500);
    }

    function setupGlobalHelpers() {
        window.PP.checkForEvidence = (evidenceKey: string) => {
            if (!window.PP.state.selectedGhost) return false;
            return window.PP.state.selectedGhost.evidence.includes(evidenceKey);
        };

        window.PP.foundEvidence = (evidenceKey: string) => {
            (window.PP.state.foundEvidence as Set<string>).add(evidenceKey);
            log(`Evidence found: ${evidenceKey}. Total: ${window.PP.state.foundEvidence.size}/3`);
            window.dispatchEvent(new CustomEvent('pp:evidence:found', { detail: { evidence: evidenceKey }}));
        };

        window.addEventListener('pp:belt:equip', (e: any) => {
            const { item, slot } = e.detail;
            if (!item) return;
            window.dispatchEvent(new CustomEvent('pp:belt:unequip_all', { detail: { except: item.id } }));
            window.dispatchEvent(new CustomEvent(`pp:tool:equip:${item.id}`));
        });

         window.addEventListener('pp:belt:unequip', (e: any) => {
            const { item, slot } = e.detail;
            if (!item) return;
            window.dispatchEvent(new CustomEvent(`pp:tool:unequip:${item.id}`));
        });
    }

    async function initialize() {
        setupGlobalHelpers();
        
        const fallbackBtn = document.getElementById('fallback-refresh-btn');
        if (fallbackBtn) {
            fallbackBtn.addEventListener('click', () => window.location.reload());
        }
        
        const fallbackTimer = setTimeout(() => {
            if (!window.PP.gameHasRenderedFirstFrame) {
                console.error("Fallback Triggered: Game failed to render a frame within 15 seconds.");
                showLoading(false);
                const fallbackOverlay = document.getElementById('fallback-overlay');
                if (fallbackOverlay) (fallbackOverlay as HTMLElement).style.display = 'flex';
            }
        }, 15000);

        window.addEventListener('pp:start-investigation', async (e: any) => {
            const mapId = e.detail?.mapId;
            if (!mapId) {
                console.error("Start event fired without a mapId.");
                return;
            }
            
            try {
                await startGame(mapId);
            } catch(error) {
                console.error("CRITICAL FAILURE DURING GAME START:", error);
                clearTimeout(fallbackTimer);
                showLoading(false);
                const fallbackOverlay = document.getElementById('fallback-overlay');
                if (fallbackOverlay) (fallbackOverlay as HTMLElement).style.display = 'flex';
            }
        }, { once: true });


        try {
            log("Waiting for critical systems to be ready...");
            showLoading(true, 5, "Initializing...", "Waiting for systems...");
            await window.PP.waitFor!([
                'playerRig',
                'ghostLogic',
                'mapLoader',
                'inputManager',
                'envAndSound',
                'pointerLock'
            ]);
            log("All systems ready. Proceeding with engine setup.");

            showLoading(true, 10, "Initializing Engine...", "Setting up Babylon.js");
            await setupEngine();
            
            scene.onAfterRenderObservable.addOnce(() => {
                log("First frame rendered successfully (Smoke Test Passed).");
                window.PP.gameHasRenderedFirstFrame = true;
                clearTimeout(fallbackTimer);
                
                scene.getMeshByName("debugGround")?.dispose();
                scene.getMeshByName("debugSphere")?.dispose();
                scene.getMaterialByName("debugMat")?.dispose();
                
                showLoading(false);
                setTimeout(() => {
                    if (window.PP?.vanUI?.show) {
                        window.PP.vanUI.show();
                    } else {
                        warn("Van UI not found. Cannot start game selection.");
                        const fallbackOverlay = document.getElementById('fallback-overlay');
                        if(fallbackOverlay) {
                            fallbackOverlay.querySelector('h2')!.textContent = "UI Error";
                            fallbackOverlay.querySelector('p')!.textContent = "The main menu failed to load.";
                            fallbackOverlay.style.display = 'flex';
                        }
                    }
                }, 500);
            });

        } catch(error) {
            console.error("CRITICAL FAILURE DURING INITIALIZATION:", error);
            clearTimeout(fallbackTimer);
            showLoading(false);
            const fallbackOverlay = document.getElementById('fallback-overlay');
            if (fallbackOverlay) (fallbackOverlay as HTMLElement).style.display = 'flex';
        }
    }

    initialize();

    })();
    console.log("[Loader] Bootstrap inlined.");
}

/**
 * Main function to load all game scripts sequentially.
 */
async function main() {
  try {
    // Initializations that were already inlined
    initializeSettings();
    initializeRuntime();
    initializePlayerRigController();
    initializeGhostData();
    initializeGhostLogic();
    
    console.log('[Loader] Starting inlined script initialization...');

    // Inlined scripts in order
    initializeInputManager();
    initializePointerLockManager();
    initializeEnvAndSound();
    initializeMapLoader();
    initializeMapManager();
    initializePhasmaMapAndGhost();
    initializeInventorySystem();
    initializeSaltSystem();
    initializeWritingBook();
    initializeUvPrints();
    initializeLighter();
    initializeLantern();
    initializeDotsSystem();
    initializeEmf();
    initializeParabolicMic();
    initializeSpiritBox();
    initializeBeltManager();
    initializeHudUi();
    initializeNotebookUi();
    initializeReticle();
    initializeVanUi();
    initializeEffectsSanityMed();
    initializeGhostCam();
    initializeMinimap();
    initializeMoon();
    initializeGameplayPatch();
    initializePs5Controller();
    initializeDevtools();
    initializeGhostDev();
    initializeLogger();
    
    // Bootstrap runs last to start the game logic
    initializeBootstrap();

    console.log('[Loader] All scripts inlined and initialized successfully. Bootstrap has run.');
  } catch (error) {
    console.error("A critical error occurred during initialization:", error);
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
        loadingText.textContent = 'A critical error occurred. Please check the console.';
        (loadingText.parentElement!.querySelector('#loading-sub-text') as HTMLElement).textContent = (error as Error).message;
    }
    const fallbackOverlay = document.getElementById('fallback-overlay');
    if (fallbackOverlay) {
        fallbackOverlay.style.display = 'flex';
    }
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
  }
}

// Start the loading process once the DOM is ready.
document.addEventListener('DOMContentLoaded', main);

// FIX: Add an empty export to make this file a module, which is required for `declare global`.
export {};
