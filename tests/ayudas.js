// Ayudas compartidas por las pruebas: archivos de ejemplo generados al vuelo,
// descargas y vigilancia de errores en la consola.
const { expect } = require('@playwright/test');
const PDFLib = require('../js/vendor/pdf-lib.min.js');
const fflate = require('../js/vendor/fflate.min.js');

// Abre una herramienta y registra cualquier error de la página o de la consola.
async function abrir(page, hash){
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errores.push('console: ' + m.text()); });
  await page.goto('/#' + hash);
  await expect(page.locator('#tool-' + herramienta(hash))).toBeVisible();
  return errores;
}

function herramienta(hash){
  return { unir: 'merge', dividir: 'split', organizar: 'organize', firmar: 'sign', comprimir: 'compress', imagenes: 'images', ampliar: 'idcard', foto: 'photo' }[hash];
}

// Hace clic y espera la descarga; devuelve { nombre, bytes }.
async function descargar(page, selector){
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 45000 }), page.click(selector)]);
  const ruta = await d.path();
  return { nombre: d.suggestedFilename(), bytes: require('fs').readFileSync(ruta) };
}

// PDF de ejemplo: n páginas con texto, opcionalmente giradas o con una imagen pesada.
async function pdf({ paginas = 2, giro = 0, formulario = false, pesado = false } = {}){
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  let img = null;
  if(pesado){
    // como una foto escaneada: degradado con grano. En PNG pesa mucho; en JPG, poco.
    const w = 1200, h = 1700, raw = new Uint8Array(w * h * 3), ruido = require('crypto').randomBytes(w * h);
    for(let y = 0, i = 0; y < h; y++) for(let x = 0; x < w; x++, i++){
      const g = (ruido[i] % 17) - 8;
      raw[i * 3] = Math.max(0, Math.min(255, (x * 255 / w) + g));
      raw[i * 3 + 1] = Math.max(0, Math.min(255, (y * 255 / h) + g));
      raw[i * 3 + 2] = Math.max(0, Math.min(255, 160 + g));
    }
    img = await doc.embedPng(await pngDesdeRGB(raw, w, h));
  }
  for(let i = 0; i < paginas; i++){
    const p = doc.addPage([595, 842]);
    if(giro) p.setRotation(PDFLib.degrees(giro));
    if(img) p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    p.drawText('Pagina ' + (i + 1), { x: 50, y: 790, size: 24, font });
  }
  if(formulario){
    const form = doc.getForm(), p = doc.getPage(0);
    form.createTextField('nombre').addToPage(p, { x: 150, y: 700, width: 250, height: 22 });
    form.createCheckBox('acepta').addToPage(p, { x: 150, y: 660, width: 18, height: 18 });
    const dd = form.createDropdown('ciudad'); dd.addOptions(['Pasto', 'Cali']); dd.addToPage(p, { x: 150, y: 620, width: 150, height: 22 });
  }
  return Buffer.from(await doc.save());
}

// PNG sin filtros a partir de píxeles RGB (para no depender de otras librerías).
async function pngDesdeRGB(rgb, w, h){
  const zlib = require('zlib');
  const filas = Buffer.alloc((w * 3 + 1) * h);
  for(let y = 0; y < h; y++){ filas[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(filas, y * (w * 3 + 1) + 1); }
  const crc = (buf) => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let r = 0xffffffff; for(const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(tipo), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(filas)), chunk('IEND', Buffer.alloc(0))]);
}

// Imagen dibujada en el navegador (JPG o PNG). dibujo: 'documento' (tarjeta sobre una mesa),
// 'retrato' (cara sobre fondo claro) o 'liso'.
async function imagen(page, { ancho = 1200, alto = 900, dibujo = 'liso', tipo = 'image/jpeg' } = {}){
  const datos = await page.evaluate(async ({ ancho, alto, dibujo, tipo }) => {
    const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
    const x = c.getContext('2d');
    if(dibujo === 'documento'){
      x.fillStyle = '#6b4f3a'; x.fillRect(0, 0, ancho, alto);
      const w = ancho * 0.55, h = w / 1.585, l = (ancho - w) / 2, t = (alto - h) / 2;
      x.fillStyle = '#f3e6aa'; x.fillRect(l, t, w, h);
      x.fillStyle = '#9aa0b0'; x.fillRect(l + w * 0.05, t + h * 0.12, w * 0.28, h * 0.7);
      x.fillStyle = '#333a4d'; for(let i = 0; i < 5; i++) x.fillRect(l + w * 0.4, t + h * (0.18 + i * 0.13), w * 0.5, h * 0.05);
    }else if(dibujo === 'retrato'){
      x.fillStyle = '#eef1f6'; x.fillRect(0, 0, ancho, alto);
      x.fillStyle = '#c99b7a'; x.beginPath(); x.ellipse(ancho / 2, alto * 0.4, ancho * 0.16, alto * 0.16, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#2d3a5a'; x.fillRect(ancho * 0.25, alto * 0.62, ancho * 0.5, alto * 0.38);
    }else{
      x.fillStyle = '#d7e3f4'; x.fillRect(0, 0, ancho, alto);
    }
    const b = await new Promise(r => c.toBlob(r, tipo, 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }, { ancho, alto, dibujo, tipo });
  return Buffer.from(datos);
}

// Word (.docx) mínimo con un título, una lista y una tabla.
function docx(){
  const enc = s => new TextEncoder().encode(s);
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Contrato de prueba</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Texto con tildes: áéíóú ñ y </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>cursiva</w:t></w:r></w:p>
    <w:tbl><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
      <w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Segunda página</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body></w:document>`;
  return Buffer.from(fflate.zipSync({
    '[Content_Types].xml': enc('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': enc('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': enc(doc)
  }));
}

// Lee un PDF descargado y devuelve el documento de pdf-lib (falla si está dañado).
async function leerPdf(bytes){
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  return PDFLib.PDFDocument.load(bytes);
}

function archivo(nombre, mimeType, buffer){ return { name: nombre, mimeType, buffer }; }

const esJpg = b => b[0] === 0xff && b[1] === 0xd8;
const esZip = b => b[0] === 0x50 && b[1] === 0x4b;

module.exports = { abrir, descargar, pdf, imagen, docx, leerPdf, archivo, esJpg, esZip, PDFLib, fflate };
