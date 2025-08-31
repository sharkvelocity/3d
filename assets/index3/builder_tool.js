/* =========================================================================
   PhasmaPhoney — Builder Tool (Sims-like)  v1.7
   - Always-on top-down builder for floors, walls, props
   - Grid snap, copy/paste room, undo/redo
   - Material Browser integrated (Babylon materialsLibrary)
   - Public API used by your page:
       Builder.enable()
       Builder.setGridSnap(on, step)  // or Builder.setGrid({snap, step})
       Builder.export()               // { floors, walls, props, spawn, ... }
   -------------------------------------------------------------------------
   OPTIONAL (recommended) scripts to include in builder.html
   (Put these after babylon.js and before this file; only include what you want):

   <script src="./cdn/materialsLibrary/babylon.woodProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.brickProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.marbleProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.cloudProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.grassProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.fireProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.roadsProceduralTexture.js"></script>
   <script src="./cdn/materialsLibrary/babylon.normalProceduralTexture.js"></script>
   ... (any others you like)

   Thumbnails still show even if a given library isn’t loaded;
   applying that material will gracefully fall back.
   ========================================================================= */

(function(){
  "use strict";

  // ------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------
  const S = ()=> window.scene;
  const v3 = (x,y,z)=> new BABYLON.Vector3(x,y,z);
  const C3 = BABYLON.Color3;
  const PI = Math.PI;

  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const snapTo = (v,step)=> Math.round(v/step)*step;

  const toast = (msg)=> {
    try{
      const t = document.getElementById('toast');
      if (t){ t.textContent = msg; t.style.display='block'; setTimeout(()=>t.style.display='none', 1200); }
      else console.log('[Builder]', msg);
    }catch{ console.log('[Builder]', msg); }
  };

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  const ST = {
    ready:false,
    grid:{ snap:true, step:0.5 },
    mode:'select',             // 'select' | 'floor' | 'wall' | 'room' | 'place'
    yLevel:0,                  // current Y plane for building
    defaultMats:{ floor:null, wall:null }, // default material choices
    sel:null,                  // selected mesh
    copyRoom:null,             // {size:[w,h], matKey, isFloor:true}
    drag:{ active:false, a:null, b:null, ghost:null }, // for drag-to-place
    hist:{ stack:[], i:-1 },   // undo/redo
    hl:null,                   // HighlightLayer
  };

  // ------------------------------------------------------------
  // Material Browser (auto-detect available materialsLibrary classes)
  // ------------------------------------------------------------
  const Materials = (function(){
    // Catalog entries -> how to build + fallback color
    // key: unique id we store in mesh.metadata.builder.matKey
    const CATALOG = [
      { key:'wood',   label:'Wood',   color:'#8b6b3e', make: makeWood },
      { key:'brick',  label:'Brick',  color:'#a33d31', make: makeBrick },
      { key:'marble', label:'Marble', color:'#bbbfc8', make: makeMarble },
      { key:'tile',   label:'Tile',   color:'#d7dada', make: makeTile },
      { key:'concrete',label:'Concrete',color:'#9aa0a6', make: makeConcrete },
      { key:'carpet', label:'Carpet', color:'#80706a', make: makeCarpet },
      { key:'grass',  label:'Grass',  color:'#3f7d38', make: makeGrass },
      { key:'road',   label:'Road',   color:'#3a3a3a', make: makeRoad },
      { key:'cloud',  label:'Cloud',  color:'#cfd8e6', make: makeCloud },
      { key:'fire',   label:'Fire',   color:'#ff7b00', make: makeFire },
    ];

    // ---- builders (use materialsLibrary if available; else StandardMaterial) ----
    function makeWood(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.05,0.05,0.05);
      if (BABYLON.WoodProceduralTexture){
        mat.diffuseTexture = new BABYLON.WoodProceduralTexture(name+'_tex', 256, scene);
      } else {
        mat.diffuseColor = new C3(0.55,0.42,0.2);
      }
      return mat;
    }
    function makeBrick(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.05,0.05,0.05);
      if (BABYLON.BrickProceduralTexture){
        const t = new BABYLON.BrickProceduralTexture(name+'_tex', 256, scene);
        t.numberOfBricksHeight = 5; t.numberOfBricksWidth = 10;
        mat.diffuseTexture = t;
      } else {
        mat.diffuseColor = new C3(0.63,0.25,0.2);
      }
      return mat;
    }
    function makeMarble(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.15,0.15,0.15);
      if (BABYLON.MarbleProceduralTexture){
        mat.diffuseTexture = new BABYLON.MarbleProceduralTexture(name+'_tex', 256, scene);
      } else {
        mat.diffuseColor = new C3(0.72,0.76,0.82);
      }
      return mat;
    }
    function makeTile(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.12,0.12,0.12);
      if (BABYLON.CheckerProceduralTexture){ // simple checker as "tile"
        const t = new BABYLON.CheckerProceduralTexture(name+'_tex', 256, scene);
        t.numberOfColumns = 8; t.numberOfRows = 8;
        t.colors = [ new C3(0.92,0.94,0.95), new C3(0.78,0.82,0.85) ];
        mat.diffuseTexture = t;
      } else {
        mat.diffuseColor = new C3(0.84,0.86,0.86);
      }
      return mat;
    }
    function makeConcrete(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.05,0.05,0.05);
      mat.diffuseColor  = new C3(0.6,0.62,0.65);
      return mat;
    }
    function makeCarpet(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.specularColor = new C3(0.02,0.02,0.02);
      mat.diffuseColor  = new C3(0.5,0.44,0.42);
      return mat;
    }
    function makeGrass(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      if (BABYLON.GrassProceduralTexture){
        mat.diffuseTexture = new BABYLON.GrassProceduralTexture(name+'_tex', 256, scene);
      } else {
        mat.diffuseColor = new C3(0.26,0.55,0.28);
      }
      return mat;
    }
    function makeRoad(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      if (BABYLON.RoadProceduralTexture){
        mat.diffuseTexture = new BABYLON.RoadProceduralTexture(name+'_tex', 256, scene);
      } else {
        mat.diffuseColor = new C3(0.2,0.2,0.2);
      }
      mat.specularColor = new C3(0.05,0.05,0.05);
      return mat;
    }
    function makeCloud(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      if (BABYLON.CloudProceduralTexture){
        mat.diffuseTexture = new BABYLON.CloudProceduralTexture(name+'_tex', 256, scene);
      } else {
        mat.diffuseColor = new C3(0.8,0.85,0.9);
      }
      return mat;
    }
    function makeFire(name, scene){
      const mat = new BABYLON.StandardMaterial(name, scene);
      if (BABYLON.FireProceduralTexture){
        mat.emissiveTexture = new BABYLON.FireProceduralTexture(name+'_tex', 256, scene);
        mat.disableLighting = true;
      } else {
        mat.emissiveColor = new C3(1,0.32,0);
        mat.disableLighting = true;
      }
      return mat;
    }

    // DOM: build a small palette that docks bottom-left
    function ensurePanel(){
      if (document.getElementById('mat-panel')) return;

      const style = document.createElement('style');
      style.textContent = `
        #mat-panel{ position:fixed; left:12px; bottom:64px; z-index:12001;
          background:rgba(0,0,0,0.82); border:1px solid #066; color:#9ff; border-radius:10px;
          padding:8px 10px; font:12px monospace; max-width: 260px; pointer-events:auto; }
        #mat-grid{ display:grid; grid-template-columns:repeat(4, 52px); gap:8px; margin-top:6px;}
        .mat-card{ width:52px; }
        .mat-thumb{ width:52px; height:36px; border-radius:6px; border:1px solid #066; cursor:pointer; }
        .mat-name{ margin-top:4px; text-align:center; font-size:10px; color:#bfe; }
        #mat-actions{ display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
        #mat-actions .btn{ border:1px solid #066; background:#111; color:#9ff; padding:4px 8px; border-radius:8px; cursor:pointer; }
      `;
      document.head.appendChild(style);

      const wrap = document.createElement('div');
      wrap.id = 'mat-panel';
      wrap.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div><b>Materials</b></div>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="mat-pin" checked>
            <span>Pin</span>
          </label>
        </div>
        <div id="mat-grid"></div>
        <div id="mat-actions">
          <button id="mat-apply" class="btn" title="Apply to selected mesh">Apply to Selection</button>
          <button id="mat-floor-default" class="btn" title="Use on new floors">Set Floor Default</button>
          <button id="mat-wall-default" class="btn" title="Use on new walls">Set Wall Default</button>
          <button id="mat-copy-room" class="btn" title="Copy selected room (size+material)">Copy Room</button>
          <button id="mat-paste-room" class="btn" title="Paste room at pointer">Paste Room</button>
        </div>`;
      document.body.appendChild(wrap);

      // Clicking outside when not pinned hides it
      document.addEventListener('mousedown', (e)=>{
        const pin = document.getElementById('mat-pin');
        if (!pin || pin.checked) return;
        const p = document.getElementById('mat-panel');
        if (!p) return;
        if (!p.contains(e.target)) p.style.display='none';
      });

      // Build grid items
      const grid = wrap.querySelector('#mat-grid');
      CATALOG.forEach(entry=>{
        const card = document.createElement('div');
        card.className = 'mat-card';
        const sw = document.createElement('div');
        sw.className = 'mat-thumb';
        sw.style.background = entry.color;
        sw.title = entry.label;
        sw.dataset.key = entry.key;
        sw.onclick = ()=> selectMat(entry.key);
        const label = document.createElement('div');
        label.className = 'mat-name';
        label.textContent = entry.label;
        card.appendChild(sw);
        card.appendChild(label);
        grid.appendChild(card);
      });

      document.getElementById('mat-apply').onclick = ()=> {
        if (!ST.__matSel) return toast('Pick a material first.');
        if (!ST.sel) return toast('Select a mesh to apply.');
        applyMatToMesh(ST.sel, ST.__matSel);
      };
      document.getElementById('mat-floor-default').onclick = ()=> {
        if (!ST.__matSel) return toast('Pick a material first.');
        ST.defaultMats.floor = ST.__matSel;
        toast('Default floor material set: '+ST.__matSel);
      };
      document.getElementById('mat-wall-default').onclick = ()=> {
        if (!ST.__matSel) return toast('Pick a material first.');
        ST.defaultMats.wall = ST.__matSel;
        toast('Default wall material set: '+ST.__matSel);
      };
      document.getElementById('mat-copy-room').onclick = copyRoomFromSelection;
      document.getElementById('mat-paste-room').onclick = pasteRoomAtPointer;
    }

    function selectMat(key){
      ST.__matSel = key;
      toast('Material selected: '+key);
    }

    function makeMaterialForKey(key, name){
      const sc = S();
      const entry = CATALOG.find(x=> x.key===key);
      if (!entry) return null;
      try{
        const m = entry.make((name||('Mat_'+key+'_'+Date.now().toString(36))), sc);
        m.freeze(); // tiny perf
        m['__pp_key'] = key;
        return m;
      }catch(e){
        console.warn('[Builder] material make failed for', key, e);
        const mat = new BABYLON.StandardMaterial('Mat_'+key, sc);
        mat.diffuseColor = C3.FromHexString(entry.color);
        return mat;
      }
    }

    function applyMatToMesh(mesh, key){
      const sc = S();
      if (!mesh || mesh.isDisposed()) return;
      const tag = mesh.metadata?.builder?.type;
      const name = 'Mat_'+key+'_'+(tag||'');
      const mat = makeMaterialForKey(key, name) || new BABYLON.StandardMaterial(name, sc);
      mesh.material = mat;
      mesh.metadata = mesh.metadata || {};
      mesh.metadata.builder = mesh.metadata.builder || {};
      mesh.metadata.builder.matKey = key;
    }

    return {
      ensurePanel,
      applyMatToMesh,
      makeMaterialForKey,
      catalog: ()=> CATALOG.slice(),
    };
  })();

  // ------------------------------------------------------------
  // Mesh creation helpers
  // ------------------------------------------------------------
  function createFloorRect(name, ax, az, bx, bz, y, matKey){
    const sc = S();
    const w = Math.abs(bx-ax), h = Math.abs(bz-az);
    const cx = (ax+bx)/2, cz = (az+bz)/2;
    const floor = BABYLON.MeshBuilder.CreateGround(name, { width:w, height:h, subdivisions:2 }, sc);
    floor.position = v3(cx, y, cz);
    floor.checkCollisions = true; floor.isPickable = true;
    // material
    let mat = null;
    if (matKey) mat = Materials.makeMaterialForKey(matKey, 'Mat_floor_'+matKey);
    else if (ST.defaultMats.floor) mat = Materials.makeMaterialForKey(ST.defaultMats.floor, 'Mat_floor_'+ST.defaultMats.floor);
    if (!mat){
      mat = new BABYLON.StandardMaterial('Mat_Floor_Default', sc);
      mat.diffuseColor = new C3(0.53,0.43,0.25);
      mat.specularColor= new C3(0.05,0.05,0.05);
    }
    floor.material = mat;
    floor.metadata = { builder:{ type:'floor', size:[w,h], y:y, matKey: (mat['__pp_key']||matKey)||null, floorIndex: 0 } };

    // Register as "ground" so ghost glue knows it
    try{
      window.registerGroundRoots && window.registerGroundRoots([new RegExp('^'+name+'$')]);
    }catch{}

    return floor;
  }

  function createWallBox(name, a, b, h, t, y, matKey){
    const sc = S();
    const L = BABYLON.Vector3.Distance(a, b);
    const wall = BABYLON.MeshBuilder.CreateBox(name, { width:L, depth:t, height:h }, sc);
    const mid = a.add(b).scale(0.5);
    wall.position = v3(mid.x, y + h/2, mid.z);
    wall.rotation.y = Math.atan2(b.x-a.x, b.z-a.z);
    wall.checkCollisions = true; wall.isPickable = true;

    let mat = null;
    if (matKey) mat = Materials.makeMaterialForKey(matKey, 'Mat_wall_'+matKey);
    else if (ST.defaultMats.wall) mat = Materials.makeMaterialForKey(ST.defaultMats.wall, 'Mat_wall_'+ST.defaultMats.wall);
    if (!mat){
      mat = new BABYLON.StandardMaterial('Mat_Wall_Default', sc);
      mat.diffuseColor = new C3(0.82,0.84,0.88);
      mat.specularColor= new C3(0.1,0.1,0.1);
    }
    wall.material = mat;
    wall.metadata = { builder:{ type:'wall', a: {x:a.x,y:y,z:a.z}, b:{x:b.x,y:y,z:b.z}, h, t, y, matKey: (mat['__pp_key']||matKey)||null, floorIndex: 0 }, isGhostBlocker:true };

    return wall;
  }

  // ------------------------------------------------------------
  // Selection + highlight (no isDisposed crash)
  // ------------------------------------------------------------
  function ensureHL(){
    if (ST.hl && !ST.hl.isDisposed()) return;
    ST.hl = new BABYLON.HighlightLayer('builderHL', S());
    ST.hl.blurHorizontalSize = 0.0;
    ST.hl.blurVerticalSize   = 0.0;
    ST.hl.outerGlow = false;
    ST.hl.innerGlow = true;
  }
  function select(mesh){
    ensureHL();
    if (ST.sel && !ST.sel.isDisposed()) ST.hl.removeMesh(ST.sel);
    ST.sel = mesh || null;
    if (ST.sel) ST.hl.addMesh(ST.sel, new C3(0,1,1));
  }

  // ------------------------------------------------------------
  // Input (pointer -> place things)
  // ------------------------------------------------------------
  function groundHitFromPointer(){
    const sc = S(); if (!sc) return null;
    const pick = sc.pick(sc.pointerX, sc.pointerY, (m)=> true, false, sc.activeCamera);
    if (pick && pick.pickedPoint){
      const p = pick.pickedPoint.clone();
      if (ST.grid?.snap) {
        p.x = snapTo(p.x, ST.grid.step);
        p.z = snapTo(p.z, ST.grid.step);
        p.y = ST.yLevel;
      }
      return p;
    }
    return null;
  }

  function beginDrag(point){
    ST.drag.active = true;
    ST.drag.a = point.clone();
    ST.drag.b = point.clone();

    // ghost mesh (thin plane / box)
    if (ST.mode==='floor' || ST.mode==='room'){
      const ghost = BABYLON.MeshBuilder.CreateGround('GhostFloor', {width:0.01,height:0.01}, S());
      ghost.position = v3(point.x, ST.yLevel, point.z);
      ghost.isPickable = false; ghost.alphaIndex = 0;
      const m = new BABYLON.StandardMaterial('Mat_GhostFloor', S());
      m.diffuseColor = new C3(0.3,0.5,0.4); m.alpha = 0.6; m.specularColor = new C3(0,0,0);
      ghost.material = m; ST.drag.ghost = ghost;
    } else if (ST.mode==='wall'){
      const ghost = BABYLON.MeshBuilder.CreateBox('GhostWall', {width:0.01, depth:0.18, height:3.0}, S());
      ghost.position = v3(point.x, ST.yLevel+1.5, point.z);
      ghost.isPickable = false; ghost.alphaIndex = 0;
      const m = new BABYLON.StandardMaterial('Mat_GhostWall', S());
      m.diffuseColor = new C3(0.5,0.7,0.8); m.alpha = 0.45; m.specularColor = new C3(0,0,0);
      ghost.material = m; ST.drag.ghost = ghost;
    }
  }

  function updateDrag(point){
    if (!ST.drag.active) return;
    ST.drag.b = point.clone();
    const a = ST.drag.a, b = ST.drag.b;

    if (ST.drag.ghost && !ST.drag.ghost.isDisposed()){
      if (ST.mode==='floor' || ST.mode==='room'){
        const w = Math.max(0.01, Math.abs(b.x-a.x));
        const h = Math.max(0.01, Math.abs(b.z-a.z));
        ST.drag.ghost.dispose(false, true);
        const ghost = BABYLON.MeshBuilder.CreateGround('GhostFloor', {width:w, height:h}, S());
        ghost.position = v3((a.x+b.x)/2, ST.yLevel, (a.z+b.z)/2);
        ghost.isPickable = false;
        const m = new BABYLON.StandardMaterial('Mat_GhostFloor', S());
        m.diffuseColor = new C3(0.3,0.5,0.4); m.alpha = 0.6; m.specularColor = new C3(0,0,0);
        ghost.material = m; ST.drag.ghost = ghost;
      } else if (ST.mode==='wall'){
        const L = BABYLON.Vector3.Distance(a,b);
        const ghost = ST.drag.ghost;
        ghost.scaling = v3(1,1,1); // reset
        ghost.position = v3((a.x+b.x)/2, ST.yLevel + 1.5, (a.z+b.z)/2);
        ghost.rotation.y = Math.atan2(b.x-a.x, b.z-a.z);
        ghost.scaling.x  = L; // width
      }
    }
  }

  function endDrag(point){
    if (!ST.drag.active) return;
    ST.drag.active = false;

    const a = ST.drag.a, b = point.clone();
    if (ST.drag.ghost && !ST.drag.ghost.isDisposed()){
      ST.drag.ghost.dispose(false,true);
      ST.drag.ghost = null;
    }
    if (ST.mode==='floor' || ST.mode==='room'){
      const name = 'FLR_'+Date.now().toString(36);
      const m = createFloorRect(name, a.x,a.z, b.x,b.z, ST.yLevel, null);
      pushHist({ op:'add', mesh:m });
      select(m);
    } else if (ST.mode==='wall'){
      const name = 'WALL_'+Date.now().toString(36);
      const m = createWallBox(name, a, b, 3.0, 0.18, ST.yLevel, null);
      pushHist({ op:'add', mesh:m });
      select(m);
    }
  }

  // ------------------------------------------------------------
  // Copy / Paste room
  // ------------------------------------------------------------
  function copyRoomFromSelection(){
    const m = ST.sel;
    if (!m || m.isDisposed()) return toast('Select a room (floor) to copy.');
    const tag = m.metadata?.builder?.type;
    if (tag!=='floor') return toast('Copy works on floors (rooms) only.');
    const size = (m.metadata.builder && m.metadata.builder.size) || [m._width||2, m._height||2];
    const key  = m.metadata.builder.matKey || null;
    ST.copyRoom = { size:[+size[0], +size[1]], matKey:key };
    toast('Room copied.');
  }

  function pasteRoomAtPointer(){
    if (!ST.copyRoom) return toast('No copied room.');
    const p = groundHitFromPointer(); if (!p) return;
    const w = Math.max(0.1, ST.copyRoom.size[0]);
    const h = Math.max(0.1, ST.copyRoom.size[1]);
    const a = v3(p.x - w/2, ST.yLevel, p.z - h/2);
    const b = v3(p.x + w/2, ST.yLevel, p.z + h/2);
    const name = 'FLR_'+Date.now().toString(36);
    const m = createFloorRect(name, a.x,a.z, b.x,b.z, ST.yLevel, ST.copyRoom.matKey||null);
    pushHist({ op:'add', mesh:m });
    select(m);
  }

  // ------------------------------------------------------------
  // Undo / Redo (very simple)
  // ------------------------------------------------------------
  function pushHist(entry){
    ST.hist.stack.length = ST.hist.i+1;
    ST.hist.stack.push(entry);
    ST.hist.i++;
  }
  function undo(){
    const e = ST.hist.stack[ST.hist.i];
    if (!e) return;
    ST.hist.i--;
    if (e.op==='add' && e.mesh && !e.mesh.isDisposed()){
      try{ e.mesh.setEnabled(false); e.mesh.isVisible=false; }catch{}
      e.__undone = true;
    }
  }
  function redo(){
    const e = ST.hist.stack[ST.hist.i+1];
    if (!e) return;
    ST.hist.i++;
    if (e.op==='add' && e.mesh && e.__undone){
      try{ e.mesh.setEnabled(true); e.mesh.isVisible=true; e.__undone=false; }catch{}
    }
  }

  // ------------------------------------------------------------
  // Public export (JSON manifest-ish)
  // ------------------------------------------------------------
  function exportJSON(){
    const sc = S();
    const out = {
      pp_map_format:'v1',
      meta:{ origin:[0,0,0], grid: { snap:ST.grid.snap, step:ST.grid.step } },
      spawn:{},
      floors:[],
      walls:[],
      props:[]
    };
    const sp = sc.getTransformNodeByName?.('Spawn_Player');
    const sv = sc.getTransformNodeByName?.('Spawn_Van');
    if (sp) out.spawn.player = [sp.position.x, sp.position.y, sp.position.z];
    if (sv) out.spawn.van    = [sv.position.x, sv.position.y, sv.position.z];

    sc.meshes.forEach(m=>{
      const tag = m.metadata?.builder?.type;
      if (tag==='floor'){
        out.floors.push({
          name: m.name,
          pos: [m.position.x, m.position.y, m.position.z],
          size: m.metadata.builder.size || [m.getBoundingInfo().boundingBox.extendSizeWorld.x*2, m.getBoundingInfo().boundingBox.extendSizeWorld.z*2],
          floorIndex: m.metadata.builder.floorIndex|0,
          matKey: m.metadata.builder.matKey||null
        });
      } else if (tag==='wall'){
        out.walls.push({
          name: m.name,
          a: m.metadata.builder.a,
          b: m.metadata.builder.b,
          h: m.metadata.builder.h,
          t: m.metadata.builder.t,
          floorIndex: m.metadata.builder.floorIndex|0,
          matKey: m.metadata.builder.matKey||null
        });
      } else if (tag==='prop'){
        out.props.push({
          name:m.name,
          kind:m.metadata.builder.kind||'prop',
          pos:[m.position.x, m.position.y, m.position.z],
          rot:[m.rotation.x||0, m.rotation.y||0, m.rotation.z||0],
          scl:[m.scaling.x||1, m.scaling.y||1, m.scaling.z||1]
        });
      }
    });
    return out;
  }

  // ------------------------------------------------------------
  // Input wiring & modes
  // ------------------------------------------------------------
  function setMode(m){
    ST.mode = m;
    toast('Mode: '+m);
  }

  function onPointerDown(evt){
    if (evt.button!==0) return; // left only
    const p = groundHitFromPointer(); if (!p) return;

    if (ST.mode==='select'){
      const pick = S().pick(S().pointerX, S().pointerY); 
      if (pick && pick.pickedMesh){ select(pick.pickedMesh); }
      return;
    }

    beginDrag(p);
  }

  function onPointerMove(){
    if (!ST.drag.active) return;
    const p = groundHitFromPointer(); if (!p) return;
    updateDrag(p);
  }

  function onPointerUp(){
    if (!ST.drag.active) return;
    const p = groundHitFromPointer(); if (!p) return;
    endDrag(p);
  }

  function onKey(e){
    if (e.repeat) return;
    if (e.key==='s' || e.key==='S') setMode('select');
    if (e.key==='f' || e.key==='F') setMode('floor');
    if (e.key==='w' || e.key==='W') setMode('wall');
    if (e.key==='r' || e.key==='R') setMode('room'); // same as floor rectangle
    if (e.key==='c' || e.key==='C') copyRoomFromSelection();
    if (e.key==='v' || e.key==='V') pasteRoomAtPointer();
    if (e.key==='Delete'){ if (ST.sel && !ST.sel.isDisposed()){ try{ ST.sel.dispose(false,true);}catch{} ST.sel=null; } }
    if (e.ctrlKey && (e.key==='z' || e.key==='Z')) undo();
    if (e.ctrlKey && (e.key==='y' || (e.shiftKey && (e.key==='z'||e.key==='Z')))) redo();
    if (e.key==='m' || e.key==='M'){ // toggle material panel
      Materials.ensurePanel();
      const p = document.getElementById('mat-panel');
      if (p) p.style.display = (p.style.display==='none'?'block':'none');
    }
  }

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------
  const API = {
    enable(){
      if (ST.ready) return;
      ST.ready = true;

      // basic collisions on
      try{ S().collisionsEnabled = true; }catch{}

      // highlight layer
      ensureHL();

      // mouse listeners
      const c = S().getEngine().getRenderingCanvas();
      c.addEventListener('pointerdown', onPointerDown);
      c.addEventListener('pointermove', onPointerMove);
      c.addEventListener('pointerup',   onPointerUp);
      window.addEventListener('keydown', onKey);

      // material palette is available
      Materials.ensurePanel();

      toast('Builder ready. (F:Floor, W:Wall, S:Select, R:Room, M:Materials)');
    },

    setGridSnap(on, step){
      ST.grid.snap = !!on;
      ST.grid.step = Math.max(0.05, +step||0.5);
      toast('Grid: '+(ST.grid.snap?'ON ':'OFF ')+'step '+ST.grid.step);
    },
    setGrid(opts){ // alt signature
      if (opts && typeof opts.snap==='boolean') ST.grid.snap = opts.snap;
      if (opts && typeof opts.step==='number')  ST.grid.step = Math.max(0.05, opts.step);
      toast('Grid updated.');
    },

    export(){
      return exportJSON();
    },

    // for your right-side UI hooks (optional)
    setMode,
    applyMatToSelection(key){
      if (!ST.sel) return toast('No selection.');
      Materials.applyMatToMesh(ST.sel, key);
    },
    copyRoom: copyRoomFromSelection,
    pasteRoom: pasteRoomAtPointer,

    // selection utilities
    select,
  };

  // expose
  window.Builder = API;

})();
