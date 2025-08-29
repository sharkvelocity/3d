// ./assets/index3/devtools.js — v5
// Adds Lights+ (mesh-targetable omni rig with shadows) and Rooms/Doors Mapper
// Keeps the rest of your tabs (Map, Nodes, Mesh+, Ghost, Player, Inventory, Screenshot, Diagnostics, Export)

(function(){
  "use strict";

  // ------------------ tiny DOM + UI helpers ------------------
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
    return el('input',Object.assign({type,id,value:val,style:{padding:'4px',background:'#000',color:'#0ff',
      border:'1px solid #066',borderRadius:'4px'}},attrs),[]);
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

  // ------------------ state + utils ------------------
  const STATE = {
    ready:false, fpsEl:null, lastPick:null, clickTeleport:false,
    loggerLines:[], loggerMax:160,

    // Lights+
    rigs: {}, // meshName -> { root, spots[], gens[], intensity }
    // Rooms/Doors
    mapping: { rooms: {} },  // { rooms: { [roomName]: { doors:[{name, pos, rotY, scale, template}] } } }
    activeRoom: null,
    placer: null // {mode:'door', ghostMesh, rotY, room}
  };
  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const ENGINE= ()=> window.engine || SCENE()?.getEngine?.();
  const CANVAS = ()=> $('#renderCanvas');

  function logLine(msg){
    STATE.loggerLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (STATE.loggerLines.length > STATE.loggerMax) STATE.loggerLines.shift();
    const out = $('#dev-log'); if (out) out.textContent = STATE.loggerLines.join('\n');
    try{ console.log('[Dev]', msg);}catch{}
  }
  const toast = (msg,ms=1200)=> (window.toast? window.toast(msg,ms): console.log('[toast]',msg));
  function exportJSON(name,obj){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); }
  function exportText(name, text){ const blob=new Blob([text],{type:'text/plain'});
    const a=el('a',{download:name}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); }

  // ------------------ selection + picking ------------------
  function pickUnderCursor(){
    const s=SCENE(); if(!s) return;
    const ray=s.createPickingRay(s.pointerX, s.pointerY, BABYLON.Matrix.Identity(), window.camera);
    const hit=s.pickWithRay(ray, m=>m && m.isPickable!==false);
    if(hit?.hit && hit.pickedMesh){ selectMesh(hit.pickedMesh); }
    return hit;
  }
  function selectMesh(mesh){
    STATE.lastPick = mesh;
    const name = $('#mesh-name'); if (name) name.textContent = mesh?.name || '(unnamed)';
    try{
      if (!STATE.gizmo){
        const gm = new BABYLON.GizmoManager(SCENE());
        gm.usePointerToAttachGizmos=false;
        gm.positionGizmoEnabled=true; gm.rotationGizmoEnabled=true; gm.scaleGizmoEnabled=false;
        STATE.gizmo = gm;
      }
      STATE.gizmo.attachToMesh(mesh);
    }catch(e){}
    // lights panel + doors panel labels
    if ($('#lx-target')) $('#lx-target').textContent = mesh?.name || '(none)';
    if ($('#door-selected')) $('#door-selected').textContent = mesh?.name || '(none)';
  }

  // ------------------ Tabs shell ------------------
  const PANEL = { root:null, tabs:null, body:null };
  function ensurePanel(){
    const root = $('#devtools-panel'); if (!root) return false;
    root.innerHTML = ""; root.style.display = 'block';
    const hdr = el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}},[
      el('div',{style:{color:'#9ff',fontWeight:'bold'}},['Developer Tools (v5)']),
      (STATE.fpsEl = el('div',{style:{color:'#8ff',fontSize:'12px'}},['FPS: --']))
    ]);
    const tabs = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}},[]);
    const body = el('div',{style:{border:'1px solid #033',padding:'8px',borderRadius:'8px',background:'#0a0a0a'}},[]);
    PANEL.root=root; PANEL.tabs=tabs; PANEL.body=body; root.appendChild(hdr); root.appendChild(tabs); root.appendChild(body);
    return true;
  }
  function addTab(name, builder, active=false){
    const b = btn(name, ()=>{ PANEL.body.innerHTML=""; builder(); });
    if (active) setTimeout(()=> b.click(), 0);
    PANEL.tabs.appendChild(b);
  }

  // ------------------ Map (unchanged) ------------------
  function buildMapUI(){
    const url = input('text','map-url', (window.MAP_URL||'./assets/models/house.glb'), {style:{width:'100%'}});
    const row = el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:'8px'}},[
      url,
      btn('Load', async ()=>{ window.MAP_URL = url.value.trim(); await loadMap(true); }),
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
    const u = window.MAP_URL || './assets/models/house.glb';
    const i = u.lastIndexOf('/'); const root = u.slice(0,i+1), file = u.slice(i+1);
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

  // ------------------ Nodes (short) ------------------
  function buildNodesUI(){
    const filter = input('text','nodes-filter','', {placeholder:'filter by name',style:{width:'60%'}});
    const list = el('div',{id:'nodes-list',style:{marginTop:'8px',maxHeight:'320px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const row = el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},[
      filter, btn('Scan',()=>render()), btn('Export JSON',()=>{
        const items = SCENE().meshes.map(m=>({type:'Mesh',name:m.name,parent:m.parent?.name||null}));
        exportJSON('nodes_scan.json',{items, count:items.length});
      })
    ]);
    PANEL.body.appendChild(row); PANEL.body.appendChild(list);
    function render(){
      const q = (filter.value||'').toLowerCase(); const s=SCENE();
      list.innerHTML=''; s.meshes.filter(m=>(m.name||'').toLowerCase().includes(q)).slice(0,500).forEach(m=>{
        list.appendChild(el('div',{style:{display:'grid',gridTemplateColumns:'1fr auto',gap:'6px',borderBottom:'1px solid #022',padding:'3px 0'}},[
          el('div',{style:{color:'#cff'}},[m.name]),
          btn('Select', ()=> selectMesh(m))
        ]));
      });
    } render();
  }

  // ------------------ Mesh+ (unchanged logic) ------------------
  function buildMeshPlusUI(){
    const q = input('text','meshq','door', {placeholder:'name contains…',style:{width:'220px'}});
    const isolate = check('Isolate results','mesh-isolate', refresh);
    const list = el('div',{id:'mesh-list',style:{marginTop:'6px',maxHeight:'300px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const bar = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'6px'}},[
      btn('Toggle Collisions', ()=> batch('collisions')),
      btn('Toggle Pickable',   ()=> batch('pickable')),
      btn('Toggle Visible',    ()=> batch('visible'))
    ]);
    const pickNow = btn('Pick Under Cursor', pickUnderCursor);
    const name = el('div',{id:'mesh-name',style:{color:'#9ff',marginTop:'6px'}},['(none)']);
    const top = el('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},[ lab('Find'), q, isolate, pickNow ]);
    PANEL.body.appendChild(top); PANEL.body.appendChild(list); PANEL.body.appendChild(bar);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px'}},[ lab('Selected'), name ]));
    refresh(); q.addEventListener('input', refresh);
    function current(){ const s=SCENE(); if(!s) return []; const v=q.value.trim().toLowerCase(); return s.meshes.filter(m=> (m.name||'').toLowerCase().includes(v)); }
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

  // ------------------ Lights+ ------------------
  function buildLightsUI(){
    const s=SCENE(); if(!s){ PANEL.body.appendChild(el('div',{style:{color:'#faa'}},['Scene not ready'])); return; }

    const filter = input('text','lx-filter','', {placeholder:'filter meshes…',style:{width:'220px'}});
    const list   = el('div',{id:'lx-list',style:{marginTop:'6px',maxHeight:'230px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);
    const tgt    = el('b',{id:'lx-target',style:{color:'#9ff'}},[STATE.lastPick?.name||'(none)']);
    const mode   = sel('lx-mode',[['omni','Omni (6 spots)'],['dome','Dome (4 spots)'],['single','Single (spot)']]);
    const bright = input('range','lx-bright','1.2',{min:'0',max:'3',step:'0.05',style:{width:'220px'}});
    const angle  = input('number','lx-angle','60',{min:'20',max:'120',step:'1',title:'spot angle (deg)',style:{width:'84px'}});
    const range  = input('number','lx-range','14',{min:'4',max:'40',step:'1',title:'range',style:{width:'84px'}});
    const genRes = input('number','lx-shadow','1024',{min:'256',max:'4096',step:'256',title:'shadow map size',style:{width:'84px'}});
    const onBtn  = btn('Attach Rig', ()=> attachRig());
    const offBtn = btn('Delete Rig', ()=> deleteRig());
    const recvBtn= btn('Make All Receive', ()=> s.meshes.forEach(m=> m.receiveShadows = true));
    const castBtn= btn('Refresh Casters', ()=> refreshCasters());
    const rowTop = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},[
      lab('Target'), tgt, lab('Mode'), mode, lab('Bright'), bright, lab('Angle'), angle, lab('Range'), range, lab('Shadow'), genRes, onBtn, offBtn
    ]);
    const row2 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',marginTop:'6px'}},[ recvBtn, castBtn ]);

    PANEL.body.appendChild(rowTop);
    PANEL.body.appendChild(row2);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#8ff'}},['Pick a mesh (list below) then Attach Rig']));
    PANEL.body.appendChild(list);

    filter.addEventListener('input', renderList);
    renderList();

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
      // cleanup existing
      if (STATE.rigs[mesh.name]) deleteRig();

      const root = new BABYLON.TransformNode('lxRig_'+mesh.name, s);
      const c = centerOf(mesh); root.position.copyFrom(c);

      // create N shadowed spotlights around center to emulate omni without clipping
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
        L.intensity = I; L.range = dist; L.parent = root;
        L.diffuse = new BABYLON.Color3(1,1,1);
        // shadowed
        const G = new BABYLON.ShadowGenerator(map, L);
        G.useExponentialShadowMap = true;
        G.bias = 0.0006; G.normalBias = 0.4;
        gens.push(G); spots.push(L);
      });

      // initial casters/receivers
      s.meshes.forEach(m=> m.receiveShadows = true);
      const casters = s.meshes.filter(m=> m.isVisible!==false && m.getTotalVertices?.()>0);
      gens.forEach(g=> g.getShadowMap().renderList = casters);

      STATE.rigs[mesh.name] = { root, spots, gens, intensity:I };

      // live brightness
      $('#lx-bright').oninput = (e)=> { const v=+e.target.value||0; spots.forEach(L=> L.intensity = v); STATE.rigs[mesh.name].intensity=v; };
      toast('Rig attached to '+mesh.name);
    }
  }

  // ------------------ Rooms / Doors Mapper ------------------
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

    const tplBtn  = btn('Find Door Template', ()=>{
      const m = s.getMeshByName('Puerta_Puerta_0') || s.getNodeByName('Puerta_Puerta_0');
      if (m){ toast('Template found'); } else { toast('Puerta_Puerta_0 not found'); }
    });
    const placeBtn= btn('Place Door', ()=> startDoorPlacer());
    const saveBtn = btn('Save Mapping (JSON)', ()=> exportJSON('mapping.json',STATE.mapping));
    const saveJs  = btn('Export doors_mapping.js', ()=> exportText('doors_mapping.js', renderDoorsMappingJS(STATE.mapping)));

    const list = el('div',{id:'rm-list',style:{marginTop:'6px',maxHeight:'220px',overflow:'auto',border:'1px solid #033',padding:'6px'}},[]);

    const bar1 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},[
      lab('Room'), roomSel, roomNew, setRoom, lab('Active:'), active
    ]);
    const bar2 = el('div',{style:{display:'flex',gap:'6px',alignItems:'center',marginTop:'6px'}},[
      tplBtn, placeBtn, saveBtn, saveJs
    ]);

    PANEL.body.appendChild(bar1); PANEL.body.appendChild(bar2);
    PANEL.body.appendChild(el('div',{style:{marginTop:'6px',color:'#8ff'}},[
      'Door placer: Left-click = drop, Right-drag = rotate, F = flip, Esc = cancel'
    ]));
    PANEL.body.appendChild(list);
    refreshList();

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
    }

    function startDoorPlacer(){
      if (!STATE.activeRoom) return toast('Pick a room first');
      const tpl = s.getMeshByName('Puerta_Puerta_0') || s.getNodeByName('Puerta_Puerta_0');
      if (!tpl) return toast('Puerta_Puerta_0 not found in scene');

      const ghost = tpl.clone('DoorGhost_'+Date.now()); // temp preview
      ghost.isPickable = false; ghost.visibility = 0.6; ghost.setEnabled(true);
      STATE.placer = { mode:'door', ghostMesh:ghost, rotY:0, room:STATE.activeRoom, flipped:false };

      const onMove = ()=>{ const hit = pickUnderCursor(); if (hit?.hit){ const p=hit.pickedPoint; ghost.position.copyFrom(p); } };
      const onDown = (pi)=>{
        const e=pi.event;
        if (e.button===0){ // left click drop
          commitDoor(); stop();
        }
      };
      const onWheel = (pi)=>{ const dy = pi.event.deltaY; STATE.placer.rotY -= dy*0.005; ghost.rotation.y = STATE.placer.rotY; };
      const onPointerObs = (pi)=>{
        if (pi.type===BABYLON.PointerEventTypes.POINTERMOVE) onMove();
        if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN) onDown(pi);
        if (pi.type===BABYLON.PointerEventTypes.POINTERWHEEL) onWheel(pi);
      };
      const onKey = (e)=>{
        if (e.key==='Escape'){ stop(); }
        if (e.key==='f' || e.key==='F'){ // flip
          STATE.placer.flipped = !STATE.placer.flipped;
          ghost.scaling.x *= -1;
        }
        if (e.button===2){ /* ignore — rotation handled by wheel; right-drag default context menu stays */ }
      };
      const scene = s;
      scene.onPointerObservable.add(onPointerObs);
      window.addEventListener('keydown', onKey);
      toast('Placer active: left-click to drop, mousewheel to rotate, F to flip');

      function stop(){
        try{
          scene.onPointerObservable.removeCallback(onPointerObs);
          window.removeEventListener('keydown', onKey);
          ghost?.dispose?.();
        }catch(_){}
        STATE.placer=null;
      }
      function commitDoor(){
        const name = 'Door_'+STATE.activeRoom+'_'+(Date.now().toString(36));
        const door = tpl.clone(name); door.isPickable=true; door.setEnabled(true);
        door.position.copyFrom(ghost.position); door.rotation.y = ghost.rotation.y; if (STATE.placer.flipped) door.scaling.x *= -1;

        const rec = {
          name,
          template: 'Puerta_Puerta_0',
          pos: { x:+door.position.x.toFixed(6), y:+door.position.y.toFixed(6), z:+door.position.z.toFixed(6) },
          rotY: +door.rotation.y.toFixed(6),
          scale: { x:+door.scaling.x.toFixed(6), y:+door.scaling.y.toFixed(6), z:+door.scaling.z.toFixed(6) }
        };
        if (!STATE.mapping.rooms[STATE.activeRoom]) STATE.mapping.rooms[STATE.activeRoom]={doors:[]};
        STATE.mapping.rooms[STATE.activeRoom].doors.push(rec);
        refreshList();
        toast('Door placed');
      }
    }
  }

  function renderDoorsMappingJS(map){
    return `// Auto-generated doors/rooms mapping
window.DOORS_MAP = ${JSON.stringify(map, null, 2)};

window.applyDoorsMapping = function(scene){
  const map = window.DOORS_MAP || {};
  if (!map.rooms) return;
  // Recreate doors by cloning the template mesh if missing
  const tpl = scene.getMeshByName('Puerta_Puerta_0') || scene.getNodeByName('Puerta_Puerta_0');
  for (const roomName in map.rooms){
    const R = map.rooms[roomName]; if (!R) continue;
    (R.doors||[]).forEach(d=>{
      let m = scene.getMeshByName(d.name) || scene.getNodeByName(d.name);
      if (!m && tpl){ m = tpl.clone(d.name); m.setEnabled(true); }
      if (!m) return;
      m.position.set(d.pos.x,d.pos.y,d.pos.z);
      m.rotation.y = d.rotY || 0;
      m.scaling.set(d.scale.x,d.scale.y,d.scale.z);
    });
  }
};`;
  }

  // ------------------ Ghost / Player / Inventory / Screenshot / Diagnostics / Export (unchanged from previous version) ---
  function buildGhostUI(){
    const types = Object.keys(window.GHOSTS||{Spirit:1});
    const typeSel = sel('ghost-type', types.map(k=>[k,k])); typeSel.value = window.currentGhostKey || types[0];
    const row1 = el('div',{className:'row',style:{gap:'8px'}},[
      lab('Type'), typeSel,
      withId(btn('Start Hunt',()=>{}),'ghost-hunt-start'),
      withId(btn('End Hunt',()=>{}),'ghost-hunt-end')
    ]);
    const row2 = el('div',{className:'row',style:{gap:'8px',marginTop:'6px'}},[
      lab('Speed'),  input('range','ghost-speed','1.4',{min:'0.3',max:'3.5',step:'0.05',style:{width:'200px'}}),
      lab('Step'),   input('range','ghost-step','0.55',{min:'0.2',max:'1.2',step:'0.01',style:{width:'200px'}}),
      withId(btn('To Camera',()=>{}),'ghost-to-me'),
      withId(btn('Flicker',()=>{}),'ghost-flicker'),
      withId(btn('Radio',()=>{}),'ghost-radio')
    ]);
    PANEL.body.appendChild(row1); PANEL.body.appendChild(row2);
    typeSel.onchange = ()=>{ window.currentGhostKey = typeSel.value; };
    $('#ghost-hunt-start').onclick = ()=> window.beginHunt?.();
    $('#ghost-hunt-end').onclick   = ()=> window.endHunt?.();
    $('#ghost-to-me').onclick      = ()=>{ try{ const p=window.camera.position.add(window.camera.getForwardRay().direction.scale(2)); p.y = 0.1; window.ghost.position = p; }catch(e){} };
    $('#ghost-flicker').onclick    = ()=> window.flickerStart?.();
    $('#ghost-radio').onclick      = ()=>{ try{ window.audio?.spiritbox?.play(); }catch{} };
    $('#ghost-speed').oninput = e=>{ if(window.ghost) ghost.speed = parseFloat(e.target.value)||1.4; };
    $('#ghost-step').oninput  = e=>{ if(window.ghost) ghost.stepInterval = parseFloat(e.target.value)||0.55; };
  }

  function buildPlayerUI(){
    const pos = el('div',{id:'pos-readout',style:{color:'#9ff'}},['x:-- y:-- z:--']);
    const row1 = el('div',{className:'row',style:{gap:'8px',marginTop:'6px'}},[
      check('NoClip','p-noclip', e=> window.camera.checkCollisions = !e.target.checked)
    ]);
    const row2 = el('div',{className:'row',style:{gap:'8px',marginTop:'6px'}},[
      lab('X'), input('number','px','0',{step:'0.1'}), lab('Y'), input('number','py','1.7',{step:'0.1'}), lab('Z'), input('number','pz','0',{step:'0.1'}),
      btn('Teleport', ()=>{ const x=parseFloat($('#px').value)||0, y=parseFloat($('#py').value)||1.7, z=parseFloat($('#pz').value)||0; window.camera.position.set(x,y,z); })
    ]);
    PANEL.body.appendChild(pos); PANEL.body.appendChild(row1); PANEL.body.appendChild(row2);
  }

  function buildInventoryUI(){
    const host = el('div',{style:{display:'grid',gridTemplateColumns:'60px 1fr 80px 80px',gap:'6px',alignItems:'center'}},[]);
    for (let i=1;i<=5;i++){
      host.appendChild(el('div',{style:{color:'#9ff'}},[`Slot ${i}`]));
      host.appendChild(input('text',`inv-name-${i}`, (window.inventory.slots[i]||''), {placeholder:'item name'}));
      host.appendChild(input('number',`inv-ch-${i}`, (isFinite(window.inventory.slotCharges[i])? window.inventory.slotCharges[i]: ''), {placeholder:'∞'}));
      host.appendChild(btn('Select', ()=>{ window.selectSlot?.(i); toast('Selected slot '+i); }));
    }
    const row = el('div',{style:{display:'flex',gap:'8px',marginTop:'6px'}},[
      btn('Apply', ()=>{
        for(let i=1;i<=5;i++){
          window.inventory.slots[i] = $('#inv-name-'+i).value || null;
          const v = $('#inv-ch-'+i).value; window.inventory.slotCharges[i] = (v===''? Infinity : Math.max(0, parseInt(v)||0));
        }
        window.rebuildBelt?.(); toast('Inventory updated');
      })
    ]);
    PANEL.body.appendChild(host); PANEL.body.appendChild(row);
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

  // ------------------ init + loops ------------------
  function pointerObserver(){
    const s=SCENE(); if(!s) return;
    s.onPointerObservable.add((pi)=>{
      if (pi.type===BABYLON.PointerEventTypes.POINTERDOWN){
        if (STATE.clickTeleport){
          const p = s.createPickingRay(s.pointerX, s.pointerY, BABYLON.Matrix.Identity(), window.camera);
          const hit = s.pickWithRay(p, m=>m && m.isPickable!==false);
          if (hit?.hit){ const t=hit.pickedPoint.clone(); t.y += 1.7; window.camera.position.copyFrom(t); toast('Teleported'); }
        }
      }
    });
  }
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
      "Lights+": buildLightsUI,       // upgraded
      Rooms: buildRoomsUI,            // new
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
    STATE.ready=true; toast('Dev Tools v5 ready', 900);
  }
  const id = setInterval(()=>{ try{ if ($('#devtools-panel') && SCENE() && window.camera){ clearInterval(id); init(); } }catch{} }, 200);

})();
