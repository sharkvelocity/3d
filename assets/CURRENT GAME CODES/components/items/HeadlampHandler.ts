
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE, UV_EVIDENCE_LAYER_MASK } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class HeadlampHandler implements IItemHandler {
    private light: any;
    private scene: any;
    private powerIndicator: PowerIndicator | null = null;

    constructor(props: ItemHandlerProps) {
        const { scene, playerCamera, viewModelMesh } = props;
        this.scene = scene;
        
        // Only attach indicator if we have a model (Placed instance).
        // The slotless/held headlamp doesn't have a view model.
        if (viewModelMesh) {
            this.powerIndicator = new PowerIndicator(viewModelMesh, scene);
        }

        this.light = new BABYLON.SpotLight(
            "headlamp",
            BABYLON.Vector3.Zero(),
            new BABYLON.Vector3(0, 0, 1),
            // [CONFIG] ANGLE: Very wide outer cone (approx 75 degrees) for flood effect
            Math.PI / 2.4,
            20,
            scene
        );

        // [FIX] FALLOFF: Use Physical (GLTF) falloff if available, otherwise standard
        // Constant 2 is FALLOFF_GLTF
        this.light.falloffType = (BABYLON.Light && BABYLON.Light.FALLOFF_GLTF) !== undefined ? BABYLON.Light.FALLOFF_GLTF : 2;

        // [CONFIG] INTENSITY: High intensity for physical falloff (Candela)
        // Slightly dimmer than flashlight but wider spread
        this.light.intensity = 1200.0;
        
        // [CONFIG] RANGE: Shorter effective range than flashlight
        this.light.range = 15 * WORLD_SCALE;
        
        // [CONFIG] INNER ANGLE: Wide hotspot (45 degrees) for good visibility
        this.light.innerAngle = Math.PI / 4; 
        
        this.light.parent = playerCamera;
        this.light.excludeWithLayerMask = UV_EVIDENCE_LAYER_MASK;
        this.light.shadowEnabled = false;
        this.light.setEnabled(false); 
    }

    public update(state: AppState): void {
        // Determine status
        // A placed headlamp acts like a flashlight.
        // A held (slotless) headlamp acts based on isHeadlampOn + inventory check.
        
        let isOn = false;
        if (this.powerIndicator) { // Implies placed instance
             // Currently no specific logic for placed headlamps in GameLoop state, 
             // assuming if placed it defaults to Off unless toggled?
             // Since it's rare to place a headlamp, we'll assume it's ON if equipped logic matches or fallback to OFF.
             // Actually, ItemManager doesn't track specific ON/OFF state for headlamp in placedItems usually.
             // But for consistent visual feedback if it *is* placed:
             // Let's assume OFF if placed.
             isOn = false; 
        } else {
            const hasHeadlamp = !!state.carriedInventory[4];
            isOn = state.isHeadlampOn && hasHeadlamp;
        }

        if (this.light) {
            this.light.setEnabled(isOn);
        }
        
        if (this.powerIndicator) {
            this.powerIndicator.update(isOn);
        }
    }

    public dispose(): void {
        if (this.light) {
            this.light.dispose();
        }
        if (this.powerIndicator) {
            this.powerIndicator.dispose();
        }
    }
}
