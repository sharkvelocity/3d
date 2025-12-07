
import { ICursedItemHandler } from './ICursedItemHandler';
import { AppState, AppActions, ItemId } from '../../types';
import { TEXTURE_ROOT, WORLD_SCALE } from '../../constants';
import SoundManager from '../../services/SoundManager';

declare const BABYLON: any;

export class SummoningCircleHandler implements ICursedItemHandler {
    private scene: any;
    private actions: AppActions;
    private soundManager: SoundManager | null;
    private rootMesh: any;
    private candles: { node: any, flameSystem: any, light: any, isLit: boolean }[] = [];
    private candlesLitCount: number = 0;
    private isActivated: boolean = false;
    private cachedState: AppState | null = null;
    private summonTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(scene: any, actions: AppActions, soundManager: SoundManager | null, rootMesh: any) {
        this.scene = scene;
        this.actions = actions;
        this.soundManager = soundManager;
        this.rootMesh = rootMesh;

        // [CONFIG] Disable collision on the circle hierarchy so player can walk over it
        // Keep isPickable=true so InteractionHandler can target it
        if (rootMesh) {
            rootMesh.checkCollisions = false;
            const descendants = rootMesh.getDescendants(false);
            descendants.forEach((m: any) => {
                m.checkCollisions = false;
            });
        }

        // [CONFIG] Initialize Candles based on fire.00x nodes
        // The GLB contains nodes named fire.001 to fire.005 representing the wick positions.
        const allNodes = rootMesh.getDescendants(false);
        
        for (let i = 1; i <= 5; i++) {
            const suffix = i.toString().padStart(3, '0'); // "001", "002"...
            // Find the transform/mesh node for the fire position
            const fireNode = allNodes.find((n: any) => n.name.includes(`fire.${suffix}`));

            if (fireNode) {
                // Create Fire Particle System (Lighter Style)
                const flameSystem = new BABYLON.ParticleSystem(`sc_flame_${i}`, 200, scene);
                flameSystem.particleTexture = new BABYLON.Texture(`${TEXTURE_ROOT}particle.png`, scene);
                flameSystem.emitter = fireNode;
                
                // Visuals: Hot center, orange edge
                flameSystem.color1 = new BABYLON.Color4(1.0, 1.0, 0.5, 1.0); // Bright Yellow/White
                flameSystem.color2 = new BABYLON.Color4(1.0, 0.5, 0.0, 1.0); // Orange
                flameSystem.colorDead = new BABYLON.Color4(0.5, 0.0, 0.0, 0.0);

                flameSystem.minSize = 0.03;
                flameSystem.maxSize = 0.08;
                flameSystem.minLifeTime = 0.3;
                flameSystem.maxLifeTime = 0.6;
                flameSystem.emitRate = 50;
                flameSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
                
                // Static flame behavior
                flameSystem.createSphereEmitter(0.02);
                flameSystem.minEmitPower = 0.01;
                flameSystem.maxEmitPower = 0.05;
                flameSystem.updateSpeed = 0.015;
                flameSystem.gravity = new BABYLON.Vector3(0, 0.5, 0);

                flameSystem.stop();

                // Create Point Light for ambiance
                const light = new BABYLON.PointLight(`sc_light_${i}`, BABYLON.Vector3.Zero(), scene);
                light.parent = fireNode;
                light.intensity = 0.4;
                light.range = 2 * WORLD_SCALE;
                light.diffuse = new BABYLON.Color3(1.0, 0.7, 0.3);
                light.setEnabled(false);

                this.candles.push({
                    node: fireNode,
                    flameSystem,
                    light,
                    isLit: false
                });
            } else {
                console.warn(`[SummoningCircle] Could not find fire node: fire.${suffix}`);
            }
        }
    }

    public update(state: AppState): void {
        // Cache state for async logic (crucifix check)
        this.cachedState = state;
    }

    public activate(): void {
        if (this.isActivated) return;

        // Find next unlit candle
        const nextCandle = this.candles.find(c => !c.isLit);
        
        if (nextCandle) {
            nextCandle.isLit = true;
            nextCandle.flameSystem.start();
            nextCandle.light.setEnabled(true);
            this.candlesLitCount++;
            
            this.soundManager?.playLighterFlick();

            // [CONFIG] Drain Sanity (16% per candle)
            if (this.cachedState) {
                const newSanity = Math.max(0, this.cachedState.sanity - 16);
                this.actions.updateState({ sanity: newSanity });
            }

            if (this.candlesLitCount >= 5) {
                this.triggerSummoning();
            }
        }
    }

    private triggerSummoning() {
        this.isActivated = true;
        
        // 1. Teleport Ghost to Circle Center
        const circlePos = this.rootMesh.getAbsolutePosition();
        
        this.actions.updateState({ 
            ghostCoordinates: { x: circlePos.x, y: 1.0, z: circlePos.z },
            ghostWorldCoordinates: { x: circlePos.x, y: 1.0, z: circlePos.z },
            teleportGhostTo: null // Clear any pending teleports
        });
        
        // 2. Lock Ghost (Trap) & Manifest
        // Using specific event to ensure ghost stays at circle
        this.actions.updateState({
            activeGhostEvent: { startTime: performance.now(), duration: 5000 },
            paranormalEvent: { type: 'summoning_circle_manifest', id: Math.random(), roomId: 0 } 
        });

        // 3. Start Timer for Cursed Hunt
        this.summonTimeout = setTimeout(() => {
            // Check for Crucifix Defense
            const state = this.cachedState; 
            let huntPrevented = false;

            if (state) {
                const CRUCIFIX_RANGE = 5 * WORLD_SCALE; // Check vicinity
                
                // Find a valid crucifix with >= 2 charges
                const validCrucifix = state.placedItems.find(item => {
                    if (item.id !== ItemId.Crucifix) return false;
                    
                    // Check charges: Must have >= 2
                    const uses = item.currentUses ?? item.uses ?? 2;
                    if (uses < 2) return false;

                    // Check distance
                    const itemPos = new BABYLON.Vector3(item.position.x, item.position.y, item.position.z);
                    const dist = BABYLON.Vector3.Distance(itemPos, circlePos);
                    return dist <= CRUCIFIX_RANGE;
                });

                if (validCrucifix) {
                    huntPrevented = true;
                    // Consume 2 charges (destroying it essentially)
                    this.actions.updatePlacedItem({ ...validCrucifix, currentUses: 0 });
                    this.soundManager?.playCrucifixBurn(new BABYLON.Vector3(validCrucifix.position.x, validCrucifix.position.y, validCrucifix.position.z));
                    
                    // End event immediately (Ghost disappears)
                    this.actions.updateState({ activeGhostEvent: null });
                }
            }

            if (!huntPrevented) {
                // BYPASS TIMERS: Force start hunt immediately
                this.actions.startHunt(true); // isCursed = true
                
                // Extinguish candles visually after hunt starts
                this.candles.forEach(c => {
                    c.flameSystem.stop();
                    c.light.setEnabled(false);
                });
            }

        }, 5000);
    }

    public dispose(): void {
        if (this.summonTimeout) clearTimeout(this.summonTimeout);
        this.candles.forEach(c => {
            c.flameSystem.dispose();
            c.light.dispose();
        });
        this.candles = [];
    }
}
