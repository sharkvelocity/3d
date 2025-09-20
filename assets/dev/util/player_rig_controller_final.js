/* player_rig_controller_final.js — robust player rig with WASD + PS5 + animations + slopes
   ------------------------------------------------------------
   - WASD / PS5 movement
   - ` toggles 1P/3P camera
   - C toggles crouch
   - Raycast keeps player anchored to ground with slopes
   - Animations: idle, walk, crouchWalk
*/

(function(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = window.PP = window.PP || {};
  PP.rig = PP.rig || {};

  const AVATAR = {
    file: "./assets/models/player/player.glb",
    eyeY: 1.6,
    targetHeight: 1.75,
    meshYOffset: 0.0
  };
  const CAM3 = { back: 2.8, up: 1.25 };
  const SPEEDS = { walk: 1.8, run: 3.5, crouch: 1.0 };
  const MAX_SLOPE = 45;

  let scene, camera;
  let body, avatarRoot, avatarMeshes=[];
  let isThird=false, isCrouching=false;
  let animations={ idle:null, walk:null, crouchWalk:null };
  let currentAnim=null;
  let lastPos=null;

  const input={ forward:false, back:false, left:false, right:false, run:false };
  let lastCrouchPressed=false;

  // ----- Keyboard input -----
  addEventListener("keydown",(e)=>{
    if(e.code==="KeyW") input.forward=true;
    if(e.code==="KeyS") input.back=true;
    if(e.code==="KeyA") input.left=true;
    if(e.code==="KeyD") input.right=true;
    if(e.code==="ShiftLeft"||e.code==="ShiftRight") input.run=true;
    if(e.code==="KeyC" && !lastCrouchPressed){ isCrouching = !isCrouching; lastCrouchPressed=true; }
    if(e.code==="Backquote"){ isThird = !isThird; e.preventDefault(); }
  },true);

  addEventListener("keyup",(e)=>{
    if(e.code==="KeyW") input.forward=false;
    if(e.code==="KeyS") input.back=false;
    if(e.code==="KeyA") input.left=false;
    if(e.code==="KeyD") input.right=false;
    if(e.code==="ShiftLeft"||e.code==="ShiftRight") input.run=false;
    if(e.code==="KeyC") lastCrouchPressed=false;
  },true);

  function ensureScene(){
    scene = scene || window.SCENE || BABYLON.EngineStore?.LastCreatedScene;
    camera = scene?.activeCamera;
    return !!(scene && camera);
  }

  function getSpawnPosition(){
    if(window.MAP_DEF?.spawn) return new BABYLON.Vector3(
      MAP_DEF.spawn.x||0,
      MAP_DEF.spawn.y||AVATAR.eyeY,
      MAP_DEF.spawn.z||0
    );
    if(window.__PP_SPAWN) return window.__PP_SPAWN.clone();
    return new BABYLON.Vector3(0, AVATAR.eyeY, 0);
  }

  function makeBody(){
    body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule",{
      height: AVATAR.targetHeight,
      radius:0.35
    },scene);
    body.isVisible = false;
    body.position.copyFrom(getSpawnPosition());

    body.physicsImpostor = new BABYLON.PhysicsImpostor(
      body,
      BABYLON.PhysicsImpostor.CapsuleImpostor,
      { mass: 70, restitution: 0, friction: 0.8 },
      scene
    );

    PP.rig.body = body;
    return body;
  }

  async function loadAvatar(){
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
    const root = res.meshes[0];
    normalizeAvatarScale(root);

    res.animationGroups.forEach(g=>{
      if(/Idle/i.test(g.name)) animations.idle=g;
      if(/Walk/i.test(g.name)) animations.walk=g;
      if(/Crouch/i.test(g.name)) animations.crouchWalk=g;
    });

    playAnim("idle");
  }

  function normalizeAvatarScale(root){
    root.scaling.setAll(1);
    const bb=root.getHierarchyBoundingVectors();
    const rawH=bb.max.y-bb.min.y;
    const scale=AVATAR.targetHeight/rawH;
    root.scaling.setAll(scale);

    const bb2=root.getHierarchyBoundingVectors();
    root.position.y -= bb2.min.y;

    avatarRoot=root;
    avatarMeshes=root.getChildMeshes();
    avatarRoot.parent=body;
    avatarRoot.isVisible = true;
  }

  function playAnim(name){
    if(currentAnim===animations[name]) return;
    Object.values(animations).forEach(g=>g?.stop());
    animations[name]?.start(true);
    currentAnim=animations[name];
  }

  function syncCamera(){
    if(!camera || !body) return;
    const pos=body.position;
    if(!isThird){
      camera.position.set(pos.x, pos.y+AVATAR.eyeY, pos.z);
    } else {
      const eye=new BABYLON.Vector3(pos.x, pos.y+AVATAR.eyeY, pos.z);
      const back=camera.getDirection(BABYLON.Vector3.Forward()).scale(-CAM3.back);
      camera.position.copyFrom(eye.add(new BABYLON.Vector3(0,CAM3.up,0)).add(back));
      camera.setTarget(eye);
    }
  }

  function stickToGround(moveDir){
    if(!body || !scene) return moveDir||BABYLON.Vector3.Zero();
    const origin=body.position.add(new BABYLON.Vector3(0,1,0));
    const ray=new BABYLON.Ray(origin, BABYLON.Axis.Y.scale(-1), 4);
    const pick=scene.pickWithRay(ray, m=>m.isPickable && m.name.toLowerCase().includes("ground"));
    if(!pick.hit) return moveDir||BABYLON.Vector3.Zero();

    const groundPoint=pick.pickedPoint;
    const groundNormal=pick.getNormal(true);
    body.position.y = groundPoint.y + AVATAR.targetHeight/2;

    if(moveDir && moveDir.lengthSquared()>0.001){
      const slopeAngle = BABYLON.Vector3.GetAngleBetweenVectors(
        BABYLON.Axis.Y, groundNormal, BABYLON.Vector3.Forward()
      )*(180/Math.PI);

      if(slopeAngle<=MAX_SLOPE){
        const moveOnSlope = moveDir.subtract(groundNormal.scale(BABYLON.Vector3.Dot(moveDir, groundNormal)));
        return moveOnSlope.normalize();
      } else return BABYLON.Vector3.Zero();
    }
    return moveDir||BABYLON.Vector3.Zero();
  }

  function moveLoop(){
    if(!ensureScene()){ requestAnimationFrame(moveLoop); return; }
    const dt=scene.getEngine().getDeltaTime()/1000;

    const forward=camera.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right=camera.getDirection(BABYLON.Vector3.Right()).normalize();

    let move=new BABYLON.Vector3(0,0,0);
    if(input.forward) move.addInPlace(forward);
    if(input.back) move.subtractInPlace(forward);
    if(input.left) move.subtractInPlace(right);
    if(input.right) move.addInPlace(right);

    if(move.lengthSquared()>0.001){
      move.normalize();
      const speed=isCrouching?SPEEDS.crouch:(input.run?SPEEDS.run:SPEEDS.walk);
      const slopeMove=stickToGround(move);
      if(slopeMove.lengthSquared()>0.001)
        body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());

      playAnim(isCrouching?"crouchWalk":"walk");

      if(!lastPos) lastPos=body.position.clone();
      const d=BABYLON.Vector3.Distance(lastPos, body.position);
      if(d>0.6){ lastPos.copyFrom(body.position); if(typeof window.playStep==="function") try{ window.playStep(0.42); }catch{} }
    } else playAnim("idle");

    stickToGround();
    syncCamera();
    handleGamepad();
    requestAnimationFrame(moveLoop);
  }

  function handleGamepad(){
    const pads=navigator.getGamepads?.();
    if(!pads) return;
    const pad=pads[0]; if(!pad) return;
    const threshold=0.2;

    input.forward = pad.axes[1]<-threshold;
    input.back    = pad.axes[1]>threshold;
    input.left    = pad.axes[0]<-threshold;
    input.right   = pad.axes[0]>threshold;
    input.run     = pad.buttons[0].pressed;

    if(pad.buttons[1].pressed && !lastCrouchPressed){
      isCrouching = !isCrouching;
    }
    lastCrouchPressed=pad.buttons[1].pressed;
  }

  async function start(){
    if(!ensureScene()){ setTimeout(start,100); return; }

    // Wait for Havok physics engine
    const havok = await HavokPhysics();
    if(!scene.getPhysicsEngine()) {
      scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));
    }

    makeBody();
    body.physicsImpostor.sleep(); // prevent jitter
    body.isVisible = false;

    await loadAvatar();
    avatarRoot.isVisible = true;
    avatarRoot.parent = body;

    stickToGround(BABYLON.Vector3.Zero());

    moveLoop();
  }

  window.addEventListener("pp:start", start, { once:true });
  if(window.__PP_ALREADY_STARTED__) start();

})();
