/* Herramienta: Comprimir PDF.
   - Ligera: se vuelve a guardar el PDF sin perder nada (texto seleccionable).
   - Recomendada / Fuerte: cada página se convierte en una imagen JPG a menor
     resolución. Baja mucho el peso, pero el texto deja de poder seleccionarse. */
(function(F){
  "use strict";
  var U = F.util, E = F.engine, UI = F.ui;
  var THUMB_W = 120;
  var LEVELS = {
    light:  null,
    medium: { dpi: 130, quality: 0.72 },
    strong: { dpi: 96,  quality: 0.55 }
  };

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var head = $('[data-cmp-head]'), nameEl = $('[data-cmp-name]'), metaEl = $('[data-cmp-meta]');
    var grid = $('[data-cmp-pages]');
    var tBefore = $('[data-cmp-t-before]'), tAfter = $('[data-cmp-t-after]'), tSaved = $('[data-cmp-t-saved]');
    var gray = $('#cmpGray');
    var nameInput = $('#cmpName');
    var go = $('[data-cmp-go]'), goLabel = $('[data-cmp-go-label]'), hint = $('[data-cmp-hint]');
    var result = $('[data-cmp-result]'), resultMeta = $('[data-cmp-result-meta]'), again = $('[data-cmp-download]');

    var doc = null, busy = false, lastUrl = null, last = null;

    UI.dropzone(drop, async function(files){
      if(busy) return;
      var pdfs = UI.onlyPdfs(files);
      if(!pdfs.length) return;
      if(pdfs.length > 1) UI.toast('Comprimir trabaja con un PDF a la vez; se usó el primero.');
      drop.classList.add('is-disabled');
      try{
        var info = await E.open(pdfs[0]);
        close();
        doc = { name: pdfs[0].name, size: pdfs[0].size, bytes: info.bytes, pageCount: info.pageCount, ratios: info.ratios };
        nameInput.value = U.baseName(doc.name) + '-comprimido';
        renderGrid();
      }catch(err){
        UI.toast(pdfs[0].name + ': ' + (err.message || 'No se pudo leer.'), 'error');
      }finally{
        drop.classList.remove('is-disabled');
        update();
      }
    });

    function close(){
      if(doc) E.release(doc);
      doc = null; last = null; grid.innerHTML = ''; result.hidden = true;
    }
    $('[data-cmp-close]').addEventListener('click', function(){ if(!busy){ close(); update(); drop.focus(); } });

    function renderGrid(){
      grid.innerHTML = '';
      for(var i = 0; i < doc.pageCount; i++){
        var li = document.createElement('li');
        li.className = 'page';
        li.innerHTML = '<div class="page__sheet"><span class="page__num-ghost" aria-hidden="true">' + (i + 1) + '</span></div>' +
          '<div class="page__foot"><span class="page__label">Página ' + (i + 1) + '</span></div>';
        var sheet = li.firstChild;
        sheet.style.setProperty('--ratio', doc.ratios[i] || 0.7071);
        grid.appendChild(li);
        E.lazyThumb(sheet, doc, i, THUMB_W);
      }
    }

    function level(){ var r = root.querySelector('input[name=cmpLevel]:checked'); return r ? r.value : 'medium'; }
    root.querySelectorAll('input[name=cmpLevel]').forEach(function(r){ r.addEventListener('change', function(){ last = null; result.hidden = true; update(); }); });
    gray.addEventListener('change', function(){ last = null; result.hidden = true; update(); });

    function update(){
      var has = !!doc;
      head.hidden = !has; drop.hidden = has;
      tBefore.textContent = has ? U.fmtBytes(doc.size) : '—';
      tAfter.textContent = last ? U.fmtBytes(last.size) : '—';
      tSaved.textContent = last ? (last.size < doc.size ? '−' + Math.round((1 - last.size / doc.size) * 100) + ' %' : '0 %') : '—';
      if(has){
        nameEl.textContent = doc.name;
        metaEl.textContent = U.plural(doc.pageCount, 'página', 'páginas') + ' · ' + U.fmtBytes(doc.size);
      }
      gray.disabled = level() === 'light';
      go.disabled = !has || busy;
      goLabel.textContent = 'Comprimir PDF';
      hint.textContent = !has ? 'Primero elige un PDF.' :
        level() === 'light' ? 'Conserva el texto y la calidad; reduce poco.' :
        'Las páginas pasan a imagen: el texto ya no se podrá seleccionar ni copiar.';
    }

    // Una página en JPG dentro de un PDF nuevo, al tamaño original.
    async function rasterPdf(opts){
      var out = await PDFLib.PDFDocument.create();
      var entry = { bytes: doc.bytes };
      try{
        for(var i = 0; i < doc.pageCount; i++){
          goLabel.textContent = 'Página ' + (i + 1) + ' de ' + doc.pageCount + '…';
          var canvas = await E.rasterize(entry, i, opts.dpi / 72);
          if(!canvas) throw new Error('Esta compresión necesita abrir FUSOR desde un servidor o la versión publicada (no con doble clic). Prueba la opción Ligera');
          if(opts.gray) toGray(canvas);
          var jpg = await new Promise(function(r){ canvas.toBlob(r, 'image/jpeg', opts.quality); });
          var img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
          var w = canvas.width * 72 / opts.dpi, h = canvas.height * 72 / opts.dpi;
          out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
          canvas.width = canvas.height = 0;
        }
      }finally{
        E.release(entry);
      }
      return out.save();
    }

    function toGray(canvas){
      var ctx = canvas.getContext('2d');
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
      for(var i = 0; i < d.length; i += 4){
        var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = l;
      }
      ctx.putImageData(img, 0, 0);
    }

    async function losslessPdf(){
      var pdf = await PDFLib.PDFDocument.load(doc.bytes, { updateMetadata: false });
      return pdf.save({ useObjectStreams: true });
    }

    go.addEventListener('click', async function(){
      if(!doc || busy) return;
      busy = true; UI.setBusy(go, true, 'Comprimiendo…');
      try{
        var lv = LEVELS[level()];
        var bytes = lv ? await rasterPdf({ dpi: lv.dpi, quality: lv.quality, gray: gray.checked }) : await losslessPdf();
        var name = U.cleanName(nameInput.value, 'documento-comprimido') + '.pdf';
        var smaller = bytes.length < doc.size;
        // si no se ganó nada, se entrega el original: nunca un archivo más pesado
        var blob = U.pdfBlob(smaller ? bytes : doc.bytes);
        last = { size: blob.size };
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = smaller
          ? name + ' · ' + U.fmtBytes(doc.size) + ' → ' + U.fmtBytes(blob.size)
          : 'Este PDF ya estaba optimizado con esta opción; se descargó sin cambios (' + U.fmtBytes(blob.size) + '). Prueba una compresión más fuerte.';
        result.hidden = false;
        UI.toast(smaller ? 'Se descargó ' + name + '.' : 'No se pudo reducir más con esta opción.', smaller ? null : 'error');
      }catch(err){
        UI.toast('No se pudo comprimir: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    update();
  }

  F.tools = F.tools || {};
  F.tools.compress = { init: init };
})(window.Fusor);
