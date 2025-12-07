
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE, UV_EVIDENCE_LAYER_MASK } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class LanternHandler implements IItemHandler {
    private light: any;
    private flameSystem: any;
    private flameEmitter: any;
    private mesh: any;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private devRangeMesh: any = null;
    private scene: any;
    private powerIndicator: PowerIndicator;

    constructor(props: ItemHandlerProps) {
        const { viewModelMesh, playerCamera, isPlaced, itemInstanceId, scene } = props;
        this.scene = scene;
        this.mesh = viewModelMesh;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        // [CONFIG] LIGHT SETTINGS
        this.light = new BABYLON.PointLight(
            isPlaced ? `lanternLight_placed_${itemInstanceId}` : "lanternLight_held",
            new BABYLON.Vector3(0, 0.2 * WORLD_SCALE, 0),
            scene
        );
        this.light.intensity = 1.2;
        this.light.range = 10 * WORLD_SCALE;
        this.light.diffuse = new BABYLON.Color3(1.0, 0.8, 0.4); // Warm Orange/Yellow
        
        if (isPlaced) {
            this.light.parent = this.mesh;
        } else {
            this.light.parent = playerCamera;
            this.light.position = new BABYLON.Vector3(0, 0, 0);
            this.light.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;
        }
        
        this.light.setEnabled(false);

        // [CONFIG] PARTICLE SYSTEM
        this.flameEmitter = new BABYLON.TransformNode(
            isPlaced ? `lanternEmitter_placed_${itemInstanceId}` : "lanternEmitter_held", 
            scene
        );
        this.flameEmitter.parent = this.mesh;
        this.flameEmitter.position = new BABYLON.Vector3(0, 0.25, 0);

        this.flameSystem = new BABYLON.ParticleSystem(
            isPlaced ? `lanternFlame_placed_${itemInstanceId}` : "lanternFlame_held", 
            500, 
            scene
        );
        this.flameSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        this.flameSystem.emitter = this.flameEmitter;

        // Particle Colors
        this.flameSystem.color1 = new BABYLON.Color4(1.0, 0.6, 0.2, 0.8);
        this.flameSystem.color2 = new BABYLON.Color4(1.0, 0.8, 0.4, 0.9);
        this.flameSystem.colorDead = new BABYLON.Color4(0.8, 0.2, 0.0, 0.0);
        
        // Particle Physics
        this.flameSystem.minSize = 0.05 * WORLD_SCALE;
        this.flameSystem.maxSize = 0.1 * WORLD_SCALE;
        this.flameSystem.minLifeTime = 0.2;
        this.flameSystem.maxLifeTime = 0.5;
        this.flameSystem.emitRate = 200;
        this.flameSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        this.flameSystem.createConeEmitter(0.02 * WORLD_SCALE, Math.PI / 6);
        this.flameSystem.minEmitPower = 0.3;
        this.flameSystem.maxEmitPower = 0.6;
        this.flameSystem.updateSpeed = 0.007;
        this.flameSystem.gravity = new BABYLON.Vector3(0, 0.8, 0);
        
        this.flameSystem.stop();
    }

    public update(state: AppState): void {
        let isOn = false;

        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        } else {
            isOn = true; 
        }

        if (isOn) {
            if (!this.light.isEnabled()) {
                this.light.setEnabled(true);
                this.flameSystem.start();
            }
        } else {
            if (this.light.isEnabled()) {
                this.light.setEnabled(false);
                this.flameSystem.stop();
            }
        }
        
        this.powerIndicator.update(isOn);
        this.updateDevVisuals(state);
    }

    private updateDevVisuals(state: AppState) {
        if (state.isDevMode) {
            // [CONFIG] DEV RANGE: Shows the effective radius for sanity protection
            const range = 4; 
            const radius = range * WORLD_SCALE;

            if (!this.devRangeMesh) {
                this.devRangeMesh = BABYLON.MeshBuilder.CreateTorus("lanternRange", { 
                    diameter: 1, 
                    thickness: 0.05 
                }, this.scene);
                const mat = new BABYLON.StandardMaterial("lanternRangeMat", this.scene);
                mat.emissiveColor = new BABYLON.Color3(1, 0.5, 0);
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
        if (this.light) this.light.dispose();
        if (this.flameSystem) this.flameSystem.dispose();
        if (this.flameEmitter) this.flameEmitter.dispose();
        if (this.devRangeMesh) this.devRangeMesh.dispose();
        this.powerIndicator.dispose();
    }
}
