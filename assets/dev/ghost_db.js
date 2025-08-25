<!-- /assets/dev/ghost_db.js -->
<script>
(function(){
  // Minimal evidence keys used across your systems:
  // 'emf', 'dots', 'writing', 'spiritbox', 'uv', 'freezing'
  window.GHOST_DB = [
    { name:'Spirit',     ev:['emf','writing','spiritbox'] },
    { name:'Wraith',     ev:['emf','dots','spiritbox'] },            // special: no UV prints from salt
    { name:'Phantom',    ev:['spiritbox','dots','uv'] },
    { name:'Poltergeist',ev:['spiritbox','uv','writing'] },
    { name:'Banshee',    ev:['dots','uv','freezing'] },
    { name:'Jinn',       ev:['emf','uv','freezing'] },
    { name:'Mare',       ev:['spiritbox','ghostorb','writing'] },
    { name:'Revenant',   ev:['ghostorb','writing','freezing'] },
    { name:'Shade',      ev:['emf','writing','freezing'] },          // shy behavior
    { name:'Demon',      ev:['uv','writing','freezing'] },
    { name:'Yurei',      ev:['ghostorb','freezing','dots'] },
    { name:'Oni',        ev:['emf','freezing','dots'] },
    { name:'Hantu',      ev:['uv','ghostorb','freezing'] },
    { name:'Goryo',      ev:['emf','dots','uv'] },                    // DOTS on camera
    { name:'Myling',     ev:['emf','uv','writing'] },
    { name:'Onryo',      ev:['spiritbox','ghostorb','freezing'] },
    { name:'The Twins',  ev:['emf','spiritbox','freezing'] },
    { name:'Raiju',      ev:['emf','ghostorb','dots'] },
    { name:'Obake',      ev:['emf','ghostorb','uv'] },               // 30% no-UV prints
    { name:'Mimic',      ev:['spiritbox','uv','freezing'] },
  ];

  // Helper: is current ghost consistent with evidence key?
  window.ghostHasEvidence = function(key){
    try{
      const t = (window.ghost?.type || '').toLowerCase();
      const rec = (Array.isArray(window.GHOST_DB) ? window.GHOST_DB : [])
        .find(g => (g.name||'').toLowerCase() === t);
      return !!(rec && rec.ev && rec.ev.includes(key));
    }catch(_){ return false; }
  };
})();
</script>
