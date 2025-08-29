// ./assets/index3/devtools.js — v7
// Upgrades the Creator tab with Spawn (tools/meshes), item options, saving placements,
// safe deletion, and hover highlight. Keeps existing tabs intact.

(function(){
  "use strict";

  // ---------- tiny DOM helpers ----------
  const $ = (sel, root=document)=> root.querySelector(sel);
  const el = (tag, attrs={}, kids=[])=>{
    const n=document.createElement(tag);
    for (const k in attrs){
      if (k==="style") Object.assign(n.style, attrs[k]);
      else if (k in n) n[k]=attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const k of kids) n.appendChild(typeof k==="string"?document.createTextNode(k):k);
    return n;
  };
  const btn = (label, onclick)=>{ const b=el('button',{className:'hud-btn'},[label]); if(onclick) b.onclick=onclick; return b; };
  const lab = (t)=> el('span',{style:{color:'#9ff',minWidth:'56px',display:'inline-block'}},[t]);
  const input = (type,id,val,attrs={})=>{
    return el('input',Object.assign({type,id,value:val,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px'}},attrs),[]);
  };
  const check = (label,id,onChange,checked=false)=>{
    const w=el('label',{style:{display:'inline-flex',gap:'6px',alignItems:'center',cursor:'pointer'}},
      [el('input',{id,type:'checkbox',checked}), el('span',{style:{color:'#cff'}},[label])]);
    if(onChange) setTimeout(()=> $('#'+id).addEventListener('change', onChange),0);
    return w;
  };
  const sel = (id, opts)=>{ const s=el('select',{id,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px'}},[]);
    (opts||[]).forEach(([v,t])=> s.appendChild(el('option',{value:v},[t]))); return s; };
  const withId = (node, id)=>{ node.id=id; return node; };

  // ---------- scene refs ----------
  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const ENGINE= ()=> window.engine || SCENE()?.getEngine?.();
  const toast = (m,ms=950)=> (window.toast? window.toast(m,ms) : console.log('[toast]',m));

  // ---------- state ----------
  const STATE = {
    ready:false, fpsEl:null,
    lastPick:null,
    loggerLines:[], loggerMax:160,
    clickTeleport:false,

    // Lights rigs
    rigs: {},

    // Rooms
    mapping: { rooms:{} },
    activeRoom:null, placer:null,

    // Creator
    creatorRoot:null,
    creatorItems:[], // walls/boxes you make
    placedItems:[],  // spawned tools / cloned meshes
    drawing:null,

    // Hover highlight
    hl:null,
    hovered:null
  };

  // ---------- utils ----------
  function logLine(msg){
    STATE.loggerLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (STATE.loggerLines.length > STATE.loggerMax) STATE.loggerLines.shift();
    const out = $('#dev-log'); if (out) out.textContent = STATE.loggerLines.join('\n');
    try{ console.log('[Dev]', msg);}catch{}
  }
  function exportJSON(name,obj){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }
  function exportText(name,text){
    const blob=new Blob([text],{type:'text/plain'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }
  function xyz(v){ return {x:+v.x.toFixed(6), y:+v.y.toFixed(6), z:+v.z.toFixed(6)}; }

  // ---------- selection / picking ----------
  function selectMesh(mesh){
    STATE.lastPick = mesh;
    if (!STATE.gizmo){
      const gm = new BABYLON.GizmoManager(SCENE());
      gm.usePointerToAttachGizmos=false;
      gm.positionGizmoEnabled=true; gm.rotationGizmoEnabled=true; gm.scaleGizmoEnabled=true;
      STATE.gizmo = gm;
    }
    STATE.gizmo.attachToMesh(mesh);
    if ($('#mesh-name')) $('#mesh-name').textContent = mesh?.name || '(unnamed)';
    if ($('#lx-target'))  $('#lx-target').textContent  = mesh?.name || '(none)';
    if ($('#door-selected')) $('#door-selected').textContent = mesh?.name || '(none)';
    if ($('#cr-selected')) $('#cr-selected').textContent = mesh?.name || '(none)';
  }

  function pickUnderCursor(filterFn){
    const s=SCENE(); if(!s) return null;
    const ray=s.createPickingRay(s.pointerX, s.pointerY, BABYLON.Matrix.Identity(), window.camera);
    return s.pickWithRay(ray, m=> m && m.isPickable!==false && (!filterFn || filterFn(m)));
  }

  // ---------- panel shell ----------
  const PANEL = { root:null, tabs:null, body:null };
  function ensurePanel(){
    const root = $('#devtools-panel'); if (!root) return false;
    root.innerHTML = ""; root.style.display='block';
    const hdr = el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}},[
      el('div',{style:{color:'#9ff',fontWeight:'bold'}},['Developer Tools (v7)']),
      (STATE.fpsEl = el('div',{style:{color:'#8ff',fontSize:'12px'}},['FPS: --']))
    ]);
    const tabs = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}},[]);
    const body = el('div',{style:{border:'1px solid #033',padding:'8px',borderRadius:'8px',background:'#0a0a0a'}},[]);
    PANEL.root=root; PANEL.tabs=tabs; PANEL.body=body;
    root.appendChild(hdr); root.appendChild(tabs); root.appendChild(body);
    return true;
  }
  function addTab(name, builder, active=false){
    const b = btn(name, ()=>{ PANEL.body.innerHTML=""; builder(); });
    if (active) setTimeout(()=> b.click(), 0);
    PANEL.tabs.appendChild(b);
  }

  // ---------- Map (short) ----------
  function buildMapUI(){
    const url = input('text','map-url',(window.MAP_URL||'./assets/models/house.glb'),{style:{width:'100%'}});
    const row = el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:'8px'}},[
      url,
      btn('Load', async ()=>{ window.MAP_URL=url.value.trim(); await loadMap(true); }),
      btn('Reload', async ()=> await loadMap(true)),
      btn('Clear Log', ()=>{ const o=$('#dev-log'); if(o) o.textContent=''; STATE.loggerLines.length=0; })
    ]);
    const log = el('pre',{id:'dev-log',style:{background:'#000',border:'1px solid #033',padding:'8px',minHeight:'120px',maxHeight:'220px',overflow:'auto',color:'#8ff',whiteSpace:'pre-wrap'}},[]);
    PANEL.body.appendChild(row);
    PANEL.body.appendChild(el('div',{style:{marginTop:'8px',color:'#8ff'}},["Loader log:"]));
    PANEL.body.appendChild(log);
  }
  async function loadMap(showProgress){
    const s=SCENE(); if(!s){ toast('Scene not ready'); return; }
    const u=window.MAP_URL||'./assets/models/house.glb';
    const i=u.lastIndexOf('/'); const root=u.slice(0,i+1), file=u.slice(i+1);
    try{
      if (showProgress && typeof window.showLoading==='function') window.showLoading(true,12,'loading map…');
      BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce(p=> logLine(`plugin: ${p.name}`));
      await BABYLON.SceneLoader.AppendAsync(root,file,s, evt=>{
        if (showProgress && evt.lengthComputable && typeof window.showLoading==='function'){
          const pct = 12 + Math.floor((evt.loaded/evt.total)*78);
          window.showLoading(true,pct,'loading map…');
        }
      });
      if (typeof window.showLoading==='function') window.showLoading(false);
      logLine(`Loaded ${u} (meshes: ${s.meshes.length})`);
      toast('Map loaded',900);
    }catch(err){
      if (typeof window.showLoading==='function') window.showLoading(false);
      logLine(`ERROR loading ${u}: `+(err?.message||err));
      toast('Map failed to load',1400);
    }
  }

  // ---------- Nodes ----------
  function buildNodesUI(){
    const filter = input('text','nodes-filter','',{placeholder:'filter by name',style:{width:'60%'}});
    const list = el('div',{id:'nodes-list',style:{marginTop:'8px',maxHeight:'320px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const row = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},[
      filter, btn('Scan',render), btn('Export JSON',()=>{
        const items = SCENE().meshes.map(m=>({type:'Mesh',name:m.name,parent:m.parent?.name||null}));
        exportJSON('nodes_scan.json',{items, count:items.length});
      })
    ]);
    PANEL.body.appendChild(row); PANEL.body.appendChild(list);
    function render(){
      const q=(filter.value||'').toLowerCase(); const s=SCENE();
      list.innerHTML='';
      s.meshes.filter(m=>(m.name||'').toLowerCase().includes(q)).slice(0,500).forEach(m=>{
        list.appendChild(el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[m.name]),
          btn('Select', ()=> selectMesh(m))
        ]));
      });
    } render();
  }

  // ---------- Mesh+ ----------
  function buildMeshPlusUI(){
    const q = input('text','meshq','door',{placeholder:'name contains…',style:{width:'220px'}});
    const isolate = check('Isolate','mesh-isolate', refresh);
    const list = el('div',{id:'mesh-list',style:{marginTop:'6px',maxHeight:'300px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const bar = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'6px'}},[
      btn('Toggle Collisions', ()=> batch('collisions')),
      btn('Toggle Pickable',   ()=> batch('pickable')),
      btn('Toggle Visible',    ()=> batch('visible'))
    ]);
    const pickNow = btn('Pick Under Cursor', ()=>{ const hit = pickUnderCursor(); if(hit?.hit) selectMesh(hit.pickedMesh); });
    const name = el('div',{id:'mesh-name',style:{color:'#9ff',marginTop:'6px'}},['(none)']);
    const top = el('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},[ lab('Find'), q, isolate, pickNow ]);
    PANEL.body.appendChild(top); PANEL.body.appendChild(list); PANEL.body.appendChild(bar);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px'}},[ lab('Selected'), name ]));
    refresh(); q.addEventListener('input', refresh);

    function current(){ const s=SCENE(); if(!s) return []; const v=q.value.trim().toLowerCase(); return s.meshes.filter(m=>(m.name||'').toLowerCase().includes(v)); }
    function refresh(){
      const s=SCENE(); if(!s) return;
      const items = current(); const host=$('#mesh-list'); host.innerHTML='';
      if ($('#mesh-isolate input')?.checked){ s.meshes.forEach(m=> m.isVisible = items.includes(m)); }
      items.slice(0,400).forEach(m=>{
        const row=el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[m.name||'(unnamed)']),
          btn('Sel', ()=> selectMesh(m)),
          btn(m.checkCollisions?'Coll✓':'Coll×', ()=>{ m.checkCollisions=!m.checkCollisions; refresh(); }),
          btn(m.isPickable?'Pick✓':'Pick×', ()=>{ m.isPickable=!m.isPickable; refresh(); })
        ]); host.appendChild(row);
      });
    }
    function batch(kind){
      const items=current(); if (!items.length){ toast('No matches'); return; }
      if (kind==='collisions') items.forEach(m=> m.checkCollisions=!m.checkCollisions);
      if (kind==='pickable')   items.forEach(m=> m.isPickable=!m.isPickable);
      if (kind==='visible')    items.forEach(m=> m.isVisible = !(m.isVisible!==false && m.visibility!==0));
    }
  }

  // ---------- Lights+ ----------
  function buildLightsUI(){
    const s=SCENE(); if(!s){ PANEL.body.appendChild(el('div',{style:{color:'#faa'}},['Scene not ready'])); return; }
    const filter = input('text','lx-filter','',{placeholder:'filter meshes…',style:{width:'220px'}});
    const list   = el('div',{id:'lx-list',style:{marginTop:'6px',maxHeight:'230px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const tgt    = el('b',{id:'lx-target',style:{color:'#9ff'}},[STATE.lastPick?.name||'(none)']);
    const mode   = sel('lx-mode',[['omni','Omni (6 spots)'],['dome','Dome (4 spots)'],['single','Single (spot)']]);
    const bright = input('range','lx-bright','1.2',{min:'0',max:'3',step:'0.05',style:{width:'220px'}});
    const angle  = input('number','lx-angle','60',{min:'20',max:'120',step:'1',style:{width:'84px'}});
    const range  = input('number','lx-range','14',{min:'4',max:'40',step:'1',style:{width:'84px'}});
    const genRes = input('number','lx-shadow','1024',{min:'256',max:'4096',step:'256',style:{width:'84px'}});
    const onBtn  = btn('Attach Rig', attachRig);
    const offBtn = btn('Delete Rig', deleteRig);
    const recvBtn= btn('Make All Receive', ()=> s.meshes.forEach(m=> m.receiveShadows = true));
    const castBtn= btn('Refresh Casters', refreshCasters);
    const rowTop = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},[
      lab('Target'), tgt, lab('Mode'), mode, lab('Bright'), bright, lab('Angle'), angle, lab('Range'), range, lab('Shadow'), genRes, onBtn, offBtn
    ]);
    const row2 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',marginTop:'6px'}},[ recvBtn, castBtn ]);
    PANEL.body.appendChild(rowTop); PANEL.body.appendChild(row2);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#8ff'}},['Pick a mesh (list below) then Attach Rig']));
    PANEL.body.appendChild(list);
    filter.addEventListener('input', renderList); renderList();

    function renderList(){
      const q=(filter.value||'').toLowerCase(); list.innerHTML='';
      s.meshes.filter(m=>(m.name||'').toLowerCase().includes(q)).slice(0,300).forEach(m=>{
        list.appendChild(el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[m.name]),
          btn('Select', ()=> selectMesh(m)),
          btn('To Mesh', ()=>{ selectMesh(m); attachRig(); })
        ]));
      });
    }
    function centerOf(mesh){
      const bb = mesh.getBoundingInfo().boundingBox;
      const min=bb.minimumWorld, max=bb.maximumWorld;
      return new BABYLON.Vector3( (min.x+max.x)/2, (min.y+max.y)/2, (min.z+max.z)/2 );
    }
    function refreshCasters(){
      const casters = s.meshes.filter(m=> m.isVisible!==false && m.getTotalVertices?.()>0);
      for (const name in STATE.rigs){
        const rig = STATE.rigs[name];
        rig.gens.forEach(g=>{ g.getShadowMap().renderList = casters; });
      }
      toast('Shadow casters refreshed');
    }
    function deleteRig(){
      const mesh = STATE.lastPick; if(!mesh) return toast('Pick a mesh first');
      const rig = STATE.rigs[mesh.name]; if (!rig) return toast('No rig on this mesh');
      rig.gens.forEach(g=> g.dispose()); rig.spots.forEach(L=> L.dispose()); rig.root?.dispose?.();
      delete STATE.rigs[mesh.name];
      toast('Rig deleted');
    }
    function attachRig(){
      const mesh = STATE.lastPick; if(!mesh) return toast('Pick a mesh first');
      if (STATE.rigs[mesh.name]) deleteRig();
      const root = new BABYLON.TransformNode('lxRig_'+mesh.name, s);
      const c = centerOf(mesh); root.position.copyFrom(c);
      const modeVal = $('#lx-mode').value;
      const I = +$('#lx-bright').value || 1.2;
      const ang = BABYLON.Tools.ToRadians(Math.max(10, Math.min(120, +$('#lx-angle').value || 60)));
      const dist= +$('#lx-range').value || 14;
      const map = Math.max(256, Math.min(4096, +$('#lx-shadow').value || 1024));
      const dirs = (modeVal==='single')
        ? [ new BABYLON.Vector3(1,0,0) ]
        : (modeVal==='dome'
            ? [BABYLON.Axis.X, BABYLON.Axis.NegativeX, BABYLON.Axis.Z, BABYLON.Axis.NegativeZ]
            : [BABYLON.Axis.X, BABYLON.Axis.NegativeX, BABYLON.Axis.Z, BABYLON.Axis.NegativeZ, BABYLON.Axis.Y, BABYLON.Axis.NegativeY]);
      const spots=[], gens=[];
      dirs.forEach((dir,i)=>{
        const L = new BABYLON.SpotLight('lxS'+i, c, dir, ang, 12, s);
        L.intensity = I; L.range = dist; L.parent = root; L.diffuse = new BABYLON.Color3(1,1,1);
        const G = new BABYLON.ShadowGenerator(map, L);
        G.useExponentialShadowMap = true; G.bias = 0.0006; G.normalBias = 0.4;
        gens.push(G); spots.push(L);
      });
      s.meshes.forEach(m=> m.receiveShadows = true);
      const casters = s.meshes.filter(m=> m.isVisible!==false && m.getTotalVertices?.()>0);
      gens.forEach(g=> g.getShadowMap().renderList = casters);
      STATE.rigs[mesh.name] = { root, spots, gens, intensity:I };
      $('#lx-bright').oninput = (e)=> { const v=+e.target.value||0; spots.forEach(L=> L.intensity = v); STATE.rigs[mesh.name].intensity=v; };
      toast('Rig attached to '+mesh.name);
    }
  }

  // ---------- Rooms (door placer) ----------
  function buildRoomsUI(){
    const s=SCENE(); if(!s){ PANEL.body.appendChild(el('div',{style:{color:'#faa'}},['Scene not ready'])); return; }
    const allRooms = (window.ROOMS||[]).map(r=>r.name).filter(Boolean);
    const roomSel = sel('rm-room', allRooms.map(n=>[n,n]));
    const roomNew = input('text','rm-new','',{placeholder:'or type new room name',style:{width:'220px'}});
    const setRoom = btn('Set Room', ()=>{
      const n = roomNew.value.trim() || roomSel.value;
      if (!n) return toast('Pick or type a room name');
      STATE.activeRoom = n;
      if (!STATE.mapping.rooms[n]) STATE.mapping.rooms[n]={ doors:[] };
      $('#rm-active').textContent = n;
    });
    const active = el('b',{id:'rm-active',style:{color:'#9ff'}},[STATE.activeRoom||'(none)']);
    const tplBtn  = btn('Find Door Template', ()=>{ const m=s.getMeshByName('Puerta_Puerta_0') || s.getNodeByName('Puerta_Puerta_0'); toast(m?'Template found':'Puerta_Puerta_0 not found'); });
    const placeBtn= btn('Place Door', ()=> startDoorPlacer());
    const saveBtn = btn('Save Mapping (JSON)', ()=> exportJSON('mapping.json',STATE.mapping));
    const saveJs  = btn('Export doors_mapping.js', ()=> exportText('doors_mapping.js', renderDoorsMappingJS(STATE.mapping)));
    const list = el('div',{id:'rm-list',style:{marginTop:'6px',maxHeight:'220px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const bar1 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},[ lab('Room'), roomSel, roomNew, setRoom, lab('Active:'), active ]);
    const bar2 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',marginTop:'6px'}},[ tplBtn, placeBtn, saveBtn, saveJs ]);
    PANEL.body.appendChild(bar1); PANEL.body.appendChild(bar2);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#8ff'}},['Left-click = drop, mousewheel = rotate, F = flip, Esc = cancel']));
    PANEL.body.appendChild(list);
    function refreshList(){
      list.innerHTML='';
      const r = STATE.mapping.rooms[STATE.activeRoom]; if (!r){ list.textContent='(no room selected)'; return; }
      r.doors.forEach((d,i)=>{
        const row=el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[`#${i} ${d.name} @ (${d.pos.x.toFixed(2)}, ${d.pos.y.toFixed(2)}, ${d.pos.z.toFixed(2)}) rotY:${d.rotY.toFixed(2)} flip:${d.scale.x<0?'yes':'no'}`]),
          btn('Select', ()=>{ const m=s.getMeshByName(d.name); if(m) selectMesh(m); }),
          btn('Remove', ()=>{ r.doors.splice(i,1); const m=s.getMeshByName(d.name); m?.dispose?.(); refreshList(); })
        ]);
        list.appendChild(row);
      });
    } refreshList();

    function startDoorPlacer(){
      if (!STATE.activeRoom) return toast('Pick a room first');
      const tpl = s.getMeshByName('Puerta_Puerta_0') || s.getNodeByName('Puerta_Puerta_0');
      if (!tpl) return toast('Puerta_Puerta_0 not found in scene');
      const ghost = tpl.clone('DoorGhost_'+Date.now()); ghost.isPickable=false; ghost.visibility=0.6; ghost.setEnabled(true);
      STATE.placer = { mode:'door', ghostMesh:ghost, rotY:0, room:STATE.activeRoom, flipped:false };
      const onMove = ()=>{ const hit = pickUnderCursor(); if (hit?.hit){ ghost.position.copyFrom(hit.pickedPoint); } };
      const onDown = (pi)=>{ if (pi.event.button===0){ commit(); stop(); } };
      const onWheel= (pi)=>{ STATE.placer.rotY -= pi.event.deltaY*0.005; ghost.rotation.y = STATE.placer.rotY; };
      const onObs  = (pi)=>{ if (pi.type===BABYLON.PointerEventTypes.POINTERMOVE) onMove();
                             if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN) onDown(pi);
                             if (pi.type===BABYLON.PointerEventTypes.POINTERWHEEL) onWheel(pi); };
      const onKey  = (e)=>{ if (e.key==='Escape') stop(); if (e.key==='f'||e.key==='F'){ STATE.placer.flipped=!STATE.placer.flipped; ghost.scaling.x*=-1; } };
      s.onPointerObservable.add(onObs); window.addEventListener('keydown',onKey);
      toast('Placing door…');
      function stop(){ try{ s.onPointerObservable.removeCallback(onObs); window.removeEventListener('keydown',onKey); ghost?.dispose?.(); }catch{} STATE.placer=null; }
      function commit(){
        const name = 'Door_'+STATE.activeRoom+'_'+(Date.now().toString(36));
        const door = tpl.clone(name); door.isPickable=true; door.setEnabled(true);
        door.position.copyFrom(ghost.position); door.rotation.y = ghost.rotation.y; if (STATE.placer.flipped) door.scaling.x *= -1;
        const rec = { name, template:'Puerta_Puerta_0', pos: xyz(door.position), rotY:+door.rotation.y.toFixed(6), scale: xyz(door.scaling) };
        if (!STATE.mapping.rooms[STATE.activeRoom]) STATE.mapping.rooms[STATE.activeRoom]={doors:[]};
        STATE.mapping.rooms[STATE.activeRoom].doors.push(rec);
        toast('Door placed');
      }
    }
  }
  function renderDoorsMappingJS(map){
    return `// Auto-generated doors/rooms mapping
window.DOORS_MAP = ${JSON.stringify(map, null, 2)};
window.applyDoorsMapping = function(scene){
  const tpl = scene.getMeshByName('Puerta_Puerta_0') || scene.getNodeByName('Puerta_Puerta_0');
  for (const roomName in (window.DOORS_MAP.rooms||{})){
    for (const d of (window.DOORS_MAP.rooms[roomName].doors||[])){
      let m = scene.getMeshByName(d.name) || scene.getNodeByName(d.name);
      if (!m && tpl){ m = tpl.clone(d.name); m.setEnabled(true); }
      if (!m) continue;
      m.position.set(d.pos.x,d.pos.y,d.pos.z); m.rotation.y = d.rotY||0; m.scaling.set(d.scale.x,d.scale.y,d.scale.z);
    }
  }
};`;
  }

  // ---------- CREATOR (walls/boxes + SPAWN ITEMS & CLONES) ----------
  function buildCreatorUI(){
    const s=SCENE(); if(!s){ PANEL.body.appendChild(el('div',{style:{color:'#faa'}},['Scene not ready'])); return; }
    ensureCreatorRoot();
    ensureHighlight();

    // Materials list
    const mats = [['','(auto)']].concat((s.materials||[]).map(m=>[m.name,m.name||'(unnamed)']));

    // --- draw controls ---
    const modeSel = sel('cr-mode', [['wall','Draw Wall'],['box','Add Box']]); modeSel.value='wall';
    const height  = input('number','cr-h','2.4',{step:'0.1',title:'Height',style:{width:'84px'}});
    const thick   = input('number','cr-t','0.12',{step:'0.01',title:'Thickness',style:{width:'84px'}});
    const groundY = input('number','cr-y','0',{step:'0.01',title:'Ground Y',style:{width:'84px'}});
    const snapChk = check('Snap','cr-snap', null, true);
    const snapSz  = input('number','cr-snapz','0.25',{step:'0.01',title:'Grid',style:{width:'84px'}});
    const matSel  = sel('cr-mat', mats);
    const pickable= check('Pickable','cr-pick', null, true);
    const collide = check('Collisions','cr-col', null, true);

    const startBtn  = btn('Start Draw', startDraw);
    const cancelBtn = btn('Cancel', cancelDraw);
    const addBoxBtn = btn('Add Box', quickBox);

    const Ldim = input('number','cr-L','1.0',{step:'0.05',title:'Length',style:{width:'84px'}});
    const Hdim = input('number','cr-Hdim','2.4',{step:'0.05',title:'Height',style:{width:'84px'}});
    const Tdim = input('number','cr-Tdim','0.12',{step:'0.01',title:'Thickness',style:{width:'84px'}});
    const applyDims = btn('Apply Dims', applyDimensionsToSelected);

    const gizPos = btn('Pos Gizmo', ()=> setGizmo('position'));
    const gizRot = btn('Rot Gizmo', ()=> setGizmo('rotation'));
    const gizScl = btn('Scale Gizmo',()=> setGizmo('scale'));

    const delSel = btn('Remove Selected', safeRemoveSelected);
    const delHover = btn('Remove Hovered', safeRemoveHovered);

    const target = el('b',{id:'cr-selected',style:{color:'#9ff'}},[STATE.lastPick?.name||'(none)']);
    const hover  = el('b',{id:'cr-hover',style:{color:'#aff'}},['(none)']);

    const list   = el('div',{id:'cr-list',style:{marginTop:'6px',maxHeight:'180px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);

    // --- SPAWN: tools / mesh clones ---
    const TOOLS = [
      ['Salt','Salt'],['DOTS','DOTS'],['Writing Book','Writing Book'],
      ['Spirit Box','Spirit Box'],['UV Light','UV Light'],['Lighter','Lighter'],['Notebook','Notebook']
    ];
    // Optional: map tools to template mesh names (override here if your GLB has them)
    const TOOL_TEMPLATES = window.TOOL_TEMPLATES || {
      'Salt': ['Salt','salt','Salt_Shaker'],
      'DOTS': ['DOTS','dots','Projector','dots_projector'],
      'Writing Book': ['WritingBook','Book','Notebook','writing_book'],
      'Spirit Box': ['SpiritBox','Spirit_Box','radio'],
      'UV Light': ['UV','UV_Light','flashlight_uv'],
      'Lighter': ['Lighter'],
      'Notebook': ['Notebook','Journal']
    };

    const toolSel = sel('sp-tool', TOOLS);
    const meshFilter = input('text','sp-filter','',{placeholder:'filter scene meshes…',style:{width:'180px'}});
    const meshSel = sel('sp-mesh', [['','(scan)']]);
    const scanBtn = btn('Scan Meshes', ()=> refreshMeshSel());

    const grav = check('Gravity','sp-grav', null, false);
    const pick = check('Pickable','sp-pick', null, true);
    const toss = check('Tossable','sp-toss', null, true);

    const spawnToolBtn = btn('Spawn Tool', ()=> spawnTool(toolSel.value));
    const spawnMeshBtn = btn('Clone Mesh', ()=> spawnMeshClone(meshSel.value));

    const saveItemsBtn = btn('Export items_map.json', ()=> exportJSON('items_map.json', {items:STATE.placedItems}));
    const saveItemsJS  = btn('Export items_mapping.js', ()=> exportText('items_mapping.js', renderItemsMappingJS()));

    // ---- layout ----
    const row1 = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}},[
      lab('Mode'), modeSel, lab('H'), height, lab('T'), thick, lab('Y'), groundY, snapChk, lab('Size'), snapSz, lab('Mat'), matSel
    ]);
    const row2 = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}},[
      pickable, collide, startBtn, cancelBtn, addBoxBtn, gizPos, gizRot, gizScl
    ]);
    const row3 = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}},[
      lab('L'), Ldim, lab('H'), Hdim, lab('T'), Tdim, applyDims, delSel, delHover
    ]);
    const row4 = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}},[
      lab('Selected:'), target, lab('Hover:'), hover
    ]);

    const spawnHdr = el('div',{style:{marginTop:'10px',color:'#8ff',fontWeight:'bold'}},['Spawn']);
    const rowS1 = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}},[
      lab('Tool'), toolSel, spawnToolBtn,
      lab('Mesh'), meshFilter, scanBtn, meshSel, spawnMeshBtn
    ]);
    const rowS2 = el('div',{style:{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}},[
      grav, pick, toss, saveItemsBtn, saveItemsJS
    ]);

    PANEL.body.appendChild(row1);
    PANEL.body.appendChild(row2);
    PANEL.body.appendChild(row3);
    PANEL.body.appendChild(row4);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#8ff'}},['Walls: Left-click to place, wheel to rotate, Esc cancel']));
    PANEL.body.appendChild(el('hr',{style:{border:'0',borderTop:'1px solid #033',margin:'8px 0'}}));
    PANEL.body.appendChild(spawnHdr);
    PANEL.body.appendChild(rowS1);
    PANEL.body.appendChild(rowS2);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#9ad'}},['Creator Items:']));
    PANEL.body.appendChild(list);

    refreshCreatorList();
    refreshMeshSel();

    // ---------- helpers (creator root / highlight / picking) ----------
    function ensureCreatorRoot(){
      if (STATE.creatorRoot && !STATE.creatorRoot.isDisposed()) return STATE.creatorRoot;
      STATE.creatorRoot = new BABYLON.TransformNode('CreatorRoot', s);
      return STATE.creatorRoot;
    }
    function ensureHighlight(){
      if (!STATE.hl || STATE.hl.isDisposed()){
        STATE.hl = new BABYLON.HighlightLayer('DevHL', s);
        STATE.hl.innerGlow = false; STATE.hl.blurHorizontalSize = 0.5; STATE.hl.blurVerticalSize = 0.5;
      }
    }
    function setHover(mesh){
      if (STATE.hovered === mesh) return;
      try{
        if (STATE.hovered) STATE.hl.removeMesh(STATE.hovered);
        STATE.hovered = mesh || null;
        if (mesh) STATE.hl.addMesh(mesh, new BABYLON.Color3(0,1,1));
        if ($('#cr-hover')) $('#cr-hover').textContent = mesh?.name || '(none)';
      }catch(_){}
    }

    function snap(v){
      if (!$('#cr-snap input')?.checked) return v;
      const g = +$('#cr-snapz').value || 0.25;
      return Math.round(v/g)*g;
    }
    function getGroundY(){ return parseFloat($('#cr-y').value)||0; }
    function pickGround(){
      // intersect camera forward ray with horizontal plane y = groundY
      const cam = window.camera; if (!cam) return null;
      const y = getGroundY(), dir = cam.getForwardRay().direction, o = cam.position.clone();
      const dy=dir.y; if (Math.abs(dy)<1e-5){ const hit = pickUnderCursor(); return hit?.hit? hit.pickedPoint.clone() : null; }
      const t=(y-o.y)/dy; if (t<0) return null;
      const p=o.add(dir.scale(t)); p.x=snap(p.x); p.z=snap(p.z); p.y = y; return p;
    }

    // ---------- draw walls / boxes ----------
    function startDraw(){
      cancelDraw();
      if ($('#cr-mode').value !== 'wall'){ quickBox(); return; }
      const h = +$('#cr-h').value || 2.4;
      const T = +$('#cr-t').value || 0.12;
      const matName = $('#cr-mat').value || '';
      const mat = s.materials.find(m=>m.name===matName) || null;

      const start = pickGround();
      if (!start){ toast('Aim at ground (Y) then Start'); return; }

      const ghost = BABYLON.MeshBuilder.CreateBox('WallGhost',{width:0.1, depth:T, height:h}, s);
      ghost.visibility = 0.5; ghost.isPickable=false; if (mat) ghost.material = mat; ghost.parent = ensureCreatorRoot();

      STATE.drawing = { start, ghost, mode:'wall', height:h, thickness:T, mat:matName };
      const onMove = ()=>{ const p = pickGround(); if (!p) return;
        const mid = start.add(p).scale(0.5);
        const dir = p.subtract(start); const L = Math.max(0.05, dir.length()); const ang = Math.atan2(dir.x, dir.z);
        ghost.position.copyFrom(mid); ghost.rotation.set(0, ang, 0); ghost.scaling.x = L/0.1;
      };
      const onDown = (pi)=>{ if (pi.event.button===0){ commit(); stop(); } };
      const onWheel= (pi)=>{ STATE.drawing.ghost.rotation.y -= pi.event.deltaY*0.005; };
      const onObs  = (pi)=>{ if (pi.type===BABYLON.PointerEventTypes.POINTERMOVE) onMove();
                             if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN) onDown(pi);
                             if (pi.type===BABYLON.PointerEventTypes.POINTERWHEEL) onWheel(pi); };
      const onKey  = (e)=>{ if (e.key==='Escape') { stop(); } };
      s.onPointerObservable.add(onObs); window.addEventListener('keydown',onKey);
      toast('Drawing wall…');
      onMove();

      function stop(){ try{ s.onPointerObservable.removeCallback(onObs); window.removeEventListener('keydown',onKey); STATE.drawing?.ghost?.dispose?.(); }catch{} STATE.drawing=null; }
      function commit(){
        const endPos = STATE.drawing.ghost.position.clone();
        const L = STATE.drawing.ghost.getBoundingInfo().boundingBox.extendSizeWorld.x * 2;
        const ang = STATE.drawing.ghost.rotation.y;
        const wall = BABYLON.MeshBuilder.CreateBox('Wall_'+Date.now().toString(36), { width:L, depth:T, height:h }, s);
        wall.position.copyFrom(endPos); wall.rotation.y = ang; wall.parent = ensureCreatorRoot();
        if (mat) wall.material = mat;
        const pick = $('#cr-pick input')?.checked; const col = $('#cr-col input')?.checked;
        wall.isPickable = !!pick; wall.checkCollisions = !!col; wall.receiveShadows = true;
        wall.metadata = wall.metadata || {}; wall.metadata.creator = { type:'wall', dims:{L,H:h,T}, pickable:pick, collisions:col };
        STATE.creatorItems.push({ name: wall.name, type:'wall', dims:{L,H:h,T}, pos: xyz(wall.position), rotY:+ang.toFixed(6), mat:matName, pickable:pick, collisions:col });
        selectMesh(wall); refreshCreatorList(); toast('Wall placed');
      }
    }
    function cancelDraw(){ if (!STATE.drawing) return; try{ STATE.drawing.ghost?.dispose?.(); }catch{} STATE.drawing=null; }
    function quickBox(){
      ensureCreatorRoot();
      const L = Math.max(0.1, +$('#cr-L').value || 1.0);
      const H = Math.max(0.1, +$('#cr-Hdim').value || (+$('#cr-h').value || 1.0));
      const T = Math.max(0.1, +$('#cr-Tdim').value || (+$('#cr-t').value || 0.1));
      const matName = $('#cr-mat').value || '';
      const mat = s.materials.find(m=>m.name===matName) || null;
      const p = pickGround() || window.camera.position.add(window.camera.getForwardRay().direction.scale(1.5));
      const box = BABYLON.MeshBuilder.CreateBox('Box_'+Date.now().toString(36), { width:L, height:H, depth:T }, s);
      box.position.copyFrom(p); box.parent = ensureCreatorRoot(); if (mat) box.material = mat;
      const pick = $('#cr-pick input')?.checked; const col = $('#cr-col input')?.checked;
      box.isPickable = !!pick; box.checkCollisions = !!col; box.receiveShadows = true;
      box.metadata = box.metadata || {}; box.metadata.creator = { type:'box', dims:{L,H,T}, pickable:pick, collisions:col };
      STATE.creatorItems.push({ name: box.name, type:'box', dims:{L,H,T}, pos: xyz(box.position), rotY:+(box.rotation.y||0).toFixed(6), mat:matName, pickable:pick, collisions:col });
      selectMesh(box); refreshCreatorList(); toast('Box added');
    }

    function setGizmo(mode){
      if (!STATE.gizmo) return;
      STATE.gizmo.positionGizmoEnabled = (mode==='position');
      STATE.gizmo.rotationGizmoEnabled = (mode==='rotation');
      STATE.gizmo.scaleGizmoEnabled    = (mode==='scale');
      toast('Gizmo: '+mode);
    }

    function refreshCreatorList(){
      list.innerHTML='';
      STATE.creatorItems.forEach((it,i)=>{
        const row=el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[`#${i} ${it.type} ${it.name} L:${it.dims.L.toFixed(2)} H:${it.dims.H.toFixed(2)} T:${it.dims.T.toFixed(2)}`]),
          btn('Select', ()=>{ const m=s.getMeshByName(it.name); if(m) selectMesh(m); }),
          btn('Remove', ()=>{ const m=s.getMeshByName(it.name); m?.dispose?.(); STATE.creatorItems.splice(i,1); refreshCreatorList(); })
        ]); list.appendChild(row);
      });
    }

    function applyDimensionsToSelected(){
      const m=STATE.lastPick; if(!m){ toast('Select a creator mesh'); return; }
      const rec = STATE.creatorItems.find(x=>x.name===m.name); if(!rec){ toast('Selected mesh is not in Creator list'); return; }
      const L=+$('#cr-L').value || rec.dims.L, H=+$('#cr-Hdim').value || rec.dims.H, T=+$('#cr-Tdim').value || rec.dims.T;
      const newGeom = BABYLON.MeshBuilder.CreateBox(m.name+'_tmp',{width:L,height:H,depth:T},SCENE());
      newGeom.position.copyFrom(m.position); newGeom.rotation.copyFrom(m.rotation); newGeom.scaling.set(1,1,1);
      newGeom.parent = STATE.creatorRoot; newGeom.material = m.material;
      newGeom.isPickable = m.isPickable; newGeom.checkCollisions = m.checkCollisions; newGeom.receiveShadows = true;
      m.dispose?.(); newGeom.name = rec.name; selectMesh(newGeom);
      rec.dims = {L,H,T}; rec.pos = xyz(newGeom.position); rec.rotY = +(newGeom.rotation.y||0).toFixed(6);
      refreshCreatorList(); toast('Dimensions applied');
    }

    // ---------- SPAWN: tools ----------
    function resolveToolTemplate(toolLabel){
      const alts = TOOL_TEMPLATES[toolLabel] || [toolLabel];
      for (const n of alts){
        const m = s.getMeshByName(n) || s.getNodeByName(n);
        if (m) return m;
      }
      return null;
    }
    function spawnTool(label){
      const tpl = resolveToolTemplate(label);
      const p = pickGround() || window.camera.position.add(window.camera.getForwardRay().direction.scale(1.5));
      let m;
      if (tpl){
        m = tpl.clone('Item_'+label.replace(/\s+/g,'')+'_'+Date.now().toString(36));
      } else {
        // fallback small box
        m = BABYLON.MeshBuilder.CreateBox('Item_'+label.replace(/\s+/g,'')+'_'+Date.now().toString(36),{width:0.25,height:0.12,depth:0.25},s);
      }
      m.position.copyFrom(p); m.parent = ensureCreatorRoot(); m.setEnabled(true);
      m.isPickable = $('#sp-pick input')?.checked;
      m.checkCollisions = true;
      m.receiveShadows = true;
      // physics/gravity (best-effort)
      const wantGrav = $('#sp-grav input')?.checked;
      try{
        if (wantGrav && s.getPhysicsEngine){
          if (!s.isPhysicsEnabled()) s.enablePhysics(new BABYLON.Vector3(0,-9.81,0));
          // Use PhysicsAggregate if available
          const mass = $('#sp-toss input')?.checked ? 1 : 0;
          if (BABYLON.PhysicsAggregate) new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.BOX, { mass, restitution:0.1 }, s);
        }
      }catch(_){}
      m.metadata = m.metadata||{};
      m.metadata.spawn = { kind:'tool', tool:label, gravity:!!wantGrav, pickable:!!($('#sp-pick input')?.checked), tossable:!!($('#sp-toss input')?.checked) };
      STATE.placedItems.push({ name:m.name, kind:'tool', tool:label, pos:xyz(m.position), rotY:+(m.rotation.y||0).toFixed(6), scale:xyz(m.scaling), gravity:!!wantGrav, pickable:!!m.isPickable, tossable:!!($('#sp-toss input')?.checked) });
      selectMesh(m); toast('Spawned tool: '+label);
    }

    // ---------- SPAWN: clone mesh ----------
    function refreshMeshSel(){
      const q=(meshFilter.value||'').toLowerCase();
      const names = SCENE().meshes.map(m=>m.name).filter(n=>n && n.toLowerCase().includes(q)).slice(0,400);
      const sSel = $('#sp-mesh'); sSel.innerHTML='';
      sSel.appendChild(el('option',{value:''},['(pick one)']));
      names.forEach(n=> sSel.appendChild(el('option',{value:n},[n])));
    }
    function spawnMeshClone(templateName){
      if (!templateName){ toast('Pick a mesh template'); return; }
      const tpl = s.getMeshByName(templateName) || s.getNodeByName(templateName);
      if (!tpl){ toast('Template not found'); return; }
      const p = pickGround() || window.camera.position.add(window.camera.getForwardRay().direction.scale(1.5));
      const m = tpl.clone('Clone_'+templateName+'_'+Date.now().toString(36));
      m.position.copyFrom(p); m.parent = ensureCreatorRoot(); m.setEnabled(true);
      m.isPickable = $('#sp-pick input')?.checked; m.checkCollisions = true; m.receiveShadows = true;
      const wantGrav = $('#sp-grav input')?.checked;
      try{
        if (wantGrav && s.getPhysicsEngine){
          if (!s.isPhysicsEnabled()) s.enablePhysics(new BABYLON.Vector3(0,-9.81,0));
          const mass = $('#sp-toss input')?.checked ? 1 : 0;
          if (BABYLON.PhysicsAggregate) new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.MESH, { mass, restitution:0.1 }, s);
        }
      }catch(_){}
      m.metadata = m.metadata||{}; m.metadata.spawn = { kind:'mesh', template:templateName, gravity:!!wantGrav, pickable:!!m.isPickable, tossable:!!($('#sp-toss input')?.checked) };
      STATE.placedItems.push({ name:m.name, kind:'mesh', template:templateName, pos:xyz(m.position), rotY:+(m.rotation.y||0).toFixed(6), scale:xyz(m.scaling), gravity:!!wantGrav, pickable:!!m.isPickable, tossable:!!($('#sp-toss input')?.checked) });
      selectMesh(m); toast('Cloned: '+templateName);
    }

    // ---------- safe delete ----------
    function isProbablyGround(name){
      return /ground|floor|terrain|plane/i.test(name||'');
    }
    function confirmDanger(n){
      if (!isProbablyGround(n)) return true;
      const ok = prompt(`Type DELETE to remove "${n}" (looks like ground/floor):`) === 'DELETE';
      return !!ok;
    }
    function safeRemoveSelected(){
      const m=STATE.lastPick; if(!m) return toast('Nothing selected');
      if (!confirmDanger(m.name)) return;
      removeAndForget(m);
    }
    function safeRemoveHovered(){
      const m=STATE.hovered; if(!m) return toast('No hovered mesh');
      if (!confirmDanger(m.name)) return;
      removeAndForget(m);
    }
    function removeAndForget(m){
      // remove from creator or placed lists if present
      const ci = STATE.creatorItems.findIndex(x=>x.name===m.name); if(ci>=0) STATE.creatorItems.splice(ci,1);
      const pi = STATE.placedItems.findIndex(x=>x.name===m.name);  if(pi>=0) STATE.placedItems.splice(pi,1);
      m.dispose?.(); toast('Removed '+(m.name||'mesh')); refreshCreatorList();
    }
  }

  function renderItemsMappingJS(){
    const data = { items: STATE.placedItems };
    return `// Auto-generated items placement mapping
window.ITEMS_MAP = ${JSON.stringify(data, null, 2)};

window.applyItemsMapping = function(scene){
  const root = scene.getTransformNodeByName?.('CreatorRoot') || new BABYLON.TransformNode('CreatorRoot', scene);
  (window.ITEMS_MAP.items||[]).forEach(it=>{
    let m = scene.getMeshByName(it.name) || scene.getNodeByName(it.name);
    if (!m){
      if (it.kind==='mesh'){
        const tpl = scene.getMeshByName(it.template) || scene.getNodeByName(it.template);
        if (tpl) m = tpl.clone(it.name);
      } else {
        // tools fallback (box)
        m = BABYLON.MeshBuilder.CreateBox(it.name,{width:0.25,height:0.12,depth:0.25},scene);
      }
    }
    if (!m) return;
    m.setEnabled(true); m.parent = root;
    m.position.set(it.pos.x,it.pos.y,it.pos.z);
    m.rotation.y = it.rotY||0;
    m.scaling.set(it.scale.x,it.scale.y,it.scale.z);
    m.isPickable = !!it.pickable; m.checkCollisions = true; m.receiveShadows = true;
  });
};`;
  }

  // ---------- Ghost / Player / Inventory / Shot / Diag / Export (compact) ----------
  function buildGhostUI(){
    const types = Object.keys(window.GHOSTS||{Spirit:1});
    const typeSel = sel('ghost-type', types.map(k=>[k,k])); typeSel.value = window.currentGhostKey || types[0];
    const row1 = el('div',{className:'row',style:{gap:'8px'}},[
      lab('Type'), typeSel,
      withId(btn('Start Hunt',()=>{}),'ghost-hunt-start'),
      withId(btn('End Hunt',()=>{}),'ghost-hunt-end')
    ]);
    PANEL.body.appendChild(row1);
    typeSel.onchange = ()=>{ window.currentGhostKey = typeSel.value; };
    $('#ghost-hunt-start').onclick = ()=> window.beginHunt?.();
    $('#ghost-hunt-end').onclick   = ()=> window.endHunt?.();
  }
  function buildPlayerUI(){
    const pos = el('div',{id:'pos-readout',style:{color:'#9ff'}},['x:-- y:-- z:--']);
    const row1 = el('div',{className:'row',style:{gap:'8px',marginTop:'6px'}},[
      check('NoClip','p-noclip', e=> window.camera.checkCollisions = !e.target.checked)
    ]);
    PANEL.body.appendChild(pos); PANEL.body.appendChild(row1);
  }
  function buildInventoryUI(){
    const host = el('div',{style:{display:'grid',gridTemplateColumns:'60px 1fr 80px 80px',gap:'6px',alignItems:'center'}},[]);
    for (let i=1;i<=5;i++){
      host.appendChild(el('div',{style:{color:'#9ff'}},[`Slot ${i}`]));
      host.appendChild(input('text',`inv-name-${i}`, (window.inventory.slots[i]||''), {placeholder:'item name'}));
      host.appendChild(input('number',`inv-ch-${i}`, (isFinite(window.inventory.slotCharges[i])? window.inventory.slotCharges[i]: ''), {placeholder:'∞'}));
      host.appendChild(btn('Select', ()=>{ window.selectSlot?.(i); toast('Selected slot '+i); }));
    }
    PANEL.body.appendChild(host);
  }
  function buildShotUI(){
    const row = el('div',{className:'row',style:{gap:'8px'}},[
      btn('Capture PNG', ()=>{
        try{ const c=$('#renderCanvas'); const url=c.toDataURL('image/png'); const a=el('a',{download:'screenshot.png'}); a.href=url; a.click(); }catch(e){ toast('Screenshot failed'); }
      }),
      btn('Flash', ()=>{ const f=$('#flash-overlay'); if(!f) return; f.style.opacity='1'; setTimeout(()=> f.style.opacity='0',120); })
    ]);
    PANEL.body.appendChild(row);
  }
  function buildDiagUI(){
    PANEL.body.appendChild(el('div',{className:'row',style:{gap:'8px'}},[
      check('Bounding Boxes','bb', e=> SCENE().meshes.forEach(m=> m.showBoundingBox = e.target.checked)),
      check('Inspector','ins', e=> e.target.checked? SCENE().debugLayer.show({embedMode:true}) : SCENE().debugLayer.hide())
    ]));
  }
  function buildExportUI(){
    PANEL.body.appendChild(el('div',{},[btn('Export Nodes (quick)', ()=>{
      const items = SCENE().meshes.map(m=>({type:'Mesh',name:m.name,parent:m.parent?.name||null}));
      exportJSON('nodes_scan.json',{items, count:items.length});
    })]));
  }

  // ---------- pointer observer (hover highlight + click teleport option) ----------
  function pointerObserver(){
    const s=SCENE(); if(!s) return;
    s.onPointerObservable.add((pi)=>{
      if (pi.type===BABYLON.PointerEventTypes.POINTERMOVE){
        const hit = pickUnderCursor(); // any pickable
        if (hit?.hit) setHover(hit.pickedMesh); else setHover(null);
      }
      if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN){
        if (STATE.clickTeleport){
          const hit = pickUnderCursor();
          if (hit?.hit){ const t=hit.pickedPoint.clone(); t.y += 1.7; window.camera.position.copyFrom(t); toast('Teleported'); }
        }
      }
    });

    function setHover(mesh){
      if (!SCENE()) return;
      if (!STATE.hl || STATE.hl.isDisposed()){
        STATE.hl = new BABYLON.HighlightLayer('DevHL', SCENE());
        STATE.hl.innerGlow=false; STATE.hl.blurHorizontalSize = 0.5; STATE.hl.blurVerticalSize = 0.5;
      }
      if (STATE.hovered === mesh) return;
      try{
        if (STATE.hovered) STATE.hl.removeMesh(STATE.hovered);
        STATE.hovered = mesh || null;
        if (mesh) STATE.hl.addMesh(mesh, new BABYLON.Color3(0,1,1));
        if ($('#cr-hover')) $('#cr-hover').textContent = mesh?.name || '(none)';
      }catch(_){}
    }
  }

  // ---------- FPS + init ----------
  function fpsLoop(){
    const eng=ENGINE(); if(!eng || !STATE.fpsEl) return;
    const fps = eng.getFps?.()||0; STATE.fpsEl.textContent = `FPS: ${fps.toFixed(0)}`;
    requestAnimationFrame(fpsLoop);
  }

  function buildPanel(){
    if (!ensurePanel()) return;
    const tabs = {
      Map: buildMapUI,
      Nodes: buildNodesUI,
      "Mesh+": buildMeshPlusUI,
      "Lights+": buildLightsUI,
      Rooms: buildRoomsUI,
      Creator: buildCreatorUI, // upgraded
      Ghost: buildGhostUI,
      Player: buildPlayerUI,
      Inventory: buildInventoryUI,
      Screenshot: buildShotUI,
      Diagnostics: buildDiagUI,
      Export: buildExportUI
    };
    Object.entries(tabs).forEach(([name,fn],i)=> addTab(name, fn, i===0));
  }

  function init(){
    if (STATE.ready) return;
    const toggle = $('#devtools-toggle'), panel = $('#devtools-panel');
    if (!toggle || !panel || !SCENE() || !window.camera) return;
    toggle.style.display='block';
    toggle.onclick = ()=>{ panel.style.display = (panel.style.display==='none'?'block':'none'); };
    buildPanel(); pointerObserver(); fpsLoop();
    STATE.ready=true; toast('Dev Tools v7 ready', 900);
  }
  const id = setInterval(()=>{ try{ if ($('#devtools-panel') && SCENE() && window.camera){ clearInterval(id); init(); } }catch{} }, 200);

})();
