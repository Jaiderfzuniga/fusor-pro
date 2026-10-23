# Pruebas automáticas

Abren FUSOR en un navegador real (Chromium) y usan cada herramienta como lo haría una persona: suben archivos de ejemplo, mueven firmas, recortan fotos y revisan que lo descargado sea correcto (número de páginas, tamaño de la hoja, formato del archivo). También fallan si la página muestra cualquier error en la consola.

Los archivos de ejemplo (PDF, Word, fotos) se generan dentro de las pruebas; no hay que guardar nada aparte.

## Cómo correrlas

Solo la primera vez:

```bash
npm install
npx playwright install chromium
```

Cada vez que cambies algo:

```bash
npm test
```

- `npm run test:ver` — igual, pero con el navegador visible para ver lo que hace.
- `npx playwright test tests/firmar.spec.js` — solo las pruebas de un archivo.

## En GitHub

`.github/workflows/pruebas.yml` las corre solas en cada pull request y en cada cambio en `main`. Si algo falla, el pull request muestra una ✗ roja y, en la pestaña **Actions**, el informe con capturas de pantalla del fallo.

## Archivos

| Archivo | Qué prueba |
|---|---|
| `general.spec.js` | La página carga sin errores, las 8 pestañas, el modo oscuro y el pie (también en tamaño celular). |
| `pdf.spec.js` | Unir, Dividir, Organizar y Comprimir. |
| `firmar.spec.js` | Firmas dibujadas y escritas, arrastrar, Word a PDF, formularios, sellos, deshacer, páginas giradas y descargas en PDF, Word, PNG y JPG. |
| `imagenes.spec.js` | Imágenes a PDF, Ampliar documento (cédula, carné vertical, otro tamaño, pasaporte) y Foto 3×4. |
| `ayudas.js` | Generadores de archivos de ejemplo y utilidades compartidas. |
| `servidor.js` | Servidor local mínimo que sirve la página durante las pruebas. |
