(function () {
  window.MAP_DEF = {
    title: "Abandoned House",
    file: "Abandoned_House.glb",
    scale: 1.0,
    rotationY: 0,
    offset: { x: 0, y: 0, z: 0 },
    spawn:    { x: 0, y: 0, z: 0 },
    vanSpawn: { x: 10, y: 1.8, z: 0 },
    vanZone: { center: { x: 0, y: 0, z: 0 }, radius: 8 },
    exteriorMode: "exterior",
    exterior: [
      {x:-30,z:-40}, {x:40,z:-40}, {x:40,z:40}, {x:-30,z:40}
    ]
  };
})();
