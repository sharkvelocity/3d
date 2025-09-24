/* ./assets/models/map/map_manager.js — manages map loading & map assets */
"use strict";

window.PP = window.PP || {};
PP.maps = PP.maps || {};

PP.mapManager = (function() {
    const loadedMaps = {};

    // Load a map (GLB or procedural)
    async function loadMap(mapData) {
        if (!mapData) throw new Error("No map data provided");

        const scene = window.SCENE;
        if (!scene) throw new Error("Scene not initialized");

        const isProcedural = !!mapData.procedural;

        // Remove previous map meshes
        if (PP.mapManager.currentMapMeshes) {
            PP.mapManager.currentMapMeshes.forEach(m => m.dispose());
            PP.mapManager.currentMapMeshes.length = 0;
        } else {
            PP.mapManager.currentMapMeshes = [];
        }

        if (isProcedural && window.generateProHouse) {
            // Procedural map
            const meshes = await window.generateProHouse(mapData);
            PP.mapManager.currentMapMeshes.push(...meshes);
            console.log("[map_manager] Procedural map loaded:", mapData.title || mapData.def);
        } else {
            // GLB map
            const file = mapData.file;
            if (!file) throw new Error("Map file missing: " + JSON.stringify(mapData));

            const url = `./assets/models/map/${file}`;
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                null,
                "",
                url,
                scene
            );

            const meshes = result.meshes || [];
            PP.mapManager.currentMapMeshes.push(...meshes);
            console.log("[map_manager] GLB map loaded:", file);
        }

        PP.mapManager.currentMap = mapData;
        return PP.mapManager.currentMapMeshes;
    }

    function getCurrentMap() {
        return PP.mapManager.currentMap || null;
    }

    function getCurrentMeshes() {
        return PP.mapManager.currentMapMeshes || [];
    }

    return {
        loadMap,
        getCurrentMap,
        getCurrentMeshes,
        currentMap: null,
        currentMapMeshes: []
    };
})();
