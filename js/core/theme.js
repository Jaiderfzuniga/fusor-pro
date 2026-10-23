/* Modo claro u oscuro. Se carga en <head> para aplicar el tema antes de pintar
   (sin parpadeo). Sin elección guardada, sigue la configuración del sistema. */
(function(){
  "use strict";
  var KEY = 'fusor:tema';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved(){ try{ var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; }catch(e){ return null; } }
  function system(){ return media && media.matches ? 'dark' : 'light'; }

  function apply(theme){
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', theme === 'dark' ? '#14161f' : '#f4f5f7');
    var btn = document.querySelector('[data-theme-toggle]');
    if(btn){
      var dark = theme === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      btn.title = dark ? 'Modo claro' : 'Modo oscuro';
    }
  }

  apply(saved() || system());

  // si la persona no eligió, el tema cambia junto con el del sistema
  if(media){
    var onChange = function(){ if(!saved()) apply(system()); };
    if(media.addEventListener) media.addEventListener('change', onChange); else if(media.addListener) media.addListener(onChange);
  }

  document.addEventListener('DOMContentLoaded', function(){
    var btn = document.querySelector('[data-theme-toggle]');
    if(!btn) return;
    apply(root.dataset.theme);
    btn.addEventListener('click', function(){
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try{ localStorage.setItem(KEY, next); }catch(e){}
      root.classList.add('is-theming');
      apply(next);
      setTimeout(function(){ root.classList.remove('is-theming'); }, 400);
    });
  });
})();
