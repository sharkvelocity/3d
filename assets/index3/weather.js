function applyMoonTintForWeather(){
  if (!moonMat) return;
  if (weather.state === 'Blood Moon'){
    moonMat.emissiveColor = new BABYLON.Color3(0.9, 0.16, 0.16);
  } else {
    moonMat.emissiveColor = new BABYLON.Color3(1,1,1);
  }
}

const audio = {
  ambient: new Audio("./assets/audio/ambient.mp3"),
  rain: new Audio("./assets/audio/rainstorm.mp3"),
  clear: new Audio("./assets/audio/clearWeather.mp3"),
  spiritbox: new Audio("./assets/audio/spiritbox.mp3"),
  spiritStatic: new Audio("./assets/audio/spiritBoxStatic.mp3"),
  whisper: new Audio("./assets/audio/whisper.mp3"),
  doorCreak1: new Audio("./assets/audio/doorCreak1.mp3"),
  doorCreak2: new Audio("./assets/audio/doorCreak2.mp3"),
  slam1: new Audio("./assets/audio/doorSlam1.mp3"),
  slam2: new Audio("./assets/audio/doorSlam2.mp3"),
  ghostLaugh: new Audio("./assets/audio/ghostLaugh.mp3"),
  writing: new Audio("./assets/audio/GhostWriting1.mp3"),
  steps: [ new Audio("./assets/audio/step1.mp3"), new Audio("./assets/audio/step2.mp3"), new Audio("./assets/audio/step3.mp3") ]
};
Object.values(audio).forEach(a=>{
  if (Array.isArray(a)) a.forEach(x=>{ if(x && x.loop!==undefined) x.loop=false; });
  else if(a && a.loop !== undefined) a.loop = false;
});
function playStep(volume=0.45){
  const pool = audio.steps;
  const s = pool[(Math.random()*pool.length)|0];
  try{ s.currentTime = 0; s.volume = volume; s.play().catch(()=>{}); }catch{}
}

function makeSnowTexture(){
  if (weather.snowTex) return weather.snowTex;
  const tex = new BABYLON.DynamicTexture("snowTex",{width:32,height:32},scene,false);
  const ctx = tex.getContext();
  ctx.clearRect(0,0,32,32);
  ctx.fillStyle="white";
  ctx.beginPath(); ctx.arc(16,16,12,0,Math.PI*2); ctx.fill();
  tex.update(false);
  weather.snowTex = tex;
  return tex;
}
function stopAllWeatherPS(){ if (weather.rainPS){ weather.rainPS.stop(); } if (weather.snowPS){ weather.snowPS.stop(); } }
function stopAllWeatherAudio(){ try{ audio.rain.pause(); audio.rain.currentTime=0; }catch{} try{ audio.clear.pause(); audio.clear.currentTime=0; }catch{} }

function scheduleNextLightning(){ weather.lightningTimer=0; weather.nextStrike = 3 + Math.random()*10; }
function lightningStrike(){ const overlay=document.getElementById('flash-overlay'); overlay.style.opacity='0.6'; setTimeout(()=>overlay.style.opacity='0', 120); }

function setWeather(state){
  weather.state = state;
  $('#hud-weather').textContent = state;
  stopAllWeatherPS(); stopAllWeatherAudio();

  weather.modSanityDrain = 1.0; weather.modHuntChance = 1.0; weather.modHuntPace = 1.0;

  if(state === 'Rain'){
    if(!weather.rainPS){
      const ps = new BABYLON.ParticleSystem("rain", 4000, scene);
      ps.particleTexture = new BABYLON.Texture("./assets/images/nosignal.gif", scene); // placeholder thin streak
      ps.minEmitBox = new BABYLON.Vector3(-80, 50, -80);
      ps.maxEmitBox = new BABYLON.Vector3(80, 50, 80);
      ps.minSize = 0.05; ps.maxSize = 0.1;
      ps.minLifeTime = 0.9; ps.maxLifeTime = 1.4;
      ps.emitRate = 1800;
      ps.direction1 = new BABYLON.Vector3(0, -1.2, 0);
      ps.direction2 = new BABYLON.Vector3(0, -1.0, 0);
      ps.color1 = new BABYLON.Color4(0.8,0.9,1,0.75);
      ps.color2 = new BABYLON.Color4(0.8,0.9,1,0.6);
      ps.gravity = new BABYLON.Vector3(0,-9.8,0);
      ps.disposeOnStop = false;
      weather.rainPS = ps;
    }
    weather.rainPS.start();
    scheduleNextLightning();
    applyNightPalette();
    audio.rain.loop=true; audio.rain.volume=0.35; audio.rain.play().catch(()=>{});
    audio.ambient.loop=true; audio.ambient.volume=0.3; audio.ambient.play().catch(()=>{});

  } else if (state === 'Snow'){
    if (!weather.snowPS){
      const ps = new BABYLON.ParticleSystem("snow", 2500, scene);
      ps.particleTexture = makeSnowTexture();
      ps.minEmitBox = new BABYLON.Vector3(-80, 40, -80);
      ps.maxEmitBox = new BABYLON.Vector3(80, 40, 80);
      ps.minSize = 0.06; ps.maxSize = 0.14;
      ps.minLifeTime = 2.2; ps.maxLifeTime = 3.5;
      ps.emitRate = 1200;
      ps.direction1 = new BABYLON.Vector3(-0.2, -0.8, 0.1);
      ps.direction2 = new BABYLON.Vector3(0.2, -1.0, -0.1);
      ps.color1 = new BABYLON.Color4(1,1,1,0.9);
      ps.color2 = new BABYLON.Color4(1,1,1,0.7);
      ps.gravity = new BABYLON.Vector3(0,-0.2,0);
      ps.updateSpeed = 0.02;
      ps.disposeOnStop = false;
      weather.snowPS = ps;
    }
    weather.snowPS.start();
    applyNightPalette();
    weather.modSanityDrain = 0.95;
    audio.clear.loop=true; audio.clear.volume=0.25; audio.clear.play().catch(()=>{});
    audio.ambient.loop=true; audio.ambient.volume=0.28; audio.ambient.play().catch(()=>{});

  } else if (state === 'Blood Moon'){
    applyBloodMoonPalette();
    applyMoonTintForWeather();
    weather.modSanityDrain = 1.25;
    weather.modHuntChance = 1.4;
    weather.modHuntPace = 1.2;
    audio.clear.loop=true; audio.clear.volume=0.22; audio.clear.play().catch(()=>{});
    audio.ambient.loop=true; audio.ambient.volume=0.32; audio.ambient.play().catch(()=>{});

  } else { // Clear
    applyNightPalette();
    audio.clear.loop=true; audio.clear.volume=0.25; audio.clear.play().catch(()=>{});
    audio.ambient.loop=true; audio.ambient.volume=0.3; audio.ambient.play().catch(()=>{});
  }
}
