// ghost_rooms_runtime.js v1.0 — binds builder rooms to ghost AI roam targets
(function(){
  "use strict";
  const S = ()=> window.scene || window.SCENE || BABYLON.Engine?.LastCreatedScene;

  // --- geometry helpers ---
  function pointInPolyXZ(pt, poly){
    // Ray-casting in XZ plane
    let c=false, x=pt.x, z=pt.z;
    for (let i=0, j=poly.length-1; i<poly.length; j=i++){
      const pi=poly[i], pj=poly[j];
      const zi=pi.z, zj=pj.z, xi=pi.x, xj=pj.x;
      const inter = ((zi>z) !== (zj>z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi);
      if (inter) c = !c;
    }
    return c;
  }
  function randomPointInPoly(poly, maxTries=40){
    // rejection sampling within bounding box
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    poly.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); });
    for (let i=0;i<maxTries;i++){
      const x = minX + Math.random()*(maxX-minX);
      const z = minZ + Math.random()*(maxZ-minZ);
      const pt = {x,z};
      if (pointInPolyXZ(pt, poly)) return pt;
    }
    // fallback: centroid
    const c = poly.reduce((a,p)=>({x:a.x+p.x, z:a.z+p.z}), {x:0,z:0});
    return { x:c.x/poly.length, z:c.z/poly.length };
  }

  // --- room runtime state ---
  const RT = {
    rooms: [],       // [{id,name,y,polygon:[{x,z}], bounds:{min,max}}]
    current: null,   // active room index
  };

  function chooseInitialRoomNear(pos){
    if (!RT.rooms.length) return null;
    // prefer the room that contains the position; else closest centroid
    const idxContains = RT.rooms.findIndex(r=> pointInPolyXZ({x:pos.x, z:pos.z}, r.polygon));
    if (idxContains>=0) return idxContains;
    let best=-1, bd=Infinity;
    RT.rooms.forEach((r,i)=>{
      const c = r.__centroid || (r.__centroid = r.polygon.reduce((a,p)=>({x:a.x+p.x, z:a.z+p.z}),{x:0,z:0}));
      c.x/=r.polygon.length; c.z/=r.polygon.length;
      const dx=c.x-pos.x, dz=c.z-pos.z, d=dx*dx+dz*dz;
      if (d<bd){ bd=d; best=i; }
    });
    return best>=0? best : 0;
  }

  function provideTargetInsideRoom(){
    // called by ghost AI to pick next roam target; returns BABYLON.Vector3 or null
    if (!RT.rooms.length) return null;
    const s = S(); if (!s) return null;
    const idx = (RT.current ?? 0);
    const r = RT.rooms[idx];
    const p = randomPointInPoly(r.polygon);
    return new BABYLON.Vector3(p.x, r.y, p.z);
  }

  // ---- glue with ghostCtrl ----
  function attachToGhost(){
    if (!window.ghostCtrl || typeof window.ghostCtrl !== 'object') return false;
    // add API for rooms
    if (!ghostCtrl.setRooms){
      ghostCtrl.setRooms = function(roomsArray){
        RT.rooms = Array.isArray(roomsArray) ? roomsArray.slice() : [];
        // pick current room near ghost position (if available)
        try{
          const st = ghostCtrl.getState?.();
          if (st?.pos){
            RT.current = chooseInitialRoomNear({x:st.pos.x, z:st.pos.z});
          } else {
            RT.current = 0;
          }
        }catch{ RT.current = 0; }
      };
      ghostCtrl.setCurrentRoomByName = function(name){
        const idx = RT.rooms.findIndex(r=> r.name===name);
        if (idx>=0) RT.current = idx;
      };
      // allow external systems to request an in-room target
      ghostCtrl.getRoomRoamTarget = function(){
        return provideTargetInsideRoom();
      };
    }

    // patch the AI’s roam target picker if the runtime supports our hook
    // (ghost_movement.js v1.7+ supports this hook name.)
    window.pickRoamTargetOverride = function(){
      const v = provideTargetInsideRoom();
      return v; // null => AI fallback
    };
    return true;
  }

  // boot
  const boot = setInterval(()=>{
    if (attachToGhost()){
      clearInterval(boot);
      // auto-load rooms from a global manifest if present
      const R = window.MAP_MANIFEST?.rooms || window.BUILDER_ROOMS_API?.export?.() || null;
      if (R && Array.isArray(R) && R.length){
        ghostCtrl.setRooms(R);
      }
    }
  }, 120);
})();