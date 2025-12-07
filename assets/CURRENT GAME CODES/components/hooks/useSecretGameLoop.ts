
import React, { useCallback, useRef } from 'react';
import { WORLD_SCALE, MODEL_ROOT, COLLISION_GROUPS } from '../../constants'; 
import { findPathBFS } from '@/utils/pathfinding';
import { NavNode, GameState } from '../../types';

declare const BABYLON: any;

export const useSecretGameLoop = (
    sceneRef: React.RefObject<any>,
    playerRootRef: React.RefObject<any>,
    playerCameraRef: React.RefObject<any>,
    inputMapRef: React.RefObject<Map<string, boolean>>,
    propsRef: React.RefObject<any>,
    soundManagerRef: React.RefObject<any>,
    houseLayoutRef: React.RefObject<any>,
    secretEnemiesRef: React.MutableRefObject<any[]>,
    secretSpawnPointsRef: React.MutableRefObject<any[]>,
    obakeShapeshiftModelsRef: React.RefObject<any[]>,
    playerControllerRef: React.RefObject<any>,
    viewModelCacheRef: React.MutableRefObject<Map<string, any>>,
    onPlayerDeath: (message: string) => void
) => {
    
    // Stores both Smudge Sticks and Health Hearts
    const secretDropsRef = useRef<any[]>([]); 
    
    const upgradeMeshesRef = useRef<any[]>([]);
    const lastSpawnTimeRef = useRef<number>(0);
    const currentSpawnIndexRef = useRef<number>(0);

    const spawnDrop = useCallback((position: any, type: 'smudge' | 'health') => {
        const cache = viewModelCacheRef.current;
        let url = `${MODEL_ROOT}items/smudge.glb`;
        if (type === 'health') {
            url = `${MODEL_ROOT}suits/heart.glb`;
        }
        
        if (cache.has(url)) {
            const cached = cache.get(url);
            if (cached && cached.mesh) {
                const drop = cached.mesh.instantiateHierarchy();
                drop.position.copyFrom(position);
                drop.position.y = 0.5;
                drop.setEnabled(true);
                
                if (type === 'health') {
                    drop.scaling.setAll(0.3); // Adjust size for heart
                    drop.rotation.x = -Math.PI / 2; // Flat on ground -> Upright
                } else {
                    drop.scaling.setAll(2.0); 
                }
                
                const allMeshes = drop.getDescendants(false);
                allMeshes.push(drop);
                allMeshes.forEach((m: any) => {
                    m.isVisible = true;
                    m.checkCollisions = false;
                    m.isPickable = false;
                });
                
                secretDropsRef.current.push({ mesh: drop, type });
            }
        }
    }, []);

    const runSecretLoop = useCallback((deltaTime: number, now: number) => {
        const scene = sceneRef.current;
        const rig = playerRootRef.current;
        const camera = playerCameraRef.current;
        
        if (!scene || !rig || !camera) return;

        // --- ANIMATE UPGRADES ---
        if (upgradeMeshesRef.current.length === 0) {
            scene.meshes.forEach((m: any) => {
                if (m.metadata && m.metadata.type === 'secret_upgrade') {
                    upgradeMeshesRef.current.push(m);
                }
            });
        }
        
        upgradeMeshesRef.current.forEach(mesh => {
            mesh.rotation.y += deltaTime; // Spin
            mesh.position.y += Math.sin(now * 0.003) * 0.002; // Float
        });

        // --- Handle Pickups (Smudge & Health) ---
        const playerPos = rig.position;
        for (let i = secretDropsRef.current.length - 1; i >= 0; i--) {
            const drop = secretDropsRef.current[i];
            if (drop.mesh) {
                drop.mesh.rotation.y += deltaTime;
                // Float Effect
                drop.mesh.position.y = 0.5 + Math.sin(now * 0.005) * 0.1;
                
                const dist = BABYLON.Vector3.Distance(playerPos, drop.mesh.position);
                if (dist < 1.5) {
                    let pickedUp = false;
                    
                    if (drop.type === 'smudge') {
                        propsRef.current.actions.addSecretSmudge();
                        soundManagerRef.current?.playBonePickup(); 
                        pickedUp = true;
                    } else if (drop.type === 'health') {
                        // Health Pickup Logic
                        const { secretPlayerHealth, playerUpgrades } = propsRef.current;
                        if (secretPlayerHealth < playerUpgrades.maxHealth) {
                            propsRef.current.actions.updateState({ 
                                secretPlayerHealth: Math.min(playerUpgrades.maxHealth, secretPlayerHealth + 2) 
                            });
                            // Use a distinct sound if possible, reuse bone/generic for now
                            soundManagerRef.current?.playBonePickup();
                            pickedUp = true;
                        }
                    }
                    
                    if (pickedUp) {
                        drop.mesh.dispose();
                        secretDropsRef.current.splice(i, 1);
                    }
                }
            } else {
                secretDropsRef.current.splice(i, 1);
            }
        }

        // WAVE SPAWN LOGIC
        const { secretWave, waveEnemiesSpawned, waveTotalEnemies, secretPlayerHealth, secretPhase, smudgeTimer } = propsRef.current;
        const activeCount = secretEnemiesRef.current.length;
        
        let maxActive = 5;
        if (secretWave === 2) maxActive = 10;
        else if (secretWave >= 3) maxActive = 15;
        
        const navmesh = houseLayoutRef.current?.navmesh; 
        const navGrid = navmesh ? (navmesh as any).grid : null;
        
        const canSpawn = navmesh && navmesh.nodes.length > 0 && secretPhase === 'wave'; // Only spawn in 'wave' phase

        if (activeCount < maxActive && waveEnemiesSpawned < waveTotalEnemies && canSpawn) {
            if (now - lastSpawnTimeRef.current > 2000) {
                const spawnPoints = secretSpawnPointsRef.current;
                const ghostModels = obakeShapeshiftModelsRef.current;
                
                if (spawnPoints.length > 0 && ghostModels && ghostModels.length > 0) {
                    const farPoints = spawnPoints.filter(p => BABYLON.Vector3.Distance(p, playerPos) > 15);
                    
                    let bestSpawn = spawnPoints[0];
                    if (farPoints.length > 0) {
                        bestSpawn = farPoints[Math.floor(Math.random() * farPoints.length)];
                    } else {
                        bestSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
                    }
                    
                    const spawnPos = bestSpawn.clone();
                    const template = ghostModels[Math.floor(Math.random() * ghostModels.length)];
                    const enemy = template.instantiateHierarchy();
                    
                    enemy.position.copyFrom(spawnPos);
                    enemy.setEnabled(true);
                    enemy.name = "secret_enemy_" + performance.now();
                    
                    enemy.checkCollisions = true;
                    enemy.isPickable = true;
                    enemy.scaling.setAll(0.9); 
                    enemy.ellipsoid = new BABYLON.Vector3(0.25, 0.9, 0.25); 
                    enemy.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0); 
                    enemy.collisionGroup = COLLISION_GROUPS.GHOST;
                    enemy.collisionMask = COLLISION_GROUPS.WALLS | COLLISION_GROUPS.DOORS;
                    
                    const hpBar = BABYLON.MeshBuilder.CreatePlane("hb", { width: 1, height: 0.15 }, scene);
                    hpBar.parent = enemy;
                    hpBar.position.y = 2.5; 
                    hpBar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                    
                    const hpMat = new BABYLON.StandardMaterial("hbMat", scene);
                    hpMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
                    hpMat.disableLighting = true;
                    hpBar.material = hpMat;
                    hpBar.isVisible = false;

                    enemy.metadata = { 
                        type: 'secret_enemy', 
                        hp: 5 + (secretWave * 2), 
                        maxHp: 5 + (secretWave * 2), 
                        healthBar: hpBar, 
                        lastFootstep: 0,
                        currentPath: [],
                        lastPathTime: now + Math.random() * 2000, 
                        nextLosCheck: now + Math.random() * 500,
                        stuckTime: 0,
                        isUnstucking: false,
                        unstuckDirection: null,
                        lastPos: spawnPos.clone(),
                        wanderPath: [] 
                    }; 
                    
                    enemy.onDisposeObservable.add(() => {
                        const roll = Math.random();
                        if (roll < 0.15) { // 15% Chance for Health
                            spawnDrop(enemy.position.clone(), 'health');
                        } else if (roll < 0.45) { // 30% Chance for Smudge
                            spawnDrop(enemy.position.clone(), 'smudge');
                        }
                    });
                    
                    const allMeshes = enemy.getDescendants(false);
                    allMeshes.push(enemy);
                    allMeshes.forEach((m: any) => {
                        m.isVisible = true;
                        m.checkCollisions = false; 
                        m.isPickable = true; 
                    });

                    secretEnemiesRef.current.push(enemy);
                    propsRef.current.actions.updateState({ waveEnemiesSpawned: waveEnemiesSpawned + 1 });
                    
                    lastSpawnTimeRef.current = now;
                }
            }
        }

        const baseSpeed = 2.0;
        const speedMultiplier = secretWave >= 3 ? 1.5 : 1.0;
        
        // [FIX] Check global smudge timer for flee state
        const isFleeing = smudgeTimer > 0;
        
        let speed = (baseSpeed + (secretWave * 0.1)) * speedMultiplier;
        if (isFleeing) speed *= 1.5;

        let minEnemyDist = Infinity;

        // [HELPER] Recursive Overlay Applier
        const applyOverlayRecursive = (root: any, enabled: boolean, color?: any) => {
            if (root.renderOverlay !== undefined) {
                root.renderOverlay = enabled;
                if (color) root.overlayColor = color;
            }
            const children = root.getDescendants ? root.getDescendants(false) : [];
            children.forEach((c: any) => applyOverlayRecursive(c, enabled, color));
        };

        for (let i = secretEnemiesRef.current.length - 1; i >= 0; i--) {
            const enemy = secretEnemiesRef.current[i];
            if (enemy.isDisposed()) {
                secretEnemiesRef.current.splice(i, 1);
                continue;
            }
            
            const currentPos = enemy.position;
            const lastPos = enemy.metadata.lastPos || currentPos;
            
            // --- STUCK DETECTION LOGIC ---
            const distMoved = BABYLON.Vector3.Distance(currentPos, lastPos);
            const expectedDist = speed * deltaTime * 0.3;
            const distToPlayer = BABYLON.Vector3.Distance(enemy.position, playerPos);
            
            if (distToPlayer > 1.5 && distMoved < expectedDist) {
                enemy.metadata.stuckTime = (enemy.metadata.stuckTime || 0) + deltaTime;
            } else {
                enemy.metadata.stuckTime = 0;
            }
            
            if (enemy.metadata.stuckTime > 0.5 && !enemy.metadata.isUnstucking) {
                enemy.metadata.isUnstucking = true;
                enemy.metadata.stuckTime = 0;
                
                const forward = enemy.forward;
                const turnAngle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + (Math.random() * 0.5));
                enemy.rotation.y += turnAngle;
                enemy.metadata.unstuckTimer = 1.0; 
            }

            enemy.metadata.lastPos = currentPos.clone();

            const isOutOfBounds = currentPos.y < -10.0; 

            if (isOutOfBounds) {
                 const points = secretSpawnPointsRef.current;
                 if (points.length > 0) {
                     const farPoints = points.filter(p => BABYLON.Vector3.Distance(p, playerPos) > 15);
                     const nextPos = farPoints.length > 0 ? farPoints[Math.floor(Math.random() * farPoints.length)].clone() : points[0].clone();
                     
                     enemy.position.copyFrom(nextPos);
                     enemy.metadata.stuckTime = 0;
                     enemy.metadata.currentPath = [];
                     enemy.metadata.wanderPath = [];
                     enemy.metadata.lastPathTime = now + Math.random() * 500;
                     enemy.metadata.lastPos = nextPos.clone();
                     continue; 
                 }
            }
            
            if (distToPlayer < minEnemyDist) minEnemyDist = distToPlayer;
            
            if (enemy.metadata.healthBar) {
                const pct = Math.max(0, enemy.metadata.hp / enemy.metadata.maxHp);
                enemy.metadata.healthBar.scaling.x = pct;
                if (pct < 0.3) enemy.metadata.healthBar.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
                else enemy.metadata.healthBar.material.emissiveColor = new BABYLON.Color3(0, 1, 0);
                
                if (enemy.metadata.hp < enemy.metadata.maxHp) {
                    enemy.metadata.healthBar.isVisible = true;
                }
            }
            
            // --- VISUAL HIT / BURN EFFECTS ---
            const isBurning = enemy.metadata.isBurning && enemy.metadata.burnDuration > 0;
            const isHitRecently = enemy.metadata.lastHitTime && (now - enemy.metadata.lastHitTime < 150);
            
            if (isBurning || isHitRecently) {
                const overlayColor = isHitRecently ? new BABYLON.Color3(1, 0, 0) : new BABYLON.Color3(1, 0.4, 0);
                applyOverlayRecursive(enemy, true, overlayColor);
                
                if (isBurning) {
                    enemy.metadata.burnDuration -= deltaTime;
                    enemy.metadata.hp -= enemy.metadata.burnDamage * deltaTime;
                    
                    if (enemy.metadata.burnDuration <= 0) {
                        enemy.metadata.isBurning = false;
                    }
                }
                
                if (enemy.metadata.hp <= 0) {
                    enemy.dispose();
                    secretEnemiesRef.current.splice(i, 1);
                    if (propsRef.current.actions.enemyKilled) propsRef.current.actions.enemyKilled();
                    continue; 
                }
            } else {
                applyOverlayRecursive(enemy, false);
            }

            // AI PATHFINDING
            let moveTarget = enemy.position; 
            let hasLoS = false;
            
            if (enemy.metadata.isUnstucking) {
                enemy.metadata.unstuckTimer -= deltaTime;
                if (enemy.metadata.unstuckTimer <= 0) {
                    enemy.metadata.isUnstucking = false;
                    enemy.metadata.currentPath = [];
                    enemy.metadata.lastPathTime = 0; 
                }
                const direction = enemy.forward;
                const velocity = direction.scale(speed * deltaTime);
                const gravity = new BABYLON.Vector3(0, -9.0, 0).scale(deltaTime);
                enemy.moveWithCollisions(velocity.add(gravity));
                continue; 
            }

            if (!isFleeing) {
                if (now > (enemy.metadata.nextLosCheck || 0)) {
                    enemy.metadata.nextLosCheck = now + 200 + Math.random() * 300;
                    
                    const dirToPlayer = playerPos.subtract(enemy.position).normalize();
                    const ray = new BABYLON.Ray(enemy.position.add(new BABYLON.Vector3(0, 1, 0)), dirToPlayer, distToPlayer);
                    
                    const pick = scene.pickWithRay(ray, (m: any) => m.checkCollisions && m.collisionGroup === COLLISION_GROUPS.WALLS);
                    
                    if (!pick || !pick.hit || pick.distance >= distToPlayer - 0.5) {
                        enemy.metadata.hasCachedLoS = true;
                    } else {
                        enemy.metadata.hasCachedLoS = false;
                    }
                }
                hasLoS = !!enemy.metadata.hasCachedLoS;
            }

            if (hasLoS && !isFleeing) {
                moveTarget = playerPos;
                enemy.metadata.currentPath = [];
                enemy.metadata.wanderPath = [];
            } else if (navmesh && navmesh.nodes.length > 0) {
                const updateFreq = isFleeing ? 500 : 2000;
                
                if (!enemy.metadata.lastPathTime || now - enemy.metadata.lastPathTime > updateFreq || (enemy.metadata.currentPath.length === 0 && enemy.metadata.wanderPath.length === 0)) {
                    let closestNode = null;
                    
                    if (navGrid) {
                        const gx = Math.round(enemy.position.x / 1.5);
                        const gz = Math.round(enemy.position.z / 1.5);
                        for(let dx=-1; dx<=1; dx++) {
                            for(let dz=-1; dz<=1; dz++) {
                                const node = navGrid.get(`${gx+dx},${gz+dz}`);
                                if (node) {
                                    closestNode = node;
                                    break;
                                }
                            }
                            if(closestNode) break;
                        }
                    }
                    
                    if (!closestNode) {
                        let minD = Infinity;
                        for (const n of navmesh.nodes) {
                            const nd = Math.abs(n.position.x - enemy.position.x) + Math.abs(n.position.z - enemy.position.z); 
                            if (nd < minD) { minD = nd; closestNode = n; }
                        }
                    }
                    
                    if (closestNode) {
                        if (isFleeing) {
                            let bestNode = null;
                            let maxDist = -1;
                            for(let k=0; k<5; k++) { 
                                const rNode = navmesh.nodes[Math.floor(Math.random() * navmesh.nodes.length)];
                                const d = BABYLON.Vector3.DistanceSquared(new BABYLON.Vector3(rNode.position.x, rNode.position.y, rNode.position.z), playerPos);
                                if (d > maxDist) { maxDist = d; bestNode = rNode; }
                            }
                            if (bestNode) {
                                const pathIds = findPathBFS(navmesh.graph, closestNode.id, bestNode.id);
                                if (pathIds) {
                                    enemy.metadata.currentPath = pathIds.map((id: number) => {
                                        const n = navmesh.nodes.find((node: NavNode) => node.id === id);
                                        return new BABYLON.Vector3(n.position.x, n.position.y, n.position.z);
                                    });
                                }
                            }
                        } else {
                            let playerNode = null;
                            if (navGrid) {
                                const px = Math.round(playerPos.x / 1.5);
                                const pz = Math.round(playerPos.z / 1.5);
                                playerNode = navGrid.get(`${px},${pz}`);
                            }
                            if (!playerNode) {
                                let minPD = Infinity;
                                for (const n of navmesh.nodes) {
                                    const nd = Math.abs(n.position.x - playerPos.x) + Math.abs(n.position.z - playerPos.z);
                                    if (nd < minPD) { minPD = nd; playerNode = n; }
                                }
                            }

                            if (playerNode) {
                                const pathIds = findPathBFS(navmesh.graph, closestNode.id, playerNode.id);
                                if (pathIds && pathIds.length > 0) {
                                    enemy.metadata.currentPath = pathIds.map((id: number) => {
                                        const n = navmesh.nodes.find((node: NavNode) => node.id === id);
                                        return new BABYLON.Vector3(n.position.x, n.position.y, n.position.z);
                                    });
                                    enemy.metadata.wanderPath = []; 
                                } else {
                                    const rNode = navmesh.nodes[Math.floor(Math.random() * navmesh.nodes.length)];
                                    const wanderPathIds = findPathBFS(navmesh.graph, closestNode.id, rNode.id);
                                    if (wanderPathIds) {
                                        enemy.metadata.wanderPath = wanderPathIds.map((id: number) => {
                                            const n = navmesh.nodes.find((node: NavNode) => node.id === id);
                                            return new BABYLON.Vector3(n.position.x, n.position.y, n.position.z);
                                        });
                                    }
                                }
                            }
                        }
                    }
                    enemy.metadata.lastPathTime = now + Math.random() * 200; 
                }
                
                if (enemy.metadata.currentPath && enemy.metadata.currentPath.length > 0) {
                    const nextWaypoint = enemy.metadata.currentPath[0];
                    moveTarget = nextWaypoint;
                    if (BABYLON.Vector3.Distance(enemy.position, nextWaypoint) < 1.0) {
                        enemy.metadata.currentPath.shift();
                    }
                } else if (enemy.metadata.wanderPath && enemy.metadata.wanderPath.length > 0) {
                    const nextWaypoint = enemy.metadata.wanderPath[0];
                    moveTarget = nextWaypoint;
                    if (BABYLON.Vector3.Distance(enemy.position, nextWaypoint) < 1.0) {
                        enemy.metadata.wanderPath.shift();
                    }
                } 
            }

            const direction = moveTarget.subtract(enemy.position);
            direction.y = 0;
            
            if (direction.lengthSquared() > 0.001) {
                direction.normalize();
                
                const velocity = direction.scale(speed * deltaTime);
                const gravity = new BABYLON.Vector3(0, -9.0, 0).scale(deltaTime);
                
                const lookTarget = moveTarget.clone();
                lookTarget.y = enemy.position.y;
                enemy.lookAt(lookTarget);
                
                if (enemy.rotationQuaternion) {
                        enemy.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, enemy.rotationQuaternion.toEulerAngles().y, 0);
                }
                
                enemy.moveWithCollisions(velocity.add(gravity));
                
                if (enemy.position.y < 0.1) enemy.position.y = 0.1;
            }
            
            if (now - enemy.metadata.lastFootstep > 400) {
                soundManagerRef.current?.playGhostFootstep(enemy.position, false, true);
                enemy.metadata.lastFootstep = now;
            }
            
            if (!isFleeing && distToPlayer < 1.0) {
                const hp = secretPlayerHealth;
                const damage = secretWave >= 2 ? 2 : 1;
                
                if (hp <= damage) {
                    onPlayerDeath("OVERRUN BY THE HORDE");
                } else {
                    propsRef.current.actions.updateState({ secretPlayerHealth: hp - damage });
                    const spawnPoints = secretSpawnPointsRef.current;
                    if (spawnPoints.length > 0) {
                        const farPoints = spawnPoints.filter(p => BABYLON.Vector3.Distance(p, playerPos) > 15);
                        let bestSpawn = spawnPoints[0];
                        if (farPoints.length > 0) {
                            bestSpawn = farPoints[Math.floor(Math.random() * farPoints.length)];
                        } else {
                            bestSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
                        }
                        
                        enemy.position.copyFrom(bestSpawn);
                        enemy.metadata.lastPathTime = now + Math.random() * 2000; 
                        enemy.metadata.currentPath = [];
                        enemy.metadata.wanderPath = [];
                        enemy.metadata.hp = enemy.metadata.maxHp; 
                        if (enemy.metadata.healthBar) enemy.metadata.healthBar.isVisible = false;
                    }
                }
            }
        }
        
        if (minEnemyDist < 10) {
            soundManagerRef.current?.setHeartbeatVolume(1.0);
            soundManagerRef.current?.playHeartbeat(false);
        } else {
            soundManagerRef.current?.stopHeartbeat();
        }
        
        if (playerControllerRef.current) {
            playerControllerRef.current.update({
                rig, camera, scene, 
                inputMap: inputMapRef.current!, 
                isCrouching: false, 
                isSprintingState: true, 
                stamina: 100,
                touchControlsEnabled: propsRef.current.touchControlsEnabled, 
                touchState: propsRef.current.touchState, 
                touchSensitivity: propsRef.current.touchSensitivity,
                deltaTime,
                isFlying: false
            });
        }
    }, [sceneRef, playerRootRef, playerCameraRef, inputMapRef, propsRef, soundManagerRef, houseLayoutRef, secretEnemiesRef, secretSpawnPointsRef, obakeShapeshiftModelsRef, playerControllerRef, spawnDrop, onPlayerDeath]);

    return { runSecretLoop };
};
