// assets/dev/game/map_loader.js
// Ensure this runs after scene and bootstrap are ready

(async function(){
  const mapSelect = document.getElementById("map-select");
  let maps = [];
  window.currentWeather = null;
  window.currentAmbientSound = null;

  // Weather definitions
  const WEATHER_TYPES = [
    { type: "Clear", tempRange: [15, 25], ambient: "clear.ogg" },
    { type: "Rain", tempRange: [10, 18], ambient: "rain.ogg" },
    { type: "Snow", tempRange: [-5, 2], ambient: "wind.ogg" },
    { type: "Foggy", tempRange: [8, 14], ambient: "fog.ogg" },
  ];

  function pickRandomWeather(){
    const choice = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    const temp = choice.tempRange
      ? Math.floor(Math.random() * (choice.tempRange[1] - choice.tempRange[0] + 1)) + choice.tempRange[0]
      : 20;
    return { type: choice.type, temp, ambient: choice.ambient };
  }

  // Load maps.json
  try {
    const res = await fetch("./assets/models/map/maps.json");
    maps = await res.json();
    if(mapSelect){
      mapSelect.innerHTML = "";
      maps.forEach((m,i)=>{
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = m.title || m.file || ("Map "+i);
        mapSelect.appendChild(opt);
      });
      if(mapSelect.options.length > 0) mapSelect.selectedIndex = 0;
    }
  } catch(e){
    console.error("Failed to load maps.json", e);
    if(mapSelect){
      mapSelect.innerHTML = "<option value='-1'>(error loading maps)</option>";
    }
  }

  // Hook into start button
  const startBtn = document.getElementById("start-button");
  if(startBtn){
    startBtn.addEventListener("click", async ()=>{
      const sel = mapSelect ? parseInt(mapSelect.value) : -1;
      if(sel<0 || !maps[sel]){
        alert("Select a valid map");
        return;
      }
      const mapData = maps[sel];

      // Hide title screen
      const title = document.getElementById("title-screen");
      if(title) title.style.display="none";

      // Roll weather once per investigation
      const weather = pickRandomWeather();
      window.currentWeather = weather;

      if(window.updateWeather) window.updateWeather(weather.type, weather.temp);

      // Weather particle/effects
      if(window.weatherSystem){
        window.weatherSystem.setWeather(weather.type);
      }

      // Ambient sound
      if(weather.ambient){
        if(window.currentAmbientSound){
          window.currentAmbientSound.dispose();
          window.currentAmbientSound = null;
        }
        window.currentAmbientSound = new BABYLON.Sound(
          "ambient",
          "./assets/audio/"+weather.ambient,
          window.scene,
          null,
          { loop:true, autoplay:true, volume:0.7 }
        );
      }

      // Load the map
      try{
        if(mapData.procedural){
          if(window.ProHouseGenerator){
            await window.ProHouseGenerator.generate(mapData.def, window.scene);
          } else {
            console.error("Procedural generator missing");
          }
        } else {
          await BABYLON.SceneLoader.AppendAsync("./assets/models/map/", mapData.file, window.scene);
        }
      }catch(err){
        console.error("Map load error", err);
        alert("Failed to load map: "+mapData.title);
      }
    });
  }

  // Quit → reset weather + sound
  const quitBtn = document.getElementById("quit-btn");
  if(quitBtn){
    quitBtn.addEventListener("click", ()=>{
      window.currentWeather = null;
      if(window.currentAmbientSound){
        window.currentAmbientSound.dispose();
        window.currentAmbientSound = null;
      }
    });
  }
})();
