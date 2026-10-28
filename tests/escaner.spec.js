// Escáner de Ampliar con una cámara simulada: Chrome reproduce un video (Y4M)
// con una tarjeta clara sobre una mesa oscura, como si fuera la cámara.
const { test, expect } = require('@playwright/test');
const { abrir, videoDeTarjeta } = require('./ayudas');

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + videoDeTarjeta()] }
});

test('el escáner de Ampliar toma la foto solo cuando ve el documento quieto', async ({ page }) => {
  const errores = await abrir(page, 'ampliar');
  await page.click('[data-id-slot="front"] .drop__camera--scan');
  const escaner = page.locator('[data-scanner]');
  await expect(escaner).toBeVisible();
  await expect(page.locator('[data-scan-title]')).toHaveText('Escanear el frente del documento');
  // sin tocar nada: detecta la tarjeta, espera a que esté quieta y captura
  await expect(page.locator('[data-id-slot="front"] [data-id-crop]')).toBeVisible({ timeout: 15000 });
  await expect(escaner).toBeHidden();
  // el recorte quedó sobre la tarjeta (60 % del ancho del video), no sobre toda la foto
  const w = await page.locator('[data-id-slot="front"] .crop__box').evaluate(e => +e.style.getPropertyValue('--w'));
  expect(w).toBeGreaterThan(0.5); expect(w).toBeLessThan(0.75);
  // la cámara quedó apagada
  expect(await page.evaluate(() => document.querySelector('[data-scanner] video').srcObject)).toBeNull();
  expect(errores).toEqual([]);
});

test('en el escáner también se puede tomar la foto a mano o cerrar', async ({ page }) => {
  await abrir(page, 'ampliar');
  // cerrar sin capturar
  await page.click('[data-id-slot="back"] .drop__camera--scan');
  await expect(page.locator('[data-scanner]')).toBeVisible();
  await page.click('[data-scan-close]');
  await expect(page.locator('[data-scanner]')).toBeHidden();
  await expect(page.locator('[data-id-slot="back"] [data-id-crop]')).toBeHidden();
  // capturar a mano en cuanto arranca la cámara
  await page.click('[data-id-slot="back"] .drop__camera--scan');
  await expect(page.locator('[data-scan-status]')).not.toHaveText('Iniciando la cámara…');
  await page.click('[data-scan-shot]');
  await expect(page.locator('[data-id-slot="back"] [data-id-crop]')).toBeVisible();
});

