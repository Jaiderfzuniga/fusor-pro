/* Herramienta: Dividir / extraer páginas de un PDF. */
(function(F){
  "use strict";
  var U = F.util, E = F.engine, UI = F.ui;
  var THUMB_W = 160;

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var head = $('[data-split-head]'), nameEl = $('[data-split-name]'), metaEl = $('[data-split-meta]');
    var gridHint = $('[data-split-gridhint]');
    var grid = $('[data-split-pages]');
    var rangeField = $('[data-split-range-field]'), rangeInput = $('#splitRange'), rangeHelp = $('[data-split-range-help]');
    var chunkField = $('[data-split-chunk-field]'), chunkInput = $('#splitChunk');
    var baseInput = $('#splitName');
    var go = $('[data-split-go]'), goLabel = $('[data-split-go-label]'), hint = $('[data-split-hint]');
    var result = $('[data-split-result]'), resultMeta = $('[data-split-result-meta]'), resultList = $('[data-split-result-list]');
    var allBtn = $('[data-split-download-all]');

    var doc = null;          // { name, size, bytes, pageCount, ratios }
    var selected = [];       // índices base 0
    var lastClick = null;
    var busy = false;
    var urls = [];

    UI.dropzone(drop, async function(files){
      if(busy) return;
      var pdfs = UI.onlyPdfs(files);
      if(!pdfs.length) return;
      if(pdfs.length > 1) UI.toast('Dividir trabaja con un PDF a la vez; se usó el primero.');
      await load(pdfs[0]);
    });

    async function load(file){
      drop.classList.add('is-disabled');
      try{
        var info = await E.open(file);
        close();
        doc = { name: file.name, size: file.size, bytes: info.bytes, pageCount: info.pageCount, ratios: info.ratios };
        baseInput.value = U.baseName(file.name);
        selected = [];
        rangeInput.value = '';
        renderGrid();
      }catch(err){
        UI.toast(file.name + ': ' + (err.message || 'No se pudo leer.'), 'error');
      }finally{
        drop.classList.remove('is-disabled');
        update();
      }
    }

    function close(){
      if(doc) E.release(doc);
      doc = null; selected = []; grid.innerHTML = ''; clearResult();
    }

    $('[data-split-close]').addEventListener('click', function(){ if(!busy){ close(); update(); drop.focus(); } });

    function renderGrid(){
      grid.innerHTML = '';
      for(var i = 0; i < doc.pageCount; i++){
        var li = document.createElement('li');
        li.className = 'page page--pick';
        li.dataset.index = i;
        li.innerHTML =
          '<div class="page__sheet" role="checkbox" tabindex="0" aria-checked="false" aria-label="Página ' + (i + 1) + '" style="--ratio:' + (doc.ratios[i] || 0.7071) + '">' +
            '<span class="page__check" aria-hidden="true"><svg class="icon"><path d="m5 12 5 5 9-10"/></svg></span>' +
            '<span class="page__num-ghost" aria-hidden="true">' + (i + 1) + '</span>' +
          '</div>' +
          '<div class="page__foot"><span class="page__label">Página ' + (i + 1) + '</span></div>';
        grid.appendChild(li);
        E.lazyThumb(li.querySelector('.page__sheet'), doc, i, THUMB_W);
      }
    }

    function paintSelection(){
      var set = {};
      selected.forEach(function(i){ set[i] = true; });
      grid.querySelectorAll('.page').forEach(function(li){
        var on = !!set[li.dataset.index];
        li.classList.toggle('is-selected', on);
        li.querySelector('.page__sheet').setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }

    function setSelection(list, fromInput){
      selected = list.slice().sort(function(a, b){ return a - b; });
      if(!fromInput) rangeInput.value = U.formatRanges(selected);
      paintSelection();
      clearResult();
      update();
    }

    function toggle(i, shift){
      var set = {};
      selected.forEach(function(s){ set[s] = true; });
      if(shift && lastClick !== null){
        var a = Math.min(lastClick, i), b = Math.max(lastClick, i), on = !set[i];
        for(var k = a; k <= b; k++){ if(on) set[k] = true; else delete set[k]; }
      }else{
        if(set[i]) delete set[i]; else set[i] = true;
      }
      lastClick = i;
      setSelection(Object.keys(set).map(Number));
    }

    grid.addEventListener('click', function(e){
      var sheet = e.target.closest('.page__sheet'); if(!sheet || busy) return;
      toggle(+sheet.parentNode.dataset.index, e.shiftKey);
    });
    grid.addEventListener('keydown', function(e){
      var sheet = e.target.closest('.page__sheet'); if(!sheet) return;
      if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); toggle(+sheet.parentNode.dataset.index, e.shiftKey); }
    });

    rangeInput.addEventListener('input', function(){
      if(!doc) return;
      var r = U.parseRanges(rangeInput.value, doc.pageCount);
      rangeField.querySelector('.field__control').classList.toggle('is-error', !!r.error);
      if(r.error){ rangeHelp.textContent = r.error; rangeHelp.classList.add('is-error'); update(r.error); return; }
      rangeHelp.classList.remove('is-error');
      setSelection(r.pages, true);
    });

    root.querySelectorAll('[data-split-select]').forEach(function(b){
      b.addEventListener('click', function(){
        if(!doc) return;
        var kind = b.dataset.splitSelect, out = [];
        for(var i = 0; i < doc.pageCount; i++){
          if(kind === 'all' || (kind === 'odd' && i % 2 === 0) || (kind === 'even' && i % 2 === 1)) out.push(i);
        }
        rangeField.querySelector('.field__control').classList.remove('is-error');
        rangeHelp.classList.remove('is-error');
        setSelection(out);
      });
    });

    root.querySelectorAll('input[name=splitMode]').forEach(function(r){ r.addEventListener('change', function(){ clearResult(); update(); }); });
    chunkInput.addEventListener('input', function(){ clearResult(); update(); });

    function mode(){ return root.querySelector('input[name=splitMode]:checked').value; }

    // Qué archivos saldrán: lista de listas de índices.
    function plan(){
      if(!doc) return [];
      var m = mode();
      var pages = selected.length ? selected : allPages();
      if(m === 'extract') return [pages];
      if(m === 'each') return pages.map(function(p){ return [p]; });
      var n = Math.max(1, parseInt(chunkInput.value, 10) || 1), all = allPages(), out = [];
      for(var i = 0; i < all.length; i += n) out.push(all.slice(i, i + n));
      return out;
    }
    function allPages(){ var a = []; for(var i = 0; i < doc.pageCount; i++) a.push(i); return a; }

    function update(rangeError){
      var has = !!doc;
      head.hidden = !has; gridHint.hidden = !has; drop.hidden = has;
      if(has){
        nameEl.textContent = doc.name;
        metaEl.textContent = U.plural(doc.pageCount, 'página', 'páginas') + ' · ' + U.fmtBytes(doc.size) +
          (selected.length ? ' · ' + U.plural(selected.length, 'seleccionada', 'seleccionadas') : '');
      }
      var m = mode();
      chunkField.hidden = m !== 'chunks';
      rangeField.hidden = m === 'chunks';
      if(!rangeError && m !== 'chunks') rangeHelp.textContent = selected.length ? U.plural(selected.length, 'página elegida', 'páginas elegidas') + '.' : 'Vacío significa todas las páginas.';

      var p = plan();
      var can = has && !busy && !rangeError && p.length > 0;
      go.disabled = !can;
      if(!has){ goLabel.textContent = 'Dividir PDF'; hint.textContent = 'Primero elige un PDF.'; return; }
      if(rangeError){ goLabel.textContent = 'Dividir PDF'; hint.textContent = 'Revisa el rango de páginas.'; return; }
      var pages = p.reduce(function(s, f){ return s + f.length; }, 0);
      goLabel.textContent = p.length === 1 ? 'Crear PDF de ' + U.plural(pages, 'página', 'páginas') : 'Crear ' + p.length + ' PDF';
      hint.textContent = m === 'extract' ? 'Un archivo con las páginas en su orden original.' :
        m === 'each' ? 'Un archivo por cada página.' :
        U.plural(p.length, 'archivo', 'archivos') + ' de hasta ' + U.plural(Math.max(1, parseInt(chunkInput.value, 10) || 1), 'página', 'páginas') + '.';
    }

    function clearResult(){
      urls.forEach(function(u){ URL.revokeObjectURL(u.url); });
      urls = []; resultList.innerHTML = ''; result.hidden = true;
    }

    go.addEventListener('click', async function(){
      var p = plan(); if(!p.length || busy) return;
      busy = true; UI.setBusy(go, true, 'Creando…');
      clearResult();
      var base = U.cleanName(baseInput.value, 'documento');
      try{
        for(var i = 0; i < p.length; i++){
          var out = await E.build(doc.bytes, p[i].map(function(idx){ return { index: idx }; }));
          var name = p.length === 1 ? base + '-paginas-' + U.formatRanges(p[i]).replace(/, /g, '_') + '.pdf'
                                    : base + '-' + String(i + 1).padStart(String(p.length).length, '0') + '.pdf';
          var blob = U.pdfBlob(out.bytes);
          urls.push({ url: URL.createObjectURL(blob), name: name, size: blob.size, pages: out.pages });
        }
        urls.forEach(function(u){
          var li = document.createElement('li');
          li.innerHTML = '<a href="' + u.url + '" download="' + U.escapeHtml(u.name) + '"><span>' + U.escapeHtml(u.name) + '</span><span>' +
            U.plural(u.pages, 'pág.', 'pág.') + ' · ' + U.fmtBytes(u.size) + '</span></a>';
          resultList.appendChild(li);
        });
        var total = urls.reduce(function(s, u){ return s + u.size; }, 0);
        resultMeta.textContent = U.plural(urls.length, 'archivo creado', 'archivos creados') + ' · ' + U.fmtBytes(total);
        allBtn.hidden = urls.length < 2;
        result.hidden = false;
        if(urls.length === 1){
          resultList.querySelector('a').click();
          UI.toast('Se descargó ' + urls[0].name + '.');
        }else{
          UI.toast(U.plural(urls.length, 'archivo listo', 'archivos listos') + '. Descárgalos desde el panel.');
        }
      }catch(err){
        UI.toast('No se pudo dividir: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    allBtn.addEventListener('click', async function(){
      var links = Array.from(resultList.querySelectorAll('a'));
      for(var i = 0; i < links.length; i++){ links[i].click(); await U.sleep(350); }
    });

    update();
  }

  F.tools = F.tools || {};
  F.tools.split = { init: init };
})(window.Fusor);
