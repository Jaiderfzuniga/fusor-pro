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
