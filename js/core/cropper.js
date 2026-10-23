/* Recorte con proporción fija sobre una foto: encontrar el objeto en la foto,
   proponer un recorte y moverlo o cambiar su tamaño con ratón, dedo o teclado.
   Lo usan Ampliar documento y Foto para documentos.
   Un recorte es { x, y, w, h } en píxeles de la foto de trabajo (un canvas). */
(function(F){
  "use strict";
  var MIN = 60; // px mínimos de ancho del recorte

  // Recorte centrado que ocupa una fracción de la foto.
  function initial(c, a, frac){
    frac = frac || 0.92;
    var w = c.width * frac, h = w / a;
    if(h > c.height * frac){ h = c.height * frac; w = h * a; }
    return { x: (c.width - w) / 2, y: (c.height - h) / 2, w: w, h: h };
  }

  // Busca lo que se distingue del color del borde (la mesa o la pared).
  // Devuelve una caja sin proporción, o null si no lo encuentra con claridad.
  function detect(c){
    var k = Math.min(1, 320 / Math.max(c.width, c.height));
    var w = Math.max(8, Math.round(c.width * k)), h = Math.max(8, Math.round(c.height * k));
    var small = document.createElement('canvas'); small.width = w; small.height = h;
    var sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(c, 0, 0, w, h);
    var d = sctx.getImageData(0, 0, w, h).data;
    // color promedio de una franja del 4 % alrededor
    var bw = Math.max(1, Math.round(Math.min(w, h) * 0.04)), r = 0, g = 0, b = 0, n = 0, x, y, i;
    for(y = 0; y < h; y++) for(x = 0; x < w; x++){
      if(x >= bw && x < w - bw && y >= bw && y < h - bw) continue;
      i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    var rows = new Float32Array(h), cols = new Float32Array(w);
    for(y = 0; y < h; y++) for(x = 0; x < w; x++){
      i = (y * w + x) * 4;
      var dist = Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
      if(dist > 90){ rows[y]++; cols[x]++; }
    }
    // filas (o columnas) donde hay al menos la mitad de lo que tiene la más ocupada;
    // así funciona aunque el documento ocupe poco de la foto
    function span(arr, len, total){
      var max = 0, j;
      for(j = 0; j < len; j++) if(arr[j] > max) max = arr[j];
      if(max < total * 0.08) return null;
      var lo = -1, hi = -1;
      for(j = 0; j < len; j++) if(arr[j] >= max * 0.5){ if(lo < 0) lo = j; hi = j; }
      return lo < 0 ? null : [lo, hi + 1];
    }
    var ys = span(rows, h, w), xs = span(cols, w, h);
    if(!ys || !xs) return null;
    var box = { x: xs[0] / k, y: ys[0] / k, w: (xs[1] - xs[0]) / k, h: (ys[1] - ys[0]) / k };
    var area = (box.w * box.h) / (c.width * c.height);
    return area < 0.08 || area > 0.95 ? null : box;
  }

  // Recorte con proporción a alrededor de una caja (se amplía el lado que falte).
  function around(c, box, a){
    var cw = box.w * 1.03, ch = box.h * 1.03;
    if(cw / ch > a) ch = cw / a; else cw = ch * a;
    if(cw > c.width){ cw = c.width; ch = cw / a; }
    if(ch > c.height){ ch = c.height; cw = ch * a; }
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return {
      x: Math.max(0, Math.min(cx - cw / 2, c.width - cw)),
      y: Math.max(0, Math.min(cy - ch / 2, c.height - ch)),
      w: cw, h: ch
    };
  }

  // Ajusta un recorte a la proporción a sin salirse de la foto (lo modifica).
  function fit(crop, c, a){
    var cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    var w = Math.min(crop.w, c.width), h = w / a;
    if(h > c.height){ h = c.height; w = h * a; }
    crop.w = w; crop.h = h;
    crop.x = Math.max(0, Math.min(cx - w / 2, c.width - w));
    crop.y = Math.max(0, Math.min(cy - h / 2, c.height - h));
    return crop;
  }

  // Pone la foto en el escenario (si cambió) y el recuadro en su sitio.
  function paint(stage, work, crop){
    var old = stage.querySelector('canvas');
    if(old && old !== work) old.remove();
    if(!stage.contains(work)){ work.setAttribute('aria-hidden', 'true'); stage.insertBefore(work, stage.firstChild); }
    stage.style.setProperty('--ratio', work.width / work.height);
    place(stage.querySelector('.crop__box'), work, crop);
  }

  function place(box, work, crop){
    var W = work.width, H = work.height;
    box.style.setProperty('--x', crop.x / W); box.style.setProperty('--y', crop.y / H);
    box.style.setProperty('--w', crop.w / W); box.style.setProperty('--h', crop.h / H);
  }

  // Mover el recuadro o cambiar su tamaño desde una esquina (proporción fija).
  // get() devuelve { work, crop } actuales; aspect() la proporción; done() se llama al soltar.
  function attach(stage, get, aspect, done){
    var box = stage.querySelector('.crop__box');
    box.addEventListener('pointerdown', function(e){
      var st = get();
      if(!st.work || e.button > 0) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      var handle = e.target.dataset.h || null;
      var rect = stage.getBoundingClientRect();
      var k = st.work.width / rect.width, c0 = Object.assign({}, st.crop), sx = e.clientX, sy = e.clientY, a = aspect();
      function move(ev){
        var dx = (ev.clientX - sx) * k, dy = (ev.clientY - sy) * k, c = st.crop, W = st.work.width, H = st.work.height;
        if(!handle){
          c.x = Math.max(0, Math.min(c0.x + dx, W - c.w));
          c.y = Math.max(0, Math.min(c0.y + dy, H - c.h));
        }else{
          var east = /e/.test(handle), south = /s/.test(handle);
          var ax = east ? c0.x : c0.x + c0.w, ay = south ? c0.y : c0.y + c0.h; // esquina fija
          var w = c0.w + (east ? dx : -dx), wh = (c0.h + (south ? dy : -dy)) * a;
          w = Math.max(w, wh, MIN);
          w = Math.min(w, east ? W - ax : ax, (south ? H - ay : ay) * a);
          var h = w / a;
          c.w = w; c.h = h;
          c.x = east ? ax : ax - w;
          c.y = south ? ay : ay - h;
        }
        place(box, st.work, c);
      }
      function up(){
        box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up);
        done();
      }
      box.addEventListener('pointermove', move); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    });
    // teclado: flechas mueven, + y - cambian el tamaño
    box.addEventListener('keydown', function(e){
      var st = get();
      if(!st.work) return;
      var c = st.crop, a = aspect(), step = (e.shiftKey ? 0.05 : 0.01) * st.work.width, ok = true;
      if(e.key === 'ArrowLeft') c.x -= step; else if(e.key === 'ArrowRight') c.x += step;
      else if(e.key === 'ArrowUp') c.y -= step; else if(e.key === 'ArrowDown') c.y += step;
      else if(e.key === '+' || e.key === '='){ c.x -= step / 2; c.y -= step / 2 / a; c.w += step; c.h = c.w / a; }
      else if(e.key === '-'){ c.x += step / 2; c.y += step / 2 / a; c.w = Math.max(MIN, c.w - step); c.h = c.w / a; }
      else ok = false;
      if(!ok) return;
      e.preventDefault();
      fit(c, st.work, a); place(box, st.work, c); done();
    });
  }

  F.cropper = { initial: initial, detect: detect, around: around, fit: fit, paint: paint, place: place, attach: attach };
})(window.Fusor);
