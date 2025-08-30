// builder_rooms.js v1.3 — Rooms + Lights + Doors + Switches (auto-linked)
// - Draw closed room loops, name them, auto-create an "illuminator" (PointLight)
// - Add door openings on room edges; each door auto-spawns a switch inside the room
// - Clicking the switch toggles that room's lights (in the builder for preview)
// - Exports rooms with {polygon,y}, plus per-room {lights[], doors[], switches[]} to map manifest
//
// Requires: Babylon.js (+ earcut already in your project)
(function(){
  "use strict";
  const S = ()=> window.scene || window.SCENE || BABYLON.Engine?.LastCreatedScene;
  const v2 = (x,z)=> new BABYLON.Vector2(x,z);
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  // ---------- STATE ----------
  const ST = {
    rooms: [],     // [{id,name,y,poly:[{x,z}...], bounds, lights:[], doors:[], switches:[], lightOn:false}]
    drawing:false, tempPoints:[], tempLines:[], drawY:0,
    roomCounter:1,
    ui:null,
    selectedRoom:-1,
    mode:'room',   // 'room' | 'door'
    doorWidth: 1.0
  };

  // ---------- GEOMETRY HELPERS ----------
  function pointEq(a,b,eps=0.05){ return Math.abs(a.x-b.x)<=eps && Math.abs(a.z-b.z)<=eps; }
  function centroid(poly){
    let A=0,cx=0,cz=0, n=poly.length;
    for (let i=0;i<n;i++){ const p=poly[i], q=poly[(i+1)%n]; const f=p.x*q.z - q.x*p.z; A+=f; cx+=(p.x+q.x)*f; cz+=(p.z+q.z)*f; }
    A*=0.5;
    if (Math.abs(A)<1e-6){ const a=poly.reduce((k,p)=>({x:k.x+p.x,z:k.z+p.z}),{x:0,z:0}); return {x:a.x/poly.length, z:a.z/poly.length}; }
    return {x:cx/(6*A), z:cz/(6*A)};
  }
  function polygonBounds(poly){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    poly.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); });
    return { min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ} };
  }
  function dedupeColinear(poly){
    let pts=poly.slice();
    if (pts.length>2 && pointEq(pts[0], pts[pts.length-1], 0.0001)) pts.pop();
    function colinear(a,b,c,eps=1e-6){
      const abx=b.x-a.x, abz=b.z-a.z, bcx=c.x-b.x, bcz=c.z-b.z;
      return Math.abs(abx*bcz - abz*bcx) < eps;
    }
    const out=[];
    for (let i=0;i<pts.length;i++){
      const a=pts[(i-1+pts.length)%pts.length], b=pts[i], c=pts[(i+1)%pts.length];
      if (!colinear(a,b,c)) out.push(b);
    }
    return out;
  }
  // Closest point on segment AB to point P (XZ plane)
  function closestPointOnSegXZ(A,B,P){
    const ax=A.x, az=A.z, bx=B.x, bz=B.z, px=P.x, pz=P.z;
    const abx=bx-ax, abz=bz-az;
    const apx=px-ax, apz=pz-az;
    const ab2=abx*abx+abz*abz || 1e-9;
    let t=(apx*abx+apz*abz)/ab2; t=Math.max(0,Math.min(1,t));
    return { x: ax + abx*t, z: az + abz*t, t };
  }

  // ---------- UI ----------
  function ensureUI(){
    if (ST.ui) return;
    const wrap = document.createElement('div');
    wrap.id = "builder-rooms";
    wrap.innerHTML = `
      <div class="br-card">
        <div class="br-title">Rooms / Doors</div>
        <div class="br-row">
          <button id="br-start" class="br-btn">Draw Room</button>
          <button id="br-finish" class="br-btn" disabled>Finish</button>
          <button id="br-undo" class="br-btn" disabled>Undo</button>
          <button id="br-cancel" class="br-btn" disabled>Cancel</button>
        </div>
        <div class="br-row">
          <label>Y floor <input id="br-y" type="number" step="0.1" value="0" style="width:80px"></label>
          <label>Snap <input id="br-grid" type="checkbox" checked></label>
          <label>Step <input id="br-gridSize" type="number" step="0.1" value="0.5" style="width:60px"></label>
        </div>
        <div style="border-top:1px solid #044; margin:6px 0;"></div>
        <div class="br-row">
          <span>Selected:</span><span id="br-selected">—</span>
        </div>
        <div class="br-row">
          <button id="br-mode-room" class="br-btn br-on">Room Mode</button>
          <button id="br-mode-door" class="br-btn">Door Mode</button>
          <label>Door width <input id="br-doorw" type="number" step="0.1" value="1.0" style="width:66px"></label>
        </div>
        <div id="br-list" class="br-list"></div>
      </div>
    `;
    const css = document.createElement('style');
    css.textContent = `
      #builder-rooms{ position:fixed; right:12px; top:12px; z-index:9000; font:12px monospace; color:#adf; }
      #builder-rooms .br-card{ background:rgba(0,0,0,0.65); border:1px solid #066; border-radius:8px; padding:10px; min-width:300px; }
      #builder-rooms .br-title{ font-weight:bold; margin-bottom:6px; color:#9ef; }
      #builder-rooms .br-row{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:4px 0; }
      #builder-rooms .br-btn{ border:1px solid #066; background:#111; color:#bff; padding:6px 8px; border-radius:6px; cursor:pointer; }
      #builder-rooms .br-btn[disabled]{ opacity:0.45; cursor:not-allowed; }
      #builder-rooms .br-on{ outline:2px solid #0af; }
      #builder-rooms .br-list{ max-height:36vh; overflow:auto; margin-top:4px; }
      #builder-rooms .br-item{ padding:6px; border:1px solid #044; border-radius:6px; margin:4px 0; background:rgba(0,0,0,0.35); }
      #builder-rooms .br-name{ color:#cff; font-weight:bold; cursor:pointer; }
      #builder-rooms input{ background:#020a0f; color:#bff; border:1px solid #044; border-radius:4px; padding:4px 6px; }
    `;
    document.head.appendChild(css);
    document.body.appendChild(wrap);
    ST.ui = {
      start: $('#br-start'), finish:$('#br-finish'), undo:$('#br-undo'), cancel:$('#br-cancel'),
      y:$('#br-y'), grid:$('#br-grid'), gridSz:$('#br-gridSize'),
      list:$('#br-list'), sel:$('#br-selected'),
      modeRoom:$('#br-mode-room'), modeDoor:$('#br-mode-door'),
      doorW:$('#br-doorw')
    };
    wireUI();
  }
  function $(sel, root=document){ return root.querySelector(sel); }

  function wireUI(){
    const U=ST.ui;
    U.start.onclick=beginDraw; U.finish.onclick=tryFinish; U.undo.onclick=undoPoint; U.cancel.onclick=cancelDraw;
    U.modeRoom.onclick=()=>{ ST.mode='room'; U.modeRoom.classList.add('br-on'); U.modeDoor.classList.remove('br-on'); };
    U.modeDoor.onclick=()=>{ ST.mode='door'; U.modeDoor.classList.add('br-on'); U.modeRoom.classList.remove('br-on'); };
    U.doorW.onchange=()=>{ ST.doorWidth = Math.max(0.4, parseFloat(U.doorW.value)||1.0); };
    refreshList();
    // pointer for DOOR mode
    const canvas = S().getEngine().getRenderingCanvas();
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
  }

  function refreshList(){
    const U=ST.ui; if (!U) return;
    U.list.innerHTML = ST.rooms.map((r,i)=>`
      <div class="br-item" data-idx="${i}">
        <div class="br-name">${i===ST.selectedRoom?'▶ ':''}${r.name}</div>
        <div>Y:${r.y.toFixed(2)} | Pts:${r.poly.length} | Doors:${r.doors.length} | Switches:${r.switches.length}</div>
        <div>Lights:${r.lights.length} | Light ${r.lightOn?'ON':'OFF'}</div>
      </div>
    `).join('');
    U.sel.textContent = ST.selectedRoom>=0 ? ST.rooms[ST.selectedRoom].name : '—';
    // clickable selection
    U.list.querySelectorAll('.br-item').forEach(div=>{
      div.onclick = ()=>{
        ST.selectedRoom = parseInt(div.getAttribute('data-idx'),10);
        refreshList();
        highlightRoom(ST.selectedRoom);
      };
    });
  }

  // ---------- DRAW ROOMS ----------
  function groundPick(x,y){
    const s=S(); const cam=s.activeCamera;
    const ray = s.createPickingRay(x,y, BABYLON.Matrix.Identity(), cam);
    const plane = new BABYLON.Plane(0,1,0, -ST.drawY);
    const dist = ray.intersectsPlane(plane);
    if (dist===null) return null;
    return ray.origin.add(ray.direction.scale(dist));
  }
  function snapXZ(p){
    const gridOn = ST.ui?.grid?.checked;
    const step   = parseFloat(ST.ui?.gridSz?.value)||0.5;
    if (!gridOn) return {x:p.x, z:p.z};
    return { x: Math.round(p.x/step)*step, z: Math.round(p.z/step)*step };
  }
  function drawPreviewLine(a,b){
    const s=S(); const y=ST.drawY;
    const line = BABYLON.MeshBuilder.CreateLines("room_preview", { points:[v3(a.x,y,a.z), v3(b.x,y,b.z)] }, s);
    line.color = new BABYLON.Color3(0,1,1);
    ST.tempLines.push(line);
  }
  function clearPreview(){ ST.tempLines.forEach(l=>{ try{l.dispose();}catch{} }); ST.tempLines.length=0; }

  function beginDraw(){
    ST.drawY = parseFloat(ST.ui.y.value)||0;
    ST.drawing=true; ST.tempPoints.length=0; clearPreview();
    const canvas=S().getEngine().getRenderingCanvas();
    ST._onDown = (ev)=>{
      const p=groundPick(ev.clientX,ev.clientY); if (!p) return;
      const q=snapXZ({x:p.x, z:p.z}); const n=ST.tempPoints.length;
      if (n>0) drawPreviewLine(ST.tempPoints[n-1], q);
      ST.tempPoints.push(q);
      ST.ui.finish.disabled = ST.tempPoints.length<3;
      ST.ui.undo.disabled   = ST.tempPoints.length===0;
      ST.ui.cancel.disabled = false;
    };
    ST._onDbl = ()=> tryFinish();
    canvas.addEventListener('pointerdown', ST._onDown);
    canvas.addEventListener('dblclick',   ST._onDbl);
    ST.ui.start.disabled=true;
  }
  function undoPoint(){
    const n=ST.tempPoints.length; if (!n) return;
    ST.tempPoints.pop(); const l=ST.tempLines.pop(); try{l?.dispose();}catch{}
    ST.ui.finish.disabled = ST.tempPoints.length<3;
    ST.ui.undo.disabled   = ST.tempPoints.length===0;
  }
  function cancelDraw(){
    const canvas=S().getEngine().getRenderingCanvas();
    if (ST._onDown) canvas.removeEventListener('pointerdown', ST._onDown);
    if (ST._onDbl)  canvas.removeEventListener('dblclick', ST._onDbl);
    ST._onDown=ST._onDbl=null; ST.drawing=false;
    ST.ui.start.disabled=false; ST.ui.finish.disabled=true; ST.ui.undo.disabled=true; ST.ui.cancel.disabled=true;
    ST.tempPoints.length=0; clearPreview();
  }

  function tryFinish(){
    if (ST.tempPoints.length<3) return;
    const first=ST.tempPoints[0], last=ST.tempPoints[ST.tempPoints.length-1];
    if (!pointEq(first,last,0.25)){ ST.tempPoints.push({x:first.x,z:first.z}); drawPreviewLine(last, first); }
    const poly = dedupeColinear(ST.tempPoints);
    if (poly.length<3){ cancelDraw(); return; }

    // Name
    const name = prompt("Room name:", "Room "+ST.roomCounter) || ("Room "+ST.roomCounter);
    const id = "room_"+(ST.roomCounter++);
    const y  = ST.drawY;
    const bounds = polygonBounds(poly);

    // Create room
    const room = { id, name, y, poly, bounds, lights:[], doors:[], switches:[], lightOn:false };
    ST.rooms.push(room);
    ST.selectedRoom = ST.rooms.length-1;

    // Visual label & footprint
    placeLabel3D(name, poly, y);
    makeFloorVisual(poly, y);

    // Auto-create illuminator (light) for this room
    createIlluminatorForRoom(room);

    refreshList(); cancelDraw();
  }

  function placeLabel3D(text, poly, y){
    const s=S(); const c=centroid(poly);
    const plane = BABYLON.MeshBuilder.CreatePlane("room_label_"+text,{ size: 1.8 }, s);
    plane.position = v3(c.x, y+2.0, c.z);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    const dt = new BABYLON.DynamicTexture("dt_"+text, {width:256,height:64}, s, false);
    const ctx = dt.getContext(); ctx.clearRect(0,0,256,64);
    ctx.font = "bold 28px monospace"; ctx.fillStyle = "#bff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32); dt.update();
    const mat = new BABYLON.StandardMaterial("room_label_mat_"+text, s);
    mat.emissiveTexture = dt; mat.disableLighting = true; plane.material = mat;
    plane.metadata = { isRoomLabel:true, roomName:text };
  }
  function makeFloorVisual(poly, y){
    const s=S();
    const verts = poly.map(p=> v2(p.x,p.z));
    const mesh = BABYLON.MeshBuilder.CreatePolygon("room_floor_vis", { shape: verts, depth: 0.05, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s);
    mesh.position.y = y + 0.03; mesh.convertToFlatShadedMesh();
    const mat = new BABYLON.StandardMaterial("room_floor_mat", s);
    mat.diffuseColor  = new BABYLON.Color3(0.1, 0.45, 0.55);
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.12, 0.16);
    mat.alpha = 0.25; mat.backFaceCulling = false;
    mesh.material = mat; mesh.isPickable = false; mesh.metadata = { isRoomVis:true };
  }

  // ---------- LIGHTS / SWITCHES ----------
  function createIlluminatorForRoom(room){
    const s=S(); const c = centroid(room.poly);
    const light = new BABYLON.PointLight("Light_"+room.id, v3(c.x, room.y+2.4, c.z), s);
    light.intensity = 0.0;                    // start OFF; will be tied to switch
    light.range = 14;
    light.falloffType = BABYLON.Light.FALLOFF_STANDARD;
    light.metadata = { roomId: room.id, isRoomLight:true };

    // visual gizmo so you can see it in builder
    const bulb = BABYLON.MeshBuilder.CreateSphere("LightGizmo_"+room.id, {diameter:0.18, segments:8}, s);
    bulb.position.copyFrom(light.position);
    const m = new BABYLON.StandardMaterial("LightGizmoMat_"+room.id, s);
    m.emissiveColor = new BABYLON.Color3(1,1,0.7); m.alpha = 0.85; bulb.material = m;
    bulb.metadata = { isLightGizmo:true, roomId:room.id };
    bulb.isPickable = false;

    room.lights.push({
      id: light.name,
      kind: "Point",
      pos: { x:light.position.x, y:light.position.y, z:light.position.z },
      intensity: 1.1,
      range: light.range
    });
  }

  function toggleRoomLights(roomIdx, on){
    const s=S(); const room = ST.rooms[roomIdx]; if (!room) return;
    const want = (on!==undefined) ? !!on : !room.lightOn;
    room.lightOn = want;

    // apply to live lights (by metadata)
    (s.lights||[]).forEach(L=>{
      if (L?.metadata?.isRoomLight && L.metadata.roomId===room.id){
        L.intensity = want ? (room.lights[0]?.intensity || 1.0) : 0.0;
      }
    });
    // gizmo tint
    (s.meshes||[]).forEach(M=>{
      if (M?.metadata?.isLightGizmo && M.metadata.roomId===room.id){
        try { M.material.emissiveColor = want ? new BABYLON.Color3(1,1,0.7) : new BABYLON.Color3(0.3,0.3,0.2); } catch {}
      }
    });
    refreshList();
  }

  function makeSwitchAt(roomIdx, atPosXZ, edgeDirXZ, inwardNormalXZ){
    const room = ST.rooms[roomIdx]; const s=S(); if (!room) return;
    const width = 0.08, height=0.14, depth=0.02;
    const pos = v3(
      atPosXZ.x + inwardNormalXZ.x*0.25,
      room.y + 1.2,
      atPosXZ.z + inwardNormalXZ.z*0.25
    );
    const sw = BABYLON.MeshBuilder.CreateBox("Switch_"+room.id+"_"+(room.switches.length+1), { width, height, depth }, s);
    sw.position = pos;
    // orient the switch to face inward normal
    const yaw = Math.atan2(inwardNormalXZ.x, inwardNormalXZ.z);
    sw.rotationQuaternion = null; sw.rotation.y = yaw;

    const mat = new BABYLON.StandardMaterial("SwitchMat_"+sw.name, s);
    mat.diffuseColor = new BABYLON.Color3(0.8,0.8,0.8);
    mat.emissiveColor= new BABYLON.Color3(0.05,0.05,0.05);
    sw.material = mat;

    sw.metadata = { isSwitch:true, roomId: room.id };

    // click to toggle room light in builder
    sw.actionManager = new BABYLON.ActionManager(s);
    sw.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, ()=>{
      toggleRoomLights(roomIdx);
    }));

    // record in manifest
    room.switches.push({
      id: sw.name,
      pos: { x: sw.position.x, y: sw.position.y, z: sw.position.z },
      roomId: room.id
    });
  }

  // ---------- DOOR PLACER ----------
  function onCanvasPointerDown(ev){
    if (ST.mode!=='door') return;
    if (ST.selectedRoom<0) return;
    const s=S(); const p3 = groundPick(ev.clientX, ev.clientY); if (!p3) return;
    const p = {x:p3.x, z:p3.z};
    const R = ST.rooms[ST.selectedRoom]; const poly = R.poly; const n=poly.length;
    if (n<2) return;

    // pick nearest edge
    let best={ i:-1, d: Infinity, proj:null };
    for (let i=0;i<n;i++){
      const a=poly[i], b=poly[(i+1)%n];
      const proj = closestPointOnSegXZ(a,b,p);
      const d = Math.hypot(p.x - proj.x, p.z - proj.z);
      if (d < best.d){ best = {i, d, proj}; }
    }
    if (best.i<0) return;
    const a=poly[best.i], b=poly[(best.i+1)%n];
    const center = { x: best.proj.x, z: best.proj.z };
    const dir = { x: b.x-a.x, z: b.z-a.z };
    const len = Math.hypot(dir.x, dir.z) || 1e-9;
    const ux = dir.x/len, uz = dir.z/len; // unit along edge

    const half = Math.min(ST.doorWidth*0.5, len*0.49);
    const p1 = { x: center.x - ux*half, z: center.z - uz*half };
    const p2 = { x: center.x + ux*half, z: center.z + uz*half };

    // inward normal (toward centroid)
    const c = centroid(poly);
    const right = { x: uz, z: -ux }; // rotate +90°
    const toC  = { x: c.x - center.x, z: c.z - center.z };
    const inward = (right.x*toC.x + right.z*toC.z) >= 0 ? right : { x: -right.x, z: -right.z };

    // draw a thin marker for door opening
    const line = BABYLON.MeshBuilder.CreateLines("door_"+R.id+"_"+(R.doors.length+1), {
      points: [ v3(p1.x,R.y,p1.z), v3(p2.x,R.y,p2.z) ]
    }, s);
    line.color = new BABYLON.Color3(1,0.6,0.2);
    line.metadata = { isDoor:true, roomId:R.id };

    // register door
    R.doors.push({
      id: line.name,
      edgeIndex: best.i,
      width: ST.doorWidth,
      center: { x:center.x, z:center.z },
      p1, p2
    });

    // auto-create a SWITCH facing inward, linked to the room illuminator(s)
    makeSwitchAt(ST.selectedRoom, center, {x:ux,z:uz}, inward);

    refreshList();
  }

  function highlightRoom(idx){
    // simple pulse on label
    const s=S(); const r=ST.rooms[idx]; if (!r) return;
    const label = s.meshes.find(m=> m.metadata?.isRoomLabel && m.metadata.roomName===r.name);
    if (!label) return;
    let t=0, id=setInterval(()=>{
      t+=0.08; const a = 0.75 + 0.25*Math.sin(t*6);
      try { label.material.emissiveColor = new BABYLON.Color3(a,a,1); } catch {}
    }, 50);
    setTimeout(()=> clearInterval(id), 600);
  }

  // ---------- EXPORT ----------
  function exportRooms(){
    // Return JSON-ready manifest
    return ST.rooms.map(r=>({
      id: r.id,
      name: r.name,
      y: r.y,
      polygon: r.poly.map(p=>({x:p.x, z:p.z})),
      bounds: r.bounds,
      lights: r.lights.slice(),
      switches: r.switches.slice(),
      doors: r.doors.slice(),
      lightOn: !!r.lightOn
    }));
  }

  // Register with a global builder save system if present
  (function tryRegister(){
    if (window.BUILDER && typeof BUILDER.registerExporter === 'function'){
      BUILDER.registerExporter('rooms', exportRooms);
    }
  })();

  // Also expose directly
  window.BUILDER_ROOMS_API = {
    export: exportRooms,
    list: ()=> ST.rooms.slice(),
    toggleLight(nameOrIdx, on){
      const idx = (typeof nameOrIdx==='number') ? nameOrIdx : ST.rooms.findIndex(r=> r.name===nameOrIdx || r.id===nameOrIdx);
      if (idx>=0) toggleRoomLights(idx, on);
    }
  };

  // ---------- BOOT ----------
  function boot(){ if (!S()) return setTimeout(boot, 100); ensureUI(); }
  boot();
})();