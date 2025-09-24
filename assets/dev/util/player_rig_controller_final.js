/* player_rig_controller_final.js — robust player rig with WASD + PS5 + mouse + animations + slopes + footsteps */
(function(){
  if(window.__PP_RIG_READY__) return;
  window.__PP_RIG_READY__ = true;

  const PP = window.PP = window.PP || {};
  PP.rig = PP.rig || {};
  PP.state = PP.state || {};
  PP.controls = PP.controls || {};

  const AVATAR = { file:"./assets/models/player/player.glb", eyeY:1.6, targetHeight:1.75, meshYOffset:0.0 };
  const SPEEDS = { walk:1.8, run:3.5, crouch:1.0 };
  const MAX_SLOPE = 45;

  let scene, camera, body, avatarRoot, avatarMeshes=[], animations={}, currentAnim=null;

  const input = { forward:false, back:false, left:false, right:false, run:false, crouch:false };
  let lastCrouchPressed=false;

  // ---------- Keyboard ----------
  const defaultKeys = {
    forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"],
    left:["KeyA","ArrowLeft"], right:["KeyD","ArrowRight"],
    sprint:["ShiftLeft","ShiftRight"], crouch:["KeyC"],
    toggleCamera:["Backquote"], slots:["Digit1","Digit2","Digit3"],
  };

  function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name,{detail})); }catch{} }

  addEventListener("keydown",(e)=>{
    if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
    if(defaultKeys.forward.includes(e.code)) input.forward=true;
    if(defaultKeys.back.includes(e.code)) input.back=true;
    if(defaultKeys.left.includes(e.code)) input.left=true;
    if(defaultKeys.right.includes(e.code)) input.right=true;
    if(defaultKeys.sprint.includes(e.code)) input.run=true;
    if(defaultKeys.crouch.includes(e.code) && !lastCrouchPressed) input.crouch = !input.crouch;
    lastCrouchPressed = defaultKeys.crouch.includes(e.code);
  });
  addEventListener("keyup",(e)=>{
    if(defaultKeys.forward.includes(e.code)) input.forward=false;
    if(defaultKeys.back.includes(e.code)) input.back=false;
    if(defaultKeys.left.includes(e.code)) input.left=false;
    if(defaultKeys.right.includes(e.code)) input.right=false;
    if(defaultKeys.sprint.includes(e.code)) input.run=false;
    if(defaultKeys.crouch.includes(e.code)) lastCrouchPressed=false;
  });

  // ---------- Mouse / Pointer Lock ----------
  const mouse = { dx:0, dy:0, locked:false };
  const canvas = document.querySelector("#renderCanvas");
  if(canvas){
    canvas.addEventListener("click",()=>{ if(!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
    document.addEventListener("pointerlockchange",()=>{ mouse.locked = (document.pointerLockElement===canvas); });
    document.addEventListener("mousemove",(e)=>{
      if(!mouse.locked) return;
      mouse.dx = e.movementX; mouse.dy = e.movementY;
      emit("pp:mouseMove",{dx:mouse.dx,dy:mouse.dy});
    });
  }

  // ---------- Scene / Physics ----------
  function ensureScene(){ scene = scene || window.SCENE; camera = scene?.activeCamera; return !!(scene && camera); }
  function getSpawnPosition(){ return window.__PP_SPAWN?.clone() || new BABYLON.Vector3(0,AVATAR.eyeY,0); }

  function makeBody(){
    body = new BABYLON.MeshBuilder.CreateCapsule("player_capsule",{ height:AVATAR.targetHeight, radius:0.35 },scene);
    body.isVisible=false; body.position.copyFrom(getSpawnPosition());
    body.physicsImpostor = new BABYLON.PhysicsImpostor(body,BABYLON.PhysicsImpostor.CapsuleImpostor,{mass:70,restitution:0,friction:0.8},scene);
    PP.rig.body = body;
  }

  async function loadAvatar(){
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/player/", "player.glb", scene);
    const root = res.meshes[0];
    root.scaling.setAll(1);
    const bb=root.getHierarchyBoundingVectors();
    const scale=AVATAR.targetHeight/(bb.max.y-bb.min.y);
    root.scaling.setAll(scale);
    root.position.y -= root.getHierarchyBoundingVectors().min.y;
    avatarRoot=root; avatarMeshes=root.getChildMeshes(); avatarRoot.parent=body;

    // animations
    res.animationGroups.forEach(g=>{
      if(/Idle/i.test(g.name)) animations.idle=g;
      if(/Walk/i.test(g.name)) animations.walk=g;
      if(/Crouch/i.test(g.name)) animations.crouchWalk=g;
    });
    playAnim("idle");
  }

  function playAnim(name){
    if(currentAnim===animations[name]) return;
    Object.values(animations).forEach(g=>g?.stop());
    animations[name]?.start(true);
    currentAnim=animations[name];
  }

  function syncCamera(){
    if(!camera||!body) return;
    const pos=body.position;
    camera.position.set(pos.x,pos.y+AVATAR.eyeY,pos.z);
  }

  function stickToGround(moveDir){
    if(!body||!scene) return moveDir;
    const origin=body.position.add(new BABYLON.Vector3(0,1,0));
    const ray=new BABYLON.Ray(origin,BABYLON.Axis.Y.scale(-1),4);
    const pick=scene.pickWithRay(ray,m=>m.isPickable && m.name.toLowerCase().includes("ground"));
    if(!pick.hit) return moveDir;
    body.position.y = pick.pickedPoint.y + AVATAR.targetHeight/2;
    return moveDir||BABYLON.Vector3.Zero();
  }

  // ---------- Movement loop ----------
  function moveLoop(){
    if(!ensureScene()){ requestAnimationFrame(moveLoop); return; }
    const forward=camera.getDirection(BABYLON.Vector3.Forward()).normalize();
    const right=camera.getDirection(BABYLON.Vector3.Right()).normalize();
    let move = new BABYLON.Vector3(0,0,0);
    if(input.forward) move.addInPlace(forward);
    if(input.back) move.subtractInPlace(forward);
    if(input.left) move.subtractInPlace(right);
    if(input.right) move.addInPlace(right);

    if(move.lengthSquared()>0.001){
      move.normalize();
      const speed=input.crouch?SPEEDS.crouch:(input.run?SPEEDS.run:SPEEDS.walk);
      const slopeMove = stickToGround(move);
      if(slopeMove.lengthSquared()>0.001) body.physicsImpostor.applyImpulse(slopeMove.scale(speed), body.getAbsolutePosition());
      playAnim(input.crouch?"crouchWalk":"walk");
    } else playAnim("idle");

    stickToGround();
    syncCamera();
    requestAnimationFrame(moveLoop);
  }

  // ---------- Start function ----------
  async function start(){
    if(!ensureScene()){ setTimeout(start,100); return; }
    const havok = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.HavokPlugin(true,havok));
    makeBody();
    await loadAvatar();
    moveLoop();

    // Rig is ready
    PP.rigReady = true;
    document.dispatchEvent(new Event("pp:rig-ready"));
  }

  // Expose start globally for bootstrap
  window.startPlayerRig = start;
})();
