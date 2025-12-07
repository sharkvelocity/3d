
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE, TEXTURE_ROOT, UV_EVIDENCE_LAYER_MASK } from '../../constants';

declare const BABYLON: any;

export class SaltHandler implements IItemHandler {
    private instanceId: number;
    private ghostMeshRef: React.MutableRefObject<any>;
    private uvEvidenceMeshesRef: React.MutableRefObject<any[]>;
    private scene: any;
    private actions: any;
    private position: any;

    constructor(props: ItemHandlerProps) {
        const { itemInstanceId, ghostMeshRef, uvEvidenceMeshesRef, scene, actions, viewModelMesh } = props;
        this.instanceId = itemInstanceId!;
        this.ghostMeshRef = ghostMeshRef!;
        this.uvEvidenceMeshesRef = uvEvidenceMeshesRef!;
        this.scene = scene;
        this.actions = actions;
        this.position = viewModelMesh.position.clone();
    }

    public update(state: AppState): void {
        const item = state.placedItems.find(p => p.instanceId === this.instanceId);
        if (!item || !item.isPile || item.isDisturbed) return;

        const ghost = this.ghostMeshRef.current;
        if (!ghost) return;

        // Wraiths don't disturb salt
        if (state.selectedGhost?.name === 'Wraith') return;

        // [CONFIG] RADIUS: Distance ghost must be within to trigger salt (0.5m)
        const SALT_PILE_RADIUS = 0.5 * WORLD_SCALE;
        const ghostPos = ghost.position;
        
        const dist = Math.sqrt(Math.pow(ghostPos.x - this.position.x, 2) + Math.pow(ghostPos.z - this.position.z, 2));

        if (dist < SALT_PILE_RADIUS) {
            this.actions.updatePlacedItem({ ...item, isDisturbed: true });
            this.actions.triggerEmfEvent({ position: item.position, level: 2 });
            this.spawnFootprints(ghost);
        }
    }

    private spawnFootprints(ghost: any) {
        if (!this.uvEvidenceMeshesRef) return;

        const spawn = (isLeft: boolean) => {
            // [CONFIG] SIZE: Footprint decal size
            const decal = BABYLON.MeshBuilder.CreatePlane("uv_footprint", { size: 0.25 }, this.scene);
            
            const forward = ghost.forward.clone().normalize();
            const right = ghost.right.clone().normalize();
            
            // [CONFIG] OFFSET: Lateral offset for left/right foot
            const offsetSide = isLeft ? -0.15 : 0.15;
            const spawnPos = this.position.add(forward.scale(0.5)).add(right.scale(offsetSide));
            spawnPos.y += 0.01;

            decal.position = spawnPos;
            decal.rotation.x = Math.PI / 2;
            decal.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;

            const material = new BABYLON.StandardMaterial("uv_footprint_mat", this.scene);
            const textureName = isLeft ? "uv_footprint_left.png" : "uv_footprint_right.png";
            material.diffuseTexture = new BABYLON.Texture(`${TEXTURE_ROOT}${textureName}`, this.scene, { loaderOptions: { crossOrigin: "anonymous" } });
            material.diffuseTexture.hasAlpha = true;
            material.useAlphaFromDiffuseTexture = true;
            
            material.disableLighting = false; 
            material.emissiveColor = BABYLON.Color3.Black(); 
            material.diffuseColor = BABYLON.Color3.Black();
            
            decal.layerMask = UV_EVIDENCE_LAYER_MASK;
            decal.material = material;

            this.uvEvidenceMeshesRef.current.push({ mesh: decal, timestamp: performance.now() });
        };

        spawn(true);
        spawn(false);
    }

    public dispose(): void {
    }
}
