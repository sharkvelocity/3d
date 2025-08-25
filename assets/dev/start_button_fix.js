
/* start_button_fix.js — robust Start button binder + safeStart shim */
(function(){
  if (window.__StartFixReady) return; window.__StartFixReady = true;

  function log(){ try{ console.log("[start-fix]", ...arguments); }catch(_){ } }

  // Minimal async sleep
  function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // Ensure we always have a safeStart that runs your pipeline in order if present
  if (typeof window.safeStart !== "function") {
    window.safeStart = async function safeStart(e){
      try { e && e.preventDefault && e.preventDefault(); } catch(_){}
      if (window.__starting) return;
      window.__starting = true;

      // hide title screen if visible
      try {
        var title = document.getElementById("title-screen") || document.querySelector("#start, .title");
        if (title) title.style.display = "none";
      } catch(_){}

      // show loader if your Loader exists
      try {
        if (window.Loader && Loader.reset) { Loader.reset(); Loader.show(); Loader.label("Initializing…"); Loader.draw && Loader.draw(); }
      } catch(_){}

      // Let other modules hook in
      try { window.dispatchEvent(new CustomEvent("pp:start")); } catch(_){}

      // Execute pipeline if functions exist (await when possible)
      async function maybe(label, fn){
        try{
          if (!fn) return;
          var r = fn();
          if (r && typeof r.then === "function") { await r; }
          log(label, "✓");
        } catch(err){
          console.warn("[start-fix] step failed:", label, err);
        }
      }

      await maybe("loadManifest",        (typeof window.loadManifest        === "function") && (()=>loadManifest()));
      await maybe("prepareEngineScene",  (typeof window.prepareEngineScene  === "function") && (()=>prepareEngineScene()));
      await maybe("setupLightsPreMoon",  (typeof window.setupLightsPreMoon  === "function") && (()=>setupLightsPreMoon()));
      await maybe("loadMoon",            (typeof window.loadMoon            === "function") && (()=>loadMoon()));
      await maybe("WeatherAudio.init",   (window.WeatherAudio && WeatherAudio.init) && (()=>WeatherAudio.init(window.scene)));
      await maybe("PlayerRig.load",      (window.PlayerRig && PlayerRig.load) && (()=>PlayerRig.load()));
      await maybe("loadSelectedMap",     (typeof window.loadSelectedMap     === "function") && (()=>loadSelectedMap()));
      await maybe("applySpawn",          (typeof window.applySpawn          === "function") && (()=>applySpawn()));
      await maybe("pickAndSetWeather",   (typeof window.pickAndSetWeather   === "function") && (()=>pickAndSetWeather()));
      await maybe("markShadowable",      (typeof window.markShadowable      === "function" && window.scene && scene.meshes) && (()=>markShadowable(scene.meshes)));
      await maybe("postInitUI",          (typeof window.postInitUI          === "function") && (()=>postInitUI()));
      await maybe("startRenderLoop",     (typeof window.startRenderLoop     === "function") && (()=>startRenderLoop()));

      // Hide loader
      try { Loader && Loader.hide && Loader.hide(); } catch(_){}

      // Focus canvas and (optionally) request pointer lock
      try {
        var canvas = window.canvas || document.getElementById("renderCanvas") || document.querySelector("canvas");
        canvas && canvas.focus && canvas.focus();
        if (canvas && canvas.requestPointerLock) setTimeout(()=>{ try{ canvas.requestPointerLock(); }catch(_){} }, 0);
      } catch(_){}

      log("Start pipeline complete");
    };
  }

  function bind(){
    var btn = document.getElementById("start-button") || document.querySelector("#start button") || document.querySelector("button[data-start]");
    if (!btn) return false;
    if (btn.__startBound) return true;
    btn.__startBound = true;
    btn.addEventListener("click", window.safeStart, { passive:false });
    log("Bound #start-button");
    return true;
  }

  // Try to bind immediately, then with retries, and on DOMContentLoaded
  (function tryBindLoop(){
    if (bind()) return;
    let tries = 0;
    (function retry(){
      if (bind()) return;
      if (++tries > 100) { log("Start button not found after retries"); return; }
      setTimeout(retry, 100);
    })();
  })();

  // Keyboard shortcuts (Enter / Space) before start
  document.addEventListener("keydown", function(e){
    if (window.__starting) return;
    var k = e.key || e.code || "";
    if (k === "Enter" || k === " " || k === "Space" || k === "Spacebar") {
      try { e.preventDefault(); } catch(_){}
      try { window.safeStart(e); } catch(_){}
    }
  }, { passive:false });

  // Expose small debug
  window.__StartFix = {
    ping(){ log("alive"); return true; },
    click(){ try{ window.safeStart(); } catch(_){ } }
  };
})();
