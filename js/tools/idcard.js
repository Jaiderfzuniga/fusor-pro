/* Herramienta: Ampliar documento. Fotos del frente y el reverso de una cédula
   (u otro documento) recortadas, saneadas y puestas en una hoja a su tamaño
   real ampliado (100 %, 150 %, 200 %), como piden muchos trámites. */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui, IM = F.imaging;
  var MM = 72 / 25.4;
  var DOCS = {
    card:     { w: 85.6, h: 54, label: 'cédula' },
    passport: { w: 125, h: 88, label: 'pasaporte' }
  };
  var SHEETS = {
    letter: { w: 215.9, h: 279.4, label: 'Carta' },
    legal:  { w: 215.9, h: 330.2, label: 'Oficio' },
    a4:     { w: 210, h: 297, label: 'A4' }
  };
  var MARGIN = 12, GAP = 12; // mm
  var WORK_MAX = 3000;       // px del lado mayor de la foto de trabajo

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var preview = $('[data-id-preview]'), previewNote = $('[data-id-preview-note]');
    var nameInput = $('#idName'), extEl = $('[data-id-ext]');
    var go = $('[data-id-go]'), goLabel = $('[data-id-go-label]'), hint = $('[data-id-hint]');
    var result = $('[data-id-result]'), resultMeta = $('[data-id-result-meta]'), again = $('[data-id-download]');
    var busy = false, lastUrl = null, previewT = null;

    var slots = {};
    root.querySelectorAll('[data-id-slot]').forEach(function(el){
      var key = el.dataset.idSlot;
      var s = slots[key] = { key: key, el: el, bitmap: null, rotate: 0, work: null, crop: null };
      UI.dropzone(el.querySelector('[data-drop]'), async function(files){
        var f = files.find(IM.isImage);
        if(!f){ UI.toast('Elige una foto JPG o PNG del documento.', 'error'); return; }
        try{
          var bmp = await IM.load(f);
          if(s.bitmap && s.bitmap.close) s.bitmap.close();
          s.bitmap = bmp; s.rotate = 0;
          prepare(s, true);
          // el documento quedó de pie en la foto: se acuesta (si queda al revés, «Girar»)
          var box = detectBox(s.work);
          if(box && box.h > box.w * 1.15){ s.rotate = 90; prepare(s, true); }
        }catch(err){ UI.toast(f.name + ': ' + err.message, 'error'); }
      });
      el.querySelector('[data-id-rotate]').addEventListener('click', function(){ if(!s.bitmap) return; s.rotate = (s.rotate + 90) % 360; prepare(s, true); });
      el.querySelector('[data-id-remove]').addEventListener('click', function(){
        if(s.bitmap && s.bitmap.close) s.bitmap.close();
        s.bitmap = s.work = s.crop = null;
        paintSlot(s); schedule();
      });
      cropper(s);
    });

    function opt(name){ var r = root.querySelector('input[name=' + name + ']:checked'); return r ? r.value : null; }
    function docSize(){ return DOCS[opt('idDoc')] || DOCS.card; }
    function aspect(){ var d = docSize(); return d.w / d.h; }

    // Foto de trabajo (girada y limitada) y recorte inicial centrado con la proporción del documento.
    function prepare(s, resetCrop){
      s.work = IM.draw(s.bitmap, s.rotate, WORK_MAX);
      if(resetCrop || !s.crop){ var box = detectBox(s.work); s.crop = box ? aroundBox(s.work, box) : initialCrop(s.work); }
      paintSlot(s); schedule();
    }

    function initialCrop(c){
      var a = aspect(), w = c.width * 0.92, h = w / a;
      if(h > c.height * 0.92){ h = c.height * 0.92; w = h * a; }
      return { x: (c.width - w) / 2, y: (c.height - h) / 2, w: w, h: h };
    }

    // Busca el documento en la foto: lo que se distingue del color del borde (la mesa).
    // Si no lo encuentra con claridad, devuelve null y se usa el recorte centrado.
    function detectBox(c){
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
      function span(arr, len, total){
        var lo = -1, hi = -1;
        for(var j = 0; j < len; j++) if(arr[j] / total > 0.3){ if(lo < 0) lo = j; hi = j; }
        return lo < 0 ? null : [lo, hi + 1];
      }
      var ys = span(rows, h, w), xs = span(cols, w, h);
      if(!ys || !xs) return null;
      var box = { x: xs[0] / k, y: ys[0] / k, w: (xs[1] - xs[0]) / k, h: (ys[1] - ys[0]) / k };
      var area = (box.w * box.h) / (c.width * c.height);
      return area < 0.08 || area > 0.95 ? null : box;
    }

    // Recorte con la proporción del documento alrededor de lo detectado (se amplía el lado que falte).
    function aroundBox(c, box){
      var bx = box.x, by = box.y, bwid = box.w, bhei = box.h;
      var a = aspect(), cw = bwid * 1.03, ch = bhei * 1.03;
      if(cw / ch > a) ch = cw / a; else cw = ch * a;
      if(cw > c.width){ cw = c.width; ch = cw / a; }
      if(ch > c.height){ ch = c.height; cw = ch * a; }
      var cx = bx + bwid / 2, cy = by + bhei / 2;
      return {
        x: Math.max(0, Math.min(cx - cw / 2, c.width - cw)),
        y: Math.max(0, Math.min(cy - ch / 2, c.height - ch)),
        w: cw, h: ch
      };
    }

    // Ajusta un recorte a la proporción actual sin salirse de la foto.
    function fitCrop(s){
      var c = s.crop, a = aspect(), cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      var w = Math.min(c.w, s.work.width), h = w / a;
      if(h > s.work.height){ h = s.work.height; w = h * a; }
      c.w = w; c.h = h;
      c.x = Math.max(0, Math.min(cx - w / 2, s.work.width - w));
      c.y = Math.max(0, Math.min(cy - h / 2, s.work.height - h));
    }

    function paintSlot(s){
      var has = !!s.work;
      s.el.querySelector('[data-drop]').hidden = has;
      var box = s.el.querySelector('[data-id-crop]');
      box.hidden = !has;
      s.el.querySelector('[data-id-actions]').hidden = !has;
      if(!has) return;
      var stage = box.querySelector('.crop__stage');
      var old = stage.querySelector('canvas'); if(old && old !== s.work) old.remove();
      if(!stage.contains(s.work)){ s.work.setAttribute('aria-hidden', 'true'); stage.insertBefore(s.work, stage.firstChild); }
      stage.style.setProperty('--ratio', s.work.width / s.work.height);
      placeBox(s);
    }

    function placeBox(s){
      var r = s.el.querySelector('.crop__box'), c = s.crop, W = s.work.width, H = s.work.height;
      r.style.setProperty('--x', c.x / W); r.style.setProperty('--y', c.y / H);
      r.style.setProperty('--w', c.w / W); r.style.setProperty('--h', c.h / H);
    }

    // Mover el recorte o cambiar su tamaño desde una esquina (con la proporción fija).
    function cropper(s){
      var box = s.el.querySelector('.crop__box');
      box.addEventListener('pointerdown', function(e){
        if(!s.work || e.button > 0) return;
        e.preventDefault();
        box.setPointerCapture(e.pointerId);
        var handle = e.target.dataset.h || null;
        var rect = s.el.querySelector('.crop__stage').getBoundingClientRect();
        var k = s.work.width / rect.width, c0 = Object.assign({}, s.crop), sx = e.clientX, sy = e.clientY, a = aspect();
        function move(ev){
          var dx = (ev.clientX - sx) * k, dy = (ev.clientY - sy) * k, c = s.crop, W = s.work.width, H = s.work.height;
          if(!handle){
            c.x = Math.max(0, Math.min(c0.x + dx, W - c.w));
            c.y = Math.max(0, Math.min(c0.y + dy, H - c.h));
          }else{
            var east = /e/.test(handle), south = /s/.test(handle);
            var ax = east ? c0.x : c0.x + c0.w, ay = south ? c0.y : c0.y + c0.h; // esquina fija
            var w = c0.w + (east ? dx : -dx), wh = (c0.h + (south ? dy : -dy)) * a;
            w = Math.max(w, wh, 60);
            var maxW = Math.min(east ? W - ax : ax, (south ? H - ay : ay) * a);
            w = Math.min(w, maxW);
            var h = w / a;
            c.w = w; c.h = h;
            c.x = east ? ax : ax - w;
            c.y = south ? ay : ay - h;
          }
          placeBox(s);
        }
        function up(){
          box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up);
          schedule();
        }
        box.addEventListener('pointermove', move); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
      });
      // teclado: flechas mueven, + y - cambian el tamaño
      box.addEventListener('keydown', function(e){
        if(!s.work) return;
        var c = s.crop, step = (e.shiftKey ? 0.05 : 0.01) * s.work.width, done = true;
        if(e.key === 'ArrowLeft') c.x -= step; else if(e.key === 'ArrowRight') c.x += step;
        else if(e.key === 'ArrowUp') c.y -= step; else if(e.key === 'ArrowDown') c.y += step;
        else if(e.key === '+' || e.key === '='){ c.x -= step / 2; c.y -= step / 2 / aspect(); c.w += step; c.h = c.w / aspect(); }
        else if(e.key === '-'){ c.x += step / 2; c.y += step / 2 / aspect(); c.w = Math.max(60, c.w - step); c.h = c.w / aspect(); }
        else done = false;
        if(!done) return;
        e.preventDefault();
        fitCrop(s); placeBox(s); schedule();
      });
    }

    // ---------- composición de la hoja ----------
    function layout(){
      var d = docSize(), sheet = SHEETS[opt('idSheet')] || SHEETS.letter;
      var want = +opt('idScale') / 100;
      var used = [slots.front, slots.back].filter(function(s){ return s.work; });
      var n = Math.max(1, used.length);
      var fit = Math.min((sheet.w - MARGIN * 2) / d.w, (sheet.h - MARGIN * 2 - GAP * (n - 1)) / (d.h * n));
      var scale = Math.min(want, fit);
      var w = d.w * scale, h = d.h * scale;
      var total = h * n + GAP * (n - 1);
      var top = Math.max(MARGIN, (sheet.h - total) / 2);
      return {
        sheet: sheet, scale: scale, want: want, w: w, h: h,
        items: used.map(function(s, i){ return { slot: s, x: (sheet.w - w) / 2, y: top + i * (h + GAP) }; })
      };
    }

    // Recorte saneado a la resolución pedida (ppp).
    function piece(s, wmm, hmm, dpi){
      var pw = Math.max(1, Math.round(wmm / 25.4 * dpi)), ph = Math.max(1, Math.round(hmm / 25.4 * dpi));
      var c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s.work, s.crop.x, s.crop.y, s.crop.w, s.crop.h, 0, 0, pw, ph);
      return IM.clean(c, opt('idClean'));
    }

    function pageCanvas(L, dpi){
      var px = dpi / 25.4;
      var c = document.createElement('canvas');
      c.width = Math.round(L.sheet.w * px); c.height = Math.round(L.sheet.h * px);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      L.items.forEach(function(it){
        ctx.drawImage(piece(it.slot, L.w, L.h, dpi), Math.round(it.x * px), Math.round(it.y * px), Math.round(L.w * px), Math.round(L.h * px));
      });
      return c;
    }

    function schedule(){
      result.hidden = true;
      clearTimeout(previewT);
      previewT = setTimeout(renderPreview, 60);
      update();
    }

    function renderPreview(){
      var L = layout();
      var c = pageCanvas(L, 60);
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Vista previa de la hoja ' + L.sheet.label);
      preview.innerHTML = '';
      preview.style.setProperty('--ratio', L.sheet.w / L.sheet.h);
      preview.appendChild(c);
      previewNote.textContent = L.items.length
        ? 'Hoja ' + L.sheet.label + ' · ' + docSize().label + ' al ' + Math.round(L.scale * 100) + ' % (' + fmtMm(L.w) + ' × ' + fmtMm(L.h) + ' cm)'
        : 'Hoja ' + L.sheet.label + ' · sube al menos el frente';
    }

    function fmtMm(mm){ return (mm / 10).toFixed(1).replace('.', ','); }

    function update(){
      var L = layout(), has = L.items.length > 0;
      extEl.textContent = '.' + (opt('idFormat') === 'jpg' ? 'jpg' : 'pdf');
      go.disabled = !has || busy;
      if(!busy) goLabel.textContent = 'Crear hoja ampliada';
      hint.textContent = !has ? 'Sube al menos la foto del frente.' :
        L.scale < L.want - 0.001 ? 'No cabe al ' + Math.round(L.want * 100) + ' % en hoja ' + L.sheet.label + '; se ajustó al ' + Math.round(L.scale * 100) + ' %.' :
        'Se quitan los datos ocultos de la foto (ubicación, teléfono).';
    }

    root.querySelectorAll('input[name=idDoc]').forEach(function(r){
      r.addEventListener('change', function(){
        [slots.front, slots.back].forEach(function(s){ if(s.work){ fitCrop(s); paintSlot(s); } });
        schedule();
      });
    });
    root.querySelectorAll('input[name=idScale], input[name=idSheet], input[name=idClean], input[name=idFormat]').forEach(function(r){
      r.addEventListener('change', schedule);
    });

    go.addEventListener('click', async function(){
      var L = layout();
      if(!L.items.length || busy) return;
      busy = true; UI.setBusy(go, true, 'Creando hoja…');
      try{
        await U.sleep(30); // deja pintar el estado ocupado
        var fmt = opt('idFormat'), base = U.cleanName(nameInput.value, 'documento-ampliado').replace(/\.(pdf|jpe?g)$/i, '');
        var blob, name;
        if(fmt === 'jpg'){
          var c = pageCanvas(L, 200);
          blob = new Blob([await IM.jpegBytes(c, 0.9)], { type: 'image/jpeg' });
          name = base + '.jpg';
        }else{
          var pdf = await PDFLib.PDFDocument.create();
          var page = pdf.addPage([L.sheet.w * MM, L.sheet.h * MM]);
          for(var i = 0; i < L.items.length; i++){
            var it = L.items[i];
            var img = await pdf.embedJpg(await IM.jpegBytes(piece(it.slot, L.w, L.h, 300), 0.9));
            page.drawImage(img, { x: it.x * MM, y: (L.sheet.h - it.y - L.h) * MM, width: L.w * MM, height: L.h * MM });
          }
          pdf.setTitle(base);
          blob = U.pdfBlob(await pdf.save());
          name = base + '.pdf';
        }
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = name + ' · ' + docSize().label + ' al ' + Math.round(L.scale * 100) + ' % · ' + U.fmtBytes(blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + name + '.');
      }catch(err){
        UI.toast('No se pudo crear la hoja: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    Object.keys(slots).forEach(function(k){ paintSlot(slots[k]); });
    renderPreview();
    update();
  }

  F.tools = F.tools || {};
  F.tools.idcard = { init: init };
})(window.Fusor);
