/* Herramienta: Ampliar documento. Fotos del frente y el reverso de una cédula
   (u otro documento) recortadas, saneadas y puestas en una hoja a su tamaño
   real ampliado (100 %, 150 %, 200 %), como piden muchos trámites. */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui, IM = F.imaging, CR = F.cropper, X = F.exporter;
  var MM = 72 / 25.4;
  // Cédula, tarjeta de identidad, licencia y la mayoría de carnés usan el
  // tamaño de tarjeta ID-1 (8,56 × 5,4 cm). Medidas en horizontal: «Vertical»
  // las intercambia. sides: 1 → solo el frente (el carné no lleva reverso).
  var DOCS = {
    card:     { w: 85.6, h: 54, label: 'documento', sides: 2 },
    student:  { w: 85.6, h: 54, label: 'carné', sides: 1, autoOrient: true },
    passport: { w: 125, h: 88, label: 'pasaporte', sides: 2 }
  };
  var FORMATS = { pdf: 'pdf', docx: 'docx', png: 'png', jpg: 'jpg' };
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
    var customField = $('[data-id-custom]'), customW = $('#idCustomW'), customH = $('#idCustomH');
    var orientField = $('[data-id-orient]');
    var busy = false, lastUrl = null, previewT = null;

    var slots = {};
    root.querySelectorAll('[data-id-slot]').forEach(function(el){
      var key = el.dataset.idSlot;
      var s = slots[key] = { key: key, el: el, bitmap: null, rotate: 0, work: null, crop: null };
      var dropEl = el.querySelector('[data-drop]');
      UI.dropzone(dropEl, handle);
      // escáner en vivo: el marco tiene la forma del documento elegido
      dropEl._scan = function(fallback){
        F.scanner.open({
          aspect: aspect(),
          title: 'Escanear el ' + (key === 'front' ? 'frente' : 'reverso') + ' del ' + docSize().label,
          onCapture: function(file){ handle([file]); },
          onFail: fallback
        });
      };
      async function handle(files){
        var f = files.find(IM.isImage);
        if(!f){ UI.toast('Elige una foto JPG o PNG del documento.', 'error'); return; }
        try{
          var bmp = await IM.load(f);
          if(s.bitmap && s.bitmap.close) s.bitmap.close();
          s.bitmap = bmp; s.rotate = 0;
          // carnés: los hay de pie y acostados; la orientación se toma de la foto
          if(docSize().autoOrient && s.key === 'front'){
            var box = CR.detect(IM.draw(bmp, 0, 600));
            if(box) setOrient(box.h > box.w * 1.15 ? 'v' : 'h');
          }
          prepare(s, true);
          orient(s);
        }catch(err){ UI.toast(f.name + ': ' + err.message, 'error'); }
      }
      el.querySelector('[data-id-rotate]').addEventListener('click', function(){ if(!s.bitmap) return; s.rotate = (s.rotate + 90) % 360; prepare(s, true); });
      el.querySelector('[data-id-remove]').addEventListener('click', function(){
        if(s.bitmap && s.bitmap.close) s.bitmap.close();
        s.bitmap = s.work = s.crop = null;
        paintSlot(s); schedule();
      });
      CR.attach(el.querySelector('.crop__stage'), function(){ return s; }, aspect, schedule);
    });

    function opt(name){ var r = root.querySelector('input[name=' + name + ']:checked'); return r ? r.value : null; }

    // Medidas del documento elegido; «Otro tamaño» toma las de los campos (en cm).
    function docSize(){
      if(opt('idDoc') !== 'custom'){
        var d = DOCS[opt('idDoc')] || DOCS.card;
        return opt('idOrient') === 'v' ? Object.assign({}, d, { w: d.h, h: d.w }) : d;
      }
      var w = parseFloat(String(customW.value).replace(',', '.')), h = parseFloat(String(customH.value).replace(',', '.'));
      var ok = w >= 1 && w <= 30 && h >= 1 && h <= 30;
      customField.querySelector('.field__control').classList.toggle('is-error', !ok);
      return ok ? { w: w * 10, h: h * 10, label: 'documento', sides: 2 } : DOCS.card;
    }
    function aspect(){ var d = docSize(); return d.w / d.h; }
    function setOrient(v){ var r = root.querySelector('input[name=idOrient][value=' + v + ']'); if(r) r.checked = true; }
    // Fotos que van en la hoja: el carné lleva solo el frente.
    function sides(){ return docSize().sides === 1 ? [slots.front] : [slots.front, slots.back]; }

    // Foto de trabajo (girada y limitada) y recorte sobre el documento detectado.
    function prepare(s, resetCrop){
      s.work = IM.draw(s.bitmap, s.rotate, WORK_MAX);
      if(resetCrop || !s.crop){ var box = CR.detect(s.work); s.crop = box ? CR.around(s.work, box, aspect()) : CR.initial(s.work, aspect()); }
      paintSlot(s); schedule();
    }

    // Si el documento está de pie y se eligió uno acostado (o al revés), se gira
    // la foto 90° para enderezarlo. Si queda al revés, «Girar». Devuelve si giró.
    function orient(s){
      var box = CR.detect(s.work);
      if(!box || (box.h > box.w * 1.15) === (aspect() < 1)) return false;
      s.rotate = (s.rotate + 90) % 360;
      prepare(s, true);
      return true;
    }

    function paintSlot(s){
      var has = !!s.work;
      s.el.querySelector('[data-drop]').hidden = has;
      var box = s.el.querySelector('[data-id-crop]');
      box.hidden = !has;
      s.el.querySelector('[data-id-actions]').hidden = !has;
      if(has) CR.paint(box.querySelector('.crop__stage'), s.work, s.crop);
    }

    // ---------- composición de la hoja ----------
    function layout(){
      var d = docSize(), sheet = SHEETS[opt('idSheet')] || SHEETS.letter;
      var want = +opt('idScale') / 100;
      var used = sides().filter(function(s){ return s.work; });
      var n = Math.max(1, used.length);
      var aw = sheet.w - MARGIN * 2, ah = sheet.h - MARGIN * 2;
      // uno debajo del otro o, si así cabe más grande (carnés de pie), lado a lado
      var stacked = Math.min(aw / d.w, (ah - GAP * (n - 1)) / (d.h * n));
      var side = Math.min((aw - GAP * (n - 1)) / (d.w * n), ah / d.h);
      var row = n > 1 && Math.min(want, side) > Math.min(want, stacked) + 0.001;
      var scale = Math.min(want, row ? side : stacked);
      var w = d.w * scale, h = d.h * scale;
      var totalW = row ? w * n + GAP * (n - 1) : w, totalH = row ? h : h * n + GAP * (n - 1);
      var left = (sheet.w - totalW) / 2, top = Math.max(MARGIN, (sheet.h - totalH) / 2);
      return {
        sheet: sheet, scale: scale, want: want, w: w, h: h,
        items: used.map(function(s, i){
          return { slot: s, x: row ? left + i * (w + GAP) : left, y: row ? top : top + i * (h + GAP) };
        })
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
      extEl.textContent = '.' + (FORMATS[opt('idFormat')] || 'pdf');
      go.disabled = !has || busy;
      if(!busy) goLabel.textContent = 'Crear hoja ampliada';
      hint.textContent = !has ? 'Sube al menos la foto del frente.' :
        L.scale < L.want - 0.001 ? 'No cabe al ' + Math.round(L.want * 100) + ' % en hoja ' + L.sheet.label + '; se ajustó al ' + Math.round(L.scale * 100) + ' %.' :
        'Se quitan los datos ocultos de la foto (ubicación, teléfono).';
      if(opt('idDoc') === 'custom' && customField.querySelector('.is-error')) hint.textContent = 'Escribe ancho y alto entre 1 y 30 cm.';
    }

    // cambiar el tipo de documento cambia la proporción del recorte
    function reshape(){
      customField.hidden = opt('idDoc') !== 'custom';
      orientField.hidden = opt('idDoc') === 'custom'; // con medidas propias, la orientación ya va en ellas
      slots.back.el.hidden = docSize().sides === 1;
      [slots.front, slots.back].forEach(function(s){
        if(!s.work || orient(s)) return;
        var box = CR.detect(s.work);
        s.crop = box ? CR.around(s.work, box, aspect()) : CR.fit(s.crop, s.work, aspect());
        paintSlot(s);
      });
      schedule();
    }
    root.querySelectorAll('input[name=idDoc]').forEach(function(r){
      r.addEventListener('change', function(){
        // al pasar a carné con la foto ya subida, la orientación sale de la foto
        if(docSize().autoOrient && slots.front.work){
          var box = CR.detect(IM.draw(slots.front.bitmap, 0, 600));
          if(box) setOrient(box.h > box.w * 1.15 ? 'v' : 'h');
          slots.front.rotate = 0; prepare(slots.front, true);
        }
        reshape();
      });
    });
    root.querySelectorAll('input[name=idOrient]').forEach(function(r){ r.addEventListener('change', reshape); });
    [customW, customH].forEach(function(i){ i.addEventListener('input', reshape); });
    root.querySelectorAll('input[name=idScale], input[name=idSheet], input[name=idClean], input[name=idFormat]').forEach(function(r){
      r.addEventListener('change', schedule);
    });

    go.addEventListener('click', async function(){
      var L = layout();
      if(!L.items.length || busy) return;
      busy = true; UI.setBusy(go, true, 'Creando hoja…');
      try{
        await U.sleep(30); // deja pintar el estado ocupado
        var fmt = opt('idFormat'), base = U.cleanName(nameInput.value, 'documento-ampliado').replace(/\.(pdf|docx|png|jpe?g)$/i, '');
        var blob, name;
        if(fmt === 'jpg' || fmt === 'png'){
          var c = pageCanvas(L, 200);
          blob = fmt === 'jpg'
            ? new Blob([await IM.jpegBytes(c, 0.9, 200)], { type: 'image/jpeg' })
            : new Blob([await IM.pngBytes(c, 200)], { type: 'image/png' });
          name = base + '.' + fmt;
        }else{
          var pdf = await PDFLib.PDFDocument.create();
          var page = pdf.addPage([L.sheet.w * MM, L.sheet.h * MM]);
          for(var i = 0; i < L.items.length; i++){
            var it = L.items[i];
            var img = await pdf.embedJpg(await IM.jpegBytes(piece(it.slot, L.w, L.h, 300), 0.9));
            page.drawImage(img, { x: it.x * MM, y: (L.sheet.h - it.y - L.h) * MM, width: L.w * MM, height: L.h * MM });
          }
          pdf.setTitle(base);
          var bytes = await pdf.save();
          if(fmt === 'docx'){
            // Word: la hoja como imagen a tamaño real, idéntica al PDF
            var out = await X.docx(bytes, base);
            blob = out.blob; name = out.name;
          }else{
            blob = U.pdfBlob(bytes); name = base + '.pdf';
          }
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
