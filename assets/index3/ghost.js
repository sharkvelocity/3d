function setGhostVisible(v){
  ghost.visible = !!v;
  if (!ghost.mesh) return;
  ghost.mesh.getChildMeshes(false).concat([ghost.mesh]).forEach(m=>{ m.isVisible = v; m.visibility = v ? 1 : 0; });
  if (ghost.meshFast){ ghost.meshFast.getChildMeshes(false).concat([ghost.meshFast]).forEach(m=>{ m.isVisible = v; m.visibility = v?1:0; }); }
}

async function loadGhost(){
  try{
    const list = ["ghost1.glb","ghost2.glb","ghost3.glb","ghost4.glb","ghost5.glb"];
    const pick = list[Math.floor(Math.random()*list.length)];
    const r = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/ghosts/", pick, scene);
    ghost.mesh = r.meshes[0] || r.meshes.find(m=>m.name==="__root__");
    ghost.mesh.checkCollisions = false; ghost.mesh.isPickable = false;

    const bb = ghost.mesh.getHierarchyBoundingVectors(true);
    const height = bb.max.y - bb.min.y;
    const scale = (1.9 / (height || 1));
    ghost.mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
    ghost.mesh.rotation = new BABYLON.Vector3(0,0,0);

    r.animationGroups.forEach(ag=>{ if(/idle/i.test(ag.name)) ghost.anims.idle = ag; if(/walk|run/i.test(ag.name)) ghost.anims.walk = ag; });
    if(ghost.anims.idle) ghost.anims.idle.start(true);

    const p = randomPointInPolygonXZ(ghostPolygon);
    const gy = pickGroundHeightAt(p.x, p.z);
    ghost.mesh.position = new BABYLON.Vector3(p.x, gy, p.z);
    ghost.target = randomPointInPolygonXZ(ghostPolygon);

    setGhostVisible(false);

    // Twins
    ghost.isTwins = (currentGhostKey || "").toLowerCase() === "the twins";
    if (ghost.isTwins) {
      ghost.meshFast = ghost.mesh.clone("ghostFast", null, true);
      ghost.meshFast.isPickable = false;
      ghost.meshFast.checkCollisions = false;
      ghost.meshFast.visibility = ghost.visible ? 1 : 0;

      const sep = TWINS_SEP_MIN + Math.random() * (TWINS_SEP_MAX - TWINS_SEP_MIN);
      const dir = new BABYLON.Vector3(1, 0, 0).rotateByQuaternionToRef(
        BABYLON.Quaternion.FromEulerAngles(0, Math.random()*Math.PI*2, 0),
        new BABYLON.Vector3()
      );
      const basePos = ghost.mesh.position.clone();
      const fp = basePos.add(dir.scale(sep));
      fp.y = pickGroundHeightAt(fp.x, fp.z);
      ghost.meshFast.position.copyFrom(fp);

      try {
        moonShadows.addShadowCaster(ghost.meshFast, true);
        flashShadows.addShadowCaster(ghost.meshFast, true);
      } catch {}
    }
  }catch(e){ console.warn("Ghost load failed:", e); }
}

let flickerTimer=0, flickerOn=false;
function flickerStart(){ flickerTimer = 0; flickerOn = true; }
function flickerStop(){ flickerOn = false;
  houseLights.forEach(h=>{
    if (!housePower) { h.light.intensity = 0; return; }
    if (h.light.intensity>0) h.light.intensity = 0.8;
  });
}

let huntCooldown = 22 + Math.random()*18;
let huntClock = 0;
function beginHunt(){
  if (!ghost.mesh || ghost.hunting) return;

  if (tryBlockHuntByCrucifix()){
    huntClock = 0; huntCooldown = 14 + Math.random()*16;
    return;
  }

  ghost.hunting = true;
  $('#hud-hunt-state').textContent = 'HUNTING';
  setGhostVisible(true);
  ghost.speed = 1.4;
  ghost.stepInterval = 0.48;
  flickerStart();
  toast('⚠️ Hunt started!', 1200);
}
function endHunt(){
  if (!ghost.hunting) return;
  ghost.hunting = false;
  $('#hud-hunt-state').textContent = 'Calm';
  setGhostVisible(false);
  ghost.speed = 1.4;
  ghost.stepInterval = 0.55;
  flickerStop();
  toast('Hunt ended.', 900);
}
function sanityTick(dt){
  const nearGhost = ghost.mesh ? BABYLON.Vector3.Distance(ghost.mesh.position, camera.position) < 7 : false;
  const base = 0.6/60;
  const add = nearGhost ? 1.2/60 : 0;
  const drain = (base+add) * (storageOpen?0.2:1) * (inVanZone(camera.position)?0.4:1) * (weather.modSanityDrain||1);
  player.sanity = Math.max(0, player.sanity - drain);
  $('#hud-sanity').textContent = `${player.sanity|0}%`;

  if (!ghost.hunting && !inVanZone(camera.position) && player.sanity <= 65){
    huntClock += dt * (weather.modHuntPace||1);
    if (huntClock >= huntCooldown){
      huntClock = 0; huntCooldown = 22 + Math.random()*18;
      const baseChance = (player.sanity<40 ? 0.85 : 0.55);
      if (Math.random() < baseChance * (weather.modHuntChance||1)) beginHunt();
    }
  }
  if (ghost.hunting && (inVanZone(camera.position) || Math.random()<0.0015)) endHunt();
}
