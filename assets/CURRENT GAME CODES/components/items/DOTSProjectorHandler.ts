
import React from 'react';
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class DOTSProjectorHandler implements IItemHandler {
    private light: any;
    private dotsProjectorsRef: React.MutableRefObject<Map<any, any>> | undefined;
    private instanceId: number | undefined;
    private isPlaced: boolean;
    private playerCamera: any; 
    private powerIndicator: PowerIndicator;

    constructor(props: ItemHandlerProps) {
        const { scene, viewModelMesh, itemInstanceId, playerCamera, isPlaced, dotsProjectorsRef, graphicsQuality } = props;
        this.dotsProjectorsRef = dotsProjectorsRef;
        this.instanceId = itemInstanceId;
        this.isPlaced = !!isPlaced;
        this.playerCamera = playerCamera;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);

        this.light = new BABYLON.SpotLight(
            "dotsProjectorLight",
            BABYLON.Vector3.Zero(),
            new BABYLON.Vector3(0, 0, 1),
            // [CONFIG] ANGLE: Width of cone (Math.PI / 2.5 ~ 72 degrees)
            Math.PI / 2.5, 
            // [CONFIG] RANGE: Length of projection (20m)
            20 * WORLD_SCALE, 
            scene
        );
        
        // [FIX] FALLOFF: Use Physical (GLTF) falloff if available
        this.light.falloffType = (BABYLON.Light && BABYLON.Light.FALLOFF_GLTF) !== undefined ? BABYLON.Light.FALLOFF_GLTF : 2;
        
        if (this.isPlaced) {
            this.light.parent = viewModelMesh;
            this.light.position = new BABYLON.Vector3(0, 0.2, 0); 
        } else {
            this.light.parent = null; 
        }
        
        // [CONFIG] TEXTURE RESOLUTION based on quality settings
        let resolution = 1024;
        if (graphicsQuality === 'Low') resolution = 512;
        else if (graphicsQuality === 'High') resolution = 2048;

        const dotSize = 2; 
        const spacingBase = 32;
        const spacing = Math.floor(spacingBase * (resolution / 1024)); 

        // [CONFIG] DYNAMIC TEXTURE GENERATION
        const dotsTexture = new BABYLON.DynamicTexture("dotsDynamicTexture", resolution, scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        dotsTexture.hasAlpha = false; 
        dotsTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        dotsTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const ctx = dotsTexture.getContext();
        const imageData = ctx.createImageData(resolution, resolution);
        const data = imageData.data;
        
        // Fill Black
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0;     // R
            data[i + 1] = 0; // G
            data[i + 2] = 0; // B
            data[i + 3] = 255; // Alpha
        }

        // Draw Random Dots
        for (let y = 0; y < resolution; y += Math.max(1, spacing)) {
            for (let x = 0; x < resolution; x += Math.max(1, spacing)) {
                const offsetX = Math.floor(Math.random() * (spacing / 2));
                const offsetY = Math.floor(Math.random() * (spacing / 2));
                
                const drawX = x + offsetX;
                const drawY = y + offsetY;

                for (let dy = 0; dy < dotSize; dy++) {
                    for (let dx = 0; dx < dotSize; dx++) {
                        if (drawX + dx < resolution && drawY + dy < resolution) {
                            const index = ((drawY + dy) * resolution + (drawX + dx)) * 4;
                            data[index] = 255;     // R
                            data[index + 1] = 255; // G
                            data[index + 2] = 255; // B
                            data[index + 3] = 255; // A
                        }
                    }
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        dotsTexture.update();

        this.light.projectionTexture = dotsTexture;
        this.light.diffuse = new BABYLON.Color3(0, 1, 0); // [CONFIG] COLOR: Green
        this.light.specular = new BABYLON.Color3(0, 0, 0); 
        this.light.intensity = 2.0; 
        this.light.setEnabled(false); 

        if (this.instanceId !== undefined && this.dotsProjectorsRef) {
            this.dotsProjectorsRef.current.set(this.instanceId, this.light);
        }
    }

    public update(state: AppState): void {
        let shouldBeOn = false;

        if (this.isPlaced && this.instanceId !== undefined) {
             const item = state.placedItems.find(p => p.instanceId === this.instanceId);
             shouldBeOn = item ? !!item.isOn : false;
        } else {
            shouldBeOn = state.isDOTSOn;
        }

        if (shouldBeOn) {
            if (!this.light.isEnabled()) this.light.setEnabled(true);

            if (!this.isPlaced && this.playerCamera) {
                // If held, sync position manually to match first person view model
                this.playerCamera.computeWorldMatrix();
                const matrix = this.playerCamera.getWorldMatrix();
                
                const offset = new BABYLON.Vector3(0.15, -0.25, 0.7);
                const worldPos = BABYLON.Vector3.TransformCoordinates(offset, matrix);
                this.light.position = worldPos;
                
                const forward = new BABYLON.Vector3(0, 0, 1);
                const worldDir = BABYLON.Vector3.TransformNormal(forward, matrix);
                this.light.direction = worldDir;
                this.light.computeWorldMatrix(true);
            }
        } else {
            if (this.light.isEnabled()) this.light.setEnabled(false);
        }
        this.powerIndicator.update(shouldBeOn);
    }

    public dispose(): void {
        if (this.instanceId !== undefined && this.dotsProjectorsRef) {
            this.dotsProjectorsRef.current.delete(this.instanceId);
        }
        if (this.light) {
            this.light.setEnabled(false);
            if (this.light.projectionTexture) {
                this.light.projectionTexture.dispose();
            }
            this.light.dispose();
        }
        this.powerIndicator.dispose();
    }
}
