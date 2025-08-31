
/**
 * house_glb_integration.js
 * Auto-wires a 2-story + basement GLB house (with pivoted doors) into your existing Babylon project.
 *
 * Drop this file at: ./assets/index3/house_glb_integration.js
 * Then include it near the end of your index (after Babylon + your scene bootstrap):
 *   <script src="./assets/index3/house_glb_integration.js"></script>
 *
 * It will try to auto-detect the scene and initialize itself.
 * If you already have a scene reference, you can explicitly call:
 *   HouseGLB.init(scene, { path:"./assets/models/map/", file:"house_procedural_export.glb" })
 */
(function(){
  const DEFAULTS = {
    path: "./assets/models/map/",
    file: "house_procedural_export.glb",
    spawn: { x: 0, y: 1.8, z: -6.8 },
    player: {
      height: 1.8,
      speed: 0.6,
      gravity: -0.5,
      ellipsoid: { x: 0.35, y: 0.9, z: 0.35 }
    },
    loaderDom: { boxId: "loadingBox", fillId: "loadingFill", pctId: "loadingPct" },
    startDom: { screenId: "startScreen", buttonId: "startBtn" },
    reticleId: "reticle"
  };

  const HouseGLB = {
    scene: null,
    config: Object.assign({}, DEFAULTS),
    state: { doorOpen: new Map(), ready:false },
    init(scene, cfg) {
      if (this.state.ready) return;
      this.config = Object.assign({}, DEFAULTS, cfg||{});
      this.scene = scene || window.scene || (BABYLON && BABYLON.Engine && BABYLON.Engine.LastCreatedScene);
      if (!this.scene) {
        console.warn("[HouseGLB] No scene found yet; will poll and init when available.");
        this._pollForScene();
        return;
      }
      this._ensureUI();
      this._ensureCamera();
      this._ensureGround();
      this._wireInspectorToggle();
      this._hookStartGate(async () => {
        await this._loadHouse();
        this._enableDoorClicks();
        this._exposeAPI();
        this._hookDevtools();
        this._hookMinimap();
        this.state.ready = true;
        console.log("[HouseGLB] ready");
      });
    },
    _pollForScene() {
      let tries = 0;
      const timer = setInterval(()=>{
        this.scene = this.scene || (BABYLON && BABYLON.Engine && BABYLON.Engine.LastCreatedScene);
        if (this.scene || ++tries>400) { // ~20s max
          clearInterval(timer);
          if (this.scene) this.init(this.scene, this.config);
          else console.error("[HouseGLB] Failed to detect scene.");
        }
      }, 50);
    },
    _ensureUI() {
      // Reticle
      const rid = this.config.reticleId;
      if (!document.getElementById(rid)) {
        const r = document.createElement("div");
        r.id = rid;
        r.style.cssText = "position:fixed;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;color:#8fd0ff;font-weight:700;font-size:18px;pointer-events:none;z-index:600000";
        r.innerHTML = "<span>+</span>";
        document.body.appendChild(r);
      }
    },
    _ensureCamera() {
      const scene = this.scene;
      if (!scene.activeCamera) {
        // create a universal camera if none exists
        const cam = new BABYLON.UniversalCamera("PlayerCam", new BABYLON.Vector3(this.config.spawn.x, this.config.player.height, this.config.spawn.z), scene);
        cam.attachControl(scene.getEngine().getRenderingCanvas(), true);
        scene.activeCamera = cam;
      }
      const cam = scene.activeCamera;
      scene.collisionsEnabled = true;
      scene.gravity = new BABYLON.Vector3(0, this.config.player.gravity, 0);
      cam.minZ = 0.05;
      cam.speed = this.config.player.speed;
      cam.inertia = 0.7;
      cam.angularSensibility = cam.angularSensibility || 2200;
      cam.checkCollisions = true;
      cam.applyGravity = true;
      cam.ellipsoid = new BABYLON.Vector3(this.config.player.ellipsoid.x, this.config.player.ellipsoid.y, this.config.player.ellipsoid.z);
      // WASD
      if (cam.keysUp.indexOf(87)===-1) cam.keysUp.push(87);
      if (cam.keysDown.indexOf(83)===-1) cam.keysDown.push(83);
      if (cam.keysLeft.indexOf(65)===-1) cam.keysLeft.push(65);
      if (cam.keysRight.indexOf(68)===-1) cam.keysRight.push(68);
    },
    _ensureGround() {
      const scene = this.scene;
      if (!scene.getMeshByName("ground")) {
        const g = BABYLON.MeshBuilder.CreateGround("ground",{width:60,height:60},scene);
        g.position.y = -2.8;
        g.checkCollisions = true;
        g.isPickable = false;
      }
    },
    _wireInspectorToggle() {
      const scene = this.scene;
      if (!this._inspectorHotkey) {
        this._inspectorHotkey = (ev) => {
          if (ev.key && ev.key.toLowerCase() === "i") {
            if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
            else scene.debugLayer.show({ overlay: true });
          }
        };
        window.addEventListener("keydown", this._inspectorHotkey);
      }
    },
    _hookStartGate(continueFn) {
      const sIds = this.config.startDom;
      const screen = document.getElementById(sIds.screenId);
      const button = document.getElementById(sIds.buttonId);
      const go = async () => {
        try { await continueFn(); }
        catch(e){ console.error("[HouseGLB] init error:", e); }
      };
      if (screen && button) {
        button.addEventListener("click", () => {
          screen.style.display = "none";
          this._showLoader(true);
          go().finally(()=>this._showLoader(false));
        }, { once:true });
      } else {
        // no gate in this workspace; just go
        this._showLoader(true);
        go().finally(()=>this._showLoader(false));
      }
    },
    _showLoader(show) {
      const l = this.config.loaderDom;
      const box = document.getElementById(l.boxId);
      if (box) box.style.display = show ? "block" : "none";
    },
    _setLoading01(x) {
      const l = this.config.loaderDom;
      const fill = document.getElementById(l.fillId);
      const pct = document.getElementById(l.pctId);
      const clamped = Math.max(0, Math.min(1, x||0));
      if (fill) fill.style.width = (clamped*100).toFixed(1)+"%";
      if (pct) pct.textContent = Math.round(clamped*100) + "%";
    },
    async _loadHouse() {
      const scene = this.scene;
      const path = this.config.path;
      const file = this.config.file;

      // Basic light if none exists
      if (scene.lights.length === 0) {
        const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
        hemi.intensity = 0.9;
      }

      await new Promise((resolve, reject)=>{
        BABYLON.SceneLoader.Append(
          path, file, scene,
          () => {
            // collisions on
            scene.meshes.forEach(m => m.checkCollisions = true);
            // spawn camera
            const cam = scene.activeCamera;
            cam.position = new BABYLON.Vector3(this.config.spawn.x, this.config.player.height, this.config.spawn.z);
            cam.setTarget(new BABYLON.Vector3(0, this.config.player.height, -5.0));
            resolve();
          },
          (evt)=>{
            if (evt && evt.lengthComputable) this._setLoading01(evt.loaded/evt.total);
            else {
              const fill = document.getElementById(this.config.loaderDom.fillId);
              const cur = fill ? (parseFloat(fill.style.width)||0)/100 : 0;
              this._setLoading01(Math.min(1, cur + 0.02));
            }
          },
          (scene, msg, ex)=> reject(new Error(msg || "GLB load failed"))
        );
      });
    },
    _enableDoorClicks() {
      const scene = this.scene;
      scene.onPointerObservable.add((pi)=>{
        if (pi.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
        const pick = scene.pick(scene.pointerX, scene.pointerY);
        if (pick && pick.hit && pick.pickedMesh) {
          const toggled = this.toggleDoorFromMesh(pick.pickedMesh);
          if (toggled) this._playDoorSound(toggled.open ? "open" : "close");
        }
      });
    },
    _baseDoorNameFromMesh(mesh) {
      if (!mesh || !mesh.name) return null;
      const name = mesh.name;
      if (/_leaf/i.test(name)) return name.replace(/_leaf.*/i,"");
      if (/_frame/i.test(name)) return name.replace(/_frame.*/i,"");
      if (/_hinge/i.test(name)) return name.replace(/_hinge.*/i,"");
      // climb parents
      let p = mesh.parent;
      while (p && !/^Door_/i.test(p.name)) p = p.parent;
      return p ? p.name.split("_").slice(0,2).join("_") : null;
    },
    toggleDoorFromMesh(mesh) {
      const base = this._baseDoorNameFromMesh(mesh);
      if (!base) return false;
      return this.toggleDoor(base);
    },
    toggleDoor(base) {
      const scene = this.scene;
      const hinge = scene.getTransformNodeByName(base + "_hinge");
      if (!hinge) return false;
      const isOpen = this.state.doorOpen.get(base) === true;
      const target = isOpen ? 0 : Math.PI/2;
      BABYLON.Animation.CreateAndStartAnimation(
        "swing_"+base, hinge, "rotation.y", 60, 15,
        hinge.rotation.y, target, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      this.state.doorOpen.set(base, !isOpen);
      this._emit("door:toggled", { name: base, open: !isOpen });
      return { name: base, open: !isOpen };
    },
    openAllDoors() {
      const scene = this.scene;
      const hinges = scene.transformNodes.filter(n => /_hinge$/i.test(n.name));
      hinges.forEach(h => {
        const base = h.name.replace(/_hinge$/i,"");
        if (this.state.doorOpen.get(base) !== true) this.toggleDoor(base);
      });
    },
    closeAllDoors() {
      const scene = this.scene;
      const hinges = scene.transformNodes.filter(n => /_hinge$/i.test(n.name));
      hinges.forEach(h => {
        const base = h.name.replace(/_hinge$/i,"");
        if (this.state.doorOpen.get(base) !== false) this.toggleDoor(base);
      });
    },
    teleport(x,y,z) {
      const cam = this.scene.activeCamera;
      cam.position.set(x, y, z);
      this._emit("teleport:done", { x,y,z });
    },
    // ----- Sound hooks -----
    _playDoorSound(kind) {
      // Try user's sound engine
      try {
        if (window.Sound && typeof window.Sound.play === "function") {
          const key = kind === "open" ? "door_open" : "door_close";
          window.Sound.play(key);
          return;
        }
        if (window.SoundEngine && typeof window.SoundEngine.play === "function") {
          const key = kind === "open" ? "door_open" : "door_close";
          window.SoundEngine.play(key);
          return;
        }
      } catch(e){}
      // Fallback <audio>
      const url = (kind === "open")
        ? "./assets/audio/door_creak.mp3"
        : "./assets/audio/door_close.mp3";
      const a = new Audio(url);
      a.volume = 0.7;
      a.play().catch(()=>{});
    },
    // ----- Devtools / Minimap hooks -----
    _hookDevtools() {
      // Expose a minimal DEBUG api if not present
      window.DEBUG = window.DEBUG || {};
      window.DEBUG.teleport = (x,y,z) => this.teleport(x,y,z);
      window.DEBUG.openAllDoors = () => this.openAllDoors();
      window.DEBUG.closeAllDoors = () => this.closeAllDoors();
      window.DEBUG.toggleDoor = (name) => this.toggleDoor(name);
      window.DEBUG.listDoors = () => this.scene.transformNodes.filter(n => /_hinge$/i.test(n.name)).map(h=>h.name.replace(/_hinge$/i,""));
      this._emit("debug:ready");
    },
    _hookMinimap() {
      // If a minimap viewer exists and dispatches custom events, wire to teleport.
      window.addEventListener("minimap:teleport", (ev)=>{
        const { x,y,z } = ev.detail || {};
        if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
          this.teleport(x,y,z);
        }
      });
      this._emit("minimap:bounds", { xMin:-6, xMax:6, zMin:-5, zMax:5 }); // simple house footprint
    },
    // ----- Small event bus -----
    _emit(type, detail) {
      try { window.dispatchEvent(new CustomEvent("house:"+type, { detail })); } catch(e){}
    }
  };

  // Export
  window.HouseGLB = HouseGLB;

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => HouseGLB.init());
  } else {
    setTimeout(()=>HouseGLB.init(), 0);
  }
})();
