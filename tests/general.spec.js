// La página carga sin errores, todas las pestañas funcionan y el tema se recuerda.
const { test, expect } = require('@playwright/test');
const { abrir } = require('./ayudas');

const PESTANAS = [
  ['unir', 'Unir PDF'], ['dividir', 'Dividir PDF'], ['organizar', 'Organizar páginas'], ['firmar', 'Firmar documentos'],
  ['comprimir', 'Comprimir PDF'], ['imagenes', 'Imágenes a PDF'], ['ampliar', 'Ampliar documento'], ['foto', 'Foto para documentos']
];

test('carga sin errores y cada pestaña muestra su herramienta', async ({ page }) => {
  const errores = await abrir(page, 'unir');
  for(const [hash, titulo] of PESTANAS){
    await page.click('.tab[data-hash="' + hash + '"]');
    await expect(page).toHaveURL(new RegExp('#' + hash + '$'));
    const panel = page.locator('.tool:not([hidden])');
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('.work__title')).toHaveText(titulo);
  }
  // la dirección con #hash abre directamente la herramienta
  await page.goto('/#foto');
  await expect(page.locator('#tool-photo')).toBeVisible();
  expect(errores).toEqual([]);
});

test('las pestañas caben sin desplazamiento horizontal', async ({ page }) => {
  await abrir(page, 'unir');
  const ancho = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(ancho[0]).toBeLessThanOrEqual(ancho[1]);
  for(const tab of await page.locator('.tab').all()) await expect(tab).toBeInViewport();
});

test('el botón de tema cambia a oscuro y se recuerda al recargar', async ({ page }) => {
  await abrir(page, 'unir');
  const html = page.locator('html');
  const antes = await html.getAttribute('data-theme');
  await page.click('[data-theme-toggle]');
  const despues = antes === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-theme', despues);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', despues);
});

test('el pie muestra el año actual', async ({ page }) => {
  await abrir(page, 'unir');
  await expect(page.locator('[data-year]')).toHaveText(String(new Date().getFullYear()));
});
