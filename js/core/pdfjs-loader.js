/* Prepara pdf.js (script clásico, incluido en el proyecto) para el resto de la
   app. Publicada o con un servidor local trabaja en un worker aparte; al abrir
   index.html con doble clic (file://) Chrome no permite workers, así que se
   carga el motor en la propia página y pdf.js lo usa directamente. */
(function(){
  "use strict";
  var lib = window.pdfjsLib;
  if(!lib) return; // sin pdf.js la app sigue funcionando, sin miniaturas

  var here = document.currentScript && document.currentScript.src;
  var workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', here || location.href).href;
  lib.GlobalWorkerOptions.workerSrc = workerSrc;

  function ready(){
    window.fusorPdfjsReady = true;
    window.dispatchEvent(new Event('fusor:pdfjs-ready'));
  }

  if(location.protocol === 'file:'){
    var s = document.createElement('script');
    s.src = workerSrc;
    s.onload = ready;
    s.onerror = ready;
    document.head.appendChild(s);
  }else{
    ready();
  }
})();
