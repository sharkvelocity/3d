// Redirect shim: keep older loaders happy by chaining to the config file.
(function () {
  var s = document.createElement("script");
  s.src = "./assets/models/map/Abandoned_House.config.js";
  s.async = true;
  s.onload = s.onerror = function(){};
  document.head.appendChild(s);
})();
