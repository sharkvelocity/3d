(function () {
  window.MAP_DEF = {
    title: "Furnished House",
    file: "furnished_house.glb",
    scale: 0.020,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },
    // If you want your “make this the origin” tweak for global offset:
    // offset: { x: -23.54, y: 0, z: 50.76 },

    // Use a vanZone center that makes sense for this GLB.
    // Start with your previous spawn and tweak as needed:
    vanZone: { center: { x: -108.40, y: 0.40, z: -121.90 }, radius: 11 },

    rooms: [
      { name:"Van", poly:[ {x:-4,z:18}, {x:4,z:18}, {x:4,z:24}, {x:-4,z:24} ] },
      { name:"Living Room", poly:[ {x:-6,z:-2}, {x:8,z:-2}, {x:8,z:8}, {x:-6,z:8} ] },
      { name:"Kitchen", poly:[ {x:8,z:-2}, {x:14,z:-2}, {x:14,z:8}, {x:8,z:8} ] },
      { name:"Hallway", poly:[ {x:-6,z:-8}, {x:0,z:-8}, {x:0,z:-2}, {x:-6,z:-2} ] },
      { name:"Bedroom", poly:[ {x:0,z:-8}, {x:8,z:-8}, {x:8,z:-2}, {x:0,z:-2} ] },
      { name:"Bathroom", poly:[ {x:8,z:-8}, {x:14,z:-8}, {x:14,z:-2}, {x:8,z:-2} ] }
    ]
  };
})();
