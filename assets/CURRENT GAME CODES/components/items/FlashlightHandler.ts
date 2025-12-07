
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE, UV_EVIDENCE_LAYER_MASK } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class FlashlightHandler implements IItemHandler {
    private light: any;
    private scene: any;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private powerIndicator: PowerIndicator;

    constructor(props: ItemHandlerProps) {
        const { scene, playerCamera, isPlaced, itemInstanceId, viewModelMesh } = props;
        this.scene = scene;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        this.light = new BABYLON.SpotLight(
            "flashlight",
            BABYLON.Vector3.Zero(),
            new BABYLON.Vector3(0, 0, 1),
            // [CONFIG] ANGLE: Wider outer cone (60 degrees) for soft edge
            Math.PI / 3,
            15,
            scene
        );
        
        // [FIX] FALLOFF: Use Physical (GLTF) falloff if available
        this.light.falloffType = (BABYLON.Light && BABYLON.Light.FALLOFF_GLTF) !== undefined ? BABYLON.Light.FALLOFF_GLTF : 2;

        // [CONFIG] INTENSITY: Much higher required for Physical falloff (Candela)
        this.light.intensity = 1000.0;
        
        // [CONFIG] RANGE: Reduced slightly as physical falloff handles the fade naturally.
        // Improves performance by limiting effective calculation distance.
        this.light.range = 10 * WORLD_SCALE;
        
        // [CONFIG] INNER ANGLE: Narrower hotspot (30 degrees)
        // The gap between Inner (30) and Outer (60) creates the soft fade/penumbra.
        this.light.innerAngle = Math.PI / 6; 
        
        if (this.isPlaced) {
            this.light.parent = viewModelMesh;
        } else {
            this.light.parent = playerCamera;
        }

        this.light.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;
        this.light.shadowEnabled = false;
        this.light.setEnabled(false); 
    }

    public update(state: AppState): void {
        let isOn = false;
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        } else {
            isOn = state.isFlashlightOn;
        }
        
        if (this.light) {
            this.light.setEnabled(isOn);
        }
        this.powerIndicator.update(isOn);
    }

    public dispose(): void {
        if (this.light) {
            this.light.dispose();
        }
        this.powerIndicator.dispose();
    }
}
