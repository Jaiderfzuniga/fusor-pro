// Navegadores anteriores a 2024 (por ejemplo Chrome 109, el último en Windows 7/8.1)
// no tienen Promise.withResolvers. pdf.js usa la versión «legacy», que lo suple.
const { test, expect } = require('@playwright/test');
const { abrir, pdf, archivo } = require('./ayudas');

test('las páginas se dibujan en un navegador sin funciones recientes', async ({ page }) => {
  await page.addInitScript(() => { delete Promise.withResolvers; delete Array.prototype.findLast; });
  const errores = await abrir(page, 'firmar');
  await page.setInputFiles('#tool-sign [data-drop] input[type=file]', archivo('c.pdf', 'application/pdf', await pdf({ paginas: 1 })));
  await expect(page.locator('.sign-page__sheet canvas')).toHaveCount(1, { timeout: 20000 });
  expect(errores).toEqual([]);
});

test('si la vista previa no se puede dibujar, la página lo dice', async ({ page }) => {
  // sin pdf.js (por ejemplo, al abrir index.html con doble clic)
  await page.route('**/pdfjs-loader.mjs', r => r.fulfill({ status: 404, body: '' }));
  await abrir(page, 'firmar');
  await page.setInputFiles('#tool-sign [data-drop] input[type=file]', archivo('c.pdf', 'application/pdf', await pdf({ paginas: 1 })));
  await expect(page.locator('.sign-page__sheet[data-preview="none"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('.sign-page__sheet[data-preview="none"] .sheet-note')).toBeVisible();
});
