/* Herramienta: Firmar documentos. Acepta PDF, Word, imágenes y texto (todo se
   convierte a PDF en el navegador), permite colocar firmas, textos y fechas
   arrastrándolos sobre las páginas y descarga el resultado en PDF, Word, PNG o JPG. */
(function(F){
  "use strict";
  var U = F.util, E = F.engine, UI = F.ui, C = F.convert, X = F.exporter, SIG = F.signatures;
  var SHEET_W = 760;     // ancho de dibujo de cada página (px CSS); menos en documentos largos
  var MIN_W = 0.04;      // ancho mínimo de un elemento (fracción de la página)
  var DRAG_START = 6;    // px antes de considerar que se arrastra

  function init(root){
    var $ = function(s){ return root.querySelector(s); };
    var drop = $('[data-drop]');
    var head = $('[data-sign-head]'), nameEl = $('[data-sign-name]'), metaEl = $('[data-sign-meta]');
    var gridHint = $('[data-sign-gridhint]');
    var pagesEl = $('[data-sign-pages]');
    var tPages = $('[data-sign-t-pages]'), tSigs = $('[data-sign-t-sigs]'), tTexts = $('[data-sign-t-texts]');
    var libEl = $('[data-sign-library]'), libEmpty = $('[data-sign-empty]');
    var textInput = $('#signText'), initialsInput = $('#signInitials');
    var formBox = $('[data-sign-form]'), formFields = $('[data-sign-form-fields]'), formCount = $('[data-sign-form-count]'), formKeep = $('#signFormKeep');
    var undoBtn = $('[data-sign-undo]'), redoBtn = $('[data-sign-redo]');
    var nameInput = $('#signName'), extEl = $('[data-sign-ext]');
    var go = $('[data-sign-go]'), goLabel = $('[data-sign-go-label]'), hint = $('[data-sign-hint]');
    var result = $('[data-sign-result]'), resultMeta = $('[data-sign-result-meta]'), again = $('[data-sign-download]');

    var doc = null;      // { name, size, bytes, pageCount, ratios, source }
    var items = [];      // { id, page, x, y, w, src, ratio, kind, label }
    var selectedId = null;
    var currentPage = 0;
    var busy = false;
    var lastUrl = null;
    var form = [];       // campos del formulario PDF: { name, label, type, value, options, multiline, max }
    var past = [], future = [], lastMark = null; // historial para deshacer / rehacer

    // ---------- abrir documento ----------
    UI.dropzone(drop, async function(files){
      if(busy) return;
      var ok = files.filter(C.accepts);
      if(!ok.length){
        var old = files.find(function(f){ return C.kind(f) === 'old-word'; });
        UI.toast(old ? old.name + ': guárdalo como .docx o PDF para poder firmarlo.' : 'Formato no admitido: usa PDF, Word (.docx), imagen o texto.', 'error');
        return;
      }
      if(ok.length > 1) UI.toast('Firmar trabaja con un documento a la vez; se usó el primero.');
      await load(ok[0]);
    });

    async function load(file){
      busy = true;
      drop.classList.add('is-disabled');
      var k = C.kind(file);
      var title = drop.querySelector('.drop__title'), oldTitle = title.textContent;
      if(k !== 'pdf') title.textContent = 'Convirtiendo ' + (k === 'docx' ? 'Word' : k === 'image' ? 'imagen' : 'texto') + ' a PDF…';
      try{
        var pdfFile = await C.toPdf(file);
        var info = await E.open(pdfFile);
        close();
        doc = { name: file.name, size: file.size, bytes: info.bytes, pageCount: info.pageCount, ratios: info.ratios, source: k };
        nameInput.value = U.baseName(file.name).replace(/\.[^.]+$/, '') + '-firmado';
        currentPage = 0;
        render();
        await readForm();
        if(k !== 'pdf') UI.toast(k === 'docx' ? 'Se convirtió el Word a PDF. Revisa que se vea bien antes de firmar.' : 'Se convirtió a PDF para firmarlo.');
      }catch(err){
        UI.toast(file.name + ': ' + (err && err.message ? err.message : 'No se pudo leer.'), 'error');
      }finally{
        title.textContent = oldTitle;
        busy = false;
        drop.classList.remove('is-disabled');
        update();
      }
    }

    function close(){
      if(doc) E.release(doc);
      doc = null; items = []; selectedId = null; pagesEl.innerHTML = ''; hideResult();
      form = []; past = []; future = []; renderForm();
    }
    $('[data-sign-close]').addEventListener('click', function(){ if(!busy){ close(); update(); drop.focus(); } });

    // ---------- páginas ----------
    function sheetOf(page){ return pagesEl.querySelector('.sign-page[data-index="' + page + '"] .sign-page__sheet'); }
    function layerOf(page){ var s = sheetOf(page); return s && s.querySelector('.sign-layer'); }

    function render(){
      pagesEl.innerHTML = '';
      for(var i = 0; i < doc.pageCount; i++){
        var li = document.createElement('li');
        li.className = 'sign-page';
        li.dataset.index = i;
        li.innerHTML =
          '<div class="sign-page__sheet" tabindex="0" aria-label="Página ' + (i + 1) + ' de ' + doc.pageCount + '. Pulsa Intro para elegirla como destino.">' +
            '<span class="page__num-ghost" aria-hidden="true">' + (i + 1) + '</span>' +
            '<div class="sign-layer"></div>' +
          '</div>' +
          '<div class="sign-page__foot"><span class="page__label">Página ' + (i + 1) + '</span><span class="sign-page__count" data-count></span></div>';
        var sheet = li.querySelector('.sign-page__sheet');
        sheet.style.setProperty('--ratio', doc.ratios[i] || 0.7071);
        sheet._afterPaint = function(canvas){ canvas.classList.add('sign-page__canvas'); };
        pagesEl.appendChild(li);
        E.lazyThumb(sheet, doc, i, doc.pageCount > 30 ? 520 : SHEET_W);
      }
      items.forEach(place);
      markCurrent();
    }

    function markCurrent(){
      pagesEl.querySelectorAll('.sign-page').forEach(function(li){
        li.classList.toggle('is-current', +li.dataset.index === currentPage);
        var n = items.filter(function(it){ return it.page === +li.dataset.index; }).length;
        li.querySelector('[data-count]').textContent = n ? U.plural(n, 'elemento', 'elementos') : '';
      });
    }

    function setCurrent(page){ currentPage = page; markCurrent(); update(); }

    // ---------- elementos colocados ----------
    function heightOf(it){ return it.w * it.ratio * (doc.ratios[it.page] || 0.7071); }

    function clamp(it){
      it.w = Math.max(MIN_W, Math.min(it.w, 1));
      var h = heightOf(it);
      if(h > 1){ it.w = it.w / h; h = 1; }
      it.x = Math.max(0, Math.min(it.x, 1 - it.w));
      it.y = Math.max(0, Math.min(it.y, 1 - h));
    }

    function nodeOf(id){ return pagesEl.querySelector('.placed[data-id="' + id + '"]'); }

    var KINDS = { sig: 'Firma', date: 'Fecha', text: 'Texto', stamp: 'Sello', initials: 'Iniciales' };
    function describe(it){ return (KINDS[it.kind] || 'Texto') + (it.label ? ' «' + it.label + '»' : '') + ', página ' + (it.page + 1); }

    function place(it){
      var el = nodeOf(it.id);
      if(!el){
        el = document.createElement('div');
        el.className = 'placed placed--' + it.kind;
        el.dataset.id = it.id;
        el.tabIndex = 0;
        el.setAttribute('role', 'group');
        el.innerHTML =
          '<img alt="" draggable="false">' +
          '<span class="placed__bar">' +
            '<button class="placed__btn" type="button" data-act="all" aria-label="Copiar en todas las páginas" title="Copiar en todas las páginas">' + U.icon('copy') + '</button>' +
            '<button class="placed__btn placed__btn--danger" type="button" data-act="remove" aria-label="Quitar" title="Quitar">' + U.icon('trash') + '</button>' +
          '</span>' +
          '<span class="placed__resize" data-act="resize" aria-hidden="true"></span>';
        el.querySelector('img').src = it.src;
      }
      var layer = layerOf(it.page);
      if(el.parentNode !== layer) layer.appendChild(el);
      el.style.setProperty('--x', it.x);
      el.style.setProperty('--y', it.y);
      el.style.setProperty('--w', it.w);
      el.style.setProperty('--ar', 1 / it.ratio);
      el.setAttribute('aria-label', describe(it) + '. Flechas para mover, más y menos para cambiar el tamaño, Suprimir para quitar.');
      el.classList.toggle('is-selected', it.id === selectedId);
      el.classList.toggle('is-top', it.y < 0.06);
      return el;
    }

    function select(id, focus){
      selectedId = id;
      pagesEl.querySelectorAll('.placed').forEach(function(n){ n.classList.toggle('is-selected', n.dataset.id === id); });
      if(id){
        var it = find(id);
        if(it && it.page !== currentPage) setCurrent(it.page);
        if(focus){ var n = nodeOf(id); if(n) n.focus({ preventScroll: false }); }
      }
    }

    function find(id){ return items.find(function(it){ return it.id === id; }); }

    // ---------- deshacer / rehacer ----------
    function snapshot(){ return items.map(function(it){ return Object.assign({}, it); }); }

    // Guarda el estado antes de un cambio. Los cambios seguidos del mismo tipo
    // (por ejemplo, varias flechas) cuentan como uno solo.
    function remember(tag){
      var now = Date.now();
      if(tag && lastMark && lastMark.tag === tag && now - lastMark.t < 800){ lastMark.t = now; return; }
      past.push(snapshot());
      if(past.length > 100) past.shift();
      future = [];
      lastMark = tag ? { tag: tag, t: now } : null;
      paintHistory();
    }

    function restore(from, to){
      if(!from.length || !doc) return false;
      to.push(snapshot());
      items = from.pop();
      lastMark = null;
      pagesEl.querySelectorAll('.placed').forEach(function(n){ n.remove(); });
      if(selectedId && !find(selectedId)) selectedId = null;
      items.forEach(place);
      hideResult(); markCurrent(); update(); paintHistory();
      return true;
    }
    function undo(){ if(!restore(past, future)) UI.toast('No hay nada que deshacer.'); }
    function redo(){ if(!restore(future, past)) UI.toast('No hay nada que rehacer.'); }

    function paintHistory(){ undoBtn.disabled = !past.length; redoBtn.disabled = !future.length; }
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // Ctrl+Z / Ctrl+Y (Cmd en Mac) mientras Firmar está abierta; en un campo de texto manda el campo.
    document.addEventListener('keydown', function(e){
      if(document.body.dataset.tool !== 'sign' || !doc || busy) return;
      if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if(k !== 'z' && k !== 'y') return;
      var t = e.target;
      if(t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName) && t.type !== 'radio' && t.type !== 'checkbox')) return;
      if(document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if(k === 'y' || e.shiftKey) redo(); else undo();
    });

    // Añade un elemento: en (cx, cy) del centro si se indica, si no en la parte baja de la página.
    function add(img, kind, page, cx, cy, label){
      if(!doc){ UI.toast('Primero sube el documento que quieres firmar.', 'error'); return null; }
      var ratio = img.h / img.w;
      var pr = doc.ratios[page] || 0.7071;
      // tamaño inicial: firmas de ~30 % del ancho, sellos pequeños, textos según su largo; nunca muy altas
      var w = kind === 'sig' ? 0.3 : kind === 'stamp' ? 0.045 : Math.min(0.5, 0.035 * img.w / img.h);
      var maxH = kind === 'sig' ? 0.12 : kind === 'stamp' ? 0.05 : kind === 'initials' ? 0.05 : 0.04;
      if(w * ratio * pr > maxH) w = maxH / (ratio * pr);
      var it = { id: U.uid(), page: page, w: w, src: img.src, ratio: ratio, kind: kind, label: label || '' };
      var h = heightOf(it);
      it.x = cx === undefined ? 0.6 - w / 2 : cx - w / 2;
      it.y = cy === undefined ? 0.82 - h / 2 : cy - h / 2;
      clamp(it);
      // sin posición elegida: se apila encima de lo que ya hay para no taparlo
      if(cx === undefined){
        var tries = 0;
        while(tries++ < 20 && items.some(function(o){ return o.page === page && overlaps(o, it); })) it.y -= h + 0.012;
        if(it.y < 0) it.y = 0.82 - h / 2;
        clamp(it);
      }
      remember();
      items.push(it);
      hideResult();
      place(it);
      var el = nodeOf(it.id);
      if(el && el.animate && !U.reducedMotion()){
        el.animate([{ opacity: 0, transform: 'scale(1.25) rotate(-3deg)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
      select(it.id, true);
      markCurrent(); update();
      return it;
    }

    function overlaps(a, b){
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + heightOf(b) && b.y < a.y + heightOf(a);
    }

    function remove(id){
      var i = items.findIndex(function(it){ return it.id === id; });
      if(i < 0) return;
      var it = items[i];
      remember();
      items.splice(i, 1);
      var n = nodeOf(id); if(n) n.remove();
      if(selectedId === id) selectedId = null;
      hideResult(); markCurrent(); update();
      var sheet = sheetOf(it.page); if(sheet) sheet.focus();
    }

    function copyToAll(id){
      var src = find(id); if(!src) return;
      if(doc.pageCount > 1) remember();
      var added = 0;
      for(var p = 0; p < doc.pageCount; p++){
        if(p === src.page) continue;
        var it = Object.assign({}, src, { id: U.uid(), page: p });
        clamp(it); items.push(it); place(it); added++;
      }
      hideResult(); markCurrent(); update();
      UI.toast(added ? 'Se copió en ' + U.plural(added, 'página más', 'páginas más') + '.' : 'El documento solo tiene una página.');
    }

    pagesEl.addEventListener('click', function(e){
      var btn = e.target.closest('button[data-act]');
      if(btn){
        var id = btn.closest('.placed').dataset.id;
        if(btn.dataset.act === 'remove') remove(id);
        else if(btn.dataset.act === 'all') copyToAll(id);
        return;
      }
      var sheet = e.target.closest('.sign-page__sheet');
      if(sheet && !e.target.closest('.placed')){
        select(null);
        setCurrent(+sheet.parentNode.dataset.index);
      }
    });

    pagesEl.addEventListener('keydown', function(e){
      var el = e.target.closest('.placed');
      if(!el){
        var sheet = e.target.closest('.sign-page__sheet');
        if(sheet && e.target === sheet && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); setCurrent(+sheet.parentNode.dataset.index); }
        return;
      }
      if(e.target !== el) return;
      var it = find(el.dataset.id); if(!it) return;
      var before = Object.assign({}, it);
      var step = e.shiftKey ? 0.05 : 0.005, done = true;
      if(e.key === 'ArrowLeft') it.x -= step;
      else if(e.key === 'ArrowRight') it.x += step;
      else if(e.key === 'ArrowUp') it.y -= step;
      else if(e.key === 'ArrowDown') it.y += step;
      else if(e.key === '+' || e.key === '='){ var c = it.x + it.w / 2; it.w *= 1.08; it.x = c - it.w / 2; }
      else if(e.key === '-' || e.key === '_'){ var c2 = it.x + it.w / 2; it.w /= 1.08; it.x = c2 - it.w / 2; }
      else if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); remove(it.id); return; }
      else if(e.key === 'Escape'){ select(null); var s = sheetOf(it.page); if(s) s.focus(); return; }
      else done = false;
      if(!done) return;
      e.preventDefault();
      if(!e.ctrlKey && !e.metaKey){
        // el estado anterior ya se cambió arriba: se guarda una copia con el valor previo
        var after = Object.assign({}, it);
        Object.assign(it, before);
        remember('key:' + it.id);
        Object.assign(it, after);
      }
      clamp(it); place(it); hideResult();
    });

    pagesEl.addEventListener('focusin', function(e){
      var el = e.target.closest('.placed');
      if(el && el.dataset.id !== selectedId) select(el.dataset.id);
    });

    // Hoja bajo el puntero (para soltar o pasar un elemento a otra página).
    function sheetAt(x, y){
      var hit = document.elementsFromPoint(x, y);
      for(var i = 0; i < hit.length; i++){
        if(hit[i].classList && hit[i].classList.contains('sign-page__sheet') && pagesEl.contains(hit[i])) return hit[i];
      }
      return null;
    }

    // mover y cambiar tamaño con ratón, lápiz o dedo
    pagesEl.addEventListener('pointerdown', function(e){
      var el = e.target.closest('.placed');
      if(!el || e.button > 0 || e.target.closest('button')) return;
      var it = find(el.dataset.id); if(!it) return;
      e.preventDefault();
      select(it.id);
      el.focus({ preventScroll: true });
      var resizing = e.target.dataset.act === 'resize';
      var rect = sheetOf(it.page).getBoundingClientRect();
      var start = { x: e.clientX, y: e.clientY, ix: it.x, iy: it.y, iw: it.w };
      var grab = { x: (e.clientX - rect.left) / rect.width - it.x, y: (e.clientY - rect.top) / rect.height - it.y };
      el.setPointerCapture(e.pointerId);
      el.classList.add(resizing ? 'is-resizing' : 'is-moving');
      var moved = false;

      function move(ev){
        if(!moved){ moved = true; remember(); }
        if(resizing){
          var dw = (ev.clientX - start.x) / rect.width;
          var dh = (ev.clientY - start.y) / rect.height / (it.ratio * (doc.ratios[it.page] || 0.7071));
          it.w = start.iw + Math.max(dw, dh);
          it.x = start.ix; it.y = start.iy;
          it.w = Math.min(it.w, 1 - it.x, (1 - it.y) / (it.ratio * (doc.ratios[it.page] || 0.7071)));
        }else{
          var target = sheetAt(ev.clientX, ev.clientY);
          if(target && target !== sheetOf(it.page)){
            // pasa a otra página conservando el tamaño relativo al ancho
            it.page = +target.parentNode.dataset.index;
            rect = target.getBoundingClientRect();
            place(it);
            el.setPointerCapture(ev.pointerId);
            setCurrent(it.page);
          }
          it.x = (ev.clientX - rect.left) / rect.width - grab.x;
          it.y = (ev.clientY - rect.top) / rect.height - grab.y;
        }
        clamp(it); place(it);
      }
      function up(){
        el.classList.remove('is-moving', 'is-resizing');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        hideResult(); markCurrent();
      }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });

    // ---------- biblioteca de firmas ----------
    function renderLibrary(list){
      libEl.innerHTML = '';
      libEmpty.hidden = list.length > 0;
      list.forEach(function(s){
        var li = document.createElement('li');
        li.className = 'sig';
        li.dataset.id = s.id;
        li.innerHTML =
          '<button class="sig__pick" type="button" data-sig="' + s.id + '" aria-label="Agregar esta firma a la página seleccionada (también puedes arrastrarla)">' +
            '<img alt="" draggable="false">' +
          '</button>' +
          (s.saved ? '' : '<span class="sig__tag" title="No se guardó en el navegador">Solo ahora</span>') +
          '<button class="icon-btn icon-btn--danger sig__del" type="button" data-sig-del="' + s.id + '" aria-label="Borrar esta firma">' + U.icon('x') + '</button>';
        li.querySelector('img').src = s.src;
        libEl.appendChild(li);
      });
    }
    SIG.library.onChange(renderLibrary);
    renderLibrary(SIG.library.list());

    libEl.addEventListener('click', function(e){
      var del = e.target.closest('[data-sig-del]');
      if(del){ SIG.library.remove(del.dataset.sigDel); return; }
    });

    // arrastrar desde la biblioteca (o tocar para agregar a la página elegida)
    libEl.addEventListener('pointerdown', function(e){
      var pick = e.target.closest('[data-sig]');
      if(!pick || e.button > 0) return;
      var sig = SIG.library.get(pick.dataset.sig); if(!sig) return;
      var sx = e.clientX, sy = e.clientY, ghost = null, pid = e.pointerId;
      pick.setPointerCapture(pid);
      function move(ev){
        if(!ghost){
          if(Math.abs(ev.clientX - sx) < DRAG_START && Math.abs(ev.clientY - sy) < DRAG_START) return;
          if(!doc) return;
          ghost = document.createElement('img');
          ghost.className = 'sig-ghost';
          ghost.src = sig.src; ghost.alt = '';
          document.body.appendChild(ghost);
          document.body.classList.add('is-placing');
        }
        ghost.style.setProperty('--gx', ev.clientX + 'px');
        ghost.style.setProperty('--gy', ev.clientY + 'px');
        var over = sheetAt(ev.clientX, ev.clientY);
        pagesEl.querySelectorAll('.is-target').forEach(function(n){ if(n !== over) n.classList.remove('is-target'); });
        if(over) over.classList.add('is-target');
      }
      function up(ev){
        pick.removeEventListener('pointermove', move);
        pick.removeEventListener('pointerup', up);
        pick.removeEventListener('pointercancel', cancel);
        document.body.classList.remove('is-placing');
        pagesEl.querySelectorAll('.is-target').forEach(function(n){ n.classList.remove('is-target'); });
        if(ghost){
          ghost.remove();
          var sheet = sheetAt(ev.clientX, ev.clientY);
          if(sheet){
            var r = sheet.getBoundingClientRect(), page = +sheet.parentNode.dataset.index;
            setCurrent(page);
            add(sig, 'sig', page, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
          }
        }else{
          addToCurrent(sig, 'sig');
        }
      }
      function cancel(){ if(ghost) ghost.remove(); ghost = null; document.body.classList.remove('is-placing'); up({ clientX: -1, clientY: -1 }); }
      pick.addEventListener('pointermove', move);
      pick.addEventListener('pointerup', up);
      pick.addEventListener('pointercancel', cancel);
    });
    // teclado: Intro o espacio en la firma la agrega (el clic de puntero ya lo maneja pointerup)
    libEl.addEventListener('keydown', function(e){
      var pick = e.target.closest('[data-sig]');
      if(!pick || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      var sig = SIG.library.get(pick.dataset.sig);
      if(sig) addToCurrent(sig, 'sig');
    });

    function addToCurrent(img, kind, label){
      if(!doc){ UI.toast('Primero sube el documento que quieres firmar.', 'error'); return; }
      var it = add(img, kind, currentPage, undefined, undefined, label);
      if(it){
        var sheet = sheetOf(it.page);
        if(sheet) sheet.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      }
    }

    $('[data-sign-create]').addEventListener('click', function(){
      SIG.open(function(sig){ if(doc) addToCurrent(sig, 'sig'); else UI.toast('Firma lista. Sube un documento para colocarla.'); });
    });

    // ---------- texto y fecha ----------
    function addText(text, kind){
      text = String(text || '').trim();
      if(!text){ textInput.focus(); UI.toast('Escribe el texto que quieres agregar.', 'error'); return; }
      var img = SIG.textImage(text.slice(0, 200));
      if(img) addToCurrent(img, kind, text);
    }
    $('[data-sign-add-text]').addEventListener('click', function(){ addText(textInput.value, 'text'); });
    textInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); addText(textInput.value, 'text'); } });
    $('[data-sign-add-date]').addEventListener('click', function(){
      var d = new Date();
      addText(String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(), 'date');
    });

    // ---------- sellos e iniciales ----------
    // ✓ y ✗ se dibujan como trazos (no dependen de ninguna fuente).
    function stampImage(kind){
      var c = document.createElement('canvas'), n = 160;
      c.width = c.height = n;
      var ctx = c.getContext('2d');
      ctx.strokeStyle = '#1c1f2b'; ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if(kind === 'check'){ ctx.moveTo(22, 86); ctx.lineTo(62, 128); ctx.lineTo(140, 30); }
      else{ ctx.moveTo(32, 32); ctx.lineTo(128, 128); ctx.moveTo(128, 32); ctx.lineTo(32, 128); }
      ctx.stroke();
      return { src: c.toDataURL('image/png'), w: n, h: n };
    }
    root.querySelectorAll('[data-sign-stamp]').forEach(function(b){
      b.addEventListener('click', function(){
        var kind = b.dataset.signStamp;
        addToCurrent(stampImage(kind), 'stamp', kind === 'check' ? '✓' : '✗');
      });
    });

    async function addInitials(){
      var text = initialsInput.value.trim();
      if(!text){ initialsInput.focus(); UI.toast('Escribe tus iniciales, por ejemplo J. Z.', 'error'); return; }
      text = text.slice(0, 12);
      if(document.fonts) await document.fonts.load('72px "Dancing Script"', text).catch(function(){});
      var img = SIG.textImage(text, { family: '"Dancing Script", cursive', weight: 400 });
      if(img) addToCurrent(img, 'initials', text);
    }
    $('[data-sign-add-initials]').addEventListener('click', addInitials);
    initialsInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); addInitials(); } });

    // ---------- formulario del PDF ----------
    async function readForm(){
      form = [];
      try{
        var pdf = await PDFLib.PDFDocument.load(doc.bytes);
        pdf.getForm().getFields().forEach(function(f){
          var name = f.getName(), type = f.constructor.name, entry = null;
          try{
            if(f instanceof PDFLib.PDFTextField) entry = { type: 'text', value: f.getText() || '', multiline: f.isMultiline(), max: f.getMaxLength() };
            else if(f instanceof PDFLib.PDFCheckBox) entry = { type: 'check', value: f.isChecked() };
            else if(f instanceof PDFLib.PDFDropdown) entry = { type: 'select', value: (f.getSelected() || [])[0] || '', options: f.getOptions() };
            else if(f instanceof PDFLib.PDFRadioGroup) entry = { type: 'radio', value: f.getSelected() || '', options: f.getOptions() };
          }catch(e){ entry = null; }
          if(!entry || (f.isReadOnly && f.isReadOnly())) return;
          entry.name = name;
          entry.label = name.split('.').pop().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || type;
          form.push(entry);
        });
      }catch(e){ form = []; }
      renderForm();
    }

    function renderForm(){
      formBox.hidden = !form.length;
      formFields.innerHTML = '';
      formCount.textContent = form.length ? U.plural(form.length, 'campo', 'campos') : '';
      form.forEach(function(f, i){
        var id = 'signField' + i, row = document.createElement('div');
        row.className = 'form-field form-field--' + f.type;
        var label = U.escapeHtml(f.label);
        if(f.type === 'check'){
          row.innerHTML = '<label class="check"><input type="checkbox" id="' + id + '"' + (f.value ? ' checked' : '') + '><span>' + label + '</span></label>';
        }else if(f.type === 'select' || f.type === 'radio'){
          row.innerHTML = '<label class="field__label" for="' + id + '">' + label + '</label><div class="field__control"><select id="' + id + '"><option value="">—</option>' +
            f.options.map(function(o){ return '<option' + (o === f.value ? ' selected' : '') + '>' + U.escapeHtml(o) + '</option>'; }).join('') + '</select></div>';
        }else{
          var tag = f.multiline ? 'textarea rows="3"' : 'input type="text"';
          row.innerHTML = '<label class="field__label" for="' + id + '">' + label + '</label><div class="field__control"><' + tag + ' id="' + id + '"' +
            (f.max ? ' maxlength="' + f.max + '"' : '') + ' autocomplete="off"></' + (f.multiline ? 'textarea' : 'input') + '></div>';
          row.querySelector('#' + id).value = f.value;
        }
        var input = row.querySelector('#' + id);
        input.addEventListener(f.type === 'text' ? 'input' : 'change', function(){
          f.value = f.type === 'check' ? input.checked : input.value;
          hideResult(); update();
        });
        formFields.appendChild(row);
      });
    }
    formKeep.addEventListener('change', hideResult);

    function fillForm(pdf){
      if(!form.length) return;
      var pf = pdf.getForm();
      form.forEach(function(f){
        try{
          var field = pf.getField(f.name);
          if(f.type === 'text') field.setText(f.value || '');
          else if(f.type === 'check'){ if(f.value) field.check(); else field.uncheck(); }
          else if(f.type === 'select'){ if(f.value) field.select(f.value); else field.clear(); }
          else if(f.type === 'radio'){ if(f.value) field.select(f.value); else field.clear(); }
        }catch(e){
          throw new Error('el campo «' + f.label + '» tiene caracteres que el formulario no admite');
        }
      });
      if(!formKeep.checked){
        // aplanar: el texto queda impreso en la página y las firmas pueden ir encima
        try{ pf.flatten(); dropDeadAnnots(pdf); }catch(e){ /* algunos formularios no se dejan aplanar: quedan rellenados y editables */ }
      }
    }

    // pdf-lib, al aplanar, deja en cada página referencias a los campos que borró.
    function dropDeadAnnots(pdf){
      var ctx = pdf.context, ANNOTS = PDFLib.PDFName.of('Annots');
      pdf.getPages().forEach(function(page){
        var arr = page.node.lookup(ANNOTS);
        if(!(arr instanceof PDFLib.PDFArray)) return;
        for(var i = arr.size() - 1; i >= 0; i--){
          var ref = arr.get(i);
          if(ref instanceof PDFLib.PDFRef && !ctx.lookup(ref)) arr.remove(i);
        }
        if(!arr.size()) page.node.delete(ANNOTS);
      });
    }

    // ---------- formato y descarga ----------
    function format(){ var r = root.querySelector('input[name=signFormat]:checked'); return r ? r.value : 'pdf'; }
    root.querySelectorAll('input[name=signFormat]').forEach(function(r){
      r.addEventListener('change', function(){ hideResult(); update(); });
    });

    function hideResult(){ result.hidden = true; }

    function update(){
      var has = !!doc;
      head.hidden = !has; gridHint.hidden = !has; drop.hidden = has;
      var sigs = items.filter(function(it){ return it.kind === 'sig'; }).length;
      F.motion.count(tPages, has ? doc.pageCount : 0);
      F.motion.count(tSigs, sigs);
      F.motion.count(tTexts, items.length - sigs);
      if(has){
        nameEl.textContent = doc.name;
        metaEl.textContent = U.plural(doc.pageCount, 'página', 'páginas') + ' · ' + U.fmtBytes(doc.size) +
          (doc.source !== 'pdf' ? ' · convertido a PDF' : '') + ' · destino: página ' + (currentPage + 1);
      }
      var f = X.FORMATS[format()];
      extEl.textContent = '.' + (f.ext === 'pdf' || f.ext === 'docx' || !has || doc.pageCount === 1 ? f.ext : 'zip');
      paintHistory();
      go.disabled = !has || busy;
      goLabel.textContent = !has ? 'Firmar documento' : items.length ? 'Firmar y descargar ' + f.label : 'Descargar ' + f.label;
      hint.textContent = !has ? 'Primero sube un documento.' :
        !items.length && !form.length ? 'Aún no hay firmas: se descargará sin firmar.' :
        !items.length ? 'Se descargará con el formulario rellenado y sin firmas.' :
        (format() === 'png' || format() === 'jpg') && doc.pageCount > 1 ? 'Cada página será una imagen dentro de un .zip.' :
        format() === 'docx' ? 'Cada página va como imagen en el Word, para que se vea idéntica.' :
        'Las firmas se integran en el documento.';
    }

    // Esquina de la imagen y giro en el espacio de la página según su /Rotate.
    function placement(page, it){
      var box = page.getCropBox();
      var rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
      var quarter = rot === 90 || rot === 270;
      var dw = quarter ? box.height : box.width, dh = quarter ? box.width : box.height; // tamaño visible
      var x = it.x * dw, y = it.y * dh, w = it.w * dw, h = it.w * it.ratio * dw;
      var bx = box.x, by = box.y, W = box.width, H = box.height;
      if(rot === 90) return { x: bx + y + h, y: by + x, width: w, height: h, rotate: 90 };
      if(rot === 180) return { x: bx + W - x, y: by + y + h, width: w, height: h, rotate: 180 };
      if(rot === 270) return { x: bx + W - (y + h), y: by + H - x, width: w, height: h, rotate: 270 };
      return { x: bx + x, y: by + H - y - h, width: w, height: h, rotate: 0 };
    }

    function dataUrlBytes(src){
      var bin = atob(src.slice(src.indexOf(',') + 1)), out = new Uint8Array(bin.length);
      for(var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    async function signedPdf(){
      var pdf = await PDFLib.PDFDocument.load(doc.bytes);
      fillForm(pdf);
      var pages = pdf.getPages(), cache = {};
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        if(!cache[it.src]) cache[it.src] = await pdf.embedPng(dataUrlBytes(it.src));
        var p = placement(pages[it.page], it);
        pages[it.page].drawImage(cache[it.src], { x: p.x, y: p.y, width: p.width, height: p.height, rotate: PDFLib.degrees(p.rotate) });
      }
      if(items.length || form.length) pdf.setModificationDate(new Date());
      return pdf.save();
    }

    go.addEventListener('click', async function(){
      if(!doc || busy) return;
      busy = true; UI.setBusy(go, true, 'Firmando…');
      select(null);
      var fmt = format(), base = U.cleanName(nameInput.value, 'documento-firmado').replace(/\.(pdf|docx|png|jpe?g|zip)$/i, '');
      try{
        var bytes = await signedPdf();
        var out;
        var progress = function(i, n){ if(n > 1) goLabel.textContent = 'Página ' + (i + 1) + ' de ' + n + '…'; };
        if(fmt === 'pdf') out = { blob: U.pdfBlob(bytes), name: base + '.pdf', count: doc.pageCount };
        else if(fmt === 'docx') out = await X.docx(bytes, base, progress);
        else out = await X.images(bytes, fmt, base, progress);
        if(lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = U.saveBlob(out.blob, out.name);
        again.href = lastUrl; again.download = out.name;
        resultMeta.textContent = out.name + ' · ' + U.plural(doc.pageCount, 'página', 'páginas') + ' · ' +
          (items.length ? U.plural(items.length, 'elemento colocado', 'elementos colocados') : 'sin firmas') + ' · ' + U.fmtBytes(out.blob.size);
        result.hidden = false;
        UI.toast('Se descargó ' + out.name + '.');
      }catch(err){
        UI.toast('No se pudo crear el archivo: ' + (err && err.message ? err.message : 'error desconocido') + '.', 'error');
      }finally{
        busy = false; UI.setBusy(go, false); update();
      }
    });

    // clic fuera de cualquier elemento: se deselecciona
    document.addEventListener('pointerdown', function(e){
      if(selectedId && !e.target.closest('.placed') && !e.target.closest('.side')) select(null);
    });

    update();
  }

  F.tools = F.tools || {};
  F.tools.sign = { init: init };
})(window.Fusor);
