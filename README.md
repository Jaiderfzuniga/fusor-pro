# FUSOR — Unir, dividir y organizar PDF

Herramienta web para trabajar con PDF directamente en el navegador. Ningún archivo se sube a un servidor.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| **Unir** | Junta varios PDF en uno. Reordena arrastrando o con las flechas, ordena por nombre y elige el nombre final. |
| **Dividir** | Extrae páginas por selección o por rangos (`1-3, 5, 8-`), crea un PDF por página o corta el documento cada N páginas. |
| **Organizar** | Miniaturas de cada página para reordenar, girar o quitar páginas. Las páginas quitadas quedan marcadas y se pueden recuperar hasta guardar. |

Cada herramienta tiene su propia URL: `#unir`, `#dividir`, `#organizar`.

## Estructura del proyecto

```
fusor-pro/
├── index.html              → estructura de la página y las tres herramientas
├── fonts/                  → tipografía Archivo (local)
├── css/
│   ├── fonts.css           → carga de la tipografía local
│   ├── tokens.css          → colores, tipografía, espacios (tinta por herramienta)
│   ├── base.css            → estilos base, iconos, foco, selección
│   ├── layout.css          → barra superior, área de trabajo, panel lateral, móvil
│   └── components.css      → botones, zona para soltar, listas, páginas, avisos
├── js/
│   ├── core/
│   │   ├── utils.js        → utilidades (rangos de páginas, nombres, tamaños)
│   │   ├── engine.js       → leer, validar, unir y construir PDF; miniaturas
│   │   ├── pdfjs-loader.mjs → carga pdf.js (módulo ES)
│   │   ├── motion.js       → animaciones
│   │   └── ui.js           → zona para soltar, avisos, animación de unión
│   ├── tools/
│   │   ├── merge.js        → Unir
│   │   ├── split.js        → Dividir
│   │   └── organize.js     → Organizar
│   ├── app.js              → pestañas y navegación por #hash
│   └── vendor/
│       ├── pdf-lib.min.js  → librería para leer y crear PDF
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

- **Sin dependencias externas:** pdf-lib, [pdf.js](https://mozilla.github.io/pdf.js/) 4.10.38 (`js/vendor/pdfjs/`) y la tipografía Archivo (`fonts/`) están dentro del proyecto. La página no carga nada de otros servidores.
- **Política CSP** en `index.html`: solo se ejecuta código del propio sitio; sin scripts ni estilos en línea, sin `eval` y sin conexiones a otros dominios.
- **pdf.js endurecido:** versión corregida contra CVE-2024-4367, con `isEvalSupported: false` y sin XFA.
- **Validación de archivos:** se rechazan los que no empiezan como PDF (`%PDF-`), los vacíos, los de más de 200 MB y los protegidos con contraseña.
- **Sin referrer:** al salir de la página no se envía la dirección de origen.

Si agregas código, no uses atributos `style="…"` ni `<script>` en línea: la CSP los bloquea. Usa clases CSS o `element.style.setProperty()`.

## Notas técnicas

- Las miniaturas se cargan como módulo ES (`js/core/pdfjs-loader.mjs`). Al abrir `index.html` con doble clic el navegador bloquea los módulos, así que aparecen números en lugar de miniaturas; con un servidor local o publicada, se ven bien.
- Respeta `prefers-reduced-motion` y se puede usar entero con teclado.
- Licencias: pdf.js (Apache 2.0, `js/vendor/pdfjs/LICENSE`), Archivo (SIL OFL, `fonts/OFL.txt`), pdf-lib (MIT).
