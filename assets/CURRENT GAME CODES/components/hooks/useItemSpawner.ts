
import React, { useEffect, useRef } from 'react';
import { PlacedItem, ItemId } from '../../types';
import { WORLD_SCALE, COLLISION_GROUPS } from '../../constants';

declare const BABYLON: any;

interface UseItemSpawnerProps {
    sceneRef: React.MutableRefObject<any>;
    placedItems: PlacedItem[];
    placedMeshesRef: React.MutableRefObject<Map<number, any>>;
    viewModelCacheRef: React.MutableRefObject<Map<string, { mesh: any, anims: any[] }>>;
}

export const useItemSpawner = ({
    sceneRef,
    placedItems,
    placedMeshesRef,
    viewModelCacheRef
}: UseItemSpawnerProps) => {
    const placedItemsVersionRef = useRef(0);
    const placedAnimationsRef = useRef(new Map<number, any[]>());

    useEffect(() => {
        placedItemsVersionRef.current++;
        const scene = sceneRef.current;
        if (!scene) return;
    
        const validPlacedItems = placedItems.filter(p => p);
        
        const currentMeshInstanceIds = new Set<number>(Array.from(placedMeshesRef.current.keys()));
        const stateItemInstanceIds = new Set(validPlacedItems.map(p => p.instanceId));
        
        // Cleanup removed items
        for (const instanceId of currentMeshInstanceIds) {
            if (!stateItemInstanceIds.has(instanceId)) {
                const meshToDispose = placedMeshesRef.current.get(instanceId);
                if (meshToDispose) {
                    meshToDispose.dispose();
                    placedMeshesRef.current.delete(instanceId);
                }
                const animsToDispose = placedAnimationsRef.current.get(instanceId);
                if (animsToDispose) {
                    animsToDispose.forEach((ag: any) => ag.dispose());
                    placedAnimationsRef.current.delete(instanceId);
                }
            }
        }
    
        // Spawn new items
        for (const item of validPlacedItems) {
            if (item.id === ItemId.GenericBook) continue;

            if (!currentMeshInstanceIds.has(item.instanceId)) { 
                
                const spawnPlacedItem = (loadedMesh: any, animationGroups: any[] = []) => {
                    if (!loadedMesh) return;

                    loadedMesh.computeWorldMatrix(true);
                    const hierarchy = loadedMesh.getHierarchyBoundingVectors(true);
                    const size = hierarchy.max.subtract(hierarchy.min);
                    
                    // Enforce min size for clickability, but respect thin items like plates
                    const isPlate = item.id === ItemId.Plate;
                    size.x = Math.max(size.x, isPlate ? 0.2 : 0.35);
                    size.y = Math.max(size.y, isPlate ? 0.05 : 0.35); 
                    size.z = Math.max(size.z, isPlate ? 0.2 : 0.35);

                    const center = BABYLON.Vector3.Center(hierarchy.min, hierarchy.max);
                    const type = item.id === ItemId.MotionSensor ? 'motion_sensor' : 'pickup';
                    const metadata = { type, instanceId: item.instanceId, id: item.id };

                    // Create Physics Collider (The "Hitbox")
                    let collider;
                    if (isPlate) {
                        // Use Cylinder for round plates
                        collider = BABYLON.MeshBuilder.CreateCylinder("item_collider_" + item.instanceId, { diameter: size.x, height: size.y }, scene);
                    } else {
                        collider = BABYLON.MeshBuilder.CreateBox("item_collider_" + item.instanceId, { width: size.x, height: size.y, depth: size.z }, scene);
                    }
                    
                    collider.isVisible = true;
                    collider.visibility = 0; 
                    
                    collider.isPickable = item.isPickable !== false;
                    collider.metadata = metadata;

                    collider.position = new BABYLON.Vector3(item.position.x, item.position.y + (size.y / 2), item.position.z);
                    collider.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(item.rotation.x, item.rotation.y, item.rotation.z);
                    collider.scaling.setAll(WORLD_SCALE);

                    loadedMesh.parent = collider;
                    loadedMesh.position = center.scale(-1);
                    loadedMesh.rotation = BABYLON.Vector3.Zero(); 
                    
                    if (item.id === ItemId.VideoCamera) {
                        loadedMesh.rotation.y = Math.PI;
                    }

                    loadedMesh.scaling.setAll(1);
                    
                    // [FIX] Ensure the spawned instance is visible, even if the source master was hidden
                    loadedMesh.setEnabled(true);

                    // Animations
                    const instanceAnims: any[] = [];
                    if (animationGroups && animationGroups.length > 0) {
                        const newDescendants = loadedMesh.getDescendants(false);
                        newDescendants.push(loadedMesh);

                        animationGroups.forEach((group: any) => {
                            const newGroup = group.clone(group.name + "_clone_" + item.instanceId, (oldTarget: any) => {
                                return newDescendants.find((node: any) => 
                                    node.name === oldTarget.name || 
                                    node.name.endsWith(oldTarget.name)
                                ) || null;
                            });
                            if (newGroup) {
                                newGroup.stop();
                                instanceAnims.push(newGroup);
                            }
                        });
                    }
                    if (instanceAnims.length > 0) {
                        placedAnimationsRef.current.set(item.instanceId, instanceAnims);
                    }

                    // Disable picking on Visual Model
                    const allMeshes: any[] = [loadedMesh, ...loadedMesh.getDescendants(false)];
                    allMeshes.forEach((m: any) => {
                        if (m instanceof BABYLON.AbstractMesh) {
                            m.isPickable = false; 
                            m.checkCollisions = false;
                            // Ensure materials are ready/visible
                            m.setEnabled(true); 
                            // [FIX] Prevent seeing items through walls by forcing them to default render group
                            m.renderingGroupId = 0;
                            // [FIX] Ensure depth testing is ON to prevent X-Ray effect
                            if (m.material) {
                                m.material.disableDepthTest = false;
                            }
                        }
                    });
                    
                    if (!collider.physicsImpostor) {
                        const isCursed = item.id === ItemId.MusicBox; 

                        if (!item.isPile && !isCursed) {
                            collider.computeWorldMatrix(true);
                            
                            // [FIX] Physics Tuning for Plates vs Boxes
                            if (isPlate) {
                                collider.physicsImpostor = new BABYLON.PhysicsImpostor(
                                    collider, 
                                    BABYLON.PhysicsImpostor.CylinderImpostor, 
                                    { mass: 1.0, restitution: 0.0, friction: 1.0 }, // Heavy, no bounce
                                    scene
                                );
                            } else {
                                const mass = (item.id === ItemId.Tripod || item.id === ItemId.VideoCamera) ? 1.0 : 0.2;
                                collider.physicsImpostor = new BABYLON.PhysicsImpostor(
                                    collider, 
                                    BABYLON.PhysicsImpostor.BoxImpostor, 
                                    { mass, restitution: 0.1, friction: 0.8 }, 
                                    scene
                                );
                            }
                            
                            collider.physicsImpostor.collisionGroup = COLLISION_GROUPS.FURNITURE;
                            collider.physicsImpostor.collisionMask = -1; 
                            collider.checkCollisions = false; 
                            
                            // [FIX] PHYSICS IMPULSE FOR TOSSING
                            // If throwVelocity exists, apply it now as an impulse
                            if (item.throwVelocity) {
                                const v = item.throwVelocity;
                                const impulse = new BABYLON.Vector3(v.x, v.y, v.z);
                                // Apply impulse at center of mass
                                collider.physicsImpostor.applyImpulse(impulse, collider.getAbsolutePosition());
                                
                                // Add random spin for realism
                                const spin = new BABYLON.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).scale(5.0);
                                collider.physicsImpostor.setAngularVelocity(spin);
                            } else {
                                collider.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
                                collider.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
                            }
                        }
                    }

                    placedMeshesRef.current.set(item.instanceId, collider);
                };

                if (item.modelUrl) {
                    if (viewModelCacheRef.current.has(item.modelUrl)) {
                        const cachedData = viewModelCacheRef.current.get(item.modelUrl);
                        if (cachedData && cachedData.mesh) {
                            const cachedRoot = cachedData.mesh;
                            const cachedAnims = cachedData.anims;
                            
                            let meshToClone = cachedRoot;
                            if (item.meshName) {
                                const descendants = cachedRoot.getDescendants(false);
                                const specificMesh = descendants.find((m: any) => m.name === item.meshName);
                                if (specificMesh) meshToClone = specificMesh;
                            }

                            if (meshToClone) {
                                const clone = meshToClone.instantiateHierarchy();
                                if (clone) {
                                    // [FIX] Explicitly enable clone and detach from hidden parent if any
                                    clone.setEnabled(true);
                                    clone.parent = null;
                                    
                                    const allCloneMeshes = [clone, ...clone.getDescendants(false)];
                                    allCloneMeshes.forEach((m: any) => {
                                        if (m instanceof BABYLON.AbstractMesh) {
                                            m.layerMask = 0xFFFFFFFF; 
                                            m.setEnabled(true);
                                            // [FIX] Force depth sort correctness
                                            m.renderingGroupId = 0;
                                            if (m.material) {
                                                m.material.disableDepthTest = false;
                                            }
                                        }
                                    });
                                    spawnPlacedItem(clone, cachedAnims);
                                }
                            }
                        }
                    } else {
                        BABYLON.SceneLoader.ImportMeshAsync(null, item.modelUrl, "", scene, null, ".glb")
                            .then((result: any) => {
                                if (!placedItems.find(p => p && p.instanceId === item.instanceId)) {
                                    if (result.meshes) result.meshes.forEach((m: any) => m.dispose());
                                    return;
                                }
                                
                                const root = result.meshes[0];
                                if (!root) return;
                                
                                // [FIX] HIDE THE MASTER ROOT IMMEDIATELY
                                // This ensures the source template doesn't linger at 0,0,0 visible
                                root.setEnabled(false);
                                root.position = BABYLON.Vector3.Zero();

                                const anims = result.animationGroups ? [...result.animationGroups] : [];
                                viewModelCacheRef.current.set(item.modelUrl!, { mesh: root, anims: anims });

                                let meshToUse = root;
                                if (item.meshName) {
                                    const specificMesh = result.meshes.find((m: any) => m.name === item.meshName);
                                    if (specificMesh) {
                                        meshToUse = specificMesh;
                                        // Detach child so we can move/use it independently without moving the hidden root
                                        meshToUse.parent = null;
                                    }
                                }
                                spawnPlacedItem(meshToUse, anims);
                            })
                            .catch((e: any) => console.error(`Failed to load item:`, e));
                    }
                }
            }
        }
    }, [placedItems]);
};
