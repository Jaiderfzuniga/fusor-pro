// Firmar: crear una firma, colocarla, formularios, sellos, deshacer y formatos.
const { test, expect } = require('@playwright/test');
const { abrir, descargar, pdf, docx, leerPdf, archivo, esZip, PDFLib } = require('./ayudas');

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

  // arrastrar la firma de la biblioteca a la página (cuando la página dejó de desplazarse)
  await quieta(page);
  const hoja = await page.locator('.sign-page__sheet').first().boundingBox();
  const vista = page.viewportSize();
  const destino = { x: hoja.x + hoja.width * 0.3, y: (Math.max(hoja.y, 0) + Math.min(hoja.y + hoja.height, vista.height)) / 2 };
  const firma = await page.locator('.sig__pick').first().boundingBox();
  await page.mouse.move(firma.x + 20, firma.y + 20); await page.mouse.down();
  await page.mouse.move(firma.x - 80, firma.y + 30, { steps: 4 });
  await page.mouse.move(destino.x, destino.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.placed')).toHaveCount(2);

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
