
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import SoundManager from '../../services/SoundManager';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class EMFReaderHandler implements IItemHandler {
    private lights: any[] = [];
    private soundManager: SoundManager;
    private scene: any;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private powerIndicator: PowerIndicator;

    // [CONFIG] LED COLORS for EMF Levels 1-5
    private lightGlowColors = [
        new BABYLON.Color3(0.1, 1, 0.1),  // 1: Green
        new BABYLON.Color3(0.1, 1, 0.1),  // 2: Green
        new BABYLON.Color3(1, 1, 0.1),    // 3: Yellow
        new BABYLON.Color3(1, 0.5, 0.1),  // 4: Orange
        new BABYLON.Color3(1, 0.1, 0.1)   // 5: Red
    ];
    
    // [CONFIG] ON/OFF COLORS for the first LED (power state)
    private lightOnColor = new BABYLON.Color3(0, 0.2, 0);
    private offColor = new BABYLON.Color3(0, 0, 0);

    constructor(props: ItemHandlerProps) {
        this.scene = props.scene;
        this.soundManager = props.soundManager;
        this.isPlaced = !!props.isPlaced;
        this.instanceId = props.itemInstanceId;
        const rootMesh = props.viewModelMesh;
        this.powerIndicator = new PowerIndicator(rootMesh, this.scene);

        if (rootMesh) {
            const uniqueId = rootMesh.uniqueId;

            // [CONFIG] MESH SEARCH: Looking for meshes named '1', '2', '3', '4', '5' in the model
            for (let i = 1; i <= 5; i++) {
                const lightMesh = rootMesh.getDescendants(false).find((m: any) => m.name === String(i));
                if (lightMesh) {
                    if (!lightMesh.material || !lightMesh.material.name.startsWith('emfLightMat')) {
                        lightMesh.material = new BABYLON.StandardMaterial(`emfLightMat_${uniqueId}_${i}`, this.scene);
                    }
                    lightMesh.material.emissiveColor = this.offColor;
                    this.lights.push(lightMesh);
                } else {
                    this.lights.push(null);
                }
            }
        }
    }

    public update(state: AppState): void {
        let isOn = false;
        let emfLevel = state.emfLevel;

        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
            if (!isOn) emfLevel = 0;
        } else {
            isOn = state.isEmfReaderOn;
        }

        this.powerIndicator.update(isOn);

        if (!isOn) {
            this.lights.forEach(mesh => {
                if (mesh?.material) mesh.material.emissiveColor = this.offColor;
            });
            if (!this.isPlaced) this.soundManager.stopEmfBeep();
            return;
        }

        // Baseline ON state (Light 1 dim)
        if (this.lights[0]?.material) this.lights[0].material.emissiveColor = this.lightOnColor;
        for (let i = 1; i < this.lights.length; i++) {
            if (this.lights[i]?.material) this.lights[i].material.emissiveColor = this.offColor;
        }

        // Active Levels
        for (let i = 0; i < emfLevel; i++) {
            if (this.lights[i]?.material) {
                this.lights[i].material.emissiveColor = this.lightGlowColors[i];
            }
        }

        if (!this.isPlaced) {
            if (emfLevel > 0) {
                this.soundManager.playEmfBeep(emfLevel);
            } else {
                this.soundManager.stopEmfBeep();
            }
        }
    }

    public dispose(): void {
        if (!this.isPlaced) {
            this.soundManager.stopEmfBeep();
        }
        this.powerIndicator.dispose();
    }
}
