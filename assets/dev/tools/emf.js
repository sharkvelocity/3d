// Updated tick inside emf.js
function tick(dt){
  EMF.events = EMF.events.filter(ev=>{
    ev.t += dt;
    return ev.t < EMF.decayTime;
  });

  // hunting spike: only within range of the ghost
  if (window.ghost && window.ghost.mode==='hunt'){
    const ghostPos = window.ghost.position.clone();
    let spikeRange = 6.0; // default hunting spike range
    if ((window.ghost.type||'').toLowerCase() === 'raiju'){
      spikeRange = 12.0; // Raiju has bigger range for electronics
    }

    const cam = window.scene?.activeCamera;
    const dist = cam && cam.position ? BABYLON.Vector3.Distance(cam.position, ghostPos) : 999;

    if (dist <= spikeRange){
      if (Math.random() < 0.02){ // 2% chance per tick
        const spikeLevel = 1 + Math.floor(Math.random()*5);
        EMF.trigger(spikeLevel, ghostPos);
      }
    }
  }

  requestAnimationFrame(()=>tick(dt || 0.016));
}
