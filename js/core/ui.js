/* Piezas de interfaz compartidas: zona para soltar, avisos y la animación
   de sobreimpresión. */
(function(F){
  "use strict";
  var U = F.util;

  // Conecta una zona de soltar con su <input type=file>.
  function dropzone(el, onFiles){
    var input = el.querySelector('input[type=file]');
    var depth = 0;

    el.addEventListener('click', function(){ input.click(); });
    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
    });
    input.addEventListener('click', function(e){ e.stopPropagation(); });
    input.addEventListener('change', function(){
      if(input.files.length) onFiles(Array.from(input.files));
      input.value = '';
    });

    // data-camera="environment" (cámara trasera) o "user" (frontal): botón opcional
    // «Tomar foto» debajo de la zona. Solo se ve en celulares y tabletas (CSS).
    if(el.dataset.camera) camera(el, onFiles);

    el.addEventListener('dragenter', function(e){ e.preventDefault(); depth++; el.classList.add('is-over'); });
    el.addEventListener('dragover', function(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    el.addEventListener('dragleave', function(){ depth = Math.max(0, depth - 1); if(!depth) el.classList.remove('is-over'); });
    el.addEventListener('drop', function(e){
      e.preventDefault(); depth = 0; el.classList.remove('is-over');
      if(e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
    });
  }

  function camera(el, onFiles){
    var cam = document.createElement('input');
    cam.type = 'file'; cam.accept = 'image/*'; cam.hidden = true;
    cam.setAttribute('capture', el.dataset.camera);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--quiet drop__camera';
    btn.innerHTML = U.icon('camera') + '<span>Tomar foto con la cámara</span>';
    btn.addEventListener('click', function(){ cam.click(); });
    cam.addEventListener('change', function(){
      if(cam.files.length) onFiles(Array.from(cam.files));
      cam.value = '';
    });
    // va después de la zona (no dentro: un botón dentro de otro botón no es accesible)
    el.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', cam);
  }

  // Separa PDF de otros archivos y avisa de los descartados.
  function onlyPdfs(files){
    var pdfs = files.filter(U.isPdf);
    var skipped = files.length - pdfs.length;
    if(skipped) toast(U.plural(skipped, 'archivo ignorado', 'archivos ignorados') + ': solo se aceptan PDF.', 'error');
    return pdfs;
  }

  var toastRegion = null;
  function toast(message, type){
    toastRegion = toastRegion || document.querySelector('[data-toasts]');
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast--' + type : '');
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.textContent = message;
    toastRegion.appendChild(t);
    setTimeout(function(){
      t.classList.add('is-leaving');
      setTimeout(function(){ t.remove(); }, 220);
    }, type === 'error' ? 6000 : 3800);
  }

  function setBusy(btn, busy, label){
    btn.classList.toggle('is-busy', busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    if(busy) btn.disabled = true;
    if(label){
      var span = btn.querySelector('span');
      if(span) span.textContent = label;
    }
  }

  // Firma: las hojas salen de la lista, pasan por el rodillo desregistradas,
  // tiemblan hasta quedar en registro y el pliego final viaja al botón.
  var INKS = ['var(--pink)', 'var(--blue)', 'var(--yellow)'];
  async function press(fromEls, toEl){
    if(U.reducedMotion() || !fromEls.length || !document.body.animate) return;
    var layer = document.querySelector('[data-press]');
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var W = 120, H = 160, EASE = 'cubic-bezier(.16,1,.3,1)';
    var t = toEl ? toEl.getBoundingClientRect() : null;
    var tx = t ? (t.left + t.width / 2) - cx : 0, ty = t ? (t.top + t.height / 2) - cy : 0;

    var runs = fromEls.slice(0, 8).map(function(el, i){
      var r = el.getBoundingClientRect();
      var s = document.createElement('div');
      s.className = 'press__sheet';
      s.style.background = INKS[i % INKS.length];
      s.style.left = (cx - W / 2) + 'px';
      s.style.top = (cy - H / 2) + 'px';
      layer.appendChild(s);
      var dx = (r.left + r.width / 2) - cx, dy = (r.top + r.height / 2) - cy;
      var sx = r.width / W, sy = r.height / H;
      var mis = (i - 1) * 9, rot = (i % 2 ? 1 : -1) * (3 + i);
      var frames = [
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: .95, offset: 0 },
        { transform: 'translate(' + mis + 'px,' + (-mis * .6) + 'px) rotate(' + rot + 'deg) scale(1)', opacity: .92, offset: .5, easing: EASE },
        { transform: 'translate(' + (-mis * .35) + 'px,' + (mis * .25) + 'px) rotate(' + (-rot * .3) + 'deg)', offset: .64 },
        { transform: 'translate(' + (mis * .12) + 'px,0) rotate(0deg)', offset: .76 },
        { transform: 'translate(0,0) scale(1)', opacity: .92, offset: .84 },
        { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.12,.08)', opacity: 0, offset: 1 }
      ];
      return s.animate(frames, { duration: 1500, delay: i * 50, easing: 'linear', fill: 'both' }).finished;
    });
    await Promise.all(runs).catch(function(){});
    layer.innerHTML = '';
  }

  F.ui = { dropzone: dropzone, onlyPdfs: onlyPdfs, toast: toast, setBusy: setBusy, press: press };
})(window.Fusor);
