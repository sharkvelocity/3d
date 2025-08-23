
/* === Third-Person Avatar Patch =============================================
   - Expects: ./assets/models/player/main_player.glb
   - Toggle: Backslash "\"
   - Safe to include after your main scripts. No edits to InputSystem required.
============================================================================= */
(function(){
  const PLAYER_MODEL_DIR = "./assets/models/player/";
  const PLAYER_MODEL_FILE = "main_player.glb";
  const EYE_HEIGHT = 1.7;

  const avatar = {
    root: null,
    mesh: null,
    loaded: false,
    third: false,
    dist: 2.8,
    height: 1.55
  };

  async function ensurePlayerModel(){
    if(avatar.loaded || !window.scene) return;
    try{
      const r = await BABYLON.SceneLoader.ImportMeshAsync("", PLAYER_MODEL_DIR, PLAYER_MODEL_FILE, scene);
      const mesh = r.meshes.find(m=>m.name && m.name!=="__root__") || r.meshes[0];
      avatar.root = new BABYLON.TransformNode("playerRoot", scene);
      avatar.mesh = mesh;
      mesh.parent = avatar.root;
      mesh.isPickable = false;
      // scale to ~1.8 m tall
      const bb = mesh.getHierarchyBoundingVectors(true);
      const h = Math.max(0.001, bb.max.y - bb.min.y);
      const s = 1.8 / h;
      mesh.scaling.set(s,s,s);
      mesh.setEnabled(false); // hidden in first-person
      avatar.loaded = true;
    }catch(e){ console.warn("[3P] Failed to load main_player.glb", e); }
  }

  function toggleThirdPerson(){
    avatar.third = !avatar.third;
    if(avatar.mesh){ avatar.mesh.setEnabled(avatar.third); }
    if(typeof toast === "function") toast(avatar.third ? "Third-person ON (\\)" : "Third-person OFF (\\)");
  }
  window.toggleThirdPerson = toggleThirdPerson; // optional global

  function updateAvatarAndCamera(dt){
    if(!window.scene || !window.camera || !window.engine) return;
    ensurePlayerModel();
    if(avatar.root){
      // Ground at player's location (camera x/z)
      const start = new BABYLON.Vector3(camera.position.x, camera.position.y + 0.5, camera.position.z);
      const ray = new BABYLON.Ray(start, new BABYLON.Vector3(0,-1,0), 6.0);
      const hit = scene.pickWithRay(ray, m=>m && m.isPickable!==false);
      const groundY = hit?.pickedPoint ? hit.pickedPoint.y : (camera.position.y - EYE_HEIGHT);

      // Position avatar at ground, face camera yaw
      avatar.root.position.set(camera.position.x, groundY, camera.position.z);
      avatar.root.rotation.set(0, camera.rotation.y, 0);

      if(avatar.third){
        // Desired camera position behind avatar (ignore pitch for forward vector)
        const yaw = camera.rotation.y;
        const fwd = new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const pivot = new BABYLON.Vector3(avatar.root.position.x, groundY + avatar.height, avatar.root.position.z);
        const ideal = pivot.subtract(fwd.scale(avatar.dist)); ideal.y = groundY + avatar.height;

        // Wall avoidance: ray from pivot toward ideal
        const dir = ideal.subtract(pivot); const len = Math.max(0.001, dir.length());
        const rayBack = new BABYLON.Ray(pivot, dir.scale(1/len), len);
        const hitBack = scene.pickWithRay(rayBack, m=>m && m.isPickable!==false);
        const finalPos = hitBack?.pickedPoint ? hitBack.pickedPoint.add(dir.scale(1/len).scale(0.2)) : ideal;

        camera.position.copyFrom(finalPos);
        camera.minZ = 0.1;
      }
    }
  }

  // Backslash toggles
  document.addEventListener("keydown", (e)=>{
    if(e.code === "Backslash"){ e.preventDefault(); toggleThirdPerson(); }
  }, {passive:false});

  // Attach update loop once scene exists
  (function waitScene(){
    if (window.scene && window.engine && window.camera){
      ensurePlayerModel();
      scene.onBeforeRenderObservable.add(()=>{
        const dt = engine.getDeltaTime()/1000;
        updateAvatarAndCamera(dt);
      });
    } else {
      setTimeout(waitScene, 300);
    }
  })();
})();
