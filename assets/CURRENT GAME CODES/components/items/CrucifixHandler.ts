
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState, AppActions, ItemId } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE, ITEMS } from '../../constants';
import SoundManager from '../../services/SoundManager';

declare const BABYLON: any;

export class CrucifixHandler implements IItemHandler {
    private flameSystem: any;
    private flameEmitter: any;
    private mesh: any;
    private soundManager: SoundManager;
    private actions: AppActions;
    private instanceId: number | undefined;
    private lastKnownUses: number = 2;
    private scene: any;
    private isBurning: boolean = false;
    private materials: any[] = [];
    private isPlaced: boolean;
    private devRangeMesh: any = null;

    // Constants
    private RED_EMISSIVE = new BABYLON.Color3(1, 0, 0);
    private CHARRED_COLOR = new BABYLON.Color3(0.1, 0.1, 0.1); // Dark charcoal grey/black
    private BLACK = new BABYLON.Color3(0, 0, 0);

    constructor(props: ItemHandlerProps) {
        const { scene, viewModelMesh, soundManager, itemInstanceId, isPlaced, actions } = props;
        this.scene = scene;
        this.mesh = viewModelMesh;
        this.soundManager = soundManager;
        this.actions = actions;
        this.instanceId = itemInstanceId;
        this.isPlaced = !!isPlaced;

        // 1. Initialize Materials list for modification later
        // We clone them to allow per-instance modification (burning one doesn't burn all)
        const meshes = [this.mesh, ...this.mesh.getDescendants(false)];
        meshes.forEach((m: any) => {
            if (m.material) {
                // Clone material if not already unique to this instance
                if (!m.material.name.includes(`_crucifix_${this.instanceId}`)) {
                    const newMat = m.material.clone(`${m.material.name}_crucifix_${this.instanceId}`);
                    m.material = newMat;
                }
                this.materials.push(m.material);
            }
        });

        // 2. Initialize Particle System (Fire)
        this.flameEmitter = new BABYLON.TransformNode("crucifixFlameEmitter", scene);
        this.flameEmitter.parent = this.mesh;
        this.flameEmitter.position = BABYLON.Vector3.Zero(); // Center of mesh

        this.flameSystem = new BABYLON.ParticleSystem("crucifixFlame", 1000, scene);
        this.flameSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.flameSystem.emitter = this.flameEmitter;

        // [CONFIG] FIRE COLORS
        this.flameSystem.color1 = new BABYLON.Color4(1.0, 0.5, 0.0, 1.0); // Orange
        this.flameSystem.color2 = new BABYLON.Color4(1.0, 0.0, 0.0, 1.0); // Red
        this.flameSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);

        // [CONFIG] PARTICLE PHYSICS
        this.flameSystem.minSize = 0.1 * WORLD_SCALE;
        this.flameSystem.maxSize = 0.3 * WORLD_SCALE;
        this.flameSystem.minLifeTime = 0.5;
        this.flameSystem.maxLifeTime = 1.0;
        this.flameSystem.emitRate = 300;
        this.flameSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        // Spread out fire along the cross shape roughly
        this.flameSystem.createBoxEmitter(new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(0, 1, 0), new BABYLON.Vector3(-0.2, -0.2, -0.2), new BABYLON.Vector3(0.2, 0.2, 0.2));
        
        this.flameSystem.minEmitPower = 1;
        this.flameSystem.maxEmitPower = 3;
        this.flameSystem.updateSpeed = 0.02;
        
        this.flameSystem.stop();
    }

    public update(state: AppState): void {
        let currentUses = 2;

        // Find the item in state (either placed or held)
        if (this.instanceId !== undefined) {
            const placedItem = state.placedItems.find(p => p.instanceId === this.instanceId);
            if (placedItem) {
                currentUses = placedItem.currentUses ?? placedItem.uses ?? 2;
            }
        } else if (state.equippedItem && state.equippedItem.id === ItemId.Crucifix) {
            currentUses = state.equippedItem.currentUses ?? state.equippedItem.uses ?? 2;
        }

        // Detect Usage
        if (currentUses < this.lastKnownUses && !this.isBurning) {
            this.lastKnownUses = currentUses;
            this.triggerBurnSequence(currentUses);
        }
        
        // Sync lastKnownUses if it was reset externally (e.g. game restart)
        if (currentUses > this.lastKnownUses) {
            this.lastKnownUses = currentUses;
        }

        this.updateDevVisuals(state);
    }

    private updateDevVisuals(state: AppState) {
        if (state.isDevMode) {
            // Determine Range
            const isDemon = state.selectedGhost?.name === 'Demon';
            const range = isDemon ? ITEMS.CRUCIFIX_RANGE_DEMON : ITEMS.CRUCIFIX_RANGE_NORMAL;
            const radius = range * WORLD_SCALE;

            if (!this.devRangeMesh) {
                this.devRangeMesh = BABYLON.MeshBuilder.CreateTorus("crucifixRange", { 
                    diameter: 1, // Will scale 
                    thickness: 0.05 
                }, this.scene);
                const mat = new BABYLON.StandardMaterial("crucifixRangeMat", this.scene);
                mat.emissiveColor = new BABYLON.Color3(0, 1, 1); // Cyan
                mat.disableLighting = true;
                mat.alpha = 0.5;
                this.devRangeMesh.material = mat;
                this.devRangeMesh.isPickable = false;
                this.devRangeMesh.checkCollisions = false;
            }

            this.devRangeMesh.setEnabled(true);
            this.devRangeMesh.scaling.setAll(radius * 2); // Torus diameter is 1, so scale by diameter

            // Position
            if (this.isPlaced) {
                this.devRangeMesh.position.copyFrom(this.mesh.getAbsolutePosition());
                // Adjust height to be slightly above floor to avoid Z-fighting
                this.devRangeMesh.position.y = 0.1;
            } else if (state.playerCoordinates) {
                // Held: Position at player feet
                this.devRangeMesh.position.set(state.playerCoordinates.x, state.playerCoordinates.y - 0.8, state.playerCoordinates.z); 
            }
        } else {
            if (this.devRangeMesh) {
                this.devRangeMesh.setEnabled(false);
            }
        }
    }

    private triggerBurnSequence(remainingUses: number) {
        this.isBurning = true;
        this.flameSystem.start();
        const pos = this.mesh.getAbsolutePosition();
        this.soundManager.playCrucifixBurn(pos);

        // Register EMF 4 Event
        this.actions.triggerEmfEvent({
            position: { x: pos.x, y: pos.y, z: pos.z },
            level: 4
        });

        if (remainingUses > 0) {
            // CASE 1: First Charge Used (Not empty yet)
            // [CONFIG] TIMING:
            // - Burn for 2s
            // - Glow Red for 10s
            // - Fade to Charred Black
            
            setTimeout(() => {
                // Stop Fire
                this.flameSystem.stop();
                
                // Set Glow
                this.materials.forEach(mat => {
                    mat.emissiveColor = this.RED_EMISSIVE;
                    mat.disableLighting = true; // Make it look like pure light source
                });

                // After 10s, fade to Charred
                setTimeout(() => {
                    let steps = 20;
                    let currentStep = 0;
                    const interval = setInterval(() => {
                        currentStep++;
                        const progress = currentStep / steps;
                        
                        // Lerp Emissive: Red -> Black
                        const r = BABYLON.Scalar.Lerp(1, 0, progress);
                        const currentEmissive = new BABYLON.Color3(r, 0, 0);
                        
                        this.materials.forEach(mat => {
                            mat.emissiveColor = currentEmissive;
                            mat.diffuseColor = this.CHARRED_COLOR; // Turn model black
                        });

                        if (currentStep >= steps) {
                            clearInterval(interval);
                            // Finalize state
                            this.materials.forEach(mat => {
                                mat.emissiveColor = this.BLACK;
                                mat.disableLighting = false; // Re-enable lighting interaction
                            });
                            this.isBurning = false;
                        }
                    }, 100); // 2 seconds fade (20 * 100ms) or "rapidly"
                }, 10000);

            }, 2000);

        } else {
            // CASE 2: Last Charge Used (Depleted)
            // - Burn for 3s
            // - Disappear
            setTimeout(() => {
                this.flameSystem.stop();
                this.mesh.setEnabled(false); // Visual disappearance
                this.isBurning = false;
            }, 3000);
        }
    }

    public dispose(): void {
        if (this.flameSystem) {
            this.flameSystem.stop();
            this.flameSystem.dispose();
        }
        if (this.flameEmitter) this.flameEmitter.dispose();
        if (this.devRangeMesh) this.devRangeMesh.dispose();
    }
}
