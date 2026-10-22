/* Movimiento: todo explica un cambio de estado o es parte de la firma riso
   (tintas que llegan desregistradas y se alinean). */
(function(F){
  "use strict";
  var EASE = 'cubic-bezier(.16,1,.3,1)';

  function reduced(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function canAnimate(el){ return el && typeof el.animate === 'function'; }

  // FLIP: guarda posiciones antes de redibujar una lista...
  function capture(container, sel){
    var map = {};
    container.querySelectorAll(sel).forEach(function(el){
      map[el.dataset.id] = el.getBoundingClientRect();
    });
    return map;
  }

  // ...y luego anima cada elemento desde donde estaba. Los nuevos se imprimen.
  function play(container, sel, before){
    var fresh = 0, red = reduced();
    container.querySelectorAll(sel).forEach(function(el){
      if(!canAnimate(el)) return;
      var old = before[el.dataset.id];
      if(old){
        if(red) return;
        var now = el.getBoundingClientRect();
        var dx = old.left - now.left, dy = old.top - now.top;
        if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 340, easing: EASE });
      }else{
        var delay = Math.min(fresh++ * 50, 250);
        el.animate(red
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0, transform: 'translateY(10px)', clipPath: 'inset(0 100% 0 0)' },
             { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }],
          { duration: red ? 200 : 520, delay: delay, easing: EASE, fill: 'backwards' });
      }
    });
  }

  // Salida rápida antes de quitar un elemento.
  function exit(el){
    if(!canAnimate(el)) return Promise.resolve();
    var a = el.animate(reduced()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(28px) scale(.98)' }],
      { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    return a.finished.catch(function(){});
  }

  // Números que cuentan hasta su nuevo valor.
  function count(el, to){
    var from = parseInt(el.textContent, 10);
    if(isNaN(from) || from === to || reduced()){ el.textContent = to; return; }
    if(el._raf) cancelAnimationFrame(el._raf);
    var t0 = performance.now(), dur = 420;
    (function step(t){
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * k);
      el.textContent = Math.round(from + (to - from) * (k === 1 ? 1 : e));
      if(k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
    if(canAnimate(el)) el.animate([{ color: 'var(--tool-text)' }, { color: 'inherit' }], { duration: 600, easing: 'ease-out' });
  }

  // Una miniatura recién pintada aparece como tinta que se asienta.
  function inkIn(el){
    if(!canAnimate(el)) return;
    el.animate(reduced()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, filter: 'blur(6px) saturate(2)' }, { opacity: 1, filter: 'none' }],
      { duration: 450, easing: EASE });
  }

  // Reinicia una animación CSS por clase.
  function replay(el, cls){
    if(!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // La tinta de la pestaña activa se desliza hasta su pestaña.
  function slideInk(ink, tab, instant){
    if(!ink || !tab) return;
    if(instant) ink.style.transition = 'none';
    ink.style.width = tab.offsetWidth + 'px';
    ink.style.height = tab.offsetHeight + 'px';
    ink.style.transform = 'translate(' + tab.offsetLeft + 'px,' + tab.offsetTop + 'px)';
    if(instant){ void ink.offsetWidth; ink.style.transition = ''; }
  }

  F.motion = {
    EASE: EASE, reduced: reduced, capture: capture, play: play, exit: exit,
    count: count, inkIn: inkIn, replay: replay, slideInk: slideInk
  };
})(window.Fusor);
