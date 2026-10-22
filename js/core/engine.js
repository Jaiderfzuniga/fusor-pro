/* Motor de PDF: lectura, miniaturas y escritura.
   pdf-lib crea y modifica los documentos; pdf.js (opcional) dibuja las miniaturas. */
(function(F){
  "use strict";

  var PDFLib = window.PDFLib;
  var pdfjs = window.pdfjsLib || null;
  if(pdfjs){
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function ReadError(code, message){
    this.code = code; this.message = message;
  }

  // Lee un archivo y devuelve sus bytes, número de páginas, giros y proporciones.
  async function open(file){
    var bytes = new Uint8Array(await file.arrayBuffer());
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
  var thumbsOn = !!pdfjs;
  var renderQueue = Promise.resolve();

  function pdfjsDoc(entry){
    if(!thumbsOn) return Promise.resolve(null);
    if(!entry._pdfjs){
      // pdf.js se queda con el buffer; le damos una copia.
      entry._pdfjs = pdfjs.getDocument({ data: entry.bytes.slice(0), isEvalSupported: false }).promise
        .catch(function(){ return null; });
    }
    return entry._pdfjs;
  }

  // Dibuja una página en un canvas de ancho cssWidth. Devuelve null si no hay pdf.js.
  function renderThumb(entry, index, cssWidth){
    var job = renderQueue.then(async function(){
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
    }).catch(function(){ return null; });
    renderQueue = job;
    return job;
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
    if(!thumbsOn) return;
    holder._paint = function(){
      renderThumb(entry, index, cssWidth).then(function(canvas){
        if(!canvas || !holder.isConnected) return;
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

  // ---------- escritura ----------
  async function merge(entries){
    var out = await PDFLib.PDFDocument.create();
    for(var i = 0; i < entries.length; i++){
      var src = await PDFLib.PDFDocument.load(entries[i].bytes);
      var copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(function(p){ out.addPage(p); });
    }
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
    return { bytes: await out.save(), pages: out.getPageCount() };
  }

  F.engine = {
    open: open, merge: merge, build: build,
    lazyThumb: lazyThumb, release: release,
    get thumbsAvailable(){ return thumbsOn; }
  };
})(window.Fusor);
