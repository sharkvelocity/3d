
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE } from '../../constants';
import SoundManager from '../../services/SoundManager';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class MotionSensorHandler implements IItemHandler {
    private instanceId: number;
    private rootMesh: any;
    
    // Meshes
    private coneN: any;
    private coneS: any;
    private coneE: any;
    private coneW: any;
    
    private ghostMeshRef: React.MutableRefObject<any>;
    private soundManager: SoundManager;
    private lastBeep: number = 0;
    private powerIndicator: PowerIndicator;
    
    // [CONFIG] COLORS: Active = Red, Idle = Black
    private activeColor = new BABYLON.Color3(1, 0, 0); 
    private idleColor = new BABYLON.Color3(0, 0, 0);   
    
    private animationGroup: any = null;

    constructor(props: ItemHandlerProps) {
        const { viewModelMesh, scene, itemInstanceId, ghostMeshRef, soundManager } = props;
        this.instanceId = itemInstanceId!;
        this.ghostMeshRef = ghostMeshRef!;
        this.soundManager = soundManager;
        this.rootMesh = viewModelMesh;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        // Extract Components (Case-Insensitive & Clone Safe)
        const allMeshes = viewModelMesh.getDescendants(false);
        allMeshes.push(viewModelMesh); 

        // Find Directional Cones by suffix
        this.coneN = allMeshes.find((m: any) => m.name.endsWith('Cone.N'));
        this.coneS = allMeshes.find((m: any) => m.name.endsWith('Cone.S'));
        this.coneE = allMeshes.find((m: any) => m.name.endsWith('Cone.E'));
        this.coneW = allMeshes.find((m: any) => m.name.endsWith('Cone.W'));

        // Helper to setup material
        const setupMaterial = (mesh: any, name: string) => {
            if (mesh) {
                const newMat = new BABYLON.StandardMaterial(`${name}_Mat_${this.instanceId}`, scene);
                newMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                newMat.emissiveColor = this.idleColor;
                newMat.disableLighting = true; 
                mesh.material = newMat;
            }
        };

        setupMaterial(this.coneN, 'coneN');
        setupMaterial(this.coneS, 'coneS');
        setupMaterial(this.coneE, 'coneE');
        setupMaterial(this.coneW, 'coneW');

        // Find Animation Group associated with this mesh hierarchy
        if (scene.animationGroups) {
            this.animationGroup = scene.animationGroups.find((ag: any) => ag.name.endsWith(`_clone_${this.instanceId}`));
            if (!this.animationGroup) {
                this.animationGroup = scene.animationGroups.find((ag: any) => {
                    return ag.targetedAnimations.some((ta: any) => allMeshes.includes(ta.target));
                });
            }
        }
    }

    public update(state: AppState): void {
        const item = state.placedItems.find(p => p.instanceId === this.instanceId);
        if (!item) return;

        this.powerIndicator.update(!!item.isOn);

        if (item.isOn) {
            if (this.animationGroup && !this.animationGroup.isPlaying) {
                this.animationGroup.start(true);
            }

            // Detection Logic
            let detected = false;

            if (this.ghostMeshRef && this.ghostMeshRef.current && this.rootMesh) {
                const ghostPos = this.ghostMeshRef.current.position;
                
                this.rootMesh.computeWorldMatrix(true);
                const invWorldMatrix = this.rootMesh.getWorldMatrix().clone().invert();
                const localGhostPos = BABYLON.Vector3.TransformCoordinates(ghostPos, invWorldMatrix);

                const dist = BABYLON.Vector3.Distance(this.rootMesh.getAbsolutePosition(), ghostPos);
                
                // [CONFIG] RANGE: Detection radius (2.5 meters)
                const RANGE = 2.5 * WORLD_SCALE;

                if (dist < RANGE) {
                    // [CONFIG] THRESHOLD: Sensitivity for directional zones
                    const threshold = 0.2; 

                    const isNorth = localGhostPos.z > threshold;
                    const isSouth = localGhostPos.z < -threshold;
                    const isEast = localGhostPos.x > threshold;
                    const isWest = localGhostPos.x < -threshold;

                    if (this.coneN?.material) this.coneN.material.emissiveColor = isNorth ? this.activeColor : this.idleColor;
                    if (this.coneS?.material) this.coneS.material.emissiveColor = isSouth ? this.activeColor : this.idleColor;
                    if (this.coneE?.material) this.coneE.material.emissiveColor = isEast ? this.activeColor : this.idleColor;
                    if (this.coneW?.material) this.coneW.material.emissiveColor = isWest ? this.activeColor : this.idleColor;

                    if (isNorth || isSouth || isEast || isWest) {
                        detected = true;
                    }
                } else {
                    this.resetCones();
                }
            }

            if (detected) {
                const now = performance.now();
                // [CONFIG] BEEP DELAY: 1 Second between beeps
                if (now - this.lastBeep > 1000) {
                    this.soundManager.playMotionSensorBeep(this.rootMesh.getAbsolutePosition());
                    this.lastBeep = now;
                }
            }

        } else {
            if (this.animationGroup && this.animationGroup.isPlaying) {
                this.animationGroup.stop();
            }
            this.resetCones();
        }
    }

    private resetCones() {
        if (this.coneN?.material) this.coneN.material.emissiveColor = this.idleColor;
        if (this.coneS?.material) this.coneS.material.emissiveColor = this.idleColor;
        if (this.coneE?.material) this.coneE.material.emissiveColor = this.idleColor;
        if (this.coneW?.material) this.coneW.material.emissiveColor = this.idleColor;
    }

    public dispose(): void {
        if (this.animationGroup) {
            this.animationGroup.stop();
            this.animationGroup.dispose();
        }
        this.powerIndicator.dispose();
    }
}
