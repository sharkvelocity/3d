
import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, MansionLayout, Room, NavNode, AppActions, AppState, EvidenceType, Weather, ItemId } from '../../types';
import SoundManager from '../../services/SoundManager';
import ScreenManager from '../../services/MonitorManager';
import { ItemManager } from '../../services/ItemManager';
import { buildMansion } from '../../services/HouseBuilder';
import { createRandomLayout } from '../../services/layouts';
import { 
    MODEL_ROOT, 
    TEXTURE_ROOT, 
    AUDIO_ROOT, 
    WORLD_SCALE, 
    COLLISION_GROUPS, 
    UV_EVIDENCE_LAYER_MASK, 
    GHOST_ORB_LAYER_MASK,
    ICON_ROOT
} from '../../constants';
import { ITEMS, LIGHTER, HEADLAMP } from '../../data/items';
import { GHOST_MODELS } from '../../data/ghosts';
import { findPathBFS } from '@/utils/pathfinding';
import { loadSecretMapAssets } from './useSecretSceneLoader'; // Import helper

declare var BABYLON: any;
declare var CANNON: any;

export interface SceneRefs {
    sceneRef: React.RefObject<any>;
    gameContainerRef: React.RefObject<any>;
    menuContainerRef: React.RefObject<any>;
    playerRootRef: React.RefObject<any>;
    playerCameraRef: React.RefObject<any>;
    menuCameraRef: React.RefObject<any>;
    soundManagerRef: React.RefObject<SoundManager | null>;
    screenManagerRef: React.RefObject<ScreenManager | null>;
    itemManagerRef: React.RefObject<ItemManager | null>;
    
    // Lighting & Shadows
    ambientLightRef: React.RefObject<any>;
    moonLightRef: React.RefObject<any>;
    mainShadowGeneratorRef: React.RefObject<any>;
    flashlightShadowGeneratorRef: React.RefObject<any>;
    
    // Ghost
    ghostMeshRef: React.RefObject<any>;
    ghostIdleMeshRef: React.RefObject<any>;
    mistFormMeshRef: React.RefObject<any>;
    obakeShapeshiftModelsRef: React.RefObject<any[]>;
    activeShapeshiftModelRef: React.RefObject<any>;
    isShapeshiftedRef: React.RefObject<boolean>;
    ghostWanderTargetRef: React.RefObject<any>;
    lastWanderTargetRef: React.RefObject<any>;
    ghostPathRef: React.RefObject<any[]>;
    lastKnownPlayerPositionRef: React.RefObject<any>;
    
    // Particles & Effects
    rainParticleSystemRef: React.RefObject<any>;
    snowParticleSystemRef: React.RefObject<any>;
    ghostOrbMeshesRef: React.RefObject<any[]>; 
    ghostOrbSystemRef: React.RefObject<any>; 
    ghostOrbEmitterRef: React.RefObject<any>; 
    playerBreathSystemRef: React.RefObject<any>;
    hantuBreathSystemRef: React.RefObject<any>;
    mistBreathSystemRef: React.RefObject<any>;
    smudgeSmokeRef: React.RefObject<any>;
    cloudLayerRef: React.RefObject<any>;
    
    // House & Environment
    houseLayoutRef: React.RefObject<any>;
    houseContainerRef: React.RefObject<any>;
    doorPivotsRef: React.RefObject<Map<any, any>>;
    doorStatesRef: React.RefObject<Map<any, any>>;
    roomLightsRef: React.RefObject<Map<number, any>>;
    lightSwitchesRef: React.RefObject<Map<number, any>>;
    lightFixturesRef: React.RefObject<Map<any, any>>;
    roomGraphRef: React.RefObject<Map<number, { roomId: number; doorId: number }[]>>;
    currentRoomIdRef: React.RefObject<number | null>;
    
    // Items & Interactables
    placedMeshesRef: React.RefObject<Map<number, any>>;
    placedCameraNodesRef: React.RefObject<Map<number, any>>;
    dotsProjectorsRef: React.RefObject<Map<any, any>>;
    interactableMeshesRef: React.RefObject<Map<any, any>>;
    uvEvidenceMeshesRef: React.RefObject<any[]>;
    uvEvidenceMaterialRef: React.RefObject<any>;
    viewModelCacheRef: React.RefObject<Map<string, any>>;
    phonographMeshRef: React.RefObject<{ mesh: any, anims: any[] } | null>;
    heldItemParentRef: React.RefObject<any>;
    
    // Dynamic Bounds
    truckBoundsRef: React.RefObject<{ min: any, max: any } | null>;
    
    // Secret
    secretEnemiesRef: React.RefObject<any[]>;
    secretSpawnPointsRef: React.RefObject<any[]>;
}

interface SceneLoaderProps {
    refs: SceneRefs;
    propsRef: React.RefObject<AppState & { 
        actions: AppActions; 
        onLoadingUpdate: (progress: number, message: string) => void; 
        onSetGameState: (state: GameState) => void;
        onTransitionComplete: () => void;
        onRoomChange: (roomId: number | null) => void;
    }>;
    isInitialized: boolean;
    gameState: GameState;
    prevGameState: GameState | undefined;
    handleLightning: () => void;
    findRoomAt: (pos: any) => Room | null;
}

export const useSceneLoader = ({
    refs,
    propsRef,
    isInitialized,
    gameState,
    prevGameState,
    handleLightning,
    findRoomAt
}: SceneLoaderProps) => {
    
    const gameLoadVersionRef = useRef(0);
    const prevWeatherRef = useRef<Weather>(Weather.Calm);
    
    // [FIX] Load Cycle Lock: Prevents multiple loading triggers for the same state transition
    const loadCycleRef = useRef<{ state: GameState, processed: boolean }>({ state: GameState.MainMenu, processed: false });

    const getModelFromCacheOrLoad = async (url: string, scene: any) => {
        if (refs.viewModelCacheRef.current.has(url)) {
            const cached = refs.viewModelCacheRef.current.get(url);
            if (cached && cached.mesh) {
                const clone = cached.mesh.instantiateHierarchy();
                clone.setEnabled(true);
                
                const allDescendants = [clone, ...clone.getDescendants(false)];
                allDescendants.forEach((m: any) => {
                    // [FIX] Do NOT force isVisible=true here. Respect original visibility data.
                    m.setEnabled(true);
                });
                
                const targetConverter = (oldTarget: any) => {
                    if (oldTarget === cached.mesh) return clone;
                    return allDescendants.find((node: any) => 
                        node.name === oldTarget.name || 
                        node.name.endsWith(oldTarget.name)
                    ) || oldTarget;
                };
                
                const clonedAnims = cached.anims ? cached.anims.map((ag: any) => {
                    const newAg = ag.clone(ag.name + "_clone_" + Math.random(), targetConverter);
                    newAg.stop(); 
                    return newAg;
                }) : [];

                return { 
                    meshes: [clone], 
                    animationGroups: clonedAnims
                };
            }
        }
        
        const result = await BABYLON.SceneLoader.ImportMeshAsync(null, url, "", scene, null, ".glb");
        if (result.meshes[0]) {
            const root = result.meshes[0];
            refs.viewModelCacheRef.current.set(url, { mesh: root, anims: result.animationGroups || [] });
        }
        return result;
    };

    const clearGameAssets = () => {
        const scene = refs.sceneRef.current;
        
        // 1. Dispose Logic Managers FIRST to stop updates/sounds
        if (refs.soundManagerRef.current) {
            try { refs.soundManagerRef.current.dispose(); } catch (e) {}
            refs.soundManagerRef.current = null;
        }
        if (refs.itemManagerRef.current) {
            try { refs.itemManagerRef.current.dispose(); } catch (e) {}
            refs.itemManagerRef.current = null;
        }
        refs.screenManagerRef.current?.clearModels();

        // 2. Clear Scene Elements
        if (scene) {
             const foundation = scene.getMeshByName("foundation_collider");
             if (foundation && !foundation.isDisposed()) foundation.dispose();
             
             // Dispose all truck parts
             ["truck_bed_collider", "truck_wall_left", "truck_wall_right", "truck_wall_cab", "truck_wall_front", "truck_ceiling"].forEach(name => {
                 const mesh = scene.getMeshByName(name);
                 if (mesh && !mesh.isDisposed()) mesh.dispose();
             });

             const secretFloor = scene.getMeshByName("secret_physics_floor");
             if (secretFloor && !secretFloor.isDisposed()) secretFloor.dispose();
             
             // Cleanup planets
             ["skybox", "earth", "moon", "mars", "venus", "mercury"].forEach(name => {
                 const mesh = scene.getMeshByName(name);
                 if(mesh && !mesh.isDisposed()) mesh.dispose(false, true);
             });
             
             if (scene.particleSystems) {
                 [...scene.particleSystems].forEach((p: any) => {
                     if (p && !p.isDisposed) p.dispose();
                 });
             }
             
             scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
             scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        }

       if (refs.cloudLayerRef.current) {
           refs.cloudLayerRef.current.sphere.dispose();
           refs.cloudLayerRef.current.texture.dispose();
           refs.cloudLayerRef.current = null;
       }

       if (refs.mainShadowGeneratorRef.current) {
           refs.mainShadowGeneratorRef.current.dispose();
           refs.mainShadowGeneratorRef.current = null;
       }
       if (refs.flashlightShadowGeneratorRef.current) {
           refs.flashlightShadowGeneratorRef.current.dispose();
           refs.flashlightShadowGeneratorRef.current = null;
       }

       if (refs.ghostMeshRef.current && !refs.ghostMeshRef.current.isDisposed()) {
           refs.ghostMeshRef.current.dispose();
           refs.ghostMeshRef.current = null;
       }
       if (refs.ghostIdleMeshRef.current && !refs.ghostIdleMeshRef.current.isDisposed()) {
           refs.ghostIdleMeshRef.current.dispose();
           refs.ghostIdleMeshRef.current = null;
       }
       if (refs.mistFormMeshRef.current && !refs.mistFormMeshRef.current.isDisposed()) {
           refs.mistFormMeshRef.current.dispose();
           refs.mistFormMeshRef.current = null;
       }
       
       refs.obakeShapeshiftModelsRef.current.forEach(mesh => {
           if (mesh && !mesh.isDisposed()) mesh.dispose();
       });
       refs.obakeShapeshiftModelsRef.current = [];
       refs.activeShapeshiftModelRef.current = null;
       refs.isShapeshiftedRef.current = false;
       refs.ghostWanderTargetRef.current = null;
       refs.lastWanderTargetRef.current = null;
       refs.ghostPathRef.current = [];
       refs.lastKnownPlayerPositionRef.current = null;
       refs.currentRoomIdRef.current = null;

       if (refs.smudgeSmokeRef.current) {
           refs.smudgeSmokeRef.current.dispose();
           refs.smudgeSmokeRef.current = null;
       }
       if (refs.playerBreathSystemRef.current) {
           if (refs.playerBreathSystemRef.current.emitter && refs.playerBreathSystemRef.current.emitter.dispose) {
               refs.playerBreathSystemRef.current.emitter.dispose();
           }
           refs.playerBreathSystemRef.current.dispose();
           refs.playerBreathSystemRef.current = null;
       }
       if (refs.hantuBreathSystemRef.current) {
           refs.hantuBreathSystemRef.current.dispose();
           refs.hantuBreathSystemRef.current = null;
       }
       if (refs.mistBreathSystemRef.current) {
           refs.mistBreathSystemRef.current.dispose();
           refs.mistBreathSystemRef.current = null;
       }
       
       refs.ghostOrbMeshesRef.current.forEach(mesh => {
           if (mesh && !mesh.isDisposed()) mesh.dispose();
       });
       refs.ghostOrbMeshesRef.current = [];

       if (refs.phonographMeshRef.current) {
           refs.phonographMeshRef.current = null;
       }

       refs.rainParticleSystemRef.current = null;
       refs.snowParticleSystemRef.current = null;
       
       refs.placedMeshesRef.current.forEach(mesh => {
           if (mesh && !mesh.isDisposed()) mesh.dispose();
       });
       refs.placedMeshesRef.current.clear();
       refs.placedCameraNodesRef.current.clear();
       
       refs.dotsProjectorsRef.current.forEach(data => {
           if (data && data.projector && !data.projector.isDisposed()) data.projector.dispose();
       });
       refs.dotsProjectorsRef.current.clear();
       
       refs.interactableMeshesRef.current.forEach(mesh => {
           if (mesh && !mesh.isDisposed()) mesh.dispose();
       });
       refs.interactableMeshesRef.current.clear();
       
       refs.uvEvidenceMeshesRef.current.forEach(item => {
           if (item && item.mesh && !item.mesh.isDisposed()) item.mesh.dispose();
       });
       refs.uvEvidenceMeshesRef.current = [];

       refs.lightFixturesRef.current.clear(); 
       refs.roomLightsRef.current.clear();
       refs.lightSwitchesRef.current.clear();
       
       refs.doorPivotsRef.current.forEach((pivotData) => {
           if (pivotData) {
               if (pivotData.isPreAnimated) {
                   pivotData.leftAnim?.dispose();
                   pivotData.rightAnim?.dispose();
               } 
               else if (typeof pivotData.dispose === 'function' && !pivotData.isDisposed()) {
                   pivotData.dispose();
               }
           }
       });
       refs.doorPivotsRef.current.clear();

       refs.doorStatesRef.current.clear();
       refs.houseLayoutRef.current = null;
       refs.truckBoundsRef.current = null;
       
       refs.secretEnemiesRef.current.forEach(mesh => {
           if (mesh && !mesh.isDisposed()) mesh.dispose();
       });
       refs.secretEnemiesRef.current = [];
       refs.secretSpawnPointsRef.current = [];

       if (refs.heldItemParentRef.current) {
           refs.heldItemParentRef.current.position = BABYLON.Vector3.Zero();
           refs.heldItemParentRef.current.rotation = BABYLON.Vector3.Zero();
       }
       
       // 3. Dispose Game Container LAST
       // This removes the root node for the map, house, etc.
       if (refs.gameContainerRef.current) {
           if (!refs.gameContainerRef.current.isDisposed()) {
                refs.gameContainerRef.current.dispose(false, true);
           }
           refs.gameContainerRef.current = null;
       }
   };
   
   const setupWeatherEffects = async (weather: Weather) => { 
        const scene = refs.sceneRef.current;
        if (!scene || !refs.playerRootRef.current) return;
        
        if (refs.rainParticleSystemRef.current) {
            refs.rainParticleSystemRef.current.systems.forEach((s: any) => s.dispose());
            refs.rainParticleSystemRef.current = null;
        }
        if (refs.snowParticleSystemRef.current) {
            refs.snowParticleSystemRef.current.dispose();
            refs.snowParticleSystemRef.current = null;
        }
        
        const isHeavyRain = weather === Weather.HeavyRain || weather === Weather.BloodMoon;
        
        if (weather === Weather.Rain || isHeavyRain) {
            const rainEmitter = BABYLON.MeshBuilder.CreateBox("rainEmitter", { size: 0.1 }, scene);
            rainEmitter.isVisible = false;
            rainEmitter.parent = refs.playerRootRef.current;
            rainEmitter.position = new BABYLON.Vector3(0, 10, 0); 
            
            const rainSystem = new BABYLON.ParticleSystem("rain", 4000, scene);
            rainSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}rain.png`, scene);
            rainSystem.emitter = rainEmitter;
            rainSystem.minEmitBox = new BABYLON.Vector3(-20, 0, -20);
            rainSystem.maxEmitBox = new BABYLON.Vector3(20, 0, 20);
            
            rainSystem.color1 = new BABYLON.Color4(0.6, 0.6, 0.7, 0.5);
            rainSystem.color2 = new BABYLON.Color4(0.6, 0.6, 0.7, 0.5);
            rainSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
            
            rainSystem.minSize = 0.1;
            rainSystem.maxSize = 0.2;
            rainSystem.minLifeTime = 0.5;
            rainSystem.maxLifeTime = 0.7;
            rainSystem.emitRate = isHeavyRain ? 2500 : 1000;
            rainSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            rainSystem.gravity = new BABYLON.Vector3(0, -40, 0);
            rainSystem.direction1 = new BABYLON.Vector3(-1, -10, -1);
            rainSystem.direction2 = new BABYLON.Vector3(1, -10, 1);
            rainSystem.minEmitPower = 1;
            rainSystem.maxEmitPower = 3;
            rainSystem.updateSpeed = 0.01;
            
            rainSystem.start();
            refs.rainParticleSystemRef.current = { systems: [rainSystem], emitter: rainEmitter };
        } else if (weather === Weather.Snow) {
            const snowSystem = new BABYLON.ParticleSystem("snow", 1500, scene);
            snowSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
            
            // Emitter is attached to player via hook logic in game loop
            snowSystem.minEmitBox = new BABYLON.Vector3(-20, 10, -20);
            snowSystem.maxEmitBox = new BABYLON.Vector3(20, 10, 20);
            
            snowSystem.color1 = new BABYLON.Color4(0.9, 0.9, 0.95, 0.8);
            snowSystem.color2 = new BABYLON.Color4(1.0, 1.0, 1.0, 0.8);
            snowSystem.colorDead = new BABYLON.Color4(1, 1, 1, 0);
            
            snowSystem.minSize = 0.05;
            snowSystem.maxSize = 0.1;
            snowSystem.minLifeTime = 2.0;
            snowSystem.maxLifeTime = 3.5;
            snowSystem.emitRate = 500;
            snowSystem.gravity = new BABYLON.Vector3(0, -1, 0);
            snowSystem.direction1 = new BABYLON.Vector3(-2, -5, -2);
            snowSystem.direction2 = new BABYLON.Vector3(2, -5, 2);
            
            snowSystem.start();
            refs.snowParticleSystemRef.current = snowSystem;
        }
   };

   const loadAsset = async (url: string) => {
        if (refs.viewModelCacheRef.current.has(url)) {
            return;
        }
        
        const scene = refs.sceneRef.current;
        const result = await BABYLON.SceneLoader.ImportMeshAsync(null, url, "", scene, null, ".glb");
        
        if (result.meshes && result.meshes.length > 0) {
            // [FIX] Hide ALL top level meshes to handle multi-root GLBs
            result.meshes.forEach((m: any) => {
                // If it has no parent, it's a root. Hide it.
                // Also hide children if they are top-level in the result array (ImportMesh returns flattened list)
                if (!m.parent) {
                    m.setEnabled(false);
                    m.position = BABYLON.Vector3.Zero();
                }
            });
            
            // Fallback: Ensure the 0th mesh (usually __root__) is definitely hidden
            const root = result.meshes[0];
            root.setEnabled(false);
            
            const allDescendants = root.getDescendants(false);
            [root, ...allDescendants].forEach((m: any) => {
                 // [FIX] Do NOT force isVisible=false. This destroys original visibility data (LODs, colliders).
                 // Setting enabled=false on root handles hiding.
                 // We only disable picking/physics for the cached master.
                 m.isPickable = false;
                 m.checkCollisions = false;
                 m.receiveShadows = false;
            });
            
            if (!refs.viewModelCacheRef.current.has(url)) {
               refs.viewModelCacheRef.current.set(url, { mesh: root, anims: result.animationGroups || [] });
            } else {
                root.dispose();
            }
        }
   };

   const loadGameAssets = async () => {
        const currentLoadVersion = gameLoadVersionRef.current;
        const scene = refs.sceneRef.current;
        const { selectedMap, selectedGhost: activeGhost, currentWeather, ambientVolume, sfxVolume, graphicsQuality, onLoadingUpdate, onSetGameState, onTransitionComplete, isMobile, isSecretMode } = propsRef.current;

        if (!selectedMap || !activeGhost || !scene) return;
        
        // [FIX] Wrap entire loading sequence in try/catch to ensure UI unblocks on failure
        try {
            clearGameAssets(); 
            
            prevWeatherRef.current = currentWeather;

            // [FIX] Immediate progress update to prove we entered the function
            onLoadingUpdate(2, "Initializing audio...");
            
            refs.soundManagerRef.current = new SoundManager(scene, currentWeather, handleLightning, propsRef.current.isMobile, propsRef.current.isSecretMode);
            
            // [FIX] NON-BLOCKING AUDIO LOAD
            // We start the audio loading process but DO NOT await it. This allows the game assets to load immediately.
            // If audio fails or takes too long, the game will still run (silently).
            refs.soundManagerRef.current.waitForReady()
                .then(() => console.log("[SceneLoader] Audio ready in background"))
                .catch(e => console.warn("[SceneLoader] Audio load warning:", e));
            
            // Proceed immediately to asset loading
            if (gameLoadVersionRef.current !== currentLoadVersion) return;
            
            // [FIX] RE-INITIALIZE ITEM MANAGER
            // We must recreate ItemManager here because clearGameAssets disposed it.
            // Without this, no item logic (update loops) will run.
            if (refs.screenManagerRef.current) {
                refs.itemManagerRef.current = new ItemManager({
                    scene: scene,
                    actions: propsRef.current.actions,
                    soundManager: refs.soundManagerRef.current,
                    screenManager: refs.screenManagerRef.current,
                    playerCamera: refs.playerCameraRef.current,
                    flashlightShadowGeneratorRef: refs.flashlightShadowGeneratorRef,
                    ghostMeshRef: refs.ghostMeshRef,
                    secretEnemiesRef: refs.secretEnemiesRef
                });
                
                // Inject critical refs that ItemManager needs to function
                refs.itemManagerRef.current.setPlacedMeshesRef(refs.placedMeshesRef);
                refs.itemManagerRef.current.setExternalRefs({
                    ghostMeshRef: refs.ghostMeshRef,
                    placedCameraNodesRef: refs.placedCameraNodesRef,
                    uvEvidenceMeshesRef: refs.uvEvidenceMeshesRef,
                    dotsProjectorsRef: refs.dotsProjectorsRef
                });
            }
            
            // [FIX] FORCE PROGRESS BUMP
            // Ensure we move past the early init phase visually
            onLoadingUpdate(4, "Building World...");

            const gameContainer = new BABYLON.TransformNode("gameContainer", scene);
            refs.gameContainerRef.current = gameContainer;

            // --- SECRET MODE LOADING DELEGATION ---
            if (isSecretMode) {
                await loadSecretMapAssets(
                    scene, 
                    refs, 
                    gameContainer, 
                    onLoadingUpdate, 
                    onSetGameState, 
                    onTransitionComplete
                );
                return; // Exit standard load
            }
            
            let baseProgress = 5;
            onLoadingUpdate(baseProgress, "Loading assets...");

            refs.ambientLightRef.current = new BABYLON.HemisphericLight("gameAmbient", new BABYLON.Vector3(0, 1, 0), scene);
            refs.ambientLightRef.current.parent = gameContainer;
            refs.ambientLightRef.current.intensity = 0.05;
            refs.ambientLightRef.current.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;

            const moonDirection = new BABYLON.Vector3(-3.5, -2.5, 4);
            refs.moonLightRef.current = new BABYLON.DirectionalLight("moonLight", moonDirection, scene);
            refs.moonLightRef.current.parent = gameContainer;
            refs.moonLightRef.current.intensity = 0.2;
            refs.moonLightRef.current.diffuse = new BABYLON.Color3(0.5, 0.7, 1.0);
            refs.moonLightRef.current.specular = new BABYLON.Color3(0.1, 0.2, 0.3);
            refs.moonLightRef.current.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;

            refs.mainShadowGeneratorRef.current = null;
            refs.flashlightShadowGeneratorRef.current = null;
            
            scene.particlesEnabled = true;
            scene.collisionsEnabled = true; 
            scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
            scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

            if (refs.playerRootRef.current) {
                refs.playerRootRef.current.position = new BABYLON.Vector3(0, 1.0, -27);
            }
           if (refs.playerCameraRef.current) {
                refs.playerCameraRef.current.rotation.y = Math.PI;
            }

            let currentEnvProgress = baseProgress;
            
            // --- 1. ASSET PRELOADING (ITEMS/PROPS) ---
            const assetsToPreload = new Set<string>();
            
            // [FIX] REMOVED HEAVY ASSETS (truck, outside, tent) from PRELOADER to avoid OOM
            const essentialProps = [
                'lightswitch.glb', 'breaker.glb',
                'window.glb', 'window_broken.glb', 'window_blinds_closed.glb', 'window_blinds_open.glb',
                'front_door.glb'
            ];
            essentialProps.forEach(m => assetsToPreload.add(`${MODEL_ROOT}scene/${m}`));

            [...ITEMS, LIGHTER, HEADLAMP].forEach(item => {
                if (item.modelUrl) assetsToPreload.add(item.modelUrl);
            });
            
            assetsToPreload.add(`${MODEL_ROOT}scene/bedroom_queen.glb`);
            assetsToPreload.add(`${MODEL_ROOT}scene/dining_table.glb`);
            assetsToPreload.add(`${MODEL_ROOT}scene/phonograph.glb`);
            assetsToPreload.add(`${MODEL_ROOT}scene/props/plate2.glb`);

            if (!isMobile) {
                const usedPhotos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
                const usedAdultPhotos = [20, 21, 22];
                usedPhotos.forEach(i => assetsToPreload.add(`${MODEL_ROOT}items/wallphotos/${i}.glb`));
                usedAdultPhotos.forEach(i => assetsToPreload.add(`${MODEL_ROOT}items/wallphotos/adult/${i}.glb`));
            }

            const assetsArray = Array.from(assetsToPreload);
            const totalAssets = assetsArray.length;
            let loadedAssets = 0;
            
            const preloadPromise = (async () => {
                const pool: Promise<void>[] = [];
                // [FIX] Reduce concurrency on mobile/tablets to prevent OOM
                const limit = isMobile ? 1 : 4; 
                
                for(const url of assetsArray) {
                    const p = loadAsset(url).then(() => {
                        loadedAssets++;
                        const percent = Math.floor((loadedAssets / totalAssets) * 100);
                        onLoadingUpdate(currentEnvProgress, `Loading assets (${percent}%)...`); 
                        pool.splice(pool.indexOf(p), 1);
                    }).catch(err => {
                        console.warn(`Failed to preload asset ${url}:`, err);
                    });
                    pool.push(p);
                    
                    // Throttle concurrency
                    if(pool.length >= limit) await Promise.race(pool);
                    
                    // [FIX] Give GC a breather on mobile
                    // Increased to 150ms on mobile to give more time for texture upload/GC
                    const delay = isMobile ? 150 : 50;
                    await new Promise(r => setTimeout(r, delay));
                }
                await Promise.all(pool);
            })();
            
            await preloadPromise; 
            
            // --- 2. IMAGE PRELOADING ---
            const loadingIcons = [
                'ghost_chase.png', 'ghost_chase2.png', 
                'player_chase.png', 'player_chase2.png', 'player_chased.png',
                'player_chasing.png', 'ghost_being_chased.png'
            ];
            
            // [FIX] Strict sequential loading for images on mobile to save texture memory
            if (isMobile) {
                for (const icon of loadingIcons) {
                    await new Promise<void>((resolve) => {
                        const img = new Image();
                        img.src = `${ICON_ROOT}${icon}`;
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                    });
                    await new Promise(r => setTimeout(r, 20));
                }
            } else {
                await Promise.all(loadingIcons.map(icon => {
                    return new Promise<void>((resolve) => {
                        const img = new Image();
                        img.src = `${ICON_ROOT}${icon}`;
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                    });
                }));
            }

            // --- 3. HEAVY ENVIRONMENT LOADING (SEQUENTIAL) ---
            onLoadingUpdate(currentEnvProgress + 5, "Loading terrain...");
            // Load Outside (Massive)
            // [FIX] DIRECT LOAD: Do not use cache for singleton environment meshes to save memory
            await BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}scene/outside.glb`, "", scene, null, ".glb").then((result: any) => {
                const tentRoot = result.meshes[0];
                if(tentRoot) {
                    tentRoot.parent = gameContainer;
                    tentRoot.freezeWorldMatrix(); 
                    const allMeshes = [tentRoot, ...tentRoot.getDescendants(false)];
                    allMeshes.forEach((m: any) => { 
                        if (m instanceof BABYLON.AbstractMesh) { 
                            m.checkCollisions = true; 
                            m.receiveShadows = true; 
                            if (refs.mainShadowGeneratorRef.current) refs.mainShadowGeneratorRef.current.addShadowCaster(m, true); 
                            if (m.material) m.material.maxSimultaneousLights = 10; 
                        } 
                    });
                }
            }).catch((e: any) => console.error("Failed to load outside.glb", String(e)));
            
            // [OPTIMIZATION] Reduced waiting time for compressed assets.
            // Small safety pause only on mobile to allow texture upload.
            if (isMobile) await new Promise(r => setTimeout(r, 100)); 
            
            currentEnvProgress += 10;
            
            onLoadingUpdate(currentEnvProgress + 10, "Loading truck...");
            // Load Truck (Massive)
            // [FIX] DIRECT LOAD: Do not cache truck. It is only spawned once.
            await BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}scene/truck.glb`, "", scene, null, ".glb")
                .then((result: any) => {
                    const truckRoot = result.meshes[0];
                    if (truckRoot) {
                        truckRoot.parent = gameContainer;
                        truckRoot.position.z = -26; 
                        truckRoot.freezeWorldMatrix(); 

                        const truckPos = truckRoot.position;
                        const boundsMin = new BABYLON.Vector3(truckPos.x - 2.5, 0, truckPos.z - 6); 
                        const boundsMax = new BABYLON.Vector3(truckPos.x + 2.5, 4, truckPos.z + 6);

                        refs.truckBoundsRef.current = {
                            min: boundsMin,
                            max: boundsMax
                        };
                        
                        if (refs.playerRootRef.current) {
                            refs.playerRootRef.current.position.set(truckPos.x, 1.0, truckPos.z - 1); 
                        }
                        
                        const allMeshes = truckRoot.getDescendants(false);
                        if (truckRoot instanceof BABYLON.AbstractMesh) allMeshes.push(truckRoot);
            
                        allMeshes.forEach((m: any) => {
                            if (m instanceof BABYLON.AbstractMesh) {
                                m.checkCollisions = false;
                                
                                const lowerName = m.name.toLowerCase();
                                if (
                                    lowerName.includes('table') || 
                                    lowerName.includes('desk') || 
                                    lowerName.includes('shelf') || 
                                    lowerName.includes('counter') || 
                                    lowerName.includes('cabinet') || 
                                    lowerName.includes('bench') || 
                                    lowerName.includes('seat') || 
                                    lowerName.includes('keyboard') || 
                                    lowerName.includes('monitor')
                                ) {
                                    m.checkCollisions = true;
                                    m.collisionGroup = COLLISION_GROUPS.FURNITURE;
                                }
                                
                                m.isPickable = false;
                                m.receiveShadows = true;
                                if (refs.mainShadowGeneratorRef.current) refs.mainShadowGeneratorRef.current.addShadowCaster(m, true);
                                if (m.material) m.material.maxSimultaneousLights = 10;
                                
                                if (m.name.toLowerCase().includes('flamethrower')) {
                                    // [FIX] Make flamethrower easier to interact with
                                    // Enable PICKING on the Visual Mesh itself so you can click the model directly
                                    m.isPickable = true; 
                                    m.metadata = { type: 'secret_start' };
                                    m.checkCollisions = true; 
                                    m.collisionGroup = COLLISION_GROUPS.INTERACTABLE;
                                    
                                    // Also keep the hitbox as a backup "fat finger" target
                                    const hitbox = BABYLON.MeshBuilder.CreateBox("flamethrower_hitbox", { width: 1.5, height: 1.0, depth: 1.5 }, scene);
                                    hitbox.parent = m;
                                    hitbox.position = BABYLON.Vector3.Zero();
                                    
                                    hitbox.isVisible = false;
                                    hitbox.isPickable = true;
                                    hitbox.checkCollisions = false; 
                                    hitbox.metadata = { type: 'secret_start' };
                                    hitbox.collisionGroup = COLLISION_GROUPS.INTERACTABLE;
                                }
                            }
                        });

                        // Truck Colliders
                        const truckFloor = BABYLON.MeshBuilder.CreateBox("truck_bed_collider", { width: 3.5, height: 0.2, depth: 10 }, scene);
                        truckFloor.position = new BABYLON.Vector3(truckPos.x, truckPos.y - 0.1, truckPos.z); 
                        
                        const truckCeiling = BABYLON.MeshBuilder.CreateBox("truck_ceiling", { width: 3.5, height: 0.2, depth: 10 }, scene);
                        truckCeiling.position = new BABYLON.Vector3(truckPos.x, truckPos.y + 3.0, truckPos.z);

                        const truckWallLeft = BABYLON.MeshBuilder.CreateBox("truck_wall_left", { width: 0.2, height: 3.5, depth: 10 }, scene);
                        truckWallLeft.position = new BABYLON.Vector3(truckPos.x - 1.8, truckPos.y + 1.5, truckPos.z);

                        const truckWallRight = BABYLON.MeshBuilder.CreateBox("truck_wall_right", { width: 0.2, height: 3.5, depth: 10 }, scene);
                        truckWallRight.position = new BABYLON.Vector3(truckPos.x + 1.8, truckPos.y + 1.5, truckPos.z);

                        const truckWallCab = BABYLON.MeshBuilder.CreateBox("truck_wall_cab", { width: 3.5, height: 3.5, depth: 0.2 }, scene);
                        truckWallCab.position = new BABYLON.Vector3(truckPos.x, truckPos.y + 1.5, truckPos.z - 4.9);

                        [truckFloor, truckCeiling, truckWallLeft, truckWallRight, truckWallCab].forEach(mesh => {
                            mesh.isVisible = true;
                            mesh.visibility = 0;
                            mesh.checkCollisions = true;
                            // [FIX] Explicitly set mesh collision group to allow Raycast predicate to see it as a WALL
                            mesh.collisionGroup = COLLISION_GROUPS.WALLS; 
                            mesh.isPickable = true; 
                            
                            mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 0.5, restitution: 0.0 }, scene);
                            mesh.physicsImpostor.collisionGroup = COLLISION_GROUPS.WALLS;
                            mesh.physicsImpostor.collisionMask = -1;
                            mesh.freezeWorldMatrix();
                        });

                        const truckLight = new BABYLON.PointLight("truckLight", new BABYLON.Vector3(truckPos.x, truckPos.y + 2.5, truckPos.z), scene);
                        truckLight.intensity = 0.5;
                        truckLight.range = 8;
                        truckLight.diffuse = new BABYLON.Color3(0.9, 0.9, 1.0);
                        truckLight.parent = gameContainer;

                        if (refs.screenManagerRef.current) {
                            return refs.screenManagerRef.current.initializeModels(truckRoot, (p: number, m: string) => {
                                // Suppress detailed sub-updates to prevent spam
                            });
                        }
                    }
                }).catch((e: any) => console.error("Failed to load truck.glb", String(e)));

            // [OPTIMIZATION] Significantly reduced pause for compressed assets
            if (isMobile) await new Promise(r => setTimeout(r, 50)); 

            // --- 4. SKY & ENVIRONMENT ---
            onLoadingUpdate(currentEnvProgress + 15, "Loading sky...");

            const skyboxPromise = BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}sky/skybox.glb`, "", scene, null, ".glb").catch(() => null);
            const moonPromise = BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}sky/moon.glb`, "", scene, null, ".glb").catch(() => null);
            const portalPromise = BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}map/portal.glb`, "", scene, null, ".glb").catch(() => null);

            const groundRoot = BABYLON.MeshBuilder.CreateBox("ground", { width: 500, height: 1, depth: 500 }, scene);
            
            // Wait for light assets
            const [skyboxResult, moonResult, portalResult] = await Promise.all([skyboxPromise, moonPromise, portalPromise]);
            
            const skyboxRoot = skyboxResult?.meshes[0];
            const moonRoot = moonResult?.meshes[0];
            const portalRoot = portalResult?.meshes[0];

            baseProgress = currentEnvProgress + 20; 
            
            if(skyboxRoot) {
                skyboxRoot.scaling = new BABYLON.Vector3(2000, 2000, 2000);
                skyboxRoot.position = new BABYLON.Vector3(0, -100, 0);
                skyboxRoot.parent = gameContainer;
                skyboxRoot.freezeWorldMatrix(); 
                skyboxRoot.getDescendants(true, (n: any) => n instanceof BABYLON.AbstractMesh).forEach((m: any) => {
                    m.receiveShadows = false; m.isPickable = false; m.checkCollisions = false;
                    if (m.material) { m.material.disableLighting = true; m.material.backFaceCulling = false; m.material.disableDepthWrite = true; }
                    m.renderingGroupId = 0;
                });
            }
            if(moonRoot) {
                moonRoot.position = new BABYLON.Vector3(350, 250, -400);
                moonRoot.scaling = new BABYLON.Vector3(50, 50, 50);
                moonRoot.parent = gameContainer;
                moonRoot.freezeWorldMatrix();
            
                const moonMaterial = new BABYLON.StandardMaterial("moonMat", scene);
                moonMaterial.emissiveColor = new BABYLON.Color3(1, 1, 0.85);
                moonMaterial.disableLighting = true;
            
                moonRoot.getDescendants(true, (n: any) => n instanceof BABYLON.AbstractMesh).forEach((m: any) => {
                    m.receiveShadows = false; m.isPickable = false; m.checkCollisions = false; m.material = moonMaterial;
                    m.renderingGroupId = 1;
                });
            }
            
            if (portalRoot) {
                portalRoot.parent = gameContainer;
                // No physics, just visual
                portalRoot.getDescendants(false).forEach((m: any) => {
                    m.checkCollisions = false;
                    m.isPickable = false;
                });
                portalRoot.checkCollisions = false;
                
                if (portalResult?.animationGroups) {
                    portalResult.animationGroups.forEach((ag: any) => ag.play(true));
                }
            }

            if (groundRoot) {
                const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
                const grassTexture = new BABYLON.Texture(`${TEXTURE_ROOT}grass.png`, scene);
                grassTexture.uScale = 50; 
                grassTexture.vScale = 50;
                groundMat.diffuseTexture = grassTexture;
                groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
                
                groundRoot.position = new BABYLON.Vector3(0, -0.51, 0);
                groundRoot.parent = gameContainer;
                groundRoot.receiveShadows = true;
                groundRoot.material = groundMat;
                groundRoot.freezeWorldMatrix(); 
                
                // [FIX] Explicitly set mesh collision group
                groundRoot.collisionGroup = COLLISION_GROUPS.WALLS;

                groundRoot.physicsImpostor = new BABYLON.PhysicsImpostor(groundRoot, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.1, friction: 0.8 }, scene);
                groundRoot.physicsImpostor.collisionGroup = COLLISION_GROUPS.WALLS;
                groundRoot.physicsImpostor.collisionMask = -1;
                
                const allGroundMeshes = groundRoot.getDescendants(true);
                allGroundMeshes.push(groundRoot);
                allGroundMeshes.forEach((m: any) => {
                    if (m instanceof BABYLON.AbstractMesh) {
                        m.checkCollisions = true;
                        m.isPickable = false;
                    }
                });
            }

            // --- 5. HOUSE GENERATION ---
            baseProgress = 60;
            onLoadingUpdate(baseProgress, "Environment established.");
            onLoadingUpdate(baseProgress, "Checking weather forecast...");
            
            await setupWeatherEffects(currentWeather);

            baseProgress += 5; 
            onLoadingUpdate(baseProgress, "Weather patterns established.");
            
            if (selectedMap.modelUrl) {
                onLoadingUpdate(baseProgress, `Loading ${selectedMap.name}...`);

                const houseContainer = new BABYLON.TransformNode("houseContainer", scene);
                refs.houseContainerRef.current = houseContainer;
                houseContainer.parent = gameContainer;
                
                const staticLayout: MansionLayout = {
                    rooms: [],
                    doors: [],
                    windows: [],
                    mansionFootprint: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }, 
                    interactables: [],
                    furniturePlacements: [],
                    navmesh: { nodes: [], edges: [], graph: new Map() },
                    initialPlacedItems: [],
                };

                try {
                    const houseResult = await BABYLON.SceneLoader.ImportMeshAsync(null, selectedMap.modelUrl, "", scene, (evt: any) => {
                        if (evt.lengthComputable) onLoadingUpdate(baseProgress + (evt.loaded / evt.total) * 30, `Loading ${selectedMap.name}...`);
                    });
                    
                    baseProgress += 30;

                    const houseRoot = (houseResult.rootNodes && houseResult.rootNodes.length > 0) ? houseResult.rootNodes[0] : houseResult.meshes[0];
                    if (houseRoot) {
                        houseRoot.parent = houseContainer;
                        houseRoot.scaling.setAll(WORLD_SCALE);
                        houseRoot.freezeWorldMatrix(); 

                        const allHouseNodes = houseRoot.getDescendants(true);
                        allHouseNodes.push(houseRoot);
                        
                        let doorIdCounter = 0;
                        const wallHeight = 4.0; 

                        let roomIdCounter = 0;
                        const allHouseMeshes = houseRoot.getDescendants(false, (node: any) => node instanceof BABYLON.AbstractMesh);
                        if (houseRoot instanceof BABYLON.AbstractMesh) allHouseMeshes.push(houseRoot);

                        allHouseMeshes.forEach((mesh: any) => {
                            if (mesh.name && mesh.name.startsWith('ROOM_')) {
                                mesh.computeWorldMatrix(true);
                                const boundingInfo = mesh.getBoundingInfo();
                                if (!boundingInfo) return;
                                const minWorld = boundingInfo.boundingBox.minimumWorld;
                                const maxWorld = boundingInfo.boundingBox.maximumWorld;

                                const invMatrix = houseContainer.getWorldMatrix().clone().invert();
                                const localMin = BABYLON.Vector3.TransformCoordinates(minWorld, invMatrix);
                                const localMax = BABYLON.Vector3.TransformCoordinates(maxWorld, invMatrix);
                                
                                const roomTypeRaw = mesh.name.replace('ROOM_', '');
                                const roomType = roomTypeRaw.charAt(0).toUpperCase() + roomTypeRaw.slice(1);

                                staticLayout.mansionFootprint.minX = Math.min(staticLayout.mansionFootprint.minX, localMin.x);
                                staticLayout.mansionFootprint.maxX = Math.max(staticLayout.mansionFootprint.maxX, localMax.x);
                                staticLayout.mansionFootprint.minZ = Math.min(staticLayout.mansionFootprint.minZ, localMin.z);
                                staticLayout.mansionFootprint.maxZ = Math.max(staticLayout.mansionFootprint.maxZ, localMax.z);

                                staticLayout.rooms.push({
                                    id: roomIdCounter++,
                                    type: roomType,
                                    floor: 0,
                                    x: localMin.x,
                                    z: localMin.z,
                                    width: localMax.x - localMin.x,
                                    depth: localMax.z - localMin.z,
                                });
                                mesh.isVisible = false;
                            }
                        });
                        
                        staticLayout.rooms.forEach((room: Room) => {
                            if (room.type.includes('Hallway')) return; 

                            const light = new BABYLON.PointLight(`light_${room.id}`, new BABYLON.Vector3(room.x + room.width / 2, wallHeight - 0.5, room.z + room.depth / 2), scene);
                            light.intensity = 0.9; 
                            light.range = 6 * WORLD_SCALE;
                            light.falloffType = BABYLON.Light.FALLOFF_PHYSICAL;
                            light.specular = new BABYLON.Color3(0, 0, 0);
                            light.setEnabled(false);
                            light.parent = houseContainer;
                            light.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;
                        
                            const lightFixtureMat = new BABYLON.StandardMaterial(`lightFixtureMat_${room.id}`, scene);
                            lightFixtureMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
                            lightFixtureMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                            lightFixtureMat.specularColor = new BABYLON.Color3(0, 0, 0);
                        
                            const lightFixture = BABYLON.MeshBuilder.CreateCylinder(`lightFixture_${room.id}`, { diameter: 0.5, height: 0.05 }, scene);
                            lightFixture.position = new BABYLON.Vector3(room.x + room.width / 2, wallHeight - 0.05, room.z + room.depth / 2);
                            lightFixture.material = lightFixtureMat;
                            lightFixture.parent = houseContainer;
                            lightFixture.receiveShadows = true;
                            if (refs.mainShadowGeneratorRef.current) refs.mainShadowGeneratorRef.current.addShadowCaster(lightFixture);
                        
                            refs.roomLightsRef.current.set(room.id, { light, fixture: lightFixture, fixtureMaterial: lightFixtureMat });
                        });

                        allHouseNodes.forEach((node: any) => {
                            if (node.name && node.name.startsWith('lightswitch')) {
                                const switchNode = node;
                                switchNode.computeWorldMatrix(true);
                                const switchPos = switchNode.getAbsolutePosition();
                                const room = findRoomAt(switchPos);
                                if (room) {
                                    if (room.type.includes('Hallway')) {
                                        switchNode.setEnabled(false); 
                                        return;
                                    }

                                    const roomId = room.id;
                                    refs.lightSwitchesRef.current.set(roomId, { switchNode: switchNode, animation: null });

                                    const allSwitchMeshes = switchNode.getDescendants(true);
                                    allSwitchMeshes.push(switchNode);
                                    
                                    // [FIX] Make visual mesh pickable for direct interaction
                                    allSwitchMeshes.forEach((m: any) => { 
                                        if (m instanceof BABYLON.AbstractMesh) {
                                            m.isPickable = true;
                                            m.metadata = { type: 'light_switch', roomId: roomId };
                                            m.checkCollisions = true;
                                            m.collisionGroup = COLLISION_GROUPS.INTERACTABLE;
                                        }
                                    });
                                }
                            }
                            
                            // [FIX] Breaker Box Interaction
                            if (node.name && (node.name.toLowerCase().includes('breaker') || node.name.toLowerCase().includes('fusebox'))) {
                                const allBreakerMeshes = node.getDescendants(true);
                                allBreakerMeshes.push(node);
                                allBreakerMeshes.forEach((m: any) => {
                                    if(m instanceof BABYLON.AbstractMesh) {
                                        m.isPickable = true;
                                        m.metadata = { type: 'breaker_box' };
                                        m.checkCollisions = true;
                                        m.collisionGroup = COLLISION_GROUPS.INTERACTABLE;
                                    }
                                });
                            }
                        });

                        const frontDoorNode = allHouseNodes.find((n: any) => n.name === 'front_door');
                        if (frontDoorNode) {
                            const doorId = doorIdCounter++;
                            const leftAnim = houseResult.animationGroups.find((ag: any) => ag.name === 'leftAction');
                            const rightAnim = houseResult.animationGroups.find((ag: any) => ag.name === 'rightAction');
                        
                            if (leftAnim && rightAnim) {
                                leftAnim.stop();
                                rightAnim.stop();
                                refs.doorPivotsRef.current.set(doorId, { 
                                    leftAnim, 
                                    rightAnim, 
                                    isPreAnimated: true,
                                    rootNode: frontDoorNode
                                });
                                refs.doorStatesRef.current.set(doorId, { isOpen: false, isLocked: false, isPreAnimated: true, hasBeenOpened: false });
                            }
                            
                            // [FIX] Populate staticLayout.doors for front door (Approximation)
                            // This allows InteractionHandler to calculate position logic correctly
                            frontDoorNode.computeWorldMatrix(true);
                            const pos = frontDoorNode.getAbsolutePosition();
                            staticLayout.doors.push({
                                id: doorId,
                                x: pos.x,
                                z: pos.z,
                                isFrontDoor: true,
                                isVertical: false, 
                                width: 2.0 
                            });
                        
                            const allMeshes = frontDoorNode.getDescendants(false, (n:any) => n instanceof BABYLON.AbstractMesh);
                            if (frontDoorNode instanceof BABYLON.AbstractMesh) allMeshes.push(frontDoorNode);
                            allMeshes.forEach((m:any) => {
                                m.isPickable = true;
                                m.metadata = { type: 'door', id: doorId };
                                m.checkCollisions = true;
                                if (!m.physicsImpostor) m.physicsImpostor = new BABYLON.PhysicsImpostor(m, BABYLON.PhysicsImpostor.MeshImpostor, { mass: 0, friction: 0.5, restitution: 0.1 }, scene);
                            });
                        }

                        allHouseNodes.forEach((node: any) => {
                            if (node.name && node.name.match(/^door(\.\d+)?$/) && node instanceof BABYLON.TransformNode) {
                                const doorRoot = node;
                                const doorId = doorIdCounter++;
                                
                                // [FIX] Populate staticLayout.doors for generic doors
                                doorRoot.computeWorldMatrix(true);
                                const pos = doorRoot.getAbsolutePosition();
                                const rotY = doorRoot.rotationQuaternion ? doorRoot.rotationQuaternion.toEulerAngles().y : doorRoot.rotation.y;
                                const isVertical = Math.abs(Math.sin(rotY)) > 0.5; // Roughly 90 or 270 degrees

                                staticLayout.doors.push({
                                    id: doorId,
                                    x: pos.x,
                                    z: pos.z,
                                    isVertical: isVertical,
                                    width: 1.2 
                                });
                                
                                const allDoorMeshes = doorRoot.getDescendants(false, (n: any) => n instanceof BABYLON.AbstractMesh);
                                if (doorRoot instanceof BABYLON.AbstractMesh) allDoorMeshes.push(doorRoot);
                                
                                if (allDoorMeshes.length > 0) {
                                    allDoorMeshes.forEach((m: any) => {
                                        m.isPickable = true;
                                        m.metadata = { type: 'door', id: doorId };
                                        m.checkCollisions = true;
                                        if (!m.physicsImpostor) m.physicsImpostor = new BABYLON.PhysicsImpostor(m, BABYLON.PhysicsImpostor.MeshImpostor, { mass: 0, friction: 0.5, restitution: 0.1 }, scene);
                                    });
                                    refs.doorPivotsRef.current.set(doorId, doorRoot); 
                                    refs.doorStatesRef.current.set(doorId, { isOpen: false, isLocked: false, hasBeenOpened: false, isPreAnimated: false });
                                }
                            }
                        });
                        
                        allHouseMeshes.forEach((mesh: any) => {
                            if (!mesh.name.toLowerCase().includes('door') && !mesh.name.toLowerCase().includes('lightswitch')) {
                                mesh.checkCollisions = true;
                                mesh.receiveShadows = true;
                                if (!mesh.physicsImpostor) {
                                    mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.MeshImpostor, { mass: 0, friction: 0.5, restitution: 0.1 }, scene);
                                }
                            }
                        });
                        
                        const fp = staticLayout.mansionFootprint;
                        
                        const isValidBounds = fp.minX !== Infinity && fp.maxX !== -Infinity;
                        const minX = isValidBounds ? fp.minX : -40;
                        const maxX = isValidBounds ? fp.maxX : 40;
                        const minZ = isValidBounds ? fp.minZ : -40;
                        const maxZ = isValidBounds ? fp.maxZ : 40;

                        const foundationWidth = (maxX - minX) + 4; 
                        const foundationDepth = (maxZ - minZ) + 4;
                        const foundationHeight = 2.0; 

                        const foundation = BABYLON.MeshBuilder.CreateBox("foundation_collider", {
                            width: foundationWidth,
                            height: foundationHeight,
                            depth: foundationDepth
                        }, scene);

                        // [FIX] Lower foundation to prevent clipping through ground
                        const topY = -0.1;
                        foundation.position = new BABYLON.Vector3(
                            minX + (maxX - minX) / 2,
                            topY - (foundationHeight / 2),
                            minZ + (maxZ - minZ) / 2
                        );
                        
                        // [FIX] Raycast Visibility: Make foundation pickable but transparent
                        // This blocks interaction rays passing through the floor
                        foundation.isVisible = true;
                        foundation.visibility = 0;
                        // [FIX] Disable picking on foundation to allow raycasts to pass through
                        foundation.isPickable = false;
                        foundation.checkCollisions = true;
                        // [FIX] Explicitly set mesh collision group
                        foundation.collisionGroup = COLLISION_GROUPS.WALLS;
                        
                        foundation.parent = houseContainer;
                        foundation.computeWorldMatrix(true);
                        foundation.setParent(null); 
                        
                        foundation.physicsImpostor = new BABYLON.PhysicsImpostor(
                            foundation, 
                            BABYLON.PhysicsImpostor.BoxImpostor, 
                            { mass: 0, friction: 0.8, restitution: 0.1 }, 
                            scene
                        );
                        foundation.physicsImpostor.collisionGroup = COLLISION_GROUPS.WALLS;
                        foundation.physicsImpostor.collisionMask = -1;
                        foundation.freezeWorldMatrix();
                    }
                    
                    refs.houseLayoutRef.current = staticLayout;
                    propsRef.current.actions.updateState({ mansionLayout: staticLayout });

                } catch (e) {
                    console.error("Failed to load static map GLB:", String(e));
                }

            } else { // Procedural map
                onLoadingUpdate(baseProgress, "Generating unique layout...");
                const layout = createRandomLayout();
                refs.houseLayoutRef.current = layout;
                
                const maxInstanceId = (layout.initialPlacedItems || []).reduce((max, item) => Math.max(max, item.instanceId), 0);

                propsRef.current.actions.updateState({
                    mansionLayout: layout,
                });

                const { doorPivots, roomLights: lights, mansionContainer, lightSwitches, phonograph } = await buildMansion(
                    scene,
                    layout,
                    gameContainer,
                    (p: number, m: string) => onLoadingUpdate(baseProgress + p * 0.30, m), 
                    refs.mainShadowGeneratorRef.current,
                    refs.flashlightShadowGeneratorRef.current,
                    graphicsQuality, 
                    refs.viewModelCacheRef.current
                );
                baseProgress += 30;
                
                propsRef.current.actions.updateState({
                    placedItems: layout.initialPlacedItems || [],
                    placedItemInstanceCounter: Math.max(propsRef.current.placedItemInstanceCounter, maxInstanceId)
                });
                
                refs.houseContainerRef.current = mansionContainer;
                refs.doorPivotsRef.current = doorPivots;
                refs.roomLightsRef.current = lights;
                refs.lightSwitchesRef.current = lightSwitches;
                
                if (phonograph) {
                    refs.phonographMeshRef.current = phonograph;
                }

                doorPivots.forEach((_, id) => {
                    const doorDef = layout.doors[id];
                    if (doorDef.isFrontDoor) {
                        refs.doorStatesRef.current.set(id, { isOpen: false, isLocked: false, isPreAnimated: true, hasBeenOpened: false });
                    } else {
                        refs.doorStatesRef.current.set(id, { isOpen: false, isLocked: false, hasBeenOpened: false });
                    }
                });

                refs.roomGraphRef.current.clear();
                layout.rooms.forEach((room: Room) => {
                    refs.roomGraphRef.current.set(room.id, []);
                });
                layout.doors.forEach((door: any, doorIndex: number) => {
                    if (door.isOpeningOnly) return;
                    const connectedRooms: number[] = [];
                    layout.rooms.forEach((room: Room) => {
                        const wallThickness = 0.15;
                        const onXBoundary = Math.abs(door.x - room.x) < wallThickness || Math.abs(door.x - (room.x + room.width)) < wallThickness;
                        const onZBoundary = Math.abs(door.z - room.z) < wallThickness || Math.abs(door.z - (room.z + room.depth)) < wallThickness;
                        const inXRange = door.x >= room.x && door.x <= room.x + room.width;
                        const inZRange = door.z >= room.z && door.z <= room.z + room.depth;
                        if ((onXBoundary && inZRange) || (onZBoundary && inZRange)) {
                        connectedRooms.push(room.id);
                        }
                    });
                    if (connectedRooms.length === 2) {
                        refs.roomGraphRef.current.get(connectedRooms[0])?.push({ roomId: connectedRooms[1], doorId: doorIndex });
                        refs.roomGraphRef.current.get(connectedRooms[1])?.push({ roomId: connectedRooms[0], doorId: doorIndex });
                    }
                });
            }

            onLoadingUpdate(baseProgress, "Summoning entity...");
            
            // --- PARTICLES: ORBS, BREATH, SMUDGE ---
            
            // 1. Ghost Orbs
            refs.ghostOrbMeshesRef.current = [];
            for (let i = 0; i < 3; i++) {
                const orb = BABYLON.MeshBuilder.CreatePlane(`ghostOrb_${i}`, { size: 0.1 }, scene);
                orb.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                const mat = new BABYLON.StandardMaterial(`orbMat_${i}`, scene);
                mat.diffuseTexture = new BABYLON.Texture(`${TEXTURE_ROOT}ghost_orb.png`, scene);
                mat.diffuseTexture.hasAlpha = true;
                mat.useAlphaFromDiffuseTexture = true;
                mat.emissiveColor = BABYLON.Color3.White();
                mat.disableLighting = true;
                mat.alpha = 0; 
                orb.material = mat;
                orb.isVisible = false;
                orb.layerMask = GHOST_ORB_LAYER_MASK;
                
                // Metadata for animation
                orb.metadata = {
                    xSpeed: 0.0005 + Math.random() * 0.0005,
                    zSpeed: 0.0005 + Math.random() * 0.0005,
                    ySpeed: 0.001 + Math.random() * 0.001,
                    xOffset: Math.random() * 100,
                    zOffset: Math.random() * 100,
                    yOffset: Math.random() * 100,
                    fadeSpeed: 0.002 + Math.random() * 0.002, 
                    fadeOffset: Math.random() * 100
                };
                
                refs.ghostOrbMeshesRef.current.push(orb);
            }

            // 2. Mist Breath
            if (!refs.mistBreathSystemRef.current) {
                const mistBreath = new BABYLON.ParticleSystem("mistBreath", 500, scene);
                mistBreath.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene, { loaderOptions: { crossOrigin: "anonymous" } });
                mistBreath.minEmitBox = new BABYLON.Vector3(-0.2, 0.5, -0.2);
                mistBreath.maxEmitBox = new BABYLON.Vector3(0.2, 1.5, 0.2);
                mistBreath.color1 = new BABYLON.Color4(0.8, 0.9, 1.0, 0.4);
                mistBreath.color2 = new BABYLON.Color4(0.9, 0.95, 1.0, 0.1);
                mistBreath.colorDead = new BABYLON.Color4(1.0, 1.0, 1.0, 0.0);
                mistBreath.minSize = 0.3;
                mistBreath.maxSize = 0.6;
                mistBreath.minLifeTime = 0.5;
                mistBreath.maxLifeTime = 1.0;
                mistBreath.emitRate = 100;
                mistBreath.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
                mistBreath.gravity = new BABYLON.Vector3(0, 0.2, 0); 
                mistBreath.direction1 = new BABYLON.Vector3(-0.1, 0, -0.1);
                mistBreath.direction2 = new BABYLON.Vector3(0.1, 0.5, 0.1);
                mistBreath.minEmitPower = 0.1;
                mistBreath.maxEmitPower = 0.3;
                mistBreath.updateSpeed = 0.01;
                mistBreath.stop(); 
                refs.mistBreathSystemRef.current = mistBreath;
            }

            // 3. Player Breath
            if (!refs.playerBreathSystemRef.current) {
                const breathSystem = new BABYLON.ParticleSystem("playerBreath", 200, scene);
                breathSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene, { loaderOptions: { crossOrigin: "anonymous" } });
                
                const emitter = new BABYLON.TransformNode("playerBreathEmitter", scene);
                emitter.parent = refs.playerCameraRef.current;
                emitter.position = new BABYLON.Vector3(0, -0.15, 0.3); 
                
                breathSystem.emitter = emitter;
                breathSystem.minEmitBox = new BABYLON.Vector3(-0.05, 0, 0);
                breathSystem.maxEmitBox = new BABYLON.Vector3(0.05, 0.05, 0);
                
                breathSystem.color1 = new BABYLON.Color4(0.9, 0.95, 1.0, 0.15);
                breathSystem.color2 = new BABYLON.Color4(1.0, 1.0, 1.0, 0.0);
                breathSystem.colorDead = new BABYLON.Color4(1.0, 1.0, 1.0, 0.0);
                
                breathSystem.minSize = 0.1;
                breathSystem.maxSize = 0.25; 
                breathSystem.minLifeTime = 1.5;
                breathSystem.maxLifeTime = 2.5;
                breathSystem.emitRate = 50; 
                breathSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
                
                breathSystem.gravity = new BABYLON.Vector3(0, 0.02, 0);
                breathSystem.direction1 = new BABYLON.Vector3(-0.2, 0, 1);
                breathSystem.direction2 = new BABYLON.Vector3(0.2, 0, 1);
                breathSystem.minEmitPower = 0.1;
                breathSystem.maxEmitPower = 0.3;
                breathSystem.updateSpeed = 0.005; 
                
                breathSystem.stop();
                refs.playerBreathSystemRef.current = breathSystem;
            }

            // 4. Ghost Loading
            try {
                const ghostModels = GHOST_MODELS;
                const randomGhostModel = ghostModels[Math.floor(Math.random() * ghostModels.length)];
                
                const isMale = randomGhostModel.includes('male');
                refs.soundManagerRef.current.setGhostGender(isMale);

                const ghostResult = await getModelFromCacheOrLoad(`${MODEL_ROOT}ghosts/${randomGhostModel}`, scene);
                
                const ghostRoot = ghostResult.rootNodes?.[0] || ghostResult.meshes?.[0];
                if (!ghostRoot) {
                    throw new Error(`Ghost model ${randomGhostModel} is invalid or empty.`);
                }
                refs.ghostMeshRef.current = ghostRoot;
                refs.ghostMeshRef.current.parent = gameContainer;
                refs.ghostMeshRef.current.scaling.setAll(1.0 * WORLD_SCALE);
                refs.ghostMeshRef.current.checkCollisions = false; 
                
                refs.ghostMeshRef.current.ellipsoid = new BABYLON.Vector3(0.15, 0.4, 0.15).scale(WORLD_SCALE);
                refs.ghostMeshRef.current.ellipsoidOffset = new BABYLON.Vector3(0, 0.4, 0).scale(WORLD_SCALE); 
                refs.ghostMeshRef.current.collisionGroup = COLLISION_GROUPS.GHOST;
                refs.ghostMeshRef.current.collisionMask = COLLISION_GROUPS.WALLS | COLLISION_GROUPS.DOORS;
                
                const allGhostMeshes = refs.ghostMeshRef.current.getDescendants(false, (n: any) => n instanceof BABYLON.AbstractMesh);
                if (refs.ghostMeshRef.current instanceof BABYLON.AbstractMesh) allGhostMeshes.push(refs.ghostMeshRef.current);
                
                const materials = new Set();
                allGhostMeshes.forEach((m: any) => {
                    if (m.material) materials.add(m.material);
                    m.isPickable = true; // Ghost hit detection
                });
                
                const { isDevMode } = propsRef.current;
                
                materials.forEach((mat: any) => {
                    mat.disableLighting = false; 
                    mat.alpha = isDevMode ? 0.3 : 0.0;
                    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                    mat.needDepthPrePass = true;
                    mat.backFaceCulling = false;
                });
                
                if (refs.mainShadowGeneratorRef.current) {
                    const casters = refs.mainShadowGeneratorRef.current.getShadowMap().renderList;
                    if (casters) {
                        casters.push(refs.ghostMeshRef.current);
                    }
                }
                if (refs.flashlightShadowGeneratorRef.current) {
                    const casters = refs.flashlightShadowGeneratorRef.current.getShadowMap().renderList;
                    if (casters) {
                        casters.push(refs.ghostMeshRef.current);
                    }
                }

                const idleModelName = randomGhostModel.replace('.glb', '_idle.glb');
                try {
                    const idleResult = await getModelFromCacheOrLoad(`${MODEL_ROOT}ghosts/${idleModelName}`, scene);
                    const idleRoot = idleResult.rootNodes?.[0] || idleResult.meshes?.[0];
                    if (idleRoot) {
                        refs.ghostIdleMeshRef.current = idleRoot;
                        idleRoot.parent = gameContainer;
                        idleRoot.scaling.setAll(1.0 * WORLD_SCALE);
                        idleRoot.setEnabled(false); 

                        const allIdleMeshes = idleRoot.getDescendants(false, (n: any) => n instanceof BABYLON.AbstractMesh);
                        if (idleRoot instanceof BABYLON.AbstractMesh) allIdleMeshes.push(idleRoot);
                        
                        const idleMaterials = new Set();
                        allIdleMeshes.forEach((m: any) => {
                            if (m.material) idleMaterials.add(m.material);
                            m.isPickable = true; 
                            m.checkCollisions = false; 
                        });

                        idleMaterials.forEach((mat: any) => {
                            mat.disableLighting = false;
                            mat.alpha = 1.0; 
                            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                            mat.needDepthPrePass = true;
                            mat.backFaceCulling = false;
                        });
                    }
                } catch (e) {
                    console.warn(`Could not load idle ghost model ${idleModelName}:`, e);
                }
                
                if (activeGhost.name !== 'Oni') {
                    // Revert to invisible dummy for mist form so particle system follows it
                    const mistRoot = BABYLON.MeshBuilder.CreateBox("mist_form_dummy", { size: 1 }, scene);
                    mistRoot.isVisible = false; // Invisible
                    mistRoot.parent = gameContainer;
                    mistRoot.checkCollisions = true; // For movement calculation
                    mistRoot.ellipsoid = new BABYLON.Vector3(0.5, 1.0, 0.5).scale(WORLD_SCALE);
                    mistRoot.ellipsoidOffset = new BABYLON.Vector3(0, 1.0, 0).scale(WORLD_SCALE);
                    mistRoot.collisionGroup = COLLISION_GROUPS.GHOST;
                    mistRoot.collisionMask = COLLISION_GROUPS.WALLS | COLLISION_GROUPS.DOORS | COLLISION_GROUPS.FURNITURE;
                    
                    refs.mistFormMeshRef.current = mistRoot;
                    mistRoot.setEnabled(false); // Start disabled
                }

                // Spawn Logic
                let spawned = false;
                if (refs.houseLayoutRef.current?.rooms.length > 0) {
                    const validRooms = refs.houseLayoutRef.current.rooms.filter((r: Room) =>
                        !r.type.toLowerCase().includes('hallway') &&
                        !r.type.toLowerCase().includes('foyer') &&
                        !r.type.toLowerCase().includes('utilityroom')
                    );
                    const roomPool = validRooms.length > 0 ? validRooms : refs.houseLayoutRef.current.rooms;
                    const favoriteRoom = roomPool[Math.floor(Math.random() * roomPool.length)];

                    if (favoriteRoom && refs.houseContainerRef.current) {
                        propsRef.current.actions.updateState({ ghostFavoriteRoomId: favoriteRoom.id });
                        
                        let spawnX = favoriteRoom.x + favoriteRoom.width / 2;
                        let spawnZ = favoriteRoom.z + favoriteRoom.depth / 2;
                        
                        const doors = refs.houseLayoutRef.current.doors;
                        if (doors && doors.length > 0) {
                            const roomDoors = doors.filter((door: any) => {
                                if (door.isOpeningOnly) return false; 
                                const wallThickness = 0.2;
                                const onX = Math.abs(door.x - favoriteRoom.x) < wallThickness || Math.abs(door.x - (favoriteRoom.x + favoriteRoom.width)) < wallThickness;
                                const onZ = Math.abs(door.z - favoriteRoom.z) < wallThickness || Math.abs(door.z - (favoriteRoom.z + favoriteRoom.depth)) < wallThickness;
                                const inXSpan = door.x >= favoriteRoom.x - 0.1 && door.x <= favoriteRoom.x + favoriteRoom.width + 0.1;
                                const inZSpan = door.z >= favoriteRoom.z - 0.1 && door.z <= favoriteRoom.z + favoriteRoom.depth + 0.1;
                                return (onX && inZSpan) || (onZ && inZSpan);
                            });
                            
                            if (roomDoors.length > 0) {
                                const chosenDoor = roomDoors[Math.floor(Math.random() * roomDoors.length)];
                                let nudgeX = 0;
                                let nudgeZ = 0;
                                const nudgeDist = 0.5;

                                if (Math.abs(chosenDoor.x - favoriteRoom.x) < 0.2) {
                                    nudgeX = nudgeDist;
                                } else if (Math.abs(chosenDoor.x - (favoriteRoom.x + favoriteRoom.width)) < 0.2) {
                                    nudgeX = -nudgeDist;
                                } else if (Math.abs(chosenDoor.z - favoriteRoom.z) < 0.2) {
                                    nudgeZ = nudgeDist;
                                } else if (Math.abs(chosenDoor.z - (favoriteRoom.z + favoriteRoom.depth)) < 0.2) {
                                    nudgeZ = -nudgeDist;
                                }

                                spawnX = chosenDoor.x + nudgeX;
                                spawnZ = chosenDoor.z + nudgeZ;
                            }
                        }

                        const localPos = new BABYLON.Vector3(spawnX, 1.0, spawnZ);
                        const worldPos = BABYLON.Vector3.TransformCoordinates(localPos, refs.houseContainerRef.current.getWorldMatrix());
                        refs.ghostMeshRef.current.position = worldPos;
                        propsRef.current.actions.updateState({ ghostCoordinates: { x: localPos.x, y: localPos.y, z: localPos.z } });
                        propsRef.current.actions.updateState({ ghostWorldCoordinates: { x: worldPos.x, y: worldPos.y, z: worldPos.z } });
                        spawned = true;
                    }
                }

                if (!spawned) {
                    console.warn("No rooms available in layout to spawn ghost. Using fallback spawn.");
                    const fallbackPos = new BABYLON.Vector3(2, 1.0, 3);
                    const houseContainer = refs.houseContainerRef.current;
                    if (houseContainer && refs.ghostMeshRef.current) {
                        const worldPos = BABYLON.Vector3.TransformCoordinates(fallbackPos, houseContainer.getWorldMatrix());
                        refs.ghostMeshRef.current.position = worldPos;
                        propsRef.current.actions.updateState({ ghostCoordinates: { x: fallbackPos.x, y: fallbackPos.y, z: fallbackPos.z } });
                        propsRef.current.actions.updateState({ ghostWorldCoordinates: { x: worldPos.x, y: worldPos.y, z: worldPos.z } });
                    }
                }
                
                if (activeGhost.name === 'Obake') {
                    onLoadingUpdate(75, "Summoning entity...");
                    // Filter models by gender matching the primary ghost model
                    const currentGender = randomGhostModel.includes('female') ? 'female' : 'male';
                    const genderSpecificModels = ghostModels.filter(m => m.includes(currentGender) && m !== randomGhostModel);
                    
                    // Shuffle and pick up to 3
                    const selectedShapeshifts = genderSpecificModels.sort(() => 0.5 - Math.random()).slice(0, 3);

                    for (const modelName of selectedShapeshifts) {
                        try {
                            const result = await getModelFromCacheOrLoad(`${MODEL_ROOT}ghosts/${modelName}`, scene);
                            const modelRoot = result.rootNodes?.[0] || result.meshes?.[0];
                            if (modelRoot) {
                                modelRoot.parent = gameContainer;
                                modelRoot.scaling.setAll(1.0 * WORLD_SCALE);
                                
                                const allMeshes = modelRoot.getDescendants(false, (n: any) => n instanceof BABYLON.AbstractMesh);
                                if (modelRoot instanceof BABYLON.AbstractMesh) allMeshes.push(modelRoot);
                                const materials = new Set();
                                allMeshes.forEach((m: any) => { 
                                    if (m.material) materials.add(m.material); 
                                    m.isPickable = true; 
                                });
                                materials.forEach((mat: any) => {
                                    mat.disableLighting = false;
                                    mat.alpha = 0.0;
                                    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                                    mat.needDepthPrePass = true;
                                    mat.backFaceCulling = false;
                                });
                                
                                modelRoot.setEnabled(false);
                                refs.obakeShapeshiftModelsRef.current.push(modelRoot);
                            }
                        } catch (e) {
                            console.warn(`Could not preload Obake shapeshift model ${modelName}:`, e);
                        }
                    }
                }

            } catch (e) { console.error("Could not load ghost model:", e); }
            baseProgress += 15;
            
            onLoadingUpdate(96, "Finalizing scene...");
            
            const readyPromise = scene.whenReadyAsync();
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, 10000));

            await Promise.race([readyPromise, timeoutPromise]);
            
            refs.soundManagerRef.current?.setAmbientVolume(ambientVolume);
            refs.soundManagerRef.current?.setSfxVolume(sfxVolume);

            onLoadingUpdate(100, "Few more seconds");

            setTimeout(() => {
                onSetGameState(GameState.Playing);
                onTransitionComplete();
                scene.activeCamera = refs.playerCameraRef.current;
                if (refs.menuContainerRef.current) {
                    refs.menuContainerRef.current.dispose();
                    refs.menuContainerRef.current = null;
                }
                refs.soundManagerRef.current?.startAmbientSounds();
            }, 500);
        } catch (fatalError) {
            console.error("CRITICAL ERROR in LoadGameAssets:", fatalError);
            alert("Game loading failed. Please refresh. " + String(fatalError));
        }
    };

    useEffect(() => {
        // Reset processed flag if state changed
        if (loadCycleRef.current.state !== gameState) {
            loadCycleRef.current = { state: gameState, processed: false };
        }

        const isSecret = propsRef.current.isSecretMode;
        
        // [FIX] Load Cycle Lock: Only trigger if we are in Loading state, initialized, and haven't processed this state yet.
        if (isInitialized && gameState === GameState.Loading && !loadCycleRef.current.processed) {
             console.log("[SceneLoader] Starting load cycle for state:", GameState[gameState]);
             loadCycleRef.current.processed = true;
             
             gameLoadVersionRef.current++;
             
             if (refs.menuContainerRef.current) {
                refs.menuContainerRef.current.dispose(false, true);
                refs.menuContainerRef.current = null;
             }
             
             loadGameAssets().catch(err => {
               console.error("Failed during game asset loading process:", err);
             });
        }

        if (isInitialized && gameState === GameState.MainMenu && (prevGameState === GameState.Playing || prevGameState === GameState.GameOver)) {
            const scene = refs.sceneRef.current;
            clearGameAssets();
            // [FIX] Removed Menu Scene setup
        }
    }, [gameState, isInitialized]); 

    useEffect(() => {
        const { currentWeather, gameState: currentGameState } = propsRef.current;
        if (isInitialized && currentGameState === GameState.Playing && currentWeather !== prevWeatherRef.current) {
            prevWeatherRef.current = currentWeather;
            setupWeatherEffects(currentWeather);
        }
    }, [propsRef.current.currentWeather, gameState, isInitialized]);
};
