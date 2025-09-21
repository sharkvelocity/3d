// ./assets/dev/game/map_generator.js
// Procedural, seed-based map generator for PhasmaPhoney
(function(){
  "use strict";
  if(window.__MapGeneratorReady) return;
  window.__MapGeneratorReady = true;

  const MapGenerator = window.MapGenerator = {};

  // ---------------- Random Utility ----------------
  let seed = 0;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const randInt = (min,max) => Math.floor(random()*(max-min+1))+min;

  // ---------------- Room Definitions ----------------
  const ROOM_TYPES = {
    foyer:   {w:1,h:1,fixed:true,doors:['front']},
    living:  {w:2,h:2,fixed:true,doors:['door']},
    kitchen: {w:2,h:1,fixed:true,doors:['open']},
    dining:  {w:2,h:1,fixed:true,doors:['open']},
    garage1: {w:2,h:1,fixed:true,doors:['door'],car:1},
    garage2: {w:2,h:2,fixed:true,doors:['door'],car:2,utility:true},
    bathroom: {w:1,h:1,doors:['door']},
    bedroom:  {w:randInt(2,4),h:randInt(2,4),doors:['door']},
    closet:   {w:1,h:1,doors:[]}
  };

  // ---------------- Map State ----------------
  MapGenerator.map = [];
  MapGenerator.rooms = [];
  MapGenerator.roomAnchors = {};

  // ---------------- Helpers ----------------
  const overlaps = (x,y,w,h) => {
    return MapGenerator.rooms.some(r=>{
      return !(x+r.w<=r.x || x>=r.x+r.w || y+r.h<=r.y || y>=r.y+r.h);
    });
  };

  const addRoom = (type,x,y,w,h,name) => {
    MapGenerator.rooms.push({type,name,x,y,w,h,doors:ROOM_TYPES[type].doors.slice()});
  };

  MapGenerator.getRoomCenter = (name) => {
    const r = MapGenerator.rooms.find(r=>r.name===name);
    if(!r) return new BABYLON.Vector3(0,0,0);
    return new BABYLON.Vector3(r.x + r.w/2,0,r.y + r.h/2);
  };

  MapGenerator.getVanRoom = () => MapGenerator.rooms.find(r=>r.type==='van') || MapGenerator.rooms.find(r=>r.type==='foyer');

  MapGenerator.getRandomGhostRoom = () => {
    const candidates = MapGenerator.rooms.filter(r=>!['foyer','garage1','garage2'].includes(r.type));
    return candidates.length ? candidates[randInt(0,candidates.length-1)].name : 'living';
  };

  // ---------------- Room Placement ----------------
  const placeRooms = () => {
    MapGenerator.rooms.length=0;

    // Front door/foyer fixed
    addRoom('foyer',0,0,1,1,'foyer');

    // Garage fixed on front side
    addRoom(randInt(0,1)?'garage1':'garage2',3,0,ROOM_TYPES.garage1.w,ROOM_TYPES.garage1.h,'garage');

    // Kitchen + dining together
    addRoom('kitchen',0,1,2,1,'kitchen');
    addRoom('dining',2,1,2,1,'dining');

    // Living room fixed size 2x2 anywhere behind front
    let lx=0,lz=2;
    addRoom('living',lx,lz,2,2,'living');

    // Bathrooms: 1-3, cannot touch each other, cannot touch garage/kitchen
    const bCount = randInt(1,3);
    for(let i=0;i<bCount;i++){
      let placed=false;
      for(let tries=0;tries<50;tries++){
        const x=randInt(0,4), y=randInt(2,4);
        if(!overlaps(x,y,1,1)){
          addRoom('bathroom',x,y,1,1,'bathroom'+i);
          placed=true; break;
        }
      }
      if(!placed) console.warn("Failed to place bathroom "+i);
    }

    // Bedrooms 1-3
    const bedCount = randInt(1,3);
    for(let i=0;i<bedCount;i++){
      let placed=false;
      for(let tries=0;tries<50;tries++){
        const w=randInt(2,4), h=randInt(2,4);
        const x=randInt(0,6-w), y=randInt(2,6-h);
        if(!overlaps(x,y,w,h)){
          addRoom('bedroom',x,y,w,h,'bedroom'+i);
          // optional closet inside
          addRoom('closet',x,y,1,1,'closet'+i);
          placed=true; break;
        }
      }
      if(!placed) console.warn("Failed to place bedroom "+i);
    }
  };

  // ---------------- Generate Map ----------------
  MapGenerator.generate = async ({seed:inputSeed, attachToScene})=>{
    seed = inputSeed || Date.now();
    placeRooms();

    if(!attachToScene) return;

    // Clear existing meshes
    attachToScene.meshes.slice().forEach(m=>{
      if(!m.name.startsWith('skyBox')) m.dispose();
    });

    // Build primitives for rooms
    MapGenerator.rooms.forEach(r=>{
      const mesh = BABYLON.MeshBuilder.CreateBox(r.name,{width:r.w,depth:r.h,height:2},attachToScene);
      mesh.position.set(r.x+r.w/2,1,r.y+r.h/2);
      mesh.metadata={type:r.type};
      mesh.material = new BABYLON.StandardMaterial("mat_"+r.name,attachToScene);
      mesh.material.diffuseColor = new BABYLON.Color3(Math.random(),Math.random(),Math.random());
    });

    // Doors
    for(const r of MapGenerator.rooms){
      if(r.doors.includes('door')){
        const doorMesh = await BABYLON.SceneLoader.ImportMeshAsync("", "./assets/models/map/", "door.glb", attachToScene);
        doorMesh.meshes.forEach(m=>m.position.set(r.x+r.w/2,0,r.y+r.h/2));
      }
    }

    return MapGenerator.rooms;
  };

})();
