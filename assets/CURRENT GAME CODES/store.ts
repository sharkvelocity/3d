
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { 
    AppState, 
    GameState, 
    Weather, 
    EvidenceType, 
    Item, 
    ItemId, 
    PlacedItem, 
    MapData, 
    Ghost, 
    EmfEvent, 
    NavNode, 
    DevPin, 
    Store,
    AppActions,
    PlayerUpgrades
} from './types';
import { MAPS } from './data/maps';
import { GHOSTS } from './data/ghosts';
import { ITEMS as ITEM_TEMPLATES, LIGHTER } from './data/items';
import { WEATHER_TYPES } from './data/weather';
import { 
    SANITY, 
    TEMPERATURE, 
    TIMERS, 
    TRUCK_ROOM_ID, 
    MODEL_ROOT, 
    WORLD_SCALE, 
    VIDEO_TRIPOD_URL, 
    ITEMS,
    DEFAULT_KEY_BINDINGS_WASD,
    DEFAULT_KEY_BINDINGS_ARROWS
} from './constants';

// --- Helpers ---

function getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const computeDerivedState = (state: Partial<AppState>): Partial<AppState> => {
    const { carriedInventory, equippedItemIndex } = state;
    if (!carriedInventory) return {};

    const index = equippedItemIndex !== undefined ? equippedItemIndex : null;
    const equippedItem = (index !== null && carriedInventory[index]) ? carriedInventory[index] : null;
    return { equippedItem };
};

const getNextEquippedIndex = (inventory: (Item | null)[]): number | null => {
    return null;
};

// Removed _saveSettings helper as persist middleware handles this now

export const initialState: AppState = {
    gameState: GameState.MainMenu,
    menuStep: 'main',
    selectedMap: null,
    selectedGhost: null,
    currentWeather: Weather.Calm,
    sanity: 100,
    stamina: 100,
    loadout: [null, null, null],
    initialEquippedIndex: null,
    carriedInventory: [null, null, null, null, null],
    truckInventory: [],
    equippedItemIndex: null,
    equippedItem: null,
    placedItems: [],
    placedCameras: [],
    placedItemInstanceCounter: 0,
    collectedEvidence: new Set<EvidenceType>(),
    selectedEvidence: new Set<EvidenceType>(),
    selectedGhostGuess: null,
    isLoading: false,
    loadingProgress: { progress: 0, message: "Initializing..." },
    isGameActive: false,
    playerStatus: { isNearGhost: false, isInDark: false },
    emfLevel: 0,
    activeEmfEvents: [],
    emfEventCounter: 0,
    playerCoordinates: null,
    endGameMessage: null,
    interactableFocus: null,
    isAudioUnlocked: false,
    isMuted: false,
    isFlashlightOn: false,
    isUvLightOn: false,
    isEmfReaderOn: false,
    isDOTSOn: false,
    isHeadlampOn: false,
    heldCameraState: null,
    currentRoomId: null,
    isLighterOn: false,
    isFlamethrowerOn: false,
    isFlamethrowerAltFire: false,
    parabolicReading: 0,
    isSpiritBoxOn: false,
    isVanUIOpen: false,
    isDeploying: false,
    activeCameraIndex: 0, 
    loadingPlayerIcon: 'player_chase.png',
    loadingGhostIcon: 'ghost_chase.png',
    isHunting: false,
    setupPhaseTimer: 0,
    huntCooldownTimer: 0,
    huntTimer: 0,
    huntFlickerCount: 0,
    smudgeTimer: 0,
    ghostBlindedTimer: 0,
    ghostCoordinates: null,
    ghostWorldCoordinates: null,
    ambientTemperature: 13,
    thermometerReading: null,
    isBreakerOn: false,
    breakerOverloadThreshold: 10,
    ghostFavoriteRoomId: null,
    ghostCurrentRoomId: null,
    roomTemperatures: {},
    mansionLayout: null,
    isPushToTalkActive: false,
    thayeAge: 0,
    thayeNextAgeAttemptTimer: 60,
    onryoExtinguishedFlames: 0,
    yureiTrappedTimer: 0,
    lastInteractionPosition: null,
    isCrouching: false,
    isSprinting: false,
    lightStates: {},
    paranormalEvent: null,
    disabledLights: new Set<number>(),
    isMobile: false,
    touchControlsEnabled: false,
    touchJoystickEnabled: false,
    touchLookEnabled: false,
    touchState: {
        joystick: { x: 0, y: 0 },
        look: { x: 0, y: 0 },
    },
    isPaused: false,
    ambientVolume: 0.5,
    sfxVolume: 0.8,
    isMicrophoneEnabled: true,
    mouseSensitivity: 1.0,
    touchSensitivity: 1.0,
    graphicsQuality: 'Medium',
    controlScheme: 'WASD',
    keyBindings: DEFAULT_KEY_BINDINGS_WASD,
    isEditingFurniture: false,
    exportProgress: null,
    ghostPath: null,
    isGhostIdle: true,
    ghostAiState: 'wandering',
    isPhonographOn: false,
    phonographPlayingSong: null,
    isPlacingSalt: false,
    isMusicBoxPlaying: false,
    teleportGhostTo: null,
    isDevMode: false,
    devPins: [],
    devPinCounter: 0,
    isGhostFriendly: false,
    devPlacementMode: { mode: 'simple', selectedPinId: null },
    devTeleportTarget: null,
    devGhostModelChange: null,
    activeGhostEvent: null,
    ghostPendingAction: null,
    isPushToTalkEnabled: true,
    devFlyMode: false,
    devRoofHidden: false,
    isSecretMode: false,
    secretPhase: 'warmup',
    secretPhaseTimer: 0,
    isSecretShopOpen: false,
    secretWave: 0,
    secretPoints: 0,
    secretScore: 0,
    secretKills: 0,
    waveTotalEnemies: 0,
    waveEnemiesSpawned: 0,
    waveEnemiesKilled: 0,
    secretPlayerHealth: 10,
    secretRoundTimer: 0,
    waveStartTime: 0,
    isSettingsLoaded: false,
    playerUpgrades: {
        maxHealth: 10,
        damageMultiplier: 1,
        fireRateMultiplier: 1,
        hasShotgun: false,
        hasBouncingAmmo: false,
        hasExplosiveAmmo: false,
        hasLaser: false,
        rangeMultiplier: 1
    },
};

export const useStore = create<Store>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,
                actions: {
                    updateState: (payload: Partial<AppState>) => {
                        set((state) => ({ ...state, ...payload }), false, { type: 'updateState', payload });
                    },
                    setGameState: (payload: GameState) => set({ gameState: payload }, false, 'setGameState'),
                    
                    forceEvidence: () => set({ paranormalEvent: { type: 'force_evidence', id: Math.random() } }),

                    startInvestigation: (map: MapData) => {
                        const state = get();
                        
                        // Explicitly cast random elements to avoid type inference issues
                        const randomGhost = getRandomElement(GHOSTS) as Ghost;
                        const randomWeather = getRandomElement(WEATHER_TYPES) as Weather;
                        
                        let ambientTemperature = TEMPERATURE.AMBIENT_CALM;
                        if (randomWeather === Weather.Snow) ambientTemperature = TEMPERATURE.AMBIENT_SNOW;
                        else if (randomWeather === Weather.Rain) ambientTemperature = TEMPERATURE.AMBIENT_RAIN;
                        else if (randomWeather === Weather.HeavyRain) ambientTemperature = TEMPERATURE.AMBIENT_HEAVY_RAIN; 
                        
                        const playerIcons = ['player_chase.png', 'player_chase2.png', 'player_chased.png'];
                        const ghostIcons = ['ghost_chase.png', 'ghost_chase2.png'];
                        const randomPlayerIcon = getRandomElement(playerIcons);
                        const randomGhostIcon = getRandomElement(ghostIcons);
                        
                        const newCarriedInventory: (Item | null)[] = [null, null, null, null, null];
                        const newTruckInventory: Item[] = [];

                        // Populate Truck Inventory based on Loadout + Defaults
                        ITEM_TEMPLATES.forEach(itemTemplate => {
                            if (itemTemplate.slotless || itemTemplate.id === ItemId.Bone || itemTemplate.id === ItemId.GenericBook || itemTemplate.id === ItemId.Flamethrower) return;
                            
                            // Determine quantity based on user unlocks/purchases in future
                            // For now, default to 1 or Max
                            const maxAllowed = itemTemplate.maxCount ?? 1;
                            for (let i = 0; i < maxAllowed; i++) {
                                const newItem: Item = { ...itemTemplate };
                                if (itemTemplate.uses !== undefined) {
                                    newItem.currentUses = itemTemplate.uses;
                                }
                                newTruckInventory.push(newItem);
                            }
                        });
                        
                        const headlampTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.Headlamp);
                        if (headlampTemplate) {
                            newTruckInventory.push({ ...headlampTemplate });
                        }
                        
                        newCarriedInventory[3] = { ...LIGHTER };

                        // Apply Player Loadout to Carried Inventory
                        state.loadout.forEach((loadoutItem, index) => {
                            if (loadoutItem && index < 3) {
                                // Find matching item in truck and move to carried
                                const truckIndex = newTruckInventory.findIndex(ti => ti.id === loadoutItem.id);
                                if (truckIndex !== -1) {
                                    newCarriedInventory[index] = newTruckInventory[truckIndex];
                                    newTruckInventory.splice(truckIndex, 1);
                                }
                            }
                        });

                        const newState: Partial<AppState> = {
                            selectedMap: map,
                            selectedGhost: randomGhost,
                            currentWeather: randomWeather,
                            ambientTemperature,
                            gameState: GameState.Loading,
                            isLoading: true,
                            isDeploying: false,
                            menuStep: 'main',
                            sanity: 100,
                            stamina: 100,
                            carriedInventory: newCarriedInventory,
                            truckInventory: newTruckInventory,
                            equippedItemIndex: 3, 
                            setupPhaseTimer: TIMERS.SETUP_PHASE_DURATION,
                            loadingPlayerIcon: randomPlayerIcon,
                            loadingGhostIcon: randomGhostIcon,
                            // loadout: [null, null, null], // Don't reset loadout on start, persist it
                            initialEquippedIndex: null,
                            activeCameraIndex: 0,
                            isFlashlightOn: false,
                            isUvLightOn: false,
                            isHeadlampOn: false,
                            isCrouching: false,
                            isBreakerOn: false,
                            breakerOverloadThreshold: getRandomInt(6, 10), 
                            currentRoomId: TRUCK_ROOM_ID, 
                            ghostPendingAction: null,
                            isFlamethrowerOn: false,
                            isFlamethrowerAltFire: false,
                            isSecretMode: false, 
                            secretWave: 0,
                            secretScore: 0,
                            secretPoints: state.secretPoints, // Persist points
                            secretRoundTimer: 0,
                        };
                        set(state => ({ ...state, ...newState, ...computeDerivedState({ ...state, ...newState }) }), false, 'startInvestigation');
                    },
                    
                    resetGame: () => set(state => ({
                        ...initialState,
                        // Persist Settings
                        isAudioUnlocked: state.isAudioUnlocked,
                        ambientVolume: state.ambientVolume,
                        sfxVolume: state.sfxVolume,
                        isMicrophoneEnabled: state.isMicrophoneEnabled,
                        mouseSensitivity: state.mouseSensitivity,
                        touchSensitivity: state.touchSensitivity,
                        graphicsQuality: state.graphicsQuality,
                        isMobile: state.isMobile, 
                        touchControlsEnabled: state.touchControlsEnabled,
                        touchJoystickEnabled: state.touchJoystickEnabled,
                        touchLookEnabled: state.touchLookEnabled,
                        isDevMode: state.isDevMode, 
                        controlScheme: state.controlScheme,
                        keyBindings: state.keyBindings, 
                        isPushToTalkEnabled: state.isPushToTalkEnabled,
                        isSettingsLoaded: state.isSettingsLoaded,
                        // Persist Progression
                        loadout: state.loadout,
                        playerUpgrades: state.playerUpgrades,
                        secretPoints: state.secretPoints,
                        secretKills: state.secretKills
                    }), false, 'resetGame'),

                    gameOver: (payload) => set({ gameState: GameState.GameOver, endGameMessage: payload, isHunting: false }, false, 'gameOver'),
                    
                    triggerSecretRound: () => set({
                        gameState: GameState.GameOver,
                        endGameMessage: "SECRET ROUND",
                        isHunting: false
                    }),

                    startSecretGame: () => {
                        const state = get();
                        const playerIcons = ['player_chase.png', 'player_chase2.png', 'player_chased.png'];
                        const ghostIcons = ['ghost_chase.png', 'ghost_chase2.png'];
                        
                        const newCarried: (Item | null)[] = [null, null, null, null, null];
                        const flamethrower = ITEM_TEMPLATES.find(i => i.id === ItemId.Flamethrower);
                        if (flamethrower) {
                            newCarried[0] = { ...flamethrower };
                        }
                        const smudgeTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.SmudgeSticks);
                        if (smudgeTemplate) {
                            newCarried[1] = { ...smudgeTemplate, currentUses: 1 };
                        }

                        const secretMap: MapData = {
                            id: 'secret_map',
                            name: 'Secret Round',
                            description: 'Survive.',
                            modelUrl: `${MODEL_ROOT}map/map.glb`
                        };
                        
                        const startHealth = 10;

                        const newState: Partial<AppState> = {
                            gameState: GameState.Loading,
                            isLoading: true,
                            isGameActive: false,
                            isSecretMode: true, 
                            isDevMode: false, 
                            selectedMap: secretMap,
                            selectedGhost: { name: "Horde", evidence: [], strength: "", weakness: "", description: "", canWander: true }, 
                            currentWeather: Weather.Calm,
                            carriedInventory: newCarried,
                            equippedItemIndex: 0,
                            truckInventory: [],
                            loadingPlayerIcon: getRandomElement(playerIcons),
                            loadingGhostIcon: getRandomElement(ghostIcons),
                            secretWave: 1,
                            secretPhase: 'warmup', 
                            secretPhaseTimer: 20, 
                            secretScore: 0,
                            // Keep accumulated points
                            // secretPoints: 0,  <-- REMOVED to persist currency
                            // secretKills: 0,   <-- REMOVED to persist kill count (career)
                            waveTotalEnemies: 20, 
                            waveEnemiesSpawned: 0,
                            waveEnemiesKilled: 0,
                            waveStartTime: performance.now(),
                            isFlamethrowerOn: false,
                            isFlamethrowerAltFire: false,
                            sanity: 100,
                            stamina: 100,
                            endGameMessage: null,
                            placedItems: [],
                            placedCameras: [],
                            activeEmfEvents: [],
                            mansionLayout: null,
                            currentRoomId: null,
                            secretPlayerHealth: startHealth,
                            secretRoundTimer: 0,
                            isSecretShopOpen: false,
                            ghostPendingAction: null,
                            paranormalEvent: null,
                            
                            // Reset upgrades for session? Or keep them? 
                            // Usually rogue-lites keep upgrades for the run.
                            // If we persist state, upgrades persist across browser refreshes until Death.
                            // If player dies, we should probably reset upgrades in gameOver or startSecretGame?
                            // For now, we persist them.
                        };
                        set(state => ({ ...state, ...newState, ...computeDerivedState({ ...state, ...newState }) }), false, 'startSecretGame');
                    },
                    
                    addSecretScore: (amount) => set(state => ({ 
                        secretScore: state.secretScore + amount,
                        secretPoints: state.secretPoints + amount 
                    })),
                    
                    enemyKilled: () => set(state => {
                        const newKills = state.secretKills + 1;
                        const newWaveKilled = state.waveEnemiesKilled + 1;
                        const points = state.secretPoints + 25; 
                        
                        let newState: Partial<AppState> = {
                            secretKills: newKills,
                            waveEnemiesKilled: newWaveKilled,
                            secretPoints: points,
                            secretScore: state.secretScore + 25
                        };
                        
                        if (newWaveKilled >= state.waveTotalEnemies) {
                            const durationSeconds = (performance.now() - state.waveStartTime) / 1000;
                            const timeBonus = Math.max(0, Math.floor((600 - durationSeconds) * 5));
                            
                            newState.secretPoints = points + timeBonus;
                            newState.secretPhase = 'intermission';
                            newState.secretPhaseTimer = 20;
                        }
                        
                        return newState;
                    }),
                    
                    purchaseUpgrade: (type) => set(state => {
                        const costs = {
                            health: 500,
                            firepower: 500,
                            chance: 1000
                        };
                        
                        const cost = costs[type];
                        if (state.secretPoints < cost) return state;
                        
                        const newUpgrades = { ...state.playerUpgrades };
                        let newPoints = state.secretPoints - cost;
                        let newHealth = state.secretPlayerHealth;
                        
                        if (type === 'health') {
                            newUpgrades.maxHealth += 2;
                            newHealth = newUpgrades.maxHealth; 
                        } else if (type === 'firepower') {
                            newUpgrades.damageMultiplier += 0.2;
                        } else if (type === 'chance') {
                            const roll = Math.random();
                            if (roll < 0.15) { // 15% Bad
                                const badRoll = Math.random();
                                if (badRoll < 0.33) newUpgrades.maxHealth = Math.max(1, newUpgrades.maxHealth - 2);
                                else if (badRoll < 0.66) newUpgrades.fireRateMultiplier *= 0.8; 
                                else newUpgrades.rangeMultiplier *= 0.7; 
                            } else { // 85% Good
                                const goodRoll = Math.random();
                                if (goodRoll < 0.2) newUpgrades.maxHealth += 5;
                                else if (goodRoll < 0.4) newUpgrades.fireRateMultiplier *= 1.5;
                                else if (goodRoll < 0.55) newUpgrades.hasShotgun = true;
                                else if (goodRoll < 0.7) newUpgrades.hasBouncingAmmo = true;
                                else if (goodRoll < 0.85) newUpgrades.hasExplosiveAmmo = true;
                                else newUpgrades.hasLaser = true;
                            }
                            
                            newHealth = Math.min(newHealth, newUpgrades.maxHealth);
                        }
                        
                        return {
                            secretPoints: newPoints,
                            playerUpgrades: newUpgrades,
                            secretPlayerHealth: newHealth
                        };
                    }),
                    
                    startNextWave: () => set(state => {
                        const nextWave = state.secretWave + 1;
                        
                        let totalEnemies = 20; 
                        if (nextWave === 2) totalEnemies = 40;
                        else if (nextWave >= 3) totalEnemies = 60 + (nextWave - 3) * 10;
                        
                        return {
                            secretWave: nextWave,
                            secretPhase: 'wave',
                            isSecretShopOpen: false,
                            waveTotalEnemies: totalEnemies,
                            waveEnemiesSpawned: 0,
                            waveEnemiesKilled: 0,
                            waveStartTime: performance.now(),
                            secretPlayerHealth: Math.min(state.playerUpgrades.maxHealth, state.secretPlayerHealth + 1)
                        };
                    }),
                    
                    toggleSecretShop: () => set(state => ({ isSecretShopOpen: !state.isSecretShopOpen })),
                    
                    teleportPlayerToTruck: () => set(state => {
                        const target = state.isSecretMode ? 'secret_spawn' : 'truck';
                        return { devTeleportTarget: target };
                    }),

                    loadSettings: () => set((state) => {
                        // Deprecated: persist middleware handles this automatically.
                        // Kept empty to satisfy interface.
                        return state;
                    }, false, 'loadSettings'),

                    addLoadoutItem: (itemTemplate) => set(state => {
                        const emptySlotIndex = state.loadout.findIndex(slot => slot === null);
                        if (emptySlotIndex === -1) return state; 
                    
                        const itemToAddId = itemTemplate.id;
                        const maxCount = itemTemplate.maxCount ?? 1;
                        const countInLoadout = state.loadout.filter(slot => slot?.id === itemToAddId).length;
                    
                        if (countInLoadout >= maxCount) return state; 
                    
                        const newLoadout = [...state.loadout];
                        const newItem: Item = { ...itemTemplate };
                        if (itemTemplate.uses) {
                            newItem.currentUses = itemTemplate.uses;
                        }
                        newLoadout[emptySlotIndex] = newItem;
                        return { loadout: newLoadout };
                    }),
                    
                    removeLoadoutItem: (index) => set(state => {
                        if (index >= 0 && index < state.loadout.length) {
                            const newLoadout = [...state.loadout];
                            newLoadout[index] = null;
                            const newState: Partial<AppState> = { loadout: newLoadout };
                            if (state.initialEquippedIndex === index) {
                                newState.initialEquippedIndex = null;
                            }
                            return newState;
                        }
                        return state;
                    }),

                    setInitialEquippedIndex: (index) => set({ initialEquippedIndex: index }),

                    switchItem: (index) => set(state => {
                        if (index === 4) return state;
                        const newIndex = state.equippedItemIndex === index ? null : index;
                        const newState: Partial<AppState> = {
                            equippedItemIndex: newIndex,
                            isDeploying: false,
                            isPlacingSalt: false,
                        };
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }, false, 'switchItem'),

                    placeItem: ({ itemId, position, rotation, isDrop, throwVelocity }) => set(state => {
                        const itemIndex = state.carriedInventory.findIndex((item, idx) => item?.id === itemId && idx !== 4);
                        if (itemIndex === -1) return state; 
                        const itemInInventory = state.carriedInventory[itemIndex]!;
                        
                        const newInstanceId = state.placedItemInstanceCounter + 1;
                        let newCarriedInventory = [...state.carriedInventory];
                         const basePlacedItem: PlacedItem = {
                            ...itemInInventory, position, rotation,
                            instanceId: newInstanceId, isPickable: true,
                            wasDropped: isDrop,
                            throwVelocity
                        };
                        if (itemInInventory.id === ItemId.VideoCamera) {
                            if (!isDrop && state.heldCameraState) {
                                basePlacedItem.isOn = state.heldCameraState.isOn;
                                basePlacedItem.isIR = state.heldCameraState.isIR;
                            } else {
                                basePlacedItem.isOn = false;
                                basePlacedItem.isIR = false;
                            }
                        } else if (itemInInventory.id === ItemId.DOTSProjector || itemInInventory.id === ItemId.Lantern) {
                            basePlacedItem.isOn = true; 
                        } else if (itemInInventory.id === ItemId.SpiritBox) {
                            basePlacedItem.isOn = state.isSpiritBoxOn;
                        } else if (itemInInventory.id === ItemId.EMFReader) {
                            basePlacedItem.isOn = state.isEmfReaderOn;
                        } else if (itemInInventory.id === ItemId.Flamethrower) {
                            basePlacedItem.isOn = state.isFlamethrowerOn;
                        }
                        
                        if (itemInInventory.id === ItemId.GhostWritingBook) {
                            basePlacedItem.modelUrl = `${MODEL_ROOT}items/book_open.glb`;
                        }

                        newCarriedInventory[itemIndex] = null;

                        const isEquippedAndUsed = state.equippedItemIndex === itemIndex;
                        let newEquippedIndex = state.equippedItemIndex;
                        if (isEquippedAndUsed) {
                            newEquippedIndex = getNextEquippedIndex(newCarriedInventory);
                        }

                        const newState: Partial<AppState> = {
                            placedItems: [...state.placedItems, basePlacedItem],
                            placedItemInstanceCounter: newInstanceId,
                            carriedInventory: newCarriedInventory,
                            equippedItemIndex: newEquippedIndex,
                        };

                        if (itemInInventory.id === ItemId.SpiritBox) {
                            newState.isSpiritBoxOn = false;
                        } else if (itemInInventory.id === ItemId.EMFReader) {
                            newState.isEmfReaderOn = false;
                        } else if (itemInInventory.id === ItemId.Flamethrower) {
                            newState.isFlamethrowerOn = false;
                            newState.isFlamethrowerAltFire = false;
                        }
                        
                        if (itemInInventory.id === ItemId.MusicBox && state.isMusicBoxPlaying) {
                            get().actions.startHunt(true);
                        }
                        
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }, false, { type: 'placeItem', itemId }),

                    pickUpItem: (instanceId) => set(state => {
                        const itemToPickUp = state.placedItems.find(p => p.instanceId === instanceId);
                        if (!itemToPickUp || itemToPickUp.isPickable === false) return state;

                        if (itemToPickUp.id === ItemId.Bone) {
                            const newState: Partial<AppState> = {
                                placedItems: state.placedItems.filter(p => p.instanceId !== instanceId),
                            };
                            return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                        }

                        const isHeadlamp = itemToPickUp.id === ItemId.Headlamp;
                        
                        if (!isHeadlamp && state.carriedInventory.slice(0, 3).filter(i => i).length >= 3) return state;
                        if (isHeadlamp && state.carriedInventory[4] !== null) return state; 

                        const inventoryItem: Item = { 
                            id: itemToPickUp.id, 
                            name: itemToPickUp.name, 
                            description: itemToPickUp.description, 
                            isMounted: itemToPickUp.isMounted,
                            uses: itemToPickUp.uses,
                            currentUses: itemToPickUp.currentUses,
                            maxCount: itemToPickUp.maxCount,
                            modelUrl: itemToPickUp.modelUrl,
                            meshName: itemToPickUp.meshName,
                            requiresLighter: itemToPickUp.requiresLighter,
                        };

                        if (inventoryItem.id === ItemId.GhostWritingBook) {
                            inventoryItem.modelUrl = `${MODEL_ROOT}items/book_closed.glb`;
                        }

                        const newInv = [...state.carriedInventory];
                        
                        if (isHeadlamp) {
                            newInv[4] = inventoryItem;
                        } else {
                            const emptySlotIndex = newInv.findIndex((slot, idx) => slot === null && idx < 3);
                            if (emptySlotIndex !== -1) newInv[emptySlotIndex] = inventoryItem;
                        }
                        
                        const newState: Partial<AppState> = {
                            carriedInventory: newInv,
                            placedItems: state.placedItems.filter(p => p.instanceId !== instanceId),
                        };
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }, false, { type: 'pickUpItem', instanceId }),

                    updatePlacedItem: (updatedItem) => set(state => {
                        const newState = { placedItems: state.placedItems.map(item => item.instanceId === updatedItem.instanceId ? updatedItem : item) };
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }, false, 'updatePlacedItem'),

                    useEquippedItem: () => set(state => {
                        if (state.equippedItemIndex === null || state.equippedItemIndex === 3) return state; 
                        
                        const item = state.carriedInventory[state.equippedItemIndex];
                        if (!item) return state;

                        let newCarriedInventory = [...state.carriedInventory];
                        let newEquippedIndex = state.equippedItemIndex;

                        switch(item.id) {
                            case ItemId.PhotoCamera: {
                                const updatedItem = { ...item };
                                if (typeof updatedItem.currentUses === 'number' && updatedItem.currentUses > 0) {
                                    updatedItem.currentUses -= 1;
                                    newCarriedInventory[state.equippedItemIndex] = updatedItem;
                                    const newState = { carriedInventory: newCarriedInventory };
                                    return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                                }
                                break;
                            }
                            case ItemId.SanityMeds: {
                                const newSanity = Math.min(100, state.sanity + SANITY.MEDS_RESTORE_AMOUNT);
                                newCarriedInventory[state.equippedItemIndex] = null;
                                newEquippedIndex = getNextEquippedIndex(newCarriedInventory);

                                const newState: Partial<AppState> = { 
                                    sanity: newSanity, 
                                    carriedInventory: newCarriedInventory,
                                    equippedItemIndex: newEquippedIndex
                                };
                                return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                            }
                        }
                        return state;
                    }),
                    useSaltCharge: (position, rotation) => set(state => {
                        const itemIndex = state.carriedInventory.findIndex(i => i?.id === ItemId.Salt);
                        if (itemIndex === -1) return state;
                    
                        const item = state.carriedInventory[itemIndex]!;
                        if ((item.currentUses !== undefined && item.currentUses <= 0)) return state;
                    
                        const newCarriedInventory = [...state.carriedInventory];
                        const updatedItem = { ...item, currentUses: (item.currentUses ?? item.uses ?? 3) - 1 };
                        newCarriedInventory[itemIndex] = updatedItem;
                    
                        const newInstanceId = state.placedItemInstanceCounter + 1;
                        const saltPile: PlacedItem = {
                            id: ItemId.Salt,
                            name: 'Salt Pile',
                            description: 'A pile of salt. Can reveal ghost footprints.',
                            instanceId: newInstanceId,
                            position,
                            rotation,
                            isPile: true,
                            isDisturbed: false,
                            isPickable: false,
                        };
                        
                        let newPlacedItems = [...state.placedItems, saltPile];
                        
                        let newEquippedIndex = state.equippedItemIndex;
                        if (updatedItem.currentUses <= 0) {
                            newCarriedInventory[itemIndex] = null;
                            if (state.equippedItemIndex === itemIndex) {
                                newEquippedIndex = getNextEquippedIndex(newCarriedInventory);
                            }
                        }
                    
                        const newState: Partial<AppState> = {
                            carriedInventory: newCarriedInventory,
                            placedItems: newPlacedItems,
                            placedItemInstanceCounter: newInstanceId,
                            equippedItemIndex: newEquippedIndex,
                        };
                    
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    useSmudgeSticks: () => set(state => {
                        let itemIndex = -1;
                        let itemToCheck: Item | null = null;

                        // [FIX] Secret Mode Logic: Search Inventory for Smudge Stick
                        if (state.isSecretMode) {
                            itemIndex = state.carriedInventory.findIndex(i => i?.id === ItemId.SmudgeSticks);
                            if (itemIndex !== -1) {
                                itemToCheck = state.carriedInventory[itemIndex];
                            }
                        } else {
                            // Standard Mode: Must be equipped
                            if (state.equippedItem?.id === ItemId.SmudgeSticks) {
                                itemToCheck = state.equippedItem;
                                itemIndex = state.equippedItemIndex!;
                            }
                        }

                        if (!itemToCheck) return state;
                        if (typeof itemToCheck.currentUses === 'number' && itemToCheck.currentUses <= 0) return state;
                    
                        let newCarriedInventory = [...state.carriedInventory];
                        
                        // Decrement use (in Secret mode this consumes 1 from stack)
                        const currentUses = itemToCheck.currentUses ?? 1;
                        const updatedItem = { ...itemToCheck, currentUses: Math.max(0, currentUses - 1) };
                        
                        if (state.isSecretMode) {
                            // Decrement immediately
                            newCarriedInventory[itemIndex] = updatedItem.currentUses > 0 ? updatedItem : null;
                            
                            let newEquippedIndex = state.equippedItemIndex;
                            
                            // Only unequip if we were holding the item that just disappeared
                            if (state.equippedItemIndex === itemIndex && newCarriedInventory[itemIndex] === null) {
                                newEquippedIndex = getNextEquippedIndex(newCarriedInventory);
                            }
                            
                            return { 
                                carriedInventory: newCarriedInventory, 
                                equippedItemIndex: newEquippedIndex,
                                smudgeTimer: 5, // 5 seconds of flee time
                                ...computeDerivedState({ ...state, carriedInventory: newCarriedInventory, equippedItemIndex: newEquippedIndex })
                            };
                        } 
                        
                        // STANDARD MODE Logic (Requires Handler to animate)
                        // We set uses to 0 to signal the Handler to start burning.
                        const standardUpdatedItem = { ...itemToCheck, currentUses: 0 };
                        newCarriedInventory[itemIndex] = standardUpdatedItem;
                    
                        const newState: Partial<AppState> = {
                            carriedInventory: newCarriedInventory,
                        };

                        const ghostPos = state.ghostWorldCoordinates;
                        const playerPos = state.playerCoordinates;
                        const SMUDGE_RANGE = 6 * WORLD_SCALE;
                        
                        let isNearGhost = false;
                        if (ghostPos && playerPos) {
                            const dist = Math.sqrt(Math.pow(ghostPos.x - playerPos.x, 2) + Math.pow(ghostPos.z - playerPos.z, 2));
                            if (dist <= SMUDGE_RANGE) {
                                isNearGhost = true;
                            }
                        }

                        if (isNearGhost) {
                            let preventionDuration = TIMERS.SMUDGE_PREVENTION_DURATION; 
                            if (state.selectedGhost?.name === 'Spirit') preventionDuration = 180;
                            if (state.selectedGhost?.name === 'Demon') preventionDuration = 60;

                            if (state.smudgeTimer <= 0) {
                                newState.smudgeTimer = preventionDuration;
                            }

                            if (state.selectedGhost?.name === 'Yurei') {
                                if (state.ghostCurrentRoomId !== state.ghostFavoriteRoomId) {
                                    newState.yureiTrappedTimer = 90;
                                    newState.teleportGhostTo = 'favorite_room';
                                } else {
                                    newState.yureiTrappedTimer = 60;
                                }
                            }

                            if (state.isHunting) {
                                let blindDuration = 6; 
                                if (state.selectedGhost?.name === 'Moroi') blindDuration = 12; 
                                newState.ghostBlindedTimer = blindDuration;
                            }
                        }
                        
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    addSecretSmudge: () => set(state => {
                        // [FIX] Add or Increment Smudge Stick in Inventory (Max 3)
                        const smudgeTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.SmudgeSticks);
                        if (!smudgeTemplate) return state;

                        const newCarried = [...state.carriedInventory];
                        
                        // Check for existing smudge
                        const existingIndex = newCarried.findIndex(i => i?.id === ItemId.SmudgeSticks);
                        
                        if (existingIndex !== -1) {
                            const item = newCarried[existingIndex]!;
                            const current = item.currentUses || 0;
                            if (current < 3) {
                                newCarried[existingIndex] = { ...item, currentUses: current + 1 };
                            }
                        } else {
                            // Find empty slot
                            const emptyIndex = newCarried.findIndex((item, idx) => item === null && idx < 3);
                            if (emptyIndex !== -1) {
                                newCarried[emptyIndex] = { ...smudgeTemplate, currentUses: 1 };
                            }
                        }
                        
                        return { 
                            carriedInventory: newCarried,
                            ...computeDerivedState({ ...state, carriedInventory: newCarried })
                        };
                    }),
                    blindGhost: () => set(state => {
                        const blindDuration = state.selectedGhost?.name === 'Moroi' ? 7 : 5;
                        return { ghostBlindedTimer: blindDuration };
                    }),
                    removeUsedSmudgeStick: () => set(state => {
                        const newCarriedInventory = [...state.carriedInventory];
                        let inventoryChanged = false;
                        let newEquippedIndex = state.equippedItemIndex;

                        for (let i = 0; i < 3; i++) { 
                            const item = newCarriedInventory[i];
                            if (item && item.id === ItemId.SmudgeSticks && item.currentUses !== undefined && item.currentUses <= 0) {
                                newCarriedInventory[i] = null;
                                inventoryChanged = true;
                                
                                if (state.equippedItemIndex === i) {
                                    newEquippedIndex = getNextEquippedIndex(newCarriedInventory);
                                }
                            }
                        }

                        if (!inventoryChanged) return state;

                        const newState: Partial<AppState> = {
                            carriedInventory: newCarriedInventory,
                            equippedItemIndex: newEquippedIndex
                        };
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    extinguishFlame: () => set(state => {
                        if (state.selectedGhost?.name === 'Onryo') {
                            return { onryoExtinguishedFlames: state.onryoExtinguishedFlames + 1 };
                        }
                        return state;
                    }),
                    mountCamera: (tripodInstanceId) => set(state => {
                        const tripod = state.placedItems.find(p => p.instanceId === tripodInstanceId);
                        const cameraIndex = state.carriedInventory.findIndex(i => i?.id === ItemId.VideoCamera);
                        const camera = cameraIndex !== -1 ? state.carriedInventory[cameraIndex] : null;
                        const cameraTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.VideoCamera);
                    
                        if (!tripod || !camera || !cameraTemplate) return state;
                    
                        const mountedCamera: PlacedItem = {
                            ...cameraTemplate, 
                            instanceId: tripod.instanceId, 
                            position: tripod.position,
                            rotation: tripod.rotation,
                            isMountedOnTripod: true,
                            modelUrl: VIDEO_TRIPOD_URL,
                            name: "Mounted Video Camera",
                            isOn: false,
                            isIR: false,
                            isPickable: true,
                        };
                    
                        const newPlacedItems = state.placedItems.map(p => p.instanceId === tripodInstanceId ? mountedCamera : p);
                        const newCarried = [...state.carriedInventory];
                        newCarried[cameraIndex] = null;
                    
                        const newState: Partial<AppState> = {
                            placedItems: newPlacedItems,
                            carriedInventory: newCarried,
                            equippedItemIndex: state.equippedItemIndex === cameraIndex 
                                ? getNextEquippedIndex(newCarried) 
                                : state.equippedItemIndex,
                        };
                    
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    detachCamera: (cameraInstanceId) => set(state => {
                        const mountedCamera = state.placedItems.find(p => p.instanceId === cameraInstanceId);
                        if (!mountedCamera || !mountedCamera.isMountedOnTripod) return state;

                        if (state.carriedInventory.slice(0, 3).filter(i => i).length >= 3) return state; 

                        const tripodTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.Tripod);
                        const cameraTemplate = ITEM_TEMPLATES.find(i => i.id === ItemId.VideoCamera);
                        if (!tripodTemplate || !cameraTemplate) return state;

                        const newTripod: PlacedItem = {
                            ...tripodTemplate,
                            instanceId: mountedCamera.instanceId,
                            position: mountedCamera.position,
                            rotation: mountedCamera.rotation,
                            isPickable: true,
                        };

                        const newCamera: Item = {
                            ...cameraTemplate,
                            currentUses: cameraTemplate.uses,
                        };
                        
                        const newPlacedItems = state.placedItems.map(p => p.instanceId === cameraInstanceId ? newTripod : p);
                        
                        const newCarried = [...state.carriedInventory];
                        const emptySlot = newCarried.findIndex((i, idx) => i === null && idx < 3);
                        newCarried[emptySlot] = newCamera;

                        const newState: Partial<AppState> = {
                            placedItems: newPlacedItems,
                            carriedInventory: newCarried,
                        };

                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    swapInventoryItem: ({ item, from, index }) => set(state => {
                        const newCarried = [...state.carriedInventory];
                        const newTruck = [...state.truckInventory];
                    
                        if (from === 'truck') {
                            const isHeadlamp = item.id === ItemId.Headlamp;
                            const isLighter = item.id === ItemId.Lighter;
                            
                            let targetSlot = -1;
                            if (isHeadlamp) {
                                targetSlot = newCarried[4] === null ? 4 : -1;
                            } else if (isLighter) {
                                targetSlot = newCarried[3] === null ? 3 : -1;
                            } else {
                                targetSlot = newCarried.findIndex((slot, idx) => slot === null && idx < 3);
                            }

                            if (targetSlot !== -1) {
                                const itemToMove = newTruck[index];
                                if (!itemToMove || itemToMove.id !== item.id) return state;
                                newCarried[targetSlot] = itemToMove;
                                newTruck.splice(index, 1); 
                            } else {
                                return state; 
                            }
                        } else { 
                            const itemToMove = newCarried[index];
                            if (!itemToMove || itemToMove.id !== item.id) return state;
                            newTruck.push(itemToMove); 
                            newCarried[index] = null; 
                        }
                    
                        const newState: Partial<AppState> = {
                            carriedInventory: newCarried,
                            truckInventory: newTruck
                        };
                    
                        return { ...newState, ...computeDerivedState({ ...state, ...newState }) };
                    }),
                    
                    toggleMicrophone: () => set(state => ({ isMicrophoneEnabled: !state.isMicrophoneEnabled })),
                    togglePushToTalkMode: () => set(state => ({ isPushToTalkEnabled: !state.isPushToTalkEnabled })),
                    toggleVanUI: () => set(state => ({ isVanUIOpen: !state.isVanUIOpen })),
                    setActiveCameraIndex: (index) => set({ activeCameraIndex: index }),
                    toggleFlashlight: () => set(state => ({ isFlashlightOn: !state.isFlashlightOn })),
                    toggleHeadlamp: () => set(state => ({ isHeadlampOn: !state.isHeadlampOn })),
                    toggleUvLight: () => set(state => ({ isUvLightOn: !state.isUvLightOn })),
                    toggleCrouch: () => set(state => ({ isCrouching: !state.isCrouching })),
                    toggleFurnitureEditMode: () => set(state => ({ isEditingFurniture: !state.isEditingFurniture })),
                    setGhostPath: (path) => set({ ghostPath: path }),
                    ghostArrived: () => set({ ghostPath: null, isGhostIdle: true }),
                    playerInteractPhonograph: () => {
                        const { isPhonographOn } = get();
                        if (isPhonographOn) {
                            set({ isPhonographOn: false, phonographPlayingSong: null });
                        } else {
                            // [FIX] REMOVED 'radio' FROM PLAYLIST TO PREVENT GHOST EVENT CONFUSION
                            const songs: any[] = ['mimic', 'let_it_run', 'beatbox', 'jam', 'untitled'];
                            const randomSong = songs[Math.floor(Math.random() * songs.length)];
                            set({ isPhonographOn: true, phonographPlayingSong: randomSong });
                        }
                    },
                    toggleDevMode: () => set(state => {
                        const isDev = !state.isDevMode;
                        return { 
                            isDevMode: isDev, 
                            carriedInventory: isDev ? state.carriedInventory : state.carriedInventory.map(i => i?.id === ItemId.Flamethrower ? null : i),
                            isFlamethrowerOn: false,
                            isFlamethrowerAltFire: false
                        };
                    }),
                    addDevPin: (pinData) => set(state => ({ 
                        devPins: [...state.devPins, { id: state.devPinCounter + 1, label: pinData.label, type: 'points', points: pinData.points }],
                        devPinCounter: state.devPinCounter + 1
                    })),
                    addSquarePin: (position) => set(state => ({
                        devPins: [...state.devPins, { id: state.devPinCounter + 1, label: `Square ${state.devPinCounter + 1}`, type: 'square', position, size: { width: 1, depth: 1 } }],
                        devPinCounter: state.devPinCounter + 1
                    })),
                    updateDevPin: (pin) => set(state => ({
                        devPins: state.devPins.map(p => p.id === pin.id ? pin : p)
                    })),
                    removeDevPin: (id) => set(state => ({
                        devPins: state.devPins.filter(p => p.id !== id)
                    })),
                    clearDevPins: () => set({ devPins: [] }),
                    setFriendlyGhost: (isFriendly) => set({ isGhostFriendly: isFriendly }),
                    teleportToGhost: () => set({ devTeleportTarget: 'player_to_ghost' }),
                    teleportGhostToPlayer: () => set({ devTeleportTarget: 'ghost_to_player' }),
                    setGhostModel: (modelName) => set({ devGhostModelChange: modelName }),
                    setDevPlacementMode: (mode) => set({ devPlacementMode: mode }),
                    toggleDevFlyMode: () => set(state => ({ devFlyMode: !state.devFlyMode })),
                    toggleDevRoof: () => set(state => ({ devRoofHidden: !state.devRoofHidden })),
                    toggleFlamethrower: () => set(state => ({ isFlamethrowerOn: !state.isFlamethrowerOn })),
                    setFlamethrowerAltFire: (isOn) => set({ isFlamethrowerAltFire: isOn }),
                    giveDevFlamethrower: () => set(state => {
                        const flamethrower = ITEM_TEMPLATES.find(i => i.id === ItemId.Flamethrower);
                        if (!flamethrower) return state;

                        const newCarried = [...state.carriedInventory];
                        let slot = newCarried.findIndex((item, idx) => item === null && idx < 3);
                        if (slot === -1) slot = 0; 

                        newCarried[slot] = { ...flamethrower };
                        return { carriedInventory: newCarried, equippedItemIndex: slot };
                    }),
                    
                    toggleBreaker: () => set(state => ({ isBreakerOn: !state.isBreakerOn })),
                    toggleLight: (roomId) => set(state => {
                        const current = state.lightStates[roomId] || false;
                        return { lightStates: { ...state.lightStates, [roomId]: !current } };
                    }),
                    disableLight: (roomId) => set(state => {
                        const newDisabled = new Set(state.disabledLights);
                        newDisabled.add(roomId);
                        return { disabledLights: newDisabled };
                    }),
                    toggleSelectedEvidence: (evidence) => set(state => {
                        const newSelected = new Set(state.selectedEvidence);
                        if (newSelected.has(evidence)) newSelected.delete(evidence);
                        else newSelected.add(evidence);
                        return { selectedEvidence: newSelected };
                    }),
                    setSelectedGhostGuess: (ghostName) => set({ selectedGhostGuess: ghostName }),
                    submitGuess: () => {
                        const state = get();
                        if (!state.selectedGhostGuess) return;
                        const isCorrect = state.selectedGhostGuess === state.selectedGhost?.name;
                        const msg = isCorrect ? `SUCCESS. You identified the ${state.selectedGhost?.name}.` : `FAILED. It was a ${state.selectedGhost?.name}.`;
                        get().actions.gameOver(msg);
                    },
                    triggerEmfEvent: ({ position, level }) => set(state => {
                        const newEvent: EmfEvent = { id: Math.random(), position, level, startTime: performance.now() };
                        return { activeEmfEvents: [...state.activeEmfEvents, newEvent], emfEventCounter: state.emfEventCounter + 1 };
                    }),
                    updateTouchState: (payload) => set(state => ({ touchState: { ...state.touchState, ...payload } })),
                    togglePause: () => set(state => ({ isPaused: !state.isPaused })),
                    setVolume: (type, volume) => {
                        if (type === 'ambient') set({ ambientVolume: volume });
                        if (type === 'sfx') set({ sfxVolume: volume });
                    },
                    setSensitivity: (type, value) => {
                        if (type === 'mouse') set({ mouseSensitivity: value });
                        if (type === 'touch') set({ touchSensitivity: value });
                    },
                    setGraphicsQuality: (quality) => set({ graphicsQuality: quality }),
                    setControlScheme: (scheme) => set(state => {
                        let newBindings = state.keyBindings;
                        if (scheme === 'WASD') newBindings = DEFAULT_KEY_BINDINGS_WASD;
                        if (scheme === 'ARROWS') newBindings = DEFAULT_KEY_BINDINGS_ARROWS;
                        return { controlScheme: scheme, keyBindings: newBindings };
                    }),
                    setKeyBinding: (action, key) => set(state => ({
                        controlScheme: 'CUSTOM',
                        keyBindings: { ...state.keyBindings, [action]: key }
                    })),
                    resetKeyBindings: () => set({
                        controlScheme: 'WASD',
                        keyBindings: DEFAULT_KEY_BINDINGS_WASD
                    }),
                    
                    startHunt: (isCursed) => {
                        const state = get();
                        if (!isCursed && (state.setupPhaseTimer > 0 || state.huntCooldownTimer > 0)) return;
                        // [FIX] Initialize hunt timer (e.g. 25s for now)
                        set({ isHunting: true, huntTimer: 25, isGhostIdle: false, ghostAiState: 'stalking_to_player' });
                    },
                    attemptHunt: () => {
                        const state = get();
                        if (state.setupPhaseTimer > 0 || state.huntCooldownTimer > 0) return;
                        // [FIX] Initialize hunt timer
                        set({ isHunting: true, huntTimer: 25, isGhostIdle: false, ghostAiState: 'stalking_to_player' });
                    },
                    endHunt: () => set({ isHunting: false, huntCooldownTimer: TIMERS.HUNT_COOLDOWN_DURATION, isGhostIdle: true, ghostAiState: 'wandering' }),
                    incrementHuntFlicker: () => set(state => ({ huntFlickerCount: state.huntFlickerCount + 1 })),
                    preventHuntWithCrucifix: (instanceId) => {
                        set({ huntCooldownTimer: 5 }); 
                        const state = get();
                        const item = state.placedItems.find(p => p.instanceId === instanceId);
                        if (item) {
                            const newUses = (item.currentUses ?? item.uses ?? 2) - 1;
                            const updatedItem = { ...item, currentUses: newUses };
                            state.actions.updatePlacedItem(updatedItem);
                        }
                    },
                    tickSecond: () => set(state => {
                        const updates: Partial<AppState> = {};
                        if (state.setupPhaseTimer > 0) updates.setupPhaseTimer = state.setupPhaseTimer - 1;
                        if (state.huntCooldownTimer > 0) updates.huntCooldownTimer = state.huntCooldownTimer - 1;
                        if (state.smudgeTimer > 0) updates.smudgeTimer = state.smudgeTimer - 1;
                        if (state.ghostBlindedTimer > 0) updates.ghostBlindedTimer = state.ghostBlindedTimer - 1;
                        if (state.yureiTrappedTimer > 0) updates.yureiTrappedTimer = state.yureiTrappedTimer - 1;
                        
                        // [FIX] Decrement Hunt Timer and Auto-End Hunt
                        if (state.huntTimer > 0) {
                            updates.huntTimer = state.huntTimer - 1;
                        } else if (state.isHunting && state.huntTimer <= 0) {
                            // End hunt if timer runs out
                            // Note: We can't call get().actions.endHunt() directly inside set updater if it depends on current state safely,
                            // but accessing actions via closure is fine.
                            get().actions.endHunt();
                        }
                        
                        if (state.isSecretMode) {
                            updates.secretRoundTimer = state.secretRoundTimer + 1;
                            
                            // Handle Secret Phase Timers
                            if (state.secretPhaseTimer > 0) {
                                updates.secretPhaseTimer = state.secretPhaseTimer - 1;
                            }
                            
                            // Phase Transitions
                            if (state.secretPhaseTimer <= 0) {
                                if (state.secretPhase === 'warmup') {
                                    updates.secretPhase = 'wave';
                                    updates.secretPhaseTimer = 0;
                                } else if (state.secretPhase === 'intermission') {
                                    get().actions.startNextWave(); 
                                }
                            }
                        }
                        
                        return updates;
                    }),
                },
            }),
            {
                name: 'phasmaphoney-storage', // Key in localStorage
                storage: createJSONStorage(() => localStorage), // Explicitly use localStorage
                // Only persist specific fields to avoid saving game state (e.g. active hunt)
                partialize: (state) => ({
                    // Settings
                    ambientVolume: state.ambientVolume,
                    sfxVolume: state.sfxVolume,
                    mouseSensitivity: state.mouseSensitivity,
                    touchSensitivity: state.touchSensitivity,
                    graphicsQuality: state.graphicsQuality,
                    isMicrophoneEnabled: state.isMicrophoneEnabled,
                    isPushToTalkEnabled: state.isPushToTalkEnabled,
                    controlScheme: state.controlScheme,
                    keyBindings: state.keyBindings,
                    touchControlsEnabled: state.touchControlsEnabled,
                    touchJoystickEnabled: state.touchJoystickEnabled,
                    touchLookEnabled: state.touchLookEnabled,
                    isDevMode: state.isDevMode,
                    
                    // Player Progression (Secret Mode)
                    secretPoints: state.secretPoints,
                    secretKills: state.secretKills,
                    playerUpgrades: state.playerUpgrades,
                    
                    // Loadout
                    loadout: state.loadout,
                }),
            }
        )
    )
);
