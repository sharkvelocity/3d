
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { EvidenceType, Weather, ItemId, GameState, PlayerStatus, Coordinates, Item, PlacedItem, MapData, Ghost, AppActions, AppState, Room, MansionLayout, NavNode } from '../types';
import { useStore } from '../store';
import SoundManager from '../services/SoundManager';
import ScreenManager from '../services/MonitorManager';
import { ItemManager } from '../services/ItemManager';
import { ExportService } from '../services/ExportService';
import { EngineFactory } from '../services/EngineFactory';
import { GHOST_ORB_LAYER_MASK, VIEWMODEL_LAYER_MASK, UV_EVIDENCE_LAYER_MASK, MODEL_ROOT, IMAGE_ROOT, TEXTURE_ROOT, WORLD_SCALE, AUDIO_ROOT, COLLISION_GROUPS, TRUCK_ROOM_ID } from '../constants';
import { usePlayerInput } from './hooks/usePlayerInput';
import { useGameLoop } from './hooks/useGameLoop';
import { useSceneLoader, SceneRefs } from './hooks/useSceneLoader';
import { useItemSpawner } from './hooks/useItemSpawner';
import { useItemPlacement } from './hooks/useItemPlacement';
import { findPathBFS } from '@/utils/pathfinding';
import { checkTruckRoom } from '@/utils/spatialUtils';
import { InteractionHandler } from './systems/InteractionHandler';

declare var BABYLON: any;
declare var CANNON: any;

interface GameCanvasProps extends AppState {
    actions: AppActions;
    onLoadingUpdate: (progress: number, message: string) => void;
    onPlayerPositionUpdate: (coords: Coordinates) => void;
    onPlayerStatusUpdate: (status: PlayerStatus) => void;
    onEmfUpdate: (level: number) => void;
    onParabolicUpdate: (reading: number) => void;
    onInteractableFocusChange: (focus: { type: string; id: any; data?: any } | null) => void;
    onRoomChange: (roomId: number | null) => void;
    onLighterStateChange: (isOn: boolean) => void;
    onSpiritBoxToggle: () => void;
    onToggleMute: () => void;
    onTransitionComplete: () => void;
    onGuessMade: (message: string) => void;
    onUpdateHeldCameraState: (state: { isOn: boolean, isIR: boolean; } | null) => void;
    onSetGameState: (state: GameState) => void;
}

const GameCanvas = (componentProps: GameCanvasProps) => {
    const { onPlayerStatusUpdate, onPlayerPositionUpdate, onInteractableFocusChange, selectedMap, gameState, onSetGameState, mouseSensitivity, isPaused, touchControlsEnabled, touchSensitivity, actions, onLoadingUpdate } = componentProps;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Safety Ref to prevent double-initialization in React Strict Mode
    const isInitializingRef = useRef(false);
    
    const sceneRef = useRef<any>(null);
    const playerRootRef = useRef<any>(null); 
    const playerCameraRef = useRef<any>(null);
    const viewModelCameraRef = useRef<any>(null);
    const heldItemParentRef = useRef<any>(null); 
    const menuCameraRef = useRef<any>(null);
    const menuContainerRef = useRef<any>(null);
    const placedMeshesRef = useRef(new Map<number, any>());
    const dotsProjectorsRef = useRef(new Map());
    const ghostMeshRef = useRef<any>(null);
    const ghostIdleMeshRef = useRef<any>(null); 
    const mistFormMeshRef = useRef<any>(null); 
    const ghostWanderTargetRef = useRef<any>(null);
    const lastWanderTargetRef = useRef<any>(null);
    const ghostPathRef = useRef<any[]>([]);
    const mistPathRef = useRef<NavNode[]>([]);
    const lastKnownPlayerPositionRef = useRef<any>(null);
    const ghostSpeedRef = useRef(1.7);
    const ghostHasLoSRef = useRef(false);
    const soundManagerRef = useRef<SoundManager | null>(null);
    const itemManagerRef = useRef<ItemManager | null>(null);
    const equippedItemMeshRef = useRef<any>(null);
    const equippedItemIsCloneRef = useRef<boolean>(false); 
    const viewModelCacheRef = useRef<Map<string, any>>(new Map());
    const interactableMeshesRef = useRef(new Map());
    const houseLayoutRef = useRef<any>(null);
    const houseContainerRef = useRef<any>(null);
    const roomGraphRef = useRef<Map<number, { roomId: number; doorId: number }[]>>(new Map());
    const currentRoomIdRef = useRef<number | null>(null);
    const uvEvidenceMeshesRef = useRef<any[]>([]);
    const uvEvidenceMaterialRef = useRef<any>(null);
    const smudgeSmokeRef = useRef<any>(null);
    const ghostOrbMeshesRef = useRef<any[]>([]); 
    const ghostOrbSystemRef = useRef<any>(null);
    const ghostOrbEmitterRef = useRef<any>(null);
    const playerBreathSystemRef = useRef<any>(null);
    const nextPuffTimeRef = useRef(0);
    const hantuBreathSystemRef = useRef<any>(null);
    const mistBreathSystemRef = useRef<any>(null); 
    const lightFixturesRef = useRef(new Map());
    const lastPositionUpdateTimeRef = useRef(0);
    const doorPivotsRef = useRef(new Map());
    const doorStatesRef = useRef(new Map());
    const lastInteractableCheckTimeRef = useRef(0);
    const lastRoomCheckTimeRef = useRef(0);
    const isCrouchingRef = useRef(componentProps.isCrouching); 
    const isSprintingRef = useRef(componentProps.isSprinting); 
    const screenManagerRef = useRef<ScreenManager | null>(null);
    const placedCameraNodesRef = useRef(new Map<number, any>());
    const gameContainerRef = useRef<any>(null);
    const ambientLightRef = useRef<any>(null); 
    const moonLightRef = useRef<any>(null);
    const mainShadowGeneratorRef = useRef<any>(null);
    const flashlightShadowGeneratorRef = useRef<any>(null);
    const roomLightsRef = useRef(new Map());
    const lightSwitchesRef = useRef(new Map());
    const placedLanternEffectsRef = useRef<Map<number, { light: any, flame: any, emitterNode: any }>>(new Map());
    const placedMotionSensorDataRef = useRef(new Map<number, { powerMesh: any, lightMesh: any, anim: any, lastBeep: number }>());
    const lightingStateRef = useRef({ isInside: false, wantToBeInside: false, transitionCounter: 0 });
    const isFlashingRef = useRef(false);
    const lastGhostFootstepTime = useRef(0);
    const rainParticleSystemRef = useRef<any>(null);
    const snowParticleSystemRef = useRef<any>(null);
    const placedItemSoundsRef = useRef(new Map<number, any>());
    const phonographMeshRef = useRef<{ mesh: any, anims: any[] } | null>(null);
    const flickerTimerRef = useRef(0);
    const isGhostVisibleDuringHuntRef = useRef(true);
    const cloudLayerRef = useRef<any>(null);
    const lastLosCheckTimeRef = useRef(0);
    const losDurationRef = useRef(0);

    const obakeShapeshiftModelsRef = useRef<any[]>([]);
    const activeShapeshiftModelRef = useRef<any>(null);
    const isShapeshiftedRef = useRef(false);

    const stuckTimerRef = useRef(0);
    const lastGhostPositionRef = useRef<any>(null);

    const wasHuntingRef = useRef(componentProps.isHunting);
    
    const activeGhostEventRef = useRef(false);
    const activeGhostEventTypeRef = useRef<string | null>(null);
    
    const truckBoundsRef = useRef<{ min: any, max: any } | null>(null);
    const materialsRef = useRef<any[]>([]);
    
    const dotsManifestTimerRef = useRef(0);
    
    // Microphone / Voice Refs
    const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Secret Mode Refs
    const secretEnemiesRef = useRef<any[]>([]);
    const secretSpawnPointsRef = useRef<any[]>([]);
    
    // Debug Refs
    const debugNodeMeshesRef = useRef<any[]>([]);

    isCrouchingRef.current = componentProps.isCrouching;
    isSprintingRef.current = componentProps.isSprinting;

    const propsRef = useRef(componentProps);
    propsRef.current = componentProps;

    const prevGameStateRef = useRef<GameState | undefined>(undefined);
    useEffect(() => {
        prevGameStateRef.current = gameState;
    }, [gameState]);
    const prevGameState = prevGameStateRef.current;
    
    const equippedItemVersionRef = useRef(0);
    
    const stateRef = useRef(useStore.getState());
    useEffect(() => {
        const unsubscribe = useStore.subscribe(newState => {
            stateRef.current = newState;
        });
        return unsubscribe;
    }, []);

    // --- MICROPHONE SETUP ---
    useEffect(() => {
        const setupMicrophone = async () => {
            if (componentProps.isMicrophoneEnabled && !voiceAnalyserRef.current) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    
                    // RESUME HANDLER: Ensure AudioContext isn't suspended by browser policy
                    const resumeAudio = () => {
                        if (audioContext.state === 'suspended') {
                            audioContext.resume().then(() => {
                                console.log("[Audio] AudioContext resumed by user interaction.");
                            });
                        }
                    };
                    document.addEventListener('click', resumeAudio);
                    document.addEventListener('keydown', resumeAudio);

                    const analyser = audioContext.createAnalyser();
                    const microphone = audioContext.createMediaStreamSource(stream);
                    
                    analyser.smoothingTimeConstant = 0.5;
                    analyser.fftSize = 256;
                    
                    microphone.connect(analyser);
                    
                    audioContextRef.current = audioContext;
                    voiceAnalyserRef.current = analyser;
                    console.log("[Audio] Microphone connected for voice detection.");
                    
                    // Attempt immediate resume if possible
                    resumeAudio();

                } catch (err) {
                    console.warn("[Audio] Failed to initialize microphone:", err);
                }
            } else if (!componentProps.isMicrophoneEnabled && voiceAnalyserRef.current) {
                // Cleanup if disabled
                if (audioContextRef.current) {
                    if (audioContextRef.current.state !== 'closed') {
                        audioContextRef.current.close();
                    }
                    audioContextRef.current = null;
                }
                voiceAnalyserRef.current = null;
            }
        };
        setupMicrophone();
        
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [componentProps.isMicrophoneEnabled]);

    const inputMapRef = usePlayerInput(
        canvasRef,
        sceneRef,
        playerCameraRef,
        playerRootRef,
        isCrouchingRef,
        gameState,
        isPaused,
        componentProps.isMobile,
        doorPivotsRef,
        doorStatesRef,
        houseLayoutRef,
        houseContainerRef,
        soundManagerRef
    );

    useItemSpawner({
        sceneRef,
        placedItems: componentProps.placedItems,
        placedMeshesRef,
        viewModelCacheRef
    });

    useItemPlacement({
        sceneRef,
        playerCameraRef,
        playerRootRef,
        propsRef
    });

    const findRoomAt = useCallback((worldPos: any): Room | null => {
        if (!worldPos || typeof worldPos.x === 'undefined') return null;

        const truckRoom = checkTruckRoom(worldPos, truckBoundsRef.current);
        if (truckRoom) return truckRoom;

        const houseContainer = houseContainerRef.current;
        const houseLayout = houseLayoutRef.current;
        
        if (houseContainer && houseLayout) {
            const invMatrix = houseContainer.getWorldMatrix().clone().invert();
            const localPos = BABYLON.Vector3.TransformCoordinates(worldPos, invMatrix);
            if (localPos) {
                return houseLayout.rooms.find((r: Room) =>
                    r &&
                    localPos.x >= r.x && localPos.x < r.x + r.width &&
                    localPos.z >= r.z && localPos.z < r.z + r.depth
                ) || null;
            }
        }

        return null;
    }, []);

    const calculateSafeManifestPosition = useCallback(() => {
        const camera = playerCameraRef.current;
        const rig = playerRootRef.current;
        const scene = sceneRef.current;
        if (!camera || !rig || !scene) return null;

        const forward = camera.getForwardRay().direction;
        const forwardHorizontal = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
        
        let spawnDistance = 2.5 * WORLD_SCALE;
        const rayOrigin = rig.position.clone();
        rayOrigin.y += 1.0; 

        const ray = new BABYLON.Ray(rayOrigin, forwardHorizontal, spawnDistance + 0.5);
        const pickInfo = scene.pickWithRay(ray, (mesh: any) => {
            return mesh.checkCollisions && (
                mesh.collisionGroup === COLLISION_GROUPS.WALLS || 
                mesh.collisionGroup === COLLISION_GROUPS.DOORS
            );
        });

        if (pickInfo && pickInfo.hit) {
            spawnDistance = Math.max(0.5, pickInfo.distance - 0.5);
        }

        let spawnPos = rig.position.add(forwardHorizontal.scale(spawnDistance));
        spawnPos.y = rig.position.y;

        let room = findRoomAt(spawnPos);
        if (!room || room.id === TRUCK_ROOM_ID) {
            const shortDist = 1.0 * WORLD_SCALE;
            if (spawnDistance > shortDist) {
                const shortPos = rig.position.add(forwardHorizontal.scale(shortDist));
                shortPos.y = rig.position.y;
                const shortRoom = findRoomAt(shortPos);
                if (shortRoom && shortRoom.id !== TRUCK_ROOM_ID) {
                    return shortPos;
                }
            }
            return null;
        }
        return spawnPos;
    }, [findRoomAt]);

    const updateGhostVisuals = useCallback((mesh: any, alpha: number, isDotsMode: boolean = false) => {
        if (!mesh) return;
    
        const allMeshes = mesh.getDescendants(false, (node: any) => node instanceof BABYLON.AbstractMesh);
        if (mesh instanceof BABYLON.AbstractMesh) {
            allMeshes.push(mesh);
        }
    
        const materials = new Set();
        allMeshes.forEach((m: any) => {
            if (m.material) {
                materials.add(m.material);
            }
        });
        
        materials.forEach((mat: any) => {
            mat.alpha = alpha;
            if (isDotsMode) {
                mat.emissiveColor = new BABYLON.Color3(0, 1, 0.2); 
                mat.diffuseColor = new BABYLON.Color3(0, 1, 0.2);  
                mat.disableLighting = true; 
            } else {
                mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
                mat.disableLighting = false;
            }
        });
    }, []);

    const handleGhostEventEnd = useCallback(() => {
        activeGhostEventRef.current = false;
        activeGhostEventTypeRef.current = null;
        if (ghostIdleMeshRef.current) {
            ghostIdleMeshRef.current.setEnabled(false);
        }
        if (mistFormMeshRef.current) {
            mistFormMeshRef.current.setEnabled(false);
            if (mistBreathSystemRef.current && mistBreathSystemRef.current.isStarted()) {
                mistBreathSystemRef.current.stop();
            }
        }
        if (ghostMeshRef.current) {
            ghostMeshRef.current.setEnabled(true);
            const endAlpha = propsRef.current.isDevMode ? 0.3 : 0.0;
            updateGhostVisuals(ghostMeshRef.current, endAlpha, false);
        }
        soundManagerRef.current?.stopGhostSing();
        soundManagerRef.current?.stopHeartbeat();
        soundManagerRef.current?.setHeartbeatPlaybackRate(1.0);
    }, [updateGhostVisuals]);

    const onGhostEventCollision = useCallback((playAudio: boolean = true) => {
        if (playAudio && activeGhostEventTypeRef.current === 'ghost_mist_form') {
            soundManagerRef.current?.playGhostHiss(playerRootRef.current.position);
        }
        handleGhostEventEnd();
        propsRef.current.actions.updateState({ activeGhostEvent: null });
    }, [handleGhostEventEnd]);

    const exportHouseToGLB = useCallback(async () => {
        await ExportService.exportHouseToGLB(
            sceneRef.current, 
            houseContainerRef.current, 
            propsRef.current.actions.updateState
        );
    }, []);

    useEffect(() => {
        const handleDownload = () => {
            exportHouseToGLB();
        };
        window.addEventListener('downloadMapGLB', handleDownload);
        return () => {
            window.removeEventListener('downloadMapGLB', handleDownload);
        };
    }, [exportHouseToGLB]);
    
    useEffect(() => {
        const handleLockRequest = () => {
            const canvas = canvasRef.current;
            if (canvas && document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
            }
        };
        window.addEventListener('request_lock_pointer', handleLockRequest);
        return () => {
            window.removeEventListener('request_lock_pointer', handleLockRequest);
        };
    }, []);

    // [FIX] PLAY SECRET SOUND ON TRANSITION OR DIRECT LOAD
    useEffect(() => {
        const isSecret = componentProps.isSecretMode;
        if (isSecret && isInitialized && soundManagerRef.current) {
            // Trigger music if we are in secret mode (handles both direct load and transition)
            soundManagerRef.current.playSecretMapSound();
        }
    }, [componentProps.isSecretMode, isInitialized]);

    const handleLightning = useCallback(() => {
        const scene = sceneRef.current;
        const ambientLight = ambientLightRef.current;
        const moonLight = moonLightRef.current;
    
        if (!scene || !ambientLight || !moonLight || isFlashingRef.current) return;
        
        isFlashingRef.current = true;
        scene.stopAnimation(ambientLight);
        scene.stopAnimation(moonLight);
    
        const flashIntensityAmbient = 0.6;
        const flashIntensityMoon = 0.9;
        const flashColor = new BABYLON.Color4(0.6, 0.7, 0.8, 1);
        const flashDuration = 90; 
    
        const originalClearColor = scene.clearColor.clone();
    
        ambientLight.intensity = flashIntensityAmbient;
        moonLight.intensity = flashIntensityMoon;
        scene.clearColor = flashColor;
    
        setTimeout(() => {
            if (!scene || scene.isDisposed) return;
            scene.clearColor = originalClearColor;
            const isInside = lightingStateRef.current.isInside;
            const targetAmbient = isInside ? 0.025 : 0.05;
            const targetMoon = isInside ? 0.05 : 0.2;

            const fadeOutFrames = 25;
            BABYLON.Animation.CreateAndStartAnimation('flashAmbientDown', ambientLight, 'intensity', 60, fadeOutFrames, ambientLight.intensity, targetAmbient, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, null, () => { isFlashingRef.current = false; });
            BABYLON.Animation.CreateAndStartAnimation('flashMoonDown', moonLight, 'intensity', 60, fadeOutFrames, moonLight.intensity, targetMoon, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            
        }, flashDuration);
    }, []);

    const adjustSceneLighting = useCallback((isInside: boolean) => {
        const scene = sceneRef.current;
        const ambientLight = ambientLightRef.current;
        const moonLight = moonLightRef.current;
        if (!scene || !ambientLight || !moonLight) return;
    
        scene.stopAnimation(ambientLight);
        scene.stopAnimation(moonLight);

        const transitionFrames = 30; 
        const targetAmbient = isInside ? 0.025 : 0.05;
        const targetMoon = isInside ? 0.05 : 0.2;
    
        BABYLON.Animation.CreateAndStartAnimation('ambientIntensityTransition', ambientLight, 'intensity', 60, transitionFrames, ambientLight.intensity, targetAmbient, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, null, undefined);
        BABYLON.Animation.CreateAndStartAnimation('moonIntensityTransition', moonLight, 'intensity', 60, transitionFrames, moonLight.intensity, targetMoon, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, null, undefined);
    }, []);

    useGameLoop(
        sceneRef,
        playerRootRef,
        playerCameraRef,
        isCrouchingRef,
        inputMapRef,
        componentProps,
        propsRef,
        soundManagerRef,
        currentRoomIdRef,
        lightingStateRef,
        adjustSceneLighting,
        ghostMeshRef,
        ghostWanderTargetRef,
        ghostHasLoSRef,
        lastKnownPlayerPositionRef,
        ghostSpeedRef,
        hantuBreathSystemRef,
        roomLightsRef,
        lightSwitchesRef,
        houseContainerRef,
        houseLayoutRef,
        lastPositionUpdateTimeRef,
        onPlayerPositionUpdate,
        lastRoomCheckTimeRef,
        playerBreathSystemRef,
        nextPuffTimeRef,
        rainParticleSystemRef,
        snowParticleSystemRef,
        onPlayerStatusUpdate,
        lastInteractableCheckTimeRef,
        onInteractableFocusChange,
        cloudLayerRef,
        roomGraphRef,
        doorStatesRef,
        ghostPathRef,
        lastWanderTargetRef,
        lastGhostFootstepTime,
        updateGhostVisuals, 
        flickerTimerRef,
        isGhostVisibleDuringHuntRef,
        lastLosCheckTimeRef,
        losDurationRef,
        obakeShapeshiftModelsRef,
        activeShapeshiftModelRef,
        isShapeshiftedRef,
        stuckTimerRef,
        lastGhostPositionRef,
        placedMeshesRef,
        uvEvidenceMeshesRef,
        activeGhostEventRef,
        onGhostEventCollision,
        mistFormMeshRef,
        activeGhostEventTypeRef,
        mistPathRef,
        dotsProjectorsRef,
        truckBoundsRef,
        materialsRef,
        dotsManifestTimerRef,
        ghostOrbMeshesRef, 
        ghostOrbSystemRef, 
        ghostOrbEmitterRef, 
        ghostIdleMeshRef,
        voiceAnalyserRef,
        secretEnemiesRef,
        secretSpawnPointsRef,
        isInitialized,
        viewModelCacheRef // [FIX] Passed viewModelCacheRef to loop
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // [FIX] STRICT DOUBLE-INIT PREVENTION
        // In React Strict Mode, effects run twice. We must ensure `initialize` only runs ONCE.
        if (isInitializingRef.current) return;
        isInitializingRef.current = true;

        let onPointerLockChange: (() => void) | null = null;

        if (typeof BABYLON === 'undefined') {
            console.error("Babylon.js not loaded");
            actions.gameOver("Critical Error: Babylon.js not loaded. Check internet connection.");
            return;
        }

        let engine: any;
        let scene: any;

        const handleRefreshGraphics = () => {
            if (engine) engine.resize();
        };
        window.addEventListener('refreshGraphics', handleRefreshGraphics);

        const initialize = async () => {
            // [FIX] Early feedback to prove function entry
            onLoadingUpdate(0.1, "Checking WebGL...");
            
            const { graphicsQuality } = componentProps;
            
            try {
                // [FIX] MOVED PLUGIN REGISTRATION INSIDE TRY-CATCH
                // This prevents a crash if the GLTF loaders script failed to load from CDN.
                if (BABYLON.SceneLoader && BABYLON.GLTFFileLoader) {
                    onLoadingUpdate(0.3, "Loading Engine scripts...");
                    BABYLON.SceneLoader.RegisterPlugin(new BABYLON.GLTFFileLoader());
                    
                    // [OPTIMIZATION] Configure Draco Compression
                    BABYLON.DracoCompression.Configuration = {
                        decoder: {
                            wasmUrl: "https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js",
                            wasmBinaryUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.wasm",
                            fallbackUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.js"
                        }
                    };
                } else {
                    throw new Error("Babylon Loaders not available. Check connection.");
                }

                onLoadingUpdate(0.5, "Starting 3D Engine...");

                // [FIX] Use async EngineFactory for robust initialization with tiered fallbacks
                // Awaiting this allows the UI thread to breathe between attempts
                engine = await EngineFactory.create(canvas, componentProps.graphicsQuality);
                scene = new BABYLON.Scene(engine);
                
                // [PEP] Explicitly set touch-action to none for PEP support
                canvas.setAttribute("touch-action", "none");
                
                // [FIX] Dynamic Hardware Scaling based on Quality Setting
                let scaling = 1.0;
                if (graphicsQuality === 'Low') scaling = 2.0;
                else if (graphicsQuality === 'High') scaling = 0.8;
                
                engine.setHardwareScalingLevel(scaling);
                
                setupPlayerCamera(scene, canvas);
                setupMenuCamera(scene);
                
                // [FIX] Wrap Manager Initialization in Try-Catch to prevent hard crashes if logic is buggy
                try {
                    screenManagerRef.current = new ScreenManager(scene, playerCameraRef.current, graphicsQuality);
                    
                    itemManagerRef.current = new ItemManager({
                        scene: scene,
                        actions: actions,
                        soundManager: null as any,
                        screenManager: screenManagerRef.current!,
                        playerCamera: playerCameraRef.current,
                        flashlightShadowGeneratorRef: flashlightShadowGeneratorRef,
                        ghostMeshRef: ghostMeshRef,
                        secretEnemiesRef: secretEnemiesRef
                    });
                    
                    itemManagerRef.current.setPlacedMeshesRef(placedMeshesRef);
                    itemManagerRef.current.setExternalRefs({
                        ghostMeshRef: ghostMeshRef,
                        placedCameraNodesRef: placedCameraNodesRef,
                        uvEvidenceMeshesRef: uvEvidenceMeshesRef
                    });
                } catch (managerErr) {
                    console.error("Failed to initialize Game Managers:", managerErr);
                    // Continue anyway, better to have a broken game than a frozen one
                }

                onPointerLockChange = () => {
                    const camera = playerCameraRef.current;
                    if (!camera) return;
                    if (document.pointerLockElement === canvas) {
                        camera.attachControl(canvas, true);
                    } else {
                        camera.detachControl(canvas);
                    }
                };
                document.addEventListener('pointerlockchange', onPointerLockChange, false);
                document.addEventListener('mozpointerlockchange', onPointerLockChange, false);
                document.addEventListener('webkitpointerlockchange', onPointerLockChange, false);
                
                scene.onBeforeCameraRenderObservable.add((cam: any) => {
                    if (cam === viewModelCameraRef.current) {
                        scene.getEngine().clear(null, false, true, false);
                    }
                });

                scene.activeCameras.push(playerCameraRef.current, viewModelCameraRef.current);
                
                const renderLoopObserver = scene.onBeforeRenderObservable.add(() => {
                    if (itemManagerRef.current && propsRef.current.gameState === GameState.Playing && !propsRef.current.isPaused) {
                        itemManagerRef.current.update(propsRef.current);
                    }

                    if (placedMeshesRef.current) {
                        placedMeshesRef.current.forEach((mesh, instanceId) => {
                            if (mesh.position.y < -2.0) {
                                // [FIX] Improved Safety Net: Respawn at original spawn location instead of player
                                const itemData = propsRef.current.placedItems.find(p => p.instanceId === instanceId);
                                
                                if (itemData) {
                                    // Reset to spawn location
                                    mesh.position.set(itemData.position.x, itemData.position.y, itemData.position.z);
                                    
                                    // Reset Physics to stop momentum
                                    if (mesh.physicsImpostor) {
                                        mesh.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
                                        mesh.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
                                        mesh.physicsImpostor.sleep();
                                        // Wake up next frame to ensure it settles
                                        setTimeout(() => { if (mesh.physicsImpostor) mesh.physicsImpostor.wakeUp(); }, 50);
                                    }
                                    console.log(`[SafetyNet] Rescued falling item (ID: ${instanceId}) to original spawn.`);
                                } else if (playerRootRef.current) {
                                    // Fallback: Player position (e.g. if dropped dynamically)
                                    const resetPos = playerRootRef.current.position.add(new BABYLON.Vector3(0, 0.5, 0));
                                    mesh.position.copyFrom(resetPos);
                                    if (mesh.physicsImpostor) {
                                        mesh.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
                                        mesh.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
                                    }
                                }
                            }
                        });
                    }

                    // --- UNIFIED INTERACTION FOCUS CHECK (Raycast for HUD) ---
                    const pickInfo = InteractionHandler.getInteractionPick(scene, playerCameraRef.current, playerRootRef.current);
                    
                    let bestFocus: any = null;
                    if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata?.type) {
                        const meta = pickInfo.pickedMesh.metadata;
                        let data: any = {};
                        if (meta.type === 'door') {
                            const state = doorStatesRef.current.get(meta.id);
                            if (state) data = { isOpen: state.isOpen, isLocked: state.isLocked };
                        } else if (meta.type === 'pickup') {
                            const item = propsRef.current.placedItems.find((p: PlacedItem) => p.instanceId === meta.instanceId);
                            if (item) data = { ...item };
                        } else if (meta.type === 'phonograph') {
                            data = meta.data;
                        }
                        bestFocus = { type: meta.type, id: meta.id ?? meta.instanceId, data };
                    }
                    
                    if (JSON.stringify(bestFocus) !== JSON.stringify(propsRef.current.interactableFocus)) {
                        onInteractableFocusChange(bestFocus);
                    }
                });

                engine.runRenderLoop(() => {
                    if (!scene.isDisposed) {
                        try {
                            if (screenManagerRef.current) {
                                const currentProps = propsRef.current;
                                if (!currentProps.isPaused) {
                                    screenManagerRef.current.update({
                                        heldCameraState: currentProps.heldCameraState,
                                        placedCameras: currentProps.placedCameras,
                                        activeCameraIndex: currentProps.activeCameraIndex,
                                        isNearGhost: currentProps.playerStatus.isNearGhost,
                                        gameState: currentProps.gameState,
                                    }, placedCameraNodesRef.current, placedMeshesRef.current);
                                }
                            }
                            scene.render();
                        } catch (error) {
                            console.error("Unhandled error in render loop:", error);
                        }
                    }
                });
                window.addEventListener('resize', () => engine.resize());
                
                onLoadingUpdate(0.8, "Setting up Scene...");

                return () => { 
                    scene.onBeforeRenderObservable.remove(renderLoopObserver);
                };

            } catch (e) {
                console.error("Game Engine Factory Failed:", e);
                // Return undefined to signal failure
                return undefined;
            }
        };
        
        sceneRef.current = null; // Reset ref
        scene = null;

        // Setup Player Camera Helper
        const setupPlayerCamera = (scene: any, canvas: HTMLCanvasElement) => {
            const PLAYER_STANDING_HEIGHT = 1.7; 
            const PLAYER_RADIUS = 0.2;
            const PLAYER_EYE_LEVEL_STANDING = 1.6;
            const rig = BABYLON.MeshBuilder.CreateBox("playerRoot", { size: 0.2 }, scene);
            rig.isVisible = false;
            rig.isPickable = false;
        
            rig.position = new BABYLON.Vector3(0, 1.0, -27); 
            rig.checkCollisions = true;

            rig.ellipsoid = new BABYLON.Vector3(PLAYER_RADIUS, PLAYER_STANDING_HEIGHT / 2, PLAYER_RADIUS);
            rig.ellipsoidOffset = new BABYLON.Vector3(0, PLAYER_STANDING_HEIGHT / 2, 0);
            
            playerRootRef.current = rig;

            rig.collisionGroup = COLLISION_GROUPS.PLAYER;
            rig.collisionMask = COLLISION_GROUPS.WALLS | COLLISION_GROUPS.FURNITURE | COLLISION_GROUPS.INTERACTABLE | COLLISION_GROUPS.DOORS;
        
            const camera = new BABYLON.UniversalCamera("playerCamera", new BABYLON.Vector3(0, PLAYER_EYE_LEVEL_STANDING, 0), scene); 
            camera.parent = rig;
            camera.rotation.y = Math.PI; 
            
            camera.checkCollisions = false; 
            camera.applyGravity = false;   
            
            // [FIX] MIN_Z REDUCED: Prevents seeing through walls when close
            camera.minZ = 0.1;
            
            camera.fov = 1.0;
            camera.inertia = 0;
            camera.layerMask = ~(GHOST_ORB_LAYER_MASK | VIEWMODEL_LAYER_MASK);
            playerCameraRef.current = camera;
        
            const viewModelCam = new BABYLON.FreeCamera("viewModelCamera", BABYLON.Vector3.Zero(), scene);
            viewModelCam.layerMask = VIEWMODEL_LAYER_MASK;
            viewModelCam.parent = camera;
            viewModelCam.minZ = 0.01;
            viewModelCameraRef.current = viewModelCam;
            
            heldItemParentRef.current = new BABYLON.TransformNode("heldItemParent", scene);
            heldItemParentRef.current.parent = viewModelCam;
        };

        const setupMenuCamera = (scene: any) => {
            const camera = new BABYLON.TargetCamera("menuCamera", new BABYLON.Vector3(0.05, 1.3, -11.4), scene);
            camera.setTarget(new BABYLON.Vector3(0, 1.3, -12.2));
            menuCameraRef.current = camera;
            scene.activeCamera = camera;
        };
        
        // --- 6. PHYSICS SETUP ---
        const setupPhysics = (scene: any) => {
             // [FIX] Wrap physics in try-catch to prevent engine crash on failure
             try {
                 // Check if CANNON is available on window to avoid ReferenceError in strict mode
                 const CannonRef = (window as any).CANNON || CANNON;
                 if (!CannonRef) {
                     throw new Error("Cannon.js not loaded.");
                 }
                 const cannonPlugin = new BABYLON.CannonJSPlugin(true, 20, CannonRef);
                 scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), cannonPlugin);
                 scene.gravity = new BABYLON.Vector3(0, -9.81, 0);
             } catch (e) {
                 console.warn("Physics engine initialization failed. Game will run without physics.", e);
             }
             sceneRef.current = scene; // Set ref here after success
        };

        let cleanupInitialize: (() => void) | undefined;
        
        // [FIX] WATCHDOG TIMER
        // If initialization hangs for 7 seconds, force failure state.
        const watchdog = setTimeout(() => {
            if (!isInitialized && isInitializingRef.current) {
                console.error("Initialization timed out (7s watchdog).");
                actions.gameOver("Error: Engine initialization timed out. Check console/drivers.");
            }
        }, 7000);

        (async () => {
            try {
                const cleanup = await initialize();
                clearTimeout(watchdog); // Success!
                
                if (cleanup) {
                    if (sceneRef.current === null && engine) {
                        const currentScene = engine.scenes[0];
                        if (currentScene) {
                            onLoadingUpdate(0.9, "Configuring Physics...");
                            setupPhysics(currentScene);
                        }
                    }
                    
                    cleanupInitialize = cleanup;
                    onLoadingUpdate(1.0, "Starting Logic...");
                    setIsInitialized(true);
                } else {
                    console.error("Initialization failed (returned undefined).");
                    actions.gameOver("Critical Error: 3D Engine failed to initialize. Check device compatibility or refresh.");
                }
            } catch (error) {
                clearTimeout(watchdog);
                console.error("Game canvas initialization failed:", String(error));
                actions.gameOver("Critical Error: " + String(error));
            }
        })();

        return () => {
            if (cleanupInitialize) cleanupInitialize();
            window.removeEventListener('refreshGraphics', handleRefreshGraphics);
            if (onPointerLockChange) {
                document.removeEventListener('pointerlockchange', onPointerLockChange, false);
                document.removeEventListener('mozpointerlockchange', onPointerLockChange, false);
                document.removeEventListener('webkitpointerlockchange', onPointerLockChange, false);
            }
            screenManagerRef.current?.dispose();
            soundManagerRef.current?.dispose();
            soundManagerRef.current = null;
            itemManagerRef.current?.dispose();
            itemManagerRef.current = null;
            
            scene?.dispose(); 
            engine?.dispose();
            isInitializingRef.current = false;
        };
    }, [componentProps.graphicsQuality]); 
    
    const sceneRefs: SceneRefs = useMemo(() => ({
        sceneRef,
        gameContainerRef,
        menuContainerRef,
        playerRootRef,
        playerCameraRef,
        menuCameraRef,
        soundManagerRef,
        screenManagerRef,
        itemManagerRef,
        ambientLightRef,
        moonLightRef,
        mainShadowGeneratorRef,
        flashlightShadowGeneratorRef,
        ghostMeshRef,
        ghostIdleMeshRef,
        mistFormMeshRef,
        obakeShapeshiftModelsRef,
        activeShapeshiftModelRef,
        isShapeshiftedRef,
        ghostWanderTargetRef,
        lastWanderTargetRef,
        ghostPathRef,
        lastKnownPlayerPositionRef,
        rainParticleSystemRef,
        snowParticleSystemRef,
        ghostOrbMeshesRef, 
        ghostOrbSystemRef, 
        ghostOrbEmitterRef, 
        playerBreathSystemRef,
        hantuBreathSystemRef,
        mistBreathSystemRef,
        smudgeSmokeRef,
        cloudLayerRef,
        houseLayoutRef,
        houseContainerRef,
        doorPivotsRef,
        doorStatesRef,
        roomLightsRef,
        lightSwitchesRef,
        lightFixturesRef,
        roomGraphRef,
        currentRoomIdRef,
        placedMeshesRef,
        placedCameraNodesRef,
        dotsProjectorsRef,
        interactableMeshesRef,
        uvEvidenceMeshesRef,
        uvEvidenceMaterialRef,
        placedLanternEffectsRef,
        placedItemSoundsRef,
        viewModelCacheRef,
        phonographMeshRef,
        heldItemParentRef,
        truckBoundsRef,
        materialsRef,
        secretEnemiesRef,
        secretSpawnPointsRef
    }), []);

    useSceneLoader({
        refs: sceneRefs,
        propsRef,
        isInitialized,
        gameState,
        prevGameState,
        handleLightning,
        findRoomAt
    });
    
     useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        const isDevMode = componentProps.isDevMode;

        // [DEV MODE VISUALIZATION UPDATE]
        let debugBlockerMat = scene.getMaterialByName("devDebugBlockerMat");
        if (!debugBlockerMat) {
            debugBlockerMat = new BABYLON.StandardMaterial("devDebugBlockerMat", scene);
            debugBlockerMat.diffuseColor = new BABYLON.Color3(1, 0, 0); // Red
            debugBlockerMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0);
            debugBlockerMat.alpha = 0.3;
            debugBlockerMat.backFaceCulling = false;
        }

        let debugInteractableMat = scene.getMaterialByName("devDebugInteractableMat");
        if (!debugInteractableMat) {
            debugInteractableMat = new BABYLON.StandardMaterial("devDebugInteractableMat", scene);
            
            // [DEV MODE UPDATE] Blue-to-Red Heatmap Texture for Directional Debugging
            // Left (X-) is Blue, Right (X+) is Red.
            const texture = new BABYLON.DynamicTexture("heatmapTex", 256, scene);
            const ctx = texture.getContext();
            const grad = ctx.createLinearGradient(0, 0, 256, 0); // Horizontal Gradient
            grad.addColorStop(0, "blue"); // 0.0 (Left/X-)
            grad.addColorStop(1, "red");  // 1.0 (Right/X+)
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 256, 256);
            texture.update();

            debugInteractableMat.diffuseTexture = texture;
            debugInteractableMat.emissiveTexture = texture;
            debugInteractableMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Full emissive for visibility
            debugInteractableMat.alpha = 0.5; 
            debugInteractableMat.backFaceCulling = false;
        }

        scene.meshes.forEach((mesh: any) => {
            const lowerName = mesh.name.toLowerCase();
            
            // 1. Identify Invisible Blockers (Walls, Floor Colliders, etc)
            const isBlocker = lowerName.includes("collider") || 
                              lowerName.includes("hitbox") || 
                              lowerName.includes("foundation") || 
                              lowerName.includes("truck_wall") ||
                              lowerName.includes("truck_ceiling") ||
                              lowerName.includes("truck_bed");

            // 2. Identify Interactables
            // If it has interaction metadata, it's a target.
            const isInteractable = mesh.metadata && mesh.metadata.type;

            if (isDevMode) {
                if (isInteractable) {
                    // For visible meshes (Doors), use overlay
                    // [FIX] REVERT TRANSPARENCY: Keep meshes solid, just add overlay
                    // Previously we made them alpha=0.3, but now there are no internal hitboxes to see.
                    if (mesh.isVisible && mesh.visibility > 0.1) {
                        mesh.renderOverlay = true;
                        mesh.overlayColor = new BABYLON.Color3(0, 0, 1);
                        mesh.visibility = 1.0; 
                    } 
                } else if (isBlocker) {
                    // Show blocking volumes in Red
                    mesh.isVisible = true;
                    mesh.visibility = 0.3;
                    mesh.material = debugBlockerMat;
                }
            } else {
                // Turn off Dev Mode Visuals
                if (mesh.renderOverlay) {
                    mesh.renderOverlay = false;
                    // Reset visibility for normal meshes (Doors, etc)
                    if (isInteractable && !lowerName.includes("hitbox")) {
                        mesh.visibility = 1.0; 
                    }
                }
                
                // Hide invisible colliders again
                if (isBlocker || (isInteractable && (lowerName.includes("hitbox") || lowerName.includes("collider")))) {
                    // Special handling for truck blockers that need to block rays (visibility 0) vs completely hidden (isVisible false)
                    // If it was a blocker, it should be pickable but invisible.
                    if (lowerName.includes("truck") || lowerName.includes("foundation")) {
                        mesh.isVisible = true;
                        mesh.visibility = 0;
                    } else {
                        mesh.isVisible = false;
                    }
                }
            }
        });
        
        // Node Viewer Logic
        if (isDevMode) {
            // Check if we need to generate visuals
            if (debugNodeMeshesRef.current.length === 0 && houseLayoutRef.current?.navmesh?.nodes) {
                const nodes = houseLayoutRef.current.navmesh.nodes;
                const sphereMaster = BABYLON.MeshBuilder.CreateSphere("debug_node_master", { diameter: 0.3 }, scene);
                sphereMaster.setEnabled(false);
                
                const mat = new BABYLON.StandardMaterial("debug_node_mat", scene);
                mat.emissiveColor = new BABYLON.Color3(0, 1, 1); // Cyan
                mat.disableLighting = true;
                mat.alpha = 0.5;
                sphereMaster.material = mat;

                nodes.forEach((node: NavNode) => {
                    const clone = sphereMaster.clone(`debug_node_${node.id}`);
                    clone.position = new BABYLON.Vector3(node.position.x, node.position.y, node.position.z);
                    clone.setEnabled(true);
                    clone.isPickable = false;
                    clone.checkCollisions = false;
                    debugNodeMeshesRef.current.push(clone);
                });
                sphereMaster.dispose();
                console.log(`[DevMode] Visualizing ${nodes.length} NavNodes.`);
            }
        } else {
            // Cleanup visuals if Dev Mode turned off
            if (debugNodeMeshesRef.current.length > 0) {
                debugNodeMeshesRef.current.forEach(m => m.dispose());
                debugNodeMeshesRef.current = [];
            }
        }
        
        if (playerCameraRef.current) {
            if (isDevMode) {
                playerCameraRef.current.layerMask = ~(VIEWMODEL_LAYER_MASK); 
            } else {
                playerCameraRef.current.layerMask = ~(GHOST_ORB_LAYER_MASK | VIEWMODEL_LAYER_MASK);
            }
        }

    }, [componentProps.isDevMode, componentProps.gameState]); // [FIX] Added gameState dependency to re-trigger on load

    useEffect(() => {
        if (gameState === GameState.Loading) {
             debugNodeMeshesRef.current = []; // References are dead anyway if scene clears
        }
    }, [gameState]);

    useEffect(() => {
        const { devTeleportTarget, devGhostModelChange, ghostWorldCoordinates, playerCoordinates, currentRoomId } = componentProps;
        const { updateState, setGhostPath } = actions;

        if (devTeleportTarget) {
            if (devTeleportTarget === 'player_to_ghost' && ghostWorldCoordinates && playerRootRef.current) {
                const ghostPos = new BABYLON.Vector3(ghostWorldCoordinates.x, ghostWorldCoordinates.y + 1, ghostWorldCoordinates.z);
                playerRootRef.current.position.copyFrom(ghostPos);
                console.log('Teleported player to ghost.');
            } else if (devTeleportTarget === 'ghost_to_player' && playerCoordinates && ghostMeshRef.current) {
                if (currentRoomId !== null) {
                    const playerPos = new BABYLON.Vector3(playerCoordinates.x, playerCoordinates.y, playerCoordinates.z);
                    ghostMeshRef.current.position.copyFrom(playerPos);
                    setGhostPath(null);
                    updateState({ ghostAiState: 'wandering', isGhostIdle: true });
                    console.log('Teleported ghost to player.');
                } else {
                    console.warn('Teleport failed: Cannot teleport ghost outside.');
                }
            } else if (devTeleportTarget === 'secret_spawn' && playerRootRef.current) {
                if (secretSpawnPointsRef.current.length > 0) {
                    const spawn = secretSpawnPointsRef.current[0];
                    playerRootRef.current.position.copyFrom(spawn);
                }
            } else if (devTeleportTarget === 'truck' && playerRootRef.current) {
                playerRootRef.current.position.set(0, 1.0, -27); // Default truck pos
            }
            updateState({ devTeleportTarget: null });
        }

        if (devGhostModelChange && sceneRef.current) {
            const scene = sceneRef.current;
            const oldGhost = ghostMeshRef.current;
            const oldPosition = oldGhost ? oldGhost.position.clone() : new BABYLON.Vector3(0, 1, 0);

            if (oldGhost) {
                oldGhost.dispose();
            }

            BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}ghosts/${devGhostModelChange}`, "", scene, null, ".glb")
                .then((result: any) => {
                    const ghostRoot = result.rootNodes?.[0] || result.meshes?.[0];
                    if (ghostRoot) {
                        ghostMeshRef.current = ghostRoot;
                        ghostRoot.parent = gameContainerRef.current;
                        ghostRoot.scaling.setAll(1.0 * WORLD_SCALE);
                        ghostRoot.position = oldPosition;
                        ghostRoot.checkCollisions = true; 
                        ghostRoot.ellipsoid = new BABYLON.Vector3(0.15, 0.4, 0.15).scale(WORLD_SCALE);
                        ghostRoot.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0).scale(WORLD_SCALE);
                        ghostRoot.collisionGroup = COLLISION_GROUPS.GHOST;
                        ghostRoot.collisionMask = COLLISION_GROUPS.WALLS | COLLISION_GROUPS.DOORS;
                        
                        const allGhostMeshes = ghostRoot.getDescendants(false, (n: any) => n instanceof BABYLON.AbstractMesh);
                        if (ghostRoot instanceof BABYLON.AbstractMesh) allGhostMeshes.push(ghostRoot);
                        
                        const materials = new Set();
                        allGhostMeshes.forEach((m: any) => {
                            if (m.material) materials.add(m.material);
                            m.isPickable = false;
                        });
                        
                        materials.forEach((mat: any) => {
                            mat.disableLighting = false; 
                            mat.alpha = 0.3;
                            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                            mat.needDepthPrePass = true;
                            mat.backFaceCulling = false;
                        });
                        if (mainShadowGeneratorRef.current) mainShadowGeneratorRef.current.getShadowMap().renderList.push(ghostRoot);
                        
                        console.log(`Changed ghost model to ${devGhostModelChange}.`);
                    }
                });

            updateState({ devGhostModelChange: null });
        }

    }, [componentProps.devTeleportTarget, componentProps.devGhostModelChange, actions, componentProps.ghostWorldCoordinates, componentProps.playerCoordinates]);

    useEffect(() => {
        const { teleportGhostTo } = componentProps;
        if (teleportGhostTo && ghostMeshRef.current && houseContainerRef.current && houseLayoutRef.current) {
            if (teleportGhostTo === 'favorite_room') {
                const favRoomId = propsRef.current.ghostFavoriteRoomId;
                const favRoom = houseLayoutRef.current.rooms.find((r: Room) => r.id === favRoomId);
                if (favRoom) {
                    let spawnX = favRoom.x + favRoom.width / 2;
                    let spawnZ = favRoom.z + favRoom.depth / 2;
                    
                    const doors = houseLayoutRef.current.doors;
                    if (doors && doors.length > 0) {
                        const roomDoors = doors.filter((door: any) => {
                            const wallThickness = 0.2;
                            const onX = Math.abs(door.x - favRoom.x) < wallThickness || Math.abs(door.x - (favRoom.x + favRoom.width)) < wallThickness;
                            const onZ = Math.abs(door.z - favRoom.z) < wallThickness || Math.abs(door.z - (favRoom.z + favRoom.depth)) < wallThickness;
                            const inXSpan = door.x >= favRoom.x && door.x <= favRoom.x + favRoom.width;
                            const inZSpan = door.z >= favRoom.z && door.z <= favRoom.z + favRoom.depth;
                            return (onX && inZSpan) || (onZ && inZSpan);
                        });
                        if (roomDoors.length > 0) {
                            const chosenDoor = roomDoors[Math.floor(Math.random() * roomDoors.length)];
                            
                            let nudgeX = 0;
                            let nudgeZ = 0;
                            const nudgeDist = 0.5;

                            if (Math.abs(chosenDoor.x - favRoom.x) < 0.2) {
                                nudgeX = nudgeDist;
                            } else if (Math.abs(chosenDoor.x - (favRoom.x + favRoom.width)) < 0.2) {
                                nudgeX = -nudgeDist;
                            } else if (Math.abs(chosenDoor.z - favRoom.z) < 0.2) {
                                nudgeZ = nudgeDist;
                            } else if (Math.abs(chosenDoor.z - (favRoom.z + favRoom.depth)) < 0.2) {
                                nudgeZ = -nudgeDist;
                            }

                            spawnX = chosenDoor.x + nudgeX;
                            spawnZ = chosenDoor.z + nudgeZ;
                        }
                    }

                    const localPos = new BABYLON.Vector3(spawnX, 1.0, spawnZ);
                    const worldPos = BABYLON.Vector3.TransformCoordinates(localPos, houseContainerRef.current.getWorldMatrix());
                    ghostMeshRef.current.position = worldPos;
                    propsRef.current.actions.updateState({ 
                        ghostCoordinates: { x: localPos.x, y: localPos.y, z: localPos.z },
                        ghostWorldCoordinates: { x: worldPos.x, y: worldPos.y, z: worldPos.z }
                    });
                }
            }
            propsRef.current.actions.updateState({ teleportGhostTo: null, ghostPath: null, isGhostIdle: true });
        }
    }, [componentProps.teleportGhostTo]);

    useEffect(() => {
        equippedItemVersionRef.current++;
        const effectVersion = equippedItemVersionRef.current;
        const scene = sceneRef.current;
        const viewModelCam = viewModelCameraRef.current;
        const heldItemParent = heldItemParentRef.current;
    
        if (equippedItemMeshRef.current) {
            if (equippedItemIsCloneRef.current) {
                equippedItemMeshRef.current.dispose(); 
            } else {
                equippedItemMeshRef.current.parent = null;
                equippedItemMeshRef.current.setEnabled(false);
            }
            equippedItemMeshRef.current = null;
            equippedItemIsCloneRef.current = false;
        }
        if (itemManagerRef.current) {
            itemManagerRef.current.setActiveItem(null, null, propsRef.current.graphicsQuality);
        }
        
        const equippedItem = propsRef.current.equippedItem;
        
        let initialCameraState = null;
        if (equippedItem && equippedItem.id === ItemId.VideoCamera) {
            initialCameraState = { isOn: true, isIR: false };
        }
        propsRef.current.onUpdateHeldCameraState(initialCameraState); 
    
        // [FIX] Ensure we don't try to load items if the engine/scene/camera isn't fully ready
        if (!isInitialized || !equippedItem || !equippedItem.modelUrl || !scene || !viewModelCam || !heldItemParent) {
            if (heldItemParent) {
                heldItemParent.position = BABYLON.Vector3.Zero();
                heldItemParent.rotation = BABYLON.Vector3.Zero();
            }
            return; 
        }
    
        if (equippedItem.id === ItemId.VideoCamera) {
            heldItemParent.position = new BABYLON.Vector3(0.35, -0.4, 1.0);
            heldItemParent.rotation = new BABYLON.Vector3(Math.PI / 12, -Math.PI / 8, 0);
        } else if (equippedItem.id === ItemId.Lighter) {
            heldItemParent.position = new BABYLON.Vector3(0.15, -0.25, 0.7);
            heldItemParent.rotation = new BABYLON.Vector3(0, Math.PI - 0.1, 0);
        } else {
            heldItemParent.position = new BABYLON.Vector3(0.15, -0.25, 0.7);
            heldItemParent.rotation = new BABYLON.Vector3(0, -0.1, 0);
        }

        const setupEquippedItem = (rootMesh: any, isClone: boolean) => {
            equippedItemMeshRef.current = rootMesh;
            equippedItemIsCloneRef.current = isClone;
            
            rootMesh.parent = heldItemParent;
            rootMesh.position = BABYLON.Vector3.Zero();
            rootMesh.rotation = BABYLON.Vector3.Zero();
            
            if (equippedItem.id === ItemId.VideoCamera) {
                rootMesh.rotation.y = Math.PI; 
            }
            
            rootMesh.setEnabled(true);

            const allMeshes = [rootMesh, ...rootMesh.getDescendants(false)];
            allMeshes.forEach((m: any) => {
                if (m instanceof BABYLON.AbstractMesh) {
                    m.isVisible = true; 
                    m.layerMask = VIEWMODEL_LAYER_MASK;
                    m.isPickable = false;
                    m.checkCollisions = false; 
                    if (mainShadowGeneratorRef.current) mainShadowGeneratorRef.current.removeShadowCaster(m);
                }
            });

            if (itemManagerRef.current) {
                itemManagerRef.current.setActiveItem(equippedItem, rootMesh, propsRef.current.graphicsQuality);
            }
        };
    
        if (viewModelCacheRef.current.has(equippedItem.modelUrl)) {
            const cachedData = viewModelCacheRef.current.get(equippedItem.modelUrl);
            if (cachedData && cachedData.mesh) {
                if (equippedItem.meshName) {
                    const descendants = cachedData.mesh.getDescendants(false);
                    const specificMesh = descendants.find((m: any) => m.name === equippedItem.meshName);
                    if (specificMesh) {
                        const clone = specificMesh.instantiateHierarchy();
                        clone.scaling = BABYLON.Vector3.One();
                        setupEquippedItem(clone, true);
                        return;
                    } else {
                        console.warn(`[GameCanvas] Cached model for ${equippedItem.modelUrl} missing mesh '${equippedItem.meshName}'.`);
                    }
                } else {
                    if (!cachedData.mesh.isDisposed()) {
                        setupEquippedItem(cachedData.mesh, false);
                        return;
                    }
                }
            }
        }

        BABYLON.SceneLoader.ImportMeshAsync(null, equippedItem.modelUrl, "", scene, null, ".glb")
            .then((result: any) => {
                if (effectVersion !== equippedItemVersionRef.current || !result.meshes[0]) {
                    result.meshes.forEach((m: any) => m.dispose());
                    return; 
                }
    
                const rootMesh = result.meshes[0];
                const anims = result.animationGroups ? [...result.animationGroups] : [];
                
                viewModelCacheRef.current.set(equippedItem.modelUrl, { mesh: rootMesh, anims });
                
                if (equippedItem.meshName) {
                    const specificMesh = result.meshes.find((m: any) => m.name === equippedItem.meshName);
                    if (specificMesh) {
                        const clone = specificMesh.instantiateHierarchy();
                        clone.scaling = BABYLON.Vector3.One();
                        
                        rootMesh.setEnabled(false);
                        const allDescendants = rootMesh.getDescendants(false);
                        allDescendants.forEach((m: any) => {
                            m.isVisible = false;
                            m.isPickable = false;
                            m.checkCollisions = false;
                        });

                        setupEquippedItem(clone, true);
                        return;
                    }
                }

                setupEquippedItem(rootMesh, false);
    
            }).catch((e: any) => console.error(`Failed to load equipped item ${equippedItem.name}:`, e));
    
    }, [componentProps.equippedItem, isInitialized]); // Added isInitialized to ensure we retry after engine boot

    useEffect(() => {
        if (soundManagerRef.current) {
            soundManagerRef.current.setAmbientVolume(componentProps.ambientVolume);
        }
    }, [componentProps.ambientVolume]);
    
    useEffect(() => {
        if (soundManagerRef.current) {
            soundManagerRef.current.setSfxVolume(componentProps.sfxVolume);
        }
    }, [componentProps.sfxVolume]);

    useEffect(() => {
        const camera = playerCameraRef.current;
        if (camera && camera.inputs.attached.mouse) {
            camera.inputs.attached.mouse.angularSensibilityX = 5000 / mouseSensitivity;
            camera.inputs.attached.mouse.angularSensibilityY = 5000 / mouseSensitivity;
        }
    }, [mouseSensitivity]);
    
    useEffect(() => {
        const camera = playerCameraRef.current;
        if (camera && camera.inputs.attached.touch) {
            camera.inputs.attached.touch.touchAngularSensibility = 5000 / touchSensitivity;
        }
    }, [touchSensitivity]);

    useEffect(() => {
        if (componentProps.isAudioUnlocked && BABYLON.Engine.audioEngine) {
            if (!BABYLON.Engine.audioEngine.isUnlocked) {
                console.log("[GameCanvas] Attempting to unlock audio engine.");
                BABYLON.Engine.audioEngine.unlock();
            }
        }
    }, [componentProps.isAudioUnlocked]);

    useEffect(() => {
        soundManagerRef.current?.setMuted(componentProps.isMuted);
    }, [componentProps.isMuted]);

    useEffect(() => {
        const { isHunting, mansionLayout, isDevMode, selectedGhost } = componentProps;
        const { actions } = componentProps;
    
        if (isHunting) {
            if (!wasHuntingRef.current) { 
                updateGhostVisuals(ghostMeshRef.current, 1.0, false);
                
                const isRaiju = selectedGhost?.name === 'Raiju';
                soundManagerRef.current?.playHuntVocalization(isRaiju, ghostMeshRef.current);

                // [FIX] Hunt Start: Force Lock Front Door
                if (mansionLayout) {
                    const frontDoorId = mansionLayout.doors.findIndex((d: any) => d.isFrontDoor);
                    if (frontDoorId !== -1) {
                        actions.updateState({ 
                            paranormalEvent: { type: 'hunt_door_slam', doorId: frontDoorId, id: Math.random() } 
                        });
                    }
                }
            }
        } else {
            const targetAlpha = isDevMode ? 0.3 : 0.0;
            updateGhostVisuals(ghostMeshRef.current, targetAlpha, false);

            if (wasHuntingRef.current) { 
                soundManagerRef.current?.stopHeartbeat();
                soundManagerRef.current?.setHeartbeatPlaybackRate(1.0);
                soundManagerRef.current?.stopHuntVocalization(); 
        
                const frontDoorId = mansionLayout?.doors.findIndex((d: any) => d.isFrontDoor);
                if (frontDoorId !== undefined && frontDoorId !== -1) {
                    const doorState = doorStatesRef.current.get(frontDoorId);
                    if (doorState) {
                        doorState.isLocked = false;
                        doorState.hasBeenOpened = false;
                    }
                }
                
                lastKnownPlayerPositionRef.current = null;
            }
        }
    
        wasHuntingRef.current = isHunting;
    
    }, [componentProps.isHunting, componentProps.isDevMode, updateGhostVisuals, componentProps.selectedGhost]);

    useEffect(() => {
        const { paranormalEvent, mansionLayout, selectedGhost } = propsRef.current;
        const { toggleLight, toggleBreaker, disableLight, updateState, triggerEmfEvent } = propsRef.current.actions;
        if (!paranormalEvent || !sceneRef.current) return;
        
        if (activeGhostEventRef.current) {
            updateState({ paranormalEvent: null });
            return;
        }
 
        const { type, doorId, objectId, roomId } = paranormalEvent;
        const soundManager = soundManagerRef.current;
        const scene = sceneRef.current;

        const flickerLightRed = (rId: number, duration: number) => {
            const roomLightData = roomLightsRef.current.get(rId);
            if (!roomLightData || !roomLightData.light || propsRef.current.disabledLights.has(rId)) return;
            
            const { light, fixtureMaterial } = roomLightData;
            const originalColor = light.diffuse.clone();
            
            light.setEnabled(true);
            light.diffuse = new BABYLON.Color3(1, 0, 0); 
            
            const flickerInterval = setInterval(() => {
                if (!scene || scene.isDisposed) {
                    clearInterval(flickerInterval);
                    return;
                }
                if (light.isDisposed()) return; 
                const flickerOn = Math.random() > 0.3;
                light.intensity = flickerOn ? 0.6 : 0; 
                if (fixtureMaterial) {
                    fixtureMaterial.emissiveColor = flickerOn ? new BABYLON.Color3(1, 0, 0) : new BABYLON.Color3(0, 0, 0);
                }
            }, 100);
        
            setTimeout(() => {
                clearInterval(flickerInterval);
                if (!scene || scene.isDisposed) {
                    return;
                }
                
                const state = propsRef.current;
                light.diffuse = originalColor;
        
                if (state.isBreakerOn) {
                    light.setEnabled(true);
                    const isSwitchOn = state.lightStates[rId] === true;
                    light.intensity = isSwitchOn ? 0.9 : 0;
                    if (fixtureMaterial) {
                        fixtureMaterial.emissiveColor = isSwitchOn ? new BABYLON.Color3(1.0, 1.0, 1.0) : new BABYLON.Color3(0, 0, 0);
                    }
                } else {
                    light.setEnabled(false);
                    light.intensity = 0;
                    if (fixtureMaterial) {
                        fixtureMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    }
                }
            }, duration);
        };

        const spawnFingerprint = (mesh: any, isSwitch: boolean) => {
            if (!mesh) return;

            const isObake = selectedGhost?.name === 'Obake';
            if (isObake && Math.random() < 0.3) return; 

            const roll = Math.random();
            const isSpecial = isObake && roll < 0.167;

            let texturePath = '';
            if (isSwitch) {
                texturePath = isSpecial ? `${TEXTURE_ROOT}uv_obake_fingerprint.png` : `${TEXTURE_ROOT}uv_fingerprint.png`;
            } else {
                texturePath = isSpecial ? `${TEXTURE_ROOT}uv_obake_handprint.png` : `${TEXTURE_ROOT}uv_handprint.png`;
            }

            const decalSize = isSwitch ? 0.1 : 0.25;
            const decal = BABYLON.MeshBuilder.CreatePlane("uv_evidence_decal", { size: decalSize }, scene);
            decal.parent = mesh;
            
            if (isSwitch) {
                decal.position = new BABYLON.Vector3(0, 0, -0.055); 
                decal.rotation = new BABYLON.Vector3(0, 0, 0); 
            } else {
                const xOffset = (Math.random() - 0.5) * 0.4;
                const yOffset = (Math.random() - 0.5) * 0.4;
                decal.position = new BABYLON.Vector3(xOffset, yOffset + 1.2, -0.052); 
                decal.rotation = new BABYLON.Vector3(0, 0, 0);
            }

            const material = new BABYLON.StandardMaterial("uv_evidence_mat", scene);
            material.diffuseTexture = new BABYLON.Texture(texturePath, scene, { loaderOptions: { crossOrigin: "anonymous" } });
            material.diffuseTexture.hasAlpha = true;
            
            material.useAlphaFromDiffuseTexture = true;
            material.alphaMode = BABYLON.Engine.ALPHA_ADD; 
            
            material.disableLighting = false; 
            material.diffuseColor = BABYLON.Color3.White(); 
            material.emissiveColor = BABYLON.Color3.Black(); 
            material.specularColor = BABYLON.Color3.Black(); 
            
            decal.layerMask = UV_EVIDENCE_LAYER_MASK; 
            decal.material = material;

            uvEvidenceMeshesRef.current.push({ mesh: decal, timestamp: performance.now() });
        };

        switch (type) {
            case 'force_evidence':
                if (ghostMeshRef.current) {
                    const ghostPos = ghostMeshRef.current.getAbsolutePosition();
                    const { placedItems, equippedItem } = propsRef.current;
                    const itemsToCheck = [...placedItems];
                    
                    if (equippedItem) {
                        itemsToCheck.push({ ...equippedItem, position: playerRootRef.current.position, instanceId: -1, rotation: {x:0,y:0,z:0} } as any);
                    }

                    const nearbyItems = itemsToCheck.filter(i => {
                        if (i.instanceId === -1) return true; 
                        const dist = BABYLON.Vector3.Distance(
                            new BABYLON.Vector3(i.position.x, i.position.y, i.position.z),
                            ghostPos
                        );
                        return dist < 6 * WORLD_SCALE;
                    });

                    nearbyItems.forEach(item => {
                        switch(item.id) {
                            case ItemId.EMFReader:
                                triggerEmfEvent({ position: { x: ghostPos.x, y: ghostPos.y, z: ghostPos.z }, level: 5 });
                                break;
                            case ItemId.SpiritBox:
                                if (soundManager) soundManager.playSpiritBoxResponse(ghostPos);
                                break;
                            case ItemId.DOTSProjector:
                                dotsManifestTimerRef.current = 5000;
                                updateGhostVisuals(ghostMeshRef.current, 0.4, true);
                                break;
                            case ItemId.GhostWritingBook:
                                if (item.instanceId !== -1 && !item.writingData) {
                                    const writingType = Math.random() < 0.5 ? 'drawing1' : 'drawing2';
                                    actions.updatePlacedItem({ ...item, writingData: writingType });
                                    if(soundManager) {
                                        const bookPos = new BABYLON.Vector3(item.position.x, item.position.y, item.position.z);
                                        soundManager.playGhostWriting(bookPos);
                                    }
                                }
                                break;
                            case ItemId.UVLight:
                                let bestTarget: any = null;
                                let minDst = Infinity;
                                
                                doorPivotsRef.current.forEach((pivot, id) => {
                                    const root = pivot.rootNode || pivot;
                                    const d = BABYLON.Vector3.Distance(root.getAbsolutePosition(), ghostPos);
                                    if(d < minDst) { minDst = d; bestTarget = { mesh: root, isSwitch: false }; }
                                });
                                
                                lightSwitchesRef.current.forEach((data, id) => {
                                    if(data.switchNode) {
                                        const d = BABYLON.Vector3.Distance(data.switchNode.getAbsolutePosition(), ghostPos);
                                        if(d < minDst) { minDst = d; bestTarget = { mesh: data.switchNode, isSwitch: true }; }
                                    }
                                });

                                if(bestTarget && minDst < 4 * WORLD_SCALE) {
                                    spawnFingerprint(bestTarget.mesh, bestTarget.isSwitch);
                                }
                                break;
                        }
                    });
                }
                break;
            case 'breaker_overload': {
                const breakerBoxMesh = scene.getTransformNodeByName("breakerBox");
                if (breakerBoxMesh) soundManager?.playCircuitBreaker(breakerBoxMesh.getAbsolutePosition());
                break;
            }
            case 'spirit_box_response':
                if (ghostMeshRef.current && soundManager) {
                    soundManager.playSpiritBoxResponse(ghostMeshRef.current.getAbsolutePosition());
                }
                break;
            case 'ghost_teleport':
            case 'ghost_sound':
                if (ghostMeshRef.current && soundManager) {
                    soundManager.playGhostManifestSound(ghostMeshRef.current.getAbsolutePosition());
                    triggerEmfEvent({ position: ghostMeshRef.current.position, level: 4 });
                }
                break;
            case 'ghost_mist_form':
                if (ghostMeshRef.current && mistFormMeshRef.current && soundManager) {
                    const ghostRoomId = propsRef.current.ghostCurrentRoomId;
                    const playerRoomId = propsRef.current.currentRoomId;
                    
                    if (ghostRoomId !== null && playerRoomId !== null && mansionLayout?.navmesh) {
                         const startNode = mansionLayout.navmesh.nodes.find((n: NavNode) => n.type === 'room' && n.roomId === ghostRoomId);
                         const endNode = mansionLayout.navmesh.nodes.find((n: NavNode) => n.type === 'room' && n.roomId === playerRoomId);
                         
                         if (startNode && endNode) {
                             const pathIds = findPathBFS(mansionLayout.navmesh.graph, startNode.id, endNode.id);
                             if (pathIds) {
                                 const nodes = pathIds.map((id: number) => mansionLayout.navmesh.nodes.find((n: NavNode) => n.id === id)!);
                                 mistPathRef.current = nodes;
                             } else {
                                 mistPathRef.current = [];
                             }
                         }
                    } else {
                        mistPathRef.current = []; 
                    }

                    activeGhostEventRef.current = true;
                    activeGhostEventTypeRef.current = 'ghost_mist_form';
                    
                    mistFormMeshRef.current.position.copyFrom(ghostMeshRef.current.position);
                    
                    if (playerRootRef.current) {
                        mistFormMeshRef.current.lookAt(playerRootRef.current.position);
                    }
                    
                    mistFormMeshRef.current.setEnabled(true);
                    updateGhostVisuals(mistFormMeshRef.current, 0.6, false); 
                    ghostMeshRef.current.setEnabled(false);
                    
                    triggerEmfEvent({ position: ghostMeshRef.current.position, level: 4 });

                    if (mistBreathSystemRef.current) {
                        mistBreathSystemRef.current.emitter = mistFormMeshRef.current;
                        if (!mistBreathSystemRef.current.isStarted()) {
                            mistBreathSystemRef.current.start();
                        }
                    }
                }
                break;
            case 'fake_hunt':
                if (ghostMeshRef.current && playerRootRef.current && soundManager) {
                    activeGhostEventRef.current = true;
                    activeGhostEventTypeRef.current = 'fake_hunt';

                    const playerPos = playerRootRef.current.position;
                    
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 13 * WORLD_SCALE; 
                    const spawnOffset = new BABYLON.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
                    const spawnPos = playerPos.add(spawnOffset);
                    spawnPos.y = playerPos.y; 

                    ghostMeshRef.current.position = spawnPos;
                    ghostMeshRef.current.lookAt(playerPos);
                    
                    ghostMeshRef.current.setEnabled(true);
                    updateGhostVisuals(ghostMeshRef.current, 1.0, false);
                    
                    if (ghostIdleMeshRef.current) {
                        ghostIdleMeshRef.current.setEnabled(false);
                    }
                    
                    const frontDoorId = mansionLayout?.doors.findIndex((d: any) => d.isFrontDoor);
                    if (frontDoorId !== undefined && frontDoorId !== -1) {
                        const doorData = doorPivotsRef.current.get(frontDoorId);
                        const doorState = doorStatesRef.current.get(frontDoorId);
                        const doorDef = mansionLayout?.doors[frontDoorId];

                        if (doorData && doorState && doorDef) {
                            if (doorState.isOpen) {
                                // [FIX] Handle PreAnimated Closing (Was IsDoubleDoor)
                                if (doorData.isPreAnimated) {
                                     const { leftAnim, rightAnim } = doorData;
                                     if (leftAnim && rightAnim) {
                                         leftAnim.stop(); rightAnim.stop();
                                         const speedRatio = 2.5; 
                                         leftAnim.start(false, speedRatio, leftAnim.to, leftAnim.from, false);
                                         rightAnim.start(false, speedRatio, rightAnim.to, rightAnim.from, false);
                                     }
                                }
                                doorState.isOpen = false;
                                // Note: Fake hunt does NOT lock the door
                                
                                const doorPosition = new BABYLON.Vector3(doorDef.x, 1, doorDef.z);
                                soundManager.playDoorSlam(doorPosition);
                            }
                        }
                    }

                    const isRaiju = selectedGhost?.name === 'Raiju';
                   soundManager.setHeartbeatVolume(1.0);
                    if (isRaiju) soundManager.setHeartbeatPlaybackRate(0.7);
                    soundManager.playHeartbeat(isRaiju);

                    // [FIX] SAFETY: Add timeout to end fake hunt, otherwise it loops forever
                    setTimeout(() => {
                        if (activeGhostEventRef.current && activeGhostEventTypeRef.current === 'fake_hunt') {
                            console.log("[GhostEvent] Ending fake hunt.");
                            handleGhostEventEnd();
                            updateState({ activeGhostEvent: null });
                        }
                    }, 5000); // 5 seconds duration
                }
                break;
            case 'ghost_singing':
                if (ghostMeshRef.current && playerRootRef.current && soundManager) {
                    const safePos = calculateSafeManifestPosition();
                    if (!safePos) {
                        updateState({ activeGhostEvent: null, paranormalEvent: null });
                        return;
                    }
                    
                    activeGhostEventRef.current = true;
                    activeGhostEventTypeRef.current = 'ghost_singing';
                    
                    const spawnPos = safePos;

                    ghostMeshRef.current.position = spawnPos;
                    ghostMeshRef.current.lookAt(playerRootRef.current.position);
                    ghostMeshRef.current.setEnabled(false); 

                    if (ghostIdleMeshRef.current) {
                        ghostIdleMeshRef.current.position.copyFrom(spawnPos);
                        ghostIdleMeshRef.current.lookAt(playerRootRef.current.position);
                        ghostIdleMeshRef.current.setEnabled(true);
                        updateGhostVisuals(ghostIdleMeshRef.current, 1.0, false);
                    } else {
                        ghostMeshRef.current.setEnabled(true);
                        updateGhostVisuals(ghostMeshRef.current, 1.0, false);
                    }

                    const isRaiju = selectedGhost?.name === 'Raiju';
                    soundManager.playHeartbeat(isRaiju);

                    soundManager.playGhostSing(spawnPos, handleGhostEventEnd);
                    
                    // [FIX] SAFETY: Add fallback timeout in case audio callback fails
                    // This prevents "Infinite Loop" if sound doesn't play or browser blocks it
                    setTimeout(() => {
                        if (activeGhostEventRef.current && activeGhostEventTypeRef.current === 'ghost_singing') {
                            console.warn("[GhostEvent] Forced end of singing event via safety timeout.");
                            handleGhostEventEnd();
                            updateState({ activeGhostEvent: null });
                        }
                    }, 15000); // 15s max duration for safety
                    
                    triggerEmfEvent({ position: spawnPos, level: 4 });
                }
                break;
           case 'hunt_door_slam':
            case 'door_interaction':
                if (doorId !== undefined) {
                    const doorData = doorPivotsRef.current.get(doorId);
                    const doorState = doorStatesRef.current.get(doorId);
                    const doorDef = mansionLayout?.doors[doorId];
                    
                    if (doorData && doorState && doorDef) {
                        const doorPosition = new BABYLON.Vector3(doorDef.x, 1, doorDef.z);
                        
                        // [FIX] Removed deprecated isDoubleDoor logic
                        // If it's pre-animated (Front Door), use animation groups
                        if (doorState.isPreAnimated) {
                            const { leftAnim, rightAnim, rootNode } = doorData;
                            if (leftAnim && rightAnim) {
                                leftAnim.stop();
                                rightAnim.stop();
                                const speedRatio = (type === 'hunt_door_slam') ? 2.5 : 1.0;
                                const loop = false;

                                if (type === 'hunt_door_slam' || doorState.isOpen) {
                                    // Close: To -> From
                                    leftAnim.start(loop, speedRatio, leftAnim.to, leftAnim.from, false);
                                    rightAnim.start(loop, speedRatio, rightAnim.to, rightAnim.from, false);
                                    doorState.isOpen = false;
                                } else {
                                    // Open: From -> To
                                    leftAnim.start(loop, speedRatio, rightAnim.from, rightAnim.to, false);
                                    rightAnim.start(loop, speedRatio, rightAnim.from, rightAnim.to, false);
                                    doorState.isOpen = true;
                                }
                                spawnFingerprint(rootNode, false);
                            }
                        } else {
                            const doorPivot = doorData;
                            let targetAngle;
                            
                            if (type === 'hunt_door_slam' || doorState.isOpen) {
                                targetAngle = 0; 
                            } else {
                                const ghostPosWorld = propsRef.current.ghostWorldCoordinates;
                                const houseContainer = houseContainerRef.current;
                                
                                if (ghostPosWorld && houseContainer) {
                                    const invMatrix = houseContainer.getWorldMatrix().clone().invert();
                                    const ghostLocalPos = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(ghostPosWorld.x, ghostPosWorld.y, ghostPosWorld.z), invMatrix);

                                    const doorPos = doorDef;
                                    if (doorDef.isVertical) {
                                        targetAngle = (ghostLocalPos.x > doorPos.x) ? Math.PI / 2 : -Math.PI / 2;
                                    } else {
                                        targetAngle = (ghostLocalPos.z > doorPos.z) ? -Math.PI / 2 : Math.PI / 2;
                                    }
                                } else {
                                    targetAngle = Math.PI / 2; 
                                }
                            }

                            // [FIX] LoopMode CONSTANT (2)
                            BABYLON.Animation.CreateAndStartAnimation(`door_anim_${doorId}`, doorPivot, 'rotation.y', 60, 15, doorPivot.rotation.y, targetAngle, 2);
                            doorState.isOpen = !(type === 'hunt_door_slam' || doorState.isOpen);
                            spawnFingerprint(doorPivot, false);
                        }
                        
                        if (type === 'hunt_door_slam') {
                            doorState.isLocked = true;
                            soundManager?.playDoorSlam(doorPosition);
                            setTimeout(() => soundManager?.playDoorLock(doorPosition), 250);
                        } else {
                            soundManager?.playDoorCreak(doorPosition);
                        }
                    }
                }
                break;
            case 'light_toggle':
                if (roomId !== undefined) {
                    const lightSwitchMesh = scene.getTransformNodeByName(`light_switch_${roomId}`);
                    if(lightSwitchMesh) {
                        soundManager?.playLightSwitch(lightSwitchMesh.getAbsolutePosition());
                        spawnFingerprint(lightSwitchMesh, true);
                    }
                    toggleLight(roomId);
                }
                break;
            case 'breaker_toggle':
                const breakerBoxMesh = scene.getTransformNodeByName("breakerBox");
                if (breakerBoxMesh) soundManager?.playCircuitBreaker(breakerBoxMesh.getAbsolutePosition());
                toggleBreaker();
                break;
            case 'light_bulb_pop':
                 if (roomId !== undefined) {
                    const roomLightData = roomLightsRef.current.get(roomId);
                    if(roomLightData?.fixture) soundManager?.playBulbPop(roomLightData.fixture.position);
                    disableLight(roomId);
                }
                break;
            case 'object_throw':
                if (objectId !== undefined) {
                    let thrownObjectMesh = interactableMeshesRef.current.get(objectId);
                    
                    // [FIX] Fallback to placed items (like Plates) if not a static interactable
                    if (!thrownObjectMesh) {
                        thrownObjectMesh = placedMeshesRef.current.get(objectId);
                    }

                    if (thrownObjectMesh && thrownObjectMesh.physicsImpostor) {
                        soundManager?.playTossSound(thrownObjectMesh.getAbsolutePosition());
                        thrownObjectMesh.physicsImpostor.wakeUp();
                        const ghostPos = ghostMeshRef.current.getAbsolutePosition();
                        const objectPos = thrownObjectMesh.getAbsolutePosition();
                        let throwDirection = objectPos.subtract(ghostPos).normalize();
                        throwDirection.y += Math.random() * 0.5 + 0.3; 
                        throwDirection.x += (Math.random() - 0.5) * 0.5;
                        throwDirection.z += (Math.random() - 0.5) * 0.5;
                        throwDirection.normalize();
                        const throwForce = Math.random() * 3 + 2; 
                        thrownObjectMesh.physicsImpostor.applyImpulse(throwDirection.scale(throwForce), objectPos);
                    }
                }
                break;
            case 'radio_toggle':
                if (objectId !== undefined) {
                    const radioMesh = interactableMeshesRef.current.get(objectId);
                    if(radioMesh) soundManager?.playRadioSound(radioMesh.getAbsolutePosition());
                }
                break;
            case 'phonograph_toggle': {
                const { isPhonographOn } = propsRef.current;
                if (!isPhonographOn) {
                    propsRef.current.actions.playerInteractPhonograph();
                    
                    if (phonographMeshRef.current && phonographMeshRef.current.mesh) {
                        soundManager?.playRadioSound(phonographMeshRef.current.mesh.getAbsolutePosition()); 
                    }
                }
                break;
            }
            case 'ghost_manifest':
                if (ghostMeshRef.current && playerCameraRef.current && roomId !== undefined) {
                    const safePos = calculateSafeManifestPosition();
                    if (!safePos) {
                        updateState({ activeGhostEvent: null, paranormalEvent: null });
                        return;
                    }

                    activeGhostEventRef.current = true;
                    activeGhostEventTypeRef.current = 'ghost_manifest';
                    
                    updateState({ activeGhostEvent: { startTime: performance.now(), duration: 10000 } });

                    const camera = playerCameraRef.current;
                    const originalPos = ghostMeshRef.current.position.clone();

                    const manifestPosition = safePos;
                    
                    ghostMeshRef.current.position = manifestPosition;
                    ghostMeshRef.current.lookAt(playerRootRef.current.position); 
                    
                    ghostMeshRef.current.setEnabled(true);
                    updateGhostVisuals(ghostMeshRef.current, 1.0, false);

                    const isRaiju = selectedGhost?.name === 'Raiju';
                    soundManager?.playHeartbeat(isRaiju);

                    const isSinging = Math.random() > 0.5;
                    if (isSinging) {
                        soundManager?.playGhostSing(manifestPosition);
                    } else {
                        soundManager?.playGhostManifestSound(manifestPosition);
                    }
                    
                    triggerEmfEvent({ position: manifestPosition, level: 4 });

                    flickerLightRed(roomId, 10000);

                    setTimeout(() => {
                        soundManager?.stopHeartbeat();
                        soundManager?.stopGhostSing();
                        
                        if (Math.random() < 0.3) {
                             if (roomLightsRef.current.get(roomId)?.fixture) {
                                 soundManager?.playBulbPop(roomLightsRef.current.get(roomId).fixture.position);
                             }
                             disableLight(roomId);
                        }

                        handleGhostEventEnd(); 
                        updateState({ activeGhostEvent: null }); 
                        
                        if (ghostMeshRef.current) {
                            const endAlpha = propsRef.current.isDevMode ? 0.3 : 0.0;
                            updateGhostVisuals(ghostMeshRef.current, endAlpha, false);
                            ghostMeshRef.current.position = originalPos; 
                        }
                    }, 10000);
                }
                break;

            case 'summoning_circle_manifest':
                if (ghostMeshRef.current && roomId !== undefined) {
                    activeGhostEventRef.current = true;
                    activeGhostEventTypeRef.current = 'summoning_circle_manifest';
                    
                    // Duration handled by Handler or Hunt start, but set safety here
                    updateState({ activeGhostEvent: { startTime: performance.now(), duration: 6000 } });

                    // Do NOT move ghost. Handler placed it at circle.
                    // Just make visible and play effects.
                    
                    ghostMeshRef.current.setEnabled(true);
                    updateGhostVisuals(ghostMeshRef.current, 1.0, false);

                    const isRaiju = selectedGhost?.name === 'Raiju';
                    soundManager?.playHeartbeat(isRaiju);
                    soundManager?.playGhostManifestSound(ghostMeshRef.current.position);
                    
                    triggerEmfEvent({ position: ghostMeshRef.current.position, level: 4 });

                    // No auto-end timeout here; waiting for Hunt to start or Handler to clear.
                    // But add a safety fallback just in case hunt fails
                    setTimeout(() => {
                        if (!propsRef.current.isHunting) {
                            handleGhostEventEnd();
                            updateState({ activeGhostEvent: null });
                        }
                    }, 7000);
                }
                break;
        }

        updateState({ paranormalEvent: null });
        
    }, [componentProps.paranormalEvent, updateGhostVisuals, handleGhostEventEnd, onGhostEventCollision, calculateSafeManifestPosition]);

    useEffect(() => {
        const { isPhonographOn, phonographPlayingSong } = componentProps;
        const soundManager = soundManagerRef.current;
        const phonograph = phonographMeshRef.current;

        if (!soundManager || !phonograph || !phonograph.mesh || phonograph.mesh.isDisposed()) return;

        const playAnim = phonograph.anims.find((ag: any) => ag.name?.toLowerCase().includes('action')) ||
                         phonograph.anims.find((ag: any) => ag.name?.toLowerCase().includes('anim')) ||
                         (phonograph.anims.length > 0 ? phonograph.anims[0] : null);

        const handleSongEnd = () => {
            propsRef.current.actions.updateState({ isPhonographOn: false, phonographPlayingSong: null });
        };

        if (isPhonographOn && phonographPlayingSong) {
            const onEndCallback = (phonographPlayingSong !== 'radio') ? handleSongEnd : undefined;
            soundManager.playPhonographSound(phonographPlayingSong, phonograph.mesh.getAbsolutePosition(), onEndCallback);
        } else {
            soundManager.stopAllPhonographSounds();
        }

        if (playAnim) {
            if (isPhonographOn) {
                if (!playAnim.isPlaying) {
                    playAnim.start(true, 1.0, playAnim.from, playAnim.to, false);
                }
            } else {
                if (playAnim.isPlaying) {
                    playAnim.stop();
                    playAnim.goToFrame(playAnim.from);
                }
            }
        }
    }, [componentProps.isPhonographOn, componentProps.phonographPlayingSong]);

    return (
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full outline-none" 
            style={{ width: '100%', height: '100%' }}
            id="renderCanvas"
            touch-action="none"
        />
    );
};

export default GameCanvas;
