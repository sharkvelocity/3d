
import React, { useEffect, useRef } from 'react';
import { WORLD_SCALE, VIEWMODEL_LAYER_MASK } from '../../constants';
import { ItemPlacementService } from '../../services/ItemPlacementService';

declare const BABYLON: any;

interface UseItemPlacementProps {
    sceneRef: React.MutableRefObject<any>;
    playerCameraRef: React.MutableRefObject<any>;
    playerRootRef: React.MutableRefObject<any>;
    propsRef: React.MutableRefObject<any>;
}

export const useItemPlacement = ({
    sceneRef,
    playerCameraRef,
    playerRootRef,
    propsRef
}: UseItemPlacementProps) => {
    const placementGhostMeshRef = useRef<any>(null);
    const placementRotationYRef = useRef<number>(0);
    const placementDistanceRef = useRef<number>(1.5 * WORLD_SCALE);
    const observerRef = useRef<any>(null);
    const placementCooldownRef = useRef<number>(0); 
    
    // 1. Input Listeners (Mouse Move, Scroll, Finalize)
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (propsRef.current.isDeploying) {
                // [CONFIG] ROTATION SPEED: 0.01 per pixel
                placementRotationYRef.current += e.movementX * 0.01; 
            }
        };
    
        const handleFinalizePlacement = () => {
            const now = performance.now();
            if (now - placementCooldownRef.current < 250) {
                return; 
            }

            if (propsRef.current.isDeploying && propsRef.current.equippedItem) {
                
                const scene = sceneRef.current;
                const camera = playerCameraRef.current;
                
                // Initialize to camera position instead of 0,0,0 to prevent glitches
                let position = camera ? camera.globalPosition.clone() : new BABYLON.Vector3(0, 0, 0);
                
                if (scene && camera) {
                    camera.computeWorldMatrix();
                    if (playerRootRef.current) playerRootRef.current.computeWorldMatrix();

                    const result = ItemPlacementService.getPlacementGhostPosition(
                        scene,
                        camera,
                        playerRootRef.current,
                        placementDistanceRef.current,
                        placementRotationYRef.current
                    );
                    
                    if (result) {
                        position.copyFrom(result.position);
                    } else {
                        const forward = camera.getDirection(BABYLON.Vector3.Forward());
                        position = camera.globalPosition.add(forward.scale(1.5 * WORLD_SCALE));
                    }
                } else if (placementGhostMeshRef.current) {
                    position.copyFrom(placementGhostMeshRef.current.getAbsolutePosition());
                }

                const rotationY = placementRotationYRef.current;

                // Dispose of the ghost mesh immediately before placing
                if (placementGhostMeshRef.current) {
                    placementGhostMeshRef.current.dispose();
                    placementGhostMeshRef.current = null;
                }

                propsRef.current.actions.placeItem({
                    itemId: propsRef.current.equippedItem.id,
                    position: { x: position.x, y: position.y, z: position.z },
                    rotation: { x: 0, y: rotationY, z: 0 },
                    isDrop: false,
                });
                
                propsRef.current.actions.updateState({ isDeploying: false });
                placementCooldownRef.current = now;
            } else {
                // Cleanup if state mismatch
                if (propsRef.current.isDeploying) {
                    propsRef.current.actions.updateState({ isDeploying: false });
                }
                if (placementGhostMeshRef.current) {
                    placementGhostMeshRef.current.dispose();
                    placementGhostMeshRef.current = null;
                }
            }
        };
        
        const handleAdjustPlacementDistance = (e: CustomEvent) => {
            const delta = e.detail.delta;
            const scrollAmount = delta > 0 ? -0.25 : 0.25;
            if (placementDistanceRef.current) {
                placementDistanceRef.current = Math.max(1.2 * WORLD_SCALE, Math.min(2.5 * WORLD_SCALE, placementDistanceRef.current + scrollAmount));
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('finalizePlacement', handleFinalizePlacement);
        window.addEventListener('adjustPlacementDistance', handleAdjustPlacementDistance as EventListener);
    
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('finalizePlacement', handleFinalizePlacement);
            window.removeEventListener('adjustPlacementDistance', handleAdjustPlacementDistance as EventListener);
        };
    }, []);

    // 2. State Change (Start/Stop Deploying)
    useEffect(() => {
        const { isDeploying, equippedItem } = propsRef.current;
        const scene = sceneRef.current;
        let isCancelled = false;
    
        if (isDeploying && equippedItem && equippedItem.modelUrl && scene) {
            placementDistanceRef.current = 1.5 * WORLD_SCALE;

            if (placementGhostMeshRef.current) {
                placementGhostMeshRef.current.dispose();
                placementGhostMeshRef.current = null;
            }

            BABYLON.SceneLoader.ImportMeshAsync(null, equippedItem.modelUrl, "", scene, null, ".glb")
                .then((result: any) => {
                    // Safety check: Did user cancel deployment while loading?
                    if (isCancelled || !propsRef.current.isDeploying) { 
                        result.meshes.forEach((m: any) => m.dispose());
                        if (result.animationGroups) result.animationGroups.forEach((ag: any) => ag.dispose());
                        return;
                    }

                    if (placementGhostMeshRef.current) {
                        placementGhostMeshRef.current.dispose();
                    }

                    const ghostMesh = result.meshes[0];
                    placementGhostMeshRef.current = ghostMesh;
                    
                    // CRITICAL: Hide initially to prevent 0,0,0 flash
                    ghostMesh.setEnabled(false);
                    
                    const hologramMaterial = new BABYLON.StandardMaterial("hologramMat", scene);
                    hologramMaterial.alpha = 0.4;
                    hologramMaterial.emissiveColor = new BABYLON.Color3(0, 1, 1);
                    hologramMaterial.disableLighting = true;
                    hologramMaterial.wireframe = true;
    
                    result.meshes.forEach((m: any) => {
                        m.isPickable = false;
                        m.checkCollisions = false; // Disable collision on ghost
                        m.metadata = { isPlacementGhost: true }; // Tag for raycast exclusion
                        m.material = hologramMaterial;
                    });

                    // Initial Rotation Sync
                    const camera = playerCameraRef.current;
                    if (camera) {
                        const forward = camera.getDirection(BABYLON.Vector3.Forward());
                        placementRotationYRef.current = Math.atan2(forward.x, forward.z) + Math.PI;
                    } else {
                        placementRotationYRef.current = 0;
                    }
                });

            if (observerRef.current) {
                scene.onBeforeRenderObservable.remove(observerRef.current);
                observerRef.current = null;
            }

            observerRef.current = scene.onBeforeRenderObservable.add(() => {
                // Ensure we only run if deploying AND we have a valid mesh
                if (propsRef.current.isDeploying && placementGhostMeshRef.current) {
                    if (placementGhostMeshRef.current.isDisposed()) {
                        placementGhostMeshRef.current = null;
                        return;
                    }

                    const ghostMesh = placementGhostMeshRef.current;
                    
                    const result = ItemPlacementService.getPlacementGhostPosition(
                        scene,
                        playerCameraRef.current,
                        playerRootRef.current,
                        placementDistanceRef.current,
                        placementRotationYRef.current
                    );

                    if (result) {
                        ghostMesh.position.copyFrom(result.position);
                        ghostMesh.rotation.y = result.rotationY;
                        
                        // NOW we can show it, since it's in the right place
                        if (!ghostMesh.isEnabled()) {
                            ghostMesh.setEnabled(true);
                        }
                    }
                }
            });

        } else {
            // Cleanup state
            if (placementGhostMeshRef.current) {
                placementGhostMeshRef.current.dispose();
                placementGhostMeshRef.current = null;
            }
            if (observerRef.current && scene) {
                scene.onBeforeRenderObservable.remove(observerRef.current);
                observerRef.current = null;
            }
        }
        
        return () => {
            isCancelled = true;
            if (observerRef.current && scene) {
                scene.onBeforeRenderObservable.remove(observerRef.current);
                observerRef.current = null;
            }
            if (placementGhostMeshRef.current) {
                placementGhostMeshRef.current.dispose();
                placementGhostMeshRef.current = null;
            }
        };
    
    }, [propsRef.current.isDeploying, propsRef.current.equippedItem]);
};
