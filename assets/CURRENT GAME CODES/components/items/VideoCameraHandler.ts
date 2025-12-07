
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import ScreenManager from '../../services/MonitorManager';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class VideoCameraHandler implements IItemHandler {
    private screenManager: ScreenManager;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private placedCameraNodesRef: React.RefObject<Map<number, any>> | undefined;
    private cameraNode: any;
    private powerIndicator: PowerIndicator;
    private onModelScreenMesh: any;

    constructor(props: ItemHandlerProps) {
        const { viewModelMesh, screenManager, scene, isPlaced, itemInstanceId, placedCameraNodesRef } = props;
        this.screenManager = screenManager;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.placedCameraNodesRef = placedCameraNodesRef;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        // Find the "screen" mesh on the physical model and ensure it's black/off
        const allDescendants = viewModelMesh.getDescendants(false);
        const screenNames = ["screen01", "display", "panel", "monitor"];
        this.onModelScreenMesh = allDescendants.find((m: any) => screenNames.some(n => m.name.toLowerCase().includes(n)));
        
        if (this.onModelScreenMesh) {
            // Apply a simple black material to hide it/make it look off
            const offMat = new BABYLON.StandardMaterial("camScreenOffMat", scene);
            offMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            offMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            offMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            offMat.disableLighting = true;
            this.onModelScreenMesh.material = offMat;
        }

        if (!this.isPlaced) {
            // Register with ScreenManager for PIP (Handheld HUD)
            this.screenManager.setPipSourceNode(viewModelMesh);
            this.screenManager.setEquippedViewModel(viewModelMesh);
        }

        // --- LOGIC (Camera Node for Placed Camera) ---
        if (this.isPlaced && this.instanceId !== undefined && this.placedCameraNodesRef) {
            this.cameraNode = new BABYLON.TransformNode(`cameraNode_${this.instanceId}`, scene);
            this.cameraNode.parent = viewModelMesh;
            
            // Align with lens if possible
            const lensMesh = allDescendants.find((m: any) => m.name.toLowerCase().includes("lens"));
            if (lensMesh) {
                // Calculate local position of lens relative to root
                const rootInv = viewModelMesh.getWorldMatrix().clone().invert();
                this.cameraNode.position = BABYLON.Vector3.TransformCoordinates(lensMesh.getAbsolutePosition(), rootInv);
            } else {
                // Fallback
                this.cameraNode.position = new BABYLON.Vector3(0, 0.05, 0.1);
            }
            
            // Ensure Rotation is Identity (relative to parent model which is already rotated correctly)
            this.cameraNode.rotationQuaternion = BABYLON.Quaternion.Identity();
            
            // Register to the global map so MonitorManager can find it for the Van Monitor
            this.placedCameraNodesRef.current.set(this.instanceId, this.cameraNode);
        }
    }

    public update(state: AppState): void {
        let isOn = true;
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : true;
        } else if (state.heldCameraState) {
            isOn = state.heldCameraState.isOn;
        }
        
        this.powerIndicator.update(isOn);
    }

    public dispose(): void {
        if (!this.isPlaced) {
            // Clear PIP references when unequipped
            this.screenManager.setPipSourceNode(null);
            this.screenManager.setEquippedViewModel(null);
        } else {
            // Clean up placed camera node
            if (this.cameraNode) {
                this.cameraNode.dispose();
            }
            if (this.instanceId !== undefined && this.placedCameraNodesRef) {
                this.placedCameraNodesRef.current.delete(this.instanceId);
            }
        }
        this.powerIndicator.dispose();
    }
}
