// Firmar: crear una firma, colocarla, formularios, sellos, deshacer y formatos.
const { test, expect } = require('@playwright/test');
const { abrir, descargar, pdf, docx, leerPdf, archivo, esZip, imagen, PDFLib, fflate } = require('./ayudas');

async function crearFirmaEscrita(page, nombre){
  await page.click('[data-sign-create]');
  await page.click('#studioTabType');
  await page.fill('#studioText', nombre);
  await page.click('[data-studio-use]');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

// Espera a que termine cualquier desplazamiento suave de la página.
async function quieta(page){
  await page.waitForFunction(() => new Promise(r => { const y = window.scrollY; setTimeout(() => r(window.scrollY === y), 200); }));
}

async function subir(page, nombre, mime, bytes){
  await page.setInputFiles('#tool-sign [data-drop] input[type=file]', archivo(nombre, mime, bytes));
  await expect(page.locator('.sign-page').first()).toBeVisible();
}

test('dibujar una firma, arrastrarla a la página y descargar el PDF firmado', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // desplazamientos instantáneos: medidas estables
  const errores = await abrir(page, 'firmar');
  await subir(page, 'contrato.pdf', 'application/pdf', await pdf({ paginas: 2 }));

  // dibujar en el estudio
  await page.click('[data-sign-create]');
  const pad = await page.locator('[data-studio-pad]').boundingBox();
  await page.mouse.move(pad.x + 40, pad.y + 120); await page.mouse.down();
  for(const [x, y] of [[120, 50], [180, 160], [260, 60], [340, 140]]) await page.mouse.move(pad.x + x, pad.y + y, { steps: 6 });
  await page.mouse.up();
  await page.click('[data-studio-use]');
  await expect(page.locator('.placed')).toHaveCount(1); // se coloca sola en la página elegida
  await expect(page.locator('.sig')).toHaveCount(1);    // y queda en la biblioteca

  // arrastrar la firma de la biblioteca a la página. Se vuelve arriba (sin animación)
  // para medir con la página quieta: el punto de destino tiene que caer en la hoja.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await quieta(page);
  const hoja = await page.locator('.sign-page__sheet').first().boundingBox();
  const vista = page.viewportSize();
  const destino = { x: hoja.x + hoja.width * 0.3, y: (Math.max(hoja.y, 0) + Math.min(hoja.y + hoja.height, vista.height)) / 2 };
  const firma = await page.locator('.sig__pick').first().boundingBox();
  const medidas = JSON.stringify({ hoja, firma, destino, vista });
  expect(destino.y, 'el destino cae en la hoja visible ' + medidas).toBeGreaterThan(Math.max(hoja.y, 0) + 20);
  expect(destino.y, 'el destino cae en la hoja visible ' + medidas).toBeLessThan(Math.min(hoja.y + hoja.height, vista.height) - 20);
  const enHoja = await page.evaluate(([x, y]) => !!document.elementsFromPoint(x, y).find(e => e.classList.contains('sign-page__sheet')), [destino.x, destino.y]);
  expect(enHoja, 'bajo el destino está la hoja ' + medidas).toBe(true);
  await page.mouse.move(firma.x + 20, firma.y + 20); await page.mouse.down();
  await page.mouse.move(firma.x - 80, firma.y + 30, { steps: 4 });
  await page.mouse.move(destino.x, destino.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.placed'), 'se soltó la firma en la hoja ' + medidas).toHaveCount(2);

  const { bytes } = await descargar(page, '[data-sign-go]');
  const doc = await leerPdf(bytes);
  expect(doc.getPageCount()).toBe(2);
  // la página 1 ahora tiene imágenes (las firmas)
  const xobj = doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
  expect(xobj.keys().length).toBeGreaterThanOrEqual(1);
  expect(errores).toEqual([]);
});

test('Word se convierte a PDF y se descarga firmado en Word, PNG y JPG', async ({ page }) => {
  const errores = await abrir(page, 'firmar');
  await subir(page, 'contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx());
  await expect(page.locator('.sign-page')).toHaveCount(2);
  await crearFirmaEscrita(page, 'Ana Pérez');
  await page.fill('#signText', 'C.C. 123');
  await page.click('[data-sign-add-text]');
  await page.click('[data-sign-add-date]');
  await expect(page.locator('.placed')).toHaveCount(3);

  await page.check('input[name=signFormat][value=docx]');
  let r = await descargar(page, '[data-sign-go]');
  expect(r.nombre).toMatch(/\.docx$/); expect(esZip(r.bytes)).toBe(true);
  await page.check('input[name=signFormat][value=png]');
  r = await descargar(page, '[data-sign-go]');
  expect(r.nombre).toMatch(/\.zip$/); expect(esZip(r.bytes)).toBe(true); // 2 páginas → .zip
  // cada imagen guarda 144 ppp: impresa, mide lo mismo que la página original
  const pngs = fflate.unzipSync(new Uint8Array(r.bytes));
  expect(Object.keys(pngs)).toHaveLength(2);
  for(const b of Object.values(pngs)){
    const buf = Buffer.from(b), i = buf.indexOf('pHYs');
    expect(Math.round(buf.readUInt32BE(i + 4) * 0.0254)).toBe(144);
  }
  await page.check('input[name=signFormat][value=jpg]');
  r = await descargar(page, '[data-sign-go]');
  expect(r.nombre).toMatch(/\.zip$/);
  expect(errores).toEqual([]);
});

test('formulario PDF, sellos, iniciales y deshacer', async ({ page }) => {
  const errores = await abrir(page, 'firmar');
  await subir(page, 'formulario.pdf', 'application/pdf', await pdf({ paginas: 1, formulario: true }));
  await expect(page.locator('[data-sign-form]')).toBeVisible();
  await expect(page.locator('[data-sign-form-count]')).toHaveText('3 campos');
  await page.fill('#signField0', 'Jaider Zúñiga');
  await page.check('#signField1');
  await page.selectOption('#signField2', 'Pasto');

  await page.click('[data-sign-stamp="check"]');
  await page.click('[data-sign-stamp="cross"]');
  await page.fill('#signInitials', 'J.Z.');
  await page.click('[data-sign-add-initials]');
  await expect(page.locator('.placed')).toHaveCount(3);

  await page.locator('#tool-sign .work__title').click(); // foco fuera de los campos
  await page.keyboard.press('Control+z');
  await expect(page.locator('.placed')).toHaveCount(2);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.placed')).toHaveCount(3);
  await page.click('[data-sign-undo]');
  await expect(page.locator('.placed')).toHaveCount(2);

  const { bytes } = await descargar(page, '[data-sign-go]');
  const doc = await leerPdf(bytes);
  expect(doc.getForm().getFields().length).toBe(0); // aplanado: el texto quedó impreso
  expect(errores).toEqual([]);
});

test('las firmas quedan en su sitio en páginas giradas', async ({ page }) => {
  await abrir(page, 'firmar');
  await subir(page, 'girado.pdf', 'application/pdf', await pdf({ paginas: 1, giro: 90 }));
  await crearFirmaEscrita(page, 'Firma');
  const { bytes } = await descargar(page, '[data-sign-go]');
  const doc = await leerPdf(bytes);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
});

// Lee un píxel de la imagen colocada: [r, g, b, a].
function pixel(page, id, fx, fy){
  return page.locator('.placed').nth(id).locator('img').evaluate(async (img, [fx, fy]) => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data);
  }, [fx, fy]);
}

test('subir una firma o sello ya hecho: imagen, PNG transparente y PDF', async ({ page }) => {
  const errores = await abrir(page, 'firmar');
  await subir(page, 'contrato.pdf', 'application/pdf', await pdf({ paginas: 1 }));
  const input = page.locator('[data-sign-upload-input]');

  // foto de una firma en papel: el papel se vuelve transparente y el trazo sigue azul
  await page.click('[data-sign-upload]');
  await input.setInputFiles(archivo('firma.jpg', 'image/jpeg', await imagen(page, { ancho: 900, alto: 300, dibujo: 'firma' })));
  await expect(page.locator('.placed')).toHaveCount(1);
  await expect(page.locator('.sig')).toHaveCount(1);
  expect((await pixel(page, 0, 0.01, 0.01))[3]).toBe(0);           // esquina: sin papel
  const tinta = await page.locator('.placed img').first().evaluate(async img => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for(let i = 0; i < d.length; i += 4) if(d[i + 3] === 255) return [d[i], d[i + 1], d[i + 2]];
    return null;
  });
  expect(tinta[2]).toBeGreaterThan(tinta[0] + 60);                   // azul, no negro

  // PNG que ya trae fondo transparente
  await input.setInputFiles(archivo('firma.png', 'image/png', await imagen(page, { ancho: 900, alto: 300, dibujo: 'firma-transparente', tipo: 'image/png' })));
  await expect(page.locator('.placed')).toHaveCount(2);

  // PDF con la firma
  const doc = await PDFLib.PDFDocument.create();
  const p = doc.addPage([300, 120]);
  p.drawLine({ start: { x: 20, y: 30 }, end: { x: 150, y: 90 }, thickness: 4, color: PDFLib.rgb(0.1, 0.1, 0.3) });
  p.drawLine({ start: { x: 150, y: 90 }, end: { x: 280, y: 40 }, thickness: 4, color: PDFLib.rgb(0.1, 0.1, 0.3) });
  await input.setInputFiles(archivo('firma.pdf', 'application/pdf', Buffer.from(await doc.save())));
  await expect(page.locator('.placed')).toHaveCount(3);
  await expect(page.locator('.sig')).toHaveCount(3);

  // un archivo que no es firma se rechaza con aviso
  await input.setInputFiles(archivo('notas.txt', 'text/plain', Buffer.from('hola')));
  await expect(page.locator('.toast--error')).toBeVisible();
  await expect(page.locator('.placed')).toHaveCount(3);

  const { bytes } = await descargar(page, '[data-sign-go]');
  const xobj = (await leerPdf(bytes)).getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
  expect(xobj.keys().length).toBe(3);
  expect(errores).toEqual([]);
});

test('soltar una imagen de firma sobre la página la deja donde se suelta', async ({ page }) => {
  const errores = await abrir(page, 'firmar');
  await subir(page, 'contrato.pdf', 'application/pdf', await pdf({ paginas: 1 }));
  const datos = Array.from(await imagen(page, { ancho: 900, alto: 300, dibujo: 'firma', tipo: 'image/png' }));
  await page.locator('.sign-page__sheet').first().evaluate((hoja, datos) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(datos)], 'firma.png', { type: 'image/png' }));
    const r = hoja.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * 0.25, clientY: r.top + r.height * 0.4 };
    hoja.dispatchEvent(new DragEvent('dragover', opts));
    hoja.dispatchEvent(new DragEvent('drop', opts));
  }, datos);
  await expect(page.locator('.placed')).toHaveCount(1);
  // centrada donde se soltó (25 % del ancho, 40 % del alto)
  const centro = await page.locator('.placed').evaluate(e => [
    +e.style.getPropertyValue('--x') + +e.style.getPropertyValue('--w') / 2,
    e.offsetTop + e.offsetHeight / 2,
    e.parentNode.offsetHeight
  ]);
  expect(centro[0]).toBeCloseTo(0.25, 1);
  expect(centro[1] / centro[2]).toBeCloseTo(0.4, 1);
  expect(errores).toEqual([]);
});

test('la firma queda encima de un campo de formulario con fondo blanco', async ({ page }) => {
  // PDF con un campo de imagen (fondo blanco) que quedó «suelto», como después de
  // Organizar: se ve, pero el PDF ya no lo lista como formulario
  const doc = await PDFLib.PDFDocument.create();
  const pag = doc.addPage([612, 792]);
  pag.drawText('Firma:', { x: 60, y: 280, size: 12 });
  doc.getForm().createButton('foto').addToPage('', pag, { x: 60, y: 300, width: 200, height: 60, backgroundColor: PDFLib.rgb(1, 1, 1), borderColor: PDFLib.rgb(0.7, 0.7, 0.7) });
  doc.catalog.lookup(PDFLib.PDFName.of('AcroForm')).set(PDFLib.PDFName.of('Fields'), doc.context.obj([]));
  const bytesPdf = Buffer.from(await doc.save());

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errores = await abrir(page, 'firmar');
  await subir(page, 'hoja.pdf', 'application/pdf', bytesPdf);
  await page.locator('[data-sign-upload-input]').setInputFiles(archivo('firma.png', 'image/png', await imagen(page, { ancho: 900, alto: 300, dibujo: 'firma', tipo: 'image/png' })));
  await expect(page.locator('.placed')).toHaveCount(1);

  // llevar la firma al centro del campo (x = 160/612, y = 1 − 330/792)
  const hoja = page.locator('.sign-page__sheet').first();
  await hoja.evaluate(e => e.scrollIntoView({ block: 'center' }));
  const h = await hoja.boundingBox(), f = await page.locator('.placed').boundingBox();
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width * 160 / 612, h.y + h.height * (1 - 330 / 792), { steps: 8 }); await page.mouse.up();

  const { bytes } = await descargar(page, '[data-sign-go]');
  // se dibuja el PDF descargado y se buscan los trazos azules dentro del campo
  const azules = await page.evaluate(async (datos) => {
    const c = await window.Fusor.engine.rasterize({ bytes: new Uint8Array(datos) }, 0, 1);
    const d = c.getContext('2d').getImageData(70, 792 - 355, 180, 50).data;
    let n = 0;
    for(let i = 0; i < d.length; i += 4) if(d[i + 2] > d[i] + 60) n++;
    return n;
  }, Array.from(bytes));
  expect(azules).toBeGreaterThan(50);
  // el campo que tapaba la firma ya no es una anotación aparte
  const firmado = await leerPdf(bytes);
  const annots = firmado.getPage(0).node.lookup(PDFLib.PDFName.of('Annots'));
  expect(annots ? annots.size() : 0).toBe(0);
  expect(errores).toEqual([]);
});
