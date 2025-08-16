// ./assets/dev/devtools.js
// Phasma-Phoney — Expanded Developer Toolkit
// Drop-in: call initDevTools({ game, scene }) after your scene is ready.
// Requires Babylon.js core + (optional) serializers for GLB export:
//   <script src="./cdn/serializers/babylon.glTF2Serializer.min.js"></script>

/* ------------------------------------------------------------------------- *
 * Small DOM helpers
 * ------------------------------------------------------------------------- */
function h(tag, attrs={}, ...kids){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='style' && typeof v==='object'){ Object.assign(el.style, v); }
    else if(k.startsWith('on') && typeof v==='function'){ el.addEventListener(k.slice(2), v); }
    else if(k==='html'){ el.innerHTML = v; }
    else { el.setAttribute(k, v); }
  }
  for(const kid of kids){ if(kid!=null) el.appendChild(typeof kid==='string'? document.createTextNode(kid): kid); }
  return el;
}
const $ = (id)=> document.getElementById(id);

/* ------------------------------------------------------------------------- *
 * Global-ish runtime state for the tools
 * ------------------------------------------------------------------------- */
const DT = {
  ctx: null,
  sel: null,         // current selection (TransformNode or Mesh)
  snap: { grid: 0.25, angle: 15, enabled: true },
  overlays: {},      // lines, markers, etc
  boundsEditing: false,
  placedPivots: [],  // model-viewer created pivots
};

/* ------------------------------------------------------------------------- *
 * Selection utilities
 * ------------------------------------------------------------------------- */
function select(node){
  DT.sel = node || null;
  const info = $('dev-info'); if(!info) return;
  if(!node){ info.textContent = 'Selection: (none)'; return; }
  try{
    const bb = node.getBoundingInfo?.().boundingBox;
    const size = bb ? bb.extendSizeWorld.scale(2) : null;
    info.textContent = `Selection: ${node.name || node.id || '(node)'} ${size? `| size ~ ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`:''}`;
  }catch{ info.textContent = `Selection: ${node.name || '(node)'}`; }
}

function attachPointerPicking(scene){
  scene.onPointerObservable.add((pi)=>{
    if(pi.type!==BABYLON.PointerEventTypes.POINTERPICK) return;
    const pick = pi.pickInfo || scene.pick(scene.pointerX, scene.pointerY, (m)=> m && m.isPickable!==false);
    if(pick?.pickedMesh){
      select(pick.pickedMesh);
      // If it belongs to a placed pivot, bubble selection up to the pivot
      const piv = findAncestorWithMeta(pick.pickedMesh, 'phasmaPlaced', true);
      if(piv) select(piv);
    }
  });
}
function findAncestorWithMeta(node, key, truthy=false){
  let n=node;
  while(n){
    if(n.metadata && key in n.metadata){
      if(!truthy || n.metadata[key]) return n;
    }
    n = n.parent;
  }
  return null;
}

/* ------------------------------------------------------------------------- *
 * Highlight helpers
 * ------------------------------------------------------------------------- */
function ensureHL(scene){
  if(!scene) return null;
  if(!scene._devtoolsHL){
    try{ scene._devtoolsHL = new BABYLON.HighlightLayer("hl-dev", scene); }
    catch(e){ console.warn("Highlight layer unavailable", e); scene._devtoolsHL = null; }
  }
  return scene._devtoolsHL;
}
function flash(node, color=BABYLON.Color3.Teal(), ms=900){
  const hl = ensureHL(DT.ctx.scene); if(!hl || !node) return;
  hl.addMesh(node, color);
  setTimeout(()=> hl.removeMesh(node), ms);
}

/* ------------------------------------------------------------------------- *
 * Gizmo manager + snapping
 * ------------------------------------------------------------------------- */
function ensureGizmo(scene){
  if(!scene._devGizmo){
    scene._devGizmo = new BABYLON.GizmoManager(scene);
    scene._devGizmo.positionGizmoEnabled = true;
    scene._devGizmo.gizmos.positionGizmo.snapDistance = DT.snap.enabled ? DT.snap.grid : 0;
  }
  return scene._devGizmo;
}
function setGizmoMode(mode){ // 'pos'|'rot'|'scl'
  const g = ensureGizmo(DT.ctx.scene);
  g.positionGizmoEnabled = (mode==='pos');
  g.rotationGizmoEnabled = (mode==='rot');
  g.scaleGizmoEnabled    = (mode==='scl');
  if(DT.sel?.getClassName?.()!=='TransformNode' && DT.sel?.getClassName?.()!=='Mesh'){
    const tn = new BABYLON.TransformNode('devPivot', DT.ctx.scene);
    tn.position.copyFrom(DT.ctx.game.camera?.position || BABYLON.Vector3.Zero());
    DT.sel = tn;
  }
  g.attachToMesh(DT.sel);
}
function updateSnapUI(){
  const g = DT.ctx.scene? ensureGizmo(DT.ctx.scene) : null;
  if(g && g.gizmos?.positionGizmo) g.gizmos.positionGizmo.snapDistance = DT.snap.enabled ? DT.snap.grid : 0;
  const e = $('snapStatus'); if(e) e.textContent = DT.snap.enabled? `on (${DT.snap.grid})` : 'off';
  const a = $('angleStatus'); if(a) a.textContent = `${DT.snap.angle}°`;
}

/* ------------------------------------------------------------------------- *
 * Model Viewer / Spawner (drag & drop)  — stores pivots with metadata
 * ------------------------------------------------------------------------- */
let _mv;

function ensureModelViewer(ctx){
  if(_mv) return _mv;
  const scene = ctx.scene;

  // UI
  const root = document.createElement('div');
  root.id = 'modelViewer';
  Object.assign(root.style, { position:'fixed', inset:'0', display:'none', zIndex:'70',
    background:'rgba(0,0,0,.72)', alignItems:'center', justifyContent:'center' });
  root.innerHTML = `
  <div class="modal" style="width:min(1100px,95vw); max-height:92vh; overflow:auto; background:linear-gradient(180deg,#07131a,#081017); border:1px solid #0ff; border-radius:14px; padding:12px; color:#cfffff; box-shadow:0 0 20px rgba(0,255,255,.22)">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
      <strong>Model Viewer / Spawner</strong>
      <div>
        <button id="mvExportGLB" class="btn">Export GLB</button>
        <button id="mvExportJSON" class="btn">Export JSON</button>
        <button id="mvExportTextures" class="btn">Download Textures</button>
        <button id="mvUnlit" class="btn" title="Toggle temporary unlit preview">Unlit: OFF</button>
        <button id="mvSnapshot" class="btn">Snapshot PNG</button>
        <button id="mvClose" class="btn">Close</button>
      </div>
    </div>

    <div class="row" style="gap:10px; flex-wrap:wrap;">
      <label class="btn" for="mvFile">Choose File</label>
      <input id="mvFile" type="file" accept=".glb,.gltf,.obj,.stl,.zip" style="display:none">
      <span class="muted">Drag & drop .glb/.gltf here • Click ground to set spawn point</span>
    </div>
    <div id="mvDrop" style="margin-top:10px; border:1px dashed #0ff6; border-radius:10px; padding:16px; text-align:center;">
      Drop file here to spawn
    </div>

    <div class="grid" style="margin-top:10px;">
      <div class="card" style="grid-column:span 12;">
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <label>X <input id="mvX" type="number" step="0.01" style="width:120px"></label>
          <label>Y <input id="mvY" type="number" step="0.01" style="width:120px"></label>
          <label>Z <input id="mvZ" type="number" step="0.01" style="width:120px"></label>
          <label>Rot Y <input id="mvRY" type="number" step="1" style="width:120px"></label>
          <label>Scale <input id="mvS" type="number" step="0.01" value="1" style="width:120px"></label>
          <button id="mvApply" class="btn">Apply</button>
          <button id="mvDelete" class="btn">Delete</button>
          <button id="mvMakePick" class="btn">Pickable</button>
          <button id="mvMakeCollide" class="btn">Collidable</button>
          <button id="mvGizmoPos" class="btn">Gizmo: Move</button>
          <button id="mvGizmoRot" class="btn">Gizmo: Rotate</button>
          <button id="mvGizmoScale" class="btn">Gizmo: Scale</button>
        </div>
      </div>

      <div class="card" style="grid-column:span 12;">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <strong>Pivot Data</strong>
          <input id="mvFilter" type="text" placeholder="filter meshes/materials/textures…" style="width:260px">
        </div>
        <div class="grid" style="margin-top:8px;">
          <div class="card" style="grid-column:span 12;">
            <details open>
              <summary>Meshes (<span id="mvCountMeshes">0</span>)</summary>
              <div id="mvMeshes"></div>
            </details>
          </div>
          <div class="card" style="grid-column:span 12;">
            <details>
              <summary>Materials (<span id="mvCountMats">0</span>)</summary>
              <div id="mvMats"></div>
            </details>
          </div>
          <div class="card" style="grid-column:span 12;">
            <details>
              <summary>Textures (<span id="mvCountTex">0</span>)</summary>
              <div id="mvTex"></div>
            </details>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column:span 12;">
        <div class="muted">Loaded nodes:</div>
        <pre id="mvList" style="margin:0; max-height:220px; overflow:auto; background:#03131a; border:1px solid #0a3; padding:8px; border-radius:8px;"></pre>
      </div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const giz = ensureGizmo(scene);

  let pivot = null;
  let lastPickedPoint = null;
  let unlitOn = false;
  const _storedMats = new Map(); // node -> original material

  function byId(id){ return document.getElementById(id); }
  function open(){ root.style.display='flex'; updateFieldsFromPivot(); refreshPivotData(); }
  function close(){ root.style.display='none'; }
  function updateFieldsFromPivot(){
    if(!pivot) return;
    byId('mvX').value = (pivot.position.x||0).toFixed(3);
    byId('mvY').value = (pivot.position.y||0).toFixed(3);
    byId('mvZ').value = (pivot.position.z||0).toFixed(3);
    byId('mvRY').value = (pivot.rotation?.y? (pivot.rotation.y*180/Math.PI).toFixed(1):'0');
    const s = pivot.scaling?.x || 1; byId('mvS').value = s.toFixed(3);
  }
  function setPivot(node){
    pivot = node;
    DT.sel = pivot;
    giz.attachToMesh(pivot);
    ensureHL(scene)?.addMesh(pivot, BABYLON.Color3.Teal()); setTimeout(()=> ensureHL(scene)?.removeMesh(pivot), 900);
    updateFieldsFromPivot();
    refreshPivotData();
  }

  function listChildren(){
    const pre = byId('mvList'); if(!pre) return;
    if(!pivot){ pre.textContent='(none)'; return; }
    pre.textContent = pivot.getChildren().map(n=> n.name).join('\n');
  }

  function collectPivot(){
    const meshes = [];
    const matsMap = new Map();
    const texMap  = new Map();
    if(!pivot) return { meshes, materials:[], textures:[] };

    const kids = pivot.getChildMeshes(true);
    kids.forEach(m=>{
      const mat = m.material;
      meshes.push({
        name: m.name || '(unnamed)',
        vertices: m.getTotalVertices?.()||0,
        indices: m.getTotalIndices?.()||0,
        material: mat?.name || null,
        pickable: !!m.isPickable,
        collisions: !!m.checkCollisions
      });
      if(mat){
        const mkey = mat.uniqueId || mat.name || Math.random().toString(36).slice(2);
        if(!matsMap.has(mkey)){
          matsMap.set(mkey, {
            name: mat.name||'(unnamed)',
            class: mat.getClassName?.() || 'Material',
            alpha: mat.alpha,
            metallic: mat.metallic || undefined,
            roughness: mat.roughness || undefined,
            backFaceCulling: mat.backFaceCulling
          });
        }
        const pushTex = (t, kind)=>{
          if(!t) return;
          const url = t.url || t._texture?.url || '';
          const key = url || (kind+Math.random());
          if(!texMap.has(key)) texMap.set(key, { kind, url });
        };
        pushTex(mat.albedoTexture || mat.diffuseTexture, 'albedo/diffuse');
        pushTex(mat.normalTexture || mat.bumpTexture, 'normal');
        pushTex(mat.metallicTexture, 'metallic/orm');
        pushTex(mat.opacityTexture, 'opacity');
        pushTex(mat.emissiveTexture, 'emissive');
      }
    });
    return { meshes, materials: Array.from(matsMap.values()), textures: Array.from(texMap.values()) };
  }

  function makeTable(rows, cols, onClick){
    const tbl = document.createElement('table');
    Object.assign(tbl.style, { width:'100%', borderCollapse:'collapse', fontSize:'12px' });
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    cols.forEach(c=>{
      const th = document.createElement('th');
      th.textContent = c; th.style.textAlign = 'left'; th.style.borderBottom = '1px solid #0a3b3f'; th.style.padding = '4px';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.style.cursor = onClick ? 'pointer' : 'default';
      cols.forEach(c=>{
        const td = document.createElement('td');
        td.textContent = (r[c]!==undefined && r[c]!==null) ? (typeof r[c]==='object'? JSON.stringify(r[c]) : String(r[c])) : '';
        td.style.borderBottom = '1px solid #082028'; td.style.padding = '4px';
        tr.appendChild(td);
      });
      if(onClick) tr.addEventListener('click', ()=> onClick(r));
      tbody.appendChild(tr);
    });
    tbl.appendChild(thead); tbl.appendChild(tbody);
    return tbl;
  }

  let lastData = { meshes:[], materials:[], textures:[] };
  function refreshPivotData(){
    if(!pivot){ byId('mvMeshes').innerHTML=''; byId('mvMats').innerHTML=''; byId('mvTex').innerHTML=''; return; }
    lastData = collectPivot();
    byId('mvCountMeshes').textContent = String(lastData.meshes.length);
    byId('mvCountMats').textContent   = String(lastData.materials.length);
    byId('mvCountTex').textContent    = String(lastData.textures.length);
    renderFiltered();
  }

  function filterData(q){
    if(!q) return lastData;
    const s = q.toLowerCase();
    const f = (obj)=> JSON.stringify(obj).toLowerCase().includes(s);
    return {
      meshes: lastData.meshes.filter(f),
      materials: lastData.materials.filter(f),
      textures: lastData.textures.filter(f)
    };
  }
  function renderFiltered(){
    const q = byId('mvFilter').value || '';
    const data = filterData(q);
    const meshesHost = byId('mvMeshes'); meshesHost.innerHTML='';
    const matsHost   = byId('mvMats');   matsHost.innerHTML='';
    const texHost    = byId('mvTex');    texHost.innerHTML='';

    const mtbl = makeTable(data.meshes, ['name','vertices','indices','material','pickable','collisions'], (row)=>{
      // highlight by name
      const m = pivot.getChildMeshes(true).find(x=> x.name===row.name);
      if(m){ flash(m); select(m); }
    });
    const matbl = makeTable(data.materials, ['name','class','alpha','metallic','roughness','backFaceCulling']);
    const ttbl = makeTable(data.textures, ['kind','url'], (row)=>{
      try{ const a=document.createElement('a'); a.href=row.url; a.download=(row.url.split('/').pop()||'texture.png'); a.click(); }catch{}
    });

    meshesHost.appendChild(mtbl);
    matsHost.appendChild(matbl);
    texHost.appendChild(ttbl);
  }

  byId('mvFilter').addEventListener('input', renderFiltered);

  const giz = ensureGizmo(scene);

  function exportGLB(){
    try{
      if(!window.BABYLON?.GLTF2Export){ alert("GLB export requires babylon.glTF2Serializer.min.js"); return; }
      if(!pivot){ alert('Nothing selected to export'); return; }
      const meshes = pivot.getChildMeshes(true);
      const tmp = new BABYLON.TransformNode('tmpExport', scene);
      meshes.forEach(m=>{ m.setParent(tmp); });
      BABYLON.GLTF2Export.GLBAsync(scene, 'selection').then(glb=>{
        glb.downloadFiles();
        // restore parents
        meshes.forEach(m=>{ m.setParent(pivot); });
        tmp.dispose();
      });
    }catch(e){ console.error(e); alert('Export failed: '+e); }
  }

  function exportJSON(){
    const meta = {
      name: pivot?.name || 'spawnPivot',
      position: pivot ? { x:pivot.position.x, y:pivot.position.y, z:pivot.position.z } : null,
      rotationY: pivot?.rotation?.y || 0,
      scale: pivot?.scaling?.x || 1,
      data: lastData
    };
    const blob = new Blob([JSON.stringify(meta, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='pivot.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(url), 0);
  }

  async function downloadTextures(){
    if(!pivot){ alert('No selection'); return; }
    const a = document.createElement('a');
    const seen = new Set();
    lastData.textures.forEach(t=>{
      if(t.url && !seen.has(t.url)){
        seen.add(t.url);
        try{ a.href=t.url; a.download=(t.url.split('/').pop()||'texture.png'); a.click(); }catch(e){ console.warn('Download failed for', t.url, e); }
      }
    });
  }

  async function snapshotPNG(){
    try{
      const data = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(DT.ctx.engine, DT.ctx.game.camera, { width: 1024, height: 1024 });
      const a = document.createElement('a'); a.href = data; a.download = 'snapshot.png'; a.click();
    }catch(e){ console.warn(e); alert('Snapshot failed'); }
  }

  function setUnlit(on){
    unlitOn = !!on;
    const kids = pivot?.getChildMeshes(true) || [];
    if(unlitOn){
      kids.forEach(m=>{
        if(!_storedMats.has(m)) _storedMats.set(m, m.material||null);
        const mat = new BABYLON.StandardMaterial('unlit', scene);
        mat.disableLighting = true;
        // show something meaningful
        const src = _storedMats.get(m);
        if(src && (src.albedoTexture||src.diffuseTexture)){
          mat.emissiveTexture = src.albedoTexture || src.diffuseTexture;
        }else{
          mat.emissiveColor = new BABYLON.Color3(1,1,1);
        }
        m.material = mat;
      });
    }else{
      kids.forEach(m=>{
        if(_storedMats.has(m)){
          m.material = _storedMats.get(m);
        }
      });
    }
    byId('mvUnlit').textContent = 'Unlit: ' + (unlitOn ? 'ON' : 'OFF');
  }

  // file input + drop
  function readFile(file){
    const url = URL.createObjectURL(file);
    spawnFromURL(url, file.name.toLowerCase()).then(()=> URL.revokeObjectURL(url));
  }
  byId('mvFile').addEventListener('change', (ev)=>{ const f=ev.target.files?.[0]; if(f) readFile(f); ev.target.value=''; });
  const drop = byId('mvDrop');
  function over(ev){ ev.preventDefault(); drop.style.background='rgba(0,255,255,0.08)'; }
  function leave(){ drop.style.background='transparent'; }
  drop.addEventListener('dragover', over); drop.addEventListener('dragleave', leave);
  drop.addEventListener('drop', (ev)=>{ ev.preventDefault(); leave(); const f=ev.dataTransfer.files?.[0]; if(f) readFile(f); });

  // pick point for spawn
  scene.onPointerObservable.add((pi)=>{
    if(root.style.display!=='flex') return;
    if(pi.type===BABYLON.PointerEventTypes.POINTERUP){
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m)=> m && m.isPickable!==false);
      if(pick?.pickedPoint) lastPickedPoint = pick.pickedPoint.clone();
    }
  });

  async function spawnFromURL(url, filename){
    if(DT.sel && DT.sel.metadata?.phasmaPlaced){ DT.sel = null; }
    const node = new BABYLON.TransformNode('spawnPivot', scene);
    node.metadata = Object.assign({}, node.metadata||{}, { phasmaPlaced:true, source: filename||url });
    DT.placedPivots.push(node);
    // Import
    const res = await BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene).catch(()=> BABYLON.SceneLoader.ImportMeshAsync("", url.replace(/[^\/]+$/, ''), url, scene));
    res.meshes.forEach(m=>{ if(!m.parent) m.parent = node; });
    // Place
    let at = null;
    if(lastPickedPoint){ at = lastPickedPoint.clone(); }
    else if(DT.ctx.game.camera){ const f = DT.ctx.game.camera.getDirection(BABYLON.Axis.Z); at = DT.ctx.game.camera.position.add(f.scale(2.5)); }
    else at = new BABYLON.Vector3(0,1,0);
    node.position.copyFrom(at); node.rotation = new BABYLON.Vector3(0,0,0); node.scaling.set(1,1,1);
    setPivot(node);
    listChildren();
    return node;
  }

  // controls
  function applyFromFields(){
    if(!pivot) return;
    const x=parseFloat(byId('mvX').value||'0'), y=parseFloat(byId('mvY').value||'1'), z=parseFloat(byId('mvZ').value||'0');
    const ry=parseFloat(byId('mvRY').value||'0')*Math.PI/180, s=parseFloat(byId('mvS').value||'1');
    pivot.position.set(x,y,z); pivot.rotation.y = ry; pivot.scaling.set(s,s,s);
  }
  byId('mvApply').onclick = applyFromFields;
  byId('mvDelete').onclick = ()=>{ if(!pivot) return; pivot.getChildren().forEach(n=> n.dispose && n.dispose()); pivot.dispose(); pivot=null; byId('mvList').textContent='(none)'; refreshPivotData(); };
  byId('mvMakePick').onclick = ()=>{ if(!pivot) return; pivot.getChildMeshes(true).forEach(n=> n.isPickable=true); refreshPivotData(); };
  byId('mvMakeCollide').onclick = ()=>{ if(!pivot) return; pivot.getChildMeshes(true).forEach(n=> n.checkCollisions=true); refreshPivotData(); };
  byId('mvGizmoPos').onclick = ()=> setGizmoMode('pos');
  byId('mvGizmoRot').onclick = ()=> setGizmoMode('rot');
  byId('mvGizmoScale').onclick = ()=> setGizmoMode('scl');
  byId('mvExportGLB').onclick = exportGLB;
  byId('mvExportJSON').onclick = exportJSON;
  byId('mvExportTextures').onclick = downloadTextures;
  byId('mvSnapshot').onclick = snapshotPNG;
  byId('mvUnlit').onclick = ()=> setUnlit(!unlitOn);
  byId('mvClose').onclick = close;

  _mv = { open, close, setPivot, spawnFromURL };
  return _mv;
}

/* ------------------------------------------------------------------------- *
 * Asset Browser (scan + filter + highlight + export JSON)
 * ------------------------------------------------------------------------- */
function collectSceneAssets(scene){
  const meshes = (scene.meshes||[]).map(m=> ({
    name: m.name || '(unnamed)', id: m.id, class: m.getClassName?.()||'Mesh',
    vertices: m.getTotalVertices?.()||0, indices: m.getTotalIndices?.()||0,
    material: m.material?.name || null, parent: m.parent?.name || null,
    visible: m.isVisible, pickable: m.isPickable, collisions: !!m.checkCollisions,
    pos: m.position && [Number(m.position.x.toFixed(3)), Number(m.position.y.toFixed(3)), Number(m.position.z.toFixed(3))]
  }));
  const materials = (scene.materials||[]).map(mat=> ({ name: mat.name||'(unnamed)', class: mat.getClassName?.()||'Material', alpha: mat.alpha, backFaceCulling: mat.backFaceCulling }));
  const texSet = new Map();
  (scene.textures||[]).forEach(t=>{
    const key = t.uid || t.name || t.url || Math.random().toString(36).slice(2);
    texSet.set(key, { name: t.name||'(unnamed)', url: t.url || t._texture?.url || '', hasAlpha: t.hasAlpha, isCube: t.isCube });
  });
  const textures = Array.from(texSet.values());
  const anims = (scene.animationGroups||[]).map(a=> ({ name:a.name, from:a.from, to:a.to, targets:a.targetedAnimations?.length||0, speedRatio:a.speedRatio }));
  const lights = (scene.lights||[]).map(l=> ({ name:l.name, class:l.getClassName?.()||'Light', intensity:l.intensity }));
  const cameras = (scene.cameras||[]).map(c=> ({ name:c.name, class:c.getClassName?.()||'Camera', fov:c.fov, mode:c.mode }));
  const skeletons = (scene.skeletons||[]).map(s=> ({ name:s.name, bones:s.bones?.length || 0 }));
  const particles = (scene.particleSystems||[]).map(p=> ({ name:p.name, capacity:p.getCapacity?.() || p.capacity }));
  return { meshes, materials, textures, anims, lights, cameras, skeletons, particles };
}
function renderAssetBrowser(ctx, data){
  let host = $('assetBrowser');
  if(!host){
    const panel = $('dev-panel'); if(!panel) return;
    host = h('div', { id:'assetBrowser', class:'card', style:{ gridColumn:'span 12' } },
      h('div', { class:'row', style:{ justifyContent:'space-between', marginBottom:'8px' } },
        h('strong', null, 'Asset Browser'),
        h('div', null,
          h('button', { class:'btn', id:'assetExport' }, 'Download JSON'),
          ' ',
          h('input', { id:'assetFilter', type:'text', placeholder:'filter by name…', style:{ marginLeft:'8px', width:'220px' } })
        )
      ),
      h('div', { id:'assetCounts', class:'muted', style:{ marginBottom:'8px' } }),
      h('div', { id:'assetTables' })
    );
    panel.parentElement.insertBefore(host, panel.nextSibling);
  }
  const counts = `Meshes: ${data.meshes.length} • Materials: ${data.materials.length} • Textures: ${data.textures.length} • AnimGroups: ${data.anims.length} • Lights: ${data.lights.length} • Cameras: ${data.cameras.length} • Skeletons: ${data.skeletons.length} • Particles: ${data.particles.length}`;
  $('assetCounts').textContent = counts;

  const tablesHost = $('assetTables'); tablesHost.innerHTML='';
  function makeTable(title, rows, columns, onRowClick){
    const wrap = h('details', { open:true, style:{ marginBottom:'8px' } }, h('summary', null, `${title} (${rows.length})`));
    const table = h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'12px' } });
    const thead = h('thead', null, h('tr', null, ...columns.map(c=> h('th', { style:{ textAlign:'left', borderBottom:'1px solid #0a3b3f', padding:'4px'} }, c)) ));
    const tbody = h('tbody');
    rows.forEach((r)=>{
      const tr = h('tr', { style:{ cursor: onRowClick? 'pointer':'default' } });
      columns.forEach(c=>{
        const v = (r[c]!==undefined && r[c]!==null) ? (typeof r[c]==='object'? JSON.stringify(r[c]) : String(r[c])) : '';
        tr.appendChild(h('td', { style:{ borderBottom:'1px solid #082028', padding:'4px' } }, v));
      });
      if(onRowClick) tr.addEventListener('click', ()=> onRowClick(r));
      tbody.appendChild(tr);
    });
    table.appendChild(thead); table.appendChild(tbody);
    wrap.appendChild(table);
    tablesHost.appendChild(wrap);
  }
  const filterInput = $('assetFilter');
  function applyFilter(){
    const q=(filterInput.value||'').toLowerCase();
    const filt=(rows)=>!q?rows: rows.filter(r=> JSON.stringify(r).toLowerCase().includes(q));
    tablesHost.innerHTML='';
    makeTable('Meshes', filt(data.meshes), ['name','class','vertices','indices','material','parent','visible','pickable','collisions','pos'], (row)=>{
      const mesh = DT.ctx.scene.meshes.find(m=> m.name===row.name);
      if(!mesh) return;
      flash(mesh); select(mesh);
      // frame
      const c = mesh.getBoundingInfo?.().boundingSphere.centerWorld;
      const r = mesh.getBoundingInfo?.().boundingSphere.radiusWorld || 2;
      const cam = DT.ctx.game.camera;
      if(cam && c){ cam.setTarget(c); const dir = cam.getDirection(BABYLON.Axis.Z).normalize(); cam.position = c.subtract(dir.scale(r*3.2)).add(new BABYLON.Vector3(0, r*0.8, 0)); }
    });
    makeTable('Materials', filt(data.materials), ['name','class','alpha','backFaceCulling']);
    makeTable('Textures', filt(data.textures), ['name','url','hasAlpha','isCube']);
    makeTable('AnimationGroups', filt(data.anims), ['name','from','to','targets','speedRatio']);
    makeTable('Lights', filt(data.lights), ['name','class','intensity']);
    makeTable('Cameras', filt(data.cameras), ['name','class','fov','mode']);
    makeTable('Skeletons', filt(data.skeletons), ['name','bones']);
    makeTable('Particles', filt(data.particles), ['name','capacity']);
  }
  $('assetFilter').oninput = applyFilter;
  applyFilter();
  $('assetExport').onclick = ()=>{
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='assets.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(url), 0);
  };
}
function scanAssets(){ try{ const data = collectSceneAssets(DT.ctx.scene); renderAssetBrowser(DT.ctx, data); }catch(e){ console.error(e); }}

/* ------------------------------------------------------------------------- *
 * Bounds editor (houseBoundsPoly) + Pins editor
 * ------------------------------------------------------------------------- */
function ensureBoundsEditor(){
  const cardId = 'boundsEditor';
  if($(cardId)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:cardId, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Layout Bounds & Pins'),
      h('div', null,
        h('button', { class:'btn', id:'beToggle' }, 'Edit Bounds: OFF'),
        ' ', h('button', { class:'btn', id:'beClear' }, 'Clear'),
        ' ', h('button', { class:'btn', id:'beExport' }, 'Export JSON')
      )
    ),
    h('div', { class:'row', style:{ gap:'8px', marginTop:'8px' } },
      h('button', { class:'btn', id:'beAddVan' }, 'Pin: Van'),
      h('button', { class:'btn', id:'beAddFront' }, 'Pin: Front Door'),
      h('button', { class:'btn', id:'beAddBack' }, 'Pin: Back Door'),
      h('button', { class:'btn', id:'beCenter' }, 'Pin: Center'),
      h('span', { id:'beStatus', class:'muted' }, 'Click in scene to add/move points.')
    )
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  function drawPoly(){
    if(DT.overlays.boundsLines) DT.overlays.boundsLines.dispose();
    const poly = DT.ctx.game.houseBoundsPoly || [];
    if(poly.length<2) return;
    const pts = poly.concat([poly[0]]);
    DT.overlays.boundsLines = BABYLON.MeshBuilder.CreateLines('boundsLines', { points: pts }, DT.ctx.scene);
    DT.overlays.boundsLines.color = new BABYLON.Color3(0,1,1);
  }
  drawPoly();

  // Toggle edit
  $('beToggle').onclick = ()=>{
    DT.boundsEditing = !DT.boundsEditing;
    $('beToggle').textContent = 'Edit Bounds: ' + (DT.boundsEditing?'ON':'OFF');
    $('beStatus').textContent = DT.boundsEditing? 'Click ground to add/move vertices • Drag points with gizmo' : 'Edit off';
  };
  $('beClear').onclick = ()=>{ DT.ctx.game.houseBoundsPoly = []; drawPoly(); };
  $('beExport').onclick = ()=>{
    const js = JSON.stringify((DT.ctx.game.houseBoundsPoly||[]).map(v=>({x:v.x,y:v.y,z:v.z})), null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([js],{type:'application/json'})); a.download='houseBoundsPoly.json'; a.click();
  };

  // Pins
  DT.ctx.game.pins = DT.ctx.game.pins || { van:[], frontdoor:[], backdoor:[], center:[] };
  function addPin(type){
    const p = DT.ctx.game.playerCapsule?.position || DT.ctx.game.camera?.position || new BABYLON.Vector3(0,0,0);
    DT.ctx.game.pins[type].push(p.clone());
    flashSphere(p, 0.2, new BABYLON.Color3(1,1,0));
  }
  $('beAddVan').onclick = ()=> addPin('van');
  $('beAddFront').onclick = ()=> addPin('frontdoor');
  $('beAddBack').onclick = ()=> addPin('backdoor');
  $('beCenter').onclick = ()=> addPin('center');

  // Pointer for bounds editing
  DT.ctx.scene.onPointerObservable.add((pi)=>{
    if(!DT.boundsEditing) return;
    if(pi.type!==BABYLON.PointerEventTypes.POINTERPICK) return;
    const pick = pi.pickInfo || DT.ctx.scene.pick(DT.ctx.scene.pointerX, DT.ctx.scene.pointerY, (m)=> m && m.isPickable!==false);
    if(!pick?.pickedPoint) return;
    const P = pick.pickedPoint.clone();
    const poly = (DT.ctx.game.houseBoundsPoly = DT.ctx.game.houseBoundsPoly || []);
    // If near existing point, move that point
    let moved=false;
    for(let i=0;i<poly.length;i++){
      if(BABYLON.Vector3.Distance(poly[i], P) < 1.0){ poly[i].copyFrom(P); moved=true; break; }
    }
    if(!moved) poly.push(P);
    drawPoly();
  });
}
function flashSphere(pos, r=0.2, color=BABYLON.Color3.Teal()){
  const s = BABYLON.MeshBuilder.CreateSphere('devDot',{diameter:r}, DT.ctx.scene);
  s.position.copyFrom(pos); s.isPickable=false;
  const m = new BABYLON.StandardMaterial('m', DT.ctx.scene); m.emissiveColor = color; s.material = m;
  setTimeout(()=> s.dispose(), 800);
}

/* ------------------------------------------------------------------------- *
 * Collision creator & primitives
 * ------------------------------------------------------------------------- */
function ensurePlacementTools(){
  const id='placementTools';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Placement & Collision Tools'),
      h('div', null,
        h('span', { class:'muted' }, 'Snap:'),
        h('button', { class:'btn', id:'snapToggle' }, 'Grid '),
        h('span', { id:'snapStatus', class:'pill' }, 'on'),
        h('button', { class:'btn', id:'angleDec' }, '− Angle'),
        h('span', { id:'angleStatus', class:'pill' }, '15°'),
        h('button', { class:'btn', id:'angleInc' }, '+ Angle'),
        h('button', { class:'btn', id:'centerToGround' }, 'Align to Ground'),
        h('button', { class:'btn', id:'dupSel' }, 'Duplicate'),
        h('button', { class:'btn', id:'delSel' }, 'Delete')
      )
    ),
    h('div', { class:'row', style:{ gap:'8px', marginTop:'8px', flexWrap:'wrap' } },
      h('button', { class:'btn', id:'gizmoPos' }, 'Gizmo: Move'),
      h('button', { class:'btn', id:'gizmoRot' }, 'Gizmo: Rotate'),
      h('button', { class:'btn', id:'gizmoScale' }, 'Gizmo: Scale'),
      h('button', { class:'btn', id:'selPickable' }, 'Set Pickable'),
      h('button', { class:'btn', id:'selCollide' }, 'Set Collidable'),
      h('button', { class:'btn', id:'createBox' }, 'New Box'),
      h('button', { class:'btn', id:'createPlane' }, 'New Plane'),
      h('button', { class:'btn', id:'createSphere' }, 'New Sphere'),
      h('button', { class:'btn', id:'makeColliderBox' }, 'Collider from Bounds')
    )
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  $('snapToggle').onclick = ()=>{ DT.snap.enabled = !DT.snap.enabled; updateSnapUI(); };
  $('angleDec').onclick = ()=>{ DT.snap.angle = Math.max(1, DT.snap.angle-5); updateSnapUI(); };
  $('angleInc').onclick = ()=>{ DT.snap.angle = Math.min(90, DT.snap.angle+5); updateSnapUI(); };
  $('gizmoPos').onclick = ()=> setGizmoMode('pos');
  $('gizmoRot').onclick = ()=> setGizmoMode('rot');
  $('gizmoScale').onclick = ()=> setGizmoMode('scl');
  $('selPickable').onclick = ()=>{ if(!DT.sel) return; (DT.sel.getChildMeshes?.(true) || [DT.sel]).forEach(n=> n.isPickable=true); flash(DT.sel); };
  $('selCollide').onclick = ()=>{ if(!DT.sel) return; (DT.sel.getChildMeshes?.(true) || [DT.sel]).forEach(n=> n.checkCollisions=true); flash(DT.sel,BABYLON.Color3.Red()); };
  $('centerToGround').onclick = ()=> alignSelectionToGround();
  $('dupSel').onclick = ()=> duplicateSelection();
  $('delSel').onclick = ()=>{ if(!DT.sel) return; DT.sel.getChildMeshes?.(true).forEach(n=> n.dispose()); DT.sel.dispose?.(); DT.sel=null; };

  $('createBox').onclick = ()=> createPrimitive('box');
  $('createPlane').onclick = ()=> createPrimitive('plane');
  $('createSphere').onclick = ()=> createPrimitive('sphere');
  $('makeColliderBox').onclick = ()=> makeColliderFromSelection();
  updateSnapUI();
}
function alignSelectionToGround(){
  const sel = DT.sel; if(!sel) return;
  const scene = DT.ctx.scene;
  const origin = sel.getAbsolutePosition?.() || sel.position;
  const ray = new BABYLON.Ray(origin.add(new BABYLON.Vector3(0,2,0)), new BABYLON.Vector3(0,-1,0), 20);
  const hit = scene.pickWithRay(ray, (m)=> m && m.checkCollisions===true);
  if(hit?.hit && hit.pickedPoint){
    const y = hit.pickedPoint.y + 0.05;
    sel.position.y = y;
  }
}
function duplicateSelection(){
  const sel = DT.sel; if(!sel) return;
  const clone = sel.clone(`${sel.name||'node'}_copy`);
  if(clone){
    clone.position.addInPlace(new BABYLON.Vector3(0.25,0,0.25));
    DT.sel = clone; ensureGizmo(DT.ctx.scene).attachToMesh(clone);
  }
}
function createPrimitive(kind){
  const s = DT.ctx.scene;
  const t = new BABYLON.TransformNode('primitivePivot', s);
  t.metadata = { phasmaPlaced:true, source: kind };
  let mesh=null;
  if(kind==='box') mesh = BABYLON.MeshBuilder.CreateBox('box',{ size:1 }, s);
  if(kind==='plane') mesh = BABYLON.MeshBuilder.CreatePlane('plane',{ size:1 }, s);
  if(kind==='sphere') mesh = BABYLON.MeshBuilder.CreateSphere('sphere',{ diameter:1 }, s);
  mesh.parent = t; mesh.isPickable = true; mesh.checkCollisions = true;
  if(DT.ctx.game?.camera){ const f=DT.ctx.game.camera.getDirection(BABYLON.Axis.Z); t.position = DT.ctx.game.camera.position.add(f.scale(2)); }
  select(t); ensureGizmo(s).attachToMesh(t);
}
function makeColliderFromSelection(){
  const sel = DT.sel; if(!sel) return;
  const s = DT.ctx.scene;
  const bb = sel.getBoundingInfo?.().boundingBox; if(!bb){ alert('No bounds'); return; }
  const size = bb.extendSizeWorld.scale(2);
  const box = BABYLON.MeshBuilder.CreateBox('collider',{ width:size.x, height:size.y, depth:size.z }, s);
  box.position.copyFrom(bb.centerWorld);
  box.checkCollisions = true; box.isPickable = false; box.visibility = 0.2;
  const mat = new BABYLON.StandardMaterial('colliderM', s); mat.wireframe = true; mat.emissiveColor = new BABYLON.Color3(0,1,0.2); box.material = mat;
  select(box);
}

/* ------------------------------------------------------------------------- *
 * Ghost Inspector (edit stats/behavior live)
 * ------------------------------------------------------------------------- */
function ensureGhostInspector(){
  const id='ghostInspector';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Ghost Inspector'),
      h('div', null, h('button', { class:'btn', id:'giApply' }, 'Apply'), ' ', h('button',{class:'btn',id:'giTp'},'TP to Ghost'), ' ', h('button',{class:'btn',id:'giShowFov'},'Toggle FOV'))
    ),
    h('div', { class:'row', style:{ gap:'10px', flexWrap:'wrap', marginTop:'8px' } },
      h('label', null, 'Type ', typeSelect()),
      h('label', null, 'Speed <input id="giSpeed" type="number" step="0.05" value="1.7" style="width:90px">'),
      h('label', null, 'FOV° <input id="giFov" type="number" step="1" value="60" style="width:90px">'),
      h('label', null, 'LOS Dist <input id="giLos" type="number" step="0.5" value="18" style="width:90px">'),
      h('label', null, 'Hunt Sanity% <input id="giHS" type="number" step="1" value="50" style="width:90px">'),
      h('label', null, 'Outside OK <input id="giOutside" type="checkbox">')
    )
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  // Pre-fill from game if possible
  updateGhostFields();
  $('giApply').onclick = applyGhostFields;
  $('giTp').onclick = ()=>{ const gp=DT.ctx.game.ghostPivot; if(!gp || !DT.ctx.game.playerCapsule) return; DT.ctx.game.playerCapsule.position.copyFrom(gp.position.add(new BABYLON.Vector3(0,0.2,-2))); };
  $('giShowFov').onclick = toggleFOVLines;
  function typeSelect(){
    const sel = h('select', { id:'giType' });
    const names = Object.keys(window.ghostProfiles||{}).sort();
    names.forEach(n=> sel.appendChild(h('option', { value:n }, n)));
    return sel;
  }
}
function updateGhostFields(){
  const g = DT.ctx.game;
  if(!g) return;
  const prof = g.ghost?.profile?.name || Object.keys(window.ghostProfiles||{})[0] || 'Spirit';
  if($('giType')) $('giType').value = prof;
  if($('giSpeed')) $('giSpeed').value = g.ghostSpeed || 1.7;
  if($('giFov')) $('giFov').value = g.ghostFOVdeg || 60;
  if($('giLos')) $('giLos').value = g.ghostLOSDist || 18;
  if($('giHS')) $('giHS').value = g.huntSanityThreshold || 50;
  if($('giOutside')) $('giOutside').checked = !!g.ghostOutsideAllowed;
}
function applyGhostFields(){
  const g = DT.ctx.game; if(!g) return;
  g.ghost = g.ghost || { profile:{ name: $('giType')?.value || 'Spirit' } };
  g.ghost.profile.name = $('giType')?.value || g.ghost.profile.name;
  g.ghostSpeed = parseFloat($('giSpeed')?.value||'1.7');
  g.ghostFOVdeg = parseFloat($('giFov')?.value||'60');
  g.ghostLOSDist = parseFloat($('giLos')?.value||'18');
  g.huntSanityThreshold = parseFloat($('giHS')?.value||'50');
  g.ghostOutsideAllowed = !!$('giOutside')?.checked;
  // Visual FOV update
  if(DT.overlays.fovLines) drawFOVLines();
}
function drawFOVLines(){
  // Draw cone lines from ghost pivot
  const s = DT.ctx.scene, g = DT.ctx.game;
  if(DT.overlays.fovLines) DT.overlays.fovLines.dispose();
  if(!g.ghostPivot) return;
  const deg = (g.ghostFOVdeg||60) * Math.PI/180;
  const len = g.ghostLOSDist || 18;
  const forward = new BABYLON.Vector3(0,0,1);
  const left = BABYLON.Vector3.TransformNormal(forward, BABYLON.Matrix.RotationY(-deg/2)).scale(len);
  const right= BABYLON.Vector3.TransformNormal(forward, BABYLON.Matrix.RotationY(+deg/2)).scale(len);
  const base = g.ghostPivot.position.clone();
  DT.overlays.fovLines = BABYLON.MeshBuilder.CreateLines('fov', { points:[base, base.add(left), base, base.add(right)] }, s);
  DT.overlays.fovLines.color = new BABYLON.Color3(1,0.9,0.2);
}
function toggleFOVLines(){ if(DT.overlays.fovLines){ DT.overlays.fovLines.dispose(); DT.overlays.fovLines=null; } else { drawFOVLines(); }}

/* ------------------------------------------------------------------------- *
 * Live Export (scene.json and HTML with inline config)
 * ------------------------------------------------------------------------- */
function collectPlaced(){
  const scene = DT.ctx.scene;
  const pivots = [...DT.placedPivots];
  scene.transformNodes?.forEach(t=>{ if(t?.metadata?.phasmaPlaced && !pivots.includes(t)) pivots.push(t); });
  const placed = [];
  for(const p of pivots){
    if(p.isDisposed?.()) continue;
    const entry = {
      name: p.name||'spawnPivot',
      source: (p.metadata && p.metadata.source) || '',
      position: { x:p.position.x, y:p.position.y, z:p.position.z },
      rotationY: p.rotation?.y || 0,
      scale: p.scaling?.x || 1,
      pickable: false, collidable: false, nodes: []
    };
    p.getChildren().forEach(n=>{
      if(n.isMesh || n.getClassName?.()==='Mesh'){
        entry.pickable = entry.pickable || !!n.isPickable;
        entry.collidable = entry.collidable || !!n.checkCollisions;
        entry.nodes.push({ name:n.name, material:n.material?.name||null });
      }
    });
    if(entry.source.startsWith('blob:')) entry.source = 'REPLACE_WITH_ASSET_PATH/'+(entry.name||'model')+'.glb';
    placed.push(entry);
  }
  return placed;
}
function buildSceneConfig(){
  const g = DT.ctx.game || {};
  return {
    version:1,
    mapFile: g.mapFile || null,
    mapScale: g.mapScale || 1,
    mapYOffset: g.mapYOffset || 0,
    groundOffset: g.groundOffset || -0.1,
    houseBoundsPoly: Array.isArray(g.houseBoundsPoly)? g.houseBoundsPoly.map(v=>({x:v.x,y:v.y,z:v.z})) : null,
    pins: g.pins || null,
    placed: collectPlaced(),
    sprites: g.sprites || [],
    lights: g.lights || [],
    doors: g.doors || [],
    ghost: {
      type: g.ghost?.profile?.name || null,
      speed: g.ghostSpeed || 1.7,
      fovDeg: g.ghostFOVdeg || 60,
      losDist: g.ghostLOSDist || 18,
      huntSanity: g.huntSanityThreshold || 50
    }
  };
}
function downloadText(text, filename){
  const blob = new Blob([text], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(url), 0);
}
function ensureApplySceneConfigSnippet(){
  return `\n<script id="scene-apply-config">(()=>{\n`+
  `function parseCfg(){const el=document.getElementById('scene-config'); if(!el) return null; try{return JSON.parse(el.textContent);}catch(e){console.warn('Bad scene-config JSON',e); return null;}}\n`+
  `async function importPlaced(scene, placed){ for(const p of placed||[]){ try{ const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', p.source, scene); const pivot = new BABYLON.TransformNode(p.name||'spawnPivot', scene); res.meshes.forEach(m=>{ if(!m.parent) m.parent=pivot; }); pivot.position = new BABYLON.Vector3(p.position.x, p.position.y, p.position.z); pivot.rotation = new BABYLON.Vector3(0, p.rotationY||0, 0); const s = p.scale||1; pivot.scaling = new BABYLON.Vector3(s,s,s); pivot.getChildren().forEach(n=>{ if(p.pickable) n.isPickable=true; if(p.collidable) n.checkCollisions=true; }); }catch(e){ console.warn('Import failed for', p.source, e); } } }\n`+
  `async function run(){ const g=window.game; if(!g||!g.scene){ setTimeout(run, 300); return; } const cfg=parseCfg(); if(!cfg) return; if(cfg.houseBoundsPoly){ g.houseBoundsPoly = cfg.houseBoundsPoly.map(o=> new BABYLON.Vector3(o.x,o.y,o.z)); } if(cfg.pins){ g.pins = cfg.pins; } if(cfg.ghost){ g.ghost = g.ghost||{profile:{}}; g.ghost.profile.name = cfg.ghost.type; g.ghostSpeed = cfg.ghost.speed; g.ghostFOVdeg = cfg.ghost.fovDeg; g.ghostLOSDist = cfg.ghost.losDist; g.huntSanityThreshold = cfg.ghost.huntSanity; } if(Array.isArray(cfg.placed)){ await importPlaced(g.scene, cfg.placed); } }\n`+
  `run();\n`+
  `})();</script>\n`;
}
function exportSceneJSON(){ const cfg = buildSceneConfig(); downloadText(JSON.stringify(cfg,null,2), 'scene.json'); }
function exportHTMLWithConfig(){
  const cfg = buildSceneConfig();
  let html = document.documentElement.outerHTML;
  const cfgTag = `<script id="scene-config" type="application/json">${JSON.stringify(cfg)}</script>`;
  if(html.includes('id="scene-config"')) html = html.replace(/<script id="scene-config"[^>]*>[\\s\\S]*?<\\/script>/, cfgTag);
  else html = html.replace('</body>', cfgTag + ensureApplySceneConfigSnippet() + '</body>');
  if(!html.includes('id="scene-apply-config"')) html = html.replace('</body>', ensureApplySceneConfigSnippet() + '</body>');
  downloadText(html, 'index_export.html');
}
function injectExportButtons(){
  if($('exportButtons')) return;
  const panel = $('dev-panel'); if(!panel) return;
  const wrap = h('div', { id:'exportButtons', class:'row', style:{ gap:'8px', marginTop:'8px' } },
    h('button', { class:'btn', id:'expJson' }, 'Export scene.json'),
    h('button', { class:'btn', id:'expHtml' }, 'Generate HTML (inline config)')
  );
  panel.parentElement.insertBefore(wrap, panel.nextSibling);
  $('expJson').onclick = exportSceneJSON;
  $('expHtml').onclick = exportHTMLWithConfig;
}


/* ------------------------------------------------------------------------- *
 * Door Editor
 * ------------------------------------------------------------------------- */
function ensureDoorEditor(){
  const id='doorEditor';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Door Editor'),
      h('div', null,
        h('label', null, 'Axis ',
          (function(){ const s=h('select',{id:'doorAxis'}); ['x','y','z'].forEach(a=> s.appendChild(h('option',{value:a},a.toUpperCase()))); s.value='y'; return s; })()
        ),
        ' ',
        h('label', null, 'Open° <input id="doorAngle" type="number" value="90" style="width:80px">'),
        ' ',
        h('label', null, 'Speed (°/s) <input id="doorSpeed" type="number" value="120" style="width:90px">')
      )
    ),
    h('div', { class:'row', style:{ gap:'8px', marginTop:'8px', flexWrap:'wrap' } },
      h('button', { class:'btn', id:'doorMark' }, 'Mark Selected as Door'),
      h('button', { class:'btn', id:'doorHingeCenter' }, 'Hinge: Center'),
      h('button', { class:'btn', id:'doorHingeLeft' }, 'Hinge: Left Edge'),
      h('button', { class:'btn', id:'doorHingeRight' }, 'Hinge: Right Edge'),
      h('button', { class:'btn', id:'doorHingePick' }, 'Hinge: Pick Point'),
      h('button', { class:'btn', id:'doorTestOpen' }, 'Test Open'),
      h('button', { class:'btn', id:'doorTestClose' }, 'Test Close'),
      h('button', { class:'btn', id:'doorSave' }, 'Save Door'),
      h('button', { class:'btn', id:'doorExport' }, 'Export Doors JSON')
    ),
    h('div', { id:'doorStatus', class:'muted', style:{ marginTop:'6px' } }, 'Select a door mesh, then set hinge and test.')
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  DT.ctx.game.doors = DT.ctx.game.doors || [];
  let lastPickPoint = null;
  DT.ctx.scene.onPointerObservable.add((pi)=>{
    if(pi.type===BABYLON.PointerEventTypes.POINTERUP){
      const pick = DT.ctx.scene.pick(DT.ctx.scene.pointerX, DT.ctx.scene.pointerY, (m)=> m && m.isPickable!==false);
      if(pick?.pickedPoint) lastPickPoint = pick.pickedPoint.clone();
    }
  });

  function doorMesh(){ return (DT.sel && DT.sel.getClassName?.()==='Mesh') ? DT.sel : null; }
  function setStatus(t){ const el=$('doorStatus'); if(el) el.textContent = t; }
  function markDoor(){
    const m = doorMesh(); if(!m){ setStatus('Select a mesh first.'); return; }
    m.metadata = Object.assign({}, m.metadata||{}, { isDoor:true });
    flash(m); setStatus(`Marked ${m.name} as door.`);
  }
  function setHinge(mode){
    const m = doorMesh(); if(!m){ setStatus('Select a mesh first.'); return; }
    const bb = m.getBoundingInfo()?.boundingBox;
    let hinge = null;
    if(mode==='center' && bb) hinge = bb.centerWorld.clone();
    if(mode==='left' && bb){
      const min = bb.minimumWorld, max = bb.maximumWorld;
      hinge = new BABYLON.Vector3(min.x, (min.y+max.y)/2, (min.z+max.z)/2);
    }
    if(mode==='right' && bb){
      const min = bb.minimumWorld, max = bb.maximumWorld;
      hinge = new BABYLON.Vector3(max.x, (min.y+max.y)/2, (min.z+max.z)/2);
    }
    if(mode==='pick'){
      hinge = lastPickPoint ? lastPickPoint.clone() : (bb? bb.centerWorld.clone() : m.getAbsolutePosition());
    }
    if(!hinge){ setStatus('Could not compute hinge.'); return; }
    m.setPivotPoint(hinge, BABYLON.Space.WORLD);
    flashSphere(hinge, 0.15, new BABYLON.Color3(1,1,0));
    setStatus(`Set hinge @ ${hinge.toString()}`);
  }
  function cfgFromUI(){
    return {
      axis: ($('doorAxis')?.value||'y'),
      angle: parseFloat($('doorAngle')?.value||'90'),
      speed: parseFloat($('doorSpeed')?.value||'120')
    };
  }
  function animateDoor(open){
    const m = doorMesh(); if(!m) return;
    const cfg = cfgFromUI();
    const axis = cfg.axis.toLowerCase();
    const target = (open? cfg.angle : 0) * Math.PI/180;
    m._devDoor = m._devDoor || { t: 0 };
    const start = m._devDoor.current || 0;
    const diff = target - start;
    const dur = Math.max(0.05, Math.abs(diff) / (cfg.speed * Math.PI/180)); // seconds
    const t0 = performance.now();
    const s = DT.ctx.scene;
    const sub = s.onBeforeRenderObservable.add(()=>{
      const t = (performance.now() - t0) / (dur*1000);
      const k = t>=1 ? 1 : t;
      const val = start + diff * k;
      m._devDoor.current = val;
      const rot = m.rotation.clone();
      if(axis==='x') rot.x = val;
      if(axis==='y') rot.y = val;
      if(axis==='z') rot.z = val;
      m.rotation = rot;
      if(k>=1){ s.onBeforeRenderObservable.remove(sub); }
    });
  }
  function saveDoor(){
    const m = doorMesh(); if(!m){ setStatus('Select a mesh first.'); return; }
    const entry = Object.assign({
      meshName: m.name,
      pivot: (function(){ const p=m.getPivotPoint(BABYLON.Space.WORLD); return { x:p.x, y:p.y, z:p.z }; })()
    }, cfgFromUI());
    const list = DT.ctx.game.doors;
    const idx = list.findIndex(d=> d.meshName===entry.meshName);
    if(idx>=0) list[idx] = entry; else list.push(entry);
    setStatus(`Saved door config for ${m.name}.`);
  }
  function exportDoors(){
    const text = JSON.stringify(DT.ctx.game.doors||[], null, 2);
    downloadText(text, 'doors.json');
  }

  $('doorMark').onclick = markDoor;
  $('doorHingeCenter').onclick = ()=> setHinge('center');
  $('doorHingeLeft').onclick = ()=> setHinge('left');
  $('doorHingeRight').onclick = ()=> setHinge('right');
  $('doorHingePick').onclick = ()=> setHinge('pick');
  $('doorTestOpen').onclick = ()=> animateDoor(true);
  $('doorTestClose').onclick = ()=> animateDoor(false);
  $('doorSave').onclick = saveDoor;
  $('doorExport').onclick = exportDoors;
}

/* ------------------------------------------------------------------------- *
 * Sprite Manager
 * ------------------------------------------------------------------------- */
function ensureSpriteManager(){
  const id='spriteManager';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Sprite Manager'),
      h('div', null,
        h('label', null, 'Billboard <input id="spBill" type="checkbox" checked>'),
        ' ',
        h('label', null, 'Width <input id="spW" type="number" value="1" step="0.05" style="width:80px">'),
        ' ',
        h('label', null, 'Height <input id="spH" type="number" value="1" step="0.05" style="width:80px">'),
        ' ',
        h('label', null, 'AlphaCut <input id="spAlpha" type="number" value="0.05" step="0.01" style="width:80px">')
      )
    ),
    h('div', { class:'row', style:{ gap:'8px', marginTop:'8px', flexWrap:'wrap' } },
      h('label', { class:'btn', for:'spFile' }, 'Choose Image'),
      h('input', { id:'spFile', type:'file', accept:'.png,.jpg,.jpeg,.webp', style:'display:none' }),
      h('div', { id:'spDrop', class:'pill', style:{ border:'1px dashed #0ff6', padding:'8px' } }, 'Drag & drop image here to spawn'),
      h('button', { class:'btn', id:'spExport' }, 'Export Sprites JSON')
    ),
    h('div', { id:'spStatus', class:'muted', style:{ marginTop:'6px' } }, 'Drop an image, then click ground to position.')
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  DT.ctx.game.sprites = DT.ctx.game.sprites || [];

  let lastPick = null;
  DT.ctx.scene.onPointerObservable.add((pi)=>{
    if(pi.type===BABYLON.PointerEventTypes.POINTERUP){
      const pick = DT.ctx.scene.pick(DT.ctx.scene.pointerX, DT.ctx.scene.pointerY, (m)=> m && m.isPickable!==false);
      if(pick?.pickedPoint) lastPick = pick.pickedPoint.clone();
    }
  });
  function status(t){ $('spStatus').textContent = t; }

  function spawnSprite(url){
    const s = DT.ctx.scene;
    const w = parseFloat($('spW').value||'1'), h = parseFloat($('spH').value||'1'), bill = !!$('spBill').checked, alpha = parseFloat($('spAlpha').value||'0');
    const plane = BABYLON.MeshBuilder.CreatePlane('spritePlane', { width:w, height:h, sideOrientation:BABYLON.Mesh.DOUBLESIDE }, s);
    plane.isPickable = true;
    const mat = new BABYLON.StandardMaterial('spriteMat', s);
    mat.diffuseTexture = new BABYLON.Texture(url, s, true, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new BABYLON.Color3(1,1,1);
    mat.alphaCutOff = alpha;
    plane.material = mat;
    plane.billboardMode = bill ? BABYLON.AbstractMesh.BILLBOARDMODE_Y : BABYLON.AbstractMesh.BILLBOARDMODE_NONE;
    plane.position = lastPick ? lastPick.clone() : (DT.ctx.game.camera ? DT.ctx.game.camera.position.add(DT.ctx.game.camera.getDirection(BABYLON.Axis.Z).scale(2)) : new BABYLON.Vector3(0,1,0));
    ensureGizmo(DT.ctx.scene).attachToMesh(plane);
    DT.ctx.game.sprites.push({ url, w, h, bill, alpha, position:{ x:plane.position.x, y:plane.position.y, z:plane.position.z } });
    status('Sprite spawned.');
  }

  function readImage(file){
    const url = URL.createObjectURL(file);
    spawnSprite(url);
  }

  $('spFile').addEventListener('change', (ev)=>{ const f=ev.target.files?.[0]; if(f) readImage(f); ev.target.value=''; });
  const drop = $('spDrop');
  function over(ev){ ev.preventDefault(); drop.style.background='rgba(0,255,255,0.08)'; }
  function leave(){ drop.style.background='transparent'; }
  drop.addEventListener('dragover', over); drop.addEventListener('dragleave', leave);
  drop.addEventListener('drop', (ev)=>{ ev.preventDefault(); leave(); const f=ev.dataTransfer.files?.[0]; if(f) readImage(f); });

  $('spExport').onclick = ()=> downloadText(JSON.stringify(DT.ctx.game.sprites||[], null, 2), 'sprites.json');
}

/* ------------------------------------------------------------------------- *
 * Light Painter
 * ------------------------------------------------------------------------- */
function ensureLightPainter(){
  const id='lightPainter';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Light Painter'),
      h('div', null,
        h('label', null, 'Type ',
          (function(){ const s=h('select',{id:'lpType'}); ['Point','Spot','Directional'].forEach(a=> s.appendChild(h('option',{value:a},a))); s.value='Point'; return s; })()
        ),
        ' ',
        h('label', null, 'Color <input id="lpColor" type="text" value="#ffffff" style="width:90px">'),
        ' ',
        h('label', null, 'Intensity <input id="lpInt" type="number" step="0.1" value="1.2" style="width:80px">'),
        ' ',
        h('label', null, 'Range <input id="lpRange" type="number" step="0.5" value="18" style="width:80px">'),
        ' ',
        h('label', null, 'Spot° <input id="lpAngle" type="number" step="1" value="35" style="width:70px">'),
        ' ',
        h('label', null, 'Shadows <input id="lpShadow" type="checkbox">')
      )
    ),
    h('div', { class:'row', style:{ gap:'8px', marginTop:'8px', flexWrap:'wrap' } },
      h('button', { class:'btn', id:'lpAdd' }, 'Add Light'),
      h('button', { class:'btn', id:'lpExport' }, 'Export Lights JSON')
    ),
    h('div', { id:'lpStatus', class:'muted', style:{ marginTop:'6px' } }, 'Use gizmo to move/aim lights. Directional/Spot use rotation for aim.')
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  DT.ctx.game.lights = DT.ctx.game.lights || [];
  function hexToColor3(hex){
    hex = hex.trim();
    if(hex[0]==='#') hex = hex.slice(1);
    if(hex.length===3) hex = hex.split('').map(c=> c+c).join('');
    const num = parseInt(hex, 16);
    const r = ((num>>16)&255)/255, g = ((num>>8)&255)/255, b = (num&255)/255;
    return new BABYLON.Color3(r,g,b);
  }

  $('lpAdd').onclick = ()=>{
    const type = $('lpType').value;
    const color = hexToColor3($('lpColor').value||'#ffffff');
    const intensity = parseFloat($('lpInt').value||'1.2');
    const range = parseFloat($('lpRange').value||'18');
    const angleDeg = parseFloat($('lpAngle').value||'35');
    const doShadow = !!$('lpShadow').checked;
    const s = DT.ctx.scene;
    let L=null;
    if(type==='Point'){
      L = new BABYLON.PointLight('lpPoint', DT.ctx.game.camera? DT.ctx.game.camera.position.clone(): new BABYLON.Vector3(0,3,0), s);
      L.range = range;
    }else if(type==='Spot'){
      L = new BABYLON.SpotLight('lpSpot', DT.ctx.game.camera? DT.ctx.game.camera.position.clone(): new BABYLON.Vector3(0,3,0), new BABYLON.Vector3(0,-1,0), angleDeg*Math.PI/180, 2, s);
      L.range = range;
    }else{
      L = new BABYLON.DirectionalLight('lpDir', new BABYLON.Vector3(-0.4,-1,-0.2), s);
    }
    L.diffuse = color; L.specular = color; L.intensity = intensity;

    ensureGizmo(s).attachToMesh(L);

    if(doShadow && (L.getTypeID?.()===BABYLON.Light.LIGHTTYPEID_DIRECTIONALLIGHT || L.getTypeID?.()===BABYLON.Light.LIGHTTYPEID_SPOTLIGHT)){
      try{
        const sg = new BABYLON.ShadowGenerator(1024, L);
        sg.useExponentialShadowMap = true;
        sg.bias = 0.0006;
        s.meshes.forEach(m=>{ if(m.receiveShadows!==undefined) m.receiveShadows = true; if(m.isVerticesDataPresent && m.getTotalVertices?.()>0) sg.addShadowCaster(m, true); });
      }catch(e){ console.warn('Shadow generator failed', e); }
    }

    const rec = { type, color: $('lpColor').value, intensity, range, angle: angleDeg, shadow: doShadow,
      position: { x:L.position?.x||0, y:L.position?.y||0, z:L.position?.z||0 },
      direction: { x:L.direction?.x||0, y:L.direction?.y||0, z:L.direction?.z||0 } };
    DT.ctx.game.lights.push(rec);
    $('lpStatus').textContent = `Added ${type} light.`;
  };

  $('lpExport').onclick = ()=> downloadText(JSON.stringify(DT.ctx.game.lights||[], null, 2), 'lights.json');
}

/* ------------------------------------------------------------------------- *
 * Session Autosave (localStorage)
 * ------------------------------------------------------------------------- */
function ensureAutosave(){
  const id='autosaveCard';
  if($(id)) return;
  const panel = $('dev-panel'); if(!panel) return;
  const card = h('div', { id:id, class:'card', style:{ gridColumn:'span 12' } },
    h('div', { class:'row', style:{ justifyContent:'space-between' } },
      h('strong', null, 'Session Autosave'),
      h('div', null,
        h('label', null, 'Enable <input id="asOn" type="checkbox">'),
        ' ',
        h('button', { class:'btn', id:'asSave' }, 'Save Now'),
        ' ',
        h('button', { class:'btn', id:'asLoad' }, 'Load'),
        ' ',
        h('button', { class:'btn', id:'asClear' }, 'Clear')
      )
    ),
    h('div', { id:'asStatus', class:'muted', style:{ marginTop:'6px' } }, 'Stores layout to localStorage: bounds, pins, placed props, doors, sprites, lights, ghost tuning.')
  );
  panel.parentElement.insertBefore(card, panel.nextSibling);

  const KEY='phasma_dev_session';
  function status(t){ $('asStatus').textContent = t; }
  function save(){
    const cfg = buildSceneConfig();
    try{ localStorage.setItem(KEY, JSON.stringify(cfg)); status('Saved to localStorage.'); }catch(e){ status('Save failed: '+e); }
  }
  function load(){
    try{
      const raw = localStorage.getItem(KEY); if(!raw){ status('Nothing saved.'); return; }
      const cfg = JSON.parse(raw);
      applySceneConfig(cfg).then(()=> status('Loaded from localStorage.'));
    }catch(e){ status('Load failed: '+e); }
  }
  function clear(){ localStorage.removeItem(KEY); status('Cleared.'); }
  $('asSave').onclick = save;
  $('asLoad').onclick = load;
  $('asClear').onclick = clear;

  let timer=null;
  $('asOn').onchange = (ev)=>{
    if(ev.target.checked){
      timer = setInterval(save, 8000);
      status('Autosave ON (every ~8s).');
    }else{
      if(timer) clearInterval(timer);
      timer=null;
      status('Autosave OFF.');
    }
  };
}

/* ------------------------------------------------------------------------- *
 * Apply Scene Config (usable by autosave & export snippet)
 * ------------------------------------------------------------------------- */
async function applySceneConfig(cfg){
  const g=DT.ctx.game, scene=DT.ctx.scene;
  if(cfg.houseBoundsPoly){ g.houseBoundsPoly = cfg.houseBoundsPoly.map(o=> new BABYLON.Vector3(o.x,o.y,o.z)); }
  if(cfg.pins){ g.pins = cfg.pins; }
  if(cfg.ghost){ g.ghost = g.ghost||{profile:{}}; g.ghost.profile.name = cfg.ghost.type; g.ghostSpeed = cfg.ghost.speed; g.ghostFOVdeg = cfg.ghost.fovDeg; g.ghostLOSDist = cfg.ghost.losDist; g.huntSanityThreshold = cfg.ghost.huntSanity; }
  if(Array.isArray(cfg.placed)){
    for(const p of cfg.placed){
      try{
        const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', p.source, scene);
        const pivot = new BABYLON.TransformNode(p.name||'spawnPivot', scene);
        res.meshes.forEach(m=>{ if(!m.parent) m.parent=pivot; });
        pivot.position = new BABYLON.Vector3(p.position.x, p.position.y, p.position.z);
        pivot.rotation = new BABYLON.Vector3(0, p.rotationY||0, 0);
        const s = p.scale||1; pivot.scaling = new BABYLON.Vector3(s,s,s);
        pivot.getChildren().forEach(n=>{ if(p.pickable) n.isPickable=true; if(p.collidable) n.checkCollisions=true; });
        DT.placedPivots.push(pivot);
      }catch(e){ console.warn('Import failed for', p.source, e); }
    }
  }
  if(Array.isArray(cfg.sprites)){
    cfg.sprites.forEach(sp=>{
      const plane = BABYLON.MeshBuilder.CreatePlane('spritePlane',{ width:sp.w, height:sp.h, sideOrientation:BABYLON.Mesh.DOUBLESIDE }, scene);
      const mat = new BABYLON.StandardMaterial('spriteMat', scene);
      mat.diffuseTexture = new BABYLON.Texture(sp.url, scene, true, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
      mat.useAlphaFromDiffuseTexture = true; mat.emissiveColor = new BABYLON.Color3(1,1,1);
      mat.alphaCutOff = sp.alpha||0.05; plane.material = mat;
      plane.billboardMode = sp.bill ? BABYLON.AbstractMesh.BILLBOARDMODE_Y : BABYLON.AbstractMesh.BILLBOARDMODE_NONE;
      plane.position = new BABYLON.Vector3(sp.position.x, sp.position.y, sp.position.z);
    });
  }
  if(Array.isArray(cfg.lights)){
    cfg.lights.forEach(L=>{
      const col = (function(hex){ hex = (hex||'#fff').replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return new BABYLON.Color3(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); }) (L.color);
      let light=null;
      if(L.type==='Point'){ light = new BABYLON.PointLight('p', new BABYLON.Vector3(L.position.x,L.position.y,L.position.z), scene); light.range = L.range||18; }
      else if(L.type==='Spot'){ light = new BABYLON.SpotLight('s', new BABYLON.Vector3(L.position.x,L.position.y,L.position.z), new BABYLON.Vector3(L.direction.x,L.direction.y,L.direction.z), (L.angle||35)*Math.PI/180, 2, scene); light.range=L.range||18; }
      else { light = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(L.direction.x,L.direction.y,L.direction.z), scene); }
      light.diffuse = col; light.specular = col; light.intensity = L.intensity||1;
      if(L.shadow && (light.getTypeID?.()===BABYLON.Light.LIGHTTYPEID_DIRECTIONALLIGHT || L.getTypeID?.()===BABYLON.Light.LIGHTTYPEID_SPOTLIGHT)){
        try{ const sg = new BABYLON.ShadowGenerator(1024, light); sg.useExponentialShadowMap = true; sg.bias=0.0006; scene.meshes.forEach(m=>{ if(m.receiveShadows!==undefined) m.receiveShadows=true; if(m.isVerticesDataPresent && m.getTotalVertices?.()>0) sg.addShadowCaster(m, true); }); }catch(e){}
      }
    });
  }
  if(Array.isArray(cfg.doors)){
    g.doors = cfg.doors;
    cfg.doors.forEach(d=>{
      const m = scene.getMeshByName(d.meshName);
      if(m){
        const pivot = new BABYLON.Vector3(d.pivot.x,d.pivot.y,d.pivot.z);
        m.setPivotPoint(pivot, BABYLON.Space.WORLD);
        m.metadata = Object.assign({}, m.metadata||{}, { isDoor:true, doorAxis:d.axis, doorAngle:d.angle, doorSpeed:d.speed });
      }
    });
  }
}

/* ------------------------------------------------------------------------- *
 * Inject model viewer & new sections into existing dev panel
 * ------------------------------------------------------------------------- */
export function initDevTools({ game, scene }){
  DT.ctx = { game, scene, engine: game.engine || scene.getEngine() };

  // Attach pick to select anything
  attachPointerPicking(scene);

  // Inject panels
  ensurePlacementTools();
  ensureBoundsEditor();
  ensureGhostInspector();
  ensureDoorEditor();
  ensureSpriteManager();
  ensureLightPainter();
  ensureAutosave();
  injectExportButtons();

  // Ensure Model Viewer button
  const panel = $('dev-panel');
  if(panel && !panel.querySelector('[data-dev="open-model-viewer"]')){
    const btn = h('button', { class:'dev-btn btn', 'data-dev':'open-model-viewer' }, 'Model Viewer');
    panel.appendChild(btn);
    btn.addEventListener('click', ()=> ensureModelViewer(DT.ctx).open());
  }

  // Wire classic buttons if present
  if(panel){
    panel.querySelectorAll('.dev-btn').forEach(btn => {
      const action = btn.getAttribute('data-dev');
      btn.addEventListener('click', () => {
        switch (action) {
          case 'tp-ghost': {
            const gp=game.ghostPivot; if(!gp || !game.playerCapsule) break;
            game.playerCapsule.position.copyFrom(gp.position.add(new BABYLON.Vector3(0,0.2,-2)));
            break;
          }
          case 'reveal': {
            const g = String(game?.ghost?.profile?.name || '???').toUpperCase();
            const log = $('devLog'); if(log){ log.textContent += `Ghost is: ${g}\n`; log.scrollTop = log.scrollHeight; }
            break;
          }
          case 'sanity100': game.sanity = 100; break;
          case 'give-items': {
            const all = ["EMF","Spirit Box","Thermometer","Crucifix","Salt","Smudge","Camera","UV Light","D.O.T.S","Ghost Writing Book","Motion Sensor","Flashlight","Thermal Camera"];
            const have = new Set(game.inventory || []); all.forEach(i=> have.add(i)); game.inventory = Array.from(have);
            break;
          }
          case 'coords': console.info("DEV camera:", game.camera?.position?.toString()); break;
          case 'toggle-nohud': ['belt','hud','coords','ada-modal'].forEach(id=>{ const el=$(id); if(el) el.style.opacity = (el.style.opacity==='0'?'1':'0'); }); break;
          case 'end-hunt': { if(window.simulateTyping) simulateTyping('Forced any active hunt to end.', 'System'); break; }
          case 'scan-assets': scanAssets(); break;
          case 'open-model-viewer': ensureModelViewer(DT.ctx).open(); break;
        }
      });
    });
  }

  // Initialize displays
  updateGhostFields();
  updateSnapUI();
}

/* ------------------------------------------------------------------------- *
 * Expose a tiny API for console tinkering
 * ------------------------------------------------------------------------- */
window.DevTools = Object.assign({}, window.DevTools||{}, {
  select, scanAssets, ensureModelViewer,
  exportSceneJSON, exportHTMLWithConfig,
  setGizmoMode, updateGhostFields, applyGhostFields
});
