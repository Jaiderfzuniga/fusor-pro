# FUSOR — Herramientas PDF en tu navegador

Herramienta web para trabajar con PDF directamente en el navegador. Ningún archivo se sube a un servidor.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| **Unir** | Junta varios PDF en uno. Reordena arrastrando o con las flechas, ordena por nombre y elige el nombre final. |
| **Dividir** | Extrae páginas por selección o por rangos (`1-3, 5, 8-`), crea un PDF por página o corta el documento cada N páginas. |
| **Organizar** | Miniaturas de cada página para reordenar, girar o quitar páginas. Las páginas quitadas quedan marcadas y se pueden recuperar hasta guardar. |
| **Firmar** | Acepta PDF, Word (.docx), imágenes (JPG, PNG, WEBP, GIF, BMP) y texto (.txt, .md, .csv). Crea tu firma dibujándola, escribiéndola o subiendo una foto; arrástrala a la página, muévela, cambia su tamaño o cópiala en todas las páginas. También agrega texto y la fecha. Descarga en PDF, Word, PNG o JPG. |

| **Comprimir** | Reduce el peso de un PDF. *Recomendada* y *Fuerte* convierten cada página en imagen (mucho menos peso, el texto deja de ser seleccionable); *Ligera* conserva todo. Opción en blanco y negro. Nunca entrega un archivo más pesado que el original. |
| **Imágenes a PDF** | Junta varias fotos en un PDF (una por página): reordena, gira, elige Carta, A4, Oficio o el tamaño de la foto, y el margen. Reduce el peso de las fotos del celular. |
| **Foto 3×4** | Una foto tuya recortada a 3 × 4 cm (o 2,5 × 3, 4 × 5, 5 × 5 cm) con un óvalo guía para la cara. Se descarga como foto JPG a 300 ppp o como hoja Carta con 1, 4, 8 copias (o llena) y guías de corte, en PDF o JPG. |
| **Ampliar documento** | Fotos del frente y reverso de la cédula (o tarjeta, licencia, pasaporte u otro tamaño medido a mano), o solo el frente del carné estudiantil (horizontal o vertical): detecta el documento en la foto, se ajusta el recorte, se limpia (color mejorado, grises o fotocopia) y queda en una hoja Carta, Oficio o A4 a tamaño real ampliado al 100 %, 150 % o 200 %. Se descarga en PDF, Word, PNG o JPG. |

Cada herramienta tiene su propia URL: `#unir`, `#dividir`, `#organizar`, `#firmar`, `#comprimir`, `#imagenes`, `#ampliar`, `#foto`.

Modo claro u oscuro: el botón junto al logo (luna / sol) cambia el tema y lo recuerda en el navegador; mientras no se use, sigue la configuración del sistema. Las hojas de los documentos se ven siempre blancas. En pantallas angostas las pestañas se ordenan en 4 arriba y 3 abajo.

### Firmar: detalles

- **Word y otros formatos** se convierten a PDF en el navegador antes de firmar (párrafos, negrita/cursiva, tamaños, colores, listas, tablas, imágenes y saltos de página). Los `.doc` antiguos, `.odt` y `.rtf` no se pueden leer: guárdalos como `.docx` o PDF. Las fuentes del Word se aproximan con Helvetica, Times o Courier.
- **Firmas:** se dibujan con ratón, dedo o lápiz (sigue la presión), se escriben con tres estilos manuscritos o se suben como foto (quita el fondo blanco). Se guardan solo en el navegador (`localStorage`) y se pueden borrar.
- **Colocar:** arrastra la firma desde el panel hasta la página, o toca una página y luego la firma. Con teclado: flechas para mover (Mayús = más rápido), `+`/`-` para el tamaño, Suprimir para quitar.
- **Formularios PDF:** si el PDF tiene campos (texto, casillas, listas), aparecen arriba para rellenarlos. Al descargar se aplanan (quedan impresos) salvo que se marque «Dejar el formulario editable».
- **Sellos e iniciales:** ✓, ✗ e iniciales manuscritas, que se colocan y mueven como las firmas.
- **Deshacer:** Ctrl+Z / Ctrl+Y (Cmd en Mac) o los botones junto al nombre del documento.
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
│   ├── sign.css            → Firmar: páginas, firmas colocadas, estudio de firma
│   └── tools.css           → Comprimir, Imágenes, Ampliar, formularios y modo oscuro
├── js/
│   ├── core/
│   │   ├── theme.js        → modo claro u oscuro (se carga en <head>)
│   │   ├── utils.js        → utilidades (rangos de páginas, nombres, tamaños)
│   │   ├── engine.js       → leer, validar, unir y construir PDF; miniaturas
│   │   ├── pdfjs-loader.mjs → carga pdf.js (módulo ES)
│   │   ├── motion.js       → animaciones
│   │   ├── ui.js           → zona para soltar, avisos, animación de unión
│   │   ├── convert.js      → Word, imágenes y texto → PDF
│   │   ├── export.js       → PDF → Word, PNG, JPG (.zip)
│   │   ├── signpad.js      → estudio de firma y firmas guardadas
│   │   ├── imaging.js      → fotos: orientación, giro, reducción y limpieza
│   │   └── cropper.js      → recorte con proporción fija y detección del documento
│   ├── tools/
│   │   ├── merge.js        → Unir
│   │   ├── split.js        → Dividir
│   │   ├── organize.js     → Organizar
│   │   ├── sign.js         → Firmar
│   │   ├── compress.js     → Comprimir
│   │   ├── images.js       → Imágenes a PDF
│   │   ├── idcard.js       → Ampliar documento
│   │   └── photo.js        → Foto para documentos (3×4)
│   ├── app.js              → pestañas y navegación por #hash
│   └── vendor/
│       ├── pdf-lib.min.js  → librería para leer y crear PDF
│       ├── fflate.min.js   → leer .docx y crear .zip / .docx (fflate 0.8.2)
│       └── pdfjs/          → pdf.js 4.10.38 para las miniaturas
├── tests/                  → pruebas automáticas (ver tests/LEEME.md)
├── package.json            → solo para las pruebas; la página no necesita instalar nada
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

## Pruebas automáticas

Antes de publicar un cambio, `npm test` abre la página en un navegador y prueba cada herramienta (ver `tests/LEEME.md`). En GitHub se corren solas en cada pull request.

## Cómo publicarlo gratis

- **GitHub Pages:** sube la carpeta a un repositorio → *Settings → Pages* → rama `main`, carpeta raíz.
- **Netlify:** arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop).

## Notas técnicas

- Las miniaturas se cargan como módulo ES (`js/core/pdfjs-loader.mjs`). Al abrir `index.html` con doble clic el navegador bloquea los módulos, así que aparecen números en lugar de miniaturas; con un servidor local o publicada, se ven bien.
- Respeta `prefers-reduced-motion` y se puede usar entero con teclado.
- Exportar a Word, PNG o JPG usa pdf.js, así que (como las miniaturas) necesita abrir la app desde un servidor o publicada.
- Licencias: pdf.js (Apache 2.0, `js/vendor/pdfjs/LICENSE`), Archivo (SIL OFL, `fonts/OFL.txt`), Great Vibes, Dancing Script y Caveat (SIL OFL, `fonts/firma/`), pdf-lib (MIT), fflate (MIT, `js/vendor/fflate.LICENSE`).
