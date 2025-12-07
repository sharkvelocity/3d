
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { PowerIndicator } from './PowerIndicator';

export class PhotoCameraHandler implements IItemHandler {
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
        // [CONFIG] LOGIC: If uses > 0, it's considered "On/Ready".
        let hasUses = false;

        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            hasUses = item ? (item.currentUses ?? 0) > 0 : false;
        } else if (state.equippedItem) {
            hasUses = (state.equippedItem.currentUses ?? 0) > 0;
        }

        this.powerIndicator.update(hasUses);
    }

    public dispose(): void {
        this.powerIndicator.dispose();
    }
}
