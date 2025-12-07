
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';

declare const BABYLON: any;

export class GhostWritingBookHandler implements IItemHandler {
    private instanceId: number | undefined;
    private isPlaced: boolean;
    private drawing1Mesh: any = null;
    private drawing2Mesh: any = null;

    constructor(props: ItemHandlerProps) {
        const { viewModelMesh, itemInstanceId, isPlaced } = props;
        this.instanceId = itemInstanceId;
        this.isPlaced = !!isPlaced;

        // Find drawing meshes
        const allMeshes = [viewModelMesh, ...viewModelMesh.getDescendants(false)];
        
        // Robustly search for the meshes based on hierarchy names provided
        // Looking for "drawing1" and "drawing2"
        this.drawing1Mesh = allMeshes.find((m: any) => m.name === 'drawing1' || m.name.endsWith('drawing1'));
        this.drawing2Mesh = allMeshes.find((m: any) => m.name === 'drawing2' || m.name.endsWith('drawing2'));

        // Initially hide drawings
        if (this.drawing1Mesh) this.drawing1Mesh.setEnabled(false);
        if (this.drawing2Mesh) this.drawing2Mesh.setEnabled(false);
    }

    public update(state: AppState): void {
        // Only placed books can be written in
        if (!this.isPlaced || this.instanceId === undefined) return;

        const item = state.placedItems.find(p => p.instanceId === this.instanceId);
        if (!item) return;

        // Check if written in
        if (item.writingData) {
            // Show correct drawing
            if (item.writingData === 'drawing1' && this.drawing1Mesh) {
                if (!this.drawing1Mesh.isEnabled()) this.drawing1Mesh.setEnabled(true);
                if (this.drawing2Mesh && this.drawing2Mesh.isEnabled()) this.drawing2Mesh.setEnabled(false);
            } else if (item.writingData === 'drawing2' && this.drawing2Mesh) {
                if (!this.drawing2Mesh.isEnabled()) this.drawing2Mesh.setEnabled(true);
                if (this.drawing1Mesh && this.drawing1Mesh.isEnabled()) this.drawing1Mesh.setEnabled(false);
            }
        } else {
            // Hide all if no data
            if (this.drawing1Mesh && this.drawing1Mesh.isEnabled()) this.drawing1Mesh.setEnabled(false);
            if (this.drawing2Mesh && this.drawing2Mesh.isEnabled()) this.drawing2Mesh.setEnabled(false);
        }
    }

    public dispose(): void {
        // Resources are managed by parent mesh disposal
    }
}
