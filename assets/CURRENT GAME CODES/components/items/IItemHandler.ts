
import React from 'react';
import { AppState, AppActions } from '../../types';
import SoundManager from '../../services/SoundManager';
import ScreenManager from '../../services/MonitorManager';

declare const BABYLON: any;

export interface IItemHandler {
    update(state: AppState): void;
    dispose(): void;
}

export interface ItemHandlerProps {
    scene: any;
    actions: AppActions;
    viewModelMesh: any; // This acts as the World Mesh if isPlaced is true
    soundManager: SoundManager;
    screenManager: ScreenManager;
    playerCamera: any;
    graphicsQuality: 'Low' | 'Medium' | 'High';
    flashlightShadowGeneratorRef: React.MutableRefObject<any>;
    
    // Context for Placed Items
    isPlaced?: boolean;
    itemInstanceId?: number;
    
    // External Refs needed for logic
    ghostMeshRef?: React.MutableRefObject<any>;
    placedCameraNodesRef?: React.MutableRefObject<Map<number, any>>;
    uvEvidenceMeshesRef?: React.MutableRefObject<any[]>;
    dotsProjectorsRef?: React.MutableRefObject<Map<any, any>>;
    secretEnemiesRef?: React.MutableRefObject<any[]>;
}
