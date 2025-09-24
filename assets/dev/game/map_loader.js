// File: assets/dev/game/map_loader.js
// Ensure this runs after scene and bootstrap are ready

(function(){
    const mapSelect = document.getElementById("map-select");

    async function loadMaps() {
        try {
            // Load maps manifest
            const res = await fetch("./assets/models/map/maps.json");
            if(!res.ok) throw new Error("Failed to load maps.json");
            const mapsManifest = await res.json();

            // Clear placeholder
            mapSelect.innerHTML = "";

            // Populate dropdown
            mapsManifest.forEach((map, idx) => {
                const option = document.createElement("option");
                option.value = map.file || idx; // fallback to index
                option.textContent = map.name || `Map ${idx+1}`;
                mapSelect.appendChild(option);
            });

            // Auto-select first map if none selected
            if(mapSelect.options.length > 0) mapSelect.selectedIndex = 0;

        } catch(e) {
            console.error("Map loader error:", e);
            mapSelect.innerHTML = "<option value='-1'>Failed to load maps</option>";
        }
    }

    // Event handler when player selects a map
    mapSelect.addEventListener("change", () => {
        const selected = mapSelect.value;
        if(window.mapManager && selected !== "-1") {
            window.mapManager.loadMap(selected); // assumes your mapManager handles loading by file
        }
    });

    // Start loading maps
    loadMaps();
})();
