// File: assets/dev/ui/hud_ui.js
// Tiny HUD wire-up. Listens for standard events to update Weather/Room/Sanity.
(function(){
  "use strict";
  if (window.__PP_HUD_UI__) return; window.__PP_HUD_UI__ = true;

  const $ = sel => document.querySelector(sel);
  const elWeather = ()=> $('#hud-weather');
  const elRoom    = ()=> $('#hud-room');
  const elHunt    = ()=> $('#hud-hunt');
  const elSanity  = ()=> $('#hud-sanity');
  const fill      = ()=> $('#sanity-fill');

  function setText(el, v){ if (el) el.textContent = v; }
  function setSanity(pct){
    pct = Math.max(0, Math.min(100, pct|0));
    setText(elSanity(), `${pct}%`);
    const f = fill(); if (f) f.style.width = `${pct}%`;
  }

  // Default state
  setText(elWeather(), '—');
  setText(elRoom(), 'Van');
  setText(elHunt(), 'Calm');
  setSanity(100);

  // Listeners provided by other systems
  window.addEventListener('pp:hud:weather', e => setText(elWeather(), e.detail?.text || '—'));
  window.addEventListener('pp:hud:room',    e => setText(elRoom(), e.detail?.text || '—'));
  window.addEventListener('pp:hud:hunt',    e => setText(elHunt(), e.detail?.text || 'Calm'));
  window.addEventListener('pp:sanity:update', e => setSanity(e.detail?.percent ?? 100));

  // Expose tiny API for convenience
  window.HUD = {
    weather: t => window.dispatchEvent(new CustomEvent('pp:hud:weather', { detail:{text:t} })),
    room:    t => window.dispatchEvent(new CustomEvent('pp:hud:room',    { detail:{text:t} })),
    hunt:    t => window.dispatchEvent(new CustomEvent('pp:hud:hunt',    { detail:{text:t} })),
    sanity:  n => window.dispatchEvent(new CustomEvent('pp:sanity:update',{ detail:{percent:n} })),
  };
})();
