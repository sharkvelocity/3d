


import React from 'react';
import { Item, ItemId, AppState, PlacedItem } from '../types';
import { IItemHandler, ItemHandlerProps } from '../components/items/IItemHandler';
import { FlashlightHandler } from '../components/items/FlashlightHandler';
import { UVLightHandler } from '../components/items/UVLightHandler';
import { LighterHandler } from '../components/items/LighterHandler';
import { EMFReaderHandler } from '../components/items/EMFReaderHandler';
import { SpiritBoxHandler } from '../components/items/SpiritBoxHandler';
import { SmudgeSticksHandler } from '../components/items/SmudgeSticksHandler';
import { VideoCameraHandler } from '../components/items/VideoCameraHandler';
import { DOTSProjectorHandler } from '../components/items/DOTSProjectorHandler';
import { MusicBoxHandler } from '../components/cursed_items/MusicBoxHandler';
import { LanternHandler } from '../components/items/LanternHandler';
import { MotionSensorHandler } from '../components/items/MotionSensorHandler';
import { SaltHandler } from '../components/items/SaltHandler';
import { HeadlampHandler } from '../components/items/HeadlampHandler';
import { CrucifixHandler } from '../components/items/CrucifixHandler';
import { ParabolicMicrophoneHandler } from '../components/items/ParabolicMicrophoneHandler';
import { ThermometerHandler } from '../components/items/ThermometerHandler';
import { PhotoCameraHandler } from '../components/items/PhotoCameraHandler';
import { GhostWritingBookHandler } from '../components/items/GhostWritingBookHandler';
import { FlamethrowerHandler } from '../components/items/FlamethrowerHandler';

export class ItemManager {
    private props: Omit<ItemHandlerProps, 'viewModelMesh' | 'graphicsQuality'>;
    private currentHandler: IItemHandler | null = null;
    private currentItemId: ItemId | null = null;
    
    private placedItemHandlers: Map<number, IItemHandler> = new Map();
    private placedMeshesRef: React.MutableRefObject<Map<number, any>> | null = null;
    
    // Persistent handlers for slotless/accessory items
    private headlampHandler: IItemHandler | null = null;

    // State storage for re-initialization
    private currentViewModelMesh: any | null = null;
    private currentGraphicsQuality: 'Low' | 'Medium' | 'High' = 'Medium';

    constructor(props: Omit<ItemHandlerProps, 'viewModelMesh' | 'graphicsQuality'>) {
        this.props = props;
    }

    public setSoundManager(soundManager: any) {
        (this.props as any).soundManager = soundManager;
        
        // Initialize persistent handlers once sound manager is ready (if scene is ready)
        if (!this.headlampHandler && this.props.scene) {
             // Headlamp doesn't need a viewModelMesh since it's purely functional/light based
             // We pass null for viewModelMesh as it's not used in HeadlampHandler constructor
             const handlerProps: ItemHandlerProps = {
                ...this.props,
                viewModelMesh: null,
                graphicsQuality: 'Medium', // Default, overwritten or unused
                isPlaced: false
             };
             this.headlampHandler = new HeadlampHandler(handlerProps);
        }

        // Refresh active item handler to inject the new SoundManager
        if (this.currentHandler && this.currentItemId && this.currentViewModelMesh) {
            this.currentHandler.dispose();
            
            const handlerProps: ItemHandlerProps = { 
                ...this.props, 
                viewModelMesh: this.currentViewModelMesh,
                graphicsQuality: this.currentGraphicsQuality,
                isPlaced: false
            };
            this.currentHandler = this.createHandler(this.currentItemId, handlerProps);
        }
    }
    
    public setPlacedMeshesRef(ref: React.MutableRefObject<Map<number, any>>) {
        this.placedMeshesRef = ref;
    }
    
    public setExternalRefs(refs: Partial<ItemHandlerProps>) {
        Object.assign(this.props, refs);
    }

    public setActiveItem(item: Item | null, viewModelMesh: any | null, graphicsQuality: 'Low' | 'Medium' | 'High') {
        if (this.currentHandler) {
            this.currentHandler.dispose();
            this.currentHandler = null;
        }
        
        this.currentItemId = item ? item.id : null;
        this.currentViewModelMesh = viewModelMesh;
        this.currentGraphicsQuality = graphicsQuality;

        if (!item || !viewModelMesh) return;

        const handlerProps: ItemHandlerProps = { 
            ...this.props, 
            viewModelMesh,
            graphicsQuality,
            isPlaced: false
        };

        this.currentHandler = this.createHandler(item.id, handlerProps);
    }

    private createHandler(itemId: ItemId, props: ItemHandlerProps): IItemHandler | null {
        switch (itemId) {
            case ItemId.Flashlight: return new FlashlightHandler(props);
            case ItemId.UVLight: return new UVLightHandler(props);
            case ItemId.Lighter: return new LighterHandler(props);
            case ItemId.EMFReader: return new EMFReaderHandler(props);
            case ItemId.SpiritBox: return new SpiritBoxHandler(props);
            case ItemId.SmudgeSticks: return new SmudgeSticksHandler(props);
            case ItemId.VideoCamera: return new VideoCameraHandler(props);
            case ItemId.DOTSProjector: return new DOTSProjectorHandler(props);
            case ItemId.MusicBox: return new MusicBoxHandler(props);
            case ItemId.Lantern: return new LanternHandler(props);
            case ItemId.MotionSensor: return new MotionSensorHandler(props);
            case ItemId.Salt: return new SaltHandler(props);
            case ItemId.Headlamp: return new HeadlampHandler(props);
            case ItemId.Crucifix: return new CrucifixHandler(props);
            case ItemId.ParabolicMicrophone: return new ParabolicMicrophoneHandler(props);
            case ItemId.Thermometer: return new ThermometerHandler(props);
            case ItemId.PhotoCamera: return new PhotoCameraHandler(props);
            case ItemId.GhostWritingBook: return new GhostWritingBookHandler(props);
            case ItemId.Flamethrower: return new FlamethrowerHandler(props);
            default: return null;
        }
    }

    public update(state: AppState) {
        // 1. Update Held Item
        if (this.currentHandler) {
            this.currentHandler.update(state);
        }
        
        // 2. Update Persistent Items (Headlamp)
        if (this.headlampHandler) {
            this.headlampHandler.update(state);
        }

        // 3. Manage Placed Items
        if (this.placedMeshesRef && this.placedMeshesRef.current) {
            const validInstanceIds = new Set<number>();

            state.placedItems.forEach((item) => {
                validInstanceIds.add(item.instanceId);
                
                // Check if handler exists
                if (!this.placedItemHandlers.has(item.instanceId)) {
                    // Check if mesh exists
                    const mesh = this.placedMeshesRef!.current.get(item.instanceId);
                    if (mesh) {
                        const handlerProps: ItemHandlerProps = {
                            ...this.props,
                            viewModelMesh: mesh,
                            graphicsQuality: state.graphicsQuality,
                            isPlaced: true,
                            itemInstanceId: item.instanceId
                        };
                        
                        const handler = this.createHandler(item.id, handlerProps);
                        if (handler) {
                            this.placedItemHandlers.set(item.instanceId, handler);
                        }
                    }
                }
                
                // Update Handler
                const handler = this.placedItemHandlers.get(item.instanceId);
                if (handler) {
                    handler.update(state);
                }
            });

            // Cleanup removed items
            this.placedItemHandlers.forEach((handler, instanceId) => {
                if (!validInstanceIds.has(instanceId)) {
                    handler.dispose();
                    this.placedItemHandlers.delete(instanceId);
                }
            });
        }
    }

    public dispose() {
        if (this.currentHandler) {
            this.currentHandler.dispose();
            this.currentHandler = null;
        }
        if (this.headlampHandler) {
            this.headlampHandler.dispose();
            this.headlampHandler = null;
        }
        this.placedItemHandlers.forEach(h => h.dispose());
        this.placedItemHandlers.clear();
    }
}
