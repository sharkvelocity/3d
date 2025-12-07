
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { PowerIndicator } from './PowerIndicator';

export class ThermometerHandler implements IItemHandler {
    private powerIndicator: PowerIndicator;
    private isPlaced: boolean;
    private instanceId: number | undefined;

    constructor(props: ItemHandlerProps) {
        const { viewModelMesh, scene, isPlaced, itemInstanceId } = props;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);
    }

    public update(state: AppState): void {
        let isOn = true; // [CONFIG] Handheld thermometer is always considered ON for logic purposes
        
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        }

        this.powerIndicator.update(isOn);
    }

    public dispose(): void {
        this.powerIndicator.dispose();
    }
}
