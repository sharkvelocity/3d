// Per-map config for Furnished House
export const spawn = { x: -334.56, y: 3.76, z: -377.44 };

// Optional: set a fixed weather or leave null to keep random-lock
export const weather = null;

// Optional hook to run after the map is appended
export function setup(scene, BABYLON){
  // Example: tighten collisions or place gizmos
  // const box = BABYLON.MeshBuilder.CreateBox('entry_block',{width:1, height:2, depth:0.2}, scene);
  // box.position = new BABYLON.Vector3(-334.56, 1.0, -377.44);
  // box.checkCollisions = true; box.visibility = 0;
}
