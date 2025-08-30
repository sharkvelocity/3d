// builder_rooms.js v0.9 — draw closed room loops, label them, export to map JSON
// Requires Babylon.js + earcut (already present in your project).
(function(){
  "use strict";
  const S = ()=> window.scene || window.SCENE || BABYLON.Engine?.LastCreatedScene;
  const E = eps=> (typeof eps==='number'? eps : 0.001);

  // ---------- STATE ----------
  const ST = {
    rooms: [],            // [{id,name,y,poly:[{x,z}...], bounds:{min,max}}]
    drawing: false,
    drawY: 0,
    tempPoints: [],       // working [{x,z}]
    tempLines: [],        // preview meshes
    roomCounter: 1,
    ui: null
  };

  // ---------- GEOM UTILS ----------
  function v2(x,z){ return new BABYLON.Vector2(x,z); }
  function v3(x,y,z){ return new BABYLON.Vector3(x,y,z); }

  function pointEq(a,b,eps=0.05){
    return Math.abs(a.x-b.x)<=eps && Math.abs(a.z-b.z)<=eps;
  }

  function polygonBounds(poly){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    poly.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); });
    return { min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ} };
  }

  function centroid(poly){
    // area-weighted centroid for simple polygon (x,z)
    let A=0,cx=0,cz=0, n=poly.length;
    for(let i=0;i<n;i++){
      const p=poly[i], q=poly[(i+1)%n];
      const f = p.x*q.z - q.x*p.z;
      A += f; cx += (p.x+q.x)*f; cz += (p.z+q.z)*f;
    }
    A = A*0.5;
    if (Math.abs(A) < 1e-6){
      // fallback: average
      let ax=0, az=0; poly.forEach(p=>{ax+=p.x; az+=p.z;});
      return {x:ax/poly.length, z:az/poly.length};
    }
    return { x: cx/(6*A), z: cz/(6*A) };
  }

  // ---------- UI ----------
  function ensureUI(){
    if (ST.ui) return;
    const wrap = document.createElement('div');
    wrap.id = "builder-rooms";
    wrap.innerHTML = `
      <div class="br-card">
        <div class="br-title">Rooms</div>
        <div class="br-row">
          <button id="br-start" class="br-btn">Draw Room</button>
          <button id="br-finish" class="br-btn" disabled>Finish</button>
          <button id="br-undo" class="br-btn" disabled>Undo</button>
          <button id="br-cancel" class="br-btn" disabled>Cancel</button>
        </div>
        <div class="br-row">
          <label>Y floor: <input id="br-y" type="number" step="0.1" value="0"></label>
          <label>Grid snap: <input id="br-grid" type="checkbox" checked></label>
          <label>Size: <input id="br-gridSize" type="number" step="0.1" value="0.5" style="width:60px"></label>
        </div>
        <div id="br-list" class="br-list"></div>
      </div>
    `;
    const css = document.createElement('style');
    css.textContent = `
      #builder-rooms{ position:fixed; right:12px; top:12px; z-index:9000; font:12px monospace; color:#adf; }
      #builder-rooms .br-card{ background:rgba(0,0,0,0.65); border:1px solid #066; border-radius:8px; padding:10px; min-width:280px; }
      #builder-rooms .br-title{ font-weight:bold; margin-bottom:6px; color:#9ef; }
      #builder-rooms .br-row{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:4px 0; }
      #builder-rooms .br-btn{ border:1px solid #066; background:#111; color:#bff; padding:6px 8px; border-radius:6px; cursor:pointer; }
      #builder-rooms .br-btn[disabled]{ opacity:0.45; cursor:not-allowed; }
      #builder-rooms .br-list{ max-height:36vh; overflow:auto; margin-top:4px; }
      #builder-rooms .br-item{ padding:4px 6px; border:1px solid #044; border-radius:6px; margin:4px 0; background:rgba(0,0,0,0.35); }
      #builder-rooms .br-name{ color:#cff; font-weight:bold; }
      #builder-rooms input[type="text"]{ background:#020a0f; color:#bff; border:1px solid #044; border-radius:4px; padding:4px 6px; }
      #builder-rooms input[type="number"]{ background:#020a0f; color:#bff; border:1px solid #044; border-radius:4px; padding:4px 6px; }
      #builder-rooms label{ display:flex; align-items:center; gap:4px; }
    `;
    document.body.appendChild(css);
    document.body.appendChild(wrap);
    ST.ui = {
      start: document.getElementById('br-start'),
      finish:document.getElementById('br-finish'),
      undo:  document.getElementById('br-undo'),
      cancel:document.getElementById('br-cancel'),
      y:     document.getElementById('br-y'),
      grid:  document.getElementById('br-grid'),
      gridSz:document.getElementById('br-gridSize'),
      list:  document.getElementById('br-list'),
    };
    wireUI();
  }

  function wireUI(){
    const U = ST.ui;
    U.start.onclick = ()=> beginDraw();
    U.finish.onclick= ()=> tryFinish();
    U.undo.onclick  = ()=> undoPoint();
    U.cancel.onclick= ()=> cancelDraw();
    refreshList();
  }

  function refreshList(){
    const U=ST.ui; if (!U) return;
    U.list.innerHTML = ST.rooms.map(r=>`
      <div class="br-item">
        <div class="br-name">${r.name}</div>
        <div>Y:${r.y.toFixed(2)} | Points:${r.poly.length}</div>
      </div>
    `).join('');
  }

  // ---------- DRAWING ----------
  function groundPick(x,y){
    const s=S(); if (!s) return null;
    const cam = s.activeCamera;
    const ray = s.createPickingRay(x,y, BABYLON.Matrix.Identity(), cam);
    // intersect with plane Y = ST.drawY
    const n = new BABYLON.Plane(0,1,0, -ST.drawY);
    const dist = ray.intersectsPlane(n);
    if (dist === null) return null;
    return ray.origin.add(ray.direction.scale(dist));
  }

  function snapXZ(p){
    const gridOn = ST.ui?.grid?.checked;
    const step   = parseFloat(ST.ui?.gridSz?.value)||0.5;
    if (!gridOn) return {x:p.x, z:p.z};
    return { x: Math.round(p.x/step)*step, z: Math.round(p.z/step)*step };
  }

  function drawPreviewLine(a,b){
    const s=S(); if (!s) return;
    const y=ST.drawY;
    const line = BABYLON.MeshBuilder.CreateLines("room_preview", { points:[v3(a.x,y,a.z), v3(b.x,y,b.z)] }, s);
    line.color = new BABYLON.Color3(0,1,1);
    ST.tempLines.push(line);
  }
  function clearPreview(){
    ST.tempLines.forEach(l=>{ try{ l.dispose(); }catch{} });
    ST.tempLines.length=0;
  }

  function beginDraw(){
    ensureUI();
    ST.drawY = parseFloat(ST.ui.y.value)||0;
    ST.drawing = true;
    ST.tempPoints.length=0;
    clearPreview();
    // pointer handling (click to add, dblclick to close)
    const canvas = S().getEngine().getRenderingCanvas();
    ST._onDown = (ev)=>{
      const p = groundPick(ev.clientX, ev.clientY);
      if (!p) return;
      const q = snapXZ({x:p.x, z:p.z});
      const n = ST.tempPoints.length;
      if (n>0){ drawPreviewLine(ST.tempPoints[n-1], q); }
      ST.tempPoints.push(q);
      // enable finish/undo/cancel
      ST.ui.finish.disabled = ST.tempPoints.length<3;
      ST.ui.undo.disabled   = ST.tempPoints.length===0;
      ST.ui.cancel.disabled = false;
    };
    ST._onDbl = ()=>{
      tryFinish();
    };
    canvas.addEventListener('pointerdown', ST._onDown);
    canvas.addEventListener('dblclick', ST._onDbl);
    ST.ui.start.disabled = true;
  }

  function undoPoint(){
    const n=ST.tempPoints.length;
    if (!n) return;
    ST.tempPoints.pop();
    const line = ST.tempLines.pop(); try{line.dispose();}catch{}
    ST.ui.finish.disabled = ST.tempPoints.length<3;
    ST.ui.undo.disabled   = ST.tempPoints.length===0;
  }

  function cancelDraw(){
    const canvas = S().getEngine().getRenderingCanvas();
    if (ST._onDown) canvas.removeEventListener('pointerdown', ST._onDown);
    if (ST._onDbl)  canvas.removeEventListener('dblclick', ST._onDbl);
    ST._onDown = ST._onDbl = null;
    ST.drawing=false;
    ST.ui.start.disabled=false;
    ST.ui.finish.disabled=true;
    ST.ui.undo.disabled=true;
    ST.ui.cancel.disabled=true;
    ST.tempPoints.length=0;
    clearPreview();
  }

  function tryFinish(){
    if (ST.tempPoints.length<3) return;
    // close loop if near start
    const first = ST.tempPoints[0], last = ST.tempPoints[ST.tempPoints.length-1];
    if (!pointEq(first,last, 0.25)){ // auto-close
      ST.tempPoints.push({x:first.x, z:first.z});
      drawPreviewLine(last, first);
    }
    // create room
    const poly = dedupeColinear(ST.tempPoints);
    if (poly.length<3){ cancelDraw(); return; }
    // label prompt
    const name = prompt("Room name:", "Room "+ST.roomCounter) || ("Room "+ST.roomCounter);
    const id   = "room_"+(ST.roomCounter++);
    const y    = ST.drawY;

    const bounds = polygonBounds(poly);
    ST.rooms.push({ id, name, y, poly, bounds });
    placeLabel3D(name, poly, y);
    makeFloorVisual(poly, y);
    refreshList();
    cancelDraw();
  }

  function dedupeColinear(poly){
    // Remove repeated last == first; remove colinear middle points
    let pts = poly.slice();
    if (pts.length>2 && pointEq(pts[0], pts[pts.length-1], 0.0001)) pts.pop();
    function colinear(a,b,c,eps=1e-6){
      const abx=b.x-a.x, abz=b.z-a.z, bcx=c.x-b.x, bcz=c.z-b.z;
      return Math.abs(abx*bcz - abz*bcx) < eps;
    }
    const out=[];
    for (let i=0;i<pts.length;i++){
      const a = pts[(i-1+pts.length)%pts.length];
      const b = pts[i];
      const c = pts[(i+1)%pts.length];
      if (!colinear(a,b,c)) out.push(b);
    }
    return out;
  }

  function placeLabel3D(text, poly, y){
    const s=S();
    const c = centroid(poly);
    const plane = BABYLON.MeshBuilder.CreatePlane("room_label_"+text,{ size: 1.6 }, s);
    plane.position = v3(c.x, y+2.0, c.z);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    const dt = new BABYLON.DynamicTexture("dt_"+text, {width:256,height:64}, s, false);
    const ctx = dt.getContext();
    ctx.clearRect(0,0,256,64);
    ctx.font = "bold 28px monospace";
    ctx.fillStyle = "#bff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);
    dt.update();
    const mat = new BABYLON.StandardMaterial("room_label_mat_"+text, s);
    mat.emissiveTexture = dt;
    mat.disableLighting = true;
    plane.material = mat;
    plane.metadata = { isRoomLabel:true };
  }

  function makeFloorVisual(poly, y){
    // purely visual (thin, semi-transparent) so you see the room footprint in builder
    const s=S();
    const verts = poly.map(p=> v2(p.x,p.z));
    const mesh = BABYLON.MeshBuilder.CreatePolygon("room_floor_vis", { shape: verts, depth: 0.05, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s);
    mesh.position.y = y + 0.03;
    mesh.convertToFlatShadedMesh();
    const mat = new BABYLON.StandardMaterial("room_floor_mat", s);
    mat.diffuseColor  = new BABYLON.Color3(0.1, 0.45, 0.55);
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.12, 0.16);
    mat.alpha = 0.25;
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.metadata = { isRoomVis:true };
  }

  // ---------- EXPORT API ----------
  function exportRooms(){
    // Return a JSON-ready description for your map manifest
    return ST.rooms.map(r=>({
      id: r.id,
      name: r.name,
      y: r.y,
      polygon: r.poly.map(p=>({x:p.x, z:p.z})),
      bounds: r.bounds
    }));
  }

  // Register with your builder's save system if present
  (function tryRegister(){
    if (window.BUILDER && typeof BUILDER.registerExporter === 'function'){
      BUILDER.registerExporter('rooms', exportRooms);
    }
  })();

  // Also expose a helper so your map.js can read it at runtime (if you open builder output directly)
  window.BUILDER_ROOMS_API = {
    addFromPolygon(name, y, polyXZ){
      const id="room_"+(ST.roomCounter++);
      const bounds = polygonBounds(polyXZ);
      ST.rooms.push({ id, name, y, poly: polyXZ.slice(), bounds });
      placeLabel3D(name, polyXZ, y);
      makeFloorVisual(polyXZ, y);
      refreshList();
      return id;
    },
    export: exportRooms,
    list: ()=> ST.rooms.slice()
  };

  // Boot UI
  const boot = setInterval(()=>{ if (S()) { clearInterval(boot); ensureUI(); }}, 80);
})();