
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState, AppActions, ItemId } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE } from '../../constants';
import SoundManager from '../../services/SoundManager';

declare const BABYLON: any;

export class SmudgeSticksHandler implements IItemHandler {
    private smokeSystem: any;
    private smokeEmitter: any;
    private soundManager: SoundManager;
    private actions: AppActions;
    private cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
    private isBurning: boolean = false;
    private devRangeMesh: any = null;
    private scene: any;
    private isPlaced: boolean;
    private mesh: any;

    constructor(props: ItemHandlerProps) {
        const { scene, viewModelMesh, soundManager, actions, isPlaced } = props;
        this.scene = scene;
        this.soundManager = soundManager;
        this.actions = actions;
        this.isPlaced = !!isPlaced;
        this.mesh = viewModelMesh;

        // Create specific emitter node attached to the mesh
        this.smokeEmitter = new BABYLON.TransformNode("smudgeSmokeEmitter", scene);
        this.smokeEmitter.parent = viewModelMesh;
        
        // Dynamically calculate the tip of the model to avoid "guess work" with hardcoded coordinates.
        // We scan the child meshes to find the highest Y point in the model's local space.
        let maxY = 0;
        const children = viewModelMesh.getChildMeshes(false);
        
        if (children && children.length > 0) {
            children.forEach((m: any) => {
                // Ensure we are looking at geometry with bounds
                if (m.getBoundingInfo) {
                    const boundingInfo = m.getBoundingInfo();
                    // Check maximum Y of the local bounding box
                    if (boundingInfo.maximum.y > maxY) {
                        maxY = boundingInfo.maximum.y;
                    }
                }
            });
        }
        
        // Fallback to a reasonable default if bounds calculation fails (e.g. model is flat or empty)
        if (maxY <= 0.05) maxY = 0.2;

        // [CONFIG] EMITTER OFFSET: Slightly lower than tip to ensure visibility
        this.smokeEmitter.position = new BABYLON.Vector3(0, Math.max(0, maxY - 0.4), 0);

        this.smokeSystem = new BABYLON.ParticleSystem("smudgeSmoke", 500, scene);
        this.smokeSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.smokeSystem.emitter = this.smokeEmitter;
        
        // [CONFIG] COLOR: Visible grey smoke
        this.smokeSystem.color1 = new BABYLON.Color4(0.5, 0.5, 0.5, 0.5);
        this.smokeSystem.color2 = new BABYLON.Color4(0.7, 0.7, 0.7, 0.0);
        this.smokeSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        
        // [CONFIG] PHYSICS: Slow, drifting smoke
        this.smokeSystem.minSize = 0.1;
        this.smokeSystem.maxSize = 0.3;
        this.smokeSystem.minLifeTime = 1.5;
        this.smokeSystem.maxLifeTime = 3.0;
        this.smokeSystem.emitRate = 50; 
        this.smokeSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // [CONFIG] GRAVITY: Gentle updraft (Positive Y)
        this.smokeSystem.gravity = new BABYLON.Vector3(0, 0.5, 0);
        
        // Zero power ensures it spawns AT the tip and floats up, rather than shooting out
        this.smokeSystem.createSphereEmitter(0.05);
        this.smokeSystem.minEmitPower = 0;
        this.smokeSystem.maxEmitPower = 0; 
        this.smokeSystem.updateSpeed = 0.01;
    }

    public update(state: AppState): void {
        // Validation Checks for Smoking:
        // 1. Is this handler's item currently equipped?
        // 2. Is it a Smudge Stick?
        // 3. Is it actually "used" (currentUses === 0)?
        
        const isEquipped = state.equippedItem && state.equippedItem.id === ItemId.SmudgeSticks;
        const isUsed = state.equippedItem?.currentUses === 0;

        // If used and equipped, ignite if not already burning.
        if (isEquipped && isUsed) {
            if (!this.isBurning && !this.smokeSystem.isStarted()) {
                this.isBurning = true;
                this.smokeSystem.start();
                this.soundManager.playSmudgeBurnSound();

                // [CONFIG] BURN DURATION: 6 Seconds
                if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
                this.cleanupTimeout = setTimeout(() => {
                    if (this.smokeSystem) this.smokeSystem.stop();
                    this.soundManager.stopSmudgeBurnSound();
                    this.actions.removeUsedSmudgeStick();
                    this.isBurning = false;
                }, 6000);
            }
        }

        this.updateDevVisuals(state);
    }

    private updateDevVisuals(state: AppState) {
        if (state.isDevMode) {
            // [CONFIG] RANGE: Effective radius of smudge smoke (6 Meters)
            const range = 6; 
            const radius = range * WORLD_SCALE;

            if (!this.devRangeMesh) {
                this.devRangeMesh = BABYLON.MeshBuilder.CreateTorus("smudgeRange", { 
                    diameter: 1, // Will scale 
                    thickness: 0.05 
                }, this.scene);
                const mat = new BABYLON.StandardMaterial("smudgeRangeMat", this.scene);
                mat.emissiveColor = BABYLON.Color3.White();
                mat.disableLighting = true;
                mat.alpha = 0.5;
                this.devRangeMesh.material = mat;
                this.devRangeMesh.isPickable = false;
                this.devRangeMesh.checkCollisions = false;
            }

            this.devRangeMesh.setEnabled(true);
            this.devRangeMesh.scaling.setAll(radius * 2); 

            if (this.isPlaced) {
                this.devRangeMesh.position.copyFrom(this.mesh.getAbsolutePosition());
                this.devRangeMesh.position.y = 0.1;
            } else if (state.playerCoordinates) {
                this.devRangeMesh.position.set(state.playerCoordinates.x, state.playerCoordinates.y - 0.8, state.playerCoordinates.z); 
            }
        } else {
            if (this.devRangeMesh) {
                this.devRangeMesh.setEnabled(false);
            }
        }
    }

    public dispose(): void {
        if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
        
        // If we are switching away while it's burning, remove it immediately.
        if (this.isBurning) {
            this.actions.removeUsedSmudgeStick();
        }

        if (this.smokeSystem) {
            this.smokeSystem.stop();
            this.smokeSystem.dispose();
        }
        if (this.smokeEmitter) {
            this.smokeEmitter.dispose();
        }
        if (this.devRangeMesh) this.devRangeMesh.dispose();
        this.soundManager.stopSmudgeBurnSound();
    }
}
