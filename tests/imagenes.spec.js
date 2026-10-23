// Imágenes a PDF, Ampliar documento y Foto para documentos.
const { test, expect } = require('@playwright/test');
const { abrir, descargar, imagen, leerPdf, archivo, esJpg, esZip, fflate, PDFLib } = require('./ayudas');

const MM = 72 / 25.4;

// Resolución guardada en el archivo (null si no tiene).
function dpiJpg(b){ return b[6] === 0x4a && b[13] === 1 ? b.readUInt16BE(14) : null; }
function dpiPng(b){
  const i = b.indexOf('pHYs');
  return i < 0 || b[i + 12] !== 1 ? null : Math.round(b.readUInt32BE(i + 4) * 0.0254);
}

test('Imágenes a PDF: una página por foto, en orden y con giro', async ({ page }) => {
  const errores = await abrir(page, 'imagenes');
  const fotos = [
    archivo('1.jpg', 'image/jpeg', await imagen(page, { ancho: 900, alto: 1200 })),
    archivo('2.jpg', 'image/jpeg', await imagen(page, { ancho: 1200, alto: 800, dibujo: 'documento' })),
    archivo('3.png', 'image/png', await imagen(page, { ancho: 600, alto: 600, tipo: 'image/png' }))
  ];
  await page.setInputFiles('#tool-images [data-drop] input[type=file]', fotos);
  await expect(page.locator('#tool-images .page')).toHaveCount(3);
  await page.locator('#tool-images .page').nth(0).locator('[data-act="rotr"]').click();
  await page.locator('#tool-images .page').nth(2).locator('[data-act="remove"]').click();
  await expect(page.locator('#tool-images .page')).toHaveCount(2);

  const { bytes } = await descargar(page, '[data-img-go]');
  const doc = await leerPdf(bytes);
  expect(doc.getPageCount()).toBe(2);
  // Carta: la foto girada y la apaisada van en hoja horizontal
  for(const p of doc.getPages()){
    const { width, height } = p.getSize();
    expect(Math.round(width / MM)).toBe(279);
    expect(Math.round(height / MM)).toBe(216);
  }
  expect(errores).toEqual([]);
});

test('Ampliar: detecta la cédula y crea la hoja al 150 %', async ({ page }) => {
  const errores = await abrir(page, 'ampliar');
  const foto = await imagen(page, { ancho: 1600, alto: 1200, dibujo: 'documento' });
  await page.setInputFiles('[data-id-slot="front"] input[type=file]', archivo('frente.jpg', 'image/jpeg', foto));
  await page.setInputFiles('[data-id-slot="back"] input[type=file]', archivo('reverso.jpg', 'image/jpeg', foto));
  await expect(page.locator('[data-id-preview-note]')).toContainText('150 %');
  await expect(page.locator('[data-id-preview-note]')).toContainText('12,8 × 8,1 cm');

  // la detección ajusta el recuadro a la tarjeta, no a toda la foto
  const w = await page.locator('[data-id-slot="front"] .crop__box').evaluate(e => +e.style.getPropertyValue('--w'));
  expect(w).toBeGreaterThan(0.45); expect(w).toBeLessThan(0.7);

  const { bytes } = await descargar(page, '[data-id-go]');
  const doc = await leerPdf(bytes);
  const { width, height } = doc.getPage(0).getSize();
  expect(Math.round(width / MM)).toBe(216); expect(Math.round(height / MM)).toBe(279);
  expect(errores).toEqual([]);
});

test('Ampliar: encuentra el documento aunque ocupe poco de la foto y lo endereza', async ({ page }) => {
  await abrir(page, 'ampliar');
  // foto vertical con la tarjeta acostada ocupando ~25 % del alto
  const foto = await imagen(page, { ancho: 1200, alto: 1600, dibujo: 'documento' });
  await page.setInputFiles('[data-id-slot="front"] input[type=file]', archivo('frente.jpg', 'image/jpeg', foto));
  const caja = page.locator('[data-id-slot="front"] .crop__box');
  await expect.poll(() => caja.evaluate(e => +e.style.getPropertyValue('--w'))).toBeLessThan(0.7);
  // con «Carné vertical» la foto se gira para que el carné quede de pie
  await page.check('input[name=idDoc][value=cardV]');
  await page.setInputFiles('[data-id-slot="front"] input[type=file]', archivo('frente.jpg', 'image/jpeg', foto));
  const lienzo = page.locator('[data-id-slot="front"] .crop__stage canvas');
  await expect.poll(() => lienzo.evaluate(c => c.width > c.height)).toBe(true); // 1200×1600 girada 90°
  await expect.poll(() => caja.evaluate(e => +e.style.getPropertyValue('--h'))).toBeLessThan(0.75);
});

test('Ampliar: carné vertical, otro tamaño y aviso cuando no cabe', async ({ page }) => {
  await abrir(page, 'ampliar');
  const foto = await imagen(page, { ancho: 1600, alto: 1200, dibujo: 'documento' });
  await page.setInputFiles('[data-id-slot="front"] input[type=file]', archivo('frente.jpg', 'image/jpeg', foto));
  await page.setInputFiles('[data-id-slot="back"] input[type=file]', archivo('reverso.jpg', 'image/jpeg', foto));

  await page.check('input[name=idDoc][value=cardV]');
  await expect(page.locator('[data-id-preview-note]')).toContainText('8,1 × 12,8 cm'); // de pie, al 150 %
  await expect(page.locator('[data-id-slot="back"]')).toBeHidden();
  // la foto ya subida (tarjeta acostada) se gira para que el carné quede de pie
  const lienzo = page.locator('[data-id-slot="front"] .crop__stage canvas');
  await expect.poll(() => lienzo.evaluate(c => c.height > c.width)).toBe(true);

  await page.check('input[name=idDoc][value=custom]');
  await expect(page.locator('[data-id-custom]')).toBeVisible();
  await page.fill('#idCustomW', '9');
  await page.fill('#idCustomH', '6');
  await expect(page.locator('[data-id-preview-note]')).toContainText('13,5 × 9,0 cm');

  await page.check('input[name=idDoc][value=passport]');
  await page.check('input[name=idScale][value="200"]');
  await expect(page.locator('[data-id-hint]')).toContainText('No cabe al 200 %');

  // la misma hoja en los otros formatos
  await page.check('input[name=idFormat][value=jpg]');
  let r = await descargar(page, '[data-id-go]');
  expect(r.nombre).toMatch(/\.jpg$/); expect(esJpg(r.bytes)).toBe(true);
  expect(dpiJpg(r.bytes)).toBe(200);
  await page.check('input[name=idFormat][value=png]');
  r = await descargar(page, '[data-id-go]');
  expect(r.nombre).toMatch(/\.png$/); expect(r.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(dpiPng(r.bytes)).toBe(200);
  await page.check('input[name=idFormat][value=docx]');
  r = await descargar(page, '[data-id-go]');
  expect(r.nombre).toMatch(/\.docx$/); expect(esZip(r.bytes)).toBe(true);
  const word = fflate.unzipSync(new Uint8Array(r.bytes));
  expect(Object.keys(word)).toContain('word/document.xml');
  expect(Object.keys(word).some(k => k.startsWith('word/media/'))).toBe(true);
});

test('Ampliar: el carné estudiantil lleva solo el frente', async ({ page }) => {
  const errores = await abrir(page, 'ampliar');
  const reverso = page.locator('[data-id-slot="back"]');
  await expect(reverso).toBeVisible(); // la cédula pide frente y reverso
  const foto = await imagen(page, { ancho: 1600, alto: 1200, dibujo: 'documento' });
  await page.setInputFiles('[data-id-slot="front"] input[type=file]', archivo('frente.jpg', 'image/jpeg', foto));
  await page.setInputFiles('[data-id-slot="back"] input[type=file]', archivo('reverso.jpg', 'image/jpeg', foto));

  for(const tipo of ['student', 'cardV']){
    await page.check('input[name=idDoc][value=' + tipo + ']');
    await expect(reverso).toBeHidden();
    const { bytes } = await descargar(page, '[data-id-go]');
    // una sola imagen en la hoja aunque antes se hubiera subido el reverso
    const doc = await leerPdf(bytes);
    const xobj = doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
    expect(xobj.keys().length).toBe(1);
  }
  await page.check('input[name=idDoc][value=card]');
  await expect(reverso).toBeVisible();
  expect(errores).toEqual([]);
});

test('Foto 3×4: foto suelta en JPG a 300 ppp y hoja de copias en PDF', async ({ page }) => {
  const errores = await abrir(page, 'foto');
  await page.setInputFiles('#tool-photo [data-drop] input[type=file]', archivo('yo.jpg', 'image/jpeg', await imagen(page, { ancho: 900, alto: 1200, dibujo: 'retrato' })));
  await expect(page.locator('[data-ph-crop]')).toBeVisible();

  // foto suelta: 3 × 4 cm a 300 ppp = 354 × 472 px
  let r = await descargar(page, '[data-ph-go]');
  expect(r.nombre).toBe('foto-3x4.jpg'); expect(esJpg(r.bytes)).toBe(true);
  const px = await page.evaluate(async (datos) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(datos)]));
    return [bmp.width, bmp.height];
  }, Array.from(r.bytes));
  expect(px).toEqual([354, 472]);
  // el archivo guarda 300 ppp, así se imprime a 3 × 4 cm y no más grande
  expect(dpiJpg(r.bytes)).toBe(300);

  // hoja Carta con 8 copias
  await page.check('input[name=phFormat][value=pdf]');
  await expect(page.locator('[data-ph-copies]')).toBeVisible();
  r = await descargar(page, '[data-ph-go]');
  const doc = await leerPdf(r.bytes);
  expect(doc.getPageCount()).toBe(1);
  await expect(page.locator('[data-ph-result-meta]')).toContainText('8 copias');

  // otro tamaño y hoja llena
  await page.check('input[name=phSize][value="4x5"]');
  await page.check('input[name=phCopies][value=fill]');
  await expect(page.locator('[data-ph-preview-note]')).toContainText('copias de 4 × 5 cm');

  // la hoja en JPG guarda 200 ppp: se imprime en tamaño Carta
  await page.check('input[name=phFormat][value=sheet-jpg]');
  r = await descargar(page, '[data-ph-go]');
  expect(dpiJpg(r.bytes)).toBe(200);
  expect(errores).toEqual([]);
});

test('Foto 3×4: «Eliminar foto» quita la imagen y vuelve a pedir una', async ({ page }) => {
  await abrir(page, 'foto');
  await page.setInputFiles('#tool-photo [data-drop] input[type=file]', archivo('yo.jpg', 'image/jpeg', await imagen(page, { ancho: 900, alto: 1200, dibujo: 'retrato' })));
  await expect(page.locator('[data-ph-crop]')).toBeVisible();
  await expect(page.locator('[data-ph-go]')).toBeEnabled();
  await page.click('[data-ph-remove]');
  await expect(page.locator('[data-ph-crop]')).toBeHidden();
  await expect(page.locator('#tool-photo [data-drop]')).toBeVisible();
  await expect(page.locator('[data-ph-go]')).toBeDisabled();
  // se puede subir otra
  await page.setInputFiles('#tool-photo [data-drop] input[type=file]', archivo('otra.jpg', 'image/jpeg', await imagen(page, { ancho: 800, alto: 1000, dibujo: 'retrato' })));
  await expect(page.locator('[data-ph-crop]')).toBeVisible();
  await expect(page.locator('[data-ph-go]')).toBeEnabled();
});
