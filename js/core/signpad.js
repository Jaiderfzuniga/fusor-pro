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
  var upload = null; // ImageBitmap de la foto subida
  var ex = null;      // extracción de la foto: ver prepare()

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
      r.addEventListener('change', function(){ color = r.value; redraw(); paintTyped(); rekey(); });
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

    // extraer de una foto
    var upDrop = $('[data-studio-drop]');
    UI.dropzone(upDrop, async function(files){
      var f = files.find(function(x){ return /^image\/(png|jpeg|webp|gif|bmp)$/.test(x.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(x.name); });
      if(!f){ UI.toast('Elige una foto o imagen (JPG o PNG) con tu firma.', 'error'); return; }
      if(f.size > 25 * 1024 * 1024){ UI.toast('La imagen es demasiado grande (máximo 25 MB).', 'error'); return; }
      try{
        var bmp = await createImageBitmap(f);
        dropUpload();
        upload = bmp; ex = { rot: 0 };
        prepare(); autoCrop(); key(); paintUpload(); refresh();
      }catch(err){ UI.toast('No se pudo abrir la imagen.', 'error'); }
    });
    $('#studioKeyBg').addEventListener('change', rekey);
    var sensTimer = 0;
    $('#studioSens').addEventListener('input', function(){
      if(!ex || sensTimer) return;
      sensTimer = requestAnimationFrame(function(){ sensTimer = 0; rekey(); });
    });
    $('[data-extract-rotate]').addEventListener('click', function(){
      if(!ex) return;
      ex.rot = (ex.rot + 1) % 4; ex.ink = null;
      prepare(); autoCrop(); rekey();
    });
    $('[data-extract-auto]').addEventListener('click', function(){ if(ex){ autoCrop(); rekey(); } });
    $('[data-extract-full]').addEventListener('click', function(){ if(ex){ ex.crop = { x: 0, y: 0, w: 1, h: 1 }; rekey(); } });
    $('[data-extract-ink-reset]').addEventListener('click', function(){ if(ex){ ex.ink = null; rekey(); } });
    $('[data-extract-remove]').addEventListener('click', function(){ dropUpload(); paintUpload(); refresh(); upDrop.focus(); });
    cropEvents();

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
    var c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
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

  // ---------- extraer la firma de una foto ----------
  // La luz de una foto nunca es pareja: el tono del papel se estima por zonas
  // (lo más claro de cada bloque) y se mide cuánto más oscuro es cada punto.
  // Dentro del recuadro, la tinta es lo más oscuro y de su mismo color; el resto
  // (papel, sombras, el fondo de colores de una cédula o un carné) se borra.
  var EX_MAX = 2400; // px del lado mayor con que se trabaja

  function dropUpload(){
    if(upload && upload.close) upload.close();
    upload = null; ex = null;
  }

  // Foto girada y reducida, y cuánto más oscuro que el papel es cada punto.
  function prepare(){
    var q = ex.rot % 2 === 1, bw = q ? upload.height : upload.width, bh = q ? upload.width : upload.height;
    var s = Math.min(1, EX_MAX / Math.max(bw, bh));
    var w = Math.max(1, Math.round(bw * s)), h = Math.max(1, Math.round(bh * s));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.translate(w / 2, h / 2);
    ctx.rotate(ex.rot * Math.PI / 2);
    var dw = (q ? h : w), dh = (q ? w : h);
    ctx.drawImage(upload, -dw / 2, -dh / 2, dw, dh);
    var d = ctx.getImageData(0, 0, w, h).data;
    ex.src = c; ex.w = w; ex.h = h;
    ex.transparent = hasTransparency(d);

    var n = w * h, v = new Uint8Array(n), i, x, y;
    for(i = 0; i < n; i++){
      var o = i * 4;
      v[i] = d[o + 3] < 128 ? 255 : Math.min(d[o], d[o + 1], d[o + 2]);
    }
    // papel por bloques: lo más claro de cada bloque y de sus vecinos, suavizado
    var B = Math.max(8, Math.round(Math.max(w, h) / 48));
    var gw = Math.ceil(w / B), gh = Math.ceil(h / B), g = new Float32Array(gw * gh), gx, gy;
    for(y = 0; y < h; y++) for(x = 0; x < w; x++){
      var k = ((y / B) | 0) * gw + ((x / B) | 0), val = v[y * w + x];
      if(val > g[k]) g[k] = val;
    }
    function spread(src, fn){
      var out = new Float32Array(gw * gh);
      for(gy = 0; gy < gh; gy++) for(gx = 0; gx < gw; gx++){
        var acc = 0, cnt = 0;
        for(var yy = Math.max(0, gy - 1); yy <= Math.min(gh - 1, gy + 1); yy++){
          for(var xx = Math.max(0, gx - 1); xx <= Math.min(gw - 1, gx + 1); xx++){
            var t = src[yy * gw + xx];
            if(fn === 'max'){ if(t > acc) acc = t; } else { acc += t; cnt++; }
          }
        }
        out[gy * gw + gx] = fn === 'max' ? acc : acc / cnt;
      }
      return out;
    }
    g = spread(spread(g, 'max'), 'avg');

    // contraste de cada punto contra el papel (interpolado entre bloques)
    var r = new Float32Array(n);
    for(y = 0; y < h; y++){
      var fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
      for(x = 0; x < w; x++){
        var fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
        var top = g[y0 * gw + x0] * (1 - tx) + g[y0 * gw + x1] * tx;
        var bot = g[y1 * gw + x0] * (1 - tx) + g[y1 * gw + x1] * tx;
        var paper = Math.max(40, top * (1 - ty) + bot * ty);
        i = y * w + x;
        r[i] = Math.max(0, paper - v[i]) / paper;
      }
    }
    ex.contrast = r;
    ex.pix = d;
    // trazos de toda la foto, solo para el recuadro automático. Primero lo que
    // resalta mucho (tinta de esfero), para no tomar el fondo de colores de una
    // cédula; si casi no hay, también lo más claro (lápiz, tinta suave).
    var a = new Uint8ClampedArray(n), strong = 0;
    for(i = 0; i < n; i++) if(r[i] > 0.5){ a[i] = 255; strong++; }
    if(strong < n * 0.0005) for(i = 0; i < n; i++) a[i] = r[i] > 0.2 ? 255 : 0;
    ex.parts = ex.transparent ? parts(alphaOf(d, n), w, h, 0) : parts(a, w, h, Math.max(6, n * 0.000012));
  }

  function alphaOf(d, n){ var a = new Uint8ClampedArray(n); for(var i = 0; i < n; i++) a[i] = d[i * 4 + 3]; return a; }

  function cropRect(){
    var cr = ex.crop || { x: 0, y: 0, w: 1, h: 1 };
    var x = Math.round(cr.x * ex.w), y = Math.round(cr.y * ex.h);
    return { x: x, y: y, w: Math.max(1, Math.min(ex.w - x, Math.round(cr.w * ex.w))), h: Math.max(1, Math.min(ex.h - y, Math.round(cr.h * ex.h))) };
  }

  // Color y oscuridad de la tinta: lo tocado por la persona o, si no, lo más
  // oscuro del recuadro (el 2 % de puntos que más resaltan sobre el fondo).
  function inkOf(R){
    if(ex.ink) return ex.ink;
    var r = ex.contrast, d = ex.pix, w = ex.w, hist = new Uint32Array(256), x, y, i, total = R.w * R.h;
    for(y = R.y; y < R.y + R.h; y++) for(x = R.x; x < R.x + R.w; x++) hist[Math.min(255, (r[y * w + x] * 255) | 0)]++;
    var need = Math.max(1, total * 0.02), acc = 0, cut = 255;
    while(cut > 0 && acc + hist[cut] < need){ acc += hist[cut]; cut--; }
    var sum = [0, 0, 0], sr = 0, cnt = 0;
    for(y = R.y; y < R.y + R.h; y++) for(x = R.x; x < R.x + R.w; x++){
      i = y * w + x;
      if(r[i] * 255 >= cut){ sum[0] += d[i * 4]; sum[1] += d[i * 4 + 1]; sum[2] += d[i * 4 + 2]; sr += r[i]; cnt++; }
    }
    return { rgb: [sum[0] / cnt, sum[1] / cnt, sum[2] / cnt], r: sr / cnt };
  }

  // Lo que queda dentro del recuadro: la firma sola, con el color de tinta elegido.
  function key(){
    var R = cropRect(), w = ex.w, n = R.w * R.h, c = document.createElement('canvas'), i, x, y;
    c.width = R.w; c.height = R.h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    var keep = $('#studioKeyBg').checked && !ex.transparent;
    if(!keep){
      ctx.drawImage(ex.src, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
      ex.cut = c; return;
    }
    var r = ex.contrast, d = ex.pix, ink = inkOf(R);
    // el fondo: el tono típico del recuadro (la mediana, porque casi todo es fondo)
    var hist = new Uint32Array(256), ch = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for(y = R.y; y < R.y + R.h; y++) for(x = R.x; x < R.x + R.w; x++){
      i = y * w + x;
      hist[Math.min(255, (r[i] * 255) | 0)]++;
      ch[0][d[i * 4]]++; ch[1][d[i * 4 + 1]]++; ch[2][d[i * 4 + 2]]++;
    }
    function median(hh){ var acc = 0, k = 0; while(k < 255 && acc + hh[k] < n / 2){ acc += hh[k]; k++; } return k; }
    var bgR = median(hist) / 255, bg = [median(ch[0]), median(ch[1]), median(ch[2])];
    var spanR = Math.max(0.06, ink.r - bgR);
    var dist = function(a0, a1, a2){ var p = a0 - ink.rgb[0], q = a1 - ink.rgb[1], s2 = a2 - ink.rgb[2]; return Math.sqrt(p * p + q * q + s2 * s2); };
    var spanC = Math.max(40, dist(bg[0], bg[1], bg[2]));
    // un punto es tinta si es tan oscuro como ella Y de su mismo color
    var sens = +$('#studioSens').value;          // 1 (poca) … 10 (mucha)
    var t = 0.8 - sens * 0.05, lo = t - 0.12, hi = t + 0.12;
    var a = new Uint8ClampedArray(n), j = 0;
    for(y = R.y; y < R.y + R.h; y++) for(x = R.x; x < R.x + R.w; x++, j++){
      i = y * w + x;
      var sd = (r[i] - bgR) / spanR, sc = 1 - dist(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / spanC;
      var k = (Math.min(sd, sc) - lo) / (hi - lo);
      a[j] = k <= 0 ? 0 : k >= 1 ? 255 : k * 255;
    }
    parts(a, R.w, R.h, Math.max(4, n * 0.0001)); // fuera el polvo y los restos del fondo
    var img = ctx.createImageData(R.w, R.h), o = img.data, rgb = hexRgb(color);
    for(j = 0; j < n; j++){ o[j * 4] = rgb[0]; o[j * 4 + 1] = rgb[1]; o[j * 4 + 2] = rgb[2]; o[j * 4 + 3] = a[j]; }
    ctx.putImageData(img, 0, 0);
    ex.cut = c;
  }

  // Tocar un trazo de la firma fija el color de la tinta (útil sobre fondos de colores).
  function pickInk(fx, fy){
    var w = ex.w, cx = Math.round(fx * (w - 1)), cy = Math.round(fy * (ex.h - 1)), best = -1, bi = 0;
    for(var y = Math.max(0, cy - 3); y <= Math.min(ex.h - 1, cy + 3); y++)
      for(var x = Math.max(0, cx - 3); x <= Math.min(w - 1, cx + 3); x++){ var i = y * w + x; if(ex.contrast[i] > best){ best = ex.contrast[i]; bi = i; } }
    ex.ink = { rgb: [ex.pix[bi * 4], ex.pix[bi * 4 + 1], ex.pix[bi * 4 + 2]], r: best };
  }

  // Trazos (zonas unidas de tinta). Los muy pequeños (polvo, grano) se borran.
  function parts(a, w, h, minArea){
    var seen = new Uint8Array(w * h), stack = new Int32Array(w * h), list = [], i;
    for(i = 0; i < w * h; i++){
      if(seen[i] || a[i] < 128) continue;
      var top = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, members = [];
      stack[top++] = i; seen[i] = 1;
      while(top){
        var p = stack[--top], x = p % w, y = (p - x) / w;
        area++; if(area <= minArea) members.push(p);
        if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
        if(x > 0 && !seen[p - 1] && a[p - 1] >= 128){ seen[p - 1] = 1; stack[top++] = p - 1; }
        if(x < w - 1 && !seen[p + 1] && a[p + 1] >= 128){ seen[p + 1] = 1; stack[top++] = p + 1; }
        if(y > 0 && !seen[p - w] && a[p - w] >= 128){ seen[p - w] = 1; stack[top++] = p - w; }
        if(y < h - 1 && !seen[p + w] && a[p + w] >= 128){ seen[p + w] = 1; stack[top++] = p + w; }
      }
      if(minArea && area < minArea){
        // mancha: fuera ella y el borde suave que la rodea
        members.forEach(function(q){ a[q] = 0; });
        for(var yy = Math.max(0, y0 - 1); yy <= Math.min(h - 1, y1 + 1); yy++)
          for(var xx = Math.max(0, x0 - 1); xx <= Math.min(w - 1, x1 + 1); xx++) if(a[yy * w + xx] < 128) a[yy * w + xx] = 0;
        continue;
      }
      list.push({ x0: x0, y0: y0, x1: x1, y1: y1, area: area });
    }
    return list;
  }

  // Recuadro automático: el grupo de trazos más grande, sin lo que toca el borde
  // de la foto (sombras, la orilla del papel o de la mesa).
  function autoCrop(){
    var w = ex.w, h = ex.h, m = Math.max(2, Math.round(Math.min(w, h) * 0.01));
    // fuera también los marcos grandes: la orilla de una cédula o de la hoja sobre la mesa
    var list = ex.parts.filter(function(p){
      return p.x0 > m && p.y0 > m && p.x1 < w - 1 - m && p.y1 < h - 1 - m && !(p.x1 - p.x0 > w * 0.5 && p.y1 - p.y0 > h * 0.5);
    });
    if(!list.length) list = ex.parts.slice();
    if(!list.length){ ex.crop = { x: 0, y: 0, w: 1, h: 1 }; return; }
    // una firma es un trazo largo y suelto: mucha tinta en una caja casi vacía.
    // Las rayas (la línea de firma, un subrayado) y los bloques llenos cuentan poco.
    function line(p){ var bw = p.x1 - p.x0 + 1, bh = p.y1 - p.y0 + 1; return Math.min(bw, bh) / Math.max(bw, bh) < 0.08 && p.area / (bw * bh) > 0.4; }
    function score(p){
      var bw = p.x1 - p.x0 + 1, bh = p.y1 - p.y0 + 1, fill = p.area / (bw * bh);
      return p.area * (1 - fill) * (line(p) ? 0.05 : 1);
    }
    list.sort(function(a, b){ return score(b) - score(a); });
    var gap = Math.max(w, h) * 0.05, box = Object.assign({}, list[0]), used = [list[0]], grew = true;
    while(grew){
      grew = false;
      list.forEach(function(p){
        if(used.indexOf(p) >= 0 || line(p)) return;
        if(p.x0 <= box.x1 + gap && p.x1 >= box.x0 - gap && p.y0 <= box.y1 + gap * 0.6 && p.y1 >= box.y0 - gap * 0.6){
          box.x0 = Math.min(box.x0, p.x0); box.y0 = Math.min(box.y0, p.y0);
          box.x1 = Math.max(box.x1, p.x1); box.y1 = Math.max(box.y1, p.y1);
          used.push(p); grew = true;
        }
      });
    }
    var pad = Math.max(w, h) * 0.015;
    var x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
    var x1 = Math.min(w, box.x1 + 1 + pad), y1 = Math.min(h, box.y1 + 1 + pad);
    ex.crop = { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
  }

  function uploadCanvas(){
    if(!ex) return null;
    if(!ex.cut) key();
    var c = document.createElement('canvas');
    c.width = ex.cut.width; c.height = ex.cut.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(ex.cut, 0, 0);
    return c;
  }

  // La foto completa (lo de fuera del recuadro se oscurece) y, dentro del
  // recuadro, cómo queda la firma sobre la cuadrícula de transparencia.
  function paintUpload(){
    var box = $('[data-extract]'), stage = $('[data-extract-stage]'), crop = $('[data-extract-crop]');
    box.hidden = !ex;
    $('[data-studio-drop]').hidden = !!ex;
    stage.querySelectorAll('canvas').forEach(function(n){ n.remove(); });
    if(!ex) return;
    if(!ex.cut) key();
    ex.src.setAttribute('aria-hidden', 'true');
    ex.src.classList.add('extract__img');
    stage.insertBefore(ex.src, stage.firstChild);
    ex.cut.setAttribute('aria-hidden', 'true');
    ex.cut.classList.add('extract__cut');
    crop.insertBefore(ex.cut, crop.firstChild);
    stage.style.setProperty('--ar', ex.w / ex.h);
    $('[data-extract-sens]').hidden = !!ex.transparent;
    $('[data-extract-ink]').hidden = !ex.ink;
    if(ex.ink) $('[data-extract-ink-dot]').style.setProperty('--dot', 'rgb(' + ex.ink.rgb.map(Math.round).join(',') + ')');
    paintCrop();
  }

  // Recalcula la firma del recuadro y la vuelve a mostrar.
  function rekey(){ if(!ex) return; key(); paintUpload(); }

  function paintCrop(){
    var el = $('[data-extract-crop]'), cr = ex.crop;
    el.style.setProperty('--cx', cr.x); el.style.setProperty('--cy', cr.y);
    el.style.setProperty('--cw', cr.w); el.style.setProperty('--ch', cr.h);
  }

  // Mover el recuadro, cambiar su tamaño por las esquinas o dibujar uno nuevo.
  var keyTimer = 0;
  function cropEvents(){
    var stage = $('[data-extract-stage]'), el = $('[data-extract-crop]'), MIN = 0.03;
    function fix(cr){
      cr.w = Math.max(MIN, Math.min(cr.w, 1)); cr.h = Math.max(MIN, Math.min(cr.h, 1));
      cr.x = Math.max(0, Math.min(cr.x, 1 - cr.w)); cr.y = Math.max(0, Math.min(cr.y, 1 - cr.h));
      return cr;
    }
    stage.addEventListener('pointerdown', function(e){
      if(!ex || e.button > 0) return;
      e.preventDefault();
      var r = stage.getBoundingClientRect();
      var px = function(ev){ return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); };
      var py = function(ev){ return Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)); };
      var handle = e.target.dataset.h, inside = e.target.closest('[data-extract-crop]');
      var start = Object.assign({}, ex.crop), sx = px(e), sy = py(e);
      var mode = handle ? 'resize' : inside ? 'move' : 'draw', moved = false;
      stage.setPointerCapture(e.pointerId);
      function move(ev){
        if(!moved && Math.abs(px(ev) - sx) * r.width < 4 && Math.abs(py(ev) - sy) * r.height < 4) return;
        if(!moved){ moved = true; stage.classList.add('is-dragging'); }
        var x = px(ev), y = py(ev), cr;
        if(mode === 'move') cr = { x: start.x + x - sx, y: start.y + y - sy, w: start.w, h: start.h };
        else if(mode === 'draw') cr = { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
        else{
          var l = start.x, t = start.y, rr = start.x + start.w, b = start.y + start.h;
          if(/w/.test(handle)) l = Math.min(x, rr - MIN); else rr = Math.max(x, l + MIN);
          if(/n/.test(handle)) t = Math.min(y, b - MIN); else b = Math.max(y, t + MIN);
          cr = { x: l, y: t, w: rr - l, h: b - t };
        }
        ex.crop = fix(cr); paintCrop();
      }
      function up(){
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerup', up);
        stage.removeEventListener('pointercancel', up);
        stage.classList.remove('is-dragging');
        if(!moved){
          // un toque dentro del recuadro (también en una esquina) elige el color de la tinta
          var c = ex.crop;
          if(sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h){ pickInk(sx, sy); rekey(); }
          return;
        }
        if(mode === 'draw' && (ex.crop.w <= MIN || ex.crop.h <= MIN)){ ex.crop = start; paintCrop(); }
        rekey();
      }
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
    });
    // teclado: flechas mueven; con Mayús cambian el tamaño
    el.addEventListener('keydown', function(e){
      if(!ex) return;
      var st = 0.01, cr = Object.assign({}, ex.crop), k = e.key;
      if(k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
      e.preventDefault();
      var dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0;
      if(e.shiftKey){ cr.w += dx; cr.h += dy; } else { cr.x += dx; cr.y += dy; }
      ex.crop = fix(cr); paintCrop();
      clearTimeout(keyTimer); keyTimer = setTimeout(rekey, 180);
    });
  }

  function hexRgb(h){ return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  function ready(){
    if(mode === 'draw') return strokes.length > 0;
    if(mode === 'type') return !!$('#studioText').value.trim();
    return !!ex;
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
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
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

  // start: pestaña con la que abre ('draw', 'type' o 'upload'); si no, la última usada.
  function open(done, start){
    if(!dlg) setup();
    if(!dlg) return;
    onDone = done || null;
    strokes = []; current = null;
    $('#studioText').value = '';
    dropUpload(); paintUpload();
    if(typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setMode(start || mode);
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
    var c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.font = font;
    c.width = Math.min(Math.ceil(ctx.measureText(text).width + 24), 6000);
    c.height = Math.round(size * 1.4);
    ctx.font = font;
    ctx.fillStyle = opts.color || '#1c1f2b';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 12, c.height / 2);
    return trim(c, 4);
  }

  // ---------- firma o sello ya hecho (imagen o PDF) ----------
  var SIG_TYPES = /^image\/(png|jpeg|webp|gif|bmp|svg\+xml)$|^application\/pdf$/;
  var SIG_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|pdf)$/i;
  function isSignatureFile(f){ return SIG_TYPES.test(f.type || '') || SIG_EXT.test(f.name || ''); }

  // SVG: createImageBitmap no siempre lo abre; con <img> sí (blob: está permitido).
  function loadSvg(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ resolve(img); };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('No se pudo abrir el SVG.')); };
      img.src = url;
    });
  }

  // ¿La imagen ya trae fondo transparente? (un PNG de firma suele traerlo)
  function hasTransparency(d){
    var n = 0;
    for(var i = 3; i < d.length; i += 4 * 7) if(d[i] < 250 && ++n > 50) return true;
    return false;
  }

  // El papel se vuelve transparente y la tinta conserva su color (sellos azules,
  // rojos…). El tono del papel se toma de los bordes, por si la foto salió gris.
  function keyPaper(canvas){
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var w = canvas.width, h = canvas.height;
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    if(hasTransparency(d)) return;
    var edge = [], bw = Math.max(1, Math.round(Math.min(w, h) * 0.03)), x, y, i;
    for(y = 0; y < h; y += 2) for(x = 0; x < w; x += 2){
      if(x >= bw && x < w - bw && y >= bw && y < h - bw) continue;
      i = (y * w + x) * 4; edge.push(Math.min(d[i], d[i + 1], d[i + 2]));
    }
    edge.sort(function(a, b){ return a - b; });
    var paper = Math.max(150, edge[Math.floor(edge.length / 2)] || 255);
    var hi = paper - 18, lo = paper - 85;
    for(i = 0; i < d.length; i += 4){
      var v = Math.min(d[i], d[i + 1], d[i + 2]);
      var a = v >= hi ? 0 : v <= lo ? 255 : Math.round((hi - v) / (hi - lo) * 255);
      d[i + 3] = Math.round(a * d[i + 3] / 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  // Imagen o PDF (primera página) → { src, w, h } listo para colocar.
  async function fromFile(file){
    if(!isSignatureFile(file)) throw new Error('Usa una imagen (PNG, JPG, SVG…) o un PDF.');
    if(file.size > 20 * 1024 * 1024) throw new Error('Es demasiado grande (máximo 20 MB).');
    var src, c;
    if(/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)){
      var entry = { bytes: new Uint8Array(await file.arrayBuffer()) };
      try{ c = await F.engine.rasterize(entry, 0, 3); }
      catch(e){ c = null; }
      finally{ F.engine.release(entry); }
      if(!c) throw new Error('No se pudo leer el PDF de la firma.');
    }else{
      src = /svg/i.test(file.type) || /\.svg$/i.test(file.name) ? await loadSvg(file) : await F.imaging.load(file);
      var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
      // grande para que se vea nítida; un SVG pequeño se amplía
      var k = Math.min(1600 / Math.max(sw, sh), /svg/i.test(file.type) ? 8 : 1);
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
      c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
      if(src.close) src.close();
      if(src.src && /^blob:/.test(src.src)) URL.revokeObjectURL(src.src);
    }
    keyPaper(c);
    var sig = trim(c, 6);
    if(!sig) throw new Error('No se encontró ninguna firma: la imagen parece vacía.');
    return sig;
  }

  F.signatures = { library: library, open: open, textImage: textImage, fromFile: fromFile, isSignatureFile: isSignatureFile };
  document.addEventListener('DOMContentLoaded', setup);
  if(document.readyState !== 'loading') setup();
})(window.Fusor);
