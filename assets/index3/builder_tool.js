// ./assets/index3/builder_tool.js — v1.0
// All-in-one, Sims-style map builder for Babylon.js
// • Top-down builder mode (orthographic) with grid + snapping
// • Pick/place, select/drag/rotate/delete, copy/undo/redo
// • Draw Room (click-drag) => floor + four walls (ghost-blockers)
// • Draw Wall (click-drag), Draw Floor (click-drag)
// • Stairs tool (straight run), Basement support (negative floors)
// • Paint tool with Babylon materials (swatches)
// • Save/Load JSON; export ghost-compatible {rooms, barriers}
// Notes:
// - Requires window.scene (Babylon scene) and a working canvas (renderCanvas).
// - Plays nice with your existing runtime; doesn’t auto-open.
// - Toggle: Alt+B (or click the “Builder” pill).

(function(){
  "use strict";
  if (window.Builder) return; // guard

  // ---------- Shortcuts ----------
  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const ENGINE= ()=> window.engine || SCENE()?.getEngine?.();
  const CAM   = ()=> SCENE()?.activeCamera;
  const v3    = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const mid   = (a,b)=> a.add(b).scale(0.5);
  const lenXZ = (a,b)=> Math.sqrt((a.x-b.x)**2 + (a.z-b.z)**2);
  const toast = (m)=> (window.toast? window.toast(m,1200) : console.log('[Builder]', m));
  const byId  = (id)=> document.getElementById(id);

  // ---------- State ----------
  const ST = {
    enabled: false,
    ui: null,
    topCam: null,
    prevCam: null,
    grid: null,
    gridSize: 0.5,
    snap: true,
    floorIndex: 0,          // 0 = ground, 1 = second floor, -1 = basement
    floorHeight: 3.0,
    currentY: 0,            // Y position for created geometry (derived from floorIndex*floorHeight)
    mode: 'select',         // 'select'|'place'|'room'|'wall'|'floor'|'stairs'|'paint'
    placing: { preset:null, rotationY:0, preview:null },
    selection: { mesh:null, start:null, dragStart:null },
    draw: { start:null, temp:null }, // for room/wall/floor drag
    stairs: { width:1.0, stepRise:0.2, steps:10, tread:0.35 },
    mats: {},
    ghostBarrierColor: new BABYLON.Color3(0.1,0.9,1.0),
    undo: [], redo: [],
    worldGridY: 0,
    overlay: null,
  };

  // ---------- Utilities ----------
  function withOutline(mesh, on){
    if (!mesh) return;
    mesh.renderOutline = !!on;
    mesh.outlineColor = mesh.outlineColor || new BABYLON.Color3(0.2,1,1);
    mesh.outlineWidth = 0.06;
  }
  function snapVal(v){ return ST.snap ? Math.round(v/ST.gridSize)*ST.gridSize : v; }
  function snapVecXZ(p){ return v3(snapVal(p.x), p.y, snapVal(p.z)); }
  function pickXZ(evt){
    const s = SCENE(); if (!s) return null;
    const ray = s.createPickingRay(evt.offsetX, evt.offsetY, null, s.activeCamera);
    // Intersect a horizontal plane at currentY
    const t = (ST.currentY - ray.origin.y) / ray.direction.y;
    if (!isFinite(t)) return null;
    const point = ray.origin.add(ray.direction.scale(t));
    return point;
  }
  function setFloorIndex(idx){
    ST.floorIndex = idx|0;
    ST.currentY = ST.floorIndex * ST.floorHeight;
    if (ST.grid) ST.grid.position.y = ST.currentY - 0.001;
    byId('bld-floor-index').value = ST.floorIndex;
    byId('bld-floor-y').textContent = ST.currentY.toFixed(2);
  }
  function makeMat(name, color, emissive){
    const s = SCENE(); if (!s) return null;
    const m = new BABYLON.StandardMaterial('BMat_'+name, s);
    m.diffuseColor = color.clone();
    if (emissive) m.emissiveColor = emissive.clone();
    m.specularColor = new BABYLON.Color3(0.1,0.1,0.1);
    return m;
  }
  function ensureMaterials(){
    if (Object.keys(ST.mats).length) return;
    ST.mats.concrete = makeMat('concrete', new BABYLON.Color3(0.6,0.6,0.65));
    ST.mats.wood     = makeMat('wood',     new BABYLON.Color3(0.55,0.42,0.2));
    ST.mats.tile     = makeMat('tile',     new BABYLON.Color3(0.85,0.85,0.88));
    ST.mats.wall     = makeMat('wall',     new BABYLON.Color3(0.85,0.88,0.92));
    ST.mats.accent   = makeMat('accent',   new BABYLON.Color3(0.7,0.2,0.2), new BABYLON.Color3(0.1,0,0));
    ST.mats.blocker  = makeMat('blocker',  ST.ghostBarrierColor);
  }

  // ---------- Camera & Grid ----------
  function makeTopCamera(){
    const s = SCENE(); if (!s) return null;
    const c = new BABYLON.ArcRotateCamera('BuilderTopCam', Math.PI/2, 0, 30, v3(0, ST.currentY, 0), s);
    c.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    const w = s.getEngine().getRenderWidth();
    const h = s.getEngine().getRenderHeight();
    const ortho = 20; // half-size
    c.orthoLeft   = -ortho * (w/h);
    c.orthoRight  =  ortho * (w/h);
    c.orthoTop    =  ortho;
    c.orthoBottom = -ortho;
    c.panningSensibility = 30;
    c.wheelPrecision = 5;
    c.attachControl(byId('renderCanvas'), true);
    return c;
  }
  function createGrid(){
    const s = SCENE(); if (!s) return null;
    const size = 200;
    const g = BABYLON.MeshBuilder.CreateGround('BuilderGrid', {width:size, height:size}, s);
    g.position.y = ST.currentY - 0.001;
    g.isPickable = false;
    // Lightweight grid material
    const mat = new BABYLON.StandardMaterial('BuilderGridMat', s);
    mat.diffuseColor = new BABYLON.Color3(0,0,0);
    mat.emissiveColor= new BABYLON.Color3(0.05,0.1,0.1);
    mat.specularColor= new BABYLON.Color3(0,0,0);
    mat.alpha = 0.9;
    g.material = mat;

    // Grid lines using DynamicTexture
    const tex = new BABYLON.DynamicTexture('BuilderGridTex', {width:1024, height:1024}, s, false);
    const ctx = tex.getContext();
    ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fillRect(0,0,1024,1024);
    const step = Math.max(2, Math.round( ST.gridSize * 20 ));
    for (let x=0; x<=1024; x+=step){
      ctx.fillStyle = (x%(step*5)===0) ? 'rgba(0,255,255,0.25)' : 'rgba(0,255,255,0.12)';
      ctx.fillRect(x, 0, 1, 1024);
      ctx.fillRect(0, x, 1024, 1);
    }
    tex.update();
    mat.diffuseTexture = tex;
    mat.diffuseTexture.uScale = 20;
    mat.diffuseTexture.vScale = 20;
    return g;
  }

  // ---------- Creation helpers ----------
  function createFloorRect(a, b, y=ST.currentY, mat){
    const s = SCENE(); ensureMaterials();
    const x1 = Math.min(a.x, b.x), z1 = Math.min(a.z, b.z);
    const x2 = Math.max(a.x, b.x), z2 = Math.max(a.z, b.z);
    const w = Math.max(0.1, x2-x1);
    const h = Math.max(0.1, z2-z1);
    const m = BABYLON.MeshBuilder.CreateGround('FLR_'+Date.now().toString(36), {width:w, height:h}, s);
    m.position.set(x1 + w/2, y, z1 + h/2);
    m.isPickable = true;
    m.metadata = m.metadata || {};
    m.metadata.builder = { type:'floor', floorIndex: ST.floorIndex };
    m.material = mat || ST.mats.tile;
    try{ m.checkCollisions = true; }catch{}
    // register as ground root if function exists
    try{
      if (typeof window.registerGroundRoots === 'function'){
        window.registerGroundRoots([ new RegExp('^'+m.name+'$') ]);
      }
    }catch{}
    return m;
  }

  function createWallSegment(a, b, opts={}){
    const s = SCENE(); ensureMaterials();
    const height = opts.height ?? ST.floorHeight;
    const thick  = opts.thickness ?? 0.18;
    const yBase  = opts.y ?? ST.currentY;
    const L = lenXZ(a,b);
    if (L < 0.01) return null;
    const wall = BABYLON.MeshBuilder.CreateBox('WALL_'+Date.now().toString(36), {width:L, depth:thick, height:height}, s);
    wall.position.copyFrom( mid(a,b) );
    wall.position.y = yBase + height/2;
    wall.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); // face along segment
    wall.isPickable = true;
    wall.material = ST.mats.wall;
    wall.metadata = wall.metadata || {};
    wall.metadata.builder = { type:'wall', floorIndex: ST.floorIndex, a: {x:a.x,y:yBase,z:a.z}, b:{x:b.x,y:yBase,z:b.z}, h:height, t:thick };
    wall.metadata.isGhostBlocker = true; // integrate with ghost barrier logic
    try{ wall.checkCollisions = true; }catch{}
    return wall;
  }

  function createRoomRect(a, b, opts={}){
    const y = opts.y ?? ST.currentY;
    const h = opts.height ?? ST.floorHeight;
    const t = opts.thickness ?? 0.18;
    // Floor first
    const floor = createFloorRect(a,b,y, ST.mats.tile);
    // Perimeter walls
    const x1 = Math.min(a.x, b.x), z1 = Math.min(a.z, b.z);
    const x2 = Math.max(a.x, b.x), z2 = Math.max(a.z, b.z);
    const A=v3(x1,y,z1), B=v3(x2,y,z1), C=v3(x2,y,z2), D=v3(x1,y,z2);
    const w1 = createWallSegment(A,B,{y, height:h, thickness:t});
    const w2 = createWallSegment(B,C,{y, height:h, thickness:t});
    const w3 = createWallSegment(C,D,{y, height:h, thickness:t});
    const w4 = createWallSegment(D,A,{y, height:h, thickness:t});
    const room = { id:'ROOM_'+Date.now().toString(36), floorIndex: ST.floorIndex, a: {x:x1,y:y,z:z1}, b:{x:x2,y:y,z:z2}, height:h, walls:[w1,w2,w3,w4], floor };
    floor.metadata.builder.roomId = room.id;
    room.walls.forEach(w=>{ if (w) w.metadata.builder.roomId = room.id; });
    return room;
  }

  function createStairs(start, dir, params){
    const s = SCENE(); ensureMaterials();
    const p = Object.assign({ width:1.0, stepRise:0.2, steps:10, tread:0.35 }, params||{});
    const root = new BABYLON.TransformNode('STAIRS_'+Date.now().toString(36), s);
    root.position.copyFrom(start);
    root.position.y = ST.currentY;
    const y0 = 0;
    for (let i=0;i<p.steps;i++){
      const step = BABYLON.MeshBuilder.CreateBox('STEP', { width:p.width, depth:p.tread, height:p.stepRise }, s);
      step.position.set(0, y0 + p.stepRise/2 + i*p.stepRise, (i+0.5)*p.tread);
      step.parent = root;
      step.material = ST.mats.concrete;
      step.isPickable = true;
      step.metadata = { builder: { type:'stairStep', floorIndex: ST.floorIndex } };
      try{ step.checkCollisions = true; }catch{}
    }
    // orient by dir
    const ang = Math.atan2(dir.x, dir.z);
    root.rotation.y = ang;
    root.metadata = { builder: { type:'stairs', floorIndex: ST.floorIndex, params:p } };
    return root;
  }

  // ---------- Undo/Redo ----------
  function pushUndo(action){
    ST.undo.push(action);
    ST.redo.length = 0;
  }
  function doDeleteMesh(m){
    if (!m || m.isDisposed()) return;
    withOutline(m,false);
    m.dispose(false,true);
  }

  // ---------- Export / Import ----------
  function collectExport(){
    const s = SCENE();
    const out = { meta:{ floorHeight:ST.floorHeight }, floors:[], walls:[], stairs:[], props:[] };
    s.meshes.forEach(m=>{
      const b = m.metadata?.builder?.type;
      if (!b) return;
      if (b==='floor'){
        out.floors.push({ name:m.name, floorIndex:m.metadata.builder.floorIndex, pos:m.position.asArray(), size:[m._width||m.getBoundingInfo().boundingBox.extendSizeWorld.x*2, m._height||m.getBoundingInfo().boundingBox.extendSizeWorld.z*2] });
      } else if (b==='wall'){
        out.walls.push(Object.assign({ name:m.name }, m.metadata.builder));
      } else if (b==='prop'){
        out.props.push({ name:m.name, pos:m.position.asArray(), rot:m.rotation ? m.rotation.asArray() : [0, m.rotation?.y||0, 0], scl:m.scaling?.asArray?.()||[1,1,1] });
      }
    });
    // stairs (as roots)
    s.transformNodes?.forEach?.(n=>{
      if (n.metadata?.builder?.type === 'stairs'){
        out.stairs.push({ name:n.name, pos:n.position.asArray(), rot:n.rotation?.asArray?.()||[0,n.rotation?.y||0,0], params:n.metadata.builder.params, floorIndex:n.metadata.builder.floorIndex });
      }
    });
    return out;
  }
  function exportGhostLayout(){
    const s = SCENE();
    const res = { rooms:[], barriers:[] };
    // rooms from floors (rects)
    s.meshes.forEach(m=>{
      const b = m.metadata?.builder?.type;
      if (b === 'floor' && m.metadata.builder.roomId){
        const bb = m.getBoundingInfo().boundingBox;
        res.rooms.push({
          name: m.metadata.builder.roomId,
          floorIndex: m.metadata.builder.floorIndex,
          a: {x: bb.minimumWorld.x, y: m.position.y, z: bb.minimumWorld.z },
          b: {x: bb.maximumWorld.x, y: m.position.y, z: bb.maximumWorld.z }
        });
      }
      if (b === 'wall'){
        const w = m.metadata.builder;
        res.barriers.push( [{x:w.a.x,y:w.a.y,z:w.a.z},{x:w.b.x,y:w.b.y,z:w.b.z}] );
      }
    });
    return res;
  }
  function downloadJSON(name, obj){
    const a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)], {type:'application/json'}));
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- UI ----------
  function buildUI(){
    if (ST.ui) return ST.ui;
    const panel = document.createElement('div');
    panel.id = 'builder-panel';
    panel.style.cssText = `
      position:fixed; top:10px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.78); border:1px solid #066; padding:8px 10px; border-radius:10px;
      color:#9ff; font:12px monospace; z-index:12001; display:none; gap:8px; align-items:center;
    `;
    panel.innerHTML = `
      <span style="font-weight:bold;color:#0ff;">BUILDER</span>
      <button id="bld-mode-select" class="bbtn">Select</button>
      <button id="bld-mode-place"  class="bbtn">Place</button>
      <button id="bld-mode-room"   class="bbtn">Room</button>
      <button id="bld-mode-wall"   class="bbtn">Wall</button>
      <button id="bld-mode-floor"  class="bbtn">Floor</button>
      <button id="bld-mode-stairs" class="bbtn">Stairs</button>
      <label style="margin-left:6px;">Grid
        <input id="bld-grid" type="number" min="0.05" step="0.05" value="${ST.gridSize}" style="width:60px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;padding:2px 4px;">
      </label>
      <label>Snap <input id="bld-snap" type="checkbox" ${ST.snap?'checked':''}></label>
      <label>Floor <input id="bld-floor-index" type="number" step="1" value="${ST.floorIndex}" style="width:40px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;padding:2px 4px;"></label>
      <span>Y=<span id="bld-floor-y">${ST.currentY.toFixed(2)}</span></span>
      <button id="bld-undo" class="bbtn">Undo</button>
      <button id="bld-redo" class="bbtn">Redo</button>
      <button id="bld-save" class="bbtn" title="Export full builder JSON">Save</button>
      <button id="bld-save-ghost" class="bbtn" title="Export ghost rooms/barriers JSON">Ghost JSON</button>
      <label class="bbtn" style="padding:3px 8px; cursor:pointer;">
        Import <input id="bld-load" type="file" accept="application/json" style="display:none">
      </label>
      <button id="bld-close" class="bbtn" style="margin-left:6px;color:#faa;border-color:#933;">Close</button>
    `;
    document.body.appendChild(panel);

    // Left toolbox
    const left = document.createElement('div');
    left.id = 'builder-left';
    left.style.cssText = `
      position:fixed; left:10px; top:70px; width:240px; max-height:80vh; overflow:auto;
      background:rgba(0,0,0,0.78); border:1px solid #066; border-radius:10px; padding:8px; color:#9ff; display:none; z-index:12001;
    `;
    left.innerHTML = `
      <div style="font-weight:bold;color:#0ff;margin-bottom:6px;">Tools</div>
      <div id="bld-tools"></div>
      <hr style="border-color:#044;">
      <div style="font-weight:bold;color:#0ff;margin:6px 0;">Place Library</div>
      <div id="bld-lib" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;"></div>
      <hr style="border-color:#044;">
      <div style="font-weight:bold;color:#0ff;margin:6px 0;">Paint</div>
      <div id="bld-paint" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>
      <hr style="border-color:#044;">
      <div style="font-weight:bold;color:#0ff;margin:6px 0;">Stairs</div>
      <label>Width <input id="bld-stair-width" type="number" step="0.1" value="${ST.stairs.width}" style="width:80px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;"></label>
      <label>Rise <input id="bld-stair-rise" type="number" step="0.05" value="${ST.stairs.stepRise}" style="width:80px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;"></label>
      <label>Steps <input id="bld-stair-steps" type="number" step="1" value="${ST.stairs.steps}" style="width:80px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;"></label>
      <label>Tread <input id="bld-stair-tread" type="number" step="0.05" value="${ST.stairs.tread}" style="width:80px;background:#000;color:#0ff;border:1px solid #066;border-radius:4px;"></label>
    `;
    document.body.appendChild(left);

    // Toggle pill
    const pill = document.createElement('button');
    pill.id = 'builder-toggle';
    pill.textContent = 'Builder';
    pill.className = 'hud-btn';
    pill.style.cssText = `position:fixed;top:10px;right:10px;z-index:12001;`;
    pill.onclick = ()=> toggle(!ST.enabled);
    document.body.appendChild(pill);

    // Small CSS
    const css = document.createElement('style');
    css.textContent = `
      .bbtn{ border:1px solid #066; background:#111; color:#9ff; padding:4px 8px; border-radius:8px; cursor:pointer; }
      .bbtn:active{ transform:translateY(1px); }
      .bld-item{ border:1px solid #055; background:#0a0a0a; color:#9ff; border-radius:6px; padding:6px; text-align:center; cursor:pointer; }
      .bld-item.active{ outline:2px solid #0ff; }
      .swatch{ width:40px; height:28px; border:1px solid #044; border-radius:6px; cursor:pointer; }
      .swatch.active{ outline:2px solid #0ff; }
    `;
    document.head.appendChild(css);

    // Library presets (primitives + markers)
    const lib = byId('bld-lib');
    const presets = [
      { key:'box', label:'Box' },
      { key:'sphere', label:'Sphere' },
      { key:'doorframe', label:'Door' },
      { key:'pointlight', label:'Light' }
    ];
    presets.forEach(p=>{
      const d = document.createElement('div');
      d.className = 'bld-item';
      d.textContent = p.label;
      d.onclick = ()=> {
        ST.mode = 'place';
        setActiveModeButton('place');
        ST.placing.preset = p.key;
        lib.querySelectorAll('.bld-item').forEach(x=> x.classList.remove('active'));
        d.classList.add('active');
        toast('Place: '+p.label);
      };
      lib.appendChild(d);
    });

    // Paint swatches
    ensureMaterials();
    const paint = byId('bld-paint');
    Object.entries(ST.mats).forEach(([k,mat])=>{
      if (k==='blocker') return; // internal
      const sw = document.createElement('div');
      sw.className='swatch'; sw.title=k;
      sw.style.background = `rgb(${(mat.diffuseColor.r*255)|0}, ${(mat.diffuseColor.g*255)|0}, ${(mat.diffuseColor.b*255)|0})`;
      sw.onclick = ()=>{
        ST.mode='paint'; setActiveModeButton('paint');
        paint.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));
        sw.classList.add('active');
        ST.placing.preset = 'paint:'+k;
        toast('Paint: '+k);
      };
      paint.appendChild(sw);
    });

    // Top bar interactions
    byId('bld-mode-select').onclick = ()=> { ST.mode='select'; setActiveModeButton('select'); };
    byId('bld-mode-place').onclick  = ()=> { ST.mode='place';  setActiveModeButton('place');  };
    byId('bld-mode-room').onclick   = ()=> { ST.mode='room';   setActiveModeButton('room');   };
    byId('bld-mode-wall').onclick   = ()=> { ST.mode='wall';   setActiveModeButton('wall');   };
    byId('bld-mode-floor').onclick  = ()=> { ST.mode='floor';  setActiveModeButton('floor');  };
    byId('bld-mode-stairs').onclick = ()=> { ST.mode='stairs'; setActiveModeButton('stairs'); };
    byId('bld-undo').onclick = undo;
    byId('bld-redo').onclick = redo;
    byId('bld-save').onclick = ()=> downloadJSON('builder_export.json', collectExport());
    byId('bld-save-ghost').onclick = ()=> downloadJSON('ghost_layout.json', exportGhostLayout());
    byId('bld-load').onchange = (e)=> {
      try{
        const file = e.target.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = ()=> { try{ loadFromJSON(JSON.parse(r.result)); }catch(ex){ alert('Invalid JSON'); } };
        r.readAsText(file);
      }catch{}
    };
    byId('bld-close').onclick = ()=> toggle(false);

    // Settings
    byId('bld-grid').onchange = (e)=>{ ST.gridSize = Math.max(0.05, +e.target.value||0.5); };
    byId('bld-snap').onchange = (e)=>{ ST.snap = !!e.target.checked; };
    byId('bld-floor-index').onchange = (e)=> setFloorIndex(+e.target.value||0);

    ST.ui = { panel, left, pill };
    return ST.ui;
  }
  function setActiveModeButton(id){
    const ids = ['select','place','room','wall','floor','stairs','paint'];
    ids.forEach(k=>{
      const el = byId('bld-mode-'+k);
      if (el) el.style.outline = (k===id) ? '2px solid #0ff' : 'none';
    });
  }

  // ---------- Enable / Disable ----------
  function enable(){
    const s = SCENE();
    if (!s) return toast('Scene not ready');
    buildUI();
    ensureMaterials();
    setFloorIndex(ST.floorIndex);

    ST.prevCam = CAM();
    ST.topCam = makeTopCamera();
    s.activeCamera = ST.topCam;

    ST.grid = createGrid();

    ST.enabled = true;
    ST.ui.panel.style.display = 'flex';
    ST.ui.left.style.display  = 'block';

    attachInput();
    toast('Builder ON');
  }
  function disable(){
    const s = SCENE(); if (!s) return;
    detachInput();
    if (ST.grid){ ST.grid.dispose(false,true); ST.grid=null; }
    if (ST.topCam){ ST.topCam.detachControl(); ST.topCam.dispose(); ST.topCam=null; }
    if (ST.prevCam){ s.activeCamera = ST.prevCam; ST.prevCam = null; }
    if (ST.selection.mesh){ withOutline(ST.selection.mesh,false); ST.selection.mesh=null; }
    ST.enabled = false;
    if (ST.ui){ ST.ui.panel.style.display='none'; ST.ui.left.style.display='none'; }
    toast('Builder OFF');
  }
  function toggle(on){
    if (typeof on==='boolean') (on? enable(): disable());
    else (ST.enabled? disable(): enable());
  }

  // ---------- Input / Editing ----------
  function attachInput(){
    const cvs = byId('renderCanvas');
    ST._onDown = (e)=> onPointerDown(e);
    ST._onMove = (e)=> onPointerMove(e);
    ST._onUp   = (e)=> onPointerUp(e);
    ST._onKey  = (e)=> onKey(e);
    cvs.addEventListener('pointerdown', ST._onDown, {passive:false});
    cvs.addEventListener('pointermove', ST._onMove, {passive:false});
    window.addEventListener('pointerup', ST._onUp, {passive:false});
    window.addEventListener('keydown', ST._onKey, {passive:false});
  }
  function detachInput(){
    const cvs = byId('renderCanvas');
    if (ST._onDown){ cvs.removeEventListener('pointerdown', ST._onDown); ST._onDown=null; }
    if (ST._onMove){ cvs.removeEventListener('pointermove', ST._onMove); ST._onMove=null; }
    if (ST._onUp)  { window.removeEventListener('pointerup', ST._onUp);   ST._onUp=null; }
    if (ST._onKey) { window.removeEventListener('keydown', ST._onKey);    ST._onKey=null; }
  }

  function onPointerDown(e){
    if (!ST.enabled) return;
    const p = pickXZ(e); if (!p) return;
    p.y = ST.currentY;
    const sp = snapVecXZ(p);

    if (ST.mode==='select'){
      const pick = SCENE().pick(e.offsetX, e.offsetY, m=> !!m && m.isPickable && m.name!=='BuilderGrid');
      if (pick.hit && pick.pickedMesh){
        if (ST.selection.mesh) withOutline(ST.selection.mesh,false);
        ST.selection.mesh = pick.pickedMesh;
        withOutline(ST.selection.mesh,true);
        ST.selection.dragStart = { pos: ST.selection.mesh.position.clone(), pointer: sp.clone() };
      } else {
        if (ST.selection.mesh){ withOutline(ST.selection.mesh,false); ST.selection.mesh=null; }
      }
    }
    else if (ST.mode==='room' || ST.mode==='wall' || ST.mode==='floor' || ST.mode==='stairs'){
      ST.draw.start = sp.clone();
      if (ST.mode==='stairs'){
        // store start; actual creation on pointer up using direction
      } else {
        ST.draw.temp = ST.draw.temp || createPreviewRect();
        updatePreviewRect(ST.draw.temp, ST.draw.start, sp);
      }
    }
    else if (ST.mode==='place'){
      placePresetAt(sp);
    }
    else if (ST.mode==='paint'){
      paintAt(e);
    }
    e.preventDefault();
  }

  function onPointerMove(e){
    if (!ST.enabled) return;
    const p = pickXZ(e); if (!p) return;
    p.y = ST.currentY;
    const sp = snapVecXZ(p);

    if (ST.mode==='select' && ST.selection.mesh && ST.selection.dragStart){
      const d = sp.subtract(ST.selection.dragStart.pointer);
      ST.selection.mesh.position.copyFrom( ST.selection.dragStart.pos.add(d) );
    }
    else if ((ST.mode==='room' || ST.mode==='wall' || ST.mode==='floor') && ST.draw.start && ST.draw.temp){
      updatePreviewRect(ST.draw.temp, ST.draw.start, sp);
    }
    else if (ST.mode==='stairs' && ST.draw.start){
      // Could show a direction arrow preview; omitted for lightness
    }
  }

  function onPointerUp(e){
    if (!ST.enabled) return;
    const p = pickXZ(e); if (!p) return;
    p.y = ST.currentY;
    const sp = snapVecXZ(p);

    if (ST.mode==='select'){
      ST.selection.dragStart = null;
    }
    else if (ST.mode==='room' && ST.draw.start){
      const room = createRoomRect(ST.draw.start, sp);
      if (ST.draw.temp){ ST.draw.temp.dispose(false,true); ST.draw.temp=null; }
      pushUndo({ type:'create-room', created:[room.floor, ...room.walls.filter(Boolean)] });
      toast('Room created');
      ST.draw.start=null;
    }
    else if (ST.mode==='wall' && ST.draw.start){
      const w = createWallSegment(ST.draw.start, sp);
      if (ST.draw.temp){ ST.draw.temp.dispose(false,true); ST.draw.temp=null; }
      if (w) pushUndo({ type:'create-wall', created:[w] });
      toast('Wall created');
      ST.draw.start=null;
    }
    else if (ST.mode==='floor' && ST.draw.start){
      const f = createFloorRect(ST.draw.start, sp);
      if (ST.draw.temp){ ST.draw.temp.dispose(false,true); ST.draw.temp=null; }
      pushUndo({ type:'create-floor', created:[f] });
      toast('Floor created');
      ST.draw.start=null;
    }
    else if (ST.mode==='stairs' && ST.draw.start){
      const dir = sp.subtract(ST.draw.start); dir.y=0;
      if (dir.length() < 0.1){ ST.draw.start=null; return; }
      const root = createStairs(ST.draw.start, dir, ST.stairs);
      pushUndo({ type:'create-stairs', created:[root] });
      toast('Stairs created');
      ST.draw.start=null;
    }
  }

  function onKey(e){
    if (!ST.enabled) return;
    // Global toggles
    if (e.altKey && (e.code==='KeyB')){ toggle(!ST.enabled); return; }

    if (ST.mode==='place'){
      if (e.code==='KeyR'){ ST.placing.rotationY += Math.PI/8; updatePreviewRotation(); }
      if (e.code==='Escape'){ clearPlacePreview(); }
    }
    if (ST.mode==='select'){
      if (e.code==='Delete' && ST.selection.mesh){
        const mesh = ST.selection.mesh; ST.selection.mesh=null;
        pushUndo({ type:'delete', target:mesh, parent:mesh.parent, data:mesh.serialize?.() });
        doDeleteMesh(mesh);
      }
      if (e.code==='KeyC' && ST.selection.mesh){
        const m = ST.selection.mesh.clone(ST.selection.mesh.name+'_copy');
        if (m){ m.position.addInPlace(v3( ST.gridSize, 0, ST.gridSize )); withOutline(m,true); withOutline(ST.selection.mesh,false); ST.selection.mesh=m; pushUndo({type:'create', created:[m]}); }
      }
      if (e.code==='KeyQ' && ST.selection.mesh){ ST.selection.mesh.rotation.y -= Math.PI/16; }
      if (e.code==='KeyE' && ST.selection.mesh){ ST.selection.mesh.rotation.y += Math.PI/16; }
      if (e.code==='Escape' && ST.selection.mesh){ withOutline(ST.selection.mesh,false); ST.selection.mesh=null; }
    }
    // Undo/Redo
    if (e.ctrlKey && e.code==='KeyZ'){ undo(); e.preventDefault(); }
    if (e.ctrlKey && e.code==='KeyY'){ redo(); e.preventDefault(); }

    // Quick modes
    if (!e.ctrlKey && !e.altKey){
      if (e.code==='KeyS') { ST.mode='select'; setActiveModeButton('select'); }
      if (e.code==='KeyW') { ST.mode='wall';   setActiveModeButton('wall'); }
      if (e.code==='KeyR') { ST.mode='room';   setActiveModeButton('room'); }
      if (e.code==='KeyF') { ST.mode='floor';  setActiveModeButton('floor'); }
      if (e.code==='KeyP') { ST.mode='place';  setActiveModeButton('place'); }
    }
  }

  // ---------- Preview rectangle ----------
  function createPreviewRect(){
    const s = SCENE();
    const lines = BABYLON.MeshBuilder.CreateLineSystem('PREVIEW', { lines:[ [v3(0,0,0), v3(0,0,0)] ] }, s);
    lines.color = new BABYLON.Color3(0,1,1);
    lines.isPickable = false;
    return lines;
  }
  function updatePreviewRect(mesh, a, b){
    const x1=Math.min(a.x,b.x), x2=Math.max(a.x,b.x), z1=Math.min(a.z,b.z), z2=Math.max(a.z,b.z);
    const y = ST.currentY + 0.02;
    const lines = [
      [v3(x1,y,z1), v3(x2,y,z1)],
      [v3(x2,y,z1), v3(x2,y,z2)],
      [v3(x2,y,z2), v3(x1,y,z2)],
      [v3(x1,y,z2), v3(x1,y,z1)],
    ];
    mesh = BABYLON.MeshBuilder.CreateLineSystem(null, { lines, instance: mesh });
    mesh.color = new BABYLON.Color3(0,1,1);
    return mesh;
  }

  // ---------- Place presets ----------
  function clearPlacePreview(){
    if (ST.placing.preview){ doDeleteMesh(ST.placing.preview); ST.placing.preview=null; }
    ST.placing.preset=null; ST.placing.rotationY=0;
  }
  function updatePreviewRotation(){
    if (ST.placing.preview){ ST.placing.preview.rotation.y = ST.placing.rotationY; }
  }
  function placePresetAt(p){
    const s = SCENE(); ensureMaterials();
    let mesh=null;
    if (ST.placing.preset==='box'){
      mesh = BABYLON.MeshBuilder.CreateBox('BOX_'+Date.now().toString(36), {size:1}, s);
      mesh.material = ST.mats.wood;
    } else if (ST.placing.preset==='sphere'){
      mesh = BABYLON.MeshBuilder.CreateSphere('SPH_'+Date.now().toString(36), {diameter:0.8}, s);
      mesh.material = ST.mats.accent;
    } else if (ST.placing.preset==='doorframe'){
      mesh = BABYLON.MeshBuilder.CreateBox('DOOR_'+Date.now().toString(36), {width:0.1, depth:1.0, height:2.1}, s);
      mesh.material = ST.mats.wall;
    } else if (ST.placing.preset==='pointlight'){
      const L = new BABYLON.PointLight('PL_'+Date.now().toString(36), p.clone().add(v3(0,1.8,0)), s);
      L.diffuse = new BABYLON.Color3(1,1,1);
      L.intensity = 0.7;
      pushUndo({ type:'create-light', created:[L] });
      toast('Light placed');
      return;
    } else if (ST.placing.preset?.startsWith('paint:')){
      paintAtPoint(p); return;
    }
    if (mesh){
      mesh.position.copyFrom(p);
      mesh.isPickable = true;
      mesh.metadata = mesh.metadata || {};
      mesh.metadata.builder = { type:'prop', floorIndex: ST.floorIndex };
      pushUndo({ type:'create', created:[mesh] });
      toast('Placed');
    }
  }
  function paintAt(evt){
    const pick = SCENE().pick(evt.offsetX, evt.offsetY, m=> !!m && m.isPickable && m.name!=='BuilderGrid');
    if (!pick.hit || !pick.pickedMesh) return;
    const k = (ST.placing.preset||'').split(':')[1];
    if (!k || !ST.mats[k]) return;
    pick.pickedMesh.material = ST.mats[k];
    pushUndo({ type:'paint', target: pick.pickedMesh, mat: k });
  }
  function paintAtPoint(p){ /* optional direct point paint */ }

  // ---------- Undo/Redo ops ----------
  function undo(){
    const op = ST.undo.pop(); if (!op) return;
    ST.redo.push(op);
    if (op.type.startsWith('create')){
      (op.created||[]).forEach(m=>{ try{ doDeleteMesh(m); }catch{} });
    } else if (op.type==='delete'){
      // If we stored full serialize, we could reconstruct; for now, just skip
      toast('Cannot undelete without full serialize (coming soon)');
    } else if (op.type==='paint'){
      // (No previous material stored in this lightweight pass)
    }
  }
  function redo(){
    // Intentionally minimal (we can extend later)
    toast('Nothing to redo (lightweight stack)');
  }

  // ---------- Load ----------
  function loadFromJSON(obj){
    if (!obj) return;
    const s = SCENE(); ensureMaterials();
    (obj.floors||[]).forEach(F=>{
      const m = BABYLON.MeshBuilder.CreateGround(F.name||('FLR_'+Date.now().toString(36)), {width:F.size?.[0]||2, height:F.size?.[1]||2}, s);
      m.position = BABYLON.Vector3.FromArray(F.pos||[0,0,0]);
      m.isPickable = true; m.material = ST.mats.tile;
      m.metadata = { builder:{ type:'floor', floorIndex:F.floorIndex|0 } };
    });
    (obj.walls||[]).forEach(W=>{
      const a = v3(W.a.x,W.a.y,W.a.z); const b=v3(W.b.x,W.b.y,W.b.z);
      createWallSegment(a,b,{y:W.a.y, height:W.h||ST.floorHeight, thickness:W.t||0.18});
    });
    (obj.stairs||[]).forEach(Ss=>{
      const p = Object.assign({width:1,stepRise:0.2,steps:10,tread:0.35}, Ss.params||{});
      const root = createStairs( BABYLON.Vector3.FromArray(Ss.pos||[0,0,0]), v3(0,0,1), p );
      if (Ss.rot) root.rotation = BABYLON.Vector3.FromArray(Ss.rot);
    });
    (obj.props||[]).forEach(P=>{
      const b = BABYLON.MeshBuilder.CreateBox(P.name||('PROP_'+Date.now().toString(36)), {size:1}, s);
      b.position = BABYLON.Vector3.FromArray(P.pos||[0,0,0]);
      if (P.rot) b.rotation = BABYLON.Vector3.FromArray(P.rot);
      if (P.scl) b.scaling = BABYLON.Vector3.FromArray(P.scl);
      b.material = ST.mats.wood;
      b.isPickable = true;
      b.metadata = { builder:{ type:'prop', floorIndex: (P.floorIndex|0)??0 } };
    });
    toast('Loaded layout');
  }

  // ---------- Expose ----------
  window.Builder = {
    toggle, enable, disable,
    setFloorIndex,
    export: ()=> collectExport(),
    exportGhostLayout,
  };

  // ---------- Global Hotkey ----------
  window.addEventListener('keydown', (e)=>{
    if (e.altKey && (e.code==='KeyB' || e.key==='b' || e.key==='B')){
      toggle();
    }
  });

})();
