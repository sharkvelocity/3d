// === Merge Patch: storage (from index3), belt, spawn, exterior rain, and joystick removal ===
window.PP = window.PP || {}; PP.cfg = PP.cfg || {}; PP.state = PP.state || {};
PP.cfg.spawnWS = PP.cfg.spawnWS || new BABYLON.Vector3(47.52, 0.22, -105.28);

// Simple storage API
PP.storage = PP.storage || (function(){
  const KEY_INV='pp_inventory_v1', KEY_FLAGS='pp_flags_v1';
  function get(k,d){ try{return JSON.parse(localStorage.getItem(k)) ?? d;}catch(_){return d;} }
  function set(k,v){ localStorage.setItem(k, JSON.stringify(v)); return v; }
  return {
    saveInventory: inv => set(KEY_INV, inv),
    loadInventory: () => get(KEY_INV, {slots:[], equipped:0}),
    getFlag: (k,d=false)=>{ const f=get(KEY_FLAGS,{}); return (k in f)?f[k]:d; },
    setFlag: (k,v)=>{ const f=get(KEY_FLAGS,{}); f[k]=v; set(KEY_FLAGS,f); }
  };
})();

// Item defs (adjust icons to your actual paths)
const ITEM_DEFS = [
  {id:'emf', name:'EMF Reader', icon:'./assets/icons/emf.png'},
  {id:'spirit', name:'Spirit Box', icon:'./assets/icons/spirit.png'},
  {id:'uv', name:'UV Light', icon:'./assets/icons/uv.png'},
  {id:'cam', name:'Photo Cam', icon:'./assets/icons/camera.png'},
  {id:'salt', name:'Salt', icon:'./assets/icons/salt.png'},
  {id:'lighter', name:'Lighter', icon:'./assets/icons/lighter.png'},
  {id:'notebook', name:'Notebook', icon:'./assets/icons/notebook.png'}
];

// Storage modal logic
(function(){
  const storageEl = document.getElementById('storage');
  const grid = document.getElementById('storeGrid');
  const confirmBtn = document.getElementById('storeConfirm');
  if (!storageEl) return; // if not present in this page
  let selected = new Set(PP.storage.loadInventory().slots);
  function rebuildGrid(){
    grid.innerHTML='';
    ITEM_DEFS.forEach(it=>{
      const cell=document.createElement('div');
      cell.className='it'+(selected.has(it.id)?' sel':'');
      cell.style.cssText='padding:8px;border:1px solid #1a2a3c;border-radius:10px;background:#0e1622;cursor:pointer;text-align:center';
      cell.innerHTML = (it.icon?`<img src="${it.icon}" style="display:block;margin:0 auto 6px;max-width:48px;max-height:48px">`:'')
        + `<div style="font-size:12px">${it.name}</div>`;
      cell.onclick=()=>{
        if (selected.has(it.id)) { selected.delete(it.id); cell.classList.remove('sel'); }
        else { if (selected.size>=3) return; selected.add(it.id); cell.classList.add('sel'); }
      };
      grid.appendChild(cell);
    });
  }
  rebuildGrid();
  confirmBtn.onclick=()=>{
    const slots=[...selected];
    PP.storage.saveInventory({slots, equipped:0});
    buildBelt(slots);
    storageEl.style.display='none';
    try { scatterItems(slots); } catch(_) {}
  };
  // Expose open
  window.openStorage = function(){ rebuildGrid(); storageEl.style.display='flex'; };
})();

// Belt (uses bottom bar from index3)
const itemBar = document.getElementById('itemBar');
function buildBelt(slots){
  if (!itemBar) return;
  itemBar.innerHTML='';
  slots.forEach((id,i)=>{
    const def = ITEM_DEFS.find(d=>d.id===id) || {name:id,icon:''};
    const el=document.createElement('div');
    el.className='slot'+(i===0?' active':'');
    el.style.cssText='width:48px;height:48px;border-radius:10px;border:1px solid #1a2a3c;background:#0e1622;display:grid;place-items:center;cursor:pointer';
    el.innerHTML = def.icon?`<img src="${def.icon}" style="max-width:36px;max-height:36px;opacity:.9">`:`<span style="font-size:10px">${def.name}</span>`;
    el.onclick = ()=> setEquipped(i);
    itemBar.appendChild(el);
  });
}
function setEquipped(i){
  const inv = PP.storage.loadInventory();
  inv.equipped = Math.max(0, Math.min(i, inv.slots.length-1));
  PP.storage.saveInventory(inv);
  [...itemBar.children].forEach((el,idx)=> el.classList.toggle('active', idx===inv.equipped));
}
function cycleSlot(dir){
  const inv = PP.storage.loadInventory();
  if (!inv.slots.length) return;
  inv.equipped = (inv.equipped + (dir>0?1:-1) + inv.slots.length) % inv.slots.length;
  PP.storage.saveInventory(inv);
  [...itemBar.children].forEach((el,idx)=> el.classList.toggle('active', idx===inv.equipped));
}
window.addEventListener('wheel',(e)=>{ if (e.deltaY>0) cycleSlot(+1); else cycleSlot(-1); }, {passive:true});

// Scatter items (placeholder: attach nodes near spawn; replace with your real mesh spawns if needed)
function scatterItems(slots){
  const s = PP.cfg.spawnWS || new BABYLON.Vector3(0,1.8,0);
  (slots||PP.storage.loadInventory().slots).forEach((id,idx)=>{
    const node=new BABYLON.TransformNode('item_'+id, scene);
    node.position = new BABYLON.Vector3(s.x+1.2+0.6*idx, s.y+0.1, s.z-1.5);
  });
}

// Spawn correction (after map load)
function forceSpawn(){
  if (!scene.activeCamera) return;
  scene.activeCamera.position.copyFrom(PP.cfg.spawnWS);
  scene.activeCamera.setTarget(PP.cfg.spawnWS.add(new BABYLON.Vector3(0,1,2)));
}

// Exterior rain (world anchored around MAP_DEF.exterior)
function exteriorRain(){
  const ext=(window.MAP_DEF && Array.isArray(window.MAP_DEF.exterior))?MAP_DEF.exterior:null;
  if(!ext || ext.length<3) return;
  const likelyLocal = Math.max(...ext.map(p=>Math.abs(p.x))) < 100 && Math.max(...ext.map(p=>Math.abs(p.z))) < 100;
  const poly = likelyLocal ? ext.map(p=>localToWorld(p, MAP_DEF)) : ext.map(p=>new BABYLON.Vector3(p.x,0,p.z));
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const v of poly){ minX=Math.min(minX,v.x); maxX=Math.max(maxX,v.x); minZ=Math.min(minZ,v.z); maxZ=Math.max(maxZ,v.z); }
  function inside(px,pz){
    let ok=false; for(let i=0,j=poly.length-1;i<poly.length;j=i){
      const A=poly[i], B=poly[j];
      const hit=((A.z>pz)!=(B.z>pz)) && (px < (B.x-A.x)*(pz-A.z)/((B.z-A.z)||1e-9)+A.x);
      if(hit) ok=!ok;
    } return ok;
  }
  const tpl = new BABYLON.ParticleSystem("rain_template", 2000, scene);
  tpl.particleTexture = new BABYLON.Texture("./assets/textures/rain.png", scene, true, false);
  tpl.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  tpl.isBillboardBased = true; tpl.updateSpeed=0.02;
  tpl.minSize=0.05; tpl.maxSize=0.15; tpl.minEmitPower=4; tpl.maxEmitPower=7;
  tpl.gravity = new BABYLON.Vector3(0,-9.81,0);
  const STEP=6, YTOP=14, EMIT=5, MAXR=60;
  const centers=[];
  for(let x=minX;x<=maxX;x+=STEP){ for(let z=minZ;z<=maxZ;z+=STEP){ if(inside(x,z)) centers.push(new BABYLON.Vector3(x,YTOP,z)); } }
  const emitters=[];
  for(const c of centers){
    const node=new BABYLON.TransformNode("rain_emitter",scene); node.position.copyFrom(c);
    const ps=tpl.clone("rain_ps",node); ps.isLocal=false; ps.emitter=node;
    ps.createBoxEmitter(new BABYLON.Vector3(-EMIT,0,-EMIT),new BABYLON.Vector3(EMIT,0,EMIT),new BABYLON.Vector3(0,-1,0),0,0);
    emitters.push({node,ps});
  }
  scene.onBeforeRenderObservable.add(()=>{
    const p=scene.activeCamera?.position||BABYLON.Vector3.Zero(); const r2=MAXR*MAXR;
    for(const e of emitters){
      const d2=BABYLON.Vector3.DistanceSquared(p,e.node.position);
      const on=d2<r2; if(on && !e.ps.isStarted()) e.ps.start(); else if(!on && e.ps.isStarted()) e.ps.stop();
    }
  });
}

// Helper from earlier
function toRad(d){ return d*Math.PI/180; }
function localToWorld(p, def){
  const s=(def?.scale ?? 1), yaw=toRad(def?.rotationY ?? 0);
  const cos=Math.cos(yaw), sin=Math.sin(yaw);
  const x=(p?.x??0)*s, y=(p?.y??0)*s, z=(p?.z??0)*s;
  const xr=x*cos - z*sin, zr=x*sin + z*cos;
  return new BABYLON.Vector3((def?.offset?.x??0)+xr, (def?.offset?.y??0)+y, (def?.offset?.z??0)+zr);
}

// Try to hook into your map-load complete
(function attachAfterLoad(){
  const s = window.scene || (BABYLON.Engine && BABYLON.Engine.LastCreatedScene);
  if (!s) return;
  setTimeout(()=>{ try{
    forceSpawn(); exteriorRain();
    const inv = PP.storage.loadInventory();
    if (!inv.slots.length) { if (window.openStorage) openStorage(); } else { buildBelt(inv.slots); scatterItems(inv.slots); }
  }catch(e){ console.warn('Merge patch post-load error', e); }}, 1500);
})();
