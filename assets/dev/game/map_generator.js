// map_generator.js — Babylon.js random seed-based house generator
(function(){
  "use strict";
  if(window.__MapGeneratorReady) return;
  window.__MapGeneratorReady = true;

  const MapGenerator = window.MapGenerator = window.MapGenerator || {};
  
  MapGenerator.roomBounds = {}; // will store {min:Vector3, max:Vector3} for each room

  // Example: grid size per square
  const SQUARE_SIZE = 4;

  // Room definitions
  const ROOM_TYPES = [
    {name:"Foyer", fixed:true},
    {name:"Garage", fixed:true},
    {name:"Kitchen", fixed:true},
    {name:"Dining", fixed:true},
    {name:"Living", fixed:false},
    {name:"Bedroom", fixed:false},
    {name:"Bathroom", fixed:false}
  ];

  // Minimal random integer helper
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  // Generate a house layout
  MapGenerator.generate = function(seed=Date.now()){
    // seedable random
    let rng = mulberry32(seed);

    const rooms = [];
    MapGenerator.roomBounds = {}; // reset

    // -----------------------
    // Foyer — always front
    const foyerPos = new BABYLON.Vector3(0,0,0);
    const foyerSize = new BABYLON.Vector3(1*SQUARE_SIZE,0,1*SQUARE_SIZE);
    rooms.push({name:"Foyer", pos:foyerPos, size:foyerSize});
    MapGenerator.roomBounds["Foyer"] = {
      min: foyerPos.clone(),
      max: foyerPos.add(foyerSize)
    };
    MapGenerator.frontDoorRoom = MapGenerator.roomBounds["Foyer"];

    // -----------------------
    // Garage — fixed side
    const garageWidth = 2*SQUARE_SIZE;
    const garageDepth = 2*SQUARE_SIZE;
    const garagePos = new BABYLON.Vector3(-garageWidth,0,SQUARE_SIZE); // left side of house
    const garageSize = new BABYLON.Vector3(garageWidth,0,garageDepth);
    rooms.push({name:"Garage", pos:garagePos, size:garageSize});
    MapGenerator.roomBounds["Garage"] = {
      min: garagePos.clone(),
      max: garagePos.add(garageSize)
    };

    // -----------------------
    // Kitchen + Dining (connected)
    const kitchenPos = new BABYLON.Vector3(SQUARE_SIZE,0,SQUARE_SIZE*2);
    const kitchenSize = new BABYLON.Vector3(2*SQUARE_SIZE,0,SQUARE_SIZE);
    const diningPos = kitchenPos.add(new BABYLON.Vector3(0,0,SQUARE_SIZE)); // attached behind kitchen
    const diningSize = new BABYLON.Vector3(2*SQUARE_SIZE,0,SQUARE_SIZE);
    rooms.push({name:"Kitchen", pos:kitchenPos, size:kitchenSize});
    rooms.push({name:"Dining", pos:diningPos, size:diningSize});
    MapGenerator.roomBounds["Kitchen"] = {min:kitchenPos.clone(), max:kitchenPos.add(kitchenSize)};
    MapGenerator.roomBounds["Dining"] = {min:diningPos.clone(), max:diningPos.add(diningSize)};

    // -----------------------
    // Living room — 4 squares
    const livingPos = new BABYLON.Vector3(SQUARE_SIZE,0,0);
    const livingSize = new BABYLON.Vector3(2*SQUARE_SIZE,0,2*SQUARE_SIZE);
    rooms.push({name:"Living", pos:livingPos, size:livingSize});
    MapGenerator.roomBounds["Living"] = {min:livingPos.clone(), max:livingPos.add(livingSize)};

    // -----------------------
    // Bedrooms 1-3
    const bedroomCount = randInt(1,3);
    for(let i=0;i<bedroomCount;i++){
      const bx = SQUARE_SIZE * randInt(0,2);
      const bz = SQUARE_SIZE * randInt(3,4);
      const bSize = new BABYLON.Vector3(SQUARE_SIZE*randInt(2,4),0,SQUARE_SIZE);
      const bPos = new BABYLON.Vector3(bx,0,bz);
      rooms.push({name:"Bedroom"+(i+1), pos:bPos, size:bSize});
      MapGenerator.roomBounds["Bedroom"+(i+1)] = {min:bPos.clone(), max:bPos.add(bSize)};
    }

    // -----------------------
    // Bathrooms 1-3
    const bathCount = randInt(1,3);
    for(let i=0;i<bathCount;i++){
      const bx = SQUARE_SIZE * randInt(0,2);
      const bz = SQUARE_SIZE * randInt(3,4);
      const bSize = new BABYLON.Vector3(SQUARE_SIZE,0,SQUARE_SIZE);
      const bPos = new BABYLON.Vector3(bx,0,bz);
      rooms.push({name:"Bathroom"+(i+1), pos:bPos, size:bSize});
      MapGenerator.roomBounds["Bathroom"+(i+1)] = {min:bPos.clone(), max:bPos.add(bSize)};
    }

    // -----------------------
    // Store rooms globally
    MapGenerator.rooms = rooms;
    return rooms;
  };

  // -----------------------
  // Minimal deterministic RNG
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

})();
