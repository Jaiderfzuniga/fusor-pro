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
├── css/
│   ├── tokens.css          → colores, tipografía, espacios (tinta por herramienta)
│   ├── base.css            → estilos base, iconos, foco, selección
│   ├── layout.css          → barra superior, área de trabajo, panel lateral, móvil
│   └── components.css      → botones, zona para soltar, listas, páginas, avisos
├── js/
│   ├── core/
│   │   ├── utils.js        → utilidades (rangos de páginas, nombres, tamaños)
│   │   ├── engine.js       → leer, unir y construir PDF; miniaturas
│   │   └── ui.js           → zona para soltar, avisos, animación de unión
│   ├── tools/
│   │   ├── merge.js        → Unir
│   │   ├── split.js        → Dividir
│   │   └── organize.js     → Organizar
│   ├── app.js              → pestañas y navegación por #hash
│   └── vendor/
│       └── pdf-lib.min.js  → librería para leer y crear PDF
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

## Notas técnicas

- [pdf-lib](https://pdf-lib.js.org/) está incluida en `js/vendor/`, así que unir, dividir y organizar funcionan sin conexión.
- Las miniaturas usan [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174 desde cdnjs. Sin internet la app sigue funcionando y muestra el número de página en lugar de la miniatura. Para tenerlas también sin conexión, descarga `pdf.min.js` y `pdf.worker.min.js` a `js/vendor/` y cambia las dos rutas (en `index.html` y en `js/core/engine.js`).
- Los PDF protegidos con contraseña se rechazan con un aviso claro.
- Respeta `prefers-reduced-motion` y se puede usar entero con teclado.
