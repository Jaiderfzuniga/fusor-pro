/* Motor de PDF: lectura, miniaturas y escritura.
   pdf-lib crea y modifica los documentos; pdf.js (opcional) dibuja las miniaturas. */
(function(F){
  "use strict";

  var PDFLib = window.PDFLib;
  var MAX_BYTES = 200 * 1024 * 1024; // más que esto suele colgar la pestaña en un celular

  // pdf.js llega con defer (js/core/pdfjs-loader.js), después de este script.
  var pdfjsReady = new Promise(function(resolve){
    if(window.fusorPdfjsReady) return resolve(window.pdfjsLib);
    window.addEventListener('fusor:pdfjs-ready', function(){ resolve(window.pdfjsLib); }, { once: true });
    setTimeout(function(){ resolve(window.pdfjsLib || null); }, 8000);
  });

  function ReadError(code, message){
    this.code = code; this.message = message;
  }

  // Un PDF empieza con "%PDF-" en su primer kilobyte.
  function looksLikePdf(bytes){
    var head = bytes.subarray(0, 1024);
    for(var i = 0; i < head.length - 4; i++){
      if(head[i] === 0x25 && head[i+1] === 0x50 && head[i+2] === 0x44 && head[i+3] === 0x46 && head[i+4] === 0x2d) return true;
    }
    return false;
  }

  // Lee un archivo y devuelve sus bytes, número de páginas, giros y proporciones.
  async function open(file){
    if(file.size > MAX_BYTES) throw new ReadError('too-big', 'Es demasiado grande (máximo 200 MB).');
    if(file.size === 0) throw new ReadError('empty', 'El archivo está vacío.');
    var bytes = new Uint8Array(await file.arrayBuffer());
    if(!looksLikePdf(bytes)) throw new ReadError('not-pdf', 'No es un PDF válido.');
    var doc;
    try{
      doc = await PDFLib.PDFDocument.load(bytes);
    }catch(err){
      if(err && /encrypt/i.test(err.message || err.name || '')){
        throw new ReadError('encrypted', 'Está protegido con contraseña.');
      }
      throw new ReadError('invalid', 'No se pudo leer: puede estar dañado.');
    }
    var pages = doc.getPages();
    if(pages.length === 0) throw new ReadError('empty', 'El documento no tiene páginas.');
    return {
      bytes: bytes,
      pageCount: pages.length,
      rotations: pages.map(function(p){ return p.getRotation().angle || 0; }),
      ratios: pages.map(function(p){
        var s = p.getSize(), r = (p.getRotation().angle || 0) % 180 !== 0;
        return r ? s.height / s.width : s.width / s.height;
      })
    };
  }

  // ---------- miniaturas ----------
  var renderQueue = Promise.resolve();

  function pdfjsDoc(entry){
    if(!entry._pdfjs){
      entry._pdfjs = pdfjsReady.then(function(pdfjs){
        if(!pdfjs) return null;
        // pdf.js se queda con el buffer; le damos una copia.
        // Sin eval ni scripts del PDF: cierra la vía de ataque de CVE-2024-4367.
        return pdfjs.getDocument({
          data: entry.bytes.slice(0),
          isEvalSupported: false,
          enableXfa: false,
          disableFontFace: false,
          stopAtErrors: false
        }).promise;
      }).catch(function(){ return null; });
    }
    return entry._pdfjs;
  }

  // Dibuja una página en un canvas de ancho cssWidth. Devuelve null si no hay pdf.js.
  // Ninguna miniatura puede bloquear la cola más de 10 s.
  function withTimeout(p, ms){
    return Promise.race([p, new Promise(function(r){ setTimeout(function(){ r(null); }, ms); })]);
  }

  function renderThumb(entry, index, cssWidth){
    var job = renderQueue.then(function(){ return withTimeout(draw(), 10000); }).catch(function(){ return null; });
    renderQueue = job;
    return job;

    async function draw(){
      var doc = await pdfjsDoc(entry);
      if(!doc) return null;
      var page = await doc.getPage(index + 1);
      var base = page.getViewport({ scale: 1 });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var scale = (cssWidth * dpr) / base.width;
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      page.cleanup();
      return canvas;
    }
  }

  // Dibuja una página completa a una escala dada (1 = 72 ppp), fuera de la cola de
  // miniaturas. Devuelve null si pdf.js no está disponible.
  async function rasterize(entry, index, scale){
    var doc = await pdfjsDoc(entry);
    if(!doc) return null;
    var page = await doc.getPage(index + 1);
    var vp = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    return canvas;
  }

  // Pinta miniaturas solo cuando entran en pantalla.
  var observer = ('IntersectionObserver' in window) ? new IntersectionObserver(function(items){
    items.forEach(function(it){
      if(!it.isIntersecting) return;
      observer.unobserve(it.target);
      var fn = it.target._paint;
      if(fn){ it.target._paint = null; fn(); }
    });
  }, { rootMargin: '300px 0px' }) : null;

  function lazyThumb(holder, entry, index, cssWidth){
    holder._paint = function(){
      renderThumb(entry, index, cssWidth).then(function(canvas){
        if(!holder.isConnected) return;
        if(!canvas){
          // sin vista previa: queda el número de página y quien lo use puede avisar
          holder.dataset.preview = 'none';
          if(holder._noPaint) holder._noPaint();
          return;
        }
        canvas.setAttribute('aria-hidden', 'true');
        var ghost = holder.querySelector('.page__num-ghost, .file__thumb-ink');
        if(ghost) ghost.remove();
        holder.insertBefore(canvas, holder.firstChild);
        holder._canvas = canvas;
        if(F.motion) F.motion.inkIn(canvas);
        if(holder._afterPaint) holder._afterPaint(canvas);
      });
    };
    if(observer) observer.observe(holder); else holder._paint();
  }

  function release(entry){
    if(entry && entry._pdfjs){
      entry._pdfjs.then(function(d){ if(d) d.destroy(); });
      entry._pdfjs = null;
    }
  }

  // ---------- formularios ----------
  // copyPages copia los campos que se ven en cada página (sus «widgets»), pero no
  // el formulario del documento (/AcroForm): los campos quedarían visibles pero sin
  // poder rellenarse. Aquí se vuelve a armar con los campos que quedaron en las
  // páginas de salida. También repara PDFs a los que ya les pasó.
  function keepForms(out, sources){
    var N = PDFLib.PDFName, ctx = out.context;
    var widgets = {}, roots = [], seenRoot = {};
    function key(ref){ return ref.toString(); }

    out.getPages().forEach(function(page){
      var annots = page.node.lookup(N.of('Annots'));
      if(!(annots instanceof PDFLib.PDFArray)) return;
      annots.asArray().forEach(function(ref){
        var a = ctx.lookup(ref);
        if(!(ref instanceof PDFLib.PDFRef) || !(a instanceof PDFLib.PDFDict) || String(a.get(N.of('Subtype'))) !== '/Widget') return;
        widgets[key(ref)] = true;
        // sube por /Parent hasta el campo raíz
        var r = ref, d = a, guard = 0;
        while(d.get(N.of('Parent')) instanceof PDFLib.PDFRef && guard++ < 32){ r = d.get(N.of('Parent')); d = ctx.lookup(r); }
        if(!(d instanceof PDFLib.PDFDict) || !d.get(N.of('T')) || seenRoot[key(r)]) return;
        seenRoot[key(r)] = true;
        roots.push({ ref: r, dict: d });
      });
    });
    if(!roots.length) return;

    // Quita de /Kids los widgets de páginas que no quedaron; dice cuántos quedan.
    function prune(d){
      var kids = ctx.lookup(d.get(N.of('Kids')));
      if(!(kids instanceof PDFLib.PDFArray)) return 1; // campo y widget a la vez
      var left = 0;
      for(var i = kids.size() - 1; i >= 0; i--){
        var kref = kids.get(i), k = ctx.lookup(kref);
        var isWidget = k instanceof PDFLib.PDFDict && String(k.get(N.of('Subtype'))) === '/Widget' && !k.get(N.of('Kids'));
        var n = isWidget ? (widgets[key(kref)] ? 1 : 0) : (k instanceof PDFLib.PDFDict ? prune(k) : 0);
        if(n) left += n; else kids.remove(i);
      }
      return left;
    }

    // al unir dos PDF con campos del mismo nombre, los repetidos llevan sufijo
    var names = {}, fields = [];
    roots.forEach(function(f){
      if(!prune(f.dict)) return;
      var t = f.dict.get(N.of('T')), name = t.decodeText ? t.decodeText() : String(t);
      if(names[name]){
        var n = 2;
        while(names[name + '-' + n]) n++;
        name = name + '-' + n;
        f.dict.set(N.of('T'), PDFLib.PDFHexString.fromText(name));
      }
      names[name] = true;
      fields.push(f.ref);
    });
    if(!fields.length) return;

    var acro = out.catalog.lookup(N.of('AcroForm'));
    if(!(acro instanceof PDFLib.PDFDict)){ acro = ctx.obj({}); out.catalog.set(N.of('AcroForm'), ctx.register(acro)); }
    acro.set(N.of('Fields'), ctx.obj(fields));
    // fuentes y estilo por defecto del formulario original (para rellenarlo bien)
    sources.some(function(src){
      var sa = src.catalog.lookup(N.of('AcroForm'));
      if(!(sa instanceof PDFLib.PDFDict)) return false;
      var copier = PDFLib.PDFObjectCopier.for(src.context, ctx);
      ['DA', 'DR', 'NeedAppearances', 'Q'].forEach(function(k){
        var v = sa.get(N.of(k));
        if(v !== undefined && !acro.get(N.of(k))) acro.set(N.of(k), copier.copy(v));
      });
      return true;
    });
  }

  // ---------- escritura ----------
  async function merge(entries){
    var out = await PDFLib.PDFDocument.create();
    var sources = [];
    for(var i = 0; i < entries.length; i++){
      var src = await PDFLib.PDFDocument.load(entries[i].bytes);
      sources.push(src);
      var copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(function(p){ out.addPage(p); });
    }
    keepForms(out, sources);
    return { bytes: await out.save(), pages: out.getPageCount() };
  }

  // pages: [{ index, rotate }] — rotate es el giro extra en grados.
  async function build(srcBytes, pages){
    var src = await PDFLib.PDFDocument.load(srcBytes);
    var out = await PDFLib.PDFDocument.create();
    var copied = await out.copyPages(src, pages.map(function(p){ return p.index; }));
    copied.forEach(function(page, i){
      var extra = pages[i].rotate || 0;
      if(extra){
        var angle = ((page.getRotation().angle || 0) + extra) % 360;
        page.setRotation(PDFLib.degrees((angle + 360) % 360));
      }
      out.addPage(page);
    });
    keepForms(out, [src]);
    return { bytes: await out.save(), pages: out.getPageCount() };
  }

  F.engine = {
    open: open, merge: merge, build: build,
    lazyThumb: lazyThumb, rasterize: rasterize, release: release,
    ready: function(){ return pdfjsReady; }
  };
})(window.Fusor);
