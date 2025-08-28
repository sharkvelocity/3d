// ./assets/index3/devtools.js — FULL TOOLBOX v2
// Adds: Door Hinge Editor, Switch Linker, Minimap Teleporter, Goryo DOTS camera-only visualizer
// Drop-in replacement. No HTML changes required.
(function(){
  const LS_KEY = "pp_devtools_rooms";
  const PANEL = { el:null, tabs:null, body:null };
  const STATE = {
    ready:false,
    gizmo:null,
    pickMode:false,
    clickTeleport:false,
    recordRoom:false,
    currentRoomPoints:[],
    currentRoomName:"New Room",
    roomOverlays:{ points:[], line:null },
    selection:null,
    lights:[],
    showBBoxes:false,
    axes:null,
    fpsSpan:null,
    autosave:true,
    // v2 additions
    hinge:{ pivot:null, open:false, baseRot:null, angleDeg:90 },
    minimap:{ el:null, ctx:null, open:false, bounds:null },
    goryo:{ enabled:true, dots:null, ticker:0 }
  };

  // ---------- Utility ----------
  function $(sel, root=document){ return root.querySelector(sel); }
  function el(tag, attrs={}, kids=[]){ const n=document.createElement(tag); for(const k in attrs){ if(k==="style") Object.assign(n.style, attrs[k]); else if(attrs[k]!==undefined) n.setAttribute(k, attrs[k]); } kids.forEach(k=>n.appendChild(typeof k==="string"?document.createTextNode(k):k)); return n; }
  function toJSON(obj){ return JSON.stringify(obj,null,2); }
  function fromJSON(txt){ try{ return JSON.parse(txt); }catch{ alert("Invalid JSON"); return null; } }
  function toast(msg, ms=1200){ if (window.toast) window.toast(msg,ms); }
  function ensureScene(){ return (typeof scene!=="undefined" && scene && typeof BABYLON!=="undefined"); }
  function pickGroundPoint(){ const ray=scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera); const hit=scene.pickWithRay(ray, m=>m && m.isPickable); if(hit.hit&&hit.pickedPoint) return hit.pickedPoint.clone(); const r=ray; const t=-r.origin.y/r.direction.y; return r.origin.add(r.direction.scale(t)); }
  function drawPoint(pos,name="__dev_point"){ const s=BABYLON.MeshBuilder.CreateSphere(name,{diameter:0.2,segments:8},scene); s.position.copyFrom(pos); s.isPickable=false; const m=new BABYLON.StandardMaterial(name+"_mat",scene); m.emissiveColor=new BABYLON.Color3(0,1,1); s.material=m; s.renderingGroupId=2; return s; }
  function drawPolyline(points){ if(STATE.roomOverlays.line) STATE.roomOverlays.line.dispose(); if(points.length<2){ STATE.roomOverlays.line=null; return; } const v=points.map(p=>new BABYLON.Vector3(p.x,p.y,p.z)); STATE.roomOverlays.line=BABYLON.MeshBuilder.CreateLines("__dev_poly",{ points:v.concat(v[0]) },scene); STATE.roomOverlays.line.color=new BABYLON.Color3(0,1,1); STATE.roomOverlays.line.isPickable=false; STATE.roomOverlays.line.renderingGroupId=2; }
  function clearRoomOverlay(){ STATE.roomOverlays.points.forEach(s=>s.dispose()); STATE.roomOverlays.points=[]; if(STATE.roomOverlays.line){ STATE.roomOverlays.line.dispose(); STATE.roomOverlays.line=null; } }
  function toXZ(poly3){ return poly3.map(p=>({x:+p.x,z:+p.z})); }

  // ---------- Rooms ----------
  function rooms(){ if(!window.ROOMS) window.ROOMS=[]; return window.ROOMS; }
  function loadRoomsFromLS(){ if(!STATE.autosave) return; const raw=localStorage.getItem(LS_KEY); if(!raw) return; const data=fromJSON(raw); if(!data) return; if(Array.isArray(data)){ window.ROOMS=data; toast("Rooms loaded from autosave",900); refreshRoomsTable(); } }
  function saveRoomsToLS(){ if(!STATE.autosave) return; try{ localStorage.setItem(LS_KEY,toJSON(rooms())); }catch{} }
  function startRoomRecord(){ STATE.recordRoom=true; STATE.currentRoomPoints=[]; clearRoomOverlay(); toast("Room record: click ground to add points. 'Complete' when done.",1800); }
  function addRoomPoint(p){ STATE.currentRoomPoints.push({x:p.x,y:p.y,z:p.z}); const s=drawPoint(p,"__dev_pt_"+STATE.currentRoomPoints.length); STATE.roomOverlays.points.push(s); drawPolyline(STATE.currentRoomPoints); }
  function undoRoomPoint(){ const last=STATE.roomOverlays.points.pop(); if(last) last.dispose(); STATE.currentRoomPoints.pop(); drawPolyline(STATE.currentRoomPoints); }
  function completeRoom(){ if(STATE.currentRoomPoints.length<3){ toast("Need at least 3 points",1000); return; } const name=$('#dev-room-name').value.trim()||"Room"; const rec={ name, poly:toXZ(STATE.currentRoomPoints), type:"interior" }; rooms().push(rec); saveRoomsToLS(); refreshRoomsTable(); STATE.recordRoom=false; clearRoomOverlay(); STATE.currentRoomPoints=[]; toast(`Saved room: ${name}`,1000); }
  function replaceRoomAt(idx){ if(idx<0||idx>=rooms().length){ toast("Invalid room index",900); return; } if(STATE.currentRoomPoints.length<3){ toast("Record a polygon first",1000); return; } const r=rooms()[idx]; r.poly=toXZ(STATE.currentRoomPoints); r.name=$('#dev-room-name').value.trim()||r.name||"Room"; saveRoomsToLS(); refreshRoomsTable(); STATE.recordRoom=false; clearRoomOverlay(); STATE.currentRoomPoints=[]; toast("Replaced room polygon.",900); }
  function exportRooms(){ const blob=new Blob([toJSON(rooms())],{type:"application/json"}); const a=el('a',{download:'rooms.json'}); a.href=URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href); }
  function importRooms(text){ const data=fromJSON(text); if(!data||!Array.isArray(data)) return; window.ROOMS=data; saveRoomsToLS(); refreshRoomsTable(); toast("Imported rooms.",1000); }
  function deleteRoom(idx){ rooms().splice(idx,1); saveRoomsToLS(); refreshRoomsTable(); }

  // ---------- Mesh Inspector ----------
  function applyGizmo(target){ if(!STATE.gizmo){ const gm=new BABYLON.GizmoManager(scene); gm.usePointerToAttachGizmos=false; gm.positionGizmoEnabled=true; gm.rotationGizmoEnabled=false; gm.scaleGizmoEnabled=false; gm.gizmos.positionGizmo.updateGizmoPositionToMatchAttachedMesh=true; STATE.gizmo=gm; } STATE.gizmo.attachToMesh(target); }
  function setGizmoMode(mode){ if(!STATE.gizmo) return; STATE.gizmo.positionGizmoEnabled=(mode==="move"); STATE.gizmo.rotationGizmoEnabled=(mode==="rotate"); STATE.gizmo.scaleGizmoEnabled=(mode==="scale"); }
  function pickUnderCursor(){ const ray=scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera); const hit=scene.pickWithRay(ray, m=>m&&m.isPickable); if(hit&&hit.pickedMesh){ selectMesh(hit.pickedMesh); } }
  function selectMesh(mesh){ STATE.selection=mesh; $('#dev-mesh-name').textContent=mesh.name||"(unnamed)"; const p=mesh.position, r=mesh.rotation||new BABYLON.Vector3(0,0,0), s=mesh.scaling||new BABYLON.Vector3(1,1,1); $('#posx').value=p.x.toFixed(3); $('#posy').value=p.y.toFixed(3); $('#posz').value=p.z.toFixed(3); $('#rotx').value=r.x.toFixed(3); $('#roty').value=r.y.toFixed(3); $('#rotz').value=r.z.toFixed(3); $('#scx').value=s.x.toFixed(3); $('#scy').value=s.y.toFixed(3); $('#scz').value=s.z.toFixed(3); $('#mesh-coll').checked=!!mesh.checkCollisions; $('#mesh-pick').checked=!!mesh.isPickable; $('#mesh-vis').checked=mesh.isVisible!==false && mesh.visibility!==0; applyGizmo(mesh); updateHingeFromMesh(mesh); }

  function applyTransform(){ const m=STATE.selection; if(!m) return; const num=id=> parseFloat($(id).value)||0; m.position.x=num('#posx'); m.position.y=num('#posy'); m.position.z=num('#posz'); m.rotation=new BABYLON.Vector3(num('#rotx'), num('#roty'), num('#rotz')); m.scaling=new BABYLON.Vector3(parseFloat($('#scx').value)||1, parseFloat($('#scy').value)||1, parseFloat($('#scz').value)||1); }
  function applyFlags(){ const m=STATE.selection; if(!m) return; m.checkCollisions=$('#mesh-coll').checked; m.isPickable=$('#mesh-pick').checked; const vis=$('#mesh-vis').checked; m.isVisible=vis; m.visibility=vis?1:0; }

  // ---------- Light Painter ----------
  function addLight(type){ const pos=camera.position.add(camera.getForwardRay().direction.scale(2)); let L; type=type||$('#light-type').value; if(type==="point"){ L=new BABYLON.PointLight("devPointLight",pos,scene); L.intensity=0.9; L.range=12; L.diffuse=new BABYLON.Color3(1.0,0.96,0.86); } else { L=new BABYLON.SpotLight("devSpotLight",pos,camera.getForwardRay().direction.clone(),Math.PI/3,12,scene); L.intensity=1.2; L.range=22; L.diffuse=new BABYLON.Color3(1.0,0.96,0.86); } L.groundColor=new BABYLON.Color3(0,0,0); L._dev={ shadowGen:null }; STATE.lights.push(L); refreshLightsList(); selectLight(L); }
  function selectLight(L){ $('#light-int').value=(L.intensity||1).toString(); $('#light-range').value=(L.range||12).toString(); $('#light-angle').value=(L.angle ? (L.angle*180/Math.PI).toFixed(1) : 60); $('#light-shadow').checked=!!(L._dev && L._dev.shadowGen); $('#light-attach').onclick=()=>{ if(STATE.selection){ L.parent=STATE.selection; toast("Attached to selected mesh.",900); } }; $('#light-del').onclick=()=>{ const i=STATE.lights.indexOf(L); if(i>=0) STATE.lights.splice(i,1); if(L._dev.shadowGen) L._dev.shadowGen.dispose(); L.dispose(); refreshLightsList(); }; $('#light-shadow').onchange=(e)=>{ if(e.target.checked){ try{ L._dev.shadowGen=new BABYLON.ShadowGenerator(1024,L); toast("Shadows enabled.",900);}catch{} } else { if(L._dev.shadowGen){ L._dev.shadowGen.dispose(); L._dev.shadowGen=null; } } }; $('#light-int').oninput=e=>{ L.intensity=parseFloat(e.target.value)||1; }; $('#light-range').oninput=e=>{ L.range=parseFloat(e.target.value)||12; }; $('#light-angle').oninput=e=>{ if(L.getClassName()==="SpotLight") L.angle=Math.max(0.05,(parseFloat(e.target.value)||60)*Math.PI/180); }; }
  function refreshLightsList(){ const ul=$('#light-list'); ul.innerHTML=''; STATE.lights.forEach((L,i)=>{ const li=el('li',{},[ `${i}: ${L.name} (${L.getClassName()}) ` ]); const btn=el('button',{class:'hud-btn',style:{marginLeft:'6px'}},["Select"]); btn.onclick=()=> selectLight(L); ul.appendChild(li); ul.appendChild(btn); }); }

  // ---------- Ghost Tuner ----------
  function allGhostKeys(){ return Object.keys(window.GHOSTS||{}); }
  function setupGhostUI(){ const sel=$('#ghost-type'); sel.innerHTML=''; allGhostKeys().forEach(k=> sel.appendChild(el('option',{},[k]))); if(window.currentGhostKey){ sel.value=window.currentGhostKey; } sel.onchange=()=>{ window.currentGhostKey=sel.value; toast("Ghost type set: "+sel.value,900); };
    $('#ghost-visible').onchange=e=>{ if(window.setGhostVisible) setGhostVisible(e.target.checked); };
    $('#ghost-speed').oninput=e=>{ if(window.ghost) ghost.speed=parseFloat(e.target.value)||1.4; };
    $('#ghost-step').oninput =e=>{ if(window.ghost) ghost.stepInterval=parseFloat(e.target.value)||0.55; };
    $('#ghost-hunt-start').onclick=()=> window.beginHunt && beginHunt();
    $('#ghost-hunt-end').onclick  =()=> window.endHunt && endHunt();
    $('#ghost-to-me').onclick     =()=>{ if(!ghost?.mesh) return; const p=camera.position.add(camera.getForwardRay().direction.scale(2)); p.y=(window.pickGroundHeightAt?pickGroundHeightAt(p.x,p.z):p.y); ghost.mesh.position.copyFrom(p); toast("Ghost teleported.",900); };
    $('#ghost-flicker').onclick   =()=> window.flickerStart && flickerStart();
    $('#ghost-radio').onclick     =()=>{ try{ window.audio?.spiritbox?.play(); }catch{} };
  }

  // ---------- Player ----------
  function updatePlayerInfo(){ const p=camera.position; $('#pos-readout').textContent=`x:${p.x.toFixed(2)} y:${p.y.toFixed(2)} z:${p.z.toFixed(2)}`; }
  function applyPlayerXYZ(){ const vx=parseFloat($('#px').value)||0, vy=parseFloat($('#py').value)||1.7, vz=parseFloat($('#pz').value)||0; camera.position.set(vx,vy,vz); toast("Teleported.",800); }

  // ---------- Diagnostics ----------
  function toggleBBoxes(on){ STATE.showBBoxes=on; scene.meshes.forEach(m=> m.showBoundingBox=!!on); }
  function ensureAxes(){ if(!STATE.axes){ STATE.axes=new BABYLON.AxesViewer(scene,1.5); } STATE.axes.xAxis.parent=null; }
  function toggleInspector(open){ try{ if(open) scene.debugLayer.show({embedMode:true}); else scene.debugLayer.hide(); const dbg=document.querySelector("canvas+div, .inspector"); if(dbg) dbg.style.zIndex=999999; }catch{} }

  // ================= v2 FEATURES =================
  // ---- Door Hinge Editor ----
  function updateHingeFromMesh(mesh){ if(!mesh) return; const md=mesh.metadata||{}; STATE.hinge.baseRot = (md.baseRot!==undefined)? md.baseRot : mesh.rotation.y; STATE.hinge.open = !!md.open; $('#hinge-angle').value = (md.hingeDeg!==undefined? md.hingeDeg : STATE.hinge.angleDeg); $('#hinge-open').checked = STATE.hinge.open; $('#hinge-base').textContent = STATE.hinge.baseRot.toFixed(3); }
  function hingeApply(){ const m=STATE.selection; if(!m) return; const deg=parseFloat($('#hinge-angle').value)||90; STATE.hinge.angleDeg=deg; const base=STATE.hinge.baseRot ?? m.rotation.y; const open=$('#hinge-open').checked; const rad = (open? deg : 0) * Math.PI/180; m.rotation = new BABYLON.Vector3(m.rotation.x, base + rad, m.rotation.z); m.checkCollisions = !open; m.metadata = Object.assign({}, m.metadata, { baseRot: base, open, hingeDeg: deg }); toast("Hinge applied.",900); }
  function hingeToggle(){ const m=STATE.selection; if(!m) return; const open = !(m.metadata?.open); $('#hinge-open').checked=open; hingeApply(); }

  // ---- Switch Linker (mesh -> nearest house light) ----
  window._switchMap = window._switchMap || new Map();
  function nearestHouseLight(pos){ let best=null, bd=1e9; (window.houseLights||[]).forEach(h=>{ const d=BABYLON.Vector3.Distance(h.light.position||h.light._position||pos, pos); if(d<bd){ bd=d; best=h; } }); return best; }
  function linkSwitch(){ const sw=STATE.selection; if(!sw){ toast("Pick a switch mesh first",1000); return; } const target = nearestHouseLight(sw.getAbsolutePosition()); if(!target){ toast("No house lights found",1000); return; } _switchMap.set(sw, target.light); sw.isPickable=true; if(!sw.actionManager) sw.actionManager = new BABYLON.ActionManager(scene); sw.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, ()=> toggleLinked(sw))); toast("Linked to nearest light.",900); }
  function toggleLinked(sw){ const L=_switchMap.get(sw); if(!L) return; L.intensity = (L.intensity>0.05) ? 0 : 0.8; if(sw.material?.emissiveColor) sw.material.emissiveColor = (L.intensity>0)? new BABYLON.Color3(1,1,0.8): new BABYLON.Color3(0,0,0); }

  // ---- Minimap Teleporter ----
  function ensureMinimap(){ if(STATE.minimap.el) return; const c=el('canvas',{width:260,height:220}); Object.assign(c.style,{position:'fixed',left:'12px',bottom:'112px',zIndex:9998,border:'1px solid #033',borderRadius:'8px',background:'#000',display:'none',opacity:'0.85'}); document.body.appendChild(c); STATE.minimap.el=c; STATE.minimap.ctx=c.getContext('2d'); c.addEventListener('click',e=>{ if(!STATE.minimap.bounds) return; const r=c.getBoundingClientRect(); const u=(e.clientX-r.left)/c.width, v=(e.clientY-r.top)/c.height; const x = STATE.minimap.bounds.minX + u*(STATE.minimap.bounds.maxX-STATE.minimap.bounds.minX); const z = STATE.minimap.bounds.minZ + v*(STATE.minimap.bounds.maxZ-STATE.minimap.bounds.minZ); const y = (window.pickGroundHeightAt? pickGroundHeightAt(x,z) : camera.position.y); camera.position.set(x, y+1.7, z); toast("Minimap teleported.",800); }); }
  function toggleMinimap(){ ensureMinimap(); STATE.minimap.open=!STATE.minimap.open; STATE.minimap.el.style.display = STATE.minimap.open? 'block':'none'; if(STATE.minimap.open) drawMinimap(); }
  function computeBounds(){ const pts = (window.ghostPolygon||[]).map(v=>({x:v.x,z:v.z})); if(!pts.length && window.ROOMS){ window.ROOMS.forEach(r=> r.poly.forEach(p=> pts.push(p))); }
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity; pts.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); }); if(!isFinite(minX)) { minX= -50; maxX= 100; minZ=-160; maxZ=-90; }
    STATE.minimap.bounds={ minX,maxX,minZ,maxZ }; }
  function drawMinimap(){ computeBounds(); const c=STATE.minimap.el, ctx=STATE.minimap.ctx, b=STATE.minimap.bounds; ctx.clearRect(0,0,c.width,c.height); ctx.strokeStyle='#0ff'; ctx.lineWidth=1;
    // draw ghost polygon
    const gp = window.ghostPolygon||[]; if(gp.length){ ctx.beginPath(); gp.forEach((v,i)=>{ const p=mapToCanvas(v.x,v.z,c,b); if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); const p0=mapToCanvas(gp[0].x,gp[0].z,c,b); ctx.lineTo(p0.x,p0.y); ctx.stroke(); }
    // draw rooms
    if(window.ROOMS){ ctx.strokeStyle='#088'; window.ROOMS.forEach(r=>{ if(!r.poly?.length) return; ctx.beginPath(); r.poly.forEach((v,i)=>{ const p=mapToCanvas(v.x,v.z,c,b); if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); const p0=mapToCanvas(r.poly[0].x,r.poly[0].z,c,b); ctx.lineTo(p0.x,p0.y); ctx.stroke(); }); }
    // draw player
    const pp = mapToCanvas(camera.position.x, camera.position.z, c, b); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(pp.x, pp.y, 3, 0, Math.PI*2); ctx.fill();
    function mapToCanvas(x,z,c,b){ const u=(x-b.minX)/(b.maxX-b.minX); const v=(z-b.minZ)/(b.maxZ-b.minZ); return { x:u*c.width, y:v*c.height }; }
  }

  // ---- Goryo DOTS camera-only visualizer ----
  function ensureDots(){ if(STATE.goryo.dots) return; const plane=BABYLON.MeshBuilder.CreatePlane("goryo_dots",{width:6,height:4,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene); plane.position = camera.position.add(camera.getForwardRay().direction.scale(4)); plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y; plane.isPickable=false; const mat=new BABYLON.StandardMaterial("goryo_dots_mat",scene); mat.disableLighting=true; mat.emissiveColor=new BABYLON.Color3(0.2,1,0.2); const dyn=new BABYLON.DynamicTexture("goryo_dots_tex",{width:256,height:256},scene,false); mat.emissiveTexture=dyn; plane.material=mat; STATE.goryo.dots={ mesh:plane, tex:dyn };
    scene.onBeforeRenderObservable.add(()=>{ if(!STATE.goryo.enabled) { plane.isVisible=false; return; } const isGoryo=(window.currentGhostKey||"").toLowerCase()==='goryo'; const camOn = document.getElementById('camera-overlay')?.style.display==='block'; plane.isVisible = isGoryo && camOn; if(!plane.isVisible) return; plane.position = camera.position.add(camera.getForwardRay().direction.scale(4)); // wobble + flicker
      const ctx=dyn.getContext(); ctx.clearRect(0,0,256,256); const t=performance.now()*0.001; for(let i=0;i<80;i++){ const x=((Math.sin(t*1.7+i*7)+1)*0.5*256)|0; const y=((Math.cos(t*1.3+i*11)+1)*0.5*256)|0; const a=(Math.sin(t*10+i*3)*0.5+0.5)*0.9; ctx.fillStyle=`rgba(180,255,180,${a.toFixed(2)})`; ctx.fillRect(x,y,2,2); } dyn.update(false); }); }

  // ---------- Panel UI ----------
  function buildPanel(){ const root=$('#devtools-panel'); if(!root) return; root.innerHTML=""; const hdr=el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}},[ el('div',{style:{color:'#9ff',fontWeight:'bold'}},["Developer Tools (v2)"]), (STATE.fpsSpan=el('div',{style:{color:'#8ff',fontSize:'12px'}},["FPS: --"])) ]); const tabs=el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}},[]); const body=el('div',{style:{border:'1px solid #033',padding:'8px',borderRadius:'8px',background:'#0a0a0a'}},[]); root.appendChild(hdr); root.appendChild(tabs); root.appendChild(body); PANEL.el=root; PANEL.tabs=tabs; PANEL.body=body;
    const sections={ Rooms:buildRoomsUI, Mesh:buildMeshUI, Lights:buildLightsUI, Ghost:buildGhostUI, Player:buildPlayerUI, Diagnostics:buildDiagUI, Export:buildExportUI, Doors:buildDoorsUI, Switches:buildSwitchUI, Minimap:buildMinimapUI, DOTS:buildDotsUI };
    Object.keys(sections).forEach((name,i)=>{ const b=el('button',{class:'hud-btn'},[name]); b.onclick=()=>{ PANEL.body.innerHTML=""; sections[name](); }; tabs.appendChild(b); if(i===0) b.click(); }); }

  // --- Section builders ---
  function buildRoomsUI(){ const nameRow=el('div',{class:'row'},[ el('label',{style:{marginRight:'6px',color:'#9ff'}},["Name:"]), el('input',{id:'dev-room-name',value:STATE.currentRoomName,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px',width:'180px'}},[]) ]); const btns=el('div',{class:'row'},[ btn("Start Record",()=>startRoomRecord()), btn("Undo",()=>undoRoomPoint()), btn("Complete",()=>completeRoom()), btn("Clear",()=>{ STATE.recordRoom=false; clearRoomOverlay(); STATE.currentRoomPoints=[]; }) ]); const tblWrap=el('div',{style:{marginTop:'8px'}},[ el('div',{style:{color:'#8ff',marginBottom:'4px'}},["Rooms:"]), el('div',{id:'rooms-table'}) ]); PANEL.body.appendChild(nameRow); PANEL.body.appendChild(btns); PANEL.body.appendChild(tblWrap); refreshRoomsTable(); }
  function refreshRoomsTable(){ const host=$('#rooms-table'); if(!host) return; host.innerHTML=""; const list=rooms(); if (!Array.isArray(list) || !list.length){ host.textContent = "No rooms defined."; return; } list.forEach((r,i)=>{ const row=el('div',{style:{display:'flex',gap:'8px',alignItems:'center',margin:'4px 0'}},[ el('div',{style:{flex:'1',color:'#0ff'}},[`${i}. ${r.name} (${r.type||'interior'})`]), btn("Show",()=>{ clearRoomOverlay(); const p3=r.poly.map(p=> new BABYLON.Vector3(p.x, pickY(p.x,p.z), p.z)); p3.forEach(p=> STATE.roomOverlays.points.push(drawPoint(p))); drawPolyline(p3); }), btn("Replace",()=>replaceRoomAt(i)), btn("Delete",()=>deleteRoom(i)) ]); host.appendChild(row); }); function pickY(x,z){ return (window.pickGroundHeightAt ? pickGroundHeightAt(x,z) : 0.1); } }

  function buildMeshUI(){ const name=el('div',{style:{color:'#0ff',marginBottom:'6px'}},["Selected: ", el('span',{id:'dev-mesh-name',style:{color:'#9ff'}},["(none)"]) ]); const pickBtns=el('div',{class:'row'},[ btn("Pick (click)",()=>{ STATE.pickMode=!STATE.pickMode; toast(STATE.pickMode?"Click to pick":"Pick off",800); }), btn("Pick Now",pickUnderCursor), btn("Move",()=>setGizmoMode("move")), btn("Rotate",()=>setGizmoMode("rotate")), btn("Scale",()=>setGizmoMode("scale")), btn("Detach Gizmo",()=> STATE.gizmo && STATE.gizmo.attachToMesh(null)) ]);
    const xyz=grid([ ["X","posx"],["Y","posy"],["Z","posz"], ["RX","rotx"],["RY","roty"],["RZ","rotz"], ["SX","scx"],["SY","scy"],["SZ","scz"] ]);
    const flagRow=el('div',{class:'row',style:{gap:'12px',marginTop:'6px'}},[ check("Collisions","mesh-coll",applyFlags), check("Pickable","mesh-pick",applyFlags), check("Visible","mesh-vis",applyFlags), btn("Apply Transform",applyTransform) ]);
    PANEL.body.appendChild(name); PANEL.body.appendChild(pickBtns); PANEL.body.appendChild(xyz); PANEL.body.appendChild(flagRow); }

  function buildLightsUI(){ const row1=el('div',{class:'row',style:{gap:'8px'}},[ el('label',{},["Type: "]), sel("light-type",[["point","Point"],["spot","Spot"]]), btn("Add Light",()=>addLight()) ]); const row2=el('div',{class:'row',style:{gap:'8px',marginTop:'6px'}},[ lab("Intensity"), input('number','light-int','1',{step:'0.05'}), lab("Range"), input('number','light-range','12',{step:'0.5'}), lab("Angle"), input('number','light-angle','60',{step:'1',title:'Spot only (deg)'}), check("Shadows","light-shadow"), btn("Attach to Mesh",()=>{}).id='light-attach', btn("Delete",()=>{}).id='light-del' ]); const list=el('div',{style:{marginTop:'8px'}},[ el('div',{style:{color:'#8ff'}},["Lights:"]), el('ul',{id:'light-list',style:{listStyle:'none',padding:'0'}},[]) ]); PANEL.body.appendChild(row1); PANEL.body.appendChild(row2); PANEL.body.appendChild(list); refreshLightsList(); }

  function buildGhostUI(){ const row1=el('div',{class:'row',style:{gap:'8px'}},[ lab("Type"), sel("ghost-type",[]), check("Visible","ghost-visible", null, ghost?.visible||false), btn("Start Hunt",()=>{}).id="ghost-hunt-start", btn("End Hunt",()=>{}).id="ghost-hunt-end" ]); const row2=el('div',{class:'row',style:{gap:'8px',marginTop:'6px'}},[ lab("Speed"), input('range','ghost-speed','1.4',{min:'0.3',max:'3.5',step:'0.05',style:{width:'200px'}}), lab("Step"), input('range','ghost-step','0.55',{min:'0.2',max:'1.2',step:'0.01',style:{width:'200px'}}), btn("To Camera",()=>{}).id="ghost-to-me", btn("Flicker",()=>{}).id="ghost-flicker", btn("Radio",()=>{}).id="ghost-radio" ]); PANEL.body.appendChild(row1); PANEL.body.appendChild(row2); setupGhostUI(); }

  function buildPlayerUI(){ const readout=el('div',{id:'pos-readout',style:{color:'#9ff',marginBottom:'6px'}},["x:-- y:-- z:--"]); const row1=el('div',{class:'row',style:{gap:'8px'}},[ check("NoClip","player-noclip", e=>{ camera.checkCollisions=!e.target.checked; }), check("Fly","player-fly", e=>{ window.allowFly=e.target.checked; }), btn("Click Teleport",()=>{ STATE.clickTeleport=!STATE.clickTeleport; toast(STATE.clickTeleport?'Click-TP on':'Click-TP off',900); }) ]); const row2=el('div',{class:'row',style:{gap:'8px',marginTop:'6px'}},[ lab("X"), input('number','px','0',{step:'0.1'}), lab("Y"), input('number','py','1.7',{step:'0.1'}), lab("Z"), input('number','pz','0',{step:'0.1'}), btn("Teleport",applyPlayerXYZ) ]); PANEL.body.appendChild(readout); PANEL.body.appendChild(row1); PANEL.body.appendChild(row2); }

  function buildDiagUI(){ const row1=el('div',{class:'row',style:{gap:'8px'}},[ check("Bounding Boxes","diag-bb", e=> toggleBBoxes(e.target.checked)), check("Axes","diag-axes", e=>{ if(e.target.checked) ensureAxes(); else if(STATE.axes){ STATE.axes.dispose(); STATE.axes=null; } }), check("Inspector","diag-inspector", e=> toggleInspector(e.target.checked)), btn("Power On/Off", ()=> window.setHousePower && setHousePower(!window.housePower)), btn("Minimap", toggleMinimap) ]); PANEL.body.appendChild(row1); }

  function buildExportUI(){ const auto=el('div',{style:{marginBottom:'6px'}},[ check("Autosave rooms to LocalStorage","autosave", e=>{ STATE.autosave=e.target.checked; if(e.target.checked) saveRoomsToLS(); }, STATE.autosave) ]); const row=el('div',{class:'row',style:{gap:'8px'}},[ btn("Export Rooms (download)", exportRooms), btn("Copy JSON", ()=>{ navigator.clipboard.writeText(toJSON(rooms())); toast("Copied.",900); }) ]); const ta=el('textarea',{id:'imp-json',style:{width:'100%',height:'160px',background:'#000',color:'#0ff',border:'1px solid #033',borderRadius:'6px',marginTop:'8px'}},[]); const impRow=el('div',{class:'row',style:{gap:'8px',marginTop:'6px'}},[ btn("Import JSON", ()=> importRooms($('#imp-json').value)), btn("Clear Autosave", ()=>{ localStorage.removeItem(LS_KEY); toast("Cleared autosave.",900); }) ]); PANEL.body.appendChild(auto); PANEL.body.appendChild(row); PANEL.body.appendChild(ta); PANEL.body.appendChild(impRow); }

  // --- v2 add-ons UI ---
  function buildDoorsUI(){ const head=el('div',{style:{color:'#9ff',marginBottom:'6px'}},["Door Hinge Editor (select a door mesh)"]); const gridX=el('div',{class:'row',style:{gap:'8px'}},[ lab("BaseY"), el('span',{id:'hinge-base',style:{color:'#0ff'}},["--"]), lab("Angle"), input('number','hinge-angle','90',{step:'1'}), check("Open","hinge-open") ]); const row=el('div',{class:'row',style:{gap:'8px',marginTop:'6px'}},[ btn("Apply", hingeApply), btn("Toggle", hingeToggle) ]); PANEL.body.appendChild(head); PANEL.body.appendChild(gridX); PANEL.body.appendChild(row); updateHingeFromMesh(STATE.selection); }
  function buildSwitchUI(){ const head=el('div',{style:{color:'#9ff',marginBottom:'6px'}},["Lamp Switch Linker (pick a switch mesh, then link)"]); const row=el('div',{class:'row',style:{gap:'8px'}},[ btn("Link to nearest light", linkSwitch), btn("Test Toggle", ()=>{ if(STATE.selection) toggleLinked(STATE.selection); }) ]); const hint=el('div',{style:{color:'#8ff',fontSize:'12px',marginTop:'6px'}},["Tip: a click action is attached to the switch to toggle intensity 0 ↔ 0.8."]); PANEL.body.appendChild(head); PANEL.body.appendChild(row); PANEL.body.appendChild(hint); }
  function buildMinimapUI(){ ensureMinimap(); const row=el('div',{class:'row',style:{gap:'8px'}},[ btn(STATE.minimap.open?"Hide":"Show", ()=>{ toggleMinimap(); PANEL.body.innerHTML=''; buildMinimapUI(); }), btn("Refresh", drawMinimap) ]); const hint=el('div',{style:{color:'#8ff',fontSize:'12px',marginTop:'6px'}},["Click map to teleport. Uses ghost polygon/rooms to draw outline."]); PANEL.body.appendChild(row); PANEL.body.appendChild(hint); }
  function buildDotsUI(){ const head=el('div',{style:{color:'#9ff',marginBottom:'6px'}},["Goryo DOTS (camera-only)"]); const row=el('div',{class:'row',style:{gap:'8px'}},[ check("Enable","dots-on", e=>{ STATE.goryo.enabled=e.target.checked; if(STATE.goryo.enabled) ensureDots(); }, STATE.goryo.enabled), btn("Spawn/Ensure", ()=> ensureDots()) ]); const hint=el('div',{style:{color:'#8ff',fontSize:'12px',marginTop:'6px'}},["Visible only when: Ghost=Goryo AND Camera overlay is active."]); PANEL.body.appendChild(head); PANEL.body.appendChild(row); PANEL.body.appendChild(hint); }

  // ---------- DOM helpers ----------
  function lab(t){ return el('span',{style:{color:'#9ff',minWidth:'56px',display:'inline-block'}},[t]); }
  function input(type,id,val,attrs={}){ const i=el('input',Object.assign({id,type,value:val,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px',width:'80px'}},attrs),[]); return i; }
  function sel(id,opts){ const s=el('select',{id,style:{padding:'4px',background:'#000',color:'#0ff',border:'1px solid #066',borderRadius:'4px'}},[]); (opts||[]).forEach(([v,t])=> s.appendChild(el('option',{value:v},[t]))); return s; }
  function check(label,id, onChange, checked=false){ const w=el('label',{style:{display:'inline-flex',gap:'6px',alignItems:'center',cursor:'pointer'}},[ el('input',{id,type:'checkbox',checked:checked?'checked':undefined}), el('span',{style:{color:'#cff'}},[label]) ]); if(onChange) setTimeout(()=> $(('#'+id)).addEventListener('change', onChange),0); return w; }
  function btn(text,onclick){ const b=el('button',{class:'hud-btn'},[text]); if(onclick) b.onclick=onclick; return b; }
  function grid(fields){ const g=el('div',{style:{display:'grid',gridTemplateColumns:'36px 1fr 36px 1fr 36px 1fr',gap:'6px',alignItems:'center'}},[]); fields.forEach(([label,id])=>{ g.appendChild(lab(label)); g.appendChild(input('number','#'+id.replace('#',''),"0",{step:'0.01'})); }); return g; }

  // ---------- Event plumbing ----------
  function pointerObserver(){ scene.onPointerObservable.add((pi)=>{ if(pi.type===BABYLON.PointerEventTypes.POINTERDOWN){ if(STATE.pickMode){ pickUnderCursor(); } if(STATE.clickTeleport){ const p=pickGroundPoint(); camera.position.copyFrom(p.add(new BABYLON.Vector3(0,1.7,0))); toast("Teleported.",700); } if(STATE.recordRoom){ const p=pickGroundPoint(); addRoomPoint(p); } } }); }

  // ---------- FPS + loops ----------
  function fpsLoop(){ if(!STATE.fpsSpan) return; const fps=engine?.getFps?engine.getFps().toFixed(0):"--"; STATE.fpsSpan.textContent=`FPS: ${fps}`; updatePlayerInfo(); if(STATE.minimap.open) drawMinimap(); requestAnimationFrame(fpsLoop); }

  // ---------- Boot ----------
  function init(){ if(STATE.ready) return; const toggle=$('#devtools-toggle'), panel=$('#devtools-panel'); if(!toggle||!panel||!ensureScene()||!camera) return; toggle.style.display='block'; toggle.onclick=()=>{ panel.style.display = panel.style.display==='none' ? 'block':'none'; };
    PANEL.el=panel; buildPanel(); pointerObserver(); loadRoomsFromLS(); fpsLoop(); ensureDots(); STATE.ready=true; toast("Dev Tools ready (v2).",900); }
  const id=setInterval(()=>{ try{ if(ensureScene()&&camera&&$('#devtools-panel')){ clearInterval(id); init(); } }catch{} },200);
})();
