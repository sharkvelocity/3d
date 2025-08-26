(function () {
  window.MAP_DEF = {
    title: "Furnished House",
    file: "furnished_house.glb",
    scale: 0.020,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },
    spawn:    { x: -108.40, y: 0.40, z: -121.90 },
    vanSpawn: { x: -108.40, y: 0.40, z: -121.90 },
    vanZone: { center: { x: -108.40, y: 0, z: -121.90 }, radius: 8 },
    exteriorMode: "exterior",
    exterior: [
      {x:-15,z:-20}, {x:15,z:-20}, {x:15,z:20}, {x:-15,z:20}
    ]
  };
})();