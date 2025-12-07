
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class UVLightHandler implements IItemHandler {
    private light: any;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private powerIndicator: PowerIndicator;

    constructor(props: ItemHandlerProps) {
        const { scene, playerCamera, isPlaced, itemInstanceId, viewModelMesh } = props;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        this.light = new BABYLON.SpotLight(
            "uvLight",
            BABYLON.Vector3.Zero(),
            new BABYLON.Vector3(0, 0, 1),
            // [CONFIG] ANGLE: The width of the UV beam (Math.PI / 3 = 60 degrees)
            Math.PI / 3,
            10,
            scene
        );
        
        // [CONFIG] INTENSITY: Brightness of the UV light.
        this.light.intensity = 1.5;
        
        // [CONFIG] RANGE: How far the UV light reveals footprints/fingerprints.
        this.light.range = 8 * WORLD_SCALE;
        
        // [CONFIG] COLOR: The distinctive purple/blue tint.
        this.light.diffuse = new BABYLON.Color3(0.4, 0.4, 1.0); 
        this.light.specular = new BABYLON.Color3(0, 0, 0);
        
        if (this.isPlaced) {
            this.light.parent = viewModelMesh;
        } else {
            this.light.parent = playerCamera;
        }
        
        this.light.setEnabled(false);
    }

    public update(state: AppState): void {
        let isOn = false;
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        } else {
            isOn = state.isUvLightOn;
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
