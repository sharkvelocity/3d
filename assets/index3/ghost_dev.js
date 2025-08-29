// ./assets/index3/ghost_dev.js — v1.0
// Standalone Ghost Dev Tools for PhasmaPhoney (Babylon.js)
//
// Features:
//  - Pick ghost mesh (dropdown + pick under crosshair)
//  - Teleport ghost ahead of camera (look ray)
//  - Resize ghost
//  - Dev Visible toggle (auto-restore visibility when dev mode off)
//  - Ghost Barrier editor: click to place points, auto-connect segments, grid snap option,
//    no-clip while editing, export/import JSON (size + barriers)
//  - Alt+G hotkey opens/closes panel (ignored while typing in inputs)
//
// Globals exposed:
//   window.GHOST_DEV = {
//     getConfig(), applyConfig(cfg),
//     setGhostByName(name), setGhostVisibleDev(on),
//     teleportAhead(dist?),
//     startBarrierEdit(), finishBarrierEdit(), cancelBarrierEdit(), clearBarriers(),
//     exportConfigJSON(), importConfigJSONFile(file)
//   }
//   window.ghostDev_isBlockedRay(fromVec3, toVec3)  // rough blocker check against barrier meshes
//
// Requires: BABYLON, scene, camera

(function(){
  "use strict";

  // ------------- small DOM helpers -------------
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
  const input = (type,id,val,attrs={})=>{
    return el('input',Object.assign({type,id,value:val,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'6px'}},attrs),[]);
  };
  const lab = (t)=> el('span',{style:{color:'#9ff',minWidth:'60px',display:'inline-block'}},[t]);
  const sel = (id, opts)=>{ const s=el('select',{id,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'6px'}},[]);
    (opts||[]).forEach(([v,t])=> s.appendChild(el('option',{value:v},[t]))); return s; };

  // ------------- scene refs / utils -------------
  const SCENE  = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA = ()=> window.camera || SCENE()?.activeCamera;
  const toast  = (m,ms=950)=> (window.toast? window.toast(m,ms): console.log('[ghost-dev]',m));
  const xyz    = (v)=>({x:+v.x.toFixed(6), y:+v.y.toFixed(6), z:+v.z.toFixed(6)});
  const v3     = (x,y,z)=> new BABYLON.Vector3(x,y,z);

  // ------------- state -------------
  const STATE = {
    ready: false,
    ghost: null,                // current ghost mesh/root
    ghostOrig: { wasVisible: null, visibility: 1 },
    devVisible: false,
    scale: 1,
    // barriers
    barrierRoot: null,
    segments: [],               // {start:{x,y,z}, end:{x,y,z}, height, thickness}
    editing: null,              // { startPoint: Vector3, snapGrid, h, t, prevCamCollide, prevCamGravity }
    // UI
    listNames: [],
    panel: null,
  };

  // ------------- helpers -------------
  function mapMeshes(){ return SCENE()?.meshes || []; }
  function buildGhostList(){
    const names = mapMeshes().map(m=>m.name).filter(Boolean);
    // Prefer names that look like ghost-ish first
    const pri = [], rest = [];
    names.forEach(n=>{
      if (/ghost|spirit|entity|phantom|demon|thaye|deogen|revenant|shade|oni|yurei|wraith|mimic|poltergeist/i.test(n)) pri.push(n);
      else rest.push(n);
    });
    STATE.listNames = [...new Set([...pri, ...rest])].slice(0,800);
  }
  function setGhostByName(name){
    const s=SCENE(); if(!s) return null;
    const m = s.getMeshByName(name) || s.getNodeByName(name);
    if (!m){ toast('Mesh not found: '+name); return null; }
    STATE.ghost = m;
    // If scale stored in metadata, keep it
    const sc = (m.metadata && m.metadata.ghostScale) ? m.metadata.ghostScale : (STATE.scale || 1);
    applyScale(sc);
    // memorize original vis only once
    if (STATE.ghostOrig.wasVisible===null){
      STATE.ghostOrig.wasVisible = (m.isVisible!==false && (m.visibility ?? 1) > 0);
      STATE.ghostOrig.visibility = (typeof m.visibility==='number') ? m.visibility : (STATE.ghostOrig.wasVisible?1:0);
    }
    $('#gd-ghost').value = name;
    $('#gd-selected').textContent = name;
    refreshDevVisible();
    toast('Ghost set: '+name);
    return m;
  }
  function pickUnderCrosshair(){
    const s=SCENE(), c=CAMERA(); if(!s||!c) return null;
    const ray = c.getForwardRay(50);
    return s.pickWithRay(ray, m=> m && m.isPickable!==false);
  }
  function teleportAhead(dist){
    const s=SCENE(), c=CAMERA(), g=STATE.ghost; if(!s||!c||!g) return;
    const ray = c.getForwardRay(50);
    const hit = s.pickWithRay(ray, m=> m && m.isPickable!==false);
    let target;
    if (hit?.hit){
      // a little offset back toward the camera to avoid clipping
      const back = ray.direction.scale(0.25);
      target = hit.pickedPoint.subtract(back);
    } else {
      const d = (isFinite(+dist)? +dist : 2.5);
      target = c.position.add(ray.direction.scale(d));
      // drop to ground
      const down = new BABYLON.Ray(target.add(v3(0,5,0)), v3(0,-1,0), 30);
      const ghit = s.pickWithRay(down, m=> m && m.isPickable!==false);
      if (ghit?.hit) target = ghit.pickedPoint;
    }
    const yOff = (g.getBoundingInfo?.().boundingBox?.centerWorld?.y || g.position.y) - g.position.y;
    g.position.copyFrom(target.add(v3(0, Math.max(0,yOff), 0)));
    // face the camera (optional)
    try{
      const dir = c.position.subtract(g.position).normalize();
      g.rotationQuaternion = null;
      g.rotation.y = Math.atan2(dir.x, dir.z);
    }catch{}
    toast('Ghost teleported');
  }
  function applyScale(sc){
    const g=STATE.ghost; if(!g) return;
    STATE.scale = Math.max(0.1, Math.min(5, +sc || 1));
    g.scaling.set(STATE.scale, STATE.scale, STATE.scale);
    g.metadata = g.metadata||{}; g.metadata.ghostScale = STATE.scale;
    const ui = $('#gd-scale'); if (ui) ui.value = String(STATE.scale);
  }
  function refreshDevVisible(){
    const g=STATE.ghost; if(!g) return;
    if (STATE.devVisible){
      g.isVisible = true;
      if (typeof g.visibility === 'number') g.visibility = 1;
    } else {
      // restore original
      g.isVisible = !!STATE.ghostOrig.wasVisible;
      if (typeof g.visibility === 'number') g.visibility = STATE.ghostOrig.visibility;
    }
  }

  // ---- Watch main DevTools panel; when it hides, restore invisibility
  function hookDevtoolsVisibility(){
    const panel = $('#devtools-panel');
    if (!panel) return;
    const obs = new MutationObserver(()=>{
      const shown = panel.style.display !== 'none';
      // if panel closed and devVisible came from us, restore invis
      if (!shown && STATE.devVisible){ STATE.devVisible=false; refreshDevVisible(); $('#gd-devvis').checked=false; }
    });
    obs.observe(panel, { attributes:true, attributeFilter:['style'] });
  }

  // ------------- Barrier editor -------------
  function ensureBarrierRoot(){
    const s=SCENE(); if (!s) return null;
    if (STATE.barrierRoot && !STATE.barrierRoot.isDisposed?.()) return STATE.barrierRoot;
    STATE.barrierRoot = new BABYLON.TransformNode('GhostBarrierRoot', s);
    return STATE.barrierRoot;
  }
  function makeSegmentMesh(p0, p1, h, t){
    const s=SCENE(); if(!s) return null;
    const mid = p0.add(p1).scale(0.5);
    const dir = p1.subtract(p0);
    const L = Math.max(0.05, dir.length());
    const yaw = Math.atan2(dir.x, dir.z);
    const m = BABYLON.MeshBuilder.CreateBox('GhostBarrier_'+Date.now().toString(36), { width: L, height: h, depth: t }, s);
    m.position.copyFrom(mid); m.rotation.set(0, yaw, 0);
    m.position.y += h/2; // rise so bottom sits on ground
    m.parent = ensureBarrierRoot();
    m.isPickable = false;
    m.checkCollisions = true;  // if your ghost uses physics/collision checks
    m.visibility = 0.12;       // faintly visible while in dev
    m.metadata = Object.assign(m.metadata||{}, { isGhostBlocker:true });
    // receive/cast helps for editors with lights
    m.receiveShadows = true;
    return m;
  }
  function startBarrierEdit(){
    const s=SCENE(), c=CAMERA(); if(!s||!c) return;
    if (STATE.editing) return;
    const snapGrid = +($('#gd-grid').value||0) || 0;
    const h = +($('#gd-h').value||2.2) || 2.2;
    const t = +($('#gd-t').value||0.18) || 0.18;
    STATE.editing = {
      startPoint: null, snapGrid: snapGrid, h, t,
      prevCamCollide: c.checkCollisions, prevCamGravity: c.applyGravity
    };
    c.checkCollisions = false; c.applyGravity = false;
    s.onPointerObservable.add(_pointerObs);
    window.addEventListener('keydown', _barrierKeys);
    toast('Ghost Barrier: click to add points, Esc to cancel, Enter to finish');
  }
  function finishBarrierEdit(){
    const s=SCENE(), c=CAMERA(); if(!s||!c) return;
    if (!STATE.editing) return;
    s.onPointerObservable.removeCallback(_pointerObs);
    window.removeEventListener('keydown', _barrierKeys);
    c.checkCollisions = !!STATE.editing.prevCamCollide;
    c.applyGravity    = !!STATE.editing.prevCamGravity;
    STATE.editing = null;
    toast('Barrier editing finished');
  }
  function cancelBarrierEdit(){
    finishBarrierEdit();
  }
  function clearBarriers(){
    const root = ensureBarrierRoot();
    root.getChildren().slice().forEach(ch=> ch.dispose?.());
    STATE.segments.length = 0;
    toast('All ghost barriers cleared');
  }
  function _barrierKeys(e){
    if (e.key === 'Escape') cancelBarrierEdit();
    if (e.key === 'Enter')  finishBarrierEdit();
  }
  function _snapTo(v, g){
    if (!g || g<=0) return v;
    return Math.round(v/g)*g;
  }
  function _pointerObs(pi){
    if (pi.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
    const s=SCENE(), c=CAMERA(); if(!s||!c) return;
    if (pi.event.button!==0) return; // left only
    // Pick on geometry or ground fallback
    let hit = s.pick(s.pointerX, s.pointerY, m=> m && m.isPickable!==false);
    let p;
    if (hit?.hit) p = hit.pickedPoint.clone();
    else {
      const ray = c.getForwardRay(50);
      hit = s.pickWithRay(ray, m=> m && m.isPickable!==false);
      p = hit?.hit? hit.pickedPoint.clone() : c.position.add(ray.direction.scale(2.5));
    }
    const gsz = STATE.editing.snapGrid;
    p.x = _snapTo(p.x, gsz); p.z = _snapTo(p.z, gsz); // keep y auto
    // stitch to last point’s y (ground difference can be noisy)
    if (STATE.editing.startPoint){
      p.y = STATE.editing.startPoint.y; // snap same height
      const seg = makeSegmentMesh(STATE.editing.startPoint, p, STATE.editing.h, STATE.editing.t);
      STATE.segments.push({ start: xyz(STATE.editing.startPoint), end: xyz(p), height: STATE.editing.h, thickness: STATE.editing.t });
    }
    STATE.editing.startPoint = p;
  }

  // rough blocker test for ghost scripts if you want to use it
  window.ghostDev_isBlockedRay = function(from, to){
    try{
      const s=SCENE(); if(!s) return false;
      const dir = to.subtract(from); const len = dir.length();
      if (len<=0.001) return false;
      const ray = new BABYLON.Ray(from, dir.normalize(), len);
      const pick = s.pickWithRay(ray, m=> m && m.metadata?.isGhostBlocker===true);
      return !!(pick && pick.hit);
    }catch{ return false; }
  };

  // ------------- config save/load -------------
  function getConfig(){
    return {
      ghostName: STATE.ghost?.name || null,
      ghostScale: STATE.scale || 1,
      devVisible: !!STATE.devVisible,
      barriers: STATE.segments.slice()
    };
  }
  function applyConfig(cfg){
    if (!cfg) return;
    if (cfg.ghostName) setGhostByName(cfg.ghostName);
    if (isFinite(cfg.ghostScale)) applyScale(cfg.ghostScale);
    if (Array.isArray(cfg.barriers)){
      clearBarriers();
      cfg.barriers.forEach(seg=>{
        const p0=v3(seg.start.x, seg.start.y, seg.start.z);
        const p1=v3(seg.end.x,   seg.end.y,   seg.end.z);
        makeSegmentMesh(p0,p1, seg.height||2, seg.thickness||0.18);
        STATE.segments.push({ start: xyz(p0), end: xyz(p1), height: seg.height||2, thickness: seg.thickness||0.18 });
      });
    }
    STATE.devVisible = !!cfg.devVisible;
    refreshDevVisible();
  }
  function exportConfigJSON(){
    const blob=new Blob([JSON.stringify(getConfig(),null,2)],{type:'application/json'});
    const a=el('a',{download:'ghost_config.json'}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }
  function importConfigJSONFile(file){
    const fr=new FileReader();
    fr.onload = ()=> {
      try{ const cfg=JSON.parse(fr.result); applyConfig(cfg); toast('Ghost config loaded'); }
      catch(e){ toast('Invalid JSON'); }
    };
    fr.readAsText(file);
  }

  // ------------- UI -------------
  function ensurePanel(){
    if (STATE.panel && document.body.contains(STATE.panel)) return STATE.panel;
    // styles
    if (!$('#ghostdev-styles')){
      const style = el('style',{id:'ghostdev-styles'},[`
#ghostdev-toggle{ position:fixed; right:12px; bottom:82px; z-index:9001; padding:8px 12px; border:1px solid #066; background:#111; color:#0ff; border-radius:8px; cursor:pointer; }
#ghostdev-panel{ position:fixed; right:12px; bottom:12px; width:420px; max-height:80vh; overflow:auto; background:#0b0b0b; border:1px solid #033; border-radius:10px; padding:10px; color:#cfe; font:12px/1.4 monospace; display:none; z-index:9002; }
#ghostdev-panel .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0; }
`]);
      document.head.appendChild(style);
    }
    // toggle
    let toggle = $('#ghostdev-toggle');
    if (!toggle){
      toggle = el('button',{id:'ghostdev-toggle',className:'hud-btn'},['Ghost Tools']);
      document.body.appendChild(toggle);
    }
    let panel = $('#ghostdev-panel');
    if (!panel){
      panel = el('div',{id:'ghostdev-panel'},[]);
      document.body.appendChild(panel);
    }
    toggle.onclick = ()=>{ panel.style.display = (panel.style.display==='none'?'block':'none'); };
    // Alt+G hotkey
    window.addEventListener('keydown', (e)=>{
      if (e.altKey && (e.key==='g' || e.key==='G') && !e.ctrlKey && !e.metaKey && !e.shiftKey){
        const ae=document.activeElement; const typing = ae && (/input|textarea|select/i.test(ae.tagName));
        if (!typing){ e.preventDefault(); toggle.click(); }
      }
    });

    STATE.panel = panel;
    return panel;
  }

  function buildUI(){
    const s=SCENE(); if(!s) return;
    const panel = ensurePanel(); panel.innerHTML="";
    buildGhostList();

    // header
    panel.appendChild(el('div',{className:'row'},[
      el('div',{style:{color:'#9ff',fontWeight:'bold'}},['Ghost Dev Tools']),
      el('div',{style:{marginLeft:'auto',opacity:0.8}},['Alt+G'])
    ]));

    // ghost pick
    const select = sel('gd-ghost', STATE.listNames.map(n=>[n,n]));
    const refreshBtn = btn('Refresh', ()=>{ buildGhostList(); buildUI(); });
    const pickBtn = btn('Pick Under Crosshair', ()=>{
      const hit = pickUnderCrosshair();
      if (hit?.hit && hit.pickedMesh){ setGhostByName(hit.pickedMesh.name); }
      else toast('Nothing under crosshair');
    });
    const selBtn  = btn('Use Selected', ()=>{ const name=$('#gd-ghost').value; setGhostByName(name); });
    const selected = el('b',{id:'gd-selected',style:{color:'#aff'}},[STATE.ghost?.name||'(none)']);
    panel.appendChild(el('div',{className:'row'},[ lab('Ghost'), select, refreshBtn, pickBtn, selBtn ]));
    panel.appendChild(el('div',{className:'row'},[ lab('Selected'), selected ]));

    // teleport/scale/visibility
    const dist = input('number','gd-dist','2.5',{step:'0.1',style:{width:'84px'}});
    const tp   = btn('Teleport Ahead', ()=> teleportAhead(+$('#gd-dist').value||2.5));
    const scale= input('number','gd-scale', String(STATE.scale||1), {step:'0.05',style:{width:'84px'}});
    const setSc= btn('Apply Scale', ()=> applyScale(+$('#gd-scale').value||1));
    const devVis = el('label',{style:{display:'inline-flex',gap:'6px',alignItems:'center'}},[
      el('input',{id:'gd-devvis',type:'checkbox',checked:STATE.devVisible}),
      el('span',{},['Dev Visible'])
    ]);
    setTimeout(()=> $('#gd-devvis').addEventListener('change',(e)=>{ STATE.devVisible = e.target.checked; refreshDevVisible(); }),0);

    panel.appendChild(el('div',{className:'row'},[ lab('Ahead'), dist, tp, lab('Scale'), scale, setSc, devVis ]));

    // barrier editor
    const grid  = input('number','gd-grid','0.25',{step:'0.05',style:{width:'84px'}});
    const h     = input('number','gd-h','2.2',{step:'0.05',style:{width:'84px'}});
    const t     = input('number','gd-t','0.18',{step:'0.01',style:{width:'84px'}});
    const bStart= btn('Start Barrier', startBarrierEdit);
    const bFin  = btn('Finish', finishBarrierEdit);
    const bCan  = btn('Cancel', cancelBarrierEdit);
    const bClr  = btn('Clear All', clearBarriers);

    panel.appendChild(el('div',{className:'row',style:{marginTop:'6px'}},[
      el('div',{style:{color:'#9ad',fontWeight:'bold'}},['Ghost Barrier'])
    ]));
    panel.appendChild(el('div',{className:'row'},[
      lab('Grid'), grid, lab('H'), h, lab('T'), t, bStart, bFin, bCan, bClr
    ]));
    panel.appendChild(el('div',{style:{color:'#8ff',opacity:0.9,marginTop:'2px'}},[
      'Click to place points: each new point creates a segment from the last point. Esc = cancel, Enter = finish.'
    ]));

    // save/load
    const save = btn('Export JSON', exportConfigJSON);
    const load = btn('Import JSON', ()=>{
      const fi = el('input',{type:'file',accept:'.json',style:{display:'none'}},[]);
      fi.onchange = ()=>{ const f=fi.files?.[0]; if (f) importConfigJSONFile(f); };
      fi.click();
    });
    panel.appendChild(el('div',{className:'row',style:{marginTop:'6px'}},[ save, load ]));

    // initial selections reflect state
    if (STATE.ghost) $('#gd-ghost').value = STATE.ghost.name;
  }

  // ------------- boot -------------
  function init(){
    if (STATE.ready) return;
    if (!SCENE() || !CAMERA()) return;
    ensurePanel();
    buildUI();
    hookDevtoolsVisibility();
    STATE.ready = true;
    toast('Ghost Dev ready', 900);
  }
  const boot = setInterval(()=>{ try{ if (SCENE() && CAMERA()){ clearInterval(boot); init(); } }catch{} }, 200);

  // ------------- public API -------------
  window.GHOST_DEV = {
    getConfig,
    applyConfig,
    setGhostByName,
    setGhostVisibleDev(on){ STATE.devVisible=!!on; refreshDevVisible(); const c=$('#gd-devvis'); if(c) c.checked=!!on; },
    teleportAhead,
    startBarrierEdit, finishBarrierEdit, cancelBarrierEdit, clearBarriers,
    exportConfigJSON, importConfigJSONFile
  };

})();
