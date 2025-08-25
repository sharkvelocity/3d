/* assets/dev/moon.js — Apply external moon.jpg texture to moon.glb */
(function(){
  function S(){ 
    return window.SCENE || window.scene || (window.ENGINE && ENGINE.scenes && ENGINE.scenes[0]); 
  }

  function applyMoonTexture(scene){
    if (!scene) return;
    try {
      // Load the moon.jpg from your textures folder
      const moonTex = new BABYLON.Texture("./assets/textures/moon.jpg", scene);

      // Get the material by name (from moon.glb)
      const mat = scene.getMaterialByName("Sphere_Material.002_0");

      if (mat) {
        if (mat.diffuseTexture === undefined && mat.albedoTexture === undefined) {
          // If the material is just a plain PBR/Standard without a texture yet
          mat.diffuseTexture = moonTex;
        } else if (mat.albedoTexture !== undefined) {
          // PBRMaterial
          mat.albedoTexture = moonTex;
        } else {
          // StandardMaterial
          mat.diffuseTexture = moonTex;
        }
        console.log("[moon.js] Applied moon.jpg to Sphere_Material.002_0");
      } else {
        console.warn("[moon.js] Could not find Sphere_Material.002_0 in scene");
      }
    } catch(e){
      console.error("[moon.js] Error applying moon texture:", e);
    }
  }

  // Attach to Babylon scene lifecycle
  window.addEventListener("DOMContentLoaded", ()=>{
    const s = S();
    if (!s) return;
    s.executeWhenReady(()=> applyMoonTexture(s));
  });
})();
