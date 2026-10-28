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

test('en el celular hay un botón para tomar la foto con la cámara', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'el botón solo aparece en pantallas táctiles');
  const { imagen, archivo } = require('./ayudas');
  await abrir(page, 'foto');
  const boton = page.locator('#tool-photo .drop__camera');
  await expect(boton).toBeVisible();
  // Foto 3×4 abre la cámara frontal (capture="user")
  await expect(page.locator('#tool-photo input[capture="user"]')).toHaveCount(1);
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), boton.click()]);
  await selector.setFiles(archivo('yo.jpg', 'image/jpeg', await imagen(page, { ancho: 900, alto: 1200, dibujo: 'retrato' })));
  await expect(page.locator('[data-ph-crop]')).toBeVisible();
  await expect(boton).toBeHidden(); // con la foto puesta, desaparece junto a la zona

  // Imágenes a PDF usa la cámara trasera
  await page.click('.tab[data-hash="imagenes"]');
  await expect(page.locator('#tool-images input[capture="environment"]')).toHaveCount(1);
});

test('en el computador solo aparece el escáner de Ampliar, no la foto del sistema', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'solo en escritorio');
  await abrir(page, 'foto');
  await expect(page.locator('#tool-photo .drop__camera')).toBeHidden();
  await page.click('.tab[data-hash="ampliar"]');
  await expect(page.locator('[data-id-slot="front"] .drop__camera--scan')).toBeVisible();
});
