// ./assets/index3/ghost_dev.js — v1.2 (GLB picker ready)
// - Pick & load ghost GLB (ghost1..ghost5 or custom URL)
// - Exposes window.PREFERRED_GHOST_ROOT / _MODEL_NAME / _SCALE for AI to use
// - Teleport ahead, Scale, Dev Visible, Barrier editor, Export/Import JSON
//
// Requires: BABYLON, window.scene, window.camera

(function(){
  "use strict";

  // ----------- Config (you can override BEFORE this file loads) -----------
  const BASE_URL = (window.GHOST_BASE_URL || "./assets/models/ghosts/");
  const DEFAULT_LIST = (window.GHOST_MODEL_LIST || [
    "ghost1.glb",
    "ghost2.glb",
    "ghost3.glb",
    "ghost4.glb",
    "ghost5.glb",
  ]);

  // ----------- tiny DOM -----------
  const $ = (s,r=document)=>r.querySelector(s);
  const el=(t,a={},k=[])=>{const n=document.createElement(t);
    for(const p in a){ if(p==="style")Object.assign(n.style,a[p]); else if(p in n)n[p]=a[p]; else n.setAttribute(p,a[p]); }
    for(const c of k) n.appendChild(typeof c==="string"?document.createTextNode(c):c);
    return n;
  };
  const btn=(txt,fn)=>{const b=el("button",{className:"hud-btn"},[txt]); if(fn)b.onclick=fn; return b;};
  const lab=(t)=>el("span",{style:{color:"#9ff",minWidth:"70px",display:"inline-block"}},[t]);
  const input=(type,id,val,extra={})=>el("input",Object.assign({type,id,value:val,style:{padding:"4px",background:"#000",color:"#0ff",border:"1px solid #066",borderRadius:"6px"}},extra),[]);
  const sel=(id,opts)=>{const s=el("select",{id,style:{padding:"4px",background:"#000",color:"#0ff",border:"1px solid #066",borderRadius:"6px"}},[]); (opts||[]).forEach(([v,t])=>s.appendChild(el("option",{value:v},[t]))); return s;};

  // ----------- scene refs -----------
  const SCENE = ()=> window.scene || BABYLON.Engine?.LastCreatedScene;
  const CAMERA= ()=> window.camera || SCENE()?.activeCamera;
  const toast = (m,ms=900)=> (window.toast? window.toast(m,ms):console.log("[ghost-dev]",m));
  const v3=(x,y,z)=> new BABYLON.Vector3(x,y,z);
  const xyz=(v)=>({x:+v.x.toFixed(6), y:+v.y.toFixed(6), z:+v.z.toFixed(6)});

  // ----------- state -----------
  const ST = {
    panel:null, ready:false,
    ghostRoot:null,     // TransformNode that owns the imported ghost meshes
    imported:[],        // imported meshes/nodes for cleanup
    devVisible:false,
    scale:1,
    // barriers
    barrierRoot:null, segments:[], editing:null
  };

  // ----------- helpers -----------
  function ensurePanel(){
    if (ST.panel && document.body.contains(ST.panel)) return ST.panel;
    if (!$('#ghostdev-styles')){
      document.head.appendChild(el('style',{id:'ghostdev-styles'},[`
#ghostdev-toggle{ position:fixed; right:12px; bottom:82px; z-index:9001; padding:8px 12px; border:1px solid #066; background:#111; color:#0ff; border-radius:8px; cursor:pointer; }
#ghostdev-panel{ position:fixed; right:12px; bottom:12px; width:460px; max-height:80vh; overflow:auto; background:#0b0b0b; border:1px solid #033; border-radius:10px; padding:10px; color:#cfe; font:12px/1.4 monospace; display:none; z-index:9002; }
#ghostdev-panel .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0; }
`]));
    }
    let toggle = $('#ghostdev-toggle');
    if (!toggle){ toggle = el('button',{id:'ghostdev-toggle',className:'hud-btn'},['Ghost Tools']); document.body.appendChild(toggle); }
    let panel = $('#ghostdev-panel');
    if (!panel){ panel = el('div',{id:'ghostdev-panel'},[]); document.body.appendChild(panel); }
    toggle.onclick = ()=> panel.style.display = (panel.style.display==='none'?'block':'none');
    window.addEventListener('keydown',(e)=>{
      if(e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && (e.key==='g'||e.key==='G')){
        const ae=document.activeElement; const typing = ae && (/input|textarea|select/i.test(ae.tagName));
        if(!typing){ e.preventDefault(); toggle.click(); }
      }
    });
    ST.panel = panel;
    return panel;
  }

  function setDevVisible(on){
    ST.devVisible = !!on;
    if (!ST.ghostRoot) return;
    const stack=[ST.ghostRoot];
    while(stack.length){
      const n=stack.pop();
      if('isVisible' in n) n.isVisible = on;
      if('visibility' in n) n.visibility = on?1:0;
      if(n.getChildren) n.getChildren().forEach(ch=>stack.push(ch));
    }
  }

  function applyScale(sc){
    ST.scale = Math.max(0.1, Math.min(5, +sc || 1));
    if (ST.ghostRoot) ST.ghostRoot.scaling.set(ST.scale, ST.scale, ST.scale);
    window.PREFERRED_GHOST_SCALE = ST.scale; // expose to AI
    const ui=$('#gd-scale'); if(ui) ui.value=String(ST.scale);
  }

  function teleportAhead(dist){
    const s=SCENE(), c=CAMERA(); if(!s||!c||!ST.ghostRoot) return;
    const ray=c.getForwardRay(50);
    const hit=s.pickWithRay(ray,m=>m && m.isPickable!==false);
    let p;
    if (hit?.hit){
      p=hit.pickedPoint.subtract(ray.direction.scale(0.25));
    } else {
      p=c.position.add(ray.direction.scale(isFinite(+dist)?+dist:2.5));
      const down=new BABYLON.Ray(p.add(v3(0,5,0)), v3(0,-1,0), 30);
      const h2=s.pickWithRay(down,m=>m && m.isPickable!==false);
      if (h2?.hit) p=h2.pickedPoint;
    }
    ST.ghostRoot.position.copyFrom(p);
  }

  // ----------- GLB loading -----------
  function clearGhost(){
    try{ ST.imported.forEach(n=> n.dispose?.()); }catch{}
    ST.imported.length=0;
    try{ ST.ghostRoot?.dispose?.(); }catch{}
    ST.ghostRoot=null;
  }

  async function loadGhostGLB(url){
    const s=SCENE(); if(!s) return toast('Scene not ready');
    if (!url) return toast('No GLB url');

    const i=url.lastIndexOf('/');
    const root = i>=0 ? url.slice(0,i+1) : '';
    const file = i>=0 ? url.slice(i+1) : url;

    clearGhost();

    // Create a stable root we control
    const GR = new BABYLON.TransformNode('GhostRoot_Dev', s);
    ST.ghostRoot = GR;

    try{
      const res = await BABYLON.SceneLoader.ImportMeshAsync("", root, file, s);
      const meshes = (res.meshes||[]).filter(m=>m && m.name!=='__root__');
      const nodes  = (res.transformNodes||[]);
      // parent everything to GR
      meshes.forEach(m=>{ m.setEnabled(true); m.parent = GR; ST.imported.push(m); });
      nodes.forEach(n=>{ if(n!==GR){ n.parent = GR; ST.imported.push(n);} });

      // basic material tweak: make visible but allow dev toggle to hide
      const stack=[GR];
      while(stack.length){
        const n=stack.pop();
        if(n.material && typeof n.material.alpha==='number'){ /* keep author alpha */ }
        if('isVisible' in n) n.isVisible = false; // invisible by default
        if('visibility' in n) n.visibility = 0;
        n.getChildren?.().forEach(ch=>stack.push(ch));
      }

      // expose to AI (ghost_movement.js will prefer these if present)
      window.PREFERRED_GHOST_ROOT = GR;
      window.PREFERRED_GHOST_MODEL_NAME = meshes[0]?.name || 'GhostRoot_Dev';

      // keep current scale/pos expectations
      applyScale(ST.scale);
      teleportAhead(2.5);

      toast('Ghost GLB loaded');
    }catch(e){
      toast('Failed to load ghost GLB'); console.error(e);
      clearGhost();
    }
  }

  // ----------- Barrier editor (unchanged behavior) -----------
  function ensureBarrierRoot(){
    const s=SCENE(); if(!s) return null;
    if (ST.barrierRoot && !ST.barrierRoot.isDisposed?.()) return ST.barrierRoot;
    ST.barrierRoot = new BABYLON.TransformNode('GhostBarrierRoot', s);
    return ST.barrierRoot;
  }
  function makeSeg(p0,p1,h,t){
    const s=SCENE(); if(!s) return null;
    const mid=p0.add(p1).scale(0.5);
    const dir=p1.subtract(p0), L=Math.max(0.05,dir.length());
    const yaw=Math.atan2(dir.x,dir.z);
    const m=BABYLON.MeshBuilder.CreateBox('GhostBarrier_'+Date.now().toString(36),{width:L,height:h,depth:t},s);
    m.position.copyFrom(mid); m.rotation.set(0,yaw,0); m.position.y += h/2;
    m.parent=ensureBarrierRoot(); m.isPickable=false; m.checkCollisions=true; m.visibility=0.12;
    m.receiveShadows=true; m.metadata=Object.assign(m.metadata||{}, {isGhostBlocker:true});
    return m;
  }
  const ED={active:false,start:null,snap:0.25,h:2.2,t:0.18,obs:null,prevCol:null,prevGrav:null};
  function startBarrier(){
    const s=SCENE(), c=CAMERA(); if(!s||!c) return;
    if (ED.active) return;
    ED.active=true; ED.start=null;
    ED.snap=+($('#gd-grid').value||0.25)||0.25;
    ED.h=+($('#gd-h').value||2.2)||2.2;
    ED.t=+($('#gd-t').value||0.18)||0.18;
    ED.prevCol=c.checkCollisions; ED.prevGrav=c.applyGravity; c.checkCollisions=false; c.applyGravity=false;
    ED.obs=(pi)=>{
      if (pi.type!==BABYLON.PointerEventTypes.POINTERDOWN) return;
      if (pi.event.button!==0) return;
      const hit=s.pick(s.pointerX,s.pointerY,m=>m && m.isPickable!==false);
      let p=hit?.hit? hit.pickedPoint.clone() : c.position.add(c.getForwardRay().direction.scale(2.5));
      const snap=v=>Math.round(v/ED.snap)*ED.snap;
      p.x=snap(p.x); p.z=snap(p.z); if(ED.start) p.y=ED.start.y;
      if (ED.start){
        makeSeg(ED.start,p,ED.h,ED.t);
        ST.segments.push({start:xyz(ED.start), end:xyz(p), height:ED.h, thickness:ED.t});
      }
      ED.start=p;
    };
    s.onPointerObservable.add(ED.obs);
    const key=(e)=>{ if(e.key==='Escape') finishBarrier(true); if(e.key==='Enter') finishBarrier(false); };
    window.addEventListener('keydown', key, {once:false});
    ED._key=key;
    toast('Barrier edit: click to add segments, Enter=finish, Esc=cancel');
  }
  function finishBarrier(cancel){
    const s=SCENE(), c=CAMERA(); if(!s||!c||!ED.active) return;
    s.onPointerObservable.removeCallback(ED.obs); ED.obs=null;
    window.removeEventListener('keydown', ED._key); ED._key=null;
    c.checkCollisions=!!ED.prevCol; c.applyGravity=!!ED.prevGrav;
    ED.active=false; if (cancel) toast('Barrier cancelled'); else toast('Barrier finished');
  }
  function clearBarriers(){
    const r=ensureBarrierRoot(); r.getChildren().slice().forEach(ch=>ch.dispose?.()); ST.segments.length=0; toast('Barriers cleared');
  }

  // ----------- Save/Load -----------
  function getConfig(){
    return {
      modelUrl: window.PREFERRED_GHOST_MODEL_URL || null,
      ghostScale: ST.scale,
      devVisible: ST.devVisible,
      barriers: ST.segments.slice()
    };
  }
  function applyConfig(cfg){
    if (!cfg) return;
    if (cfg.modelUrl) loadGhostGLB(cfg.modelUrl);
    if (isFinite(cfg.ghostScale)) applyScale(cfg.ghostScale);
    if (Array.isArray(cfg.barriers)){
      clearBarriers();
      cfg.barriers.forEach(seg=>{
        const p0=v3(seg.start.x,seg.start.y,seg.start.z);
        const p1=v3(seg.end.x,seg.end.y,seg.end.z);
        makeSeg(p0,p1, seg.height||2, seg.thickness||0.18);
        ST.segments.push({start:xyz(p0), end:xyz(p1), height:seg.height||2, thickness:seg.thickness||0.18});
      });
    }
    ST.devVisible=!!cfg.devVisible; setDevVisible(ST.devVisible);
  }
  function exportJSON(){
    const blob=new Blob([JSON.stringify(getConfig(),null,2)],{type:"application/json"});
    const a=el("a",{download:"ghost_config.json"}); a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
  }
  function importJSONFile(f){
    const fr=new FileReader();
    fr.onload=()=>{ try{ applyConfig(JSON.parse(fr.result)); toast('Ghost config loaded'); }catch{ toast('Invalid JSON'); } };
    fr.readAsText(f);
  }

  // ----------- UI -----------
  function buildUI(){
    const s=SCENE(); if(!s) return;
    const panel=ensurePanel(); panel.innerHTML="";
    panel.appendChild(el('div',{className:'row'},[
      el('div',{style:{color:'#9ff',fontWeight:'bold'}},['Ghost Dev (GLB)']),
      el('div',{style:{marginLeft:'auto',opacity:.8}},['Alt+G'])
    ]));

    // GLB picker
    const listSel = sel('gd-list', DEFAULT_LIST.map(n=>[BASE_URL+n, n]));
    const urlIn   = input('text','gd-url', BASE_URL+DEFAULT_LIST[0], {style:{width:'260px'}});
    const loadBtn = btn('Load GLB', ()=>{
      const url=( $('#gd-url').value || $('#gd-list').value ).trim();
      window.PREFERRED_GHOST_MODEL_URL = url; // expose for saving
      loadGhostGLB(url);
    });
    listSel.onchange = ()=>{ urlIn.value = listSel.value; };

    panel.appendChild(el('div',{className:'row'},[ lab('Ghost GLB'), listSel ]));
    panel.appendChild(el('div',{className:'row'},[ lab('URL'), urlIn, loadBtn ]));

    // Controls
    const dist = input('number','gd-dist','2.5',{step:'0.1',style:{width:'84px'}});
    const tp   = btn('Teleport Ahead', ()=> teleportAhead(+$('#gd-dist').value||2.5));
    const scale= input('number','gd-scale', String(ST.scale||1), {step:'0.05',style:{width:'84px'}});
    const setSc= btn('Apply Scale', ()=> applyScale(+$('#gd-scale').value||1));
    const devVis = el('label',{style:{display:'inline-flex',gap:'6px',alignItems:'center'}},[
      el('input',{id:'gd-vis',type:'checkbox',checked:ST.devVisible}),
      el('span',{},['Dev Visible'])
    ]);
    setTimeout(()=> $('#gd-vis').addEventListener('change',(e)=> setDevVisible(e.target.checked)),0);

    panel.appendChild(el('div',{className:'row',style:{marginTop:'4px'}},[
      lab('Ahead'), dist, tp, lab('Scale'), scale, setSc, devVis
    ]));

    // Barrier
    const grid=input('number','gd-grid','0.25',{step:'0.05',style:{width:'84px'}});
    const h   =input('number','gd-h','2.2',{step:'0.05',style:{width:'84px'}});
    const t   =input('number','gd-t','0.18',{step:'0.01',style:{width:'84px'}});
    const bStart=btn('Start Barrier', startBarrier);
    const bFin  =btn('Finish', ()=>finishBarrier(false));
    const bCan  =btn('Cancel', ()=>finishBarrier(true));
    const bClr  =btn('Clear All', clearBarriers);

    panel.appendChild(el('div',{className:'row',style:{marginTop:'6px'}},[
      el('div',{style:{color:'#9ad',fontWeight:'bold'}},['Ghost Barrier'])
    ]));
    panel.appendChild(el('div',{className:'row'},[
      lab('Grid'), grid, lab('H'), h, lab('T'), t, bStart, bFin, bCan, bClr
    ]));
    panel.appendChild(el('div',{style:{color:'#8ff',opacity:.9}},['Click to lay segments along walls. Enter=finish, Esc=cancel.']));

    // Save/Load
    const save=btn('Export JSON', exportJSON);
    const load=btn('Import JSON', ()=>{
      const fi=input('file','__fi','',{accept:'.json',style:{display:'none'}});
      fi.onchange=()=>{ const f=fi.files?.[0]; if(f) importJSONFile(f); };
      document.body.appendChild(fi); fi.click(); setTimeout(()=>fi.remove(),0);
    });
    panel.appendChild(el('div',{className:'row',style:{marginTop:'6px'}},[ save, load ]));
  }

  // ----------- Boot -----------
  function init(){
    if (ST.ready) return;
    if (!SCENE() || !CAMERA()) return;
    ensurePanel(); buildUI();
    ST.ready = true;
    toast('Ghost Dev (GLB) ready');
  }
  const boot = setInterval(()=>{ try{ if (SCENE() && CAMERA()){ clearInterval(boot); init(); } }catch{} }, 200);

  // ----------- Public API -----------
  window.GHOST_DEV = {
    loadGhostGLB, setDevVisible, applyScale, teleportAhead,
    startBarrier, finishBarrier, clearBarriers,
    getConfig, applyConfig
  };

})();
