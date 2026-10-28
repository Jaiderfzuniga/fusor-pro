// Unir, Dividir, Organizar y Comprimir.
const { test, expect } = require('@playwright/test');
const { abrir, descargar, pdf, leerPdf, archivo } = require('./ayudas');

test('Unir junta dos PDF en uno', async ({ page }) => {
  const errores = await abrir(page, 'unir');
  await page.setInputFiles('#tool-merge [data-drop] input[type=file]', [
    archivo('a.pdf', 'application/pdf', await pdf({ paginas: 2 })),
    archivo('b.pdf', 'application/pdf', await pdf({ paginas: 3 }))
  ]);
  await expect(page.locator('[data-merge-go]')).toBeEnabled();
  const { nombre, bytes } = await descargar(page, '[data-merge-go]');
  expect(nombre).toMatch(/\.pdf$/);
  expect((await leerPdf(bytes)).getPageCount()).toBe(5);
  expect(errores).toEqual([]);
});

test('Unir rechaza archivos que no son PDF', async ({ page }) => {
  await abrir(page, 'unir');
  await page.setInputFiles('#tool-merge [data-drop] input[type=file]', archivo('nota.txt', 'text/plain', Buffer.from('hola')));
  await expect(page.locator('.toast--error')).toBeVisible();
  await expect(page.locator('[data-merge-go]')).toBeDisabled();
});

test('Dividir extrae un rango de páginas', async ({ page }) => {
  const errores = await abrir(page, 'dividir');
  await page.setInputFiles('#tool-split [data-drop] input[type=file]', archivo('doc.pdf', 'application/pdf', await pdf({ paginas: 5 })));
  await page.fill('#splitRange', '2-4');
  await expect(page.locator('[data-split-go-label]')).toHaveText('Crear PDF de 3 páginas');
  const { bytes } = await descargar(page, '[data-split-go]');
  expect((await leerPdf(bytes)).getPageCount()).toBe(3);
  expect(errores).toEqual([]);
});

test('Organizar quita y gira páginas', async ({ page }) => {
  const errores = await abrir(page, 'organizar');
  await page.setInputFiles('#tool-organize [data-drop] input[type=file]', archivo('doc.pdf', 'application/pdf', await pdf({ paginas: 3 })));
  await page.locator('#tool-organize .page').nth(0).locator('[data-act="void"]').click();
  await page.locator('#tool-organize .page').nth(1).locator('[data-act="rotr"]').click();
  await expect(page.locator('[data-org-t-final]')).toHaveText('2');
  const { bytes } = await descargar(page, '[data-org-go]');
  const doc = await leerPdf(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  expect(errores).toEqual([]);
});

test('Comprimir reduce un PDF pesado y nunca lo agranda', async ({ page }) => {
  const errores = await abrir(page, 'comprimir');
  const original = await pdf({ paginas: 2, pesado: true });
  await page.setInputFiles('#tool-compress [data-drop] input[type=file]', archivo('pesado.pdf', 'application/pdf', original));
  await expect(page.locator('[data-cmp-go]')).toBeEnabled();
  for(const nivel of ['medium', 'strong', 'light']){
    await page.check('input[name=cmpLevel][value=' + nivel + ']');
    const { bytes } = await descargar(page, '[data-cmp-go]');
    expect((await leerPdf(bytes)).getPageCount()).toBe(2);
    expect(bytes.length).toBeLessThanOrEqual(original.length);
    if(nivel !== 'light') expect(bytes.length).toBeLessThan(original.length / 2);
  }
  expect(errores).toEqual([]);
});

// PDF de 2 páginas con formulario: «nombre» y «acepta» en la 1, «ciudad» en la 2.
async function pdfConFormulario(){
  const { PDFLib } = require('./ayudas');
  const doc = await PDFLib.PDFDocument.create(), form = doc.getForm();
  const p1 = doc.addPage([595, 842]), p2 = doc.addPage([595, 842]);
  form.createTextField('nombre').addToPage(p1, { x: 100, y: 700, width: 200, height: 22 });
  form.createCheckBox('acepta').addToPage(p1, { x: 100, y: 650, width: 18, height: 18 });
  form.createTextField('ciudad').addToPage(p2, { x: 100, y: 700, width: 200, height: 22 });
  return Buffer.from(await doc.save());
}
const nombres = doc => doc.getForm().getFields().map(f => f.getName()).sort();

test('Organizar conserva el formulario (se puede rellenar)', async ({ page }) => {
  const { PDFLib } = require('./ayudas');
  const errores = await abrir(page, 'organizar');
  await page.setInputFiles('#tool-organize [data-drop] input[type=file]', archivo('f.pdf', 'application/pdf', await pdfConFormulario()));
  await page.locator('#tool-organize .page').nth(0).locator('[data-act="right"]').click(); // invertir el orden
  const { bytes } = await descargar(page, '[data-org-go]');
  const doc = await leerPdf(bytes);
  expect(nombres(doc)).toEqual(['acepta', 'ciudad', 'nombre']);
  doc.getForm().getTextField('nombre').setText('Ana');
  doc.getForm().getCheckBox('acepta').check();
  expect((await PDFLib.PDFDocument.load(await doc.save())).getForm().getTextField('nombre').getText()).toBe('Ana');
  expect(errores).toEqual([]);
});

test('Dividir deja solo los campos de las páginas extraídas', async ({ page }) => {
  await abrir(page, 'dividir');
  await page.setInputFiles('#tool-split [data-drop] input[type=file]', archivo('f.pdf', 'application/pdf', await pdfConFormulario()));
  await page.fill('#splitRange', '2');
  const { bytes } = await descargar(page, '[data-split-go]');
  expect(nombres(await leerPdf(bytes))).toEqual(['ciudad']);
});

test('Unir conserva los formularios y renombra los campos repetidos', async ({ page }) => {
  await abrir(page, 'unir');
  const f = await pdfConFormulario();
  await page.setInputFiles('#tool-merge [data-drop] input[type=file]', [archivo('a.pdf', 'application/pdf', f), archivo('b.pdf', 'application/pdf', f)]);
  await expect(page.locator('[data-merge-go]')).toBeEnabled();
  const { bytes } = await descargar(page, '[data-merge-go]');
  const doc = await leerPdf(bytes);
  expect(nombres(doc)).toEqual(['acepta', 'acepta-2', 'ciudad', 'ciudad-2', 'nombre', 'nombre-2']);
  // cada copia se rellena por separado
  doc.getForm().getTextField('nombre').setText('Uno');
  doc.getForm().getTextField('nombre-2').setText('Dos');
  expect(doc.getForm().getTextField('nombre').getText()).toBe('Uno');
});

test('Organizar repara un formulario que había quedado suelto', async ({ page }) => {
  const { PDFLib } = require('./ayudas');
  // como el PDF del caso real: los campos se ven, pero /AcroForm /Fields está vacío
  const doc = await PDFLib.PDFDocument.load(await pdfConFormulario());
  doc.catalog.lookup(PDFLib.PDFName.of('AcroForm')).set(PDFLib.PDFName.of('Fields'), doc.context.obj([]));
  await abrir(page, 'organizar');
  await page.setInputFiles('#tool-organize [data-drop] input[type=file]', archivo('suelto.pdf', 'application/pdf', Buffer.from(await doc.save())));
  await page.locator('#tool-organize .page').nth(0).locator('[data-act="rotr"]').click();
  const { bytes } = await descargar(page, '[data-org-go]');
  expect(nombres(await leerPdf(bytes))).toEqual(['acepta', 'ciudad', 'nombre']);
});
