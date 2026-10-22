/* Herramienta: Unir varios PDF en uno. */
(function(F){
  "use strict";
  var U = F.util, E = F.engine, UI = F.ui;
  var SWATCHES = ['var(--pink)', 'var(--blue)', 'var(--yellow)'];

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var list = $('[data-merge-list]');
    var head = $('[data-merge-head]');
    var count = $('[data-merge-count]');
    var tFiles = $('[data-merge-t-files]'), tPages = $('[data-merge-t-pages]'), tSize = $('[data-merge-t-size]');
    var nameInput = $('#mergeName');
    var go = $('[data-merge-go]'), goLabel = $('[data-merge-go-label]');
    var hint = $('[data-merge-hint]');
    var result = $('[data-merge-result]'), resultMeta = $('[data-merge-result-meta]'), again = $('[data-merge-download]');

    var queue = [];
    var busy = false;
    var lastUrl = null;

    UI.dropzone(drop, add);

    async function add(files){
      if(busy) return;
      var pdfs = UI.onlyPdfs(files);
      if(!pdfs.length) return;
      hideResult();
      var entries = pdfs.map(function(file, i){
        return { id: U.uid(), file: file, name: file.name, size: file.size, pages: null, error: null,
                 swatch: SWATCHES[(queue.length + i) % SWATCHES.length] };
      });
      queue.push.apply(queue, entries);
      if(queue.length === entries.length && entries.length === 1 && nameInput.value === 'documento-unido'){
        nameInput.value = U.baseName(entries[0].name) + '-unido';
      }
      render();
      for(var i = 0; i < entries.length; i++){
        var en = entries[i];
        try{
          var info = await E.open(en.file);
          en.bytes = info.bytes; en.pages = info.pageCount; en.ratio = info.ratios[0];
        }catch(err){
          en.error = err.message || 'No se pudo leer.';
          UI.toast(en.name + ': ' + en.error, 'error');
        }
        render();
      }
    }

    function render(){
      var has = queue.length > 0;
      head.hidden = !has;
      drop.classList.toggle('is-compact', has);
      drop.querySelector('.drop__title').textContent = has ? 'Añadir más PDF' : 'Suelta tus PDF aquí';

      var ok = queue.filter(function(e){ return !e.error; });
      var pages = ok.reduce(function(s, e){ return s + (e.pages || 0); }, 0);
      var size = queue.reduce(function(s, e){ return s + e.size; }, 0);
      F.motion.count(tFiles, queue.length);
      F.motion.count(tPages, pages);
      tSize.textContent = U.fmtBytes(size);
      count.textContent = U.plural(queue.length, 'archivo', 'archivos') + ' en este orden';

      // conservar miniaturas ya pintadas
      var oldThumbs = {};
      list.querySelectorAll('.file').forEach(function(li){
        var th = li.querySelector('.file__thumb');
        if(th && th._canvas) oldThumbs[li.dataset.id] = th;
      });

      var before = F.motion.capture(list, '.file');
      list.innerHTML = '';
      queue.forEach(function(en, i){
        var li = document.createElement('li');
        li.className = 'file' + (en.error ? ' is-error' : '');
        li.dataset.id = en.id;
        li.draggable = true;
        var meta = en.error ? en.error : (en.pages === null ? 'Leyendo…' : U.plural(en.pages, 'página', 'páginas')) + ' · ' + U.fmtBytes(en.size);
        li.innerHTML =
          '<span class="file__grip" aria-hidden="true">' + U.icon('grip') + '</span>' +
          '<span class="file__index">' + (i + 1) + '</span>' +
          '<span class="file__thumb"><span class="file__thumb-ink"></span></span>' +
          '<span class="file__info"><span class="file__name" title="' + U.escapeHtml(en.name) + '">' + U.escapeHtml(en.name) + '</span>' +
          '<span class="file__meta">' + U.escapeHtml(meta) + '</span></span>' +
          '<span class="file__actions">' +
            '<button class="icon-btn" type="button" data-act="up" aria-label="Subir ' + U.escapeHtml(en.name) + '"' + (i === 0 ? ' disabled' : '') + '>' + U.icon('up') + '</button>' +
            '<button class="icon-btn" type="button" data-act="down" aria-label="Bajar ' + U.escapeHtml(en.name) + '"' + (i === queue.length - 1 ? ' disabled' : '') + '>' + U.icon('down') + '</button>' +
            '<button class="icon-btn icon-btn--danger" type="button" data-act="remove" aria-label="Quitar ' + U.escapeHtml(en.name) + '">' + U.icon('x') + '</button>' +
          '</span>';
        li.querySelector('.file__thumb-ink').style.setProperty('--swatch', en.swatch);
        var thumb = li.querySelector('.file__thumb');
        if(oldThumbs[en.id]){ thumb.replaceWith(oldThumbs[en.id]); }
        else if(en.bytes){ E.lazyThumb(thumb, en, 0, 44); }
        list.appendChild(li);
      });
      F.motion.play(list, '.file', before);

      var can = ok.length >= 2 && !busy;
      if(can && go.disabled) F.motion.replay(go, 'is-ready');
      go.disabled = !can;
      goLabel.textContent = ok.length >= 2 ? 'Unir ' + U.plural(pages, 'página', 'páginas') : 'Unir PDF';
      var reading = queue.some(function(e){ return e.pages === null && !e.error; });
      hint.textContent = reading ? 'Leyendo archivos…' :
        ok.length >= 2 ? 'Se unirán en el orden de la lista.' :
        'Añade al menos 2 PDF para unirlos.';
    }

    function indexOf(id){ return queue.findIndex(function(q){ return q.id === id; }); }

    list.addEventListener('click', async function(e){
      var btn = e.target.closest('button[data-act]');
      if(!btn || busy) return;
      var li = btn.closest('.file'), i = indexOf(li.dataset.id);
      if(i < 0) return;
      var act = btn.dataset.act, focusAct = act;
      if(act === 'remove'){
        if(li._leaving) return;
        li._leaving = true;
        await F.motion.exit(li);
        i = indexOf(li.dataset.id);
        if(i < 0) return;
        E.release(queue[i]); queue.splice(i, 1);
      }
      else if(act === 'up' && i > 0){ U.move(queue, i, i - 1); }
      else if(act === 'down' && i < queue.length - 1){ U.move(queue, i, i + 1); }
      hideResult();
      var id = li.dataset.id;
      render();
      // mantener el foco en el mismo control tras reordenar
      var again = list.querySelector('[data-id="' + id + '"] [data-act="' + focusAct + '"]');
      if(again && !again.disabled) again.focus();
      else { var any = list.querySelector('[data-id="' + id + '"] button:not(:disabled)'); if(any) any.focus(); }
    });

    // arrastrar para reordenar
    var dragId = null;
    list.addEventListener('dragstart', function(e){
      var li = e.target.closest('.file'); if(!li || busy) return;
      dragId = li.dataset.id; li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    list.addEventListener('dragend', function(){
      dragId = null;
      list.querySelectorAll('.is-dragging').forEach(function(n){ n.classList.remove('is-dragging'); });
    });
    list.addEventListener('dragover', function(e){
      if(!dragId) return;
      e.preventDefault();
      var li = e.target.closest('.file');
      if(!li || li.dataset.id === dragId) return;
      var from = indexOf(dragId), to = indexOf(li.dataset.id);
      var r = li.getBoundingClientRect();
      if(e.clientY > r.top + r.height / 2 && to < from) to++;
      if(e.clientY < r.top + r.height / 2 && to > from) to--;
      if(from === to) return;
      U.move(queue, from, to);
      render();
      var n = list.querySelector('[data-id="' + dragId + '"]'); if(n) n.classList.add('is-dragging');
    });
    list.addEventListener('drop', function(e){ if(dragId){ e.preventDefault(); e.stopPropagation(); hideResult(); } });

    $('[data-merge-clear]').addEventListener('click', function(){
      if(busy) return;
      queue.forEach(E.release); queue = []; hideResult(); render();
    });
    $('[data-merge-sort]').addEventListener('click', function(){
      if(busy) return;
      queue.sort(function(a, b){ return a.name.localeCompare(b.name, 'es', { numeric: true }); });
      hideResult(); render();
    });

    function hideResult(){ result.hidden = true; }

    go.addEventListener('click', async function(){
      var ok = queue.filter(function(e){ return !e.error && e.bytes; });
      if(ok.length < 2 || busy) return;
      busy = true;
      drop.classList.add('is-disabled');
      UI.setBusy(go, true, 'Uniendo…');
      var thumbs = Array.from(list.querySelectorAll('.file:not(.is-error) .file__thumb'));
      try{
        var both = await Promise.all([UI.press(thumbs, go), E.merge(ok)]);
        var out = both[1];
        var name = U.cleanName(nameInput.value, 'documento-unido') + '.pdf';
        var blob = U.pdfBlob(out.bytes);
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = name + ' · ' + U.plural(out.pages, 'página', 'páginas') + ' · ' + U.fmtBytes(blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + name + '.');
      }catch(err){
        UI.toast('No se pudo unir: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false;
        drop.classList.remove('is-disabled');
        UI.setBusy(go, false);
        render();
      }
    });

    render();
  }

  F.tools = F.tools || {};
  F.tools.merge = { init: init };
})(window.Fusor);
