# FUSOR — Unir, dividir, organizar y firmar PDF

Herramienta web para trabajar con PDF directamente en el navegador. Ningún archivo se sube a un servidor.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| **Unir** | Junta varios PDF en uno. Reordena arrastrando o con las flechas, ordena por nombre y elige el nombre final. |
| **Dividir** | Extrae páginas por selección o por rangos (`1-3, 5, 8-`), crea un PDF por página o corta el documento cada N páginas. |
| **Organizar** | Miniaturas de cada página para reordenar, girar o quitar páginas. Las páginas quitadas quedan marcadas y se pueden recuperar hasta guardar. |
| **Firmar** | Acepta PDF, Word (.docx), imágenes (JPG, PNG, WEBP, GIF, BMP) y texto (.txt, .md, .csv). Crea tu firma dibujándola, escribiéndola o subiendo una foto; arrástrala a la página, muévela, cambia su tamaño o cópiala en todas las páginas. También agrega texto y la fecha. Descarga en PDF, Word, PNG o JPG. |

Cada herramienta tiene su propia URL: `#unir`, `#dividir`, `#organizar`, `#firmar`.

### Firmar: detalles

- **Word y otros formatos** se convierten a PDF en el navegador antes de firmar (párrafos, negrita/cursiva, tamaños, colores, listas, tablas, imágenes y saltos de página). Los `.doc` antiguos, `.odt` y `.rtf` no se pueden leer: guárdalos como `.docx` o PDF. Las fuentes del Word se aproximan con Helvetica, Times o Courier.
- **Firmas:** se dibujan con ratón, dedo o lápiz (sigue la presión), se escriben con tres estilos manuscritos o se suben como foto (quita el fondo blanco). Se guardan solo en el navegador (`localStorage`) y se pueden borrar.
- **Colocar:** arrastra la firma desde el panel hasta la página, o toca una página y luego la firma. Con teclado: flechas para mover (Mayús = más rápido), `+`/`-` para el tamaño, Suprimir para quitar.
- **Descargar:** PDF (las firmas se integran en el documento original, respetando páginas giradas); Word (`.docx` con cada página como imagen, idéntico al original); PNG o JPG (una imagen por página; con varias páginas, en un `.zip`).

## Estructura del proyecto

```
fusor-pro/
├── index.html              → estructura de la página y las tres herramientas
├── fonts/                  → tipografía Archivo y, en fonts/firma/, tres manuscritas para firmas (local)
├── css/
│   ├── fonts.css           → carga de la tipografía local
│   ├── tokens.css          → colores, tipografía, espacios (tinta por herramienta)
│   ├── base.css            → estilos base, iconos, foco, selección
│   ├── layout.css          → barra superior, área de trabajo, panel lateral, móvil
│   ├── components.css      → botones, zona para soltar, listas, páginas, avisos
│   └── sign.css            → Firmar: páginas, firmas colocadas, estudio de firma
├── js/
│   ├── core/
│   │   ├── utils.js        → utilidades (rangos de páginas, nombres, tamaños)
│   │   ├── engine.js       → leer, validar, unir y construir PDF; miniaturas
│   │   ├── pdfjs-loader.mjs → carga pdf.js (módulo ES)
│   │   ├── motion.js       → animaciones
│   │   ├── ui.js           → zona para soltar, avisos, animación de unión
│   │   ├── convert.js      → Word, imágenes y texto → PDF
│   │   ├── export.js       → PDF → Word, PNG, JPG (.zip)
│   │   └── signpad.js      → estudio de firma y firmas guardadas
│   ├── tools/
│   │   ├── merge.js        → Unir
│   │   ├── split.js        → Dividir
│   │   ├── organize.js     → Organizar
│   │   └── sign.js         → Firmar
│   ├── app.js              → pestañas y navegación por #hash
│   └── vendor/
│       ├── pdf-lib.min.js  → librería para leer y crear PDF
│       ├── fflate.min.js   → leer .docx y crear .zip / .docx (fflate 0.8.2)
│       └── pdfjs/          → pdf.js 4.10.38 para las miniaturas
├── PRODUCT.md              → para quién es y qué debe cumplir
└── README.md
```

No hay módulos ES ni build step: los scripts se cargan en orden y comparten el objeto `window.Fusor`, así la app también abre con doble clic.

## Cómo probarlo en tu computador

**Opción A — VS Code:** instala "Live Server", clic derecho sobre `index.html` → "Open with Live Server".

**Opción B — Python:**
```bash
python -m http.server 8000
```
Luego abre `http://localhost:8000`.

**Opción C — directo:** doble clic en `index.html`.

## Cómo publicarlo gratis

- **GitHub Pages:** sube la carpeta a un repositorio → *Settings → Pages* → rama `main`, carpeta raíz.
- **Netlify:** arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop).

## Seguridad

- **Sin dependencias externas:** pdf-lib, fflate, [pdf.js](https://mozilla.github.io/pdf.js/) 4.10.38 (`js/vendor/pdfjs/`) y las tipografías (`fonts/`) están dentro del proyecto. La página no carga nada de otros servidores.
- **Política CSP** en `index.html`: solo se ejecuta código del propio sitio; sin scripts ni estilos en línea, sin `eval` y sin conexiones a otros dominios.
- **pdf.js endurecido:** versión corregida contra CVE-2024-4367, con `isEvalSupported: false` y sin XFA.
- **Validación de archivos:** se rechazan los que no empiezan como PDF (`%PDF-`), los vacíos, los de más de 200 MB y los protegidos con contraseña.
- **Sin referrer:** al salir de la página no se envía la dirección de origen.

Si agregas código, no uses atributos `style="…"` ni `<script>` en línea: la CSP los bloquea. Usa clases CSS o `element.style.setProperty()`.

## Notas técnicas

- Las miniaturas se cargan como módulo ES (`js/core/pdfjs-loader.mjs`). Al abrir `index.html` con doble clic el navegador bloquea los módulos, así que aparecen números en lugar de miniaturas; con un servidor local o publicada, se ven bien.
- Respeta `prefers-reduced-motion` y se puede usar entero con teclado.
- Exportar a Word, PNG o JPG usa pdf.js, así que (como las miniaturas) necesita abrir la app desde un servidor o publicada.
- Licencias: pdf.js (Apache 2.0, `js/vendor/pdfjs/LICENSE`), Archivo (SIL OFL, `fonts/OFL.txt`), Great Vibes, Dancing Script y Caveat (SIL OFL, `fonts/firma/`), pdf-lib (MIT), fflate (MIT, `js/vendor/fflate.LICENSE`).
