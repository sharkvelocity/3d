// ./assets/dev/devtools.js
// Phasma-Phoney — Expanded Developer Toolkit
// Drop-in: call initDevTools({ game, scene }) after your scene is ready.
// Requires Babylon.js core + (optional) serializers for GLB export:
//   <script src="./cdn/serializers/babylon.glTF2Serializer.min.js"></script>

/* ------------------------------------------------------------------------- *
 * Small DOM helpers
 * ------------*/

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
  <div class="modal" style="width:min(1020px,95vw); max-height:92vh; overflow:auto; background:linear-gradient(180deg,#07131a,#081017); border:1px solid #0ff; border-radius:14px; padding:12px; color:#cfffff; box-shadow:0 0 20px rgba(0,255,255,.22)">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
      <strong>Model Viewer / Spawner</strong>
      <div>
        <button id="mvExportGLB" class="btn">Export GLB</button>
        <button id="mvExportTextures" class="btn">Download Textures</button>
        <button id="mvSnapshot" class="btn">Snapshot PNG</button>
        <button id="mvClose" class="btn">Close</button>
      </div>
    </div>
    <div class="row" style="gap:10px; flex-wrap:wrap;">
      <label class="btn" for="mvFile">Choose File</label>
      <input id="mvFile" type="file" accept=".glb,.gltf,.obj,.stl,.zip" style="display:none">
      <span class="muted">Drag & drop .glb/.gltf here • FBX not supported (convert to glTF)</span>
    </div>
    <div id="mvDrop" style="margin-top:10px; border:1px dashed #0ff6; border-radius:10px; padding:16px; text-align:center;">
      Drop file here to spawn<br><span class="muted">(click a point in scene to set spawn, else spawns in front of camera)</span>
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
        <div class="muted">Loaded nodes:</div>
        <pre id="mvList" style="margin:0; max-height:220px; overflow:auto; background:#03131a; border:1px solid #0a3; padding:8px; border-radius:8px;"></pre>
      </div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const giz = ensureGizmo(scene);

  let pivot = null;
  let lastPickedPoint = null;
  function byId(id){ return document.getElementById(id); }
  function open(){ root.style.display='flex'; updateFieldsFromPivot(); }
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
  }
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
  async function downloadTextures(){
    if(!pivot){ alert('No selection'); return; }
    const a = document.createElement('a');
    const seen = new Set();
    pivot.getChildMeshes(true).forEach(m=>{
      const mat = m.material;
      const urls = [];
      if(!mat) return;
      const push = (t)=>{ if(t && t.url && !seen.has(t.url)){ urls.push(t.url); seen.add(t.url);} };
      if(mat.albedoTexture) push(mat.albedoTexture);
      if(mat.diffuseTexture) push(mat.diffuseTexture);
      if(mat.normalTexture || mat.bumpTexture) push(mat.normalTexture||mat.bumpTexture);
      if(mat.metallicTexture) push(mat.metallicTexture);
      if(mat.ambientTexture) push(mat.ambientTexture);
      if(mat.emissiveTexture) push(mat.emissiveTexture);
      urls.forEach(u=>{
        try{
          a.href = u; a.download = (u.split('/').pop()||'texture.png'); a.click();
        }catch(e){ console.warn('Download failed for', u, e); }
      });
    });
  }
  async function snapshotPNG(){
    try{
      const data = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(DT.ctx.engine, DT.ctx.game.camera, { width: 1024, height: 1024 });
      const a = document.createElement('a'); a.href = data; a.download = 'snapshot.png'; a.click();
    }catch(e){ console.warn(e); alert('Snapshot failed'); }
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

  function listChildren(){
    const pre = $('mvList'); if(!pre) return;
    if(!pivot){ pre.textContent='(none)'; return; }
    pre.textContent = pivot.getChildren().map(n=> n.name).join('\n');
  }

  // controls
  function applyFromFields(){
    if(!pivot) return;
    const x=parseFloat(byId('mvX').value||'0'), y=parseFloat(byId('mvY').value||'1'), z=parseFloat(byId('mvZ').value||'0');
    const ry=parseFloat(byId('mvRY').value||'0')*Math.PI/180, s=parseFloat(byId('mvS').value||'1');
    pivot.position.set(x,y,z); pivot.rotation.y = ry; pivot.scaling.set(s,s,s);
  }
  byId('mvApply').onclick = applyFromFields;
  byId('mvDelete').onclick = ()=>{ if(!pivot) return; pivot.getChildren().forEach(n=> n.dispose && n.dispose()); pivot.dispose(); pivot=null; $('mvList').textContent='(none)'; };
  byId('mvMakePick').onclick = ()=>{ if(!pivot) return; pivot.getChildren().forEach(n=> n.isPickable=true); };
  byId('mvMakeCollide').onclick = ()=>{ if(!pivot) return; pivot.getChildren().forEach(n=> n.checkCollisions=true); };
  byId('mvGizmoPos').onclick = ()=> setGizmoMode('pos');
  byId('mvGizmoRot').onclick = ()=> setGizmoMode('rot');
  byId('mvGizmoScale').onclick = ()=> setGizmoMode('scl');
  byId('mvExportGLB').onclick = exportGLB;
  byId('mvExportTextures').onclick = downloadTextures;
  byId('mvSnapshot').onclick = snapshotPNG;
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
