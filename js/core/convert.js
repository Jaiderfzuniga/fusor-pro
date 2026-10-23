/* Conversión a PDF en el navegador: Word (.docx), imágenes y texto.
   El resultado se trata igual que cualquier PDF (miniaturas, firmas, exportar).
   Word se lee con fflate (descomprimir) y se compone con pdf-lib:
   párrafos, estilos básicos, listas, tablas, imágenes y saltos de página. */
(function(F){
  "use strict";

  var PDFLib = window.PDFLib;
  var MAX_BYTES = 200 * 1024 * 1024;
  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var EMU = 12700; // EMU por punto

  function ConvertError(message){ this.message = message; }

  function ext(name){ var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  // Qué tipo de entrada es; null si no se acepta.
  function kind(file){
    var e = ext(file.name), t = file.type || '';
    if(e === 'pdf' || t === 'application/pdf') return 'pdf';
    if(e === 'docx' || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if(e === 'doc' || e === 'odt' || e === 'rtf' || e === 'pages') return 'old-word';
    if(/^(png|jpe?g|webp|gif|bmp)$/.test(e) || /^image\/(png|jpeg|webp|gif|bmp)$/.test(t)) return 'image';
    if(/^(txt|md|csv|log)$/.test(e) || t === 'text/plain') return 'text';
    return null;
  }

  function accepts(file){ var k = kind(file); return k !== null && k !== 'old-word'; }

  // Devuelve un File PDF listo para F.engine.open.
  async function toPdf(file){
    var k = kind(file);
    if(k === 'pdf') return file;
    if(k === 'old-word') throw new ConvertError('Este formato de Word no se puede leer; guárdalo como .docx o PDF.');
    if(!k) throw new ConvertError('Formato no admitido.');
    if(file.size > MAX_BYTES) throw new ConvertError('Es demasiado grande (máximo 200 MB).');
    if(file.size === 0) throw new ConvertError('El archivo está vacío.');
    var bytes;
    if(k === 'docx') bytes = await fromDocx(new Uint8Array(await file.arrayBuffer()));
    else if(k === 'image') bytes = await fromImage(file);
    else bytes = await fromText(await file.text());
    var name = file.name.replace(/\.[^.]+$/, '') + '.pdf';
    return new File([bytes], name, { type: 'application/pdf' });
  }

  // ---------- imágenes ----------
  function isPng(b){ return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; }
  function isJpg(b){ return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; }

  // Cualquier imagen que el navegador sepa abrir pasa a PNG.
  async function anyToPng(blob){
    var bmp = await createImageBitmap(blob);
    var c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    if(bmp.close) bmp.close();
    return new Uint8Array(await (await new Promise(function(r){ c.toBlob(r, 'image/png'); })).arrayBuffer());
  }

  async function embedImage(doc, bytes){
    if(isPng(bytes)) return doc.embedPng(bytes);
    if(isJpg(bytes)) return doc.embedJpg(bytes);
    return doc.embedPng(await anyToPng(new Blob([bytes])));
  }

  // Una página A4 (vertical u horizontal según la imagen) con la imagen ajustada.
  async function fromImage(file){
    var doc = await PDFLib.PDFDocument.create();
    var img;
    try{ img = await embedImage(doc, new Uint8Array(await file.arrayBuffer())); }
    catch(e){ throw new ConvertError('No se pudo leer la imagen.'); }
    var land = img.width > img.height;
    var pw = land ? 841.89 : 595.28, ph = land ? 595.28 : 841.89, m = 24;
    var s = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height, 1.5);
    var w = img.width * s, h = img.height * s;
    var page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    return doc.save();
  }

  // ---------- composición de texto (compartida por .txt y .docx) ----------
  var FAMILIES = {
    sans:  ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
    serif: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
    mono:  ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique']
  };

  function Composer(doc, layout){
    this.doc = doc;
    this.fonts = {};
    this.charset = null;
    this.layout = layout; // { w, h, top, right, bottom, left }
    this.page = null;
    this.y = 0;
  }

  Composer.prototype.font = async function(family, bold, italic){
    var key = FAMILIES[family || 'sans'][(bold ? 1 : 0) + (italic ? 2 : 0)];
    if(!this.fonts[key]) this.fonts[key] = await this.doc.embedFont(PDFLib.StandardFonts[key]);
    if(!this.charset){
      var set = {};
      this.fonts[key].getCharacterSet().forEach(function(c){ set[c] = true; });
      this.charset = set;
    }
    return this.fonts[key];
  };

  // Las fuentes estándar solo cubren WinAnsi: lo demás se sustituye.
  Composer.prototype.clean = function(text){
    var cs = this.charset, out = '';
    for(var i = 0; i < text.length; i++){
      var ch = text[i], code = text.codePointAt(i);
      if(code > 0xffff) i++;
      if(ch === '\t' || ch === '\n') { out += ' '; continue; }
      out += cs[code] ? ch : (code < 32 ? '' : '?');
    }
    return out;
  };

  Composer.prototype.newPage = function(){
    var L = this.layout;
    this.page = this.doc.addPage([L.w, L.h]);
    this.y = L.top;
  };

  Composer.prototype.ensure = function(h){
    var L = this.layout;
    if(!this.page) this.newPage();
    else if(this.y + h > L.h - L.bottom && this.y > L.top + 0.5) this.newPage();
  };

  // items: [{ type:'text', text, font, size, color, underline, strike } | { type:'image', img, w, h } | { type:'tab' }]
  // Devuelve líneas: [{ parts, width, ascent, descent, spaces }]
  Composer.prototype.breakLines = function(items, width, firstIndent){
    var lines = [], line = null, self = this;
    function open(){ line = { parts: [], width: 0, ascent: 0, descent: 0, indent: lines.length ? 0 : firstIndent }; }
    function close(){
      // los espacios finales no ocupan
      while(line.parts.length && line.parts[line.parts.length - 1].space){ line.width -= line.parts.pop().w; }
      lines.push(line); open();
    }
    function avail(){ return width - line.indent; }
    function grow(p){
      line.parts.push(p); line.width += p.w;
      line.ascent = Math.max(line.ascent, p.ascent); line.descent = Math.max(line.descent, p.descent);
    }
    open();
    items.forEach(function(it){
      if(it.type === 'break'){ if(!line.parts.length){ line.ascent = it.size * 0.8; line.descent = it.size * 0.22; } close(); return; }
      if(it.type === 'tab'){
        var stop = 36, next = (Math.floor((line.width + 0.01) / stop) + 1) * stop;
        if(next > avail()){ close(); next = stop; }
        grow({ space: true, tab: true, w: next - line.width, ascent: it.size * 0.8, descent: it.size * 0.22 });
        return;
      }
      if(it.type === 'image'){
        var w = it.w, h = it.h;
        if(w > width){ h = h * width / w; w = width; }
        if(line.parts.length && line.width + w > avail()) close();
        grow({ img: it.img, w: w, h: h, ascent: h, descent: 0 });
        return;
      }
      var text = self.clean(it.text);
      var tokens = text.match(/\s+|[^\s]+/g) || [];
      tokens.forEach(function(tok){
        var space = /^\s/.test(tok);
        var w = it.font.widthOfTextAtSize(tok, it.size);
        var base = { font: it.font, size: it.size, color: it.color, underline: it.underline, strike: it.strike, ascent: it.size * 0.8, descent: it.size * 0.22 };
        if(space){
          if(!line.parts.length) return; // sin espacios al inicio de línea
          grow(Object.assign({ text: tok, w: w, space: true }, base));
          return;
        }
        if(line.width + w > avail() && line.parts.length) close();
        // palabra más larga que la línea: se corta por letras
        while(w > avail() && tok.length > 1){
          var n = tok.length;
          while(n > 1 && it.font.widthOfTextAtSize(tok.slice(0, n), it.size) > avail() - line.width) n--;
          grow(Object.assign({ text: tok.slice(0, n), w: it.font.widthOfTextAtSize(tok.slice(0, n), it.size) }, base));
          close();
          tok = tok.slice(n); w = it.font.widthOfTextAtSize(tok, it.size);
        }
        grow(Object.assign({ text: tok, w: w }, base));
      });
    });
    if(line.parts.length || !lines.length) close();
    return lines;
  };

  // Dibuja un párrafo en (x, ancho). opts: { align, lineFactor, before, after, indent, firstIndent, defaultSize, prefix }
  Composer.prototype.paragraph = function(items, x, width, opts){
    var self = this;
    var lines = this.breakLines(items, width - (opts.indent || 0), opts.firstIndent || 0);
    this.ensure(0);
    if(this.y > this.layout.top + 0.5) this.y += opts.before || 0;
    lines.forEach(function(line, li){
      if(!line.ascent){ line.ascent = opts.defaultSize * 0.8; line.descent = opts.defaultSize * 0.22; }
      var hasImg = line.parts.some(function(p){ return p.img; });
      var lh = (line.ascent + line.descent) * (hasImg ? 1 : opts.lineFactor);
      self.ensure(lh);
      var left = x + (opts.indent || 0) + line.indent;
      var free = width - (opts.indent || 0) - line.indent - line.width;
      var gap = 0, cx = left;
      if(opts.align === 'center') cx += free / 2;
      else if(opts.align === 'right') cx += free;
      else if(opts.align === 'both' && li < lines.length - 1){
        var spaces = line.parts.filter(function(p){ return p.space && !p.tab; }).length;
        if(spaces) gap = free / spaces;
      }
      var baseline = self.layout.h - (self.y + line.ascent + (lh - line.ascent - line.descent) / 2);
      if(li === 0 && opts.prefix){
        self.page.drawText(opts.prefix.text, { x: left - opts.prefix.w, y: baseline, size: opts.prefix.size, font: opts.prefix.font, color: opts.prefix.color });
      }
      line.parts.forEach(function(p){
        if(p.img){
          self.page.drawImage(p.img, { x: cx, y: baseline, width: p.w, height: p.h });
        }else if(!p.space){
          self.page.drawText(p.text, { x: cx, y: baseline, size: p.size, font: p.font, color: p.color });
        }
        var w = p.w + (p.space && !p.tab ? gap : 0);
        if((p.underline || p.strike) && !p.img){
          var ly = p.underline ? baseline - p.size * 0.12 : baseline + p.size * 0.28;
          self.page.drawLine({ start: { x: cx, y: ly }, end: { x: cx + w, y: ly }, thickness: Math.max(0.5, p.size / 18), color: p.color });
        }
        cx += w;
      });
      self.y += lh;
    });
    this.y += opts.after || 0;
  };

  // ---------- .txt ----------
  async function fromText(text){
    if(text.length > 5e6) throw new ConvertError('El texto es demasiado largo.');
    var doc = await PDFLib.PDFDocument.create();
    var L = { w: 595.28, h: 841.89, top: 64, right: 64, bottom: 64, left: 64 };
    var c = new Composer(doc, L);
    var font = await c.font('sans'), color = PDFLib.rgb(0.1, 0.1, 0.12);
    var paras = text.replace(/\r\n?/g, '\n').split('\n');
    paras.forEach(function(p){
      var items = [];
      p.split('\t').forEach(function(seg, i){
        if(i) items.push({ type: 'tab', size: 11 });
        if(seg) items.push({ type: 'text', text: seg, font: font, size: 11, color: color });
      });
      c.paragraph(items, L.left, L.w - L.left - L.right, { align: 'left', lineFactor: 1.25, after: 2, defaultSize: 11 });
    });
    if(!c.page) c.newPage();
    return doc.save();
  }

  // ---------- .docx ----------
  function kids(el, name){
    var out = [];
    if(!el) return out;
    for(var n = el.firstElementChild; n; n = n.nextElementSibling){ if(!name || n.localName === name) out.push(n); }
    return out;
  }
  function kid(el, name){
    if(!el) return null;
    for(var n = el.firstElementChild; n; n = n.nextElementSibling){ if(n.localName === name) return n; }
    return null;
  }
  function attr(el, name){
    if(!el) return null;
    var v = el.getAttributeNS(W_NS, name);
    return v === null || v === '' ? el.getAttribute('w:' + name) : v;
  }
  function onOff(el){
    if(!el) return undefined;
    var v = attr(el, 'val');
    return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
  }
  function num(v, d){ var n = parseFloat(v); return isNaN(n) ? d : n; }

  function parseXml(bytes){
    var text = new TextDecoder('utf-8').decode(bytes);
    var xml = new DOMParser().parseFromString(text, 'application/xml');
    if(xml.getElementsByTagName('parsererror').length) throw new ConvertError('El documento de Word está dañado.');
    return xml;
  }

  // Propiedades de texto (w:rPr) sobre una base.
  function readRPr(rPr, base){
    var out = Object.assign({}, base);
    if(!rPr) return out;
    var b = onOff(kid(rPr, 'b')); if(b !== undefined) out.bold = b;
    var i = onOff(kid(rPr, 'i')); if(i !== undefined) out.italic = i;
    var caps = onOff(kid(rPr, 'caps')); if(caps !== undefined) out.caps = caps;
    var st = onOff(kid(rPr, 'strike')); if(st !== undefined) out.strike = st;
    var u = kid(rPr, 'u'); if(u) out.underline = attr(u, 'val') !== 'none';
    var sz = kid(rPr, 'sz'); if(sz) out.size = num(attr(sz, 'val'), 22) / 2;
    var col = kid(rPr, 'color');
    if(col){ var v = attr(col, 'val'); out.color = /^[0-9a-f]{6}$/i.test(v || '') ? v : null; }
    var fonts = kid(rPr, 'rFonts');
    if(fonts){
      var f = attr(fonts, 'ascii') || attr(fonts, 'hAnsi');
      if(f) out.family = /courier|consol|mono|menlo/i.test(f) ? 'mono' : /times|georgia|cambria|garamond|book|serif|palatino/i.test(f) ? 'serif' : 'sans';
    }
    var va = kid(rPr, 'vertAlign'); if(va) out.small = attr(va, 'val') !== 'baseline';
    return out;
  }

  function readPPr(pPr, base){
    var out = Object.assign({}, base);
    if(!pPr) return out;
    var jc = kid(pPr, 'jc');
    if(jc){
      var v = attr(jc, 'val');
      out.align = v === 'center' ? 'center' : (v === 'right' || v === 'end') ? 'right' : (v === 'both' || v === 'distribute') ? 'both' : 'left';
    }
    var sp = kid(pPr, 'spacing');
    if(sp){
      if(attr(sp, 'before') !== null) out.before = num(attr(sp, 'before'), 0) / 20;
      if(attr(sp, 'after') !== null) out.after = num(attr(sp, 'after'), 0) / 20;
      var line = attr(sp, 'line'), rule = attr(sp, 'lineRule');
      if(line !== null && (!rule || rule === 'auto')) out.lineFactor = Math.max(0.8, num(line, 240) / 240) * 1.15;
    }
    var ind = kid(pPr, 'ind');
    if(ind){
      var l = attr(ind, 'left') || attr(ind, 'start');
      if(l !== null) out.indent = num(l, 0) / 20;
      if(attr(ind, 'firstLine') !== null) out.firstIndent = num(attr(ind, 'firstLine'), 0) / 20;
      if(attr(ind, 'hanging') !== null) out.firstIndent = -num(attr(ind, 'hanging'), 0) / 20;
    }
    var pbb = onOff(kid(pPr, 'pageBreakBefore')); if(pbb !== undefined) out.pageBreakBefore = pbb;
    return out;
  }

  function readStyles(xml){
    var styles = {}, defaults = { r: { size: 11, family: 'sans' }, p: { align: 'left', before: 0, after: 0, lineFactor: 1.15 } };
    if(!xml) return { styles: styles, defaults: defaults };
    var root = xml.documentElement;
    var dd = kid(root, 'docDefaults');
    if(dd){
      var rd = kid(kid(dd, 'rPrDefault'), 'rPr'); if(rd) defaults.r = readRPr(rd, defaults.r);
      var pd = kid(kid(dd, 'pPrDefault'), 'pPr'); if(pd) defaults.p = readPPr(pd, defaults.p);
    }
    kids(root, 'style').forEach(function(s){
      var id = attr(s, 'styleId'); if(!id) return;
      var based = kid(s, 'basedOn');
      styles[id] = { rPr: kid(s, 'rPr'), pPr: kid(s, 'pPr'), basedOn: based ? attr(based, 'val') : null, name: attr(kid(s, 'name'), 'val') || id };
    });
    return { styles: styles, defaults: defaults };
  }

  // Encadena basedOn (con tope para evitar ciclos).
  function resolveStyle(S, id){
    var chain = [], seen = {};
    while(id && S.styles[id] && !seen[id] && chain.length < 12){ seen[id] = true; chain.unshift(S.styles[id]); id = S.styles[id].basedOn; }
    var r = S.defaults.r, p = S.defaults.p;
    chain.forEach(function(s){ r = readRPr(s.rPr, r); p = readPPr(s.pPr, p); });
    return { r: r, p: p, name: chain.length ? chain[chain.length - 1].name : '' };
  }

  // Estilo de carácter: solo sus propias propiedades sobre las del párrafo.
  function charStyle(S, id, base){
    var chain = [], seen = {};
    while(id && S.styles[id] && !seen[id] && chain.length < 12){ seen[id] = true; chain.unshift(S.styles[id]); id = S.styles[id].basedOn; }
    chain.forEach(function(s){ base = readRPr(s.rPr, base); });
    return base;
  }

  function readNumbering(xml){
    var abs = {}, nums = {};
    if(!xml) return { fmt: function(){ return 'bullet'; } };
    kids(xml.documentElement, 'abstractNum').forEach(function(a){
      var lv = {};
      kids(a, 'lvl').forEach(function(l){ lv[attr(l, 'ilvl')] = attr(kid(l, 'numFmt'), 'val') || 'bullet'; });
      abs[attr(a, 'abstractNumId')] = lv;
    });
    kids(xml.documentElement, 'num').forEach(function(n){ nums[attr(n, 'numId')] = abs[attr(kid(n, 'abstractNumId'), 'val')] || {}; });
    return { fmt: function(numId, ilvl){ return (nums[numId] || {})[ilvl] || 'bullet'; } };
  }

  function roman(n){
    var map = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']], s = '';
    map.forEach(function(m){ while(n >= m[0]){ s += m[1]; n -= m[0]; } });
    return s;
  }
  function listLabel(fmt, n){
    if(fmt === 'decimal' || fmt === 'decimalZero') return n + '.';
    if(fmt === 'lowerLetter') return String.fromCharCode(96 + ((n - 1) % 26) + 1) + ')';
    if(fmt === 'upperLetter') return String.fromCharCode(64 + ((n - 1) % 26) + 1) + '.';
    if(fmt === 'lowerRoman') return roman(n) + '.';
    if(fmt === 'upperRoman') return roman(n).toUpperCase() + '.';
    if(fmt === 'none') return '';
    return '•';
  }

  function hexColor(h){
    if(!h) return PDFLib.rgb(0.1, 0.1, 0.12);
    return PDFLib.rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }

  async function fromDocx(bytes){
    var total = 0, files;
    try{
      files = window.fflate.unzipSync(bytes, {
        filter: function(f){
          total += f.originalSize;
          if(total > MAX_BYTES * 2) throw new ConvertError('El documento de Word es demasiado grande.');
          return /^(word\/(document|styles|numbering)\.xml|word\/_rels\/document\.xml\.rels|word\/media\/.+)$/.test(f.name);
        }
      });
    }catch(e){
      if(e instanceof ConvertError) throw e;
      throw new ConvertError('No es un documento de Word válido.');
    }
    if(!files['word/document.xml']) throw new ConvertError('No es un documento de Word válido.');

    var docXml = parseXml(files['word/document.xml']);
    var S = readStyles(files['word/styles.xml'] ? parseXml(files['word/styles.xml']) : null);
    var N = readNumbering(files['word/numbering.xml'] ? parseXml(files['word/numbering.xml']) : null);
    var rels = {};
    if(files['word/_rels/document.xml.rels']){
      Array.from(parseXml(files['word/_rels/document.xml.rels']).getElementsByTagName('Relationship')).forEach(function(r){
        rels[r.getAttribute('Id')] = r.getAttribute('Target');
      });
    }

    var body = kid(docXml.documentElement, 'body');
    if(!body) throw new ConvertError('El documento de Word está vacío.');

    // tamaño de página y márgenes de la última sección
    var L = { w: 612, h: 792, top: 72, right: 72, bottom: 72, left: 72 };
    var sect = kid(body, 'sectPr');
    if(sect){
      var sz = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
      if(sz){ L.w = num(attr(sz, 'w'), 12240) / 20; L.h = num(attr(sz, 'h'), 15840) / 20; }
      if(mar){
        L.top = Math.abs(num(attr(mar, 'top'), 1440)) / 20; L.bottom = Math.abs(num(attr(mar, 'bottom'), 1440)) / 20;
        L.left = num(attr(mar, 'left'), 1440) / 20; L.right = num(attr(mar, 'right'), 1440) / 20;
      }
    }
    if(!(L.w > 72 && L.h > 72 && L.w < 14400 && L.h < 14400)){ L.w = 612; L.h = 792; }
    if(L.left + L.right > L.w - 72){ L.left = L.right = 36; }
    if(L.top + L.bottom > L.h - 72){ L.top = L.bottom = 36; }

    var out = await PDFLib.PDFDocument.create();
    var C = new Composer(out, L);
    await C.font('sans');
    var imgCache = {};
    var counters = {};

    async function image(blipId){
      if(imgCache[blipId] !== undefined) return imgCache[blipId];
      var target = rels[blipId], img = null;
      if(target){
        var path = target.replace(/^\/?(word\/)?/, 'word/').replace(/\/\.\//g, '/');
        var data = files[path];
        // png y jpg directos; gif, bmp o webp si el navegador sabe abrirlos (emf/wmf no)
        if(data){
          try{ img = await embedImage(out, data); }catch(e){ img = null; }
        }
      }
      imgCache[blipId] = img;
      return img;
    }

    // Recoge los trozos de un párrafo (runs, enlaces, campos, inserciones).
    async function collect(el, pStyle, items, state){
      for(var n = el.firstElementChild; n; n = n.nextElementSibling){
        var name = n.localName;
        if(name === 'r'){
          var rStyle = kid(kid(n, 'rPr'), 'rStyle');
          var base = rStyle ? charStyle(S, attr(rStyle, 'val'), pStyle.r) : pStyle.r;
          var rp = readRPr(kid(n, 'rPr'), base);
          var size = rp.small ? rp.size * 0.65 : rp.size;
          var font = await C.font(rp.family, rp.bold, rp.italic);
          var color = hexColor(rp.color);
          for(var c = n.firstElementChild; c; c = c.nextElementSibling){
            var cn = c.localName;
            if(cn === 't'){
              var t = c.textContent; if(rp.caps) t = t.toUpperCase();
              if(t) items.push({ type: 'text', text: t, font: font, size: size, color: color, underline: rp.underline, strike: rp.strike });
            }else if(cn === 'tab'){ items.push({ type: 'tab', size: size }); }
            else if(cn === 'br' || cn === 'cr'){
              if(attr(c, 'type') === 'page'){ state.pageBreaks.push(items.length); }
              else items.push({ type: 'break', size: size });
            }
            else if(cn === 'noBreakHyphen'){ items.push({ type: 'text', text: '-', font: font, size: size, color: color }); }
            else if(cn === 'drawing' || cn === 'pict'){
              var blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
              var id = blip ? (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed')) : null;
              var extent = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
              if(id){
                var img = await image(id);
                if(img){
                  var w = extent ? num(extent.getAttribute('cx'), 0) / EMU : img.width * 0.75;
                  var h = extent ? num(extent.getAttribute('cy'), 0) / EMU : img.height * 0.75;
                  if(w > 0 && h > 0) items.push({ type: 'image', img: img, w: w, h: h });
                }
              }
            }
          }
        }else if(name === 'hyperlink' || name === 'ins' || name === 'smartTag' || name === 'fldSimple' || name === 'customXml' || name === 'bdo' || name === 'dir'){
          await collect(n, pStyle, items, state);
        }else if(name === 'sdt'){
          var content = kid(n, 'sdtContent'); if(content) await collect(content, pStyle, items, state);
        }
      }
    }

    async function paragraph(p, x, width){
      var pPr = kid(p, 'pPr');
      var ps = kid(pPr, 'pStyle');
      var st = resolveStyle(S, ps ? attr(ps, 'val') : (S.styles.Normal ? 'Normal' : null));
      var pp = readPPr(pPr, st.p);
      // si no hay styles.xml, los títulos al menos se distinguen
      if(!S.styles[ps && attr(ps, 'val')] && ps){
        var hm = /(heading|t[ií]tulo)\s*(\d)/i.exec(attr(ps, 'val'));
        if(hm) st.r = Object.assign({}, st.r, { bold: true, size: [0, 20, 16, 14, 12, 11, 11][+hm[2]] || 12 });
        if(/^title$/i.test(attr(ps, 'val'))) st.r = Object.assign({}, st.r, { size: 26 });
      }
      var pr = readRPr(kid(pPr, 'rPr'), st.r);
      var style = { r: st.r, p: pp };
      if(pp.pageBreakBefore && C.page) C.newPage();

      var items = [], state = { pageBreaks: [] };
      await collect(p, style, items, state);

      var prefix = null;
      var numPr = kid(pPr, 'numPr');
      if(numPr){
        var numId = attr(kid(numPr, 'numId'), 'val'), ilvl = attr(kid(numPr, 'ilvl'), 'val') || '0';
        if(numId && numId !== '0'){
          var key = numId + ':' + ilvl;
          counters[key] = (counters[key] || 0) + 1;
          // los niveles más profundos reinician al volver a uno superior
          Object.keys(counters).forEach(function(k){ var s = k.split(':'); if(s[0] === numId && +s[1] > +ilvl) delete counters[k]; });
          var label = listLabel(N.fmt(numId, ilvl), counters[key]);
          if(label){
            var lf = await C.font(pr.family, false, false);
            var text = C.clean(label);
            if(pp.indent === undefined || pp.indent === 0) pp.indent = 18 * (+ilvl + 1);
            if(pp.firstIndent === undefined || pp.firstIndent >= 0) pp.firstIndent = 0;
            prefix = { text: text, font: lf, size: pr.size, color: hexColor(pr.color), w: lf.widthOfTextAtSize(text, pr.size) + 6 };
          }
        }
      }

      var opts = {
        align: pp.align, lineFactor: pp.lineFactor || 1.15, before: pp.before || 0, after: pp.after || 0,
        indent: Math.max(0, pp.indent || 0), firstIndent: pp.firstIndent || 0, defaultSize: pr.size, prefix: prefix
      };
      // saltos de página dentro del párrafo: se compone por tramos
      var cuts = state.pageBreaks.concat([items.length]), from = 0;
      cuts.forEach(function(cut, i){
        var part = items.slice(from, cut);
        if(part.length || i === 0) C.paragraph(part, x, width, i === 0 ? opts : Object.assign({}, opts, { prefix: null, before: 0 }));
        if(i < cuts.length - 1) C.newPage();
        from = cut;
      });
    }

    // Tablas: rejilla de columnas, bordes finos y contenido de cada celda.
    async function table(tbl, x, width){
      var grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map(function(g){ return num(attr(g, 'w'), 0) / 20; });
      var rows = kids(tbl, 'tr');
      if(!grid.length){
        var maxCells = Math.max.apply(null, rows.map(function(r){ return kids(r, 'tc').length; }).concat([1]));
        for(var g = 0; g < maxCells; g++) grid.push(width / maxCells);
      }
      var sum = grid.reduce(function(a, b){ return a + b; }, 0) || 1;
      var scale = Math.min(1, width / sum);
      var cols = grid.map(function(gw){ return gw * scale; });
      var pad = 4;
      var line = PDFLib.rgb(0.55, 0.57, 0.62);
      for(var ri = 0; ri < rows.length; ri++){
        var cells = kids(rows[ri], 'tc');
        // medir la fila componiendo cada celda en un documento aparte
        var col = 0, laid = [];
        for(var ci = 0; ci < cells.length; ci++){
          var span = num(attr(kid(kid(cells[ci], 'tcPr'), 'gridSpan'), 'val'), 1);
          var cw = 0;
          for(var s = 0; s < span && col + s < cols.length; s++) cw += cols[col + s];
          var cx = x + cols.slice(0, col).reduce(function(a, b){ return a + b; }, 0);
          laid.push({ cell: cells[ci], x: cx, w: Math.max(cw, 12) });
          col += span;
        }
        var height = 0;
        for(var li = 0; li < laid.length; li++){ laid[li].h = await measureCell(laid[li].cell, laid[li].w - pad * 2); height = Math.max(height, laid[li].h); }
        height += pad * 2;
        C.ensure(height);
        var top = C.y;
        for(var lj = 0; lj < laid.length; lj++){
          var cell = laid[lj];
          C.y = top + pad;
          for(var b = cell.cell.firstElementChild; b; b = b.nextElementSibling){
            if(b.localName === 'p') await paragraph(b, cell.x + pad, cell.w - pad * 2);
            else if(b.localName === 'tbl') await table(b, cell.x + pad, cell.w - pad * 2);
          }
          C.page.drawRectangle({ x: cell.x, y: L.h - (top + height), width: cell.w, height: height, borderColor: line, borderWidth: 0.5 });
        }
        C.y = top + height;
      }
      C.y += 6;
    }

    // Composición de prueba para saber cuánto ocupa una celda.
    async function measureCell(cell, width){
      var saved = { page: C.page, y: C.y };
      var ghostDoc = await PDFLib.PDFDocument.create();
      var realDoc = C.doc, realFonts = C.fonts, realLayout = C.layout;
      // se compone en un documento desechable con una página muy alta
      C.doc = ghostDoc; C.layout = { w: width + 2, h: 1e6, top: 0, right: 0, bottom: 0, left: 0 }; C.page = null; C.fonts = {};
      var savedCache = imgCache; imgCache = {};
      try{
        C.newPage();
        for(var b = cell.firstElementChild; b; b = b.nextElementSibling){
          if(b.localName === 'p') await paragraph(b, 0, width);
          else if(b.localName === 'tbl') await table(b, 0, width);
        }
        return C.y;
      }finally{
        C.doc = realDoc; C.fonts = realFonts; C.layout = realLayout; C.page = saved.page; C.y = saved.y; imgCache = savedCache;
      }
    }

    var contentW = L.w - L.left - L.right;
    for(var b = body.firstElementChild; b; b = b.nextElementSibling){
      if(b.localName === 'p') await paragraph(b, L.left, contentW);
      else if(b.localName === 'tbl') await table(b, L.left, contentW);
      else if(b.localName === 'sdt'){
        var sc = kid(b, 'sdtContent');
        for(var q = sc && sc.firstElementChild; q; q = q.nextElementSibling){
          if(q.localName === 'p') await paragraph(q, L.left, contentW);
          else if(q.localName === 'tbl') await table(q, L.left, contentW);
        }
      }
    }
    if(!C.page) C.newPage();
    return out.save();
  }

  F.convert = { kind: kind, accepts: accepts, toPdf: toPdf, anyToPng: anyToPng };
})(window.Fusor);
