
import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, Room, Coordinates, NavNode, EvidenceType, ItemId, Weather, InteractableObjectType, PlacedItem } from '../../types';
import { WORLD_SCALE, GHOST_AI, TRUCK_ROOM_ID, COLLISION_GROUPS } from '../../constants';
import { PlayerController } from '../systems/PlayerController';
import { GhostController, GhostContext } from '../systems/GhostController';
import { findPathBFS } from '@/utils/pathfinding';
import { checkTruckRoom } from '@/utils/spatialUtils';
import { useSecretGameLoop } from './useSecretGameLoop'; 

declare const BABYLON: any;

export const useGameLoop = (
    sceneRef: React.RefObject<any>,
    playerRootRef: React.RefObject<any>,
    playerCameraRef: React.RefObject<any>,
    isCrouchingRef: React.RefObject<boolean>,
    inputMapRef: React.RefObject<Map<string, boolean>>,
    componentProps: any,
    propsRef: React.RefObject<any>,
    soundManagerRef: React.RefObject<any>,
    currentRoomIdRef: React.RefObject<number | null>,
    lightingStateRef: React.RefObject<any>,
    adjustSceneLighting: (isInside: boolean) => void,
    ghostMeshRef: React.RefObject<any>,
    ghostWanderTargetRef: React.RefObject<any>,
    ghostHasLoSRef: React.RefObject<boolean>,
    lastKnownPlayerPositionRef: React.RefObject<any>,
    ghostSpeedRef: React.RefObject<number>,
    hantuBreathSystemRef: React.RefObject<any>,
    roomLightsRef: React.RefObject<Map<number, any>>,
    lightSwitchesRef: React.RefObject<Map<number, any>>,
    houseContainerRef: React.RefObject<any>,
    houseLayoutRef: React.RefObject<any>,
    lastPositionUpdateTimeRef: React.RefObject<number>,
    onPlayerPositionUpdate: (coords: Coordinates) => void,
    lastRoomCheckTimeRef: React.RefObject<number>,
    playerBreathSystemRef: React.RefObject<any>,
    nextPuffTimeRef: React.RefObject<number>,
    rainParticleSystemRef: React.RefObject<any>,
    snowParticleSystemRef: React.RefObject<any>,
    onPlayerStatusUpdate: (status: any) => void,
    lastInteractableCheckTimeRef: React.RefObject<number>,
    onInteractableFocusChange: (focus: any) => void,
    cloudLayerRef: React.RefObject<any>,
    roomGraphRef: React.RefObject<any>,
    doorStatesRef: React.RefObject<Map<any, any>>,
    ghostPathRef: React.RefObject<any[]>,
    lastWanderTargetRef: React.RefObject<any>,
    lastGhostFootstepTime: React.MutableRefObject<number>,
    updateGhostVisuals: (mesh: any, alpha: number, isDotsMode?: boolean) => void,
    flickerTimerRef: React.RefObject<number>,
    isGhostVisibleDuringHuntRef: React.RefObject<boolean>,
    lastLosCheckTimeRef: React.RefObject<number>,
    losDurationRef: React.RefObject<number>,
    obakeShapeshiftModelsRef: React.RefObject<any[]>,
    activeShapeshiftModelRef: React.RefObject<any>,
    isShapeshiftedRef: React.RefObject<boolean>,
    stuckTimerRef: React.RefObject<number>,
    lastGhostPositionRef: React.RefObject<any>,
    placedMeshesRef: React.RefObject<Map<number, any>>,
    uvEvidenceMeshesRef: React.RefObject<any[]>,
    activeGhostEventRef: React.RefObject<boolean>,
    onGhostEventCollision: (playAudio?: boolean) => void,
    mistFormMeshRef: React.RefObject<any>,
    activeGhostEventTypeRef: React.RefObject<string | null>,
    mistPathRef: React.RefObject<NavNode[]>,
    dotsProjectorsRef: React.MutableRefObject<Map<any, any>>,
    truckBoundsRef: React.MutableRefObject<any>,
    materialsRef: React.MutableRefObject<any[]>,
    dotsManifestTimerRef: React.MutableRefObject<number>,
    ghostOrbMeshesRef: React.MutableRefObject<any[]>, 
    ghostOrbSystemRef: React.MutableRefObject<any>, 
    ghostOrbEmitterRef: React.MutableRefObject<any>, 
    ghostIdleMeshRef: React.MutableRefObject<any>,
    voiceAnalyserRef: React.MutableRefObject<AnalyserNode | null>,
    secretEnemiesRef: React.MutableRefObject<any[]>,
    secretSpawnPointsRef: React.MutableRefObject<any[]>,
    isInitialized: boolean,
    viewModelCacheRef: React.MutableRefObject<Map<string, any>>
) => {
    const lastLightStatesRef = useRef<{ [roomId: number]: boolean }>({});
    const wasHuntingRef = useRef(false);
    const onryoBlowoutTimestamps = useRef<number[]>([]);
    const lastFlameInteractionCheckRef = useRef(0);
    const lastGlobalFireBlowoutTimeRef = useRef(0);
    const ghostIdleTimerRef = useRef(0); 
    const huntGracePeriodTimerRef = useRef(0);
    const lastPlayerStatusUpdateRef = useRef(0);
    
    const prevIsBreakerOnRef = useRef<boolean>(false);
    const prevIsHuntingRef = useRef<boolean>(false);
    const prevLightStatesRef = useRef<{ [roomId: number]: boolean }>({});
    const prevDisabledLightsRef = useRef<Set<number>>(new Set());
    
    const wasRevealedByDotsRef = useRef(false);
    const lastDotsCheckRef = useRef(0);

    const mistStuckTimerRef = useRef(0);
    const lastMistPositionRef = useRef<any>(null);
    const lastVoiceCheckTimeRef = useRef(0);

    const colorBlack = useRef(new BABYLON.Color3(0, 0, 0));
    const colorOn = useRef(new BABYLON.Color3(1.0, 1.0, 1.0)); 
    
    const playerControllerRef = useRef<PlayerController>(new PlayerController());
    const ghostControllerRef = useRef<GhostController>(new GhostController());

    // [FIX] DEATH ANIMATION REFS
    const isDyingRef = useRef(false);
    const deathMessageRef = useRef("");
    const deathRollTargetRef = useRef(0);

    const handlePlayerDeath = useCallback((message: string) => {
        if (isDyingRef.current) return;
        isDyingRef.current = true;
        deathMessageRef.current = message;
        deathRollTargetRef.current = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2.5);
    }, []);

    const { runSecretLoop } = useSecretGameLoop(
        sceneRef,
        playerRootRef,
        playerCameraRef,
        inputMapRef,
        propsRef,
        soundManagerRef,
        houseLayoutRef,
        secretEnemiesRef,
        secretSpawnPointsRef,
        obakeShapeshiftModelsRef,
        playerControllerRef,
        viewModelCacheRef,
        handlePlayerDeath
    );

    const findRoomAt = useCallback((worldPos: any): Room | null => {
        const truckRoom = checkTruckRoom(worldPos, truckBoundsRef.current);
        if (truckRoom) return truckRoom;

        const houseContainer = houseContainerRef.current;
        const houseLayout = houseLayoutRef.current;
        if (!houseContainer || !houseLayout || !worldPos) return null;
        if (typeof worldPos.x === 'undefined' || typeof worldPos.y === 'undefined' || typeof worldPos.z === 'undefined') return null;

        const invMatrix = houseContainer.getWorldMatrix().clone().invert();
        const localPos = BABYLON.Vector3.TransformCoordinates(worldPos, invMatrix);
        if (!localPos) return null;

        return houseLayout.rooms.find((r: Room) =>
            r &&
            localPos.x >= r.x && localPos.x < r.x + r.width &&
            localPos.z >= r.z && localPos.z < r.z + r.depth
        ) || null;
    }, [houseContainerRef, houseLayoutRef]);

    useEffect(() => {
        const { ghostPath } = componentProps;
        if (ghostPath && ghostPath.length > 0 && houseContainerRef.current) {
            const nextWaypointNode = ghostPath[0]; 
            const localTargetPos = new BABYLON.Vector3(
                nextWaypointNode.position.x,
                nextWaypointNode.position.y,
                nextWaypointNode.position.z
            );
            ghostWanderTargetRef.current = BABYLON.Vector3.TransformCoordinates(localTargetPos, houseContainerRef.current.getWorldMatrix());
        } else {
            ghostWanderTargetRef.current = null;
        }
    }, [componentProps.ghostPath]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const gameLoop = () => {
            if (!scene || scene.isDisposed) return;
            try {
                const currentProps = propsRef.current;
                
                // --- DEATH ANIMATION LOOP ---
                if (isDyingRef.current) {
                    const camera = playerCameraRef.current;
                    if (camera) {
                        const dt = scene.getEngine().getDeltaTime() / 1000;
                        // Fall to floor
                        camera.position.y = BABYLON.Scalar.Lerp(camera.position.y, 0.2, 4.0 * dt);
                        // Roll view sideways
                        camera.rotation.z = BABYLON.Scalar.Lerp(camera.rotation.z, deathRollTargetRef.current, 2.0 * dt);
                        
                        // Check if animation is done (hit floor)
                        if (camera.position.y < 0.3) {
                             currentProps.actions.gameOver(deathMessageRef.current);
                        }
                    }
                    return; // Skip normal game logic while dying
                }

                const { 
                    selectedGhost, 
                    placedItems, 
                    equippedItem, 
                    isLighterOn, 
                    playerStatus,
                    activeEmfEvents,
                    playerCoordinates,
                    ghostWorldCoordinates,
                    emfLevel,
                    isBreakerOn,
                    lightStates,
                    disabledLights
                } = currentProps;
                
                const { updateState, startHunt } = currentProps.actions;
                
                if (currentProps.gameState !== GameState.Playing || currentProps.isPaused) return;
                const rig = playerRootRef.current;
                const camera = playerCameraRef.current;
                
                if (!rig || !camera || !scene) return;

                const now = performance.now();
                const deltaTimeSeconds = scene.getEngine().getDeltaTime() / 1000.0;

                // --- SECRET MODE LOGIC ---
                if (currentProps.isSecretMode) {
                    runSecretLoop(deltaTimeSeconds, now);
                    return; 
                }

                if (currentProps.isDevMode) {
                    const roof = scene.getMeshByName("roof");
                    if (roof) {
                        const shouldBeHidden = currentProps.devRoofHidden;
                        if (roof.isEnabled() === shouldBeHidden) {
                            roof.setEnabled(!shouldBeHidden);
                        }
                    }
                }

                // --- ROOM CHECK & AMBIENCE ---
                if (now - lastRoomCheckTimeRef.current > 500) {
                    lastRoomCheckTimeRef.current = now;
                    const currentRoom = findRoomAt(rig.position);
                    const newRoomId = currentRoom ? currentRoom.id : null;
                    
                    if (currentRoomIdRef.current !== newRoomId) {
                        const oldId = currentRoomIdRef.current;
                        currentRoomIdRef.current = newRoomId;
                        propsRef.current.onRoomChange(newRoomId);
                        
                        const isInside = newRoomId !== null && newRoomId !== TRUCK_ROOM_ID;
                        
                        if (lightingStateRef.current.isInside !== isInside) {
                            lightingStateRef.current.isInside = isInside;
                            adjustSceneLighting(isInside);
                            if (soundManagerRef.current) {
                                soundManagerRef.current.update(isInside);
                            }

                            // WEATHER HANDLING (Instantly dispose/create based on location)
                            if (isInside) {
                                // STOP/DISPOSE WEATHER
                                if (rainParticleSystemRef.current) {
                                    rainParticleSystemRef.current.systems.forEach((sys: any) => {
                                        sys.stop();
                                        sys.reset(); // Instant visual clear
                                    });
                                }
                                if (snowParticleSystemRef.current) {
                                    snowParticleSystemRef.current.stop();
                                    snowParticleSystemRef.current.reset(); // Instant visual clear
                                }
                            } else {
                                // REAPPLY WEATHER
                                if (rainParticleSystemRef.current) {
                                    rainParticleSystemRef.current.systems.forEach((sys: any) => sys.start());
                                }
                                if (snowParticleSystemRef.current) {
                                    snowParticleSystemRef.current.start();
                                }
                            }
                        }
                    }
                    
                    // Update Emitter Positions (Only if outside to save perf)
                    if (!lightingStateRef.current.isInside) {
                        if (rainParticleSystemRef.current && rainParticleSystemRef.current.emitter) {
                            rainParticleSystemRef.current.emitter.position.x = rig.position.x;
                            rainParticleSystemRef.current.emitter.position.z = rig.position.z;
                        }
                        if (snowParticleSystemRef.current) {
                            const emitBoxSize = 20; 
                            snowParticleSystemRef.current.minEmitBox = new BABYLON.Vector3(rig.position.x - emitBoxSize, 10, rig.position.z - emitBoxSize);
                            snowParticleSystemRef.current.maxEmitBox = new BABYLON.Vector3(rig.position.x + emitBoxSize, 10, rig.position.z + emitBoxSize);
                        }
                    }
                }

                // --- PLAYER STATUS CALCULATION (Sanity Drain Triggers) ---
                if (now - lastPlayerStatusUpdateRef.current > 1000) {
                    lastPlayerStatusUpdateRef.current = now;
                    
                    const ghostPos = ghostMeshRef.current ? ghostMeshRef.current.position : null;
                    const playerPos = rig.position;
                    
                    // 1. Ghost Proximity Check
                    const isNearGhost = ghostPos ? BABYLON.Vector3.Distance(playerPos, ghostPos) < 3.0 : false;
                    
                    // 2. Darkness Check
                    // Default to DARK (true) unless proven otherwise
                    let isInDark = true;
                    
                    const currentRoomId = currentRoomIdRef.current;
                    
                    // Truck is always safe/lit
                    if (currentRoomId === TRUCK_ROOM_ID) {
                        isInDark = false;
                    } 
                    // Outside (Null Room) - Assume dimly lit by moon, but still "dark" for gameplay mechanics unless flashlight used
                    else {
                        // Check if current room has lights ON
                        if (currentRoomId !== null && lightStates[currentRoomId]) {
                            isInDark = false;
                        }
                        
                        // Check held light sources
                        if (currentProps.isFlashlightOn || currentProps.isLighterOn || currentProps.isHeadlampOn) {
                            isInDark = false;
                        }
                        
                        // Check held Lantern
                        if (equippedItem?.id === ItemId.Lantern && equippedItem.isOn) {
                            isInDark = false;
                        }
                        
                        // Check placed Lanterns nearby
                        // We check if any active lantern is within 8 meters
                        if (isInDark && placedItems.length > 0) {
                            const nearbyLantern = placedItems.find((p: any) => 
                                p.id === ItemId.Lantern && 
                                p.isOn && 
                                BABYLON.Vector3.Distance(playerPos, new BABYLON.Vector3(p.position.x, p.position.y, p.position.z)) < 8.0 
                            );
                            if (nearbyLantern) isInDark = false;
                        }
                    }
                    
                    // Only update store if status changed to prevent render thrashing
                    if (playerStatus.isNearGhost !== isNearGhost || playerStatus.isInDark !== isInDark) {
                        onPlayerStatusUpdate({ isNearGhost, isInDark });
                    }
                }

                // --- VOICE LOGIC ---
                const isVoiceActive = currentProps.isPushToTalkActive || (currentProps.isPushToTalkEnabled === false);
                
                if (voiceAnalyserRef.current && isVoiceActive && now - lastVoiceCheckTimeRef.current > 200) {
                    lastVoiceCheckTimeRef.current = now;
                    const analyser = voiceAnalyserRef.current;
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);
                    
                    let sum = 0;
                    for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
                    const avgVolume = sum / dataArray.length;
                    
                    const VOICE_THRESHOLD = 10; 
                    
                    if (avgVolume > VOICE_THRESHOLD && ghostMeshRef.current) {
                        const ghostPos = ghostMeshRef.current.position;
                        const playerPos = rig.position;
                        const distance = BABYLON.Vector3.Distance(ghostPos, playerPos);
                        const GHOST_NAME = currentProps.selectedGhost?.name;
                        
                        if (distance < 10 * WORLD_SCALE) {
                            if (currentProps.isHunting) {
                                if (GHOST_NAME !== 'Yokai') {
                                    lastKnownPlayerPositionRef.current = playerPos.clone();
                                    ghostHasLoSRef.current = true; 
                                }
                            } else {
                                if (!activeGhostEventRef.current) {
                                    // [FIX] Yokai distance updated to 2.5m (approx 3 * 0.83, or just strict 2.5)
                                    // Using 2.5 * WORLD_SCALE as requested
                                    if (GHOST_NAME === 'Yokai' && distance < 2.5 * WORLD_SCALE && currentProps.sanity <= 80 && Math.random() < 0.2) {
                                        propsRef.current.actions.attemptHunt();
                                    } else if (Math.random() < 0.6) {
                                        soundManagerRef.current?.playGhostHiss(ghostPos);
                                        propsRef.current.actions.triggerEmfEvent({ position: ghostPos, level: 2 });
                                    }
                                }
                            }
                        }
                    }
                }

                const isHunting = propsRef.current.isHunting;
                const isEvent = activeGhostEventRef.current;
                const isMoving = !!ghostWanderTargetRef.current || isHunting || isEvent;
                const showIdle = !isMoving && ghostIdleTimerRef.current > 0 && !!ghostIdleMeshRef.current;
                
                let visualMesh = ghostMeshRef.current;
                if (showIdle && ghostIdleMeshRef.current) {
                    visualMesh = ghostIdleMeshRef.current;
                }

                if (ghostIdleMeshRef.current && ghostMeshRef.current) {
                    ghostIdleMeshRef.current.position.copyFrom(ghostMeshRef.current.position);
                    if (!showIdle) {
                        if (ghostMeshRef.current.rotationQuaternion) {
                            if (!ghostIdleMeshRef.current.rotationQuaternion) ghostIdleMeshRef.current.rotationQuaternion = new BABYLON.Quaternion();
                            ghostIdleMeshRef.current.rotationQuaternion.copyFrom(ghostMeshRef.current.rotationQuaternion);
                        } else {
                            ghostIdleMeshRef.current.rotation.copyFrom(ghostMeshRef.current.rotation);
                        }
                    }
                }

                if (!isEvent && !isShapeshiftedRef.current) {
                    if (visualMesh && !visualMesh.isEnabled()) visualMesh.setEnabled(true);
                    const otherMesh = showIdle ? ghostMeshRef.current : ghostIdleMeshRef.current;
                    if (otherMesh && otherMesh.isEnabled()) otherMesh.setEnabled(false);
                }

                if (ghostOrbMeshesRef.current && ghostOrbMeshesRef.current.length > 0) {
                    const { selectedGhost, ghostFavoriteRoomId, isDevMode } = propsRef.current;
                    const isValidGhost = selectedGhost?.evidence.includes(EvidenceType.GhostOrb) || selectedGhost?.name === 'The Mimic';
                    const shouldShowOrbs = isValidGhost || isDevMode;

                    let orbTargetPos = null;
                    let roomDims = { width: 3, depth: 3 }; 

                    if (ghostFavoriteRoomId !== null && houseLayoutRef.current) {
                        const room = houseLayoutRef.current.rooms.find((r: Room) => r.id === ghostFavoriteRoomId);
                        if (room && houseContainerRef.current) {
                            const localCenter = new BABYLON.Vector3(room.x + room.width / 2, 1.5, room.z + room.depth / 2);
                            orbTargetPos = BABYLON.Vector3.TransformCoordinates(localCenter, houseContainerRef.current.getWorldMatrix());
                            roomDims.width = room.width;
                            roomDims.depth = room.depth;
                        }
                    }

                    const safeWidth = roomDims.width * 0.8;
                    const safeDepth = roomDims.depth * 0.8;

                    ghostOrbMeshesRef.current.forEach((orb, index) => {
                        if (shouldShowOrbs && orbTargetPos) {
                            if (!orb.isVisible) orb.isVisible = true;
                            const meta = orb.metadata;
                            if (meta) {
                                orb.position.x = orbTargetPos.x + Math.sin(now * meta.xSpeed + meta.xOffset) * (safeWidth / 2);
                                orb.position.z = orbTargetPos.z + Math.cos(now * meta.zSpeed + meta.zOffset) * (safeDepth / 2);
                                orb.position.y = orbTargetPos.y + Math.sin(now * meta.ySpeed + meta.yOffset) * 0.5;
                                if (orb.material) orb.material.alpha = 0.6;
                            }
                        } else {
                            if (orb.isVisible) orb.isVisible = false;
                        }
                    });
                }

                if (playerControllerRef.current) {
                    const { isSprinting, shouldPlayFootstep } = playerControllerRef.current.update({
                        rig, camera, scene, 
                        inputMap: inputMapRef.current!, 
                        isCrouching: isCrouchingRef.current || false,
                        isSprintingState: currentProps.isSprinting, stamina: currentProps.stamina,
                        touchControlsEnabled: currentProps.touchControlsEnabled, 
                        touchState: currentProps.touchState, 
                        touchSensitivity: currentProps.touchSensitivity,
                        deltaTime: deltaTimeSeconds,
                        isFlying: currentProps.devFlyMode
                    });

                    if (isSprinting !== currentProps.isSprinting) {
                        currentProps.actions.updateState({ isSprinting });
                    }

                    if (shouldPlayFootstep) {
                        soundManagerRef.current?.playFootstep(currentRoomIdRef.current !== null);
                    }
                }
                
                const stateChanged = 
                    currentProps.isHunting !== prevIsHuntingRef.current ||
                    isBreakerOn !== prevIsBreakerOnRef.current ||
                    lightStates !== prevLightStatesRef.current ||
                    disabledLights !== prevDisabledLightsRef.current;

                if (currentProps.isHunting || stateChanged) {
                    roomLightsRef.current.forEach((roomLightData, roomId) => {
                        const light = roomLightData?.light;
                        const fixtureMaterial = roomLightData?.fixtureMaterial;
                        if (!light || !fixtureMaterial) return;
                        
                        if (disabledLights.has(roomId)) {
                            if (light.isEnabled()) light.setEnabled(false);
                            if (!fixtureMaterial.emissiveColor.equals(colorBlack.current)) fixtureMaterial.emissiveColor = colorBlack.current;
                            return;
                        }
                        
                        const isSwitchOn = lightStates[roomId] === true;
                        const shouldBeOn = isBreakerOn && isSwitchOn && !currentProps.isHunting; 
                        
                        if (light.isEnabled() !== shouldBeOn) light.setEnabled(shouldBeOn);
                        const targetEmissive = shouldBeOn ? colorOn.current : colorBlack.current;
                        if (!fixtureMaterial.emissiveColor.equals(targetEmissive)) fixtureMaterial.emissiveColor = targetEmissive;
                    });
                }
                prevIsHuntingRef.current = currentProps.isHunting;
                prevIsBreakerOnRef.current = isBreakerOn;
                prevLightStatesRef.current = lightStates;
                prevDisabledLightsRef.current = disabledLights;

                if (!propsRef.current.isHunting) {
                    const lightSwitches = lightSwitchesRef.current;
                    if (lightSwitches) {
                        for (const [roomId, switchData] of lightSwitches.entries()) {
                            const animation = switchData?.animation;
                            if (!animation) continue;

                            const currentState = !!lightStates[roomId];
                            const lastState = !!lastLightStatesRef.current[roomId];

                            if (currentState !== lastState) {
                                animation.stop();
                                if (currentState) animation.start(false, 1.0, animation.from, animation.to);
                                else animation.start(false, 1.0, animation.to, animation.from);
                            }
                        }
                    }
                }
                lastLightStatesRef.current = { ...lightStates };
                
                if (now - lastFlameInteractionCheckRef.current > 1000) {
                    if (ghostMeshRef.current && !propsRef.current.isHunting) {
                        const EXTINGUISH_RANGE = 2.5 * WORLD_SCALE;
                        const ghostPos = ghostMeshRef.current.position;
                        const isOnryo = selectedGhost?.name === 'Onryo';
                        const isStandard = !isOnryo;
                        
                        const validTargets: { type: 'lantern' | 'lighter', item: any }[] = [];

                        for (const item of placedItems) {
                            if (item.id === ItemId.Lantern && item.isOn) {
                                const itemPos = new BABYLON.Vector3(item.position.x, item.position.y, item.position.z);
                                if (BABYLON.Vector3.Distance(ghostPos, itemPos) < EXTINGUISH_RANGE) {
                                    validTargets.push({ type: 'lantern', item });
                                }
                            }
                        }

                        if (isLighterOn && equippedItem?.id === ItemId.Lighter && rig) {
                            const playerPos = rig.position;
                            if (BABYLON.Vector3.Distance(ghostPos, playerPos) < EXTINGUISH_RANGE) {
                                validTargets.push({ type: 'lighter', item: null });
                            }
                        }

                        if (validTargets.length > 0) {
                            const globalCooldown = 30000;
                            const onCooldown = isStandard && (now - lastGlobalFireBlowoutTimeRef.current < globalCooldown);

                            if (!onCooldown) {
                                let blowOutChance = isStandard ? 0.001 : 0.0016;
                                let forcedTarget = null;
                                
                                if (isOnryo) {
                                    for (const t of validTargets) {
                                        if (t.type === 'lantern' && t.item.lastExtinguishedTime) {
                                            if (now - t.item.lastExtinguishedTime < 20000) {
                                                blowOutChance = 0.005; 
                                                forcedTarget = t;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (Math.random() < blowOutChance) {
                                    const target = forcedTarget || validTargets[Math.floor(Math.random() * validTargets.length)];
                                    
                                    if (target.type === 'lantern') {
                                        propsRef.current.actions.updatePlacedItem({ 
                                            ...target.item, 
                                            isOn: false, 
                                            lastExtinguishedTime: now 
                                        });
                                        propsRef.current.actions.triggerEmfEvent({ position: target.item.position, level: 2 });
                                        soundManagerRef.current?.playTossSound(new BABYLON.Vector3(target.item.position.x, target.item.position.y, target.item.position.z)); 
                                    } else {
                                        updateState({ isLighterOn: false });
                                        soundManagerRef.current?.playTossSound(rig.position);
                                    }

                                    if (isOnryo) onryoBlowoutTimestamps.current.push(now);
                                    else lastGlobalFireBlowoutTimeRef.current = now;
                                }
                            }
                        }
                        
                        if (isOnryo) {
                            const recentBlowouts = onryoBlowoutTimestamps.current.filter(t => now - t <= 20000);
                            onryoBlowoutTimestamps.current = recentBlowouts; 

                            if (recentBlowouts.length >= 3) {
                                const preventRange = 4 * WORLD_SCALE; 
                                const hasLitLantern = placedItems.some((item: any) => 
                                    item.id === ItemId.Lantern && item.isOn && 
                                    BABYLON.Vector3.Distance(ghostPos, new BABYLON.Vector3(item.position.x, item.position.y, item.position.z)) < preventRange
                                );
                                const hasLitLighter = isLighterOn && equippedItem?.id === ItemId.Lighter && BABYLON.Vector3.Distance(ghostPos, rig.position) < preventRange;

                                if (hasLitLantern || hasLitLighter) {
                                    onryoBlowoutTimestamps.current = []; 
                                } else {
                                    startHunt();
                                    onryoBlowoutTimestamps.current = []; 
                                }
                            }
                        }
                        
                        if (selectedGhost?.evidence.includes(EvidenceType.GhostWriting)) {
                            const books = placedItems.filter((p: any) => p.id === ItemId.GhostWritingBook && !p.writingData);
                            for (const book of books) {
                                if (BABYLON.Vector3.Distance(ghostPos, new BABYLON.Vector3(book.position.x, book.position.y, book.position.z)) < 2.0 * WORLD_SCALE) {
                                    if (Math.random() < 0.05) {
                                        const drawing = Math.random() < 0.5 ? 'drawing1' : 'drawing2';
                                        propsRef.current.actions.updatePlacedItem({ ...book, writingData: drawing });
                                        soundManagerRef.current?.playGhostWriting(new BABYLON.Vector3(book.position.x, book.position.y, book.position.z));
                                    }
                                }
                            }
                        }
                    }
                    lastFlameInteractionCheckRef.current = now;
                }

                if (activeEmfEvents && playerCoordinates) {
                    const EMF_EVENT_DURATION = 15000; 
                    const EMF_READING_RANGE = 3 * WORLD_SCALE;
                    let maxEmfLevelInLoop = 0;
                    const stillActiveEvents = activeEmfEvents.filter((event: any) => (now - event.startTime) < EMF_EVENT_DURATION);
                    const playerPosVec = new BABYLON.Vector3(playerCoordinates.x, playerCoordinates.y, playerCoordinates.z);
                
                    for (const event of stillActiveEvents) {
                        const distance = BABYLON.Vector3.Distance(playerPosVec, new BABYLON.Vector3(event.position.x, event.position.y, event.position.z));
                        if (distance <= EMF_READING_RANGE) {
                            const reading = Math.round(event.level * (1 - (distance / EMF_READING_RANGE)));
                            if (reading > maxEmfLevelInLoop) maxEmfLevelInLoop = reading;
                        }
                    }
                    maxEmfLevelInLoop = Math.min(5, maxEmfLevelInLoop);
                    if (stillActiveEvents.length !== activeEmfEvents.length || maxEmfLevelInLoop !== emfLevel) {
                        updateState({ activeEmfEvents: stillActiveEvents, emfLevel: maxEmfLevelInLoop });
                    }
                }

                const GHOST_PROXIMITY_RANGE = 3 * WORLD_SCALE;
                let isNearGhost = false;
                if (playerCoordinates && ghostWorldCoordinates) {
                    const distance = BABYLON.Vector3.Distance(
                        new BABYLON.Vector3(playerCoordinates.x, playerCoordinates.y, playerCoordinates.z),
                        new BABYLON.Vector3(ghostWorldCoordinates.x, ghostWorldCoordinates.y, ghostWorldCoordinates.z)
                    );
                    if (distance < GHOST_PROXIMITY_RANGE) isNearGhost = true;
                }
                
                if (now - lastLosCheckTimeRef.current > 200 && ghostMeshRef.current && playerCameraRef.current) {
                    lastLosCheckTimeRef.current = now;
                    const ghost = ghostMeshRef.current;
                    const ghostEyePos = ghost.position.add(new BABYLON.Vector3(0, 1.5, 0));
                    const playerEyePos = playerCameraRef.current.globalPosition; 
                    const distanceToPlayer = BABYLON.Vector3.Distance(ghostEyePos, playerEyePos);
                    const directionToPlayer = playerEyePos.subtract(ghostEyePos).normalize();
                    
                    const pickInfo = scene.pickWithRay(new BABYLON.Ray(ghostEyePos, directionToPlayer, distanceToPlayer), (mesh: any) => {
                        return mesh.checkCollisions && mesh !== rig && mesh !== ghost && !mesh.isDescendantOf(ghost);
                    });

                    const hasLoS = !pickInfo || !pickInfo.hit || pickInfo.distance >= distanceToPlayer;
                    ghostHasLoSRef.current = hasLoS;

                    if (currentProps.isHunting && hasLoS) {
                        losDurationRef.current += 0.2; 
                    } else {
                        losDurationRef.current = 0;
                    }

                    if (selectedGhost?.name === 'Phantom' && hasLoS && (propsRef.current.isHunting || activeGhostEventRef.current)) {
                        // [FIX] Phantom Sanity Drain: Added 10m range check per requirements
                        if (distanceToPlayer < 10.0 * WORLD_SCALE) {
                            if (ghost.isInFrustum(BABYLON.Frustum.GetPlanes(camera.getTransformationMatrix()))) {
                                updateState({ sanity: Math.max(0, currentProps.sanity - 0.5) });
                            }
                        }
                    }
                }

                // --- GHOST MOVEMENT & AI ---
                if (ghostMeshRef.current) {
                    const ghost = ghostMeshRef.current;
                    const houseContainer = houseContainerRef.current;
                    const houseLayout = houseLayoutRef.current;

                    const currentGhostRoom = findRoomAt(ghost.position);
                    
                    if (ghost.position.y > 2.5) ghost.position.y = 0.1;

                    if (hantuBreathSystemRef.current) {
                        const shouldShowBreath = selectedGhost?.name === 'Hantu' && !isBreakerOn;
                        const isPlaying = hantuBreathSystemRef.current.isStarted();
                        if (shouldShowBreath && !isPlaying) hantuBreathSystemRef.current.start();
                        else if (!shouldShowBreath && isPlaying) hantuBreathSystemRef.current.stop();
                    }

                    if (lastGhostPositionRef.current) {
                        if (ghostWanderTargetRef.current || propsRef.current.isHunting) {
                            if (BABYLON.Vector3.Distance(ghost.position, lastGhostPositionRef.current) < (0.2 * deltaTimeSeconds)) {
                                stuckTimerRef.current += deltaTimeSeconds;
                            } else {
                                stuckTimerRef.current = 0; 
                            }
                        } else {
                            stuckTimerRef.current = 0; 
                        }
                    }
                    lastGhostPositionRef.current = ghost.position.clone();
            
                    if (stuckTimerRef.current > 2.0) { 
                        ghostWanderTargetRef.current = null;
                        if (propsRef.current.ghostPath) propsRef.current.actions.setGhostPath(null);
                        ghostIdleTimerRef.current = 0;
                        stuckTimerRef.current = 0;
                    }

                    if (activeGhostEventRef.current) {
                        if (currentRoomIdRef.current === null || currentRoomIdRef.current === TRUCK_ROOM_ID) {
                            onGhostEventCollision(false);
                            if (mistPathRef.current && mistPathRef.current.length > 0) (mistPathRef as any).current = [];
                            updateState({ activeGhostEvent: null });
                        } else {
                            const dist = BABYLON.Vector3.Distance(rig.position, ghost.position);
                            if (dist < 1.5 * WORLD_SCALE && activeGhostEventTypeRef.current !== 'ghost_singing') {
                                onGhostEventCollision(true);
                            }
                        }
                    } 
                    // HUNTING LOGIC
                    else if (propsRef.current.isHunting) {
                        if (mistPathRef.current && mistPathRef.current.length > 0) (mistPathRef as any).current = [];
                        ghost.checkCollisions = false;
                        
                        if (!wasHuntingRef.current) { 
                            huntGracePeriodTimerRef.current = 3.0; 
                            if (selectedGhost?.name === 'The Twins') {
                                ghostSpeedRef.current = Math.random() < 0.5 ? 1.53 : 1.87;
                            }
                        }
                        
                        if (huntGracePeriodTimerRef.current > 0) {
                            huntGracePeriodTimerRef.current -= deltaTimeSeconds;
                            updateGhostVisuals(ghost, 1.0, false);
                            wasHuntingRef.current = true;
                            return; 
                        }

                        const playerWorldPos = rig.position;
                        const heldItemsActive = currentProps.isFlashlightOn || currentProps.isEmfReaderOn || currentProps.isSpiritBoxOn;
                        
                        const context: GhostContext = {
                            ghost: selectedGhost!,
                            ghostPosition: ghost.position,
                            playerPosition: playerWorldPos,
                            hasLineOfSight: ghostHasLoSRef.current!,
                            isHunting: true,
                            isBlinded: currentProps.ghostBlindedTimer > 0,
                            sanity: currentProps.sanity,
                            thayeAge: currentProps.thayeAge,
                            isBreakerOn: isBreakerOn,
                            placedItems: placedItems,
                            heldItemsActive: heldItemsActive,
                            deltaTime: deltaTimeSeconds
                        };

                        let speed = ghostControllerRef.current.update(context);
                        
                        if (selectedGhost?.name === 'Deogen') {
                            ghostWanderTargetRef.current = playerWorldPos;
                        } else if (ghostHasLoSRef.current && context.isBlinded === false) {
                            ghostWanderTargetRef.current = playerWorldPos;
                        } else if (!ghostWanderTargetRef.current && lastKnownPlayerPositionRef.current) {
                            ghostWanderTargetRef.current = lastKnownPlayerPositionRef.current;
                        }

                        if (ghostWanderTargetRef.current) {
                            const direction = ghostWanderTargetRef.current.subtract(ghost.position).normalize();
                            const velocity = direction.scale(speed * deltaTimeSeconds);
                            ghost.position.addInPlace(velocity);
                            ghost.lookAt(ghostWanderTargetRef.current);
                            
                            // [FIX] RE-INTRODUCE GHOST FOOTSTEPS
                            // Only trigger footsteps if moving fast enough (Hunting is usually > 1.0 m/s)
                            if (speed > 0.1) {
                                // Calculate dynamic interval based on speed (Approx 1.7m/s = ~880ms)
                                const stepInterval = 1500 / speed;
                                if (now - lastGhostFootstepTime.current > stepInterval) {
                                    const isMyling = selectedGhost?.name === 'Myling';
                                    soundManagerRef.current?.playGhostFootstep(ghost.position, isMyling, true);
                                    lastGhostFootstepTime.current = now;
                                }
                            }

                            if (lastKnownPlayerPositionRef.current && BABYLON.Vector3.Distance(ghost.position, lastKnownPlayerPositionRef.current) < 0.5) {
                                lastKnownPlayerPositionRef.current = null;
                                ghostWanderTargetRef.current = null;
                            }
                        }

                        if (BABYLON.Vector3.Distance(ghost.position, playerWorldPos) < 1.0) {
                            // [FIX] Trigger dying state instead of immediate game over
                            handlePlayerDeath("Killed by " + selectedGhost?.name);
                        }

                        flickerTimerRef.current += deltaTimeSeconds;
                        const flickerRate = selectedGhost?.name === 'Phantom' ? (isGhostVisibleDuringHuntRef.current ? 0.5 : 2.0) : (Math.random() * 0.2 + 0.1);
                        
                        if (flickerTimerRef.current > flickerRate) {
                            isGhostVisibleDuringHuntRef.current = !isGhostVisibleDuringHuntRef.current;
                            flickerTimerRef.current = 0;
                            propsRef.current.actions.incrementHuntFlicker();
                        }
                        
                        const alpha = selectedGhost?.name === 'Oni' ? 1.0 : (isGhostVisibleDuringHuntRef.current ? 1.0 : 0.0);
                        updateGhostVisuals(ghost, alpha, false);
                        
                        const { huntFlickerCount } = currentProps;
                        if (selectedGhost?.name === 'Obake' && isGhostVisibleDuringHuntRef.current && huntFlickerCount > 0 && !isShapeshiftedRef.current) {
                            if (GHOST_AI.OBAKE_GUARANTEED_SHAPESHIFT_FLICKERS.includes(huntFlickerCount)) {
                                const models = obakeShapeshiftModelsRef.current;
                                if (models && models.length > 0) {
                                    const shape = models[Math.floor(Math.random() * models.length)];
                                    activeShapeshiftModelRef.current = shape;
                                    isShapeshiftedRef.current = true;
                                    
                                    ghost.setEnabled(false);
                                    shape.position.copyFrom(ghost.position);
                                    shape.rotation.copyFrom(ghost.rotation);
                                    shape.setEnabled(true);
                                    updateGhostVisuals(shape, 1.0, false);

                                    setTimeout(() => {
                                        if (shape) shape.setEnabled(false);
                                        if (ghost) ghost.setEnabled(true);
                                        isShapeshiftedRef.current = false;
                                        activeShapeshiftModelRef.current = null;
                                    }, 300);
                                }
                            }
                        }
                    } 
                    // WANDERING (Idle)
                    else if (ghostWanderTargetRef.current) {
                        const direction = ghostWanderTargetRef.current.subtract(ghost.position).normalize();
                        const velocity = direction.scale(1.0 * deltaTimeSeconds);
                        ghost.position.addInPlace(velocity);
                        ghost.lookAt(ghostWanderTargetRef.current);
                        
                        // [FIX] RE-INTRODUCE GHOST FOOTSTEPS
                        // Standard wander speed is 1.0 m/s
                        if (now - lastGhostFootstepTime.current > 1500) {
                             const isMyling = selectedGhost?.name === 'Myling';
                             soundManagerRef.current?.playGhostFootstep(ghost.position, isMyling, false);
                             lastGhostFootstepTime.current = now;
                        }

                        if (BABYLON.Vector3.Distance(ghost.position, ghostWanderTargetRef.current) < 0.5) {
                            if (propsRef.current.ghostPath && propsRef.current.ghostPath.length > 1) {
                                propsRef.current.actions.setGhostPath(propsRef.current.ghostPath.slice(1));
                            } else {
                                propsRef.current.actions.ghostArrived();
                                ghostIdleTimerRef.current = Math.random() * 5 + 2; 
                            }
                        }
                    } else {
                        if (ghostIdleTimerRef.current > 0) {
                            ghostIdleTimerRef.current -= deltaTimeSeconds;
                        } else {
                            // --- IDLE WANDERING LOGIC ---
                            // Pick a new target if idle time is up
                            const favRoomId = currentProps.ghostFavoriteRoomId;
                            const layout = houseLayoutRef.current;
                            
                            if (favRoomId !== null && layout && houseContainer) {
                                // 80% chance to wander in favorite room
                                // 20% chance to wander in random valid room (roaming)
                                const stayInFav = Math.random() < 0.8;
                                let targetRoomId = favRoomId;
                                
                                if (!stayInFav) {
                                    const validRooms = layout.rooms.filter((r: Room) => r.id !== TRUCK_ROOM_ID);
                                    if (validRooms.length > 0) {
                                        const r = validRooms[Math.floor(Math.random() * validRooms.length)];
                                        targetRoomId = r.id;
                                    }
                                }
                                
                                const targetRoom = layout.rooms.find((r: Room) => r.id === targetRoomId);
                                if (targetRoom) {
                                    const randomX = targetRoom.x + (Math.random() * targetRoom.width * 0.8) + (targetRoom.width * 0.1);
                                    const randomZ = targetRoom.z + (Math.random() * targetRoom.depth * 0.8) + (targetRoom.depth * 0.1);
                                    
                                    // Use BFS pathfinding
                                    const startNode = layout.navmesh.nodes.find((n: NavNode) => {
                                        // Simple nearest node check or check by roomId if available
                                        return n.roomId === currentProps.ghostCurrentRoomId;
                                    });
                                    
                                    const endNode = layout.navmesh.nodes.find((n: NavNode) => n.roomId === targetRoomId);
                                    
                                    if (startNode && endNode) {
                                        const pathIds = findPathBFS(layout.navmesh.graph, startNode.id, endNode.id);
                                        if (pathIds) {
                                            const pathNodes = pathIds.map((id: number) => layout.navmesh.nodes.find((n: NavNode) => n.id === id)!);
                                            // Add final precise point
                                            const finalPoint = { ...endNode, position: { x: randomX, y: 1.0, z: randomZ } };
                                            pathNodes.push(finalPoint);
                                            
                                            propsRef.current.actions.setGhostPath(pathNodes);
                                        }
                                    } else {
                                        // Fallback direct target
                                        const localPos = new BABYLON.Vector3(randomX, 1.0, randomZ);
                                        ghostWanderTargetRef.current = BABYLON.Vector3.TransformCoordinates(localPos, houseContainer.getWorldMatrix());
                                    }
                                }
                            }
                            ghostIdleTimerRef.current = Math.random() * 3 + 2; // Reset cooldown
                        }
                    }
                    
                    if (ghostMeshRef.current && isShapeshiftedRef.current && activeShapeshiftModelRef.current) {
                        activeShapeshiftModelRef.current.position.copyFrom(ghostMeshRef.current.position);
                        activeShapeshiftModelRef.current.rotation.copyFrom(ghostMeshRef.current.rotation);
                    }

                    if (now - lastPositionUpdateTimeRef.current > 500) {
                        onPlayerPositionUpdate({ x: rig.position.x, y: rig.position.y, z: rig.position.z });
                        propsRef.current.actions.updateState({ ghostWorldCoordinates: { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z } });
                        lastPositionUpdateTimeRef.current = now;
                    }
                }
            } catch (error) {
                console.error("Critical error in game loop:", error);
            }
        };

        const observer = scene.onBeforeRenderObservable.add(gameLoop);
        return () => { if (scene) scene.onBeforeRenderObservable.remove(observer); };
    }, [isInitialized]);
};
