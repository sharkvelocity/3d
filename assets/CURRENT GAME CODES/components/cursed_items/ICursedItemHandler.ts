
import { AppState, AppActions } from '../../types';

export interface ICursedItemHandler {
    /**
     * Called every frame/tick to update the item's logic.
     */
    update(state: AppState): void;

    /**
     * Called when the player activates the cursed item.
     */
    activate(): void;

    /**
     * Cleanup resources.
     */
    dispose(): void;
}
