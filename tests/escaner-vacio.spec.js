// Escáner de Ampliar con una cámara simulada que solo ve la mesa, sin documento.
const { test, expect } = require('@playwright/test');
const { abrir, videoDeTarjeta } = require('./ayudas');

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + videoDeTarjeta(false)] }
});

test('el escáner no dispara solo si no ve un documento', async ({ page }) => {
  await abrir(page, 'ampliar');
  await page.click('[data-id-slot="front"] .drop__camera--scan');
  await expect(page.locator('[data-scan-status]')).toContainText('Pon el documento dentro del recuadro');
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-scanner]')).toBeVisible();          // sigue esperando
  await expect(page.locator('[data-id-slot="front"] [data-id-crop]')).toBeHidden();
  await page.click('[data-scan-close]');
});
