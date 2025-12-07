
import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { GameState, ItemId } from '../../types';
import { WORLD_SCALE, VIEWMODEL_LAYER_MASK } from '../../constants';
import { InteractionHandler } from '../systems/InteractionHandler';
import { ItemPlacementService } from '../../services/ItemPlacementService';

declare const BABYLON: any;

export const usePlayerInput = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    sceneRef: React.RefObject<any>,
    playerCameraRef: React.RefObject<any>,
    playerRootRef: React.RefObject<any>,
    isCrouchingRef: React.RefObject<boolean>,
    gameState: GameState,
    isPaused: boolean,
    isMobile: boolean,
    doorPivotsRef: React.RefObject<Map<any, any>>,
    doorStatesRef: React.RefObject<Map<any, any>>,
    houseLayoutRef: React.RefObject<any>,
    houseContainerRef: React.RefObject<any>,
    soundManagerRef: React.RefObject<any>
) => {
    const inputMapRef = useRef(new Map<string, boolean>());
    const rightMouseDownInfo = useRef<{ timer: ReturnType<typeof setTimeout> | null, isHolding: boolean }>({ timer: null, isHolding: false });
    
    const interactionHandlerRef = useRef<InteractionHandler>(new InteractionHandler());

    // Sync state via ref to avoid re-binding event listeners constantly
    const stateRef = useRef(useStore.getState());
    useEffect(() => {
        const unsubscribe = useStore.subscribe(newState => {
            stateRef.current = newState;
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleClick = () => {
            if (isMobile) return;
            // Prevent locking if paused or not playing
            if (isPaused || gameState !== GameState.Playing) return;

            if (!document.pointerLockElement) {
                const canvasEl = canvas as any;
                canvasEl.requestPointerLock = canvasEl.requestPointerLock || canvasEl.mozRequestPointerLock || canvasEl.webkitRequestPointerLock;
                if (canvasEl.requestPointerLock) {
                    canvasEl.requestPointerLock();
                }
            }
        };

        // Attach click to canvas for pointer lock
        canvas.addEventListener("click", handleClick);
        return () => canvas.removeEventListener("click", handleClick);
    }, [isMobile, isPaused, gameState]);

    useEffect(() => {
        // We attach to window to ensure we catch events even if UI is overlaying
        // or if focus is slightly off.
        
        const isPausedCheck = () => stateRef.current.isPaused || stateRef.current.isVanUIOpen;

        const handleItemToggleOrUse = () => {
            const { equippedItem, isSpiritBoxOn, heldCameraState, isEmfReaderOn, isMusicBoxPlaying, isLighterOn, isFlashlightOn, isUvLightOn, isDOTSOn, isSecretMode } = stateRef.current;
            const currentActions = useStore.getState().actions;
            
            // [FIX] Secret Mode: 'F' key quick-uses Smudge Sticks regardless of equipped item
            if (isSecretMode) {
                currentActions.useSmudgeSticks();
                return;
            }
            
            if (equippedItem) {
                // [FIX] Lighter can ONLY be toggled via 'T' (Flashlight key).
                // Ignore 'F' (ItemSecondary) and Mouse Clicks for lighter toggling.
                if (equippedItem.id === ItemId.Lighter) return;

                switch(equippedItem.id) {
                    case ItemId.SpiritBox: currentActions.updateState({ isSpiritBoxOn: !isSpiritBoxOn }); return;
                    case ItemId.EMFReader: currentActions.updateState({ isEmfReaderOn: !isEmfReaderOn }); return;
                    case ItemId.MusicBox: currentActions.updateState({ isMusicBoxPlaying: !isMusicBoxPlaying }); return;
                    case ItemId.Flashlight: currentActions.updateState({ isFlashlightOn: !isFlashlightOn }); return;
                    case ItemId.UVLight: currentActions.updateState({ isUvLightOn: !isUvLightOn }); return;
                    case ItemId.DOTSProjector: currentActions.updateState({ isDOTSOn: !isDOTSOn }); return;
                    // Flamethrower is handled by mouse hold, not toggle 'F'
                    case ItemId.Flamethrower: return;
                    case ItemId.VideoCamera: 
                        const currentState = heldCameraState || { isOn: false, isIR: false };
                        currentActions.updateState({ 
                            heldCameraState: { ...currentState, isOn: !currentState.isOn } 
                        });
                        return;
                }
                // Default Use Action (Sanity Meds, etc)
                currentActions.useEquippedItem();
                if (equippedItem.id === ItemId.SmudgeSticks) {
                     currentActions.useSmudgeSticks();
                }
            }
        };

        const handleToggleLight = () => {
            const { equippedItem, isLighterOn, isFlashlightOn, isUvLightOn, isDOTSOn, heldCameraState } = stateRef.current;
            const currentActions = useStore.getState().actions;

            // Priority 1: Equipped Item (if it produces light/visuals)
            if (equippedItem) {
                // [FIX] Lighter toggling logic resides ONLY here (mapped to 'T')
                if (equippedItem.id === ItemId.Lighter) {
                    currentActions.updateState({ isLighterOn: !isLighterOn });
                    return;
                }
                if (equippedItem.id === ItemId.Flashlight) {
                    currentActions.updateState({ isFlashlightOn: !isFlashlightOn });
                    return;
                }
                if (equippedItem.id === ItemId.UVLight) {
                    currentActions.updateState({ isUvLightOn: !isUvLightOn });
                    return;
                }
                if (equippedItem.id === ItemId.DOTSProjector) {
                    currentActions.updateState({ isDOTSOn: !isDOTSOn });
                    return;
                }
                if (equippedItem.id === ItemId.VideoCamera) {
                    if (heldCameraState) {
                        currentActions.updateState({ heldCameraState: { ...heldCameraState, isIR: !heldCameraState.isIR } });
                    }
                    return;
                }
            }

            // Priority 2: Shoulder Flashlight / Headlamp
            if (stateRef.current.carriedInventory[4]) {
                currentActions.toggleHeadlamp();
            } else {
                currentActions.toggleFlashlight();
            }
        };

        const handleInteract = () => {
            if (!interactionHandlerRef.current) return;
            
            const { placedItems, equippedItem } = stateRef.current;
            const currentActions = useStore.getState().actions;
            
            interactionHandlerRef.current.handleInteraction({
                scene: sceneRef.current,
                playerCamera: playerCameraRef.current,
                playerRoot: playerRootRef.current,
                actions: currentActions,
                soundManager: soundManagerRef.current,
                placedItems,
                equippedItem,
                doorPivots: doorPivotsRef.current!,
                doorStates: doorStatesRef.current!,
                houseLayout: houseLayoutRef.current,
                houseContainer: houseContainerRef.current,
                isCrouching: isCrouchingRef.current || false
            });
        };

        const handleDrop = () => {
            const item = stateRef.current.equippedItem;
            const currentActions = useStore.getState().actions;
            const camera = playerCameraRef.current;
            
            // Prevent dropping the lighter (Permanent Item)
            if (item && item.id === ItemId.Lighter) return;

            if (item && camera) {
                // [FIX] PHYSICS TOSS MECHANIC
                // Calculate Forward Vector from camera view
                const forward = camera.getDirection(BABYLON.Vector3.Forward());
                forward.normalize();

                // Spawn Position: 0.5m in front of camera eye position
                // We use globalPosition to ensure world space correctness
                const spawnPos = camera.globalPosition.add(forward.scale(0.5));
                
                // Calculate Impulse Vector (Throw Velocity)
                // Forward * Force + Up * Arc
                const throwForce = 8.0; 
                const upForce = 2.0;
                
                // We construct velocity manually
                const velocityX = forward.x * throwForce;
                const velocityY = (forward.y * throwForce) + upForce; // Add arc
                const velocityZ = forward.z * throwForce;

                // Orientation: Randomize slightly or face player? 
                // Let's face away from player initially.
                const yaw = Math.atan2(forward.x, forward.z);

                currentActions.placeItem({
                    itemId: item.id,
                    position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
                    rotation: { x: 0, y: yaw, z: 0 },
                    isDrop: true,
                    throwVelocity: { x: velocityX, y: velocityY, z: velocityZ }
                });
            }
        };
    
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            
            // Allow Escape to work even when paused to toggle menu
            if (isPausedCheck() && key !== 'escape') return;

            if (inputMapRef.current.get(key)) return;
            inputMapRef.current.set(key, true);

            const currentActions = useStore.getState().actions;
            const bindings = stateRef.current.keyBindings;
            
            // Block Journal and Inventory in Secret Mode
            if (stateRef.current.isSecretMode && (key === bindings.Journal || key === bindings.VanMenu)) return;
    
            // Map Configured Keys to Physics Inputs
            if (key === bindings.MoveForward) inputMapRef.current.set('w', true);
            if (key === bindings.MoveBackward) inputMapRef.current.set('s', true);
            if (key === bindings.MoveLeft) inputMapRef.current.set('a', true);
            if (key === bindings.MoveRight) inputMapRef.current.set('d', true);
            if (key === bindings.Sprint) inputMapRef.current.set('shift', true);

            // Execute Action Logic based on Binding
            if (key === 'escape') currentActions.togglePause();
            else if (key === bindings.Journal) currentActions.setGameState(stateRef.current.gameState === GameState.Journal ? GameState.Playing : GameState.Journal);
            else if (key === bindings.VanMenu) currentActions.toggleVanUI();
            else if (key === bindings.Crouch) currentActions.toggleCrouch();
            else if (key === bindings.PushToTalk) {
                if (!stateRef.current.isPushToTalkActive) {
                    currentActions.updateState({ isPushToTalkActive: true });
                }
            }
            else if (key === bindings.Flashlight) {
                handleToggleLight();
            }
            else if (key === bindings.ItemSecondary) handleItemToggleOrUse();
            else if (key === bindings.Drop) handleDrop();
            else if (key === bindings.Interact) handleInteract();
            else if (key === bindings.CycleInventory) {
                // Inventory Cycle (Prev)
                const { equippedItemIndex } = stateRef.current;
                if (equippedItemIndex !== null && equippedItemIndex !== 3) { // Skip lighter
                    let nextIndex = (equippedItemIndex + 1) % 3;
                    // Simple cycle 0-1-2
                    currentActions.switchItem(nextIndex);
                } else {
                    currentActions.switchItem(0);
                }
            }
            
            // Hardcoded Slots
            else if (key === '1') currentActions.switchItem(0);
            else if (key === '2') currentActions.switchItem(1);
            else if (key === '3') currentActions.switchItem(2);
            else if (key === '4') currentActions.switchItem(3);
            
            // Dev keys (Hardcoded)
            else if (key === 'k') {
                if (!stateRef.current.isDevMode) return;
                const { devPins, devPlacementMode, playerCoordinates } = stateRef.current;
                const pinToUpdate = devPins.find(p => p.id === devPlacementMode.selectedPinId);
                if (pinToUpdate && playerCoordinates && devPlacementMode.mode !== 'simple') {
                    const newPoints = { ...(pinToUpdate.points || {}), [devPlacementMode.mode.toLowerCase()]: playerCoordinates };
                    currentActions.updateDevPin({ ...pinToUpdate, points: newPoints });
                }
            }
            else if (key === 'delete') {
                const { isDevMode, devPlacementMode } = stateRef.current;
                if (isDevMode && devPlacementMode.selectedPinId) {
                    currentActions.removeDevPin(devPlacementMode.selectedPinId);
                    currentActions.setDevPlacementMode({ mode: 'simple', selectedPinId: null });
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            inputMapRef.current.set(key, false);
            
            const bindings = stateRef.current.keyBindings;

            // Clear mapped physics inputs
            if (key === bindings.MoveForward) inputMapRef.current.set('w', false);
            if (key === bindings.MoveBackward) inputMapRef.current.set('s', false);
            if (key === bindings.MoveLeft) inputMapRef.current.set('a', false);
            if (key === bindings.MoveRight) inputMapRef.current.set('d', false);
            if (key === bindings.Sprint) inputMapRef.current.set('shift', false);

            if (key === bindings.PushToTalk) {
                useStore.getState().actions.updateState({ isPushToTalkActive: false });
            }
        };
        
        const handleWheel = (e: WheelEvent) => {
            // Prevent default browser scroll which might interrupt things
            if(e.cancelable) e.preventDefault(); 
            e.stopPropagation();

            if (isPausedCheck()) return;
            
            const { equippedItemIndex, carriedInventory } = stateRef.current;
            const currentActions = useStore.getState().actions;

            const inventorySize = 4; 
            let nextIndex = (equippedItemIndex ?? -1) + (e.deltaY > 0 ? 1 : -1);

            // Try to find the next valid item in that direction
            for (let i = 0; i < inventorySize; i++) {
                let wrappedIndex = (nextIndex + i * (e.deltaY > 0 ? 1 : -1) + inventorySize) % inventorySize;
                // Indices 0, 1, 2 are main slots, 3 is Lighter
                if (wrappedIndex < 3 && carriedInventory[wrappedIndex]) {
                    currentActions.switchItem(wrappedIndex);
                    return;
                }
                if (wrappedIndex === 3) { 
                    // Lighter slot (always check slot 3)
                    if (carriedInventory[3]) {
                         currentActions.switchItem(3);
                         return;
                    }
                }
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (isPausedCheck()) return;
            
            const { equippedItem } = stateRef.current;

            if (e.button === 0) { // Left Click
                // FLAMETHROWER LOGIC: Hold to activate Main Fire
                if (equippedItem && equippedItem.id === ItemId.Flamethrower) {
                    useStore.getState().actions.updateState({ isFlamethrowerOn: true });
                    return; 
                }

                if (interactionHandlerRef.current) {
                    const didInteract = interactionHandlerRef.current.handleInteraction({
                        scene: sceneRef.current,
                        playerCamera: playerCameraRef.current,
                        playerRoot: playerRootRef.current,
                        actions: useStore.getState().actions,
                        soundManager: soundManagerRef.current,
                        placedItems: stateRef.current.placedItems,
                        equippedItem: stateRef.current.equippedItem,
                        doorPivots: doorPivotsRef.current!,
                        doorStates: doorStatesRef.current!,
                        houseLayout: houseLayoutRef.current,
                        houseContainer: houseContainerRef.current,
                        isCrouching: isCrouchingRef.current || false
                    });

                    if (!didInteract) {
                        handleItemToggleOrUse();
                    }
                }
            }

            if (e.button === 2) { // Right click
                // FLAMETHROWER LOGIC: Hold to activate Alt Fire (Ball Launcher)
                if (equippedItem && equippedItem.id === ItemId.Flamethrower) {
                    useStore.getState().actions.setFlamethrowerAltFire(true);
                    return; // Skip deploy logic
                }

                rightMouseDownInfo.current.isHolding = false;
                rightMouseDownInfo.current.timer = setTimeout(() => {
                    rightMouseDownInfo.current.isHolding = true;
                    rightMouseDownInfo.current.timer = null;
                    const { equippedItem } = stateRef.current;
                    const currentActions = useStore.getState().actions;
                    if (equippedItem && equippedItem.id !== ItemId.Lighter && equippedItem.id !== ItemId.Flamethrower) {
                        currentActions.updateState({ isDeploying: true });
                    }
                }, 150);
            }
        };
        
        const handleMouseUp = (e: MouseEvent) => {
            const { equippedItem } = stateRef.current;

            if (e.button === 0) { // Left Click Release
                if (equippedItem && equippedItem.id === ItemId.Flamethrower) {
                    useStore.getState().actions.updateState({ isFlamethrowerOn: false });
                }
            }

             if (e.button === 2) { // Right Click Release
                // FLAMETHROWER LOGIC: Stop Alt Fire
                if (equippedItem && equippedItem.id === ItemId.Flamethrower) {
                    useStore.getState().actions.setFlamethrowerAltFire(false);
                    return;
                }

                if (rightMouseDownInfo.current.timer) {
                    clearTimeout(rightMouseDownInfo.current.timer);
                    rightMouseDownInfo.current.timer = null;
                    
                    const { isDeploying, equippedItem } = stateRef.current;
                    
                    if (isDeploying) {
                        window.dispatchEvent(new CustomEvent('finalizePlacement'));
                    } else {
                        // TAP DETECTED: If we aren't deploying, this was a right-click tap.
                        // Use it as a secondary toggle action.
                        if (equippedItem && equippedItem.id !== ItemId.Flamethrower) {
                            handleItemToggleOrUse();
                        }
                    }
                } else {
                    if (stateRef.current.isDeploying) {
                        window.dispatchEvent(new CustomEvent('finalizePlacement'));
                    }
                }
                rightMouseDownInfo.current.isHolding = false;
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (stateRef.current.isDeploying) {
                window.dispatchEvent(new CustomEvent('adjustPlacementDistance', { detail: { delta: e.movementY } }));
            }
        };

        const handleCustomEvents = (e: Event) => {
            if (isPausedCheck()) return;
            switch (e.type) {
                case 'player-use': handleItemToggleOrUse(); break;
                case 'player-interact': handleInteract(); break;
                case 'player-drop': handleDrop(); break;
                case 'player-secondary': handleItemToggleOrUse(); break;
            }
        };

        // Attach to WINDOW to capture events even if UI obscures canvas
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('wheel', handleWheel, { passive: false }); // Allow preventing default scroll
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);
        
        window.addEventListener('player-use', handleCustomEvents);
        window.addEventListener('player-interact', handleCustomEvents);
        window.removeEventListener('player-drop', handleCustomEvents);
        window.addEventListener('player-secondary', handleCustomEvents);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);

            window.removeEventListener('player-use', handleCustomEvents);
            window.removeEventListener('player-interact', handleCustomEvents);
            window.removeEventListener('player-drop', handleCustomEvents);
            window.removeEventListener('player-secondary', handleCustomEvents);
        };
    }, [gameState, isPaused]);

    return inputMapRef;
};
