/* Herramienta: Imágenes a PDF. Junta varias fotos (por ejemplo, un documento
   escaneado con el celular) en un solo PDF: una imagen por página. */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui, IM = F.imaging;
  var MM = 72 / 25.4;
  var PAGES = {
    a4:     { w: 210 * MM, h: 297 * MM },
    letter: { w: 216 * MM, h: 279 * MM },
    legal:  { w: 216 * MM, h: 330 * MM },
    fit:    null
  };
  var MARGINS = { none: 0, small: 6 * MM, normal: 15 * MM };

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var head = $('[data-img-head]'), count = $('[data-img-count]');
    var grid = $('[data-img-pages]');
    var tFiles = $('[data-img-t-files]'), tSize = $('[data-img-t-size]');
    var light = $('#imgLight');
    var nameInput = $('#imgName');
    var go = $('[data-img-go]'), goLabel = $('[data-img-go-label]'), hint = $('[data-img-hint]');
    var result = $('[data-img-result]'), resultMeta = $('[data-img-result-meta]'), again = $('[data-img-download]');

    var list = [];   // { id, name, size, bitmap, url, rotate, ratio }
    var busy = false, lastUrl = null;

    UI.dropzone(drop, async function(files){
      if(busy) return;
      var imgs = files.filter(IM.isImage);
      if(files.length > imgs.length) UI.toast(U.plural(files.length - imgs.length, 'archivo ignorado', 'archivos ignorados') + ': solo se aceptan imágenes JPG, PNG, WEBP, GIF o BMP.', 'error');
      if(!imgs.length) return;
      drop.classList.add('is-disabled');
      for(var i = 0; i < imgs.length; i++){
        try{
          var bmp = await IM.load(imgs[i]);
          list.push({ id: U.uid(), name: imgs[i].name, size: imgs[i].size, bitmap: bmp, url: URL.createObjectURL(imgs[i]), rotate: 0, ratio: bmp.width / bmp.height });
        }catch(err){
          UI.toast(imgs[i].name + ': ' + err.message, 'error');
        }
      }
      if(list.length && nameInput.value === 'imagenes') nameInput.value = U.cleanName(list[0].name.replace(/\.[^.]+$/, ''), 'imagenes');
      drop.classList.remove('is-disabled');
      result.hidden = true;
      render();
    });

    function render(){
      var before = F.motion.capture(grid, '.page');
      grid.innerHTML = '';
      list.forEach(function(it, i){
        var li = document.createElement('li');
        li.className = 'page';
        li.dataset.id = it.id;
        li.draggable = true;
        li.innerHTML =
          '<div class="page__sheet"><img alt="" draggable="false"></div>' +
          '<div class="page__foot"><span class="page__label">Página ' + (i + 1) + '</span>' +
          '<span class="page__tools">' +
            '<button class="icon-btn" type="button" data-act="left" aria-label="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + U.icon('left') + '</button>' +
            '<button class="icon-btn" type="button" data-act="right" aria-label="Mover después"' + (i === list.length - 1 ? ' disabled' : '') + '>' + U.icon('right') + '</button>' +
            '<button class="icon-btn" type="button" data-act="rotr" aria-label="Girar ' + U.escapeHtml(it.name) + '">' + U.icon('rotr') + '</button>' +
            '<button class="icon-btn icon-btn--danger" type="button" data-act="remove" aria-label="Quitar ' + U.escapeHtml(it.name) + '">' + U.icon('trash') + '</button>' +
          '</span></div>';
        var sheet = li.firstChild, img = sheet.firstChild;
        var quarter = it.rotate % 180 !== 0;
        sheet.style.setProperty('--ratio', quarter ? 1 / it.ratio : it.ratio);
        img.src = it.url;
        img.className = 'img-rot';
        img.style.setProperty('--rot', it.rotate + 'deg');
        img.style.setProperty('--fit', quarter ? Math.min(it.ratio, 1 / it.ratio) : 1);
        grid.appendChild(li);
      });
      F.motion.play(grid, '.page', before);
      update();
    }

    function update(){
      var has = list.length > 0;
      head.hidden = !has;
      drop.classList.toggle('is-compact', has);
      drop.querySelector('.drop__title').textContent = has ? 'Añadir más imágenes' : 'Suelta tus imágenes aquí';
      count.textContent = U.plural(list.length, 'imagen', 'imágenes') + ' en este orden';
      F.motion.count(tFiles, list.length);
      tSize.textContent = U.fmtBytes(list.reduce(function(s, it){ return s + it.size; }, 0));
      go.disabled = !has || busy;
      goLabel.textContent = has ? 'Crear PDF de ' + U.plural(list.length, 'página', 'páginas') : 'Crear PDF';
      hint.textContent = !has ? 'Añade al menos una imagen.' : 'Cada imagen será una página, en este orden.';
    }

    function idx(id){ return list.findIndex(function(it){ return it.id === id; }); }

    grid.addEventListener('click', function(e){
      var btn = e.target.closest('button[data-act]');
      if(!btn || busy) return;
      var id = btn.closest('.page').dataset.id, i = idx(id), act = btn.dataset.act;
      if(act === 'left' && i > 0) U.move(list, i, i - 1);
      else if(act === 'right' && i < list.length - 1) U.move(list, i, i + 1);
      else if(act === 'rotr') list[i].rotate = (list[i].rotate + 90) % 360;
      else if(act === 'remove'){ forget(list[i]); list.splice(i, 1); }
      result.hidden = true;
      render();
      var t = grid.querySelector('[data-id="' + id + '"] [data-act="' + act + '"]');
      if(t && !t.disabled) t.focus();
    });

    function forget(it){ URL.revokeObjectURL(it.url); if(it.bitmap.close) it.bitmap.close(); }

    // arrastrar para reordenar
    var dragId = null;
    grid.addEventListener('dragstart', function(e){
      var li = e.target.closest('.page'); if(!li || busy) return;
      dragId = li.dataset.id; li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    });
    grid.addEventListener('dragend', function(){ dragId = null; grid.querySelectorAll('.is-dragging').forEach(function(n){ n.classList.remove('is-dragging'); }); });
    grid.addEventListener('dragover', function(e){
      if(!dragId) return;
      e.preventDefault();
      var li = e.target.closest('.page');
      if(!li || li.dataset.id === dragId) return;
      var from = idx(dragId), to = idx(li.dataset.id);
      if(from === to) return;
      U.move(list, from, to);
      render();
      var n = grid.querySelector('[data-id="' + dragId + '"]'); if(n) n.classList.add('is-dragging');
    });
    grid.addEventListener('drop', function(e){ if(dragId){ e.preventDefault(); e.stopPropagation(); result.hidden = true; } });

    $('[data-img-clear]').addEventListener('click', function(){ if(busy) return; list.forEach(forget); list = []; result.hidden = true; render(); });
    $('[data-img-sort]').addEventListener('click', function(){
      if(busy) return;
      list.sort(function(a, b){ return a.name.localeCompare(b.name, 'es', { numeric: true }); });
      result.hidden = true; render();
    });

    function choice(name){ var r = root.querySelector('input[name=' + name + ']:checked'); return r ? r.value : null; }
    root.querySelectorAll('input[name=imgPage], input[name=imgMargin]').forEach(function(r){ r.addEventListener('change', function(){ result.hidden = true; }); });

    go.addEventListener('click', async function(){
      if(!list.length || busy) return;
      busy = true; UI.setBusy(go, true, 'Creando PDF…');
      try{
        var pdf = await PDFLib.PDFDocument.create();
        var size = PAGES[choice('imgPage')], margin = MARGINS[choice('imgMargin')] || 0;
        for(var i = 0; i < list.length; i++){
          goLabel.textContent = 'Imagen ' + (i + 1) + ' de ' + list.length + '…';
          var it = list[i];
          // fotos de celular de 4000 px: 2400 px bastan para imprimir una hoja nítida
          var canvas = IM.draw(it.bitmap, it.rotate, light.checked ? 2400 : 0);
          var img = await pdf.embedJpg(await IM.jpegBytes(canvas, light.checked ? 0.82 : 0.92));
          var land = canvas.width > canvas.height;
          var pw, ph;
          if(size){ pw = land ? size.h : size.w; ph = land ? size.w : size.h; }
          else{ pw = canvas.width * 72 / 150 + margin * 2; ph = canvas.height * 72 / 150 + margin * 2; } // 150 ppp
          var s = Math.min((pw - margin * 2) / canvas.width, (ph - margin * 2) / canvas.height);
          var w = canvas.width * s, h = canvas.height * s;
          pdf.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
          canvas.width = canvas.height = 0;
        }
        var bytes = await pdf.save();
        var name = U.cleanName(nameInput.value, 'imagenes') + '.pdf';
        var blob = U.pdfBlob(bytes);
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = name + ' · ' + U.plural(list.length, 'página', 'páginas') + ' · ' + U.fmtBytes(blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + name + '.');
      }catch(err){
        UI.toast('No se pudo crear el PDF: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    update();
  }

  F.tools = F.tools || {};
  F.tools.images = { init: init };
})(window.Fusor);
