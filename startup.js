// startup.js (ES module)
// Builds button/tap UI for Weather + Loadout and calls window.boot() when ready.
// Exposes chosen options to the game via window.__START_OPTIONS__.

const STORAGE_ITEMS = [
  'Flashlight','UV Light','Camera','EMF','Spirit Box','Thermometer',
  'Crucifix','Salt','Smudge','D.O.T.S','Ghost Writing Book','Motion Sensor'
];

const DEFAULT_WEATHER = 'Auto';

const state = {
  weather: DEFAULT_WEATHER,
  selected: new Set(), // up to 3
  overlayWin: null,
  devListen: false
};

const $  = (q, sc=document) => sc.querySelector(q);
const $$ = (q, sc=document) => Array.from(sc.querySelectorAll(q));

/* ============== Build Loadout buttons (no checkboxes) ============== */
function buildLoadoutGrid(){
  const grid = $('#loadout-grid');
  grid.innerHTML = '';
  STORAGE_ITEMS.forEach(name=>{
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = name;
    btn.dataset.item = name;
    btn.addEventListener('click', ()=>{
      toggleSelect(name, btn);
    });
    grid.appendChild(btn);
  });
  refreshCount();
}

function toggleSelect(name, btnEl){
  if (state.selected.has(name)){
    state.selected.delete(name);
    btnEl.classList.remove('active');
  } else {
    if (state.selected.size >= 3){
      // swap last selected to this one (tap-friendly flow)
      const last = Array.from(state.selected).pop();
      if (last){
        state.selected.delete(last);
        const lastBtn = $(`button[data-item="${cssEscape(last)}"]`, document);
        if (lastBtn) lastBtn.classList.remove('active');
      }
    }
    state.selected.add(name);
    btnEl.classList.add('active');
  }
  refreshCount();
}

function refreshCount(){
  $('#sel-count').textContent = String(state.selected.size);
  $('#start-button').disabled = (state.selected.size === 0);
}

// tiny helper for attribute-safe selection
function cssEscape(str){ return str.replace(/"/g, '\\"'); }

/* ============== Weather buttons ============== */
function bindWeather(){
  const btns = $$('.weather-btn');
  btns.forEach(b=>{
    if (b.dataset.weather === state.weather){
      b.classList.add('active');
    }
    b.addEventListener('click', ()=>{
      btns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.weather = b.dataset.weather || DEFAULT_WEATHER;
      $('#sel-weather').textContent = state.weather;
    });
  });
  $('#sel-weather').textContent = state.weather;
}

/* ============== Dev overlay hookup ============== */
function postToOverlay(payload){
  if (state.overlayWin && !state.overlayWin.closed){
    try{ state.overlayWin.postMessage(payload, '*'); }catch{}
  }
}

function openOverlay(){
  try{
    state.overlayWin = window.open('./devtools_overlay.html','devtools_overlay','width=560,height=760');
    // try to handshake shortly after open
    setTimeout(()=> postToOverlay({ type:'handshake', hello:true }), 350);
  }catch(e){
    console.warn('Popup blocked:', e);
    alert('Popup blocked. Please allow popups for this site.');
  }
}

function bindDevButtons(){
  $('#btn-open-overlay')?.addEventListener('click', openOverlay);
  $('#btn-enable-dev')?.addEventListener('click', ()=>{
    state.devListen = !state.devListen;
    $('#btn-enable-dev').classList.toggle('active', state.devListen);
    $('#btn-enable-dev').textContent = state.devListen ? 'Disable Developer Listen' : 'Enable Developer Listen';
    postToOverlay({ type:'log', text:`Developer Listen: ${state.devListen?'ON':'OFF'}`});
  });

  // respond to overlay “hello”
  window.addEventListener('message', (ev)=>{
    const d = ev.data || {};
    if (d.type === 'overlay-hello'){
      postToOverlay({ type:'handshake', hello:true });
    }
  });
}

/* ============== Start button ============== */
function bindStart(){
  const start = $('#start-button');
  start.addEventListener('click', ()=>{
    // package options for the game
    window.__START_OPTIONS__ = {
      weather: state.weather,                  // 'Auto'|'Clear'|'Rain'|'Snow'|'Blood Moon'
      loadout: Array.from(state.selected),     // up to 3
      fixedSlots: { 4:'Lighter', 5:'Notebook' },
      devListen: state.devListen
    };

    // Hide startup UI now (user gesture satisfied for audio)
    $('#title-screen').style.display = 'none';

    // Hand off to the main game
    if (typeof window.boot === 'function'){
      try{
        window.boot(); // your main game should read window.__START_OPTIONS__
      }catch(err){
        console.error('[Startup] boot() threw:', err);
        alert('Error starting the game (check console).');
      }
    } else {
      console.error('[Startup] window.boot() not found. Ensure your main script defines boot().');
      alert('[Startup] window.boot() not found. Ensure your main script defines boot().');
    }
  });
}

/* ============== Public entry ============== */
function init(){
  buildLoadoutGrid();
  bindWeather();
  bindDevButtons();
  bindStart();
}

// Expose a boot shim in case index wants to call it early (optional)
window.addEventListener('DOMContentLoaded', init);
