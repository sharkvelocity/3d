let itemsGlb = null;
async function loadItems(){
  try{
    const res = await BABYLON.SceneLoader.LoadAssetContainerAsync("", "./assets/models/items/exploration_objects.glb", scene);
    itemsGlb = res;
    res.meshes.forEach(m=>{
      if(!m.name || m.name==="_root" || m.name=="__root__") return;
      inventory.models[m.name] = m;
    });
  }catch(e){ console.warn("Items load failed:", e); }
}
