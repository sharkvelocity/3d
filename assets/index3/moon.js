async function loadMoon(){
  try{
    const r = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/sky/", "moon.glb", scene);
    moonMesh = r.meshes.find(m=>m.name && m.name!=="__root__") || r.meshes[0];
    if (!moonMesh) throw new Error("moon.glb had no meshes");

    moonMesh.isPickable=false; moonMesh.checkCollisions=false; moonMesh.applyFog=false;
    moonMesh.renderingGroupId = 1;

    const bb = moonMesh.getHierarchyBoundingVectors(true);
    const size = bb.max.subtract(bb.min).length();
    if (size < 5) moonMesh.scaling = new BABYLON.Vector3(30,30,30);

    moonMat = moonMesh.material || new BABYLON.StandardMaterial("moonMat", scene);
    moonMat.disableLighting = true;
    moonMat.emissiveColor = new BABYLON.Color3(1,1,1);
    moonMesh.material = moonMat;

    moonMesh.position = new BABYLON.Vector3(0, 350, 380);
    applyMoonTintForWeather();

    scene.onBeforeRenderObservable.add(()=>{
      const t = performance.now()*0.00002;
      moonMesh.position.x = Math.cos(t)*380;
      moonMesh.position.z = Math.sin(t)*380;
      moonMesh.position.y = 340 + Math.sin(t*1.7)*10;
    });
  }catch(e){
    console.warn("loadMoon failed, using sphere:", e);
    moonMesh = BABYLON.MeshBuilder.CreateSphere("moon", {diameter:60, segments:18}, scene);
    moonMesh.isPickable=false; moonMesh.applyFog=false; moonMesh.renderingGroupId=1;
    moonMat = new BABYLON.StandardMaterial("moonMat", scene);
    moonMat.disableLighting = true;
    try{ moonMat.emissiveTexture = new BABYLON.Texture("./assets/images/sky/moon.jpg", scene); }
    catch{ moonMat.emissiveColor = new BABYLON.Color3(0.9,0.9,0.9); }
    moonMesh.material = moonMat;
    moonMesh.position = new BABYLON.Vector3(0, 350, 380);
    applyMoonTintForWeather();
  }
}
