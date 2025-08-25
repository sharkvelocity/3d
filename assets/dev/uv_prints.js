<script>
(function(){
  const UV = (window.UVPrints = window.UVPrints || {});
  let SCENE=null, mat=null;
  const TEX = './assets/textures/uv_footprint.png';
  const TTL=60, FADE=15, SCALE=0.45, HEIGHT=0.02;
  const LIVE=[];

  function whenScene(cb){ (function w(){ if(window.scene){ cb(window.scene); } else requestAnimationFrame(w); })(); }
  function ensureMat(scene){
    if (mat) return mat;
    mat = new BABYLON.StandardMaterial('uv_print_mat', scene);
    const t = new BABYLON.Texture(TEX, scene, true, false);
    mat.diffuseTexture=t; mat.emissiveTexture=t; mat.opacityTexture=t;
    mat.diffuseColor = new BABYLON.Color3(0.0,0.6,0.2);
    mat.emissiveColor= new BABYLON.Color3(0.2,1.0,0.4);
    mat.specularColor= new BABYLON.Color3(0,0,0);
    mat.backFaceCulling=false; return mat;
  }
  function now(){ return (performance?.now?.()||Date.now())/1000; }
  function snapGround(scene,p){
    try{
      const ray=new BABYLON.Ray(new BABYLON.Vector3(p.x,(p.y||2)+5,p.z), new BABYLON.Vector3(0,-1,0), 20);
      const hit=scene.pickWithRay(ray, m=>m && m.isPickable!==false);
      if (hit?.hit && hit.pickedPoint) return hit.pickedPoint;
    }catch(_){}
    return p;
  }
  function addFootprint(pos, rotY=0){
    const scene=SCENE; if(!scene) return null;
    const m=ensureMat(scene);
    const p=snapGround(scene,pos);
    const plane=BABYLON.MeshBuilder.CreatePlane('uv_print',{size:SCALE, sideOrientation:BABYLON.Mesh.DOUBLESIDE}, scene);
    plane.material=m; plane.rotation=new BABYLON.Vector3(Math.PI/2, rotY, (Math.random()<0.5?Math.PI:0));
    plane.position=new BABYLON.Vector3(p.x,(p.y||0)+HEIGHT,p.z);
    plane.isPickable=false;
    LIVE.push({mesh:plane,born:now()});
    return plane;
  }
  UV.addFootprint = addFootprint;
  UV.addStepPair = function(center, yaw){
    const dir=new BABYLON.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const side=BABYLON.Vector3.Cross(dir,BABYLON.Axis.Y).normalize();
    const stride=0.35, width=0.12;
    addFootprint(center.add(dir.scale(stride)).add(side.scale(+width)), yaw);
    addFootprint(center.add(dir.scale(stride*1.9)).add(side.scale(-width)), yaw);
  };
  UV.clear=function(){ for(const it of LIVE){ try{ it.mesh.dispose(); }catch(_){ } } LIVE.length=0; };

  whenScene(function(scene){
    SCENE = scene;
    scene.onBeforeRenderObservable.add(()=>{
      const t=now();
      for(let i=LIVE.length-1;i>=0;i--){
        const it=LIVE[i], age=t-it.born;
        if (age >= TTL){ try{ it.mesh.dispose(); }catch(_){ } LIVE.splice(i,1); continue; }
        if (age >= (TTL-FADE)){
          const a = 1 - ((age - (TTL-FADE))/FADE);
          if (it.mesh.material) it.mesh.material.alpha = Math.max(0, Math.min(1, a));
        }
      }
    });
  });
})();
</script>
