/* map_generator.js — procedural house generator for Babylon.js */
window.MapGenerator = window.MapGenerator || {};
window.MapGenerator.generate = async function(scene){
"use strict";

if(!scene) throw new Error("Scene required for MapGenerator");

const root = new BABYLON.TransformNode("ProceduralHouseRoot", scene);

// ---------- config ----------
const ROOM_SIZE = { width: 6, height:3, depth:6 }; // base room size
const DOOR_SIZE = { width:1.2, height:2.1 };
const WALL_HEIGHT = ROOM_SIZE.height;
const WALL_THICK = 0.2;
const ROOM_TYPES = ["living","bedroom","bathroom","hall","kitchen","dining","garage"];
const FRONT_DOOR_SIDE = "north"; // arbitrary reference
const rooms = [];

// ---------- utility ----------
function createBox(name, w,h,d,pos,mat){
  const box = BABYLON.MeshBuilder.CreateBox(name, {width:w, height:h, depth:d}, scene);
  box.position.copyFrom(pos);
  if(mat) box.material=mat;
  box.parent = root;
  box.checkCollisions = true;
  return box;
}

function vec(x,y,z){ return new BABYLON.Vector3(x,y,z); }

// ---------- floor and ceiling ----------
const floor = createBox("floor", 50, 0.2, 50, vec(0,-0.1,0));
floor.isPickable = false;
const ceiling = createBox("ceiling",50,0.2,50,vec(0,ROOM_SIZE.height,0));
ceiling.isPickable = false;

// ---------- basic wall material ----------
const wallMat = new BABYLON.StandardMaterial("wallMat",scene);
wallMat.diffuseColor = new BABYLON.Color3(0.9,0.9,0.9);

// ---------- room generator ----------
function createRoom(name, type, center){
  const w=ROOM_SIZE.width, d=ROOM_SIZE.depth;
  const room = { name,type, center, doors:[] };

  // walls: north, east, south, west
  const north = createBox(name+"_north", w, WALL_HEIGHT, WALL_THICK, vec(center.x, WALL_HEIGHT/2, center.z - d/2), wallMat);
  const south = createBox(name+"_south", w, WALL_HEIGHT, WALL_THICK, vec(center.x, WALL_HEIGHT/2, center.z + d/2), wallMat);
  const east  = createBox(name+"_east",  WALL_THICK, WALL_HEIGHT, d, vec(center.x + w/2, WALL_HEIGHT/2, center.z), wallMat);
  const west  = createBox(name+"_west",  WALL_THICK, WALL_HEIGHT, d, vec(center.x - w/2, WALL_HEIGHT/2, center.z), wallMat);

  room.walls = {north,south,east,west};
  rooms.push(room);
  return room;
}

// ---------- door placement ----------
function placeDoor(room, wallDir){
  const doorY = DOOR_SIZE.height/2;
  const wall = room.walls[wallDir];
  if(!wall) return null;

  let doorPos = wall.position.clone();
  if(wallDir==="north" || wallDir==="south"){
    doorPos.y = doorY;
    doorPos.x = room.center.x;
  } else {
    doorPos.y = doorY;
    doorPos.z = room.center.z;
  }

  // subtract door space from wall
  const wallMesh = wall;
  if(wallDir==="north" || wallDir==="south"){
    wallMesh.scaling.x -= DOOR_SIZE.width/wallMesh.scaling.x;
  } else {
    wallMesh.scaling.z -= DOOR_SIZE.width/wallMesh.scaling.z;
  }

  const door = createBox(room.name+"_door_"+wallDir, DOOR_SIZE.width, DOOR_SIZE.height, 0.1, doorPos);
  door.material = new BABYLON.StandardMaterial("doorMat",scene);
  door.parent = root;
  room.doors.push(door);
  return door;
}

// ---------- room layout ----------
function layoutRooms(){
  // example fixed rooms:
  const foyer = createRoom("foyer","hall",vec(0,0,0));
  const living = createRoom("living","living",vec(8,0,0));
  const garage = createRoom("garage","garage",vec(-8,0,-12));
  const kitchen = createRoom("kitchen","kitchen",vec(8,0,6));
  const dining = createRoom("dining","dining",vec(12,0,6));

  // bathrooms
  const bath1 = createRoom("bath1","bathroom",vec(4,0,12));
  const bath2 = createRoom("bath2","bathroom",vec(12,0,12));

  // bedrooms
  const br1 = createRoom("bed1","bedroom",vec(0,0,16));
  const br2 = createRoom("bed2","bedroom",vec(8,0,16));

  // halls
  const hall1 = createRoom("hall1","hall",vec(8,0,12));
  const hall2 = createRoom("hall2","hall",vec(4,0,6));

  // connect doors (centered)
  placeDoor(foyer,"north");
  placeDoor(foyer,"east");
  placeDoor(living,"west");
  placeDoor(living,"east");
  placeDoor(garage,"south"); // garage connected by door
  placeDoor(kitchen,"west");
  placeDoor(dining,"west");
  placeDoor(bath1,"south");
  placeDoor(bath2,"south");
  placeDoor(br1,"north");
  placeDoor(br2,"north");
  placeDoor(hall1,"south");
  placeDoor(hall2,"north");

  return rooms;
}

// ---------- generate ----------
const generatedRooms = layoutRooms();

// ---------- expose for debugging ----------
window._proceduralRooms = generatedRooms;

return root;
};
