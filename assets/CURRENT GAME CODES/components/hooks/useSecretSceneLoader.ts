
import { MODEL_ROOT, WORLD_SCALE, COLLISION_GROUPS } from '../../constants';
import { GHOST_MODELS } from '../../data/ghosts';
import { NavNode, GameState } from '../../types';

declare const BABYLON: any;

export const loadSecretMapAssets = async (
    scene: any,
    refs: any,
    gameContainer: any,
    onLoadingUpdate: (progress: number, message: string) => void,
    onSetGameState: (state: GameState) => void,
    onTransitionComplete: () => void
) => {
    onLoadingUpdate(20, "Loading Secret Map...");

    // Clear existing ghosts
    if (refs.obakeShapeshiftModelsRef.current) {
        refs.obakeShapeshiftModelsRef.current.forEach((mesh: any) => {
            if (mesh && !mesh.isDisposed()) mesh.dispose();
        });
        refs.obakeShapeshiftModelsRef.current = [];
    }

    // Safety Floor
    const safetyFloor = BABYLON.MeshBuilder.CreateBox("secret_physics_floor", { width: 1000, height: 1, depth: 1000 }, scene);
    safetyFloor.position = new BABYLON.Vector3(0, -2.0, 0); 
    safetyFloor.isVisible = false;
    safetyFloor.checkCollisions = true;
    safetyFloor.collisionGroup = COLLISION_GROUPS.WALLS;
    safetyFloor.physicsImpostor = new BABYLON.PhysicsImpostor(
        safetyFloor,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, friction: 0.8, restitution: 0 },
        scene
    );
    safetyFloor.physicsImpostor.collisionGroup = COLLISION_GROUPS.WALLS;
    safetyFloor.physicsImpostor.collisionMask = -1;

    // Lighting
    const hemi = new BABYLON.HemisphericLight("secretHemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.parent = gameContainer;
    refs.ambientLightRef.current = hemi;

    const moonLight = new BABYLON.DirectionalLight("secretMoon", new BABYLON.Vector3(0, -1, 0), scene);
    moonLight.intensity = 0;
    moonLight.parent = gameContainer;
    refs.moonLightRef.current = moonLight;

    const getModelFromCacheOrLoad = async (url: string) => {
        if (refs.viewModelCacheRef.current.has(url)) {
            const cached = refs.viewModelCacheRef.current.get(url);
            if (cached && cached.mesh) {
                const clone = cached.mesh.instantiateHierarchy();
                clone.setEnabled(true);
                const allDescendants = [clone, ...clone.getDescendants(false)];
                allDescendants.forEach((m: any) => {
                    m.isVisible = true;
                    m.setEnabled(true);
                });
                return { meshes: [clone], animationGroups: [] };
            }
        }
        const result = await BABYLON.SceneLoader.ImportMeshAsync(null, url, "", scene, null, ".glb");
        if (result.meshes[0]) {
            const root = result.meshes[0];
            refs.viewModelCacheRef.current.set(url, { mesh: root, anims: result.animationGroups || [] });
        }
        return result;
    };

    try {
        const mapPromise = BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}map/map.glb`, "", scene, null, ".glb");
        const portalPromise = BABYLON.SceneLoader.ImportMeshAsync(null, `${MODEL_ROOT}map/portal.glb`, "", scene, null, ".glb").catch(() => ({ meshes: [], animationGroups: [] }));
        
        const smudgePromise = getModelFromCacheOrLoad(`${MODEL_ROOT}items/smudge.glb`);
        const flamethrowerPromise = getModelFromCacheOrLoad(`${MODEL_ROOT}items/flamethrower.glb`);
        const heartPromise = getModelFromCacheOrLoad(`${MODEL_ROOT}suits/heart.glb`);
        
        // Load Ghosts (Excluding Mist/Idle)
        const validGhostModels = GHOST_MODELS.filter(name => !name.includes('mist') && !name.includes('idle'));

        const ghostPromises = validGhostModels.map(modelName => 
            getModelFromCacheOrLoad(`${MODEL_ROOT}ghosts/${modelName}`)
                .then(result => {
                    if (result.meshes[0]) {
                        const root = result.meshes[0];
                        root.setEnabled(false);
                        root.checkCollisions = false;
                        root.isPickable = false;
                        
                        // Force Opaque for visibility
                        const allMeshes = [root, ...root.getDescendants(false)];
                        allMeshes.forEach((m: any) => {
                            if (m.material) {
                                m.material.unfreeze(); 
                                m.material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
                                m.material.alpha = 1.0; 
                                m.material.disableLighting = false;
                                m.material.backFaceCulling = false;
                                m.material.freeze();
                            }
                        });

                        if (refs.obakeShapeshiftModelsRef.current) {
                            refs.obakeShapeshiftModelsRef.current.push(root);
                        }
                    }
                })
                .catch(e => console.warn(`Failed to cache ghost ${modelName}`, e))
        );

        const [mapResult, portalResult, smudgeResult, flameResult, heartResult] = await Promise.all([mapPromise, portalPromise, smudgePromise, flamethrowerPromise, heartPromise, ...ghostPromises]);

        if (smudgeResult && smudgeResult.meshes[0]) smudgeResult.meshes[0].setEnabled(false);
        if (flameResult && flameResult.meshes[0]) flameResult.meshes[0].setEnabled(false);
        if (heartResult && heartResult.meshes[0]) {
            const heart = heartResult.meshes[0];
            heart.setEnabled(false);
            // Apply red emissive to ensure it looks like a pickup
            const allHeartMeshes = [heart, ...heart.getDescendants(false)];
            allHeartMeshes.forEach((m: any) => {
                if (m.material) {
                    m.material = m.material.clone("heartMat");
                    m.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
                    m.material.albedoColor = new BABYLON.Color3(1, 0, 0);
                }
            });
        }

        const mapRoot = mapResult.meshes[0];
        if (mapRoot) {
            mapRoot.parent = gameContainer;
            mapRoot.scaling = new BABYLON.Vector3(-1.2, 1.2, 1.2); 
            mapRoot.position = BABYLON.Vector3.Zero();
            
            mapRoot.computeWorldMatrix(true);
            
            const spawnMeshes: any[] = [];
            const allMeshes = mapRoot.getDescendants(false);
            
            allMeshes.forEach((m: any) => {
                const lowerName = m.name.toLowerCase();
                
                if (m.material) {
                    m.material.backFaceCulling = false;
                }

                if (lowerName.includes('spawn')) {
                    m.isVisible = false; 
                    m.checkCollisions = false;
                    spawnMeshes.push(m);
                } 
                else if (lowerName.includes('upgrade')) {
                    m.isPickable = true;
                    m.checkCollisions = true;
                    m.isVisible = true;
                    if (lowerName.includes('health')) m.metadata = { type: 'secret_upgrade', upgradeType: 'health' };
                    else if (lowerName.includes('power')) m.metadata = { type: 'secret_upgrade', upgradeType: 'firepower' };
                    else if (lowerName.includes('chance')) m.metadata = { type: 'secret_upgrade', upgradeType: 'chance' };
                }
                else {
                    if (m instanceof BABYLON.Mesh) {
                        m.setParent(null);
                        m.bakeCurrentTransformIntoVertices();
                        m.flipFaces(true);
                        m.parent = gameContainer;
                        m.refreshBoundingInfo(true);
                        m.alwaysSelectAsActiveMesh = true; 
                        m.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

                        if (lowerName.includes('navmesh')) {
                            m.isVisible = true; // Debug: Visible for now, user can hide later if desired
                            m.visibility = 0.2; // Semi-transparent to see it working
                            m.checkCollisions = true; 
                            m.isPickable = true; 
                        }
                        // TREAT ALL OTHER MESHES AS WALLS/OBSTACLES FOR LoS
                        else {
                            m.checkCollisions = true; 
                            m.isPickable = true;
                            // [FIX] Explicitly set collision group on the mesh for Raycast predicates
                            // This ensures pillar, blocks, and other unnamed geometry block the ghost's view
                            m.collisionGroup = COLLISION_GROUPS.WALLS;
                            
                            if (!m.physicsImpostor) {
                                m.physicsImpostor = new BABYLON.PhysicsImpostor(
                                    m, 
                                    BABYLON.PhysicsImpostor.MeshImpostor, 
                                    { mass: 0, friction: 0.5, restitution: 0.0 }, 
                                    scene
                                );
                                m.physicsImpostor.collisionGroup = COLLISION_GROUPS.WALLS;
                                m.physicsImpostor.collisionMask = -1;
                            }
                        }
                    }
                }
                
                if (!m.metadata) m.metadata = {};
                m.metadata.isSecretMap = true;
            });
            
            spawnMeshes.sort((a, b) => a.name.localeCompare(b.name));
            
            spawnMeshes.forEach(m => {
                m.computeWorldMatrix(true);
                const spawnPos = m.getAbsolutePosition().clone();
                spawnPos.y += 0.8; 
                refs.secretSpawnPointsRef.current.push(spawnPos);
            });

            onLoadingUpdate(80, "Mapping terrain...");
            
            // --- Optimized NavMesh Processing ---
            const navMesh = gameContainer.getDescendants(false).find((m: any) => m.name.toLowerCase().includes("navmesh"));
            let nodes: NavNode[] = [];
            let edges: any[] = [];
            let graph = new Map<number, number[]>();
            const grid = new Map<string, NavNode>();

            if (navMesh) {
                console.log("[Secret Mode] Found dedicated NavMesh geometry.");
                navMesh.computeWorldMatrix(true);
                const boundingInfo = navMesh.getBoundingInfo();
                const min = boundingInfo.boundingBox.minimumWorld;
                const max = boundingInfo.boundingBox.maximumWorld;
                
                const GRID_SIZE = 1.5; 
                let nodeId = 0;
                let iterations = 0;

                // Scan grid over the bounding box
                for (let x = min.x; x <= max.x; x += GRID_SIZE) {
                    for (let z = min.z; z <= max.z; z += GRID_SIZE) {
                        if (++iterations % 1000 === 0) await new Promise(r => setTimeout(r, 0));
                        
                        // Raycast DOWN onto the specific NavMesh geometry
                        const rayOrigin = new BABYLON.Vector3(x, max.y + 2, z);
                        const ray = new BABYLON.Ray(rayOrigin, new BABYLON.Vector3(0, -1, 0), 100);
                        const hit = scene.pickWithRay(ray, (m: any) => m === navMesh);
                        
                        if (hit && hit.hit) {
                            const floorPoint = hit.pickedPoint;
                            
                            // [CRITICAL] WALL BUFFER CHECK
                            // Even if we are on the navmesh, if we are too close to a wall, DO NOT create a node.
                            // This prevents ghosts from hugging walls and clipping.
                            const checkDirs = [
                                new BABYLON.Vector3(1, 0, 0),
                                new BABYLON.Vector3(-1, 0, 0),
                                new BABYLON.Vector3(0, 0, 1),
                                new BABYLON.Vector3(0, 0, -1)
                            ];
                            
                            let tooClose = false;
                            for (const dir of checkDirs) {
                                // Check 0.5m out (Ghost radius is approx 0.4)
                                const wallRay = new BABYLON.Ray(floorPoint.add(new BABYLON.Vector3(0, 0.5, 0)), dir, 0.5);
                                const wallHit = scene.pickWithRay(wallRay, (m: any) => m.checkCollisions && m !== navMesh && m.collisionGroup !== COLLISION_GROUPS.GHOST);
                                if (wallHit && wallHit.hit) {
                                    tooClose = true;
                                    break;
                                }
                            }
                            
                            if (tooClose) continue;

                            const node: NavNode = {
                                id: nodeId++,
                                position: { x: hit.pickedPoint.x, y: hit.pickedPoint.y + 0.5, z: hit.pickedPoint.z },
                                type: 'room'
                            };
                            nodes.push(node);
                            graph.set(node.id, []);
                            const key = `${Math.round(x/GRID_SIZE)},${Math.round(z/GRID_SIZE)}`;
                            grid.set(key, node);
                        }
                    }
                }
                
                console.log(`[Secret Mode] Generated NavMesh with ${nodes.length} nodes.`);

                // Connect Neighbors
                iterations = 0;
                for (const node of nodes) {
                     if (++iterations % 2000 === 0) await new Promise(r => setTimeout(r, 0));
                     const gx = Math.round(node.position.x / GRID_SIZE);
                     const gz = Math.round(node.position.z / GRID_SIZE);
                     const neighbors = [
                        grid.get(`${gx+1},${gz}`), grid.get(`${gx-1},${gz}`),
                        grid.get(`${gx},${gz+1}`), grid.get(`${gx},${gz-1}`),
                        grid.get(`${gx+1},${gz+1}`), grid.get(`${gx-1},${gz-1}`),
                        grid.get(`${gx+1},${gz-1}`), grid.get(`${gx-1},${gz+1}`)
                    ];
                    neighbors.forEach(neighbor => {
                        if (neighbor) {
                            edges.push({ from: node.id, to: neighbor.id });
                            graph.get(node.id)?.push(neighbor.id);
                        }
                    });
                }
                
                navMesh.isVisible = false; // Hide after generation
            }

            refs.houseLayoutRef.current = {
                navmesh: { nodes, edges, graph },
                rooms: [], 
                doors: []
            };
            
            // Attach grid for O(1) lookup in loop
            (refs.houseLayoutRef.current.navmesh as any).grid = grid;
        }
        
        if (portalResult && portalResult.meshes.length > 0) {
            const portalRoot = portalResult.meshes[0];
            portalRoot.parent = gameContainer;
            portalRoot.getDescendants(false).forEach((m: any) => {
                m.checkCollisions = false;
                m.isPickable = false;
            });
            portalRoot.checkCollisions = false;
            
            if (portalResult.animationGroups) {
                portalResult.animationGroups.forEach((ag: any) => ag.play(true));
            }
        }

    } catch (e) {
        console.error("Failed to load secret assets.", e);
    }
    
    if (refs.playerRootRef.current) {
        refs.playerRootRef.current.position = new BABYLON.Vector3(0, 1.0, 0);
    }
    
    onLoadingUpdate(100, "Secret Round Ready.");
    setTimeout(() => {
        onSetGameState(GameState.Playing);
        onTransitionComplete();
    }, 500);
};
