
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE, UV_EVIDENCE_LAYER_MASK, VIEWMODEL_LAYER_MASK, COLLISION_GROUPS } from '../../constants';
import SoundManager from '../../services/SoundManager';
import { useStore } from '../../store';

declare const BABYLON: any;

interface ActiveFire {
    system: any;
    emitterNode: any;
    startTime: number;
}

export class FlamethrowerHandler implements IItemHandler {
    private mainFlameSystem: any;
    private pilotLightSystem: any;
    private launcherSystem: any;
    private particleEmitter: any;
    private launcherEmitter: any;
    private soundManager: SoundManager;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private wasOn: boolean = false;
    private scene: any;
    private mesh: any;
    private actions: any;
    private ghostMeshRef: any;
    private playerCamera: any;
    private secretEnemiesRef: any;
    
    private lastScorchTime: number = 0;
    private activeFires: ActiveFire[] = [];
    
    private lastLauncherShotTime: number = 0;
    
    // Burst Fire Logic
    private shotsInCurrentBurst: number = 0;
    private burstEndTime: number = 0;
    
    // World Space Aim Vector (From Camera)
    private currentAimVector: any = new BABYLON.Vector3(0, 0, 1);
    
    // Cached Stats for performance in loops
    private currentDamageMultiplier: number = 1.0;

    constructor(props: ItemHandlerProps) {
        const { scene, viewModelMesh, soundManager, isPlaced, itemInstanceId, actions, ghostMeshRef, playerCamera, secretEnemiesRef } = props;
        this.scene = scene;
        this.soundManager = soundManager;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.mesh = viewModelMesh;
        this.actions = actions;
        this.ghostMeshRef = ghostMeshRef;
        this.playerCamera = playerCamera;
        this.secretEnemiesRef = secretEnemiesRef;

        const allMeshes = viewModelMesh.getDescendants(false);
        const tipMesh = allMeshes.find((m: any) => m.name.toLowerCase().includes('tip'));
        const shootMesh = allMeshes.find((m: any) => m.name.toLowerCase().includes('shoot'));

        // --- 1. FLAME EMITTER SETUP ---
        this.particleEmitter = new BABYLON.TransformNode("flamethrowerEmitter", scene);
        
        if (tipMesh) {
            this.particleEmitter.parent = tipMesh;
            this.particleEmitter.position = BABYLON.Vector3.Zero();
            this.particleEmitter.rotation = BABYLON.Vector3.Zero();
        } else {
            this.particleEmitter.parent = viewModelMesh;
            
            let nozzleMeshBoundInfo: any = null;
            let maxZ = -Infinity;

            allMeshes.forEach((m: any) => {
                if (m.getBoundingInfo && m.isVisible) {
                    m.computeWorldMatrix(true);
                    const boundingInfo = m.getBoundingInfo();
                    if (boundingInfo.maximum.z > maxZ) {
                        maxZ = boundingInfo.maximum.z;
                        nozzleMeshBoundInfo = boundingInfo;
                    }
                }
            });

            if (nozzleMeshBoundInfo) {
                const min = nozzleMeshBoundInfo.minimum;
                const max = nozzleMeshBoundInfo.maximum;
                const centerX = (min.x + max.x) / 2;
                const centerY = (min.y + max.y) / 2;
                const tipZ = max.z;
                this.particleEmitter.position = new BABYLON.Vector3(centerX, centerY, tipZ + 0.02);
            } else {
                this.particleEmitter.position = new BABYLON.Vector3(0, 0, 0.85); 
            }
        }

        // --- 2. PILOT LIGHT ---
        this.pilotLightSystem = new BABYLON.ParticleSystem("pilotLight", 50, scene);
        this.pilotLightSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.pilotLightSystem.emitter = this.particleEmitter;
        this.pilotLightSystem.color1 = new BABYLON.Color4(0.2, 0.5, 1.0, 0.8);
        this.pilotLightSystem.color2 = new BABYLON.Color4(0.0, 0.2, 0.8, 0.0);
        this.pilotLightSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        this.pilotLightSystem.minSize = 0.02;
        this.pilotLightSystem.maxSize = 0.05;
        this.pilotLightSystem.minLifeTime = 0.2;
        this.pilotLightSystem.maxLifeTime = 0.4;
        this.pilotLightSystem.emitRate = 20;
        this.pilotLightSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        this.pilotLightSystem.gravity = new BABYLON.Vector3(0, 0.5, 0);
        
        // Direction will be updated dynamically
        this.pilotLightSystem.direction1 = new BABYLON.Vector3(0, 0, 1);
        this.pilotLightSystem.direction2 = new BABYLON.Vector3(0, 0, 1);
        this.pilotLightSystem.minEmitBox = BABYLON.Vector3.Zero();
        this.pilotLightSystem.maxEmitBox = BABYLON.Vector3.Zero();

        this.pilotLightSystem.start();

        // --- 3. MAIN FLAME SYSTEM ---
        this.mainFlameSystem = new BABYLON.ParticleSystem("mainFlame", 2000, scene);
        this.mainFlameSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.mainFlameSystem.emitter = this.particleEmitter;
        
        this.mainFlameSystem.color1 = new BABYLON.Color4(0.2, 0.6, 1.0, 1.0); // Blue core
        this.mainFlameSystem.color2 = new BABYLON.Color4(1.0, 0.5, 0.2, 0.5); // Orange edge
        this.mainFlameSystem.colorDead = new BABYLON.Color4(0.1, 0.1, 0.1, 0.0);

        this.mainFlameSystem.minSize = 0.1;
        this.mainFlameSystem.maxSize = 0.5;
        this.mainFlameSystem.minLifeTime = 0.5;
        this.mainFlameSystem.maxLifeTime = 1.0;
        this.mainFlameSystem.emitRate = 1000;
        this.mainFlameSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        this.mainFlameSystem.minEmitBox = BABYLON.Vector3.Zero();
        this.mainFlameSystem.maxEmitBox = BABYLON.Vector3.Zero();
        this.mainFlameSystem.direction1 = new BABYLON.Vector3(0, 0, 1);
        this.mainFlameSystem.direction2 = new BABYLON.Vector3(0, 0, 1);

        this.mainFlameSystem.minEmitPower = 5;
        this.mainFlameSystem.maxEmitPower = 8;
        this.mainFlameSystem.updateSpeed = 0.01;
        
        // --- 4. LAUNCHER EMITTER SETUP ---
        if (shootMesh) {
            this.launcherEmitter = new BABYLON.TransformNode("flamethrowerLauncher", scene);
            this.launcherEmitter.parent = shootMesh;
            this.launcherEmitter.position = BABYLON.Vector3.Zero();
            this.launcherEmitter.rotation = BABYLON.Vector3.Zero();
        } else {
            this.launcherEmitter = new BABYLON.TransformNode("flamethrowerLauncher", scene);
            this.launcherEmitter.parent = this.particleEmitter;
            this.launcherEmitter.position = new BABYLON.Vector3(0, -0.1, 0); 
        }

        this.launcherSystem = new BABYLON.ParticleSystem("launcherParticles", 200, scene);
        this.launcherSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.launcherSystem.emitter = this.launcherEmitter;
        
        this.launcherSystem.color1 = new BABYLON.Color4(1.0, 0.8, 0.5, 1.0);
        this.launcherSystem.color2 = new BABYLON.Color4(1.0, 0.0, 0.0, 0.0);
        this.launcherSystem.minSize = 0.1;
        this.launcherSystem.maxSize = 0.3;
        this.launcherSystem.minLifeTime = 0.1;
        this.launcherSystem.maxLifeTime = 0.2;
        this.launcherSystem.emitRate = 100;
        this.launcherSystem.manualEmitCount = 0; 
        this.launcherSystem.minEmitPower = 2;
        this.launcherSystem.maxEmitPower = 5;
        
        this.launcherSystem.gravity = new BABYLON.Vector3(0, 0, 0);
        this.launcherSystem.direction1 = new BABYLON.Vector3(0, 0, 1);
        this.launcherSystem.direction2 = new BABYLON.Vector3(0, 0, 1);
        this.launcherSystem.minEmitBox = BABYLON.Vector3.Zero();
        this.launcherSystem.maxEmitBox = BABYLON.Vector3.Zero();
        
        this.launcherSystem.minEmitPower = 60;
        this.launcherSystem.maxEmitPower = 80;
    }

    // [FIX] ACCURACY LOGIC
    private updateAimVector() {
        if (!this.playerCamera || !this.scene || !this.particleEmitter) return;

        // 1. Get Aim Direction in World Space (Camera Forward)
        // This ignores the gun model's rotation and uses raw player input
        const aimWorld = this.playerCamera.getDirection(BABYLON.Vector3.Forward());
        
        // Store World Vector for Physics & Raycasts
        this.currentAimVector.copyFrom(aimWorld);

        // 2. Convert World Vector to Emitter's Local Space
        // Particle systems attached to meshes use Local Coordinates.
        // We need LocalVector such that (EmitterRotation * LocalVector) = WorldAim
        
        this.particleEmitter.computeWorldMatrix(true);
        const worldMatrix = this.particleEmitter.getWorldMatrix();
        const invWorldMatrix = worldMatrix.clone().invert();
        
        // Transform Normal rotates the vector by the inverse rotation of the mesh
        const localAim = BABYLON.Vector3.TransformNormal(aimWorld, invWorldMatrix).normalize();

        // 3. Apply LOCAL vector to Flame Systems
        if (this.mainFlameSystem) {
            this.mainFlameSystem.direction1.copyFrom(localAim);
            this.mainFlameSystem.direction2.copyFrom(localAim);
        }
        if (this.pilotLightSystem) {
            this.pilotLightSystem.direction1.copyFrom(localAim);
            this.pilotLightSystem.direction2.copyFrom(localAim);
        }
        
        // 4. Repeat for Launcher (it might have different rotation parent)
        if (this.launcherSystem && this.launcherEmitter) {
             this.launcherEmitter.computeWorldMatrix(true);
             const launcherMatrix = this.launcherEmitter.getWorldMatrix();
             const invLauncherMatrix = launcherMatrix.clone().invert();
             const localLauncherAim = BABYLON.Vector3.TransformNormal(aimWorld, invLauncherMatrix).normalize();

            this.launcherSystem.direction1.copyFrom(localLauncherAim);
            this.launcherSystem.direction2.copyFrom(localLauncherAim);
        }
    }

    public update(state: AppState): void {
        const isOn = state.isFlamethrowerOn;
        const isAltFire = state.isFlamethrowerAltFire;
        
        // Update stats
        this.currentDamageMultiplier = state.playerUpgrades.damageMultiplier;
        
        // Update Aim every frame if held
        if (!this.isPlaced) {
            this.updateAimVector();
        }

        // --- MAIN FIRE ---
        if (isOn) {
            if (!this.mainFlameSystem.isStarted()) {
                this.mainFlameSystem.start();
                this.soundManager?.playFlamethrowerLoop(this.mesh.getAbsolutePosition());
            }
            
            // Interaction/Damage Logic
            const now = performance.now();
            if (now - this.lastScorchTime > 100) {
                this.lastScorchTime = now;
                this.checkDamage(state);
            }
        } else {
            if (this.mainFlameSystem.isStarted()) {
                this.mainFlameSystem.stop();
                this.soundManager?.stopFlamethrowerLoop();
            }
        }

        // --- ALT FIRE (Launcher) ---
        if (isAltFire) {
            const now = performance.now();
            
            // Burst Logic: Fire 3 shots rapidly, then wait for the remainder of the second
            if (now >= this.burstEndTime) {
                if (now - this.lastLauncherShotTime > 80) { // ~80ms between shots in burst
                    this.lastLauncherShotTime = now;
                    this.fireProjectile();
                    this.shotsInCurrentBurst++;

                    if (this.shotsInCurrentBurst >= 3) {
                        this.shotsInCurrentBurst = 0;
                        this.burstEndTime = now + 700; // Wait approx 0.7s before next burst allowed
                    }
                }
            }
        } else {
            this.shotsInCurrentBurst = 0;
        }
    }

    private fireProjectile() {
        if (!this.scene || !this.launcherEmitter) return;
        
        this.launcherSystem.manualEmitCount = 5; 
        this.launcherSystem.start();
        
        // Create Projectile
        const projectile = BABYLON.MeshBuilder.CreateSphere("flameProjectile", { diameter: 0.2 }, this.scene);
        
        this.launcherEmitter.computeWorldMatrix(true);
        const pos = this.launcherEmitter.getAbsolutePosition();
        projectile.position.copyFrom(pos);
        
        const mat = new BABYLON.StandardMaterial("flameProjectileMat", this.scene);
        mat.emissiveColor = new BABYLON.Color3(0, 1, 1);
        mat.disableLighting = true;
        projectile.material = mat;
        
        projectile.physicsImpostor = new BABYLON.PhysicsImpostor(projectile, BABYLON.PhysicsImpostor.SphereImpostor, { mass: 0.5, restitution: 0.5 }, this.scene);
        
        // [FIX] IMPULSE: Use the World Aim Vector calculated from camera
        const velocityVector = this.currentAimVector.scale(60);
        projectile.physicsImpostor.applyImpulse(velocityVector, pos); 
        
        // Trail
        const trail = new BABYLON.ParticleSystem("trail", 100, this.scene);
        trail.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, this.scene);
        trail.emitter = projectile;
        trail.minEmitBox = BABYLON.Vector3.Zero();
        trail.maxEmitBox = BABYLON.Vector3.Zero();
        trail.color1 = new BABYLON.Color4(0, 1, 1, 1);
        trail.color2 = new BABYLON.Color4(0, 0.5, 1, 0);
        trail.minSize = 0.1;
        trail.maxSize = 0.3;
        trail.minLifeTime = 0.1;
        trail.maxLifeTime = 0.3;
        trail.emitRate = 100;
        trail.start();

        const damage = 1 * this.currentDamageMultiplier; // Reduced from 8 to 1

        // Projectile Logic (Raycast Sweep)
        let life = 0;
        const lastPos = projectile.position.clone(); // Track position for Raycast Sweep

        const observer = this.scene.onBeforeRenderObservable.add(() => {
            life++;
            const currentPos = projectile.position;
            
            // [FIX] RAYCAST SWEEP: Check path from previous frame to current frame
            // This catches hits even if the projectile "tunnels" through the enemy due to speed.
            const direction = currentPos.subtract(lastPos);
            const distance = direction.length();
            
            if (distance > 0) {
                direction.normalize();
                
                // Raycast along path
                const ray = new BABYLON.Ray(lastPos, direction, distance + 0.1); // +0.1 buffer
                
                const pick = this.scene.pickWithRay(ray, (m: any) => {
                    // Check if picking an enemy part (root or child)
                    // If it's part of the secretEnemiesRef list (or child of one)
                    if (this.secretEnemiesRef && this.secretEnemiesRef.current) {
                        for (const root of this.secretEnemiesRef.current) {
                            if (m === root || m.isDescendantOf(root)) return true;
                        }
                    }
                    // Also check standard ghost
                    if (this.ghostMeshRef && this.ghostMeshRef.current) {
                        const root = this.ghostMeshRef.current;
                        if (m === root || m.isDescendantOf(root)) return true;
                    }
                    
                    // [FIX] Wall Check: Stop at walls/floors
                    if (m.checkCollisions && (
                        m.collisionGroup === COLLISION_GROUPS.WALLS || 
                        m.collisionGroup === COLLISION_GROUPS.FURNITURE ||
                        m.collisionGroup === COLLISION_GROUPS.DOORS
                    )) return true;
                    
                    // Fallback for unnamed static geometry
                    if (m.name.includes("wall") || m.name.includes("floor") || m.name.includes("ground") || m.name.includes("ceiling") || m.name.includes("collider")) return true;

                    return false;
                });

                if (pick && pick.hit && pick.pickedMesh) {
                    const hitMesh = pick.pickedMesh;
                    let hitEnemy = false;
                    
                    // --- SECRET MODE COLLISION ---
                    if (this.secretEnemiesRef && this.secretEnemiesRef.current) {
                        // Find which enemy root this mesh belongs to
                        const enemyRoot = this.secretEnemiesRef.current.find((root: any) => root === hitMesh || hitMesh.isDescendantOf(root));
                        
                        if (enemyRoot && enemyRoot.isEnabled()) {
                            hitEnemy = true;
                            if (!enemyRoot.metadata.hp) enemyRoot.metadata.hp = 5;
                            enemyRoot.metadata.hp -= damage;
                            
                            // [FIX] Tag metadata for visual effect loop in useSecretGameLoop
                            enemyRoot.metadata.lastHitTime = performance.now();

                            if (enemyRoot.metadata.hp <= 0) {
                                enemyRoot.dispose();
                                const index = this.secretEnemiesRef.current.indexOf(enemyRoot);
                                if (index > -1) {
                                    this.secretEnemiesRef.current.splice(index, 1);
                                    // [FIX] Trigger Kill Count update in store
                                    if (this.actions.enemyKilled) this.actions.enemyKilled();
                                }
                            }
                        }
                    }

                    // --- STANDARD MODE COLLISION ---
                    if (!hitEnemy && this.ghostMeshRef && this.ghostMeshRef.current) {
                        const ghostRoot = this.ghostMeshRef.current;
                        if (hitMesh === ghostRoot || hitMesh.isDescendantOf(ghostRoot)) {
                             hitEnemy = true;
                             const state = useStore.getState ? useStore.getState() : null;
                            if (state && state.isHunting) {
                                this.actions.triggerSecretRound();
                            }
                        }
                    }
                    
                    // [FIX] WALL COLLISION: If we hit something and it wasn't an enemy, destroy the ball
                    if (hitEnemy || !hitEnemy) { 
                        // Always destroy ball on hit (Enemy or Wall)
                        this.scene.onBeforeRenderObservable.remove(observer);
                        trail.stop();
                        trail.dispose();
                        projectile.dispose();
                        return;
                    }
                }
            }

            // Update Last Pos
            lastPos.copyFrom(currentPos);

            if (life > 200 || projectile.position.y < -20) { 
                this.scene.onBeforeRenderObservable.remove(observer);
                trail.stop();
                trail.dispose();
                projectile.dispose();
            }
        });
    }

    private checkDamage(state: AppState) {
        if (!this.particleEmitter) return;
        
        const origin = this.particleEmitter.getAbsolutePosition();
        const forward = this.currentAimVector;
        
        const range = 6 * WORLD_SCALE;
        const coneAngle = Math.PI / 6; 

        if (state.isSecretMode && this.secretEnemiesRef && this.secretEnemiesRef.current) {
            for (let i = this.secretEnemiesRef.current.length - 1; i >= 0; i--) {
                const enemy = this.secretEnemiesRef.current[i];
                if (!enemy || enemy.isDisposed()) {
                    this.secretEnemiesRef.current.splice(i, 1);
                    continue;
                }

                const enemyPos = enemy.position;
                const toEnemy = enemyPos.subtract(origin);
                const dist = toEnemy.length();

                if (dist < range) {
                    toEnemy.normalize();
                    const angle = Math.acos(BABYLON.Vector3.Dot(forward, toEnemy));
                    if (angle < coneAngle) {
                        if (!enemy.metadata.hp) enemy.metadata.hp = 5;
                        
                        // [FIX] Increased direct damage per tick (approx 10 ticks/sec)
                        // Make it 0.4 so it feels impactful but not instant. 0.4 * 10 = 4 DPS.
                        enemy.metadata.hp -= 0.4 * this.currentDamageMultiplier; 
                        
                        // Apply Burn Status
                        enemy.metadata.isBurning = true;
                        enemy.metadata.burnDuration = 4.0; // Burn for 4 seconds
                        // "Slow rate" DOT
                        enemy.metadata.burnDamage = 1.0 * this.currentDamageMultiplier; // DPS
                    }
                }
            }
        }
    }
    
    private handleSurfaceScorching() {
        const now = performance.now();
        if (now - this.lastScorchTime < 100) return;

        const origin = this.particleEmitter.getAbsolutePosition();
        const direction = this.currentAimVector;

        const rayStart = origin.add(direction.scale(0.5)); 
        const ray = new BABYLON.Ray(rayStart, direction, 8.0);

        const pickInfo = this.scene.pickWithRay(ray, (mesh: any) => {
            if (!mesh.checkCollisions && !mesh.physicsImpostor) return false;
            if ((mesh.layerMask & VIEWMODEL_LAYER_MASK) !== 0) return false;

            if (mesh.name.includes("player")) return false;
            if (mesh.name.includes("ghost")) return false;
            if (mesh.name.includes("flamethrower")) return false;
            if (mesh.isPickable === false && !mesh.checkCollisions) return false;
            return true;
        });

        if (pickInfo && pickInfo.hit) {
            this.spawnSurfaceFire(pickInfo.pickedPoint);
            this.lastScorchTime = now;
        }
    }
    
    private spawnSurfaceFire(position: any) {
        if (this.activeFires.length >= 20) {
            const old = this.activeFires.shift();
            if (old) {
                old.system.dispose();
                old.emitterNode.dispose();
            }
        }

        const fireNode = new BABYLON.TransformNode("scorchEmitter", this.scene);
        fireNode.position = position;

        const fireSystem = new BABYLON.ParticleSystem("surfaceFire", 200, this.scene);
        fireSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, this.scene);
        fireSystem.emitter = fireNode;

        fireSystem.color1 = new BABYLON.Color4(1.0, 0.5, 0.0, 1.0); 
        fireSystem.color2 = new BABYLON.Color4(1.0, 0.0, 0.0, 0.8); 
        fireSystem.colorDead = new BABYLON.Color4(0.2, 0.2, 0.2, 0.0);

        fireSystem.minSize = 0.2;
        fireSystem.maxSize = 0.5;
        fireSystem.minLifeTime = 0.5;
        fireSystem.maxLifeTime = 1.0;
        fireSystem.emitRate = 50;
        fireSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        fireSystem.gravity = new BABYLON.Vector3(0, 1.5, 0); 
        fireSystem.createSphereEmitter(0.1);
        fireSystem.minEmitPower = 0.1;
        fireSystem.maxEmitPower = 0.5;
        fireSystem.updateSpeed = 0.02;
        
        fireSystem.start();

        this.activeFires.push({
            system: fireSystem,
            emitterNode: fireNode,
            startTime: performance.now()
        });
    }

    private cleanupFires() {
        const now = performance.now();
        for (let i = this.activeFires.length - 1; i >= 0; i--) {
            const fire = this.activeFires[i];
            const age = now - fire.startTime;

            if (age > 3000 && fire.system.isStarted()) {
                fire.system.stop();
            }

            if (age > 5000) {
                fire.system.dispose();
                fire.emitterNode.dispose();
                this.activeFires.splice(i, 1);
            }
        }
    }

    public dispose(): void {
        this.soundManager?.stopFlamethrowerLoop();
        if (this.mainFlameSystem) this.mainFlameSystem.dispose();
        if (this.pilotLightSystem) this.pilotLightSystem.dispose();
        if (this.launcherSystem) this.launcherSystem.dispose();
        if (this.particleEmitter) this.particleEmitter.dispose();
        if (this.launcherEmitter) this.launcherEmitter.dispose();
        
        this.activeFires.forEach(f => {
            f.system.dispose();
            f.emitterNode.dispose();
        });
        this.activeFires = [];
    }
}
