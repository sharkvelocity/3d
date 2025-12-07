
import { AUDIO_ROOT, WORLD_SCALE } from '../../constants';

declare const BABYLON: any;

export class OneShotAudioManager {
    private scene: any;
    private sfxSounds = new Map<string, any>();
    private isDisposed: boolean = false;
    
    // Active Clone Tracking (for stopAll)
    private activeClones = new Set<any>();

    // Sound Categories
    private indoorFootsteps: any[] = [];
    private outdoorFootsteps: any[] = [];
    private ghostFootsteps: any[] = [];
    private doorSlamSounds: any[] = [];
    private doorCreakSounds: any[] = [];
    
    // Ghost Vocal Arrays
    private _manifest_neutral: any[] = [];
    private _manifest_male: any[] = [];
    private _manifest_female: any[] = [];
    private _whisper_neutral: any[] = [];
    private _whisper_male: any[] = [];
    private ghostManifestSounds: any[] = []; 
    private ghostWhisperSounds: any[] = []; 
    
    // Special Refs (Masters)
    private ghostGrowlSound: any = null;
    private _growl_male: any = null;
    private bansheeSound: any = null;
    private knockSound: any = null;
    private ghostSingSound: any = null;
    
    // Active Instances (for specific stopping)
    private activeGhostSing: any = null;
    private activePhonographSound: any = null; // [FIX] Track active song

    constructor(scene: any) {
        this.scene = scene;
    }

    public async load(isMobile: boolean): Promise<void> {
        if (this.isDisposed) return;
        
        console.log(`[OneShotAudioManager] Loading Wave 1: Discrete Sounds (Mobile Mode: ${isMobile})`);

        const shortRange = { maxDistance: 10 * WORLD_SCALE, rolloffFactor: 1.0 };
        const mediumRange = { maxDistance: 25 * WORLD_SCALE, rolloffFactor: 1.0 };
        const longRange = { maxDistance: 60 * WORLD_SCALE, rolloffFactor: 1.0 };
        // [FIX] Increased Phonograph range to 15m to ensure audibility
        // [FIX] ENABLE STREAMING: Phonograph music files are large; streaming prevents loading stalls.
        const phonographSpatial = { 
            maxDistance: 15 * WORLD_SCALE, 
            rolloffFactor: 1.0,
            isStreaming: true 
        };

        // Task Queue instead of immediate Promises
        const tasks: (() => Promise<void>)[] = [];

        // --- Helper ---
        // Wraps creation in a deferred function
        const queueSound = (name: string, url: string, vol: number, group?: any[], spatial?: any) => {
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
                        loop: false, 
                        autoplay: false, 
                        volume: vol,
                        spatialSound: !!spatial,
                        distanceModel: spatial ? 'linear' : undefined,
                        maxDistance: spatial ? spatial.maxDistance : undefined,
                        rolloffFactor: spatial ? spatial.rolloffFactor : undefined,
                        streaming: spatial ? !!spatial.isStreaming : false // [FIX] Support streaming option
                    };

                    try {
                        const s = new BABYLON.Sound(name, url, this.scene, () => {
                            if (this.isDisposed) return;
                            s.loop = false;
                            if (!s.metadata) s.metadata = {};
                            s.metadata.baseVolume = vol;

                            this.sfxSounds.set(name, s);
                            if (group) group.push(s);
                            safeResolve();
                        }, opts);
                    } catch (e) {
                        console.warn(`[OneShotAudioManager] Failed to init sound ${name}:`, e);
                        safeResolve(); 
                    }

                    // Timeout fallback
                    setTimeout(() => {
                        if (!resolved) {
                            // console.warn(`[OneShotAudioManager] Timeout loading sound: ${name} (${url}). Proceeding.`);
                            safeResolve();
                        }
                    }, 3000);
                });
            });
        };

        // --- 1. Player & Items ---
        queueSound("game_over", `${AUDIO_ROOT}player_sfx/game_over.mp3`, 0.8);
        queueSound("lighter_flick", `${AUDIO_ROOT}item_sfx/lighter.mp3`, 0.7);
        queueSound("smudge_burn", `${AUDIO_ROOT}item_sfx/burn_smudge.mp3`, 0.8);
        queueSound("motion_sensor_beep", `${AUDIO_ROOT}item_sfx/beep.wav`, 0.8, undefined, shortRange);
        queueSound("burn_cross", `${AUDIO_ROOT}item_sfx/burn_cross.wav`, 1.0, undefined, shortRange);
        queueSound("ghost_writing", `${AUDIO_ROOT}item_sfx/ghost_writing.mp3`, 1.0, undefined, shortRange);
        queueSound("scribble", `${AUDIO_ROOT}item_sfx/scribble.mp3`, 1.0, undefined, shortRange);
        queueSound("bone_pickup", `${AUDIO_ROOT}item_sfx/bone.wav`, 1.0);
        queueSound("toss", `${AUDIO_ROOT}item_sfx/toss.wav`, 1.0, undefined, shortRange);
        queueSound("light_switch", `${AUDIO_ROOT}house_sfx/lightswitch.mp3`, 1.0, undefined, shortRange);
        queueSound("breaker_switch", `${AUDIO_ROOT}house_sfx/circuit.mp3`, 1.0, undefined, mediumRange);
        queueSound("radio", `${AUDIO_ROOT}item_sfx/radio.mp3`, 0.7, undefined, shortRange);
        queueSound("thunder1", `${AUDIO_ROOT}weather_sfx/thunder.mp3`, 0.5);

        if (!isMobile) {
            queueSound("thunder2", `${AUDIO_ROOT}weather_sfx/thunder_loud.mp3`, 0.6);
            queueSound("thunder3", `${AUDIO_ROOT}weather_sfx/thunder_rumble.mp3`, 0.4);
        }

        // --- 2. Footsteps ---
        // Reduce count slightly on mobile to save memory
        const stepCount = isMobile ? 4 : 8; 
        const indoorFiles = ["step1.mp3", "step2.mp3", "step3.mp3", "step4.wav", "step5.wav", "step6.wav", "step7.wav", "step8.wav"];
        for(let i=0; i<stepCount; i++) {
            // [FIX] Increased base volume for player footsteps to 0.8 (from 0.6)
            queueSound(`footstep_indoor${i}`, `${AUDIO_ROOT}player_sfx/${indoorFiles[i]}`, 0.8, this.indoorFootsteps);
            queueSound(`ghost_step${i}`, `${AUDIO_ROOT}player_sfx/${indoorFiles[i]}`, 0.5, this.ghostFootsteps, shortRange);
        }
        
        const outFiles = ["footstep_asphalt.mp3", "footstep_asphalt1.mp3", "footstep_gravel.mp3", "footstep_gravel1.mp3"];
        for(let i=0; i<Math.min(stepCount, 4); i++) {
            // [FIX] Increased base volume for player footsteps to 0.8 (from 0.6)
            queueSound(`footstep_out${i}`, `${AUDIO_ROOT}player_sfx/${outFiles[i]}`, 0.8, this.outdoorFootsteps);
        }

        // --- 3. Doors ---
        queueSound("door_slam1", `${AUDIO_ROOT}house_sfx/door_slam.mp3`, 0.8, this.doorSlamSounds, longRange);
        queueSound("door_creak1", `${AUDIO_ROOT}house_sfx/door_creak.mp3`, 0.9, this.doorCreakSounds, shortRange);
        queueSound("player_door_creak", `${AUDIO_ROOT}house_sfx/door_creak3.mp3`, 0.9, undefined, shortRange);
        queueSound("door_rattle", `${AUDIO_ROOT}house_sfx/door_rattle.mp3`, 0.9, undefined, shortRange);
        queueSound("door_lock", `${AUDIO_ROOT}house_sfx/door_lock.mp3`, 0.9, undefined, shortRange);
        queueSound("door_unlock", `${AUDIO_ROOT}house_sfx/door_unlock.mp3`, 0.9, undefined, shortRange);

        // --- 4. Ghost Vocals ---
        queueSound("bulb_pop", `${AUDIO_ROOT}ghost_sfx/lightbulb.mp3`, 1.2, undefined, longRange);
        
        // Male
        queueSound("breath_male", `${AUDIO_ROOT}ghost_sfx/breath_male.mp3`, 1.2, this._manifest_male, mediumRange);
        queueSound("whisper_male", `${AUDIO_ROOT}ghost_sfx/whisper_male.mp3`, 1.2, this._manifest_male, mediumRange);
        queueSound("sb_whisper_male", `${AUDIO_ROOT}ghost_sfx/whisper_male.mp3`, 1.2, this._whisper_male, mediumRange);
        
        // Female
        queueSound("giggle_female", `${AUDIO_ROOT}ghost_sfx/giggle_female.mp3`, 1.2, this._manifest_female, mediumRange);
        queueSound("moan_female", `${AUDIO_ROOT}ghost_sfx/moan_female.mp3`, 1.2, this._manifest_female, mediumRange);
        queueSound("laugh_female", `${AUDIO_ROOT}ghost_sfx/laugh_female.mp3`, 1.2, this._manifest_female, mediumRange);

        // Neutral
        queueSound("hum_event", `${AUDIO_ROOT}ghost_sfx/hum_event.wav`, 1.2, this._manifest_neutral, mediumRange);
        queueSound("laugh", `${AUDIO_ROOT}ghost_sfx/laugh.mp3`, 1.2, this._manifest_neutral, mediumRange);
        queueSound("sb_whisper", `${AUDIO_ROOT}ghost_sfx/whisper.mp3`, 1.2, this._whisper_neutral, mediumRange);
        queueSound("breath_para", `${AUDIO_ROOT}ghost_sfx/breath.mp3`, 1.2, undefined, mediumRange);

        // Special
        queueSound("ghost_growl", `${AUDIO_ROOT}ghost_sfx/growl_male.wav`, 1.0, undefined, mediumRange);
        queueSound("ghost_sing", `${AUDIO_ROOT}ghost_sfx/sing_event.mp3`, 1.0, undefined, longRange);
        queueSound("banshee_scream", `${AUDIO_ROOT}ghost_sfx/banshee_parabolic.mp3`, 1.0, undefined, longRange);
        queueSound("ghost_knock", `${AUDIO_ROOT}ghost_sfx/knock.mp3`, 1.0, undefined, shortRange);

        // Phonograph
        queueSound("phonograph_mimic", `${AUDIO_ROOT}item_sfx/phonograph/mimic.wav`, 0.7, undefined, phonographSpatial);
        queueSound("phonograph_let_it_run", `${AUDIO_ROOT}item_sfx/phonograph/let_it_run.wav`, 0.7, undefined, phonographSpatial);
        queueSound("phonograph_beatbox", `${AUDIO_ROOT}item_sfx/phonograph/beatbox.wav`, 0.7, undefined, phonographSpatial);
        queueSound("phonograph_jam", `${AUDIO_ROOT}item_sfx/phonograph/jam.wav`, 0.7, undefined, phonographSpatial);
        queueSound("phonograph_untitled", `${AUDIO_ROOT}item_sfx/phonograph/untitled.wav`, 0.7, undefined, phonographSpatial);

        // EXECUTION STRATEGY
        if (isMobile) {
            // Sequential loading to prevent OOM / Decode errors
            for (const task of tasks) {
                await task();
                // Small breathing room for GC
                await new Promise(r => setTimeout(r, 20));
            }
        } else {
            // Parallel loading for Desktop
            // Chunking into batches of 10 to be safe even on desktop
            const batchSize = 10;
            for (let i = 0; i < tasks.length; i += batchSize) {
                const batch = tasks.slice(i, i + batchSize);
                await Promise.all(batch.map(t => t()));
            }
        }
        
        // Link Special References after loading
        this._growl_male = this.sfxSounds.get("ghost_growl");
        this.ghostSingSound = this.sfxSounds.get("ghost_sing");
        this.bansheeSound = this.sfxSounds.get("banshee_scream");
        this.knockSound = this.sfxSounds.get("ghost_knock");
    }

    public setGhostGender(isMale: boolean) {
        this.ghostManifestSounds = [...this._manifest_neutral];
        this.ghostWhisperSounds = [...this._whisper_neutral];
        if (isMale) {
            this.ghostManifestSounds.push(...this._manifest_male);
            this.ghostWhisperSounds.push(...this._whisper_male);
            this.ghostGrowlSound = this._growl_male;
        } else {
            this.ghostManifestSounds.push(...this._manifest_female);
            this.ghostGrowlSound = null;
        }
    }

    // --- Core Play Logic ---
    public playSound(name: string, position: any = null) {
        const sound = this.sfxSounds.get(name);
        if (sound) {
            this.playOneShot(sound, position);
        }
    }

    private playOneShot(sound: any, position: any = null): any {
        if (!sound || !sound.isReady()) return null;
        
        // CRITICAL FIX: Always clone one-shot sounds to prevent state bleeding.
        const clone = sound.clone();
        
        // Fallback if clone fails (e.g. invalid state) -> Play master
        if (!clone) {
            // console.warn(`[OneShotAudioManager] Failed to clone sound ${sound.name}. Playing master.`);
            sound.loop = false;
            sound.play();
            return sound;
        }
        
        // [FIX] Explicitly force loop to false on the clone instance
        clone.loop = false;
        
        // Handle Volume from stored metadata first (most reliable)
        const vol = sound.metadata?.baseVolume ?? (sound.getVolume ? sound.getVolume() : sound.volume);
        // [FIX] Ensure cloned sound gets the correct volume
        clone.setVolume(vol);
        
        clone.maxDistance = sound.maxDistance;
        clone.rolloffFactor = sound.rolloffFactor;
        clone.distanceModel = sound.distanceModel;
        
        // Apply position overrides
        if (position) {
            clone.spatialSound = true;
            clone.setPosition(position);
        } else {
            clone.spatialSound = false;
        }

        this.activeClones.add(clone);

        // Auto-cleanup on end
        clone.onended = () => {
            this.activeClones.delete(clone);
            clone.dispose();
        };

        try {
            clone.play();
        } catch (e) {
            console.warn("Failed to play clone:", e);
            clone.dispose();
            return null;
        }
        return clone;
    }

    public playFootstep(isIndoor: boolean) {
        const source = isIndoor ? this.indoorFootsteps : this.outdoorFootsteps;
        if (source.length === 0) return;

        const sound = source[Math.floor(Math.random() * source.length)];
        this.playOneShot(sound);
    }

    public playGhostFootstep(position: any, isMyling: boolean, isHunting: boolean) {
        if (this.ghostFootsteps.length === 0) return;

        const sound = this.ghostFootsteps[Math.floor(Math.random() * this.ghostFootsteps.length)];

        // Apply dynamic volume/range based on ghost type
        const baseVolume = 0.5; // From load config
        let vol = baseVolume;
        let dist = 10 * WORLD_SCALE;

        if (isHunting) {
            if (isMyling) {
                dist = 4 * WORLD_SCALE;
                vol = 0.4 * baseVolume;
            } else {
                dist = 20 * WORLD_SCALE;
                vol = 2.0 * baseVolume;
            }
        } else {
            if (isMyling) {
                dist = 2 * WORLD_SCALE;
                vol = 0.15 * baseVolume;
            } else {
                dist = 8 * WORLD_SCALE;
                vol = 0.4 * baseVolume;
            }
        }

        sound.setVolume(vol);
        sound.maxDistance = dist;
        this.playOneShot(sound, position);
    }

    public playDoorSlam(position: any) {
        if (this.doorSlamSounds.length > 0) {
            const s = this.doorSlamSounds[Math.floor(Math.random() * this.doorSlamSounds.length)];
            this.playOneShot(s, position);
        }
    }

    public playDoorCreak(position: any) {
        if (this.doorCreakSounds.length > 0) {
            const s = this.doorCreakSounds[Math.floor(Math.random() * this.doorCreakSounds.length)];
            this.playOneShot(s, position);
        }
    }

    public playThunder() {
        const thunders = ["thunder1", "thunder2", "thunder3"];
        const available = thunders.filter(name => this.sfxSounds.has(name));
        if (available.length > 0) {
            const name = available[Math.floor(Math.random() * available.length)];
            this.playSound(name);
        }
    }

    public playManifestSound(position: any) {
        if (this.ghostManifestSounds.length > 0) {
            const s = this.ghostManifestSounds[Math.floor(Math.random() * this.ghostManifestSounds.length)];
            this.playOneShot(s, position);
        }
    }

    public playWhisper(position: any) {
        if (this.ghostWhisperSounds.length > 0) {
            const s = this.ghostWhisperSounds[Math.floor(Math.random() * this.ghostWhisperSounds.length)];
            this.playOneShot(s, position);
        }
    }

    public playGhostGrowl(position: any) {
        if (this.ghostGrowlSound) this.playOneShot(this.ghostGrowlSound, position);
    }

    public playGhostSing(position: any, onEnded?: () => void) {
        if (this.ghostSingSound) {
            if (this.activeGhostSing) {
                try {
                    this.activeGhostSing.stop();
                    this.activeGhostSing.dispose();
                } catch(e){}
            }
            // Master config
            this.ghostSingSound.maxDistance = 60 * WORLD_SCALE;
            this.ghostSingSound.setVolume(1.0);
            
            const clone = this.playOneShot(this.ghostSingSound, position);
            if (clone) {
                this.activeGhostSing = clone;
                if (onEnded) {
                    // Wrap the existing onended
                    const oldEnd = clone.onended;
                    clone.onended = () => {
                        if (oldEnd) oldEnd();
                        onEnded();
                        if (this.activeGhostSing === clone) this.activeGhostSing = null;
                    };
                }
            }
        }
    }
    
    public stopGhostSing() {
        if (this.activeGhostSing) {
            try {
                this.activeGhostSing.stop();
                this.activeGhostSing.dispose();
            } catch(e) {}
            this.activeGhostSing = null;
        }
    }

    public playPhonographSong(name: string, position: any, onEnded?: () => void) {
        // [FIX] Stop previous song if any
        this.stopPhonograph();

        const sound = this.sfxSounds.get(name);
        if (sound) {
            // [FIX] Play Master directly for phonograph (Streaming/Large files, Singleton)
            // Do NOT use playOneShot as it clones, which fails for streaming assets or is redundant.
            
            // Set Volume
            const vol = sound.metadata?.baseVolume ?? 0.7;
            sound.setVolume(vol);

            // Setup spatial
            if (position) {
                sound.spatialSound = true;
                sound.setPosition(position);
            } else {
                sound.spatialSound = false;
            }

            this.activePhonographSound = sound;
            
            // Hook onended directly to the master sound
            sound.onended = () => {
                if (onEnded) onEnded();
                if (this.activePhonographSound === sound) {
                    this.activePhonographSound = null;
                }
            };

            try {
                if (sound.isPlaying) sound.stop(); // Reset if already playing
                sound.play();
            } catch (e) {
                console.warn(`[OneShotAudioManager] Failed to play phonograph master: ${name}`, e);
            }
        } else {
            console.warn(`[OneShotAudioManager] Phonograph sound not found: ${name}`);
        }
    }

    public stopPhonograph() {
        // [FIX] Stop active phonograph song
        const sound = this.activePhonographSound; // Capture reference
        if (sound) {
            this.activePhonographSound = null; // Clear class property immediately
            
            try {
                if (sound.stop) sound.stop();
                // [FIX] Do NOT dispose the master sound instance.
                // Phonograph songs are now played as masters, not clones.
            } catch (e) {
                console.warn("Failed to stop phonograph sound", e);
            }
        }
    }

    public stopAll() {
        // Create a copy to iterate safely so we don't modify the set while looping
        const clones = Array.from(this.activeClones);
        this.activeClones.clear(); // Clear immediately

        clones.forEach(clone => {
            if (clone) {
                // IMPORTANT: Unhook onended to prevent recursion if stop() triggers it
                clone.onended = null;
                
                try {
                    if (clone.stop) clone.stop();
                } catch (e) { /* ignore */ }
                
                try {
                    if (clone.dispose) clone.dispose();
                } catch (e) { /* ignore */ }
            }
        });
        
        this.activeGhostSing = null;
        this.activePhonographSound = null; // [FIX] Clear ref
        
        // Masters are idle, but double check
        this.sfxSounds.forEach(s => {
            try {
                if (s.isPlaying) s.stop();
            } catch(e) {}
        });
    }

    public dispose() {
        this.isDisposed = true;
        this.stopAll();
        // Babylon sounds dispose themselves usually if scene disposes, but we can be explicit
        this.sfxSounds.forEach(s => { try{ s.dispose() } catch(e){} });
        this.sfxSounds.clear();
        this.indoorFootsteps = [];
        this.outdoorFootsteps = [];
        this.ghostFootsteps = [];
    }
}
