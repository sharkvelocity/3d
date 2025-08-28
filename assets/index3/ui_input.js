// HUD & UI
function updateHUD(){ $('#hud-sanity').textContent = `${player.sanity|0}%`; $('#hud-room').textContent = player.room; }

let keysDown = {};
function bindInputs(){
  window.addEventListener('keydown', (e)=>{
    keysDown[e.key] = true;
    if(e.key==='w' || e.key==='W') controls.forward = true;
    if(e.key==='s' || e.key==='S') controls.back    = true;
    if(e.key==='a' || e.key==='A') controls.left    = true;
    if(e.key==='d' || e.key==='D') controls.right   = true;
    if(e.key==='Shift') player.running = true;
    if(e.key==='f' || e.key==='F') flashLight.intensity = flashLight.intensity>0 ? 0 : 2.0;
    if(e.key==='u' || e.key==='U') uvLight.intensity    = uvLight.intensity>0 ? 0 : 1.2;
    if(e.key==='i' || e.key==='I') irLight.intensity    = irLight.intensity>0 ? 0 : 1.5;
    if(e.key==='p' || e.key==='P') setHousePower(!housePower);
    if(e.key==='e' || e.key==='E') openDoorNearby();
  });
  window.addEventListener('keyup', (e)=>{
    keysDown[e.key] = false;
    if(e.key==='w' || e.key==='W') controls.forward = false;
    if(e.key==='s' || e.key==='S') controls.back    = false;
    if(e.key==='a' || e.key==='A') controls.left    = false;
    if(e.key==='d' || e.key==='D') controls.right   = false;
    if(e.key==='Shift') player.running = false;
  });
}

function handleMovement(dt){
  const speed = player.running ? player.speedRun : player.speedWalk;
  let move = new BABYLON.Vector3(0,0,0);
  if(controls.forward) move.z += 1;
  if(controls.back)    move.z -= 1;
  if(controls.left)    move.x -= 1;
  if(controls.right)   move.x += 1;

  if(move.lengthSquared() > 0){
    move.normalize();
    const fwd = camera.getForwardRay().direction; fwd.y = 0; fwd.normalize();
    const right = BABYLON.Vector3.Cross(fwd, BABYLON.Axis.Y).scale(-1);
    const desired = fwd.scale(move.z).add(right.scale(move.x)).normalize();
    camera.cameraDirection = desired.scale(speed * dt);
  } else {
    camera.cameraDirection = new BABYLON.Vector3(0,0,0);
  }

  if(allowFly && dev.enabled){
    if(keysDown["PageUp"])   camera.position.y += 0.6 * dt * 60;
    if(keysDown["PageDown"]) camera.position.y -= 0.6 * dt * 60;
  }

  player.room = inVanZone(camera.position) ? "Van" : "Grounds";
  document.getElementById('storage-button').style.display = (player.room==="Van") ? "block" : "none";
  updateHUD();
}

function openDoorNearby(){
  const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
  const pick = scene.pickWithRay(ray, m => /door/i.test(m.name||""));
  if(pick.hit && pick.pickedMesh){
    const d = BABYLON.Vector3.Distance(pick.pickedPoint, camera.position);
    if(d < 3.0){
      const door = pick.pickedMesh;
      const open = !door.metadata?.open;
      const baseRot = door.metadata?.baseRot ?? door.rotation.y;
      if(open){
        door.rotation = new BABYLON.Vector3(door.rotation.x, baseRot + Math.PI/2, door.rotation.z);
        door.checkCollisions = false;
        (Math.random()>0.5?audio.doorCreak1:audio.doorCreak2).play().catch(()=>{});
      } else {
        door.rotation = new BABYLON.Vector3(door.rotation.x, baseRot, door.rotation.z);
        door.checkCollisions = true;
      }
      door.metadata = { baseRot, open };
    }
  }
}

// footsteps (player)
const stepState = { lastPos:null, acc:0, strideWalk:1.2, strideRun:0.8 };
function updatePlayerFootsteps(dt){
  if (!stepState.lastPos) { stepState.lastPos = camera.position.clone(); return; }
  const now = camera.position;
  const d = BABYLON.Vector3.Distance(now, stepState.lastPos);
  stepState.lastPos = now.clone();
  if(!(controls.forward||controls.back||controls.left||controls.right)) return;

  stepState.acc += d;
  const stride = player.running ? stepState.strideRun : stepState.strideWalk;
  if (stepState.acc >= stride){
    stepState.acc = 0;
    playStep(0.42);
  }
}
