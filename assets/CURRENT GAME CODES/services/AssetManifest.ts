
import { GHOST_MODELS } from '../data/ghosts';
import { ITEMS, LIGHTER, HEADLAMP, ITEM_ICON_MAP } from '../data/items';
import { MAPS } from '../data/maps';
import { MODEL_ROOT, TEXTURE_ROOT, AUDIO_ROOT, VIDEO_TRIPOD_URL, NO_SIGNAL_GIF_URL, LOGO_URL, LOGO2_URL, WARNING_URL, ICON_ROOT } from '../constants';

export const generateAssetManifest = (): string[] => {
    const urls = new Set<string>();

    // 1. Static UI Images
    urls.add(LOGO_URL);
    urls.add(LOGO2_URL);
    urls.add(WARNING_URL);
    urls.add(NO_SIGNAL_GIF_URL);

    // 2. Models
    // Items
    [...ITEMS, LIGHTER, HEADLAMP].forEach(item => {
        if (item.modelUrl) urls.add(item.modelUrl);
    });
    urls.add(VIDEO_TRIPOD_URL);

    // Maps (Static GLBs)
    MAPS.forEach(map => {
        if (map.modelUrl) urls.add(map.modelUrl);
    });
    
    // Add Portal
    urls.add(`${MODEL_ROOT}map/portal.glb`);

    // Procedural Map Assets (Bones & Photos)
    // Bones 1-5 (Bone 1 is usually covered by ITEMS default, but ensuring all here is safer)
    for (let i = 1; i <= 5; i++) {
        urls.add(`${MODEL_ROOT}items/bone/bone${i}.glb`);
    }

    // Wall Photos (Numeric 1-10)
    for (let i = 1; i <= 10; i++) {
        urls.add(`${MODEL_ROOT}items/wallphotos/${i}.glb`);
    }
    // Wall Photos (Adult/Portrait 20-23)
    for (let i = 20; i <= 23; i++) {
        urls.add(`${MODEL_ROOT}items/wallphotos/adult/${i}.glb`);
    }

    // Ghosts (Active & Idle & Mist)
    GHOST_MODELS.forEach(model => {
        urls.add(`${MODEL_ROOT}ghosts/${model}`);
        urls.add(`${MODEL_ROOT}ghosts/${model.replace('.glb', '_idle.glb')}`);
    });
    urls.add(`${MODEL_ROOT}ghosts/mist_form.glb`);

    // Explicit Furniture & Props (Only what is used in layout)
    urls.add(`${MODEL_ROOT}scene/bedroom_queen.glb`);
    urls.add(`${MODEL_ROOT}scene/dining_table.glb`);
    urls.add(`${MODEL_ROOT}scene/phonograph.glb`);
    urls.add(`${MODEL_ROOT}scene/props/plate2.glb`);
    
    // Scene Geometry (Common)
    // [FIX] Removed tent.glb from manifest
    const sceneModels = [
        'truck.glb', 'outside.glb', 'lightswitch.glb', 'breaker.glb',
        'window.glb', 'window_broken.glb', 'window_blinds_closed.glb', 'window_blinds_open.glb',
        'front_door.glb'
    ];
    sceneModels.forEach(m => urls.add(`${MODEL_ROOT}scene/${m}`));

    // Sky
    urls.add(`${MODEL_ROOT}sky/skybox.glb`);
    urls.add(`${MODEL_ROOT}sky/moon.glb`);

    // 3. Textures
    const textures = [
        'cloud.png', 'ghost_orb.png', 'grass.png', 'outside_wall.jpg', 'particle.png',
        'rain.png', 'roof.png', 'tile.png', 'wood.png',
        'uv_footprint_left.png', 'uv_footprint_right.png', 'uv_handprint.png',
        'uv_obake_fingerprint.png', 'uv_obake_handprint.png', 'uv_fingerprint.png'
    ];
    textures.forEach(t => urls.add(`${TEXTURE_ROOT}${t}`));

    // Icons
    Object.values(ITEM_ICON_MAP).forEach(url => urls.add(url));
    
    // [FIX] Use ICON_ROOT to ensure cache keys match LoadingScreen requests
    urls.add(`${ICON_ROOT}ghost_chase.png`);
    urls.add(`${ICON_ROOT}ghost_chase2.png`);
    urls.add(`${ICON_ROOT}player_chase.png`);
    urls.add(`${ICON_ROOT}player_chase2.png`);
    urls.add(`${ICON_ROOT}player_chased.png`);
    urls.add(`${ICON_ROOT}player_chasing.png`);
    urls.add(`${ICON_ROOT}ghost_being_chased.png`);

    // 4. Critical Audio (Pre-cache commonly used)
    // We won't cache EVERY sound to save some bandwidth, but the big ones.
    const criticalAudio = [
        'ghost_sfx/ghost_hunt.wav',
        'ghost_sfx/heartbeat.mp3',
        'player_sfx/footstep_wood.mp3',
        'player_sfx/footstep_asphalt.mp3',
        'item_sfx/spirit_box.wav',
        'item_sfx/emf.wav',
        'house_sfx/lightswitch.mp3',
        'weather_sfx/rain.wav'
    ];
    criticalAudio.forEach(a => urls.add(`${AUDIO_ROOT}${a}`));

    return Array.from(urls);
};
