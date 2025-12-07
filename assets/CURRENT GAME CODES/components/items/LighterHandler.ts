
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE, UV_EVIDENCE_LAYER_MASK, VIEWMODEL_LAYER_MASK } from '../../constants';
import SoundManager from '../../services/SoundManager';

declare const BABYLON: any;

export class LighterHandler implements IItemHandler {
    private light: any;
    private flameSystem: any;
    private flameEmitter: any;
    private flameCoreMesh: any; // The cone part
    private flameBaseMesh: any; // The sphere part
    private glowMesh: any;      // The glow halo
    private soundManager: SoundManager;
    private timeouts: number[] = [];
    private wasOn: boolean = false;
    private devRangeMesh: any = null;
    private scene: any;
    private isPlaced: boolean;
    private mesh: any;
    private instanceId: number | undefined;

    constructor(props: ItemHandlerProps) {
        const { scene, viewModelMesh, soundManager, isPlaced, itemInstanceId } = props;
        this.soundManager = soundManager;
        this.scene = scene;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.mesh = viewModelMesh;

        // --- 1. FLAME POSITIONING ---
        // Create a specific emitter node to position the flame exactly at the nozzle.
        this.flameEmitter = new BABYLON.TransformNode("lighterFlameEmitter", scene);
        this.flameEmitter.parent = viewModelMesh;
        
        // [CONFIG] FLAME POSITION
        // Adjusted to a neutral center-top position. 
        // X: 0 (Center)
        // Y: 0.06 (Just above the metal guard)
        // Z: 0.0 (Centered depth)
        this.flameEmitter.position = new BABYLON.Vector3(0, 0.10, 0.0); 

        // --- 2. FLAME GEOMETRY (The solid glowing part) ---
        const flameMat = new BABYLON.StandardMaterial("lighterFlameMat", scene);
        flameMat.emissiveColor = new BABYLON.Color3(1.0, 1.0, 0.5); // Brighter Yellow/White
        flameMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        flameMat.specularColor = new BABYLON.Color3(0, 0, 0);
        flameMat.disableLighting = true;
        flameMat.alpha = 0.3; 
        flameMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;

        // 2a. Flame Core (Cone)
        this.flameCoreMesh = BABYLON.MeshBuilder.CreateCylinder("lighterFlameCone", { 
            height: 0.06,
            diameterTop: 0, 
            diameterBottom: 0.025,
            tessellation: 16 
        }, scene);
        
        this.flameCoreMesh.parent = this.flameEmitter;
        this.flameCoreMesh.position = new BABYLON.Vector3(0, 0.03, 0); 
        this.flameCoreMesh.material = flameMat;
        this.flameCoreMesh.setEnabled(false);
        this.flameCoreMesh.isPickable = false;
        this.flameCoreMesh.checkCollisions = false;
        this.flameCoreMesh.layerMask = VIEWMODEL_LAYER_MASK;

        // 2b. Flame Base (Sphere)
        this.flameBaseMesh = BABYLON.MeshBuilder.CreateSphere("lighterFlameBase", {
            diameter: 0.025,
            segments: 16
        }, scene);

        this.flameBaseMesh.parent = this.flameEmitter;
        this.flameBaseMesh.position = new BABYLON.Vector3(0, 0, 0); 
        this.flameBaseMesh.material = flameMat;
        this.flameBaseMesh.setEnabled(false);
        this.flameBaseMesh.isPickable = false;
        this.flameBaseMesh.checkCollisions = false;
        this.flameBaseMesh.layerMask = VIEWMODEL_LAYER_MASK;

        // 2c. Glow Halo
        this.glowMesh = BABYLON.MeshBuilder.CreatePlane("lighterGlow", { size: 0.12 }, scene);
        this.glowMesh.parent = this.flameEmitter;
        this.glowMesh.position = new BABYLON.Vector3(0, -0.01, 0); // Slightly adjusted
        this.glowMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        const glowMat = new BABYLON.StandardMaterial("lighterGlowMat", scene);
        glowMat.diffuseTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        glowMat.opacityTexture = glowMat.diffuseTexture;
        glowMat.emissiveColor = new BABYLON.Color3(1.0, 0.9, 0.5); 
        glowMat.disableLighting = true;
        glowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        glowMat.alpha = 0.4;
        
        this.glowMesh.material = glowMat;
        this.glowMesh.setEnabled(false);
        this.glowMesh.isPickable = false;
        this.glowMesh.checkCollisions = false;
        this.glowMesh.layerMask = VIEWMODEL_LAYER_MASK;

        // --- 3. LIGHT SOURCE ---
        this.light = new BABYLON.PointLight("lighterLight", BABYLON.Vector3.Zero(), scene);
        this.light.intensity = 0.3; 
        this.light.range = 1.0 * WORLD_SCALE;
        this.light.diffuse = new BABYLON.Color3(1.0, 0.9, 0.6); 
        this.light.specular = new BABYLON.Color3(0, 0, 0); 
        this.light.parent = this.flameEmitter; 
        this.light.position = BABYLON.Vector3.Zero();
        this.light.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;
        this.light.shadowEnabled = false; 
        this.light.setEnabled(false);

        // --- 4. PARTICLE SYSTEM ---
        this.flameSystem = new BABYLON.ParticleSystem("lighterSmoke", 100, scene);
        this.flameSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
        
        // [FIX] Use the TransformNode as emitter directly to ensure rock-solid positioning
        this.flameSystem.emitter = this.flameEmitter; 
        
        // [FIX] Assign VIEWMODEL_LAYER_MASK to particles so they render in the same pass as the gun
        this.flameSystem.layerMask = VIEWMODEL_LAYER_MASK;
        
        this.flameSystem.color1 = new BABYLON.Color4(1.0, 1.0, 0.0, 0.4); 
        this.flameSystem.color2 = new BABYLON.Color4(1.0, 0.8, 0.2, 0.1); 
        this.flameSystem.colorDead = new BABYLON.Color4(0.5, 0.5, 0.5, 0.0); 
        
        this.flameSystem.minSize = 0.02;
        this.flameSystem.maxSize = 0.06;
        this.flameSystem.minLifeTime = 0.1;
        this.flameSystem.maxLifeTime = 0.3;
        this.flameSystem.emitRate = 60;
        this.flameSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        // Use Sphere emitter with very small radius to keep it tight to the node
        this.flameSystem.createSphereEmitter(0.01);
        this.flameSystem.minEmitPower = 0;
        this.flameSystem.maxEmitPower = 0.05; 
        
        this.flameSystem.updateSpeed = 0.01;
        this.flameSystem.gravity = new BABYLON.Vector3(0, 0.3, 0); 
        
        this.flameSystem.stop();
    }

    public update(state: AppState): void {
        let isOn = false;
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        } else {
            isOn = state.isLighterOn;
        }

        if (isOn && !this.wasOn) {
            this.wasOn = true;
            this.ignite(state);
        } else if (!isOn && this.wasOn) {
            this.wasOn = false;
            this.extinguish();
        }

        // --- 5. FLICKER ANIMATION ---
        if (this.wasOn && this.flameCoreMesh && this.flameCoreMesh.material) {
            const flicker = 0.9 + Math.random() * 0.1;
            this.flameCoreMesh.material.emissiveColor.set(flicker, flicker * 0.9, flicker * 0.4);

            const scale = 0.9 + Math.random() * 0.2; 
            const scaleY = scale * (0.95 + Math.random() * 0.2); 
            
            this.flameCoreMesh.scaling.set(scale, scaleY, scale);
            this.flameBaseMesh.scaling.setAll(scale);

            if (this.glowMesh) {
                const glowScale = 1.0 + (Math.random() * 0.2 - 0.1);
                this.glowMesh.scaling.setAll(glowScale);
                if (this.glowMesh.material) {
                    this.glowMesh.material.alpha = 0.3 + Math.random() * 0.2;
                }
            }
        }

        this.updateDevVisuals(state);
    }

    private updateDevVisuals(state: AppState) {
        if (state.isDevMode) {
            const range = 4; 
            const radius = range * WORLD_SCALE;

            if (!this.devRangeMesh) {
                this.devRangeMesh = BABYLON.MeshBuilder.CreateTorus("lighterRange", { 
                    diameter: 1, 
                    thickness: 0.05 
                }, this.scene);
                const mat = new BABYLON.StandardMaterial("lighterRangeMat", this.scene);
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

    private ignite(state: AppState) {
        this.timeouts.forEach(id => clearTimeout(id));
        this.timeouts = [];
        this.soundManager?.stopLighterFlick();
        this.soundManager?.playLighterFlick();
        this.light.setEnabled(true);
        this.flameCoreMesh.setEnabled(true);
        this.flameBaseMesh.setEnabled(true);
        if (this.glowMesh) this.glowMesh.setEnabled(true);
        this.flameSystem.start();
    }

    private extinguish() {
        this.timeouts.forEach(id => clearTimeout(id));
        this.timeouts = [];
        this.light.setEnabled(false);
        this.flameCoreMesh.setEnabled(false);
        this.flameBaseMesh.setEnabled(false);
        if (this.glowMesh) this.glowMesh.setEnabled(false);
        this.flameSystem.stop();
    }

    public dispose(): void {
        this.extinguish();
        if (this.light) this.light.dispose();
        if (this.flameSystem) this.flameSystem.dispose();
        if (this.flameCoreMesh) this.flameCoreMesh.dispose();
        if (this.flameBaseMesh) this.flameBaseMesh.dispose();
        if (this.glowMesh) this.glowMesh.dispose();
        if (this.flameEmitter) this.flameEmitter.dispose();
        if (this.devRangeMesh) this.devRangeMesh.dispose();
    }
}
