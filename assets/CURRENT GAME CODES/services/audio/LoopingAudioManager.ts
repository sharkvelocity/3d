
import { AUDIO_ROOT, WORLD_SCALE } from '../../constants';
import { Weather } from '../../types';

declare const BABYLON: any;

export class LoopingAudioManager {
    private scene: any;
    private isDisposed: boolean = false;
    
    // Named References
    private heartbeat: any = null;
    private heartbeatRaiju: any = null;
    private huntLoop: any = null;
    private huntLoopRaiju: any = null;
    private spiritBox: any = null;
    private emfBeep: any = null;
    private flamethrower: any = null;
    private secretMap: any = null;
    private musicBox: any = null;
    private phonographRadio: any = null;
    
    // Ambient
    private currentAmbient: any = null;
    private ambientSounds: any[] = [];
    private ambientVolume: number = 0.5;
    private fadeInterval: any = null;

    constructor(scene: any) {
        this.scene = scene;
    }

    public async load(isSecretMode: boolean, isMobile: boolean): Promise<void> {
        if (this.isDisposed) return;
        console.log(`[LoopingAudioManager] Loading Wave 2: Continuous Sounds (Mobile: ${isMobile})`);

        const mediumRange = { maxDistance: 25 * WORLD_SCALE, rolloffFactor: 1.0 };
        const longRange = { maxDistance: 60 * WORLD_SCALE, rolloffFactor: 1.0 };
        const phonographSpatial = { maxDistance: 6 * WORLD_SCALE, rolloffFactor: 1.5 };

        const tasks: (() => Promise<void>)[] = [];

        const queueSound = (name: string, url: string, vol: number, assign: (s: any) => void, spatial?: any) => {
            tasks.push(() => {
                return new Promise<void>((resolve) => {
                    let resolved = false;
                    const safeResolve = () => {
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    };

                    const opts: any = { 
                        loop: true, 
                        autoplay: false, 
                        volume: vol,
                        spatialSound: !!spatial,
                        distanceModel: spatial ? 'linear' : undefined,
                        maxDistance: spatial ? spatial.maxDistance : undefined,
                        rolloffFactor: spatial ? spatial.rolloffFactor : undefined
                    };

                    try {
                        const s = new BABYLON.Sound(name, url, this.scene, () => {
                            if (this.isDisposed) return;
                            s.updateOptions({ loop: true });
                            assign(s);
                            safeResolve();
                        }, opts);
                    } catch (e) {
                        console.warn(`[LoopingAudioManager] Failed to init sound ${name}:`, e);
                        safeResolve(); 
                    }

                    setTimeout(() => {
                        if (!resolved) {
                            safeResolve();
                        }
                    }, 3000);
                });
            });
        };

        queueSound("heartbeat", `${AUDIO_ROOT}player_sfx/heartbeat.mp3`, 0.9, s => this.heartbeat = s);
        queueSound("heartbeat_raiju", `${AUDIO_ROOT}ghost_sfx/heartbeat_raiju.wav`, 0.9, s => this.heartbeatRaiju = s);
        queueSound("spirit_box", `${AUDIO_ROOT}item_sfx/spirit_box.wav`, 0.9, s => this.spiritBox = s);
        
        queueSound("emf_beep", `${AUDIO_ROOT}item_sfx/click.wav`, 1.0, s => this.emfBeep = s);
        queueSound("ghost_hunt_loop", `${AUDIO_ROOT}ghost_sfx/ghost_hunt.wav`, 1.0, s => this.huntLoop = s, longRange);
        queueSound("ghost_hunt_loop_raiju", `${AUDIO_ROOT}ghost_sfx/ghost_hunt_raiju.wav`, 1.0, s => this.huntLoopRaiju = s, longRange);
        queueSound("phonograph_radio", `${AUDIO_ROOT}item_sfx/radio.mp3`, 0.7, s => this.phonographRadio = s, phonographSpatial);
        // [FIX] Increased volume to 1.0 to ensure Music Box is audible
        queueSound("music_box", `${AUDIO_ROOT}cursed_item/music_box_play.mp3`, 1.0, s => this.musicBox = s, mediumRange);
        
        // [FIX] Always load flamethrower sound (it might be needed via Dev Mode or rare spawns)
        queueSound("flamethrower", `${AUDIO_ROOT}item_sfx/flamethrower.wav`, 0.8, s => this.flamethrower = s);

        if (isSecretMode) {
            queueSound("secret_map_intro", `${AUDIO_ROOT}house_sfx/secret_map.mp3`, 0.4, s => this.secretMap = s);
        }

        // Execution
        if (isMobile) {
            for (const task of tasks) {
                await task();
                await new Promise(r => setTimeout(r, 20));
            }
        } else {
            await Promise.all(tasks.map(t => t()));
        }
    }

    public loadWeather(weather: Weather) {
        if (this.isDisposed) return;
        
        // Dispose old
        if (this.currentAmbient) {
            this.currentAmbient.stop();
            this.currentAmbient.dispose();
            this.currentAmbient = null;
        }
        this.ambientSounds = [];

        let name = "calm_sound";
        let url = `${AUDIO_ROOT}weather_sfx/clear.mp3`;
        let vol = 0.2;

        if (weather === Weather.Rain) {
            name = "rain_sound"; url = `${AUDIO_ROOT}weather_sfx/rain.wav`; vol = 0.3;
        } else if (weather === Weather.HeavyRain || weather === Weather.BloodMoon) {
            name = "rain_sound"; url = `${AUDIO_ROOT}weather_sfx/rain.wav`; vol = 0.5;
        } else if (weather === Weather.Snow) {
            name = "snow_sound"; url = `${AUDIO_ROOT}weather_sfx/snow.mp3`; vol = 0.4;
        }

        const s = new BABYLON.Sound(name, url, this.scene, () => {
            if (this.isDisposed) return;
            s.updateOptions({ loop: true });
            this.currentAmbient = s;
            this.ambientSounds.push(s);
            // Auto-start ambient is handled by SoundManager.startAmbientSounds
        }, { loop: true, autoplay: false, volume: vol });
    }

    public startAmbience() {
        if (this.currentAmbient && !this.currentAmbient.isPlaying) {
            this.currentAmbient.play();
        }
    }

    public updateAmbienceFade(isInside: boolean) {
        if (this.isDisposed) return;
        if (this.fadeInterval) clearInterval(this.fadeInterval);

        const targetMultiplier = isInside ? 0.05 : 1.0;
        const duration = 1000;
        const steps = 20;
        const stepTime = duration / steps;
        
        const startVol = this.currentAmbient ? this.currentAmbient.getVolume() : 0;
        const targetVol = this.ambientVolume * targetMultiplier;
        let currentStep = 0;

        this.fadeInterval = setInterval(() => {
            if (this.isDisposed) {
                if(this.fadeInterval) clearInterval(this.fadeInterval);
                return;
            }
            currentStep++;
            const progress = currentStep / steps;
            const newVol = startVol + (targetVol - startVol) * progress;
            
            if (this.currentAmbient) this.currentAmbient.setVolume(newVol);

            if (currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
        }, stepTime);
    }

    public setAmbientVolume(vol: number) {
        this.ambientVolume = vol;
        if (this.currentAmbient) {
            // Apply immediately (ignores indoor fade for simplicity, updateAmbienceFade fixes it later)
            this.currentAmbient.setVolume(vol);
        }
    }

    // --- Controls ---

    public playHeartbeat(isRaiju: boolean) {
        const target = isRaiju ? this.heartbeatRaiju : this.heartbeat;
        const other = isRaiju ? this.heartbeat : this.heartbeatRaiju;
        
        if (other && other.isPlaying) other.stop();
        if (target && !target.isPlaying) target.play();
    }
    public stopHeartbeat() {
        if (this.heartbeat && this.heartbeat.isPlaying) this.heartbeat.stop();
        if (this.heartbeatRaiju && this.heartbeatRaiju.isPlaying) this.heartbeatRaiju.stop();
    }
    public setHeartbeatRate(rate: number) {
        if(this.heartbeat) this.heartbeat.setPlaybackRate(rate);
        if(this.heartbeatRaiju) this.heartbeatRaiju.setPlaybackRate(rate);
    }
    public setHeartbeatVolume(vol: number) {
        if(this.heartbeat) this.heartbeat.setVolume(vol);
        if(this.heartbeatRaiju) this.heartbeatRaiju.setVolume(vol);
    }

    public playSpiritBox() {
        if (this.spiritBox && !this.spiritBox.isPlaying) this.spiritBox.play();
    }
    public stopSpiritBox() {
        if (this.spiritBox && this.spiritBox.isPlaying) this.spiritBox.stop();
    }

    public playEmfBeep(level: number) {
        if (this.emfBeep) {
            const interval = 1000 / (level * 2);
            this.emfBeep.updateOptions({ playbackRate: 1 / (interval / 1000) });
            if (!this.emfBeep.isPlaying) this.emfBeep.play();
        }
    }
    public stopEmfBeep() {
        if (this.emfBeep && this.emfBeep.isPlaying) this.emfBeep.stop();
    }

    public playFlamethrower(pos?: any) {
        if (this.flamethrower) {
            if (pos) {
                this.flamethrower.setPosition(pos);
                this.flamethrower.spatialSound = true;
            } else {
                this.flamethrower.spatialSound = false;
            }
            if (!this.flamethrower.isPlaying) this.flamethrower.play();
        }
    }
    public stopFlamethrower() {
        if (this.flamethrower && this.flamethrower.isPlaying) this.flamethrower.stop();
    }

    public playSecretMap() { if(this.secretMap) this.secretMap.play(); }
    public stopSecretMap() { if(this.secretMap) this.secretMap.stop(); }

    public playHuntVocal(isRaiju: boolean, mesh: any) {
        const target = isRaiju ? this.huntLoopRaiju : this.huntLoop;
        const other = isRaiju ? this.huntLoop : this.huntLoopRaiju;
        
        if (other && other.isPlaying) other.stop();
        if (target) {
            if (mesh) target.attachToMesh(mesh);
            if (!target.isPlaying) target.play();
        }
    }
    public stopHuntVocal() {
        if(this.huntLoop) this.huntLoop.stop();
        if(this.huntLoopRaiju) this.huntLoopRaiju.stop();
    }

    public playMusicBox(pos: any) {
        if (this.musicBox) {
            this.musicBox.setPosition(pos);
            if (!this.musicBox.isPlaying) this.musicBox.play();
        }
    }
    public stopMusicBox() {
        if (this.musicBox) this.musicBox.stop();
    }

    public playPhonographStatic(pos: any) {
        if (this.phonographRadio) {
            this.phonographRadio.setPosition(pos);
            if (!this.phonographRadio.isPlaying) this.phonographRadio.play();
        }
    }
    public stopPhonographStatic() {
        if (this.phonographRadio) this.phonographRadio.stop();
    }

    public stopAll() {
        this.stopHeartbeat();
        this.stopSpiritBox();
        this.stopEmfBeep();
        this.stopFlamethrower();
        this.stopSecretMap();
        this.stopHuntVocal();
        this.stopMusicBox();
        this.stopPhonographStatic();
        // Ambient stops on dispose
    }

    public dispose() {
        this.isDisposed = true;
        if(this.fadeInterval) clearInterval(this.fadeInterval);
        this.stopAll();
        if(this.currentAmbient) this.currentAmbient.dispose();
        // Dispose specific
        const arr = [this.heartbeat, this.heartbeatRaiju, this.spiritBox, this.flamethrower, this.secretMap, this.emfBeep, this.huntLoop, this.huntLoopRaiju, this.musicBox, this.phonographRadio];
        arr.forEach(s => s && s.dispose());
    }
}
