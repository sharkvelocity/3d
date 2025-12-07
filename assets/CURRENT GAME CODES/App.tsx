
import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { GameState, AppState, AppActions } from './types';
import { GHOSTS } from './data/ghosts';
import { MAPS } from './data/maps';
import { ITEMS } from './data/items';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import MainMenu from './components/MainMenu';
import LoadingScreen from './components/LoadingScreen';
import VanUI from './components/VanUI';
import { useGameLogic } from './components/hooks/useGameLogic';
import SecretShopUI from './components/SecretShopUI';

const PauseMenu = ({ actions, ...state }: AppState & { actions: AppActions }) => {
    const { ambientVolume, sfxVolume, isMicrophoneEnabled, mouseSensitivity, touchSensitivity, isMobile, touchControlsEnabled, touchJoystickEnabled, touchLookEnabled, graphicsQuality, isDevMode, isSecretMode } = state;
    const [view, setView] = useState('main');

    const handleReturnToMenu = () => {
        actions.resetGame();
    };
    
    const handleClearCache = async () => {
        if (confirm("HARD RESET?\nThis will wipe all settings, progress, and force a complete reload. Use if assets are broken.")) {
            try {
                console.log("[Maintenance] Clearing data...");
                localStorage.clear();
                sessionStorage.clear();
                
                if ('caches' in window) {
                    try {
                        const keys = await caches.keys();
                        await Promise.all(keys.map(key => caches.delete(key)));
                        console.log("[Maintenance] Cache cleared.");
                    } catch(e) { console.error(e); }
                }
                
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                        await registration.unregister();
                    }
                }
            } catch(e) {
                console.error("Reset error:", e);
                alert("Error during reset. Forcing reload anyway.");
            } finally {
                window.location.reload();
            }
        }
    };
    
    const SettingsSelect = ({ label, value, options, onChange, description }: { label: string, value: string | number | boolean, options: { label: string, value: string | number | boolean }[], onChange: (val: string) => void, description?: string }) => (
        <div className="flex flex-col gap-1 w-full mb-4">
            <label className="text-cyan-300 text-base font-bold tracking-wider">{label}</label>
            <div className="relative">
                <select
                    value={String(value)}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-black/60 border border-cyan-700 text-cyan-100 p-2 rounded-none focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all appearance-none font-mono text-base md:text-lg cursor-pointer"
                >
                    {options.map(opt => (
                        <option key={String(opt.value)} value={String(opt.value)} className="bg-gray-900 text-white">
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-cyan-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>
            {description && <p className="text-xs text-gray-500 mt-1 italic">{description}</p>}
        </div>
    );

    const SettingsSlider = ({ label, value, min, max, step, onChange, displayFormat }: { label: string, value: number, min: number, max: number, step: number, onChange: (val: number) => void, displayFormat?: (val: number) => string }) => (
        <div className="flex flex-col gap-1 w-full mb-4">
            <div className="flex justify-between items-end">
                <label className="text-cyan-300 text-base font-bold tracking-wider">{label}</label>
                <span className="text-cyan-500 text-sm font-mono">{displayFormat ? displayFormat(value) : value}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value))} 
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" 
            />
        </div>
    );

    const SettingsView = () => (
        <div className="w-full max-w-5xl h-full md:h-[80vh] flex flex-col">
            <h2 className="text-2xl md:text-4xl text-center text-cyan-300 mb-4 md:mb-6 text-shadow-cyan tracking-[0.2em] uppercase bg-black/40 py-2 border-y border-cyan-900 shrink-0">System Configuration</h2>
            
            <div className="w-full bg-black/80 border border-cyan-500/30 p-4 md:p-8 rounded-sm shadow-[0_0_30px_rgba(0,0,0,0.8)] flex-grow overflow-y-auto custom-scrollbar min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6 md:gap-y-8">
                    {/* --- LEFT COLUMN: VISUALS & AUDIO --- */}
                    <div className="flex flex-col gap-6">
                        <div className="border-l-2 border-cyan-800 pl-4">
                            <h3 className="text-xl md:text-2xl text-white mb-4 font-light tracking-widest">DISPLAY & AUDIO</h3>
                            
                            <SettingsSelect 
                                label="GRAPHICS QUALITY"
                                value={graphicsQuality}
                                onChange={(val) => actions.setGraphicsQuality(val as any)}
                                options={[
                                    { label: 'Low (Performance)', value: 'Low' },
                                    { label: 'Medium (Balanced)', value: 'Medium' },
                                    { label: 'High (Visuals)', value: 'High' }
                                ]}
                                description="Adjust texture resolution and effects. Requires restart to fully apply."
                            />

                            <SettingsSlider 
                                label="AMBIENT VOLUME"
                                value={ambientVolume}
                                min={0} max={1} step={0.01}
                                onChange={(val) => actions.setVolume('ambient', val)}
                                displayFormat={(val) => `${Math.round(val * 100)}%`}
                            />

                            <SettingsSlider 
                                label="SFX VOLUME"
                                value={sfxVolume}
                                min={0} max={1} step={0.01}
                                onChange={(val) => actions.setVolume('sfx', val)}
                                displayFormat={(val) => `${Math.round(val * 100)}%`}
                            />

                            <SettingsSelect 
                                label="MICROPHONE ACCESS"
                                value={isMicrophoneEnabled}
                                onChange={() => actions.toggleMicrophone()}
                                options={[
                                    { label: 'Enabled', value: true },
                                    { label: 'Disabled', value: false }
                                ]}
                                description="Allows voice recognition for Spirit Box interactions."
                            />
                        </div>
                    </div>

                    {/* --- RIGHT COLUMN: INPUT & CONTROLS --- */}
                    <div className="flex flex-col gap-6">
                        <div className="border-l-2 border-cyan-800 pl-4">
                            <h3 className="text-xl md:text-2xl text-white mb-4 font-light tracking-widest">CONTROLS</h3>

                            <SettingsSelect 
                                label="INPUT METHOD"
                                value={touchControlsEnabled}
                                onChange={(val) => actions.updateState({ touchControlsEnabled: val === 'true' })}
                                options={[
                                    { label: 'Mouse & Keyboard', value: false },
                                    { label: 'Touchscreen', value: true }
                                ]}
                            />

                            {!touchControlsEnabled ? (
                                <SettingsSlider 
                                    label="MOUSE SENSITIVITY"
                                    value={mouseSensitivity}
                                    min={0.1} max={3.0} step={0.1}
                                    onChange={(val) => actions.setSensitivity('mouse', val)}
                                    displayFormat={(val) => val.toFixed(1)}
                                />
                            ) : (
                                <div className="bg-cyan-900/20 p-4 rounded border border-cyan-900/50 space-y-4 animate-fadeIn">
                                    <SettingsSlider 
                                        label="TOUCH SENSITIVITY"
                                        value={touchSensitivity}
                                        min={0.1} max={3.0} step={0.1}
                                        onChange={(val) => actions.setSensitivity('touch', val)}
                                        displayFormat={(val) => val.toFixed(1)}
                                    />
                                    
                                    <SettingsSelect 
                                        label="VIRTUAL JOYSTICK"
                                        value={touchJoystickEnabled}
                                        onChange={(val) => actions.updateState({ touchJoystickEnabled: val === 'true' })}
                                        options={[
                                            { label: 'Enabled', value: true },
                                            { label: 'Disabled', value: false }
                                        ]}
                                    />

                                    <SettingsSelect 
                                        label="TOUCH LOOK"
                                        value={touchLookEnabled}
                                        onChange={(val) => actions.updateState({ touchLookEnabled: val === 'true' })}
                                        options={[
                                            { label: 'Enabled', value: true },
                                            { label: 'Disabled', value: false }
                                        ]}
                                    />
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-cyan-800">
                                <label className="text-red-400 text-base font-bold tracking-wider">MAINTENANCE</label>
                                <button 
                                    onClick={handleClearCache}
                                    className="mt-2 w-full bg-red-900/40 hover:bg-red-800/60 border border-red-500/50 text-red-200 py-2 font-bold tracking-widest transition-all pointer-events-auto"
                                >
                                    CLEAR CACHE & RELOAD
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex justify-center shrink-0">
                <button onClick={() => setView('main')} className="terminal-button-secondary py-2 px-8 w-full max-w-sm text-lg md:text-xl bg-black/80 hover:bg-cyan-900/50 border-cyan-700 text-cyan-400">{'< RETURN'}</button>
            </div>
        </div>
    );
    
    const ControlsView = () => (
        <div className="flex flex-col text-left w-full max-w-lg">
             <h2 className="text-3xl text-cyan-300 mb-6 text-shadow-cyan">Controls</h2>
             <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-lg">
                <div className="font-bold text-right text-cyan-300">W, A, S, D</div>
                <div className="text-left">Move</div>

                <div className="font-bold text-right text-cyan-300">Mouse</div>
                <div className="text-left">Look Around</div>

                <div className="font-bold text-right text-cyan-300">Shift</div>
                <div className="text-left">Sprint</div>

                <div className="font-bold text-right text-cyan-300">C</div>
                <div className="text-left">Crouch</div>

                <div className="font-bold text-right text-cyan-300">E</div>
                <div className="text-left">Interact / Pick Up</div>

                <div className="font-bold text-right text-cyan-300">G</div>
                <div className="text-left">Drop Item</div>

                <div className="font-bold text-right text-cyan-300">L</div>
                <div className="text-left">Toggle Lighter</div>

                <div className="font-bold text-right text-cyan-300">T</div>
                <div className="text-left">Flashlight / Camera IR</div>

                <div className="font-bold text-right text-cyan-300">F</div>
                <div className="text-left">Use or Toggle Item</div>

                <div className="font-bold text-right text-cyan-300">Right Click</div>
                <div className="text-left">Place Item</div>
                
                <div className="font-bold text-right text-cyan-300">Right Click (Hold)</div>
                <div className="text-left">Rotate Item</div>

                <div className="font-bold text-right text-cyan-300">J</div>
                <div className="text-left">Journal</div>

                <div className="font-bold text-right text-cyan-300">I</div>
                <div className="text-left">Van Inventory</div>

                <div className="font-bold text-right text-cyan-300">Arrow Keys</div>
                <div className="text-left">Cycle Cameras (in Van)</div>
            </div>
             <button onClick={() => setView('main')} className="terminal-button-secondary mt-8 py-2 px-4 w-full">{'< Back'}</button>
        </div>
    );

    const MainView = () => {
        const handleRefreshGraphics = () => {
            window.dispatchEvent(new CustomEvent('refreshGraphics'));
        };

        const handleDownloadMap = () => {
            window.dispatchEvent(new CustomEvent('downloadMapGLB'));
        };

        const handleResume = () => {
            actions.togglePause();
            window.dispatchEvent(new CustomEvent('request_lock_pointer'));
        };

        return (
            <div className="flex flex-col gap-4 w-full max-w-xs">
                <button onClick={handleResume} className="terminal-button py-2 px-4 text-2xl">Resume</button>
                <button onClick={() => setView('settings')} className="terminal-button py-2 px-4 text-2xl">Settings</button>
                <button onClick={() => setView('controls')} className="terminal-button py-2 px-4 text-2xl">Controls</button>
                <button onClick={handleRefreshGraphics} className="terminal-button py-2 px-4 text-2xl">Refresh Graphics</button>
                <button onClick={() => window.dispatchEvent(new CustomEvent('player-stuck'))} className="terminal-button deploy py-2 px-4 text-2xl text-red-400 border-red-500/50">I'm Stuck!</button>
                {!isSecretMode && (
                    <button onClick={handleDownloadMap} className="terminal-button py-2 px-4 text-2xl">Download Map (.glb)</button>
                )}
                <button onClick={() => actions.toggleDevMode()} className="terminal-button py-2 px-4 text-2xl mt-4">
                    {isDevMode ? 'Exit Dev Mode' : 'Enter Dev Mode'}
                </button>
                <button onClick={handleReturnToMenu} className="terminal-button deploy py-2 px-4 text-2xl mt-4">Return to Menu</button>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 bg-black/80 z-30 flex flex-col justify-center items-center backdrop-blur-sm p-4 pointer-events-auto">
            {view === 'main' && <MainView />}
            {view === 'settings' && <SettingsView />}
            {view === 'controls' && <ControlsView />}
        </div>
    );
}


const App = () => {
    useGameLogic();

    const state = useStore();
    const actions = useStore(s => s.actions);
    const { gameState, isGameActive, isPaused, isVanUIOpen, isDevMode, endGameMessage, isSettingsLoaded, isSecretShopOpen } = state;

    useEffect(() => {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    
        actions.loadSettings();
        
        const savedSettingsRaw = localStorage.getItem('phasmaphoney_settings');
        const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : {};
    
        // [FIX] Ensure isSettingsLoaded is set to TRUE after we determine the device type
        const defaultsToSet: Partial<AppState> = { isMobile: isMobileDevice, isSettingsLoaded: true };
        
        if (isMobileDevice) {
            defaultsToSet.graphicsQuality = 'Low';
            if (savedSettings.touchControlsEnabled === undefined) defaultsToSet.touchControlsEnabled = true;
            if (savedSettings.touchJoystickEnabled === undefined) defaultsToSet.touchJoystickEnabled = true;
            if (savedSettings.touchLookEnabled === undefined) defaultsToSet.touchLookEnabled = true;
        }
        actions.updateState(defaultsToSet);

    }, [actions]);
    
    // Explicitly handle pointer unlock on pause
    useEffect(() => {
        if (isPaused) {
            const doc = document as any;
            if (doc.exitPointerLock) {
                doc.exitPointerLock();
            } else if (doc.mozExitPointerLock) {
                doc.mozExitPointerLock();
            } else if (doc.webkitExitPointerLock) {
                doc.webkitExitPointerLock();
            }
        }
    }, [isPaused]);
    
    useEffect(() => {
        const handleStuck = () => {
            actions.teleportPlayerToTruck();
        };
        window.addEventListener('player-stuck', handleStuck);
        return () => window.removeEventListener('player-stuck', handleStuck);
    }, [actions]);

    useEffect(() => {
        if (endGameMessage) {
            const timer = setTimeout(() => {
                if (endGameMessage === "SECRET ROUND") {
                    actions.startSecretGame();
                } else {
                    actions.resetGame();
                }
            }, 3000); 

            return () => clearTimeout(timer);
        }
    }, [endGameMessage, actions]);

    const handleTransitionComplete = () => {
        actions.updateState({ isLoading: false, isGameActive: true });
        actions.setGameState(GameState.Playing);
        if (!state.isSecretMode) {
            actions.toggleVanUI();
        }
    };
    
    const handleUnlockAudio = () => {
        if (!state.isAudioUnlocked) {
            actions.updateState({ isMuted: false, isAudioUnlocked: true });
        }
    };

    const EndGameScreen = () => (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center z-40">
            <h2 className="text-6xl font-bold text-red-500 text-center max-w-3xl animate-pulse tracking-widest">{state.endGameMessage}</h2>
            <p className="mt-4 text-xl text-gray-400">{state.endGameMessage === "SECRET ROUND" ? "Prepare yourself..." : "Returning to main menu..."}</p>
        </div>
    );

    const gameCanvasProps = {
        ...state,
        actions,
        onSetGameState: actions.setGameState,
        onLoadingUpdate: (progress: number, message: string) => actions.updateState({ loadingProgress: { progress, message } }),
        onPlayerPositionUpdate: (coords: any) => actions.updateState({ playerCoordinates: coords }),
        onPlayerStatusUpdate: (status: any) => actions.updateState({ playerStatus: status }),
        onEmfUpdate: (level: number) => actions.updateState({ emfLevel: level }),
        onParabolicUpdate: (reading: number) => actions.updateState({ parabolicReading: reading }),
        onInteractableFocusChange: (focus: any) => actions.updateState({ interactableFocus: focus }),
        onRoomChange: (roomId: number | null) => actions.updateState({ currentRoomId: roomId }),
        onLighterStateChange: (isOn: boolean) => actions.updateState({ isLighterOn: isOn }),
        onSpiritBoxToggle: () => actions.updateState({ isSpiritBoxOn: !state.isSpiritBoxOn }),
        onToggleMute: () => actions.updateState({ isMuted: !state.isMuted }),
        onTransitionComplete: handleTransitionComplete,
        onGuessMade: (message: string) => actions.gameOver(message),
        onUpdateHeldCameraState: (cameraState: any) => actions.updateState({ heldCameraState: cameraState }),
    };
    
    return (
        <div className="w-screen h-screen bg-black">
            {gameState === GameState.Loading && (
                <LoadingScreen
                    progress={state.loadingProgress.progress}
                    message={state.loadingProgress.message}
                    loadingPlayerIcon={state.loadingPlayerIcon}
                    loadingGhostIcon={state.loadingGhostIcon}
                    isSecretMode={state.isSecretMode}
                />
            )}
            {endGameMessage && <EndGameScreen />}
            
            {/* Render SecretShopUI as an overlay, not a GameState switch */}
            {isSecretShopOpen && <SecretShopUI />} 

            {gameState === GameState.MainMenu && (
                <MainMenu
                    {...state}
                    actions={actions}
                    onSetMenuStep={(step) => actions.updateState({ menuStep: step })}
                    onUnlockAudio={handleUnlockAudio}
                    onSetVolume={(type, volume) => actions.setVolume(type, volume)}
                    onSetSensitivity={(type, value) => actions.setSensitivity(type, value)}
                    onToggleMicrophone={actions.toggleMicrophone}
                />
            )}

            {/* [FIX] Only render GameCanvas if settings are loaded and we are not in the main menu */}
            {/* This prevents the 3D engine from initializing with High Quality defaults on low-end devices before we know it's a mobile device */}
            {isSettingsLoaded && gameState !== GameState.MainMenu && <GameCanvas {...gameCanvasProps} />}

            {isGameActive && (
                <HUD
                    {...state}
                    actions={actions}
                    onClose={() => actions.setGameState(GameState.Playing)}
                    onGuessMade={(message) => actions.gameOver(message)}
                    ghosts={GHOSTS}
                    actualGhost={state.selectedGhost}
                />
            )}
            {isVanUIOpen && <VanUI />}
            {isPaused && !isVanUIOpen && <PauseMenu {...state} actions={actions} />}
        </div>
    );
};

export default App;
