/* Firmas: el estudio para crearlas (dibujar, escribir o subir una imagen) y la
   biblioteca que las guarda solo en este navegador (localStorage). */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui;
  var KEY = 'fusor:firmas';
  var MAX_SAVED = 12;

  // ---------- biblioteca ----------
  var items = [];      // { id, src, w, h, saved }
  var listeners = [];

  function load(){
    try{
      var raw = window.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : [];
      items = Array.isArray(data) ? data.filter(function(s){
        return s && typeof s.src === 'string' && /^data:image\/png;base64,/.test(s.src) && s.w > 0 && s.h > 0;
      }).map(function(s){ return { id: String(s.id || U.uid()), src: s.src, w: +s.w, h: +s.h, saved: true }; }) : [];
    }catch(e){ items = []; }
  }

  function persist(){
    try{
      var keep = items.filter(function(s){ return s.saved; }).map(function(s){ return { id: s.id, src: s.src, w: s.w, h: s.h }; });
      window.localStorage.setItem(KEY, JSON.stringify(keep));
      return true;
    }catch(e){ return false; }
  }

  function emit(){ listeners.forEach(function(fn){ fn(items.slice()); }); }

  var library = {
    list: function(){ return items.slice(); },
    get: function(id){ return items.find(function(s){ return s.id === id; }) || null; },
    add: function(sig, save){
      var s = { id: U.uid(), src: sig.src, w: sig.w, h: sig.h, saved: !!save };
      items.unshift(s);
      if(save){
        var saved = items.filter(function(x){ return x.saved; });
        if(saved.length > MAX_SAVED) saved.slice(MAX_SAVED).forEach(function(x){ x.saved = false; });
        if(!persist()){ s.saved = false; UI.toast('No se pudo guardar la firma en este navegador; está disponible mientras no cierres la página.', 'error'); }
      }
      emit();
      return s;
    },
    remove: function(id){
      items = items.filter(function(s){ return s.id !== id; });
      persist(); emit();
    },
    onChange: function(fn){ listeners.push(fn); }
  };
  load();

  // ---------- utilidades de lienzo ----------
  // Recorta lo transparente alrededor y devuelve { src, w, h } o null si está vacío.
  function trim(canvas, padding){
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var w = canvas.width, h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for(var y = 0; y < h; y++){
      for(var x = 0; x < w; x++){
        if(data[(y * w + x) * 4 + 3] > 8){
          if(x < x0) x0 = x; if(x > x1) x1 = x;
          if(y < y0) y0 = y; if(y > y1) y1 = y;
        }
      }
    }
    if(x1 < 0) return null;
    var p = padding || 0;
    x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p);
    x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
    var out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return { src: out.toDataURL('image/png'), w: out.width, h: out.height };
  }

  // ---------- estudio ----------
  var dlg, onDone = null, mode = 'draw';
  var pad, padCtx, strokes = [], current = null, dpr = 1;
  var color = '#1c1f2b', weight = 3;
  var typedFont = 'Great Vibes';
  var upload = null; // ImageBitmap de la imagen subida

  function $(s){ return dlg.querySelector(s); }

  function setup(){
    if(dlg) return;
    dlg = document.querySelector('[data-studio]');
    if(!dlg) return;
    pad = $('[data-studio-pad]');
    padCtx = pad.getContext('2d');

    dlg.querySelectorAll('[data-studio-tab]').forEach(function(t){
      t.addEventListener('click', function(){ setMode(t.dataset.studioTab); });
    });
    $('[role=tablist]').addEventListener('keydown', function(e){
      var tabs = Array.from(dlg.querySelectorAll('[data-studio-tab]'));
      var i = tabs.indexOf(document.activeElement); if(i < 0) return;
      var n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : null;
      if(n === null) return;
      e.preventDefault(); setMode(tabs[n].dataset.studioTab); tabs[n].focus();
    });

    dlg.querySelectorAll('[data-studio-close]').forEach(function(b){ b.addEventListener('click', function(){ close(); }); });
    dlg.addEventListener('cancel', function(e){ e.preventDefault(); close(); });
    dlg.addEventListener('click', function(e){ if(e.target === dlg) close(); });

    dlg.querySelectorAll('input[name=studioColor]').forEach(function(r){
      r.addEventListener('change', function(){ color = r.value; redraw(); paintTyped(); paintUpload(); });
    });
    $('#studioWeight').addEventListener('input', function(e){ weight = +e.target.value; redraw(); });
    $('[data-studio-clear]').addEventListener('click', function(){ strokes = []; redraw(); refresh(); });
    $('[data-studio-undo]').addEventListener('click', function(){ strokes.pop(); redraw(); refresh(); });

    // dibujar con ratón, lápiz o dedo
    pad.addEventListener('pointerdown', function(e){
      if(e.button > 0) return;
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      current = [point(e)];
      strokes.push(current);
      redraw(); refresh();
    });
    pad.addEventListener('pointermove', function(e){
      if(!current) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(function(ev){ current.push(point(ev)); });
      redraw();
    });
    function end(){ current = null; }
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('keydown', function(e){
      if((e.key === 'Delete' || e.key === 'Backspace') && strokes.length){ e.preventDefault(); strokes = []; redraw(); refresh(); }
    });

    // escribir
    var typed = $('#studioText');
    typed.addEventListener('input', function(){ paintTyped(); refresh(); });
    dlg.querySelectorAll('input[name=studioFont]').forEach(function(r){
      r.addEventListener('change', function(){ typedFont = r.value; paintTyped(); });
    });

    // subir imagen
    var upDrop = $('[data-studio-drop]');
    UI.dropzone(upDrop, async function(files){
      var f = files.find(function(x){ return /^image\/(png|jpeg|webp|gif|bmp)$/.test(x.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(x.name); });
      if(!f){ UI.toast('Elige una imagen PNG o JPG con tu firma.', 'error'); return; }
      if(f.size > 20 * 1024 * 1024){ UI.toast('La imagen es demasiado grande (máximo 20 MB).', 'error'); return; }
      try{
        if(upload && upload.close) upload.close();
        upload = await createImageBitmap(f);
        paintUpload(); refresh();
      }catch(err){ UI.toast('No se pudo abrir la imagen.', 'error'); }
    });
    $('#studioKeyBg').addEventListener('change', function(){ paintUpload(); });

    $('[data-studio-use]').addEventListener('click', use);

    window.addEventListener('resize', function(){ if(dlg.open && mode === 'draw') sizePad(); });
  }

  function point(e){
    var r = pad.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5 };
  }

  function sizePad(){
    var r = pad.getBoundingClientRect();
    if(!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    pad.width = Math.round(r.width * dpr);
    pad.height = Math.round(r.height * dpr);
    redraw();
  }

  // Trazos suavizados (curvas por los puntos medios) con grosor que sigue la presión.
  function strokeOn(ctx, s, k){
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if(s.length === 1){
      ctx.beginPath(); ctx.arc(s[0].x * k, s[0].y * k, weight * k * 0.6, 0, Math.PI * 2); ctx.fill();
      return;
    }
    for(var i = 1; i < s.length; i++){
      var a = s[i - 1], b = s[i];
      var m0 = i > 1 ? { x: (s[i - 2].x + a.x) / 2, y: (s[i - 2].y + a.y) / 2 } : a;
      var m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.lineWidth = weight * k * (0.6 + b.p * 0.8);
      ctx.beginPath();
      ctx.moveTo(m0.x * k, m0.y * k);
      ctx.quadraticCurveTo(a.x * k, a.y * k, m1.x * k, m1.y * k);
      ctx.stroke();
    }
    var last = s[s.length - 1], prev = s[s.length - 2];
    ctx.beginPath(); ctx.moveTo((prev.x + last.x) / 2 * k, (prev.y + last.y) / 2 * k); ctx.lineTo(last.x * k, last.y * k); ctx.stroke();
  }

  function redraw(){
    if(!padCtx) return;
    padCtx.clearRect(0, 0, pad.width, pad.height);
    strokes.forEach(function(s){ strokeOn(padCtx, s, dpr); });
    $('[data-studio-pad-hint]').hidden = strokes.length > 0;
  }

  function typedCanvas(){
    var text = $('#studioText').value.trim();
    if(!text) return null;
    var size = 140;
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = size + 'px "' + typedFont + '"';
    var w = Math.ceil(ctx.measureText(text).width + size);
    c.width = Math.min(w, 4000); c.height = Math.round(size * 1.8);
    ctx.font = size + 'px "' + typedFont + '"';
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, c.height / 2);
    return c;
  }

  function paintTyped(){
    var preview = $('[data-studio-typed]');
    var text = $('#studioText').value.trim();
    preview.textContent = text || 'Tu nombre';
    preview.classList.toggle('is-empty', !text);
    preview.style.setProperty('--sig-font', '"' + typedFont + '"');
    preview.style.setProperty('--sig-color', color);
    dlg.querySelectorAll('[data-font-sample]').forEach(function(s){ s.textContent = text || 'Tu nombre'; });
  }

  function uploadCanvas(){
    if(!upload) return null;
    var max = 1600, s = Math.min(1, max / Math.max(upload.width, upload.height));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(upload.width * s)); c.height = Math.max(1, Math.round(upload.height * s));
    var ctx = c.getContext('2d');
    ctx.drawImage(upload, 0, 0, c.width, c.height);
    if($('#studioKeyBg').checked){
      // el papel claro se vuelve transparente y el trazo toma el color elegido
      var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
      var rgb = hexRgb(color);
      for(var i = 0; i < d.length; i += 4){
        var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        var a = l > 205 ? 0 : l < 120 ? 255 : Math.round((205 - l) / 85 * 255);
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
        d[i + 3] = Math.round(a * d[i + 3] / 255);
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  function paintUpload(){
    var holder = $('[data-studio-preview]');
    holder.innerHTML = '';
    var c = uploadCanvas();
    holder.hidden = !c;
    if(c){ c.setAttribute('aria-hidden', 'true'); holder.appendChild(c); }
  }

  function hexRgb(h){ return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  function ready(){
    if(mode === 'draw') return strokes.length > 0;
    if(mode === 'type') return !!$('#studioText').value.trim();
    return !!upload;
  }

  function refresh(){ $('[data-studio-use]').disabled = !ready(); }

  function setMode(m){
    mode = m;
    dlg.querySelectorAll('[data-studio-tab]').forEach(function(t){
      var on = t.dataset.studioTab === m;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    if(m === 'draw') requestAnimationFrame(sizePad);
    if(m === 'type'){
      paintTyped();
      // las tipografías de firma se cargan al usarlas por primera vez
      if(document.fonts) ['Great Vibes', 'Dancing Script', 'Caveat'].forEach(function(f){ document.fonts.load('40px "' + f + '"'); });
    }
    refresh();
  }

  async function use(){
    if(!ready()) return;
    var canvas;
    if(mode === 'draw'){
      // se vuelve a dibujar a 3× para que la firma sea nítida al imprimir
      var r = pad.getBoundingClientRect(), k = 3;
      canvas = document.createElement('canvas');
      canvas.width = Math.round(r.width * k); canvas.height = Math.round(r.height * k);
      var ctx = canvas.getContext('2d');
      strokes.forEach(function(s){ strokeOn(ctx, s, k); });
    }else if(mode === 'type'){
      if(document.fonts) await document.fonts.load('140px "' + typedFont + '"', $('#studioText').value);
      canvas = typedCanvas();
    }else{
      canvas = uploadCanvas();
    }
    var sig = canvas && trim(canvas, 6);
    if(!sig){ UI.toast('La firma está vacía.', 'error'); return; }
    var saved = library.add(sig, $('#studioSave').checked);
    var cb = onDone;
    close();
    if(cb) cb(saved);
  }

  function open(done){
    if(!dlg) setup();
    if(!dlg) return;
    onDone = done || null;
    strokes = []; current = null;
    $('#studioText').value = '';
    if(upload && upload.close) upload.close();
    upload = null; paintUpload();
    if(typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setMode(mode);
    var first = dlg.querySelector('[data-studio-tab][aria-selected=true]');
    if(first) first.focus();
  }

  function close(){
    if(!dlg) return;
    current = null;
    if(typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
    onDone = null;
  }

  // Texto suelto (nombre, fecha, cargo…) como imagen nítida para colocarla igual que una firma.
  function textImage(text, opts){
    opts = opts || {};
    var size = 72;
    var font = (opts.weight || 600) + ' ' + size + 'px ' + (opts.family || 'Archivo, system-ui, sans-serif');
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = font;
    c.width = Math.min(Math.ceil(ctx.measureText(text).width + 24), 6000);
    c.height = Math.round(size * 1.4);
    ctx.font = font;
    ctx.fillStyle = opts.color || '#1c1f2b';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 12, c.height / 2);
    return trim(c, 4);
  }

  F.signatures = { library: library, open: open, textImage: textImage };
  document.addEventListener('DOMContentLoaded', setup);
  if(document.readyState !== 'loading') setup();
})(window.Fusor);
