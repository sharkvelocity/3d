
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { GameState, Weather } from '../../types';
import { SANITY, TEMPERATURE, GHOST_AI, TIMERS, TRUCK_ROOM_ID, WORLD_SCALE } from '../../constants';

declare const BABYLON: any;

export const useGameLogic = () => {
    const state = useStore();
    const { actions } = state;
    
    // Refs to avoid dependency cycles in intervals
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    
    // [FIX] Track last interaction time for each door to prevent looping
    const lastDoorInteractionTimes = useRef<Map<number, number>>(new Map());

    // --- 1. Global Timer (1 Second Tick) ---
    useEffect(() => {
        const timer = setInterval(() => {
            if (stateRef.current.gameState === GameState.Playing && !stateRef.current.isPaused) {
                actions.tickSecond();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [actions]);

    // --- 2. Simulation Loop (Sanity & Temperature) ---
    useEffect(() => {
        const simTimer = setInterval(() => {
            const current = stateRef.current;
            if (current.gameState !== GameState.Playing || current.isPaused) return;
            
            // [FIX] Disable Simulation in Secret Mode
            if (current.isSecretMode) return;

            // --- Sanity Calculation ---
            if (current.setupPhaseTimer <= 0 && current.currentRoomId !== TRUCK_ROOM_ID) {
                let drain = 0;
                
                if (current.playerStatus.isInDark) {
                    drain += SANITY.DRAIN_RATE_DARKNESS;
                }
                
                if (current.playerStatus.isNearGhost) {
                    drain += SANITY.DRAIN_RATE_GHOST_PROXIMITY;
                }

                if (current.selectedGhost?.name === 'Yurei' && current.playerStatus.isNearGhost) {
                    drain *= SANITY.YUREI_SANITY_MULTIPLIER;
                }
                if (current.currentWeather === Weather.BloodMoon) {
                    drain *= SANITY.BLOOD_MOON_SANITY_MULTIPLIER;
                }
                
                drain *= 1.0; 

                if (drain > 0) {
                    const newSanity = Math.max(0, current.sanity - drain);
                    if (newSanity !== current.sanity) {
                        actions.updateState({ sanity: newSanity });
                    }
                }
            }

            // --- Temperature Calculation ---
            const newTemps = { ...current.roomTemperatures };
            let tempsChanged = false;
            
            if (current.mansionLayout) {
                current.mansionLayout.rooms.forEach(room => {
                    const currentTemp = newTemps[room.id] ?? current.ambientTemperature;
                    let targetTemp = current.isBreakerOn ? TEMPERATURE.TARGET_BREAKER_ON : current.ambientTemperature;
                    
                    if (room.id === current.ghostFavoriteRoomId) {
                        targetTemp = TEMPERATURE.TARGET_GHOST_FAVORITE_ROOM;
                    }
                    
                    if (room.id === current.ghostCurrentRoomId) {
                        targetTemp -= TEMPERATURE.GHOST_PRESENCE_DROP;
                    }

                    if (Math.abs(currentTemp - targetTemp) > 0.1) {
                        const changeSpeed = 0.5; 
                        if (currentTemp > targetTemp) {
                            newTemps[room.id] = currentTemp - changeSpeed;
                        } else {
                            newTemps[room.id] = currentTemp + changeSpeed;
                        }
                        tempsChanged = true;
                    }
                });
            }

            if (tempsChanged) {
                actions.updateState({ roomTemperatures: newTemps });
            }

        }, SANITY.DRAIN_TICK_INTERVAL);

        return () => clearInterval(simTimer);
    }, [actions]);

    // --- 3. Ghost Pending Action Processor ---
    useEffect(() => {
        const actionTimer = setInterval(() => {
            const current = stateRef.current;
            if (current.gameState !== GameState.Playing || current.isPaused) return;
            if (current.isSecretMode) return; // Disable in Secret Mode

            const now = performance.now();

            if (current.ghostPendingAction) {
                // Execute when time is ready
                if (now >= current.ghostPendingAction.executionTime) {
                    const { type, targetId, eventType } = current.ghostPendingAction;
                    
                    const payload: any = { type, id: Math.random() };
                    
                    if (type === 'door_interaction') payload.doorId = targetId;
                    else if (type === 'object_throw') payload.objectId = targetId;
                    else if (type === 'light_toggle') payload.roomId = targetId;
                    else if (type === 'ghost_event') {
                        payload.type = eventType || 'ghost_manifest';
                    }

                    actions.updateState({ 
                        paranormalEvent: payload,
                        ghostPendingAction: null
                    });
                }
                // [FIX] SAFETY: Clear stalled actions older than 5 seconds (Clear Queue)
                else if (now > current.ghostPendingAction.executionTime + 5000) {
                    console.warn("Cleared stalled ghost action queue.");
                    actions.updateState({ ghostPendingAction: null });
                }
            }
        }, 100);

        return () => clearInterval(actionTimer);
    }, [actions]);

    // --- 4. Ghost AI Decision Brain ---
    useEffect(() => {
        let aiTimeout: ReturnType<typeof setTimeout>;

        const runAiLoop = () => {
            const delay = GHOST_AI.TICK_MIN_DELAY + Math.random() * GHOST_AI.TICK_RANDOM_DELAY;
            
            aiTimeout = setTimeout(() => {
                const current = stateRef.current;
                
                // [FIX] Disable Standard Ghost AI in Secret Mode
                if (current.gameState === GameState.Playing && !current.isPaused && !current.isHunting && !current.isSecretMode) {
                    
                    // --- 1. MIGRATION LOGIC (Change Favorite Room) ---
                    // Only Goryo cannot migrate. Others have a small chance.
                    if (current.selectedGhost?.name !== 'Goryo' && current.mansionLayout) {
                        // 5% chance per AI tick (approx every 4s) -> roughly once per 80s
                        if (Math.random() < 0.05) {
                            const validRooms = current.mansionLayout.rooms.filter(r => 
                                r.id !== TRUCK_ROOM_ID && 
                                r.id !== current.ghostFavoriteRoomId &&
                                !r.type.includes('Hallway') // Try to pick actual rooms
                            );
                            
                            if (validRooms.length > 0) {
                                // Prefer rooms somewhat close? For now, random is sufficient for "roaming" behavior
                                const newRoom = validRooms[Math.floor(Math.random() * validRooms.length)];
                                console.log(`[GhostAI] Migrating favorite room from ${current.ghostFavoriteRoomId} to ${newRoom.id} (${newRoom.type})`);
                                actions.updateState({ ghostFavoriteRoomId: newRoom.id });
                            }
                        }
                    }

                    // --- 2. ATTEMPT HUNT ---
                    // Calculate dynamic threshold based on ghost type
                    let threshold = current.selectedGhost?.huntSanityThreshold ?? 50;
                    
                    // MARE: 60% in dark, 40% in light (checking current room light status)
                    if (current.selectedGhost?.name === 'Mare' && current.ghostCurrentRoomId !== null) {
                        const isLightOn = current.lightStates[current.ghostCurrentRoomId];
                        threshold = isLightOn ? 40 : 60;
                    }
                    
                    // YOKAI: 80% if talking (Handled via voice trigger mostly, but baseline is 50)
                    // We assume voice trigger handles the early hunt in GameCanvas/useGameLoop voice check.
                    
                    if (current.sanity <= threshold && current.setupPhaseTimer <= 0 && current.huntCooldownTimer <= 0) {
                        // Demon has higher hunt frequency (handled by higher threshold 70%)
                        // Standard chance
                        if (Math.random() < GHOST_AI.HUNT_CHANCE) {
                            actions.attemptHunt();
                        }
                    }

                    // --- 3. PERFORM INTERACTION ---
                    if (!current.isHunting) {
                        const interactionRoll = Math.random();
                        const now = performance.now();
                        
                        // Shade interacts less (30% chance vs 60%)
                        const interactionChance = current.selectedGhost?.name === 'Shade' ? 0.3 : 0.6;
                        
                        if (interactionRoll < interactionChance) {
                            const validTargets: { type: 'door_interaction' | 'object_throw' | 'light_toggle' | 'ghost_event', id: number, dist: number, pos?: any }[] = [];
                            
                            const ghostPos = current.ghostWorldCoordinates ? 
                                new BABYLON.Vector3(current.ghostWorldCoordinates.x, current.ghostWorldCoordinates.y, current.ghostWorldCoordinates.z) : 
                                null;

                            if (ghostPos) {
                                // Range Logic: Standard = 2.5m, Twins = 15m
                                const isTwins = current.selectedGhost?.name === 'The Twins';
                                const RANGE = (isTwins ? 15.0 : 2.5) * WORLD_SCALE;

                                // 1. Doors
                                if (current.mansionLayout && current.mansionLayout.doors.length > 0) {
                                    current.mansionLayout.doors.forEach((door: any, index: number) => {
                                        if (door.isFrontDoor) return;
                                        
                                        // [FIX] Cooldown Check: Ignore doors interacted with recently (5s cooldown)
                                        const lastTime = lastDoorInteractionTimes.current.get(index) || 0;
                                        if (now - lastTime < 5000) return;

                                        const doorPos = new BABYLON.Vector3(door.x, ghostPos.y, door.z);
                                        const dist = BABYLON.Vector3.Distance(ghostPos, doorPos);
                                        if (dist <= RANGE) {
                                            validTargets.push({ type: 'door_interaction', id: index, dist });
                                        }
                                    });
                                }

                                // 2. Interactables (Props)
                                if (current.mansionLayout && current.mansionLayout.interactables.length > 0) {
                                    current.mansionLayout.interactables.forEach((obj: any) => {
                                        const objPos = new BABYLON.Vector3(obj.position.x, obj.position.y, obj.position.z);
                                        const dist = BABYLON.Vector3.Distance(ghostPos, objPos);
                                        if (dist <= RANGE) {
                                            validTargets.push({ type: 'object_throw', id: obj.id, dist });
                                        }
                                    });
                                }
                                
                                // 3. Placed Items
                                if (current.placedItems.length > 0) {
                                    current.placedItems.forEach((item: any) => {
                                        const itemPos = new BABYLON.Vector3(item.position.x, item.position.y, item.position.z);
                                        const dist = BABYLON.Vector3.Distance(ghostPos, itemPos);
                                        if (dist <= RANGE) {
                                            validTargets.push({ type: 'object_throw', id: item.instanceId, dist });
                                        }
                                    });
                                }

                                // 4. Light Switches (Room Based Logic with Range Check)
                                if (current.ghostCurrentRoomId !== null) {
                                    // Mare never turns lights ON
                                    const isMare = current.selectedGhost?.name === 'Mare';
                                    const isLightOn = current.lightStates[current.ghostCurrentRoomId];
                                    
                                    if (!isMare || (isMare && isLightOn)) {
                                        const room = current.mansionLayout?.rooms.find(r => r.id === current.ghostCurrentRoomId);
                                        if (room) {
                                            validTargets.push({ type: 'light_toggle', id: current.ghostCurrentRoomId, dist: 0, pos: { x: room.x, y: 1, z: room.z } });
                                        }
                                    }
                                }
                            }

                            // [FIX] Prevent Ghost Events in Truck
                            // [FIX] Distance & Floor Limit for Ghost Events (15m + Same Floor)
                            if (current.currentRoomId !== TRUCK_ROOM_ID) {
                                let canEvent = false;
                                
                                if (ghostPos && current.playerCoordinates) {
                                    const playerPos = new BABYLON.Vector3(current.playerCoordinates.x, current.playerCoordinates.y, current.playerCoordinates.z);
                                    const distToPlayer = BABYLON.Vector3.Distance(ghostPos, playerPos);
                                    // Vertical Check: ~3m covers a standard floor height without bleeding too much into upper/lower
                                    const verticalDist = Math.abs(ghostPos.y - playerPos.y);
                                    
                                    if (distToPlayer <= 15.0 * WORLD_SCALE && verticalDist < 3.0) {
                                        canEvent = true;
                                    }
                                }

                                if (canEvent) {
                                    // Shade does not do Ghost Events if player is in same room
                                    const isShade = current.selectedGhost?.name === 'Shade';
                                    const sameRoom = current.ghostCurrentRoomId === current.currentRoomId;
                                    
                                    if (!isShade || !sameRoom) {
                                        validTargets.push({ type: 'ghost_event', id: 0, dist: 0 });
                                    }
                                }
                            }

                            if (validTargets.length > 0) {
                                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                                
                                // [FIX] Update cooldown if door selected
                                if (target.type === 'door_interaction') {
                                    lastDoorInteractionTimes.current.set(target.id, now);
                                }
                                
                                let finalEventType: 'ghost_manifest' | 'ghost_singing' | 'ghost_mist_form' | 'ghost_sound' | 'fake_hunt' | undefined = undefined;

                                if (target.type === 'ghost_event') {
                                    const events: Array<'ghost_manifest' | 'ghost_singing' | 'ghost_sound' | 'ghost_mist_form' | 'fake_hunt'> = 
                                        ['ghost_manifest', 'ghost_singing', 'ghost_sound', 'ghost_mist_form', 'fake_hunt'];
                                    
                                    let chosenEvent = events[Math.floor(Math.random() * events.length)];
                                    
                                    if (current.selectedGhost?.name === 'Shade' && chosenEvent === 'ghost_singing') {
                                        chosenEvent = 'ghost_sound';
                                    }
                                    
                                    if (current.selectedGhost?.name === 'Oni' && chosenEvent === 'ghost_mist_form') {
                                        chosenEvent = 'ghost_manifest';
                                    }
                                    
                                    finalEventType = chosenEvent;
                                }

                                actions.updateState({ 
                                    ghostPendingAction: {
                                        type: target.type,
                                        targetId: target.id,
                                        targetPosition: target.pos,
                                        eventType: finalEventType,
                                        executionTime: performance.now() + 500 
                                    }
                                });

                                // --- THE TWINS MECHANIC ---
                                // 50% Chance to perform a simultaneous "Decoy" interaction
                                if (current.selectedGhost?.name === 'The Twins' && Math.random() < 0.5) {
                                    const otherTargets = validTargets.filter(t => (t.id !== target.id || t.type !== target.type) && t.type !== 'ghost_event');
                                    if (otherTargets.length > 0) {
                                        const decoy = otherTargets[Math.floor(Math.random() * otherTargets.length)];
                                        
                                        if (decoy.type === 'door_interaction') {
                                            lastDoorInteractionTimes.current.set(decoy.id, now);
                                        }

                                        setTimeout(() => {
                                            actions.updateState({ 
                                                paranormalEvent: {
                                                    type: decoy.type as any,
                                                    id: Math.random(),
                                                    doorId: decoy.type === 'door_interaction' ? decoy.id : undefined,
                                                    objectId: decoy.type === 'object_throw' ? decoy.id : undefined,
                                                    roomId: decoy.type === 'light_toggle' ? decoy.id : undefined,
                                                }
                                            });
                                        }, 750); 
                                    }
                                }
                            }
                        }
                    }
                }
                
                runAiLoop();
            }, delay);
        };

        runAiLoop();

        return () => clearTimeout(aiTimeout);
    }, [actions]);
};
