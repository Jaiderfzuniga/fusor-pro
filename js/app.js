/* Arranque: pestañas de herramientas y enrutado por #hash. */
(function(F){
  "use strict";

  if(!window.PDFLib){
    document.body.insertAdjacentHTML('afterbegin',
      '<p class="fatal">No se pudo cargar pdf-lib (js/vendor/pdf-lib.min.js). Revisa que la carpeta esté completa.</p>');
    return;
  }

  var tabs = Array.from(document.querySelectorAll('.tab'));
  var byHash = {};
  tabs.forEach(function(t){ byHash[t.dataset.hash] = t; });

  F.tools.merge.init(document.getElementById('tool-merge'));
  F.tools.split.init(document.getElementById('tool-split'));
  F.tools.organize.init(document.getElementById('tool-organize'));
  F.tools.sign.init(document.getElementById('tool-sign'));
  F.tools.compress.init(document.getElementById('tool-compress'));
  F.tools.images.init(document.getElementById('tool-images'));
  F.tools.idcard.init(document.getElementById('tool-idcard'));
  F.tools.photo.init(document.getElementById('tool-photo'));

  var ink = document.querySelector('.tabs__ink');
  var current = null;

  function panelTitle(tab){
    var h = document.getElementById(tab.getAttribute('aria-controls')).querySelector('.work__title');
    return h ? h.textContent.trim() : '';
  }

  function select(tab, focus){
    var changed = tab !== current;
    tabs.forEach(function(t){
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    document.body.dataset.tool = tab.dataset.tool;
    document.title = 'FUSOR — ' + (panelTitle(tab) || tab.textContent.trim());
    F.motion.slideInk(ink, tab, current === null);
    if(changed){
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      F.motion.replay(panel.querySelector('.work__title'), 'is-printing');
      F.motion.replay(panel, 'is-entering');
      clearTimeout(panel._enterT);
      panel._enterT = setTimeout(function(){ panel.classList.remove('is-entering'); }, 900);
    }
    current = tab;
    if(focus) tab.focus();
  }

  window.addEventListener('resize', function(){ if(current) F.motion.slideInk(ink, current, true); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(current) F.motion.slideInk(ink, current, true); });

  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      if(location.hash !== '#' + t.dataset.hash) history.replaceState(null, '', '#' + t.dataset.hash);
      select(t);
    });
  });

  // flechas para moverse entre pestañas (patrón ARIA de tabs)
  document.querySelector('.tabs').addEventListener('keydown', function(e){
    var i = tabs.indexOf(document.activeElement);
    if(i < 0) return;
    var n = null;
    if(e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if(e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if(e.key === 'Home') n = 0;
    else if(e.key === 'End') n = tabs.length - 1;
    if(n === null) return;
    e.preventDefault();
    tabs[n].click();
    tabs[n].focus();
  });

  function fromHash(){
    var t = byHash[location.hash.replace('#', '')] || tabs[0];
    select(t);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  // Año del pie de página, siempre el actual.
  var year = document.querySelector('[data-year]');
  if(year) year.textContent = new Date().getFullYear();

  // Evitar que soltar un archivo fuera de la zona lo abra en el navegador.
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){ e.preventDefault(); });
})(window.Fusor);
