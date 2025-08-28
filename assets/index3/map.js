async function loadMap(){
  try{
    const result = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", "Abandoned_House.glb", scene);
    houseRoot = result.meshes[0] || result.meshes.find(m=>m.name==="__root__");
    result.meshes.forEach(m=>{
      m.checkCollisions = true; m.isPickable = true;
      const bb = m.getBoundingInfo().boundingBox;
      const size = bb.maximum.subtract(bb.minimum);
      const thin = (size.y < 0.12) || (size.x < 0.12) || (size.z < 0.12);
      if(thin) m.checkCollisions = false;
      if(m.material && m.material.alpha && m.material.alpha < 0.9) m.checkCollisions = false;
      if(/door/i.test(m.name||"")) doorMeshes.push(m);
    });

    // invisible catch ground
    const fallbackGround = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width:400, height:400, subdivisions:1 }, scene);
    fallbackGround.position.y = 0; fallbackGround.checkCollisions = true; fallbackGround.isPickable = true; fallbackGround.visibility = 0;

    // spawn at van height
    const y = pickGroundHeightAt(vanZone.center.x, vanZone.center.z);
    camera.position = new BABYLON.Vector3(vanZone.center.x, y + 1.7, vanZone.center.z);

    doorMeshes.forEach(door=>{ door.actionManager = new BABYLON.ActionManager(scene); door.isPickable = true; });
  }catch(e){
    console.warn("Map load failed:", e);
  }
}
function afterMapLoadedForShadows(){
  scene.meshes.forEach(m=>{
    if (!m || m.name==='skybox') return;
    m.receiveShadows = true;
  });
}
