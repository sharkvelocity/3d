
import { ItemId, AppActions, PlacedItem, MansionLayout, InteractableObjectType } from '../../types';
import { WORLD_SCALE, COLLISION_GROUPS } from '../../constants';
import SoundManager from '../../services/SoundManager';
import { SummoningCircleHandler } from '../cursed_items/SummoningCircleHandler';

declare const BABYLON: any;

interface InteractionHandlerProps {
    scene: any;
    playerCamera: any;
    playerRoot: any;
    actions: AppActions;
    soundManager: SoundManager;
    placedItems: PlacedItem[];
    equippedItem: any;
    doorPivots: Map<number, any>;
    doorStates: Map<number, any>;
    houseLayout: MansionLayout;
    houseContainer: any;
    isCrouching: boolean;
}

export class InteractionHandler {
    private lastDoorInteractionTime = 0;
    private lastGenericInteractionTime = 0;
    
    private summoningCircleHandler: SummoningCircleHandler | null = null;

    /**
     * Shared static method for determining the current interaction target.
     * Uses the "Chest Ray" logic from the stable build to prevent clipping issues.
     */
    public static getInteractionPick(scene: any, playerCamera: any, playerRoot: any): any | null {
        if (!playerRoot || !playerCamera || !scene) return null;

        // [FIX] Use Player Root (Chest/Neck) as origin instead of Camera (Eyes)
        // This prevents the ray from clipping into the door header/frame when standing nose-to-nose.
        const forward = playerCamera.getForwardRay(1).direction;
        const startPoint = playerRoot.position.clone();
        startPoint.y += 1.2; // Chest height (approx)
        
        // [FIX] Increase reach slightly to help with deep foyers or tricky doors
        const MAX_INTERACTION_DISTANCE = 4.0 * WORLD_SCALE;
        const ray = new BABYLON.Ray(startPoint, forward, MAX_INTERACTION_DISTANCE);
        
        const picks = scene.multiPickWithRay(ray, (mesh: any) => {
            // Ignore player parts
            if (mesh === playerRoot || mesh.isDescendantOf(playerRoot)) return false;
            if (mesh.name.toLowerCase().includes("player")) return false;

            // Must be pickable (Invisible hitboxes will have isPickable=true, visibility=0)
            // [FIX] ALLOW walls/occluders to be picked so we can check distance, even if we don't interact with them
            const isOccluder = (mesh.checkCollisions && mesh.collisionGroup === COLLISION_GROUPS.WALLS) || 
                               (mesh.name && (mesh.name.includes("wall") || mesh.name.includes("floor") || mesh.name.includes("foundation")));
            
            if (isOccluder) return true;

            if (!mesh.isPickable) return false;

            // Must have type metadata
            const t = mesh.metadata?.type;
            const validTypes = [
                'pickup', 
                'door', 
                'light_switch', 
                'breaker_box', 
                'phonograph', 
                'motion_sensor', 
                'secret_start', 
                'summoning_circle',
                'secret_upgrade',
                InteractableObjectType.Radio,
                InteractableObjectType.TVRemote
            ];
            
            return validTypes.includes(t);
        });
        
        // Sort by distance
        if (picks && picks.length > 0) {
            return InteractionHandler.getPrioritizedPick(picks);
        }
        
        return null;
    }

    /**
     * Prioritization Logic (Reverted to simpler 'Stable' version)
     */
    private static getPrioritizedPick(picks: any[] | null): any | null {
        if (!picks || picks.length === 0) {
            return null;
        }

        // 1. Sort by distance first
        const sortedPicks = picks.sort((a, b) => a.distance - b.distance);

        // [FIX] OCCLUSION CHECK
        // If the closest object is a Wall/Occluder, stop immediately.
        // We cannot interact through walls.
        
        const closest = sortedPicks[0];
        if (closest.pickedMesh) {
            const m = closest.pickedMesh;
            const isOccluder = (m.collisionGroup === COLLISION_GROUPS.WALLS) || 
                               (m.name && (m.name.includes("wall") || m.name.includes("floor") || m.name.includes("foundation")));
            
            // Allow doors to be "occluders" only if we aren't targeting them (but doors are interactable, so usually fine)
            if (isOccluder && !m.metadata?.type) {
                return null; // Blocked by wall
            }
        }

        // 2. Check for priority items (Doors, Switches) in the list
        // Note: Because we sorted by distance and checked occlusion above, we look for the first valid interactable
        // that isn't blocked. But effectively, since we return null if index 0 is a wall, we just check index 0.
        // However, invisible hitboxes might overlap visual meshes.
        
        for (const pick of sortedPicks) {
            const mesh = pick.pickedMesh;
            if (!mesh) continue;
            
            // If we hit a wall, stop looking further
            const isOccluder = (mesh.collisionGroup === COLLISION_GROUPS.WALLS) || 
                               (mesh.name && (mesh.name.includes("wall") || mesh.name.includes("floor") || mesh.name.includes("foundation")));
            if (isOccluder && !mesh.metadata?.type) return null;

            if (mesh.metadata?.type) {
                return pick; // Found valid target
            }
        }

        return null;
    }

    public handleInteraction(props: InteractionHandlerProps): boolean {
        const { scene, playerCamera, playerRoot, actions, soundManager, placedItems, equippedItem, isCrouching } = props;

        // Use the shared static picker logic
        const pickInfo = InteractionHandler.getInteractionPick(scene, playerCamera, playerRoot);

        if (pickInfo && pickInfo.hit && pickInfo.pickedMesh) {
            const metadata = pickInfo.pickedMesh.metadata;
            const now = performance.now();

            // --- DOOR ---
            if (metadata.type === 'door') {
                if (now - this.lastDoorInteractionTime > 200) { 
                    this.lastDoorInteractionTime = now;
                    // Pass the exact picked point to help with directional opening if needed
                    this.handleDoor(metadata.id, props, pickInfo.pickedPoint);
                }
                return true;
            } 
            
            // --- LIGHT SWITCH ---
            else if (metadata.type === 'light_switch') {
                if (now - this.lastGenericInteractionTime > 200) {
                    this.lastGenericInteractionTime = now;
                    soundManager?.playLightSwitch(pickInfo.pickedMesh.getAbsolutePosition());
                    actions.toggleLight(metadata.roomId);
                }
                return true;
            } 
            
            // --- BREAKER BOX ---
            else if (metadata.type === 'breaker_box') {
                if (now - this.lastGenericInteractionTime > 200) {
                    this.lastGenericInteractionTime = now;
                    soundManager?.playCircuitBreaker(pickInfo.pickedMesh.getAbsolutePosition());
                    actions.toggleBreaker();
                }
                return true;
            } 
            
            // --- PHONOGRAPH ---
            else if (metadata.type === 'phonograph') {
                if (now - this.lastGenericInteractionTime > 200) {
                    this.lastGenericInteractionTime = now;
                    actions.playerInteractPhonograph();
                }
                return true;
            } 
            
            // --- SECRET WEAPON ---
            else if (metadata.type === 'secret_start') {
                actions.triggerSecretRound();
                return true;
            } 
            
            // --- SECRET UPGRADE ---
            else if (metadata.type === 'secret_upgrade') {
                if (metadata.upgradeType) {
                    actions.purchaseUpgrade(metadata.upgradeType);
                    soundManager?.playEmfBeep(5); // Confirmation sound
                }
                return true;
            }

            // --- SUMMONING CIRCLE ---
            else if (metadata.type === 'summoning_circle') {
                if (!this.summoningCircleHandler) {
                    let root = pickInfo.pickedMesh;
                    while (root.parent && root.parent.metadata?.type === 'summoning_circle') {
                        root = root.parent;
                    }
                    this.summoningCircleHandler = new SummoningCircleHandler(scene, actions, soundManager, root);
                }
                this.summoningCircleHandler.activate();
                return true;
            }
            
            // --- RADIO ---
            else if (metadata.type === InteractableObjectType.Radio) {
                if (now - this.lastGenericInteractionTime > 200) {
                    this.lastGenericInteractionTime = now;
                    this.handleRadio(pickInfo.pickedMesh, soundManager, actions);
                }
                return true;
            }

            // --- MOTION SENSOR ---
            else if (metadata.type === 'motion_sensor') {
                if (isCrouching) {
                    actions.pickUpItem(metadata.instanceId);
                    return true;
                } else {
                    const item = placedItems.find(p => p.instanceId === metadata.instanceId);
                    if (item) {
                        actions.updatePlacedItem({ ...item, isOn: !item.isOn });
                        soundManager?.playMotionSensorBeep(pickInfo.pickedMesh.getAbsolutePosition());
                        return true;
                    }
                }
            } 
            
            // --- GENERAL ITEM PICKUP ---
            else if (metadata.type === 'pickup') {
                const itemData = placedItems.find((p: any) => p.instanceId === metadata.instanceId);
                if (itemData) {
                    if (itemData.id === ItemId.Tripod && equippedItem?.id === ItemId.VideoCamera) {
                        actions.mountCamera(metadata.instanceId);
                    } else if (itemData.isMountedOnTripod) {
                        actions.detachCamera(metadata.instanceId);
                    } else {
                        // Toggleable Items Logic
                        const toggleableItems = [
                            ItemId.Flashlight, ItemId.UVLight, ItemId.EMFReader, 
                            ItemId.SpiritBox, ItemId.VideoCamera, ItemId.DOTSProjector, 
                            ItemId.Lantern
                        ];

                        if (toggleableItems.includes(itemData.id)) {
                            if (isCrouching) {
                                if (itemData.id === ItemId.Bone) soundManager?.playBonePickup();
                                actions.pickUpItem(metadata.instanceId);
                            } else {
                                actions.updatePlacedItem({ ...itemData, isOn: !itemData.isOn });
                                soundManager?.playLightSwitch(pickInfo.pickedMesh.getAbsolutePosition());
                            }
                        } else {
                            if (itemData.id === ItemId.Bone) {
                                soundManager?.playBonePickup();
                            }
                            actions.pickUpItem(metadata.instanceId);
                        }
                    }
                    return true;
                }
            }
        }

        return false;
    }

    private handleDoor(doorId: number, props: InteractionHandlerProps, hitPoint?: any) {
        const { doorPivots, doorStates, houseLayout, houseContainer, soundManager, playerRoot } = props;
        
        const doorData = doorPivots.get(doorId);
        const doorState = doorStates.get(doorId);
        const doorDef = houseLayout?.doors[doorId];
       if (doorData && doorState && doorDef) {
            const doorPosition = hitPoint ? hitPoint : new BABYLON.Vector3(doorDef.x, 1, doorDef.z);

            // Locked Check
            if (doorState.isLocked) {
                soundManager?.playDoorLock(doorPosition);
                return;
            }

            // [FIX] Updated PreAnimated Logic to use speedRatio for reversal and prevent looping
            if (doorState.isPreAnimated) {
                const { leftAnim, rightAnim } = doorData;
                
                if (!leftAnim || !rightAnim) {
                    doorState.isOpen = !doorState.isOpen;
                    soundManager?.playDoorCreak(doorPosition);
                    return;
                }

                try {
                    // Always stop first to prevent state conflicts
                    leftAnim.stop();
                    rightAnim.stop();
                    
                    // Force Loop False to prevent "opens on its own on a loop" bug
                    const loop = false;
                    
                    if (doorState.isOpen) {
                        // CLOSE: Play backwards (Speed = -1.0)
                        // Note: from/to are undefined on groups usually, so they play full range. 
                        // With negative speed, it plays from End to Start.
                        leftAnim.start(loop, -1.0, leftAnim.from, leftAnim.to, false);
                        rightAnim.start(loop, -1.0, rightAnim.to, rightAnim.from, false);
                        doorState.isOpen = false;
                    } else {
                        // OPEN: Play forwards (Speed = 1.0)
                        leftAnim.start(loop, 1.0, leftAnim.from, leftAnim.to, false);
                        rightAnim.start(loop, 1.0, rightAnim.from, rightAnim.to, false);
                        doorState.isOpen = true;
                    }
                } catch (e) {
                    console.warn("Animation error", e);
                    doorState.isOpen = !doorState.isOpen;
                }
            } 
            else {
                const doorPivot = doorData;
                let targetAngle = 0;

                if (!doorState.isOpen) {
                    const invMatrix = houseContainer.getWorldMatrix().clone().invert();
                    const localPlayerPos = BABYLON.Vector3.TransformCoordinates(playerRoot.position, invMatrix);

                    if (doorDef.isVertical) {
                        targetAngle = (localPlayerPos.x > doorDef.x) ? -Math.PI / 2 : Math.PI / 2;
                    } else {
                        targetAngle = (localPlayerPos.z > doorDef.z) ? Math.PI / 2 : -Math.PI / 2;
                    }
                    
                    if (doorDef.flipHinge) {
                         targetAngle *= -1;
                    }
                }

                BABYLON.Animation.CreateAndStartAnimation(
                    `door_anim_${doorId}`, 
                    doorPivot, 
                    'rotation.y', 
                    60, 
                    15, 
                    doorPivot.rotation.y, 
                    targetAngle, 
                    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
                );
                
                doorState.isOpen = !doorState.isOpen;
            }

            soundManager?.playDoorCreak(doorPosition);
        }
    }

    private handleRadio(mesh: any, soundManager: SoundManager, actions: AppActions) {
        soundManager?.playRadioSound(mesh.getAbsolutePosition());
        actions.triggerEmfEvent({ position: mesh.getAbsolutePosition(), level: 2 });
    }
    
    public dispose() {
        if (this.summoningCircleHandler) {
            this.summoningCircleHandler.dispose();
        }
    }
}
