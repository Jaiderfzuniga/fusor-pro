// Pruebas automáticas de FUSOR (Playwright). Ver tests/LEEME.md.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /general\.spec\.js/ }
  ],
  // sirve la página tal cual (sin compilar nada), igual que GitHub Pages
  webServer: {
    command: 'node tests/servidor.js ' + PORT,
    url: 'http://127.0.0.1:' + PORT,
    reuseExistingServer: !process.env.CI
  }
});
