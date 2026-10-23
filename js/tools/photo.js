/* Herramienta: Foto para documentos. Una foto recortada al tamaño exacto
   (3 × 4 cm y otros comunes), como foto suelta en JPG o como hoja Carta con
   varias copias y guías de corte, lista para imprimir. */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui, IM = F.imaging, CR = F.cropper;
  var MM = 72 / 25.4;
  var SIZES = {
    '3x4':   { w: 30, h: 40, label: '3 × 4 cm' },
    '25x3':  { w: 25, h: 30, label: '2,5 × 3 cm' },
    '4x5':   { w: 40, h: 50, label: '4 × 5 cm' },
    '5x5':   { w: 50.8, h: 50.8, label: '5 × 5 cm' }
  };
  var SHEET = { w: 215.9, h: 279.4 }; // Carta
  var MARGIN = 10, GAP = 4;           // mm
  var DPI = 300;
  var WORK_MAX = 2400;

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]'), cropBox = $('[data-ph-crop]'), stage = cropBox.querySelector('.crop__stage');
    var actions = $('[data-ph-actions]');
    var preview = $('[data-ph-preview]'), previewNote = $('[data-ph-preview-note]');
    var copiesField = $('[data-ph-copies]');
    var nameInput = $('#phName'), extEl = $('[data-ph-ext]');
    var go = $('[data-ph-go]'), goLabel = $('[data-ph-go-label]'), hint = $('[data-ph-hint]');
    var result = $('[data-ph-result]'), resultMeta = $('[data-ph-result-meta]'), again = $('[data-ph-download]');

    var st = { bitmap: null, rotate: 0, work: null, crop: null };
    var busy = false, lastUrl = null, previewT = null;

    function opt(name){ var r = root.querySelector('input[name=' + name + ']:checked'); return r ? r.value : null; }
    function size(){ return SIZES[opt('phSize')] || SIZES['3x4']; }
    function aspect(){ var s = size(); return s.w / s.h; }

    UI.dropzone(drop, async function(files){
      var f = files.find(IM.isImage);
      if(!f){ UI.toast('Elige una foto JPG o PNG.', 'error'); return; }
      try{
        var bmp = await IM.load(f);
        if(st.bitmap && st.bitmap.close) st.bitmap.close();
        st.bitmap = bmp; st.rotate = 0;
        if(nameInput.value === 'foto-3x4' || !nameInput.value) nameInput.value = 'foto-' + opt('phSize');
        prepare();
      }catch(err){ UI.toast(f.name + ': ' + err.message, 'error'); }
    });

    function prepare(){
      st.work = IM.draw(st.bitmap, st.rotate, WORK_MAX);
      // la cara suele estar arriba del centro: recorte alto, algo subido
      st.crop = CR.initial(st.work, aspect(), 0.9);
      st.crop.y = Math.max(0, st.crop.y - st.crop.h * 0.04);
      paint(); schedule();
    }

    function paint(){
      var has = !!st.work;
      drop.hidden = has; cropBox.hidden = !has; actions.hidden = !has;
      if(has) CR.paint(stage, st.work, st.crop);
    }

    CR.attach(stage, function(){ return st; }, aspect, schedule);

    $('[data-ph-rotate]').addEventListener('click', function(){ if(!st.bitmap) return; st.rotate = (st.rotate + 90) % 360; prepare(); });
    $('[data-ph-change]').addEventListener('click', function(){ drop.querySelector('input[type=file]').click(); });

    // ---------- composición ----------
    // La foto recortada a los mm pedidos y la resolución dada.
    function photo(dpi){
      var s = size();
      var c = document.createElement('canvas');
      c.width = Math.round(s.w / 25.4 * dpi); c.height = Math.round(s.h / 25.4 * dpi);
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(st.work, st.crop.x, st.crop.y, st.crop.w, st.crop.h, 0, 0, c.width, c.height);
      return IM.clean(c, opt('phClean'));
    }

    // Cuántas copias caben en la hoja y dónde va cada una (mm).
    function grid(){
      var s = size();
      var cols = Math.max(1, Math.floor((SHEET.w - MARGIN * 2 + GAP) / (s.w + GAP)));
      var rows = Math.max(1, Math.floor((SHEET.h - MARGIN * 2 + GAP) / (s.h + GAP)));
      var want = opt('phCopies') === 'fill' ? cols * rows : Math.min(+opt('phCopies'), cols * rows);
      var spots = [];
      for(var i = 0; i < want; i++){
        spots.push({ x: MARGIN + (i % cols) * (s.w + GAP), y: MARGIN + Math.floor(i / cols) * (s.h + GAP) });
      }
      return { spots: spots, max: cols * rows };
    }

    function sheetCanvas(dpi){
      var s = size(), px = dpi / 25.4, G = grid();
      var c = document.createElement('canvas');
      c.width = Math.round(SHEET.w * px); c.height = Math.round(SHEET.h * px);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      if(!st.work) return c;
      var img = photo(dpi);
      ctx.strokeStyle = '#b8bcc8'; ctx.lineWidth = Math.max(1, px * 0.15);
      G.spots.forEach(function(p){
        var x = Math.round(p.x * px), y = Math.round(p.y * px), w = Math.round(s.w * px), h = Math.round(s.h * px);
        ctx.drawImage(img, x, y, w, h);
        ctx.strokeRect(x, y, w, h); // guía de corte
      });
      return c;
    }

    function sheetMode(){ return opt('phFormat') !== 'jpg'; }

    function schedule(){
      result.hidden = true;
      clearTimeout(previewT);
      previewT = setTimeout(renderPreview, 60);
      update();
    }

    function renderPreview(){
      preview.innerHTML = '';
      var s = size(), c;
      if(sheetMode()){
        c = sheetCanvas(60);
        preview.style.setProperty('--ratio', SHEET.w / SHEET.h);
        preview.classList.remove('is-photo');
        previewNote.textContent = st.work ? 'Hoja Carta · ' + U.plural(grid().spots.length, 'copia', 'copias') + ' de ' + s.label : 'Hoja Carta · sube una foto';
      }else{
        c = st.work ? photo(120) : document.createElement('canvas');
        preview.style.setProperty('--ratio', s.w / s.h);
        preview.classList.add('is-photo');
        previewNote.textContent = 'Foto de ' + s.label + ' a 300 ppp (' + Math.round(s.w / 25.4 * DPI) + ' × ' + Math.round(s.h / 25.4 * DPI) + ' px)';
      }
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Vista previa');
      preview.appendChild(c);
    }

    function update(){
      var has = !!st.work;
      copiesField.hidden = !sheetMode();
      extEl.textContent = '.' + (opt('phFormat') === 'pdf' ? 'pdf' : 'jpg');
      go.disabled = !has || busy;
      if(!busy) goLabel.textContent = sheetMode() ? 'Crear hoja de fotos' : 'Descargar foto';
      hint.textContent = !has ? 'Sube una foto de frente, con fondo claro.' :
        'Ajusta el recuadro: la cara dentro del óvalo, con algo de espacio arriba.';
    }

    root.querySelectorAll('input[name=phSize]').forEach(function(r){
      r.addEventListener('change', function(){
        if(st.work){ CR.fit(st.crop, st.work, aspect()); paint(); }
        if(/^foto-/.test(nameInput.value)) nameInput.value = 'foto-' + opt('phSize');
        schedule();
      });
    });
    root.querySelectorAll('input[name=phClean], input[name=phFormat], input[name=phCopies]').forEach(function(r){ r.addEventListener('change', schedule); });

    go.addEventListener('click', async function(){
      if(!st.work || busy) return;
      busy = true; UI.setBusy(go, true, 'Preparando…');
      try{
        await U.sleep(30);
        var fmt = opt('phFormat'), base = U.cleanName(nameInput.value, 'foto').replace(/\.(pdf|jpe?g)$/i, '');
        var blob, name, meta;
        if(fmt === 'pdf'){
          var s = size(), pdf = await PDFLib.PDFDocument.create();
          var page = pdf.addPage([SHEET.w * MM, SHEET.h * MM]);
          var img = await pdf.embedJpg(await IM.jpegBytes(photo(DPI), 0.92));
          var line = PDFLib.rgb(0.72, 0.74, 0.78), spots = grid().spots;
          spots.forEach(function(p){
            var o = { x: p.x * MM, y: (SHEET.h - p.y - s.h) * MM, width: s.w * MM, height: s.h * MM };
            page.drawImage(img, o);
            page.drawRectangle(Object.assign({ borderColor: line, borderWidth: 0.4 }, o));
          });
          pdf.setTitle(base);
          blob = U.pdfBlob(await pdf.save()); name = base + '.pdf';
          meta = U.plural(spots.length, 'copia', 'copias') + ' en hoja Carta';
        }else if(fmt === 'sheet-jpg'){
          blob = new Blob([await IM.jpegBytes(sheetCanvas(200), 0.9)], { type: 'image/jpeg' });
          name = base + '.jpg'; meta = U.plural(grid().spots.length, 'copia', 'copias') + ' en hoja Carta';
        }else{
          blob = new Blob([await IM.jpegBytes(photo(DPI), 0.92)], { type: 'image/jpeg' });
          name = base + '.jpg'; meta = 'foto de ' + size().label;
        }
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = name + ' · ' + meta + ' · ' + U.fmtBytes(blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + name + '.');
      }catch(err){
        UI.toast('No se pudo crear la foto: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    paint();
    renderPreview();
    update();
  }

  F.tools = F.tools || {};
  F.tools.photo = { init: init };
})(window.Fusor);
