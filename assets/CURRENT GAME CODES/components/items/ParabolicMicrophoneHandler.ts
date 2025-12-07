
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import { WORLD_SCALE } from '../../constants';
import SoundManager from '../../services/SoundManager';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class ParabolicMicrophoneHandler implements IItemHandler {
    private scene: any;
    private soundManager: SoundManager;
    private playerCamera: any;
    private actions: any;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private lastUpdate: number = 0;
    private nextWhisperCheck: number = 0;
    private powerIndicator: PowerIndicator;

    constructor(props: ItemHandlerProps) {
        const { scene, playerCamera, actions, soundManager, isPlaced, itemInstanceId, viewModelMesh } = props;
        this.scene = scene;
        this.playerCamera = playerCamera;
        this.actions = actions;
        this.soundManager = soundManager;
        this.isPlaced = !!isPlaced;
        this.instanceId = itemInstanceId;
        this.powerIndicator = new PowerIndicator(viewModelMesh, scene);
    }

    public update(state: AppState): void {
        const now = performance.now();
        if (now - this.lastUpdate < 50) return; 
        this.lastUpdate = now;

        let isOn = false;
        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;
        } else {
            isOn = true;
        }
        
        this.powerIndicator.update(isOn);

        if (!isOn || this.isPlaced) {
            if (!this.isPlaced) {
                this.actions.updateState({ parabolicReading: 0 });
                this.soundManager.resetParabolicEffect();
            }
            return;
        }

        const isMyling = state.selectedGhost?.name === 'Myling';
        this.soundManager.updateParabolicEffect(this.playerCamera, isMyling);

        let reading = (Math.random() * 2.0) + 1.0; 

        if (state.ghostWorldCoordinates) {
            const ghostPos = new BABYLON.Vector3(
                state.ghostWorldCoordinates.x, 
                state.ghostWorldCoordinates.y, 
                state.ghostWorldCoordinates.z
            );
            const playerPos = this.playerCamera.globalPosition;
            
            const toGhost = ghostPos.subtract(playerPos);
            const distance = toGhost.length();
            
            // [CONFIG] RANGE: Max detection range (30 meters)
            const MAX_RANGE = 30 * WORLD_SCALE;

            if (distance < MAX_RANGE) {
                const forward = this.playerCamera.getDirection(BABYLON.Vector3.Forward());
                toGhost.normalize();
                
                const dot = BABYLON.Vector3.Dot(forward, toGhost);
                const angle = Math.acos(dot);
                
                // [CONFIG] ANGLE: Detection cone (approx 15 degrees)
                if (angle < 0.25) {
                    let signalStrength = 0;
                    signalStrength += 2.0;
                    // Scale strength by distance
                    signalStrength += (1 - (distance / MAX_RANGE)) * 5.0;

                    if (state.isHunting) {
                        signalStrength += 15.0;
                    } else if (!state.isGhostIdle) {
                        signalStrength += 5.0;
                    } else {
                        signalStrength += (Math.random() * 3.0);
                    }

                    reading += signalStrength;

                    // [CONFIG] WHISPER: Chance to hear special sound
                    if (now > this.nextWhisperCheck) {
                        if (Math.random() < 0.02) {
                            const isBanshee = state.selectedGhost?.name === 'Banshee';
                            this.soundManager.playParabolicSound(ghostPos, isBanshee);
                            this.nextWhisperCheck = now + 5000;
                        } else {
                            this.nextWhisperCheck = now + 100;
                        }
                    }
                }
            }
        }

        this.actions.updateState({ parabolicReading: reading });
    }

    public dispose(): void {
        if (!this.isPlaced) {
            this.actions.updateState({ parabolicReading: 0 });
            this.soundManager.resetParabolicEffect();
        }
        this.powerIndicator.dispose();
    }
}
