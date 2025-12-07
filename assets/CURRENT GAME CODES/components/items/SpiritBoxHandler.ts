
import { IItemHandler, ItemHandlerProps } from './IItemHandler';
import { AppState } from '../../types';
import SoundManager from '../../services/SoundManager';
import { AUDIO_ROOT, WORLD_SCALE } from '../../constants';
import { PowerIndicator } from './PowerIndicator';

declare const BABYLON: any;

export class SpiritBoxHandler implements IItemHandler {
    private soundManager: SoundManager;
    private isPlaced: boolean;
    private instanceId: number | undefined;
    private spatialSound: any;
    private mesh: any;
    private scene: any;
    private powerIndicator: PowerIndicator;

    // Animation State
    private channelMeshes: any[] = [];
    private signalMeshes: any[] = [];
    
    // [CONFIG] TIMING: How often the channels switch (scanning effect)
    private lastScanTime: number = 0;
    private scanInterval: number = 1000; // 1 second

    // [CONFIG] TIMING: How fast the equalizer moves when speaking
    private lastEqualizerTime: number = 0;
    private equalizerUpdateRate: number = 50; // 50ms

    private responseTimer: number = 0;
    private lastEventId: number | null = null;
    
    // [CONFIG] COLORS: The emissive colors for the display elements
    private channelColor = new BABYLON.Color3(1.0, 0.3, 0.0); // Orange (Channel Numbers)
    private signalColor = new BABYLON.Color3(1.0, 0.0, 0.0);  // Red (Equalizer Bars)
    private offColor = new BABYLON.Color3(0, 0, 0);           // Black (Off)

    constructor(props: ItemHandlerProps) {
        this.soundManager = props.soundManager;
        this.isPlaced = !!props.isPlaced;
        this.instanceId = props.itemInstanceId;
        this.mesh = props.viewModelMesh;
        this.scene = props.scene;
        this.powerIndicator = new PowerIndicator(this.mesh, this.scene);

        // --- Setup Display Meshes ---
        const allMeshes = this.mesh.getDescendants(false);
        // Include root if it's flattened
        allMeshes.push(this.mesh);

        // Find Channels (channel.001 - channel.006)
        for (let i = 1; i <= 6; i++) {
            const suffix = i.toString().padStart(3, '0');
            const name = `channel.${suffix}`;
            // Use endsWith to handle cloning prefixes
            const mesh = allMeshes.find((m: any) => m.name.endsWith(name));
            
            if (mesh) {
                // Clone material to allow individual lighting
                const mat = new BABYLON.StandardMaterial(`sb_ch_mat_${i}_${this.instanceId}`, this.scene);
                mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                mat.emissiveColor = this.offColor;
                mat.disableLighting = true;
                mesh.material = mat;
                this.channelMeshes.push(mesh);
            }
        }

        // Find Signals (signal.001 - signal.011)
        for (let i = 1; i <= 11; i++) {
            const suffix = i.toString().padStart(3, '0');
            const name = `signal.${suffix}`;
            const mesh = allMeshes.find((m: any) => m.name.endsWith(name));
            
            if (mesh) {
                const mat = new BABYLON.StandardMaterial(`sb_sig_mat_${i}_${this.instanceId}`, this.scene);
                mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                mat.emissiveColor = this.offColor;
                mat.disableLighting = true;
                mesh.material = mat;
                this.signalMeshes.push(mesh);
            }
        }

        if (this.isPlaced) {
            console.log(`[SpiritBoxHandler] Creating spatial sound for instance ${this.instanceId}`);
            // Initialize spatial sound
            this.spatialSound = new BABYLON.Sound(
                `spirit_box_placed_${this.instanceId}`,
                `${AUDIO_ROOT}item_sfx/spirit_box.wav`,
                this.scene,
                null,
                {
                    loop: true,
                    autoplay: false,
                    spatialSound: true,
                    distanceModel: 'linear',
                    maxDistance: 20 * WORLD_SCALE,
                    rolloffFactor: 1.0
                }
            );
            if (this.mesh) {
                this.spatialSound.attachToMesh(this.mesh);
            }
        }
    }

    public update(state: AppState): void {
        let isOn = false;

        if (this.isPlaced && this.instanceId !== undefined) {
            const item = state.placedItems.find(p => p.instanceId === this.instanceId);
            isOn = item ? !!item.isOn : false;

            if (isOn) {
                if (!this.spatialSound.isPlaying) {
                    console.log(`[SpiritBoxHandler] Playing spatial sound ${this.instanceId}`);
                    this.spatialSound.play();
                }
            } else {
                if (this.spatialSound.isPlaying) {
                    console.log(`[SpiritBoxHandler] Stopping spatial sound ${this.instanceId}`);
                    this.spatialSound.stop();
                }
            }
        } else {
            // Held Logic
            isOn = state.isSpiritBoxOn;
            if (isOn) {
                this.soundManager.playSpiritBoxSound();
            } else {
                this.soundManager.stopSpiritBoxSound();
            }
        }
        
        this.powerIndicator.update(isOn);
        this.updateAnimations(state, isOn);
    }

    private updateAnimations(state: AppState, isOn: boolean) {
        if (!isOn) {
            // Reset all lights
            this.channelMeshes.forEach(m => { if(m.material) m.material.emissiveColor = this.offColor; });
            this.signalMeshes.forEach(m => { if(m.material) m.material.emissiveColor = this.offColor; });
            return;
        }

        const now = performance.now();

        // 1. Check for Response Event
        if (state.paranormalEvent?.type === 'spirit_box_response') {
            // Only trigger on new event ID
            if (state.paranormalEvent.id !== this.lastEventId) {
                this.lastEventId = state.paranormalEvent.id;
                this.responseTimer = 3000; // Duration of animation in ms
            }
        }

        // 2. Handle Response Animation (Equalizer)
        if (this.responseTimer > 0) {
            // Decrement timer (approximate based on update ticks, or use delta if available)
            // Using loose timing here since update is framed-locked
            this.responseTimer -= 16; 

            if (now - this.lastEqualizerTime > this.equalizerUpdateRate) {
                this.lastEqualizerTime = now;
                
                // Random amplitude (0 to 11)
                const amplitude = Math.floor(Math.random() * (this.signalMeshes.length + 1));
                
                this.signalMeshes.forEach((mesh, index) => {
                    if (mesh.material) {
                        if (index < amplitude) {
                            mesh.material.emissiveColor = this.signalColor;
                        } else {
                            mesh.material.emissiveColor = this.offColor;
                        }
                    }
                });
            }
        } else {
            // No response active: Turn off signals
            this.signalMeshes.forEach(m => { if(m.material) m.material.emissiveColor = this.offColor; });
        }

        // 3. Handle Channel Scan Animation (Random Order every 1s)
        if (now - this.lastScanTime > this.scanInterval) {
            this.lastScanTime = now;
            
            // Pick random channel
            const activeIndex = Math.floor(Math.random() * this.channelMeshes.length);
            
            this.channelMeshes.forEach((mesh, index) => {
                if (mesh.material) {
                    if (index === activeIndex) {
                        mesh.material.emissiveColor = this.channelColor;
                    } else {
                        mesh.material.emissiveColor = this.offColor;
                    }
                }
            });
        }
    }

    public dispose(): void {
        if (this.isPlaced && this.spatialSound) {
            console.log(`[SpiritBoxHandler] Disposing spatial sound ${this.instanceId}`);
            this.spatialSound.stop();
            this.spatialSound.dispose();
        } else {
            this.soundManager.stopSpiritBoxSound();
        }
        this.powerIndicator.dispose();
        
        // Cleanup materials
        this.channelMeshes.forEach(m => m.material?.dispose());
        this.signalMeshes.forEach(m => m.material?.dispose());
    }
}
