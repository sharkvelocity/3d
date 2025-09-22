/* prohouse_generator.js — procedural ProHouse generator for PhasmaPhoney
   - Generates rooms (foyer, garage, living, kitchen/dining, bedrooms, bathrooms)
   - Creates meshes and doors with collisions
   - Returns object with meshes, rooms, doors, and player spawn
*/

(function(){
"use strict";
if(window.__ProHouseGeneratorReady) return;
window.__ProHouseGeneratorReady = true;

const S = () => window.scene || BABYLON.EngineStore.LastCreatedScene;

window.ProHouseGenerator = {
    rooms: [],
    roomMeshes: [],
    doorMeshes: [],
    roomSizeUnit: 4,
    doorMesh: null,

    // ----- Load door mesh once -----
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

    // ----- Create room mesh -----
    createRoomMesh(room){
        const sc = S();
        if(!sc) return null;
        const mesh = BABYLON.MeshBuilder.CreateBox(room.name, {
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

    // ----- Procedural generation -----
    generate(seed = 12345){
        const rng = (function(s){ let x = s; return ()=>{ x=(x*9301+49297)%233280; return x/233280; }; })(seed);
        const rooms = [];
        const usedSpaces = new Set();
        const hashPos = (x,z) => `${x},${z}`;

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

    // ----- Generate room meshes and doors -----
    async generateMap(scene, seed=12345){
        if(!scene) scene = S();
        if(!scene) throw new Error("Scene not ready");

        // clear previous meshes
        this.roomMeshes.forEach(m=>{ try{ m.dispose(); }catch{} });
        this.roomMeshes=[];
        this.doorMeshes.forEach(m=>{ try{ m.dispose(); }catch{} });
        this.doorMeshes=[];

        // generate rooms
        this.generate(seed);

        // create meshes
        this.rooms.forEach(r=>this.createRoomMesh(r));

        // spawn doors
        await this.loadDoorMesh();
        if(this.doorMesh){
            for(const r of this.rooms){
                r.doors.forEach(d=>{
                    const dm = this.doorMesh.clone(r.name+"_door");
                    dm.isVisible = true;
                    dm.position.set(r.position.x + d.x, 1, r.position.z + d.z);
                    dm.checkCollisions = true;
                    this.doorMeshes.push(dm);
                });
            }
        }

        // player spawn
        const spawn = window.__PP_SPAWN || {x:0,y:1.8,z:0};
        spawn.x = -3; spawn.y = 1.8; spawn.z = -5;

        return {
            meshes: this.roomMeshes.concat(this.doorMeshes),
            rooms: this.rooms,
            doors: this.doorMeshes,
            spawn
        };
    }
};
})();
