/* controls_patch.js — fixes inverted look + strafe without touching your core files */
(function(){
  // Attach only once
  if (window.__ControlsPatched) return; window.__ControlsPatched = true;

  // ---- Look (mouse): UP should look UP (non-inverted), RIGHT turns RIGHT
  window.applyLook = function(lookDelta){
    if(!window.camera) return;
    const sens = 0.0025;
    // yaw (left/right)
    camera.rotation.y += (lookDelta.x || 0) * sens;
    // pitch (up/down) — subtract to remove inversion
    const minPitch = -Math.PI/2 + 0.15;
    const maxPitch =  Math.PI/2 - 0.15;
    const next = (camera.rotation.x || 0) - ((lookDelta.y || 0) * sens * 0.85);
    camera.rotation.x = Math.max(minPitch, Math.min(maxPitch, next));
  };

  // ---- Movement (WASD): W forward, S back, A left, D right (no inversion)
  window.handleMovement = function(input, dt){
    if(!window.camera || !window.scene) return;

    const baseWalk = (window.player?.speedWalk ?? 1.6) * (input.analog||1);
    const speed    = input.running ? (window.player?.speedRun ?? 3.0) : baseWalk;

    // forward on XZ plane
    const fwd = camera.getForwardRay().direction.clone(); fwd.y = 0; fwd.normalize();
    // right vector (non-inverted): Y × FWD
    const right = BABYLON.Vector3.Cross(BABYLON.Axis.Y, fwd).normalize();

    // input.moveVec: z=forward/back, x=strafe
    const desired = fwd.scale(input.moveVec.z).add(right.scale(input.moveVec.x));
    const vert    = input.moveVec.y || 0;
    const wantsFly = vert !== 0;

    const prevGravity = camera.applyGravity;
    if (wantsFly) camera.applyGravity = false;

    let next = camera.position.clone();
    if (desired.lengthSquared() > 0) next = next.add(desired.normalize().scale(speed * dt));
    if (wantsFly) next = next.add(new BABYLON.Vector3(0, vert * speed * dt, 0));

    // simple step-up helper (kept from your rig)
    if (!wantsFly && desired.lengthSquared() > 0) {
      const stepUpMax = (window.player?.stepUpMax ?? 0.45);
      const probe = next.add(new BABYLON.Vector3(0, stepUpMax, 0));
      const downRay = new BABYLON.Ray(probe, new BABYLON.Vector3(0,-1,0), stepUpMax+0.6);
      const hit = scene.pickWithRay(downRay, m=>m && m.isPickable!==false);
      if(hit && hit.pickedPoint){
        const y = hit.pickedPoint.y + 1.7;
        const dy = y - camera.position.y;
        camera.position = (dy<=stepUpMax) ? new BABYLON.Vector3(next.x, y, next.z) : next;
      } else {
        camera.position = next;
      }
    } else {
      camera.position = next;
    }
    camera.applyGravity = prevGravity;
  };
})();
