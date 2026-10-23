/* Exportar un PDF a otros formatos: imágenes PNG o JPG (varias páginas van en
   un .zip) y Word (.docx con cada página como imagen, para que se vea igual). */
(function(F){
  "use strict";
  var E = F.engine;
  var SCALE = 2; // 144 ppp: nítido al imprimir sin archivos enormes

  var FORMATS = {
    pdf:  { ext: 'pdf',  label: 'PDF' },
    docx: { ext: 'docx', label: 'Word' },
    png:  { ext: 'png',  label: 'PNG' },
    jpg:  { ext: 'jpg',  label: 'JPG' }
  };

  function canvasBytes(canvas, type, quality){
    return new Promise(function(resolve, reject){
      canvas.toBlob(function(b){
        if(!b) return reject(new Error('No se pudo crear la imagen'));
        b.arrayBuffer().then(function(buf){ resolve(new Uint8Array(buf)); }, reject);
      }, type, quality);
    });
  }

  // Dibuja cada página del PDF. onPage(i, total) informa el avance.
  async function pages(pdfBytes, type, onPage){
    var entry = { bytes: pdfBytes };
    try{
      var count = (await PDFLib.PDFDocument.load(pdfBytes)).getPageCount();
      var out = [];
      for(var i = 0; i < count; i++){
        if(onPage) onPage(i, count);
        var canvas = await E.rasterize(entry, i, SCALE);
        if(!canvas) throw new Error('Para exportar a imagen o Word abre FUSOR desde un servidor o la versión publicada (no con doble clic)');
        out.push({ width: canvas.width, height: canvas.height, bytes: await canvasBytes(canvas, type, 0.92) });
        canvas.width = canvas.height = 0; // libera memoria en celulares
      }
      return out;
    }finally{
      E.release(entry);
    }
  }

  function pad(n, len){ n = String(n); while(n.length < len) n = '0' + n; return n; }

  // Imágenes: una sola página → archivo suelto; varias → .zip.
  async function images(pdfBytes, fmt, base, onPage){
    var type = fmt === 'png' ? 'image/png' : 'image/jpeg';
    var list = await pages(pdfBytes, type, onPage);
    if(list.length === 1) return { blob: new Blob([list[0].bytes], { type: type }), name: base + '.' + fmt, count: 1 };
    var files = {}, len = String(list.length).length;
    list.forEach(function(p, i){ files[base + '-pagina-' + pad(i + 1, len) + '.' + fmt] = [p.bytes, { level: 0 }]; });
    var zip = window.fflate.zipSync(files);
    return { blob: new Blob([zip], { type: 'application/zip' }), name: base + '.zip', count: list.length };
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

  // Word: una sección por página con su tamaño y márgenes cero.
  async function docx(pdfBytes, base, onPage){
    var list = await pages(pdfBytes, 'image/jpeg', onPage);
    var enc = new TextEncoder();
    var EMU_PX = 12700 / SCALE; // px de la imagen → EMU (12700 por punto) a tamaño real
    var body = '', rels = '';
    list.forEach(function(p, i){
      var id = 'rIdImg' + (i + 1);
      var cx = Math.round(p.width * EMU_PX), cy = Math.round(p.height * EMU_PX);
      // un pelo más pequeña que la hoja para que Word no la pase a otra página
      var dx = Math.round(cx * 0.995), dy = Math.round(cy * 0.985);
      var twW = Math.round(cx / 635), twH = Math.round(cy / 635);
      var sect = '<w:sectPr><w:pgSz w:w="' + twW + '" w:h="' + twH + '"' + (twW > twH ? ' w:orient="landscape"' : '') + '/>' +
        '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
      var last = i === list.length - 1;
      body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/>' + (last ? '' : sect) + '</w:pPr>' +
        '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + dx + '" cy="' + dy + '"/><wp:docPr id="' + (i + 1) + '" name="' + esc('Página ' + (i + 1)) + '"/>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + (i + 1) + '" name="pagina' + (i + 1) + '.jpg"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + dx + '" cy="' + dy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
      if(last) body += sect;
      rels += '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pagina' + (i + 1) + '.jpg"/>';
    });

    var files = {
      '[Content_Types].xml': enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="jpg" ContentType="image/jpeg"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>'),
      '_rels/.rels': enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'),
      'word/_rels/document.xml.rels': enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>'),
      'word/document.xml': enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<w:body>' + body + '</w:body></w:document>')
    };
    list.forEach(function(p, i){ files['word/media/pagina' + (i + 1) + '.jpg'] = [p.bytes, { level: 0 }]; });
    var zip = window.fflate.zipSync(files, { level: 6 });
    return {
      blob: new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      name: base + '.docx', count: list.length
    };
  }

  F.exporter = { FORMATS: FORMATS, images: images, docx: docx };
})(window.Fusor);
