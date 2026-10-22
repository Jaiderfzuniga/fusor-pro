/* Herramienta: Organizar páginas (reordenar, girar, quitar). */
(function(F){
  "use strict";
  var U = F.util, E = F.engine, UI = F.ui;
  var THUMB_W = 160;

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var head = $('[data-org-head]'), nameEl = $('[data-org-name]'), metaEl = $('[data-org-meta]');
    var gridHint = $('[data-org-gridhint]');
    var grid = $('[data-org-pages]');
    var tFinal = $('[data-org-t-final]'), tRot = $('[data-org-t-rot]'), tDel = $('[data-org-t-del]');
    var nameInput = $('#orgName');
    var go = $('[data-org-go]'), goLabel = $('[data-org-go-label]'), hint = $('[data-org-hint]');
    var result = $('[data-org-result]'), resultMeta = $('[data-org-result-meta]'), again = $('[data-org-download]');

    var doc = null;
    var pages = [];   // { id, index, rotate, void, ratio }
    var busy = false;
    var lastUrl = null;
    var thumbs = {};  // id -> nodo .page__sheet ya pintado

    UI.dropzone(drop, async function(files){
      if(busy) return;
      var pdfs = UI.onlyPdfs(files);
      if(!pdfs.length) return;
      if(pdfs.length > 1) UI.toast('Organizar trabaja con un PDF a la vez; se usó el primero.');
      drop.classList.add('is-disabled');
      try{
        var info = await E.open(pdfs[0]);
        close();
        doc = { name: pdfs[0].name, size: pdfs[0].size, bytes: info.bytes, pageCount: info.pageCount };
        nameInput.value = U.baseName(doc.name) + '-organizado';
        pages = info.ratios.map(function(r, i){ return { id: 'p' + i, index: i, rotate: 0, void: false, ratio: r }; });
        render();
      }catch(err){
        UI.toast(pdfs[0].name + ': ' + (err.message || 'No se pudo leer.'), 'error');
      }finally{
        drop.classList.remove('is-disabled');
        update();
      }
    });

    function close(){
      if(doc) E.release(doc);
      doc = null; pages = []; thumbs = {}; grid.innerHTML = ''; result.hidden = true;
    }
    $('[data-org-close]').addEventListener('click', function(){ if(!busy){ close(); update(); drop.focus(); } });

    function sheetFor(p){
      var sheet = thumbs[p.id];
      if(!sheet){
        sheet = document.createElement('div');
        sheet.className = 'page__sheet';
        sheet.innerHTML = '<span class="page__num-ghost" aria-hidden="true">' + (p.index + 1) + '</span>';
        sheet._afterPaint = function(){ applyRotation(sheet, p); };
        thumbs[p.id] = sheet;
        E.lazyThumb(sheet, doc, p.index, THUMB_W);
      }
      sheet.style.setProperty('--ratio', p.ratio || 0.7071);
      applyRotation(sheet, p);
      return sheet;
    }

    function applyRotation(sheet, p){
      var c = sheet.querySelector('canvas');
      if(!c) return;
      var quarter = Math.abs(p.rotate / 90) % 2 === 1;
      // al girar 90° la hoja cambia de proporción: se escala para que quepa
      var s = quarter ? Math.min(p.ratio || 0.7071, 1 / (p.ratio || 0.7071)) : 1;
      c.style.transform = 'rotate(' + p.rotate + 'deg) scale(' + s + ')';
    }

    var justVoided = null;

    function render(){
      var before = F.motion.capture(grid, '.page');
      grid.innerHTML = '';
      var n = 0;
      pages.forEach(function(p, i){
        if(!p.void) n++;
        var li = document.createElement('li');
        li.className = 'page' + (p.void ? ' is-void' : '');
        li.dataset.id = p.id;
        li.draggable = !p.void;
        li.setAttribute('aria-label', 'Página original ' + (p.index + 1) + (p.void ? ', quitada' : ', posición ' + n));
        li.appendChild(sheetFor(p));
        var sheet = li.firstChild;
        sheet.querySelectorAll('.page__rot, .page__stamp').forEach(function(x){ x.remove(); });
        if(p.rotate) sheet.insertAdjacentHTML('beforeend', '<span class="page__rot">' + p.rotate + '°</span>');
        if(p.void) sheet.insertAdjacentHTML('beforeend', '<span class="page__stamp' + (p.id === justVoided ? ' is-new' : '') + '">QUITADA</span>');
        var foot = document.createElement('div');
        foot.className = 'page__foot';
        foot.innerHTML =
          '<span class="page__label">' + (p.void ? 'Página ' + (p.index + 1) : 'Página ' + n + (p.index + 1 !== n ? ' <span class="page__was">· era ' + (p.index + 1) + '</span>' : '')) + '</span>' +
          '<span class="page__tools">' +
            (p.void
              ? '<button class="icon-btn" type="button" data-act="restore" aria-label="Recuperar página ' + (p.index + 1) + '">' + U.icon('undo') + '</button>'
              : '<button class="icon-btn" type="button" data-act="left" aria-label="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + U.icon('left') + '</button>' +
                '<button class="icon-btn" type="button" data-act="right" aria-label="Mover después"' + (i === pages.length - 1 ? ' disabled' : '') + '>' + U.icon('right') + '</button>' +
                '<button class="icon-btn" type="button" data-act="rotr" aria-label="Girar página ' + (p.index + 1) + '">' + U.icon('rotr') + '</button>' +
                '<button class="icon-btn icon-btn--danger" type="button" data-act="void" aria-label="Quitar página ' + (p.index + 1) + '">' + U.icon('trash') + '</button>') +
          '</span>';
        li.appendChild(foot);
        grid.appendChild(li);
      });
      justVoided = null;
      F.motion.play(grid, '.page', before);
      update();
    }

    function update(){
      var has = !!doc;
      head.hidden = !has; gridHint.hidden = !has; drop.hidden = has;
      var kept = pages.filter(function(p){ return !p.void; });
      var rot = pages.filter(function(p){ return !p.void && p.rotate; }).length;
      var del = pages.length - kept.length;
      F.motion.count(tFinal, kept.length); F.motion.count(tRot, rot); F.motion.count(tDel, del);
      if(has){
        nameEl.textContent = doc.name;
        metaEl.textContent = U.plural(doc.pageCount, 'página', 'páginas') + ' · ' + U.fmtBytes(doc.size);
      }
      var changed = pages.some(function(p, i){ return p.void || p.rotate || p.index !== i; });
      go.disabled = !has || busy || kept.length === 0;
      goLabel.textContent = has && kept.length ? 'Guardar ' + U.plural(kept.length, 'página', 'páginas') : 'Guardar PDF';
      hint.textContent = !has ? 'Primero elige un PDF.' :
        kept.length === 0 ? 'Quitaste todas las páginas; recupera al menos una.' :
        changed ? 'Las páginas quitadas no se incluirán.' : 'Aún no hay cambios.';
    }

    function idx(id){ return pages.findIndex(function(p){ return p.id === id; }); }

    grid.addEventListener('click', function(e){
      var btn = e.target.closest('button[data-act]');
      if(!btn || busy) return;
      var li = btn.closest('.page'), i = idx(li.dataset.id), p = pages[i], act = btn.dataset.act;
      if(act === 'left' && i > 0) U.move(pages, i, i - 1);
      else if(act === 'right' && i < pages.length - 1) U.move(pages, i, i + 1);
      else if(act === 'rotr') p.rotate = (p.rotate + 90) % 360;
      else if(act === 'void'){ p.void = true; justVoided = p.id; }
      else if(act === 'restore') p.void = false;
      result.hidden = true;
      render();
      var focusAct = act === 'void' ? 'restore' : act === 'restore' ? 'void' : act;
      var t = grid.querySelector('[data-id="' + p.id + '"] [data-act="' + focusAct + '"]');
      if(t && !t.disabled) t.focus();
      else { var any = grid.querySelector('[data-id="' + p.id + '"] button:not(:disabled)'); if(any) any.focus(); }
    });

    // arrastrar para reordenar (marca de inserción, se aplica al soltar)
    var dragId = null, dropBefore = null;
    function clearMarks(){ grid.querySelectorAll('.is-drop-before').forEach(function(n){ n.classList.remove('is-drop-before'); }); }
    grid.addEventListener('dragstart', function(e){
      var li = e.target.closest('.page'); if(!li || busy) return;
      dragId = li.dataset.id; li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    });
    grid.addEventListener('dragend', function(){
      dragId = null; dropBefore = null; clearMarks();
      grid.querySelectorAll('.is-dragging').forEach(function(n){ n.classList.remove('is-dragging'); });
    });
    grid.addEventListener('dragover', function(e){
      if(!dragId) return;
      e.preventDefault();
      var li = e.target.closest('.page'); if(!li) return;
      var r = li.getBoundingClientRect();
      var target = li;
      if(e.clientX > r.left + r.width / 2) target = li.nextElementSibling;
      clearMarks();
      dropBefore = target ? target.dataset.id : null;
      if(target) target.classList.add('is-drop-before');
    });
    grid.addEventListener('drop', function(e){
      if(!dragId) return;
      e.preventDefault(); e.stopPropagation();
      var from = idx(dragId);
      var item = pages.splice(from, 1)[0];
      var to = dropBefore ? idx(dropBefore) : pages.length;
      pages.splice(to < 0 ? pages.length : to, 0, item);
      dragId = null; dropBefore = null;
      result.hidden = true;
      render();
    });

    $('[data-org-rotall]').addEventListener('click', function(){
      if(!doc || busy) return;
      pages.forEach(function(p){ if(!p.void) p.rotate = (p.rotate + 270) % 360; });
      result.hidden = true; render();
    });
    $('[data-org-reset]').addEventListener('click', function(){
      if(!doc || busy) return;
      pages.sort(function(a, b){ return a.index - b.index; });
      pages.forEach(function(p){ p.rotate = 0; p.void = false; });
      result.hidden = true; render();
    });

    go.addEventListener('click', async function(){
      var kept = pages.filter(function(p){ return !p.void; });
      if(!kept.length || busy) return;
      busy = true; UI.setBusy(go, true, 'Guardando…');
      try{
        var out = await E.build(doc.bytes, kept.map(function(p){ return { index: p.index, rotate: p.rotate }; }));
        var name = U.cleanName(nameInput.value, 'documento-organizado') + '.pdf';
        var blob = U.pdfBlob(out.bytes);
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(blob, name);
        again.href = lastUrl; again.download = name;
        resultMeta.textContent = name + ' · ' + U.plural(out.pages, 'página', 'páginas') + ' · ' + U.fmtBytes(blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + name + '.');
      }catch(err){
        UI.toast('No se pudo guardar: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    update();
  }

  F.tools = F.tools || {};
  F.tools.organize = { init: init };
})(window.Fusor);
