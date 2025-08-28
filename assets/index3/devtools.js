function ensureDebugCube(){
  const box = BABYLON.MeshBuilder.CreateBox("debugBox", {size:2}, scene);
  box.position = new BABYLON.Vector3(vanZone.center.x, 1, vanZone.center.z);
}
function initDevToolsUI(){
  const toggle = document.getElementById('devtools-toggle');
  const panel  = document.getElementById('devtools-panel');
  if (!toggle || !panel) return;
  toggle.style.display = 'block';
  toggle.onclick = ()=>{ panel.style.display = panel.style.display==='none' ? 'block':'none'; };
}
