/* map_generator.js — procedural house generator for PhasmaPhoney
   - Generates rooms as square/rectangle/L-shapes
   - Respects constraints: front door fixed, garage fixed side, bathrooms 1 door, bedrooms 1-3 rooms
   - Kitchen + dining fixed together
   - Living room fixed shape but can move
   - Doors/doorways are centered on edges
   - Player spawn at van location
   - Ghost spawn constrained to map, cannot pass walls, uses doorways as openings
*/

(function(){
"use strict";
if(window.__MapGeneratorReady) return;
window.__MapGeneratorReady = true;

const S = () => window.scene || BABYLON.EngineStore.LastCreatedScene;

window.MapGenerator = {
    rooms: [],
    roomMeshes: [],
    roomSizeUnit: 4,
    doorMesh: null,

    async loadDoorMesh(path="./assets/models/map/door.glb"){
        if(this.doorMesh) return this.doorMesh;
        const sc = S();
        if(!sc) throw new Error("Scene not ready");
        const res = await BABYLON.SceneLoader.ImportMeshAsync("", "", path, sc);
        const door = res.meshes[0] || null;
        if(door){
            door.isVisible = false;
            this.doorMesh = door;
        }
        return this.doorMesh;
    },

    createRoomMesh(room){
        const sc = S();
        if(!sc) return null;
        let mesh = BABYLON.MeshBuilder.CreateBox(room.name, {
            width: room.width*this.roomSizeUnit,
            depth: room.depth*this.roomSizeUnit,
            height: 2.5
        }, sc);
        mesh.position.set(room.position.x, 1.25, room.position.z);
        mesh.checkCollisions = true;
        mesh.metadata = room;
        this.roomMeshes.push(mesh);
        return mesh;
    },

    generate(seed = 12345){
        let rng = (function(s){ let x = s; return ()=>{ x=(x*9301+49297)%233280; return x/233280; }; })(seed);
        const rooms = [];
        const usedSpaces = new Set();
        function hashPos(x,z){ return `${x},${z}`; }

        // Foyer
        const foyer = { name:"Foyer", width:1, depth:1, type:"foyer", position:{x:0,z:0}, doors:[] };
        rooms.push(foyer); usedSpaces.add(hashPos(0,0));

        // Garage
        const garage = { name:"Garage", width:2, depth:2, type:"garage", position:{x:3,z:0}, doors:[] };
        rooms.push(garage);
        for(let dx=0;dx<2;dx++) for(let dz=0;dz<2;dz++) usedSpaces.add(hashPos(3+dx,0+dz));

        // Living Room
        const living = { name:"LivingRoom", width:2, depth:2, type:"living", position:{x:0,z:2}, doors:[] };
        rooms.push(living);
        for(let dx=0;dx<2;dx++) for(let dz=0;dz<2;dz++) usedSpaces.add(hashPos(0+dx,2+dz));

        // Kitchen + Dining
        const kitchen = { name:"Kitchen", width:2, depth:1, type:"kitchen", position:{x:2,z:2}, doors:[] };
        const dining = { name:"Dining", width:2, depth:1, type:"dining", position:{x:2,z:3}, doors:[] };
        rooms.push(kitchen,dining);
        for(let dx=0;dx<2;dx++){
            usedSpaces.add(hashPos(2+dx,2));
            usedSpaces.add(hashPos(2+dx,3));
        }

        // Bedrooms
        const numBeds = 1+Math.floor(rng()*3);
        let bedX=0, bedZ=4;
        for(let i=0;i<numBeds;i++){
            const w=1+Math.floor(rng()*2), d=1+Math.floor(rng()*2);
            const room = { name:"Bedroom"+(i+1), width:w, depth:d, type:"bedroom", position:{x:bedX,z:bedZ}, doors:[] };
            rooms.push(room);
            for(let dx=0;dx<w;dx++) for(let dz=0;dz<d;dz++) usedSpaces.add(hashPos(bedX+dx,bedZ+dz));
            bedX += w; if(bedX>4){ bedX=0; bedZ+=d; }
        }

        // Bathrooms
        const numBaths = 1+Math.floor(rng()*3);
        let bathX=0, bathZ=6;
        for(let i=0;i<numBaths;i++){
            const room = { name:"Bathroom"+(i+1), width:1, depth:1, type:"bathroom", position:{x:bathX,z:bathZ}, doors:[] };
            rooms.push(room);
            usedSpaces.add(hashPos(bathX,bathZ));
            bathX += 1; if(bathX>3){ bathX=0; bathZ+=1; }
        }

        // Doors
        rooms.forEach(r=>{
            r.doors=[];
            if(r.type==="foyer") r.doors.push({x:0.5,z:-0.5});
            if(r.type==="garage") r.doors.push({x:r.width/2,z:-0.5});
            if(r.type==="bathroom") r.doors.push({x:0.5,z:-0.5});
            if(["living","kitchen","dining"].includes(r.type)) r.doors.push({x:r.width/2,z:-0.5});
        });

        this.rooms = rooms;
        return rooms;
    },

    async spawnRooms(seed){
        const sc = S();
        if(!sc) return;
        if(this.roomMeshes.length){ this.roomMeshes.forEach(m=>{ try{ m.dispose(); } catch{} }); this.roomMeshes=[]; }

        this.generate(seed);

        for(const r of this.rooms) this.createRoomMesh(r);

        // spawn doors
        if(!this.doorMesh) await this.loadDoorMesh();
        if(this.doorMesh){
            for(const r of this.rooms){
                r.doors.forEach(d=>{
                    const dm = this.doorMesh.clone(r.name+"_door");
                    dm.isVisible = true;
                    dm.position.set(r.position.x + d.x, 1, r.position.z + d.z);
                    dm.checkCollisions = true;
                });
            }
        }

        // place player at van location
        if(window.__PP_SPAWN){
            const sp = window.__PP_SPAWN;
            sp.x=-3; sp.y=1.8; sp.z=-5;
        }
    }
};
})();
