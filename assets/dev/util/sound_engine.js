/* sound_engine.js — centralized audio system for footsteps, sfx, ambience */
(function(){
  if (window.SoundEngine) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  function unlock() {
    if (ctx.state === "suspended") ctx.resume();
  }
  document.body.addEventListener("pointerdown", unlock, {once:true});
  document.body.addEventListener("keydown", unlock, {once:true});

  const cache = {};

  async function loadSound(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    cache[url] = audio;
    return audio;
  }

  async function play(url, vol=1.0, loop=false) {
    try {
      const buf = await loadSound(url);
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      src.loop = loop;
      gain.gain.value = vol;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
      return src;
    } catch (e) { console.warn("SoundEngine play failed", url, e); }
    return null;
  }

  window.SoundEngine = {
    ctx, play, loadSound, unlock,
    footstep(surface) {
      const map = {
        gravel: "./assets/audio/footstep_gravel.mp3",
        gravel2: "./assets/audio/footstep_gravel_2.mp3",
        wood: "./assets/audio/footstep_wood_2.mp3",
        wood2: "./assets/audio/footstep_wood_3.mp3",
        asphalt: "./assets/audio/footstep_asphalt_2.mp3",
        asphalt2: "./assets/audio/footstep_asphalt_3.mp3",
        carpet: "./assets/audio/footstep_carpet_2.mp3",
        carpet2: "./assets/audio/footstep_carpet_3.mp3",
        default: "./assets/audio/footstep.mp3"
      };
      const url = map[surface] || map.default;
      play(url, 0.9, false);
    },
    sfx: {
      toss: () => play("./assets/audio/Toss.wav"),
      whisper: () => play("./assets/audio/whisper.mp3"),
      radio: () => play("./assets/audio/Radio.mp3"),
      notebook: () => play("./assets/audio/notebook_open.mp3"),
      writing: () => play("./assets/audio/GhostWriting1.mp3"),
      slam1: () => play("./assets/audio/doorSlam1.mp3"),
      slam2: () => play("./assets/audio/doorSlam2.mp3"),
      creak1: () => play("./assets/audio/doorCreak1.mp3"),
      creak2: () => play("./assets/audio/doorCreak2.mp3"),
      laugh: () => play("./assets/audio/ghostLaugh.mp3"),
      killed: () => play("./assets/audio/gameKilled.mp3"),
      tarot: () => play("./assets/audio/tarot_card_flip.mp3"),
      musicBox: () => play("./assets/audio/music_box_play.mp3"),
    },
    ambient: {
      clear: () => play("./assets/audio/clearWeather.mp3", 0.5, true),
      rain:  () => play("./assets/audio/rainstorm.mp3", 0.6, true),
      loop:  () => play("./assets/audio/ambient.mp3", 0.5, true),
    }
  };
})();
