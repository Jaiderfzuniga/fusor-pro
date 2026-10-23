# Design

Mundo visual: **risografía**. Papel blanco frío, tinta negra azulada y tres tintas planas fluorescentes. Unir es literalmente sobreimprimir: las tintas se mezclan con `mix-blend-mode: multiply`.

## Color (css/tokens.css)

| Token | Valor | Uso |
|---|---|---|
| `--paper` | #f4f5f7 | fondo |
| `--sheet` | #ffffff | panel lateral, filas, hojas |
| `--ink` / `--ink-2` / `--ink-3` | #1c1f2b / #464b5e / #62677b | texto principal / secundario / terciario (todos AA sobre papel) |
| `--rule` / `--rule-strong` | #cfd3dc / #a9aebb | bordes |
| `--pink` | #ff48b0 | tinta de **Unir** |
| `--blue` | #3255a4 | tinta de **Dividir** |
| `--yellow` | #ffe800 | tinta de **Organizar** |
| `--violet` | #321871 | tinta de **Firmar** (rosa × azul) |
| `--orange` | #ff4800 | tinta de **Comprimir** |
| `--green` | #325500 | tinta de **Imágenes a PDF** |
| `--teal` | #00838a | tinta de **Ampliar documento** |
| `--page` | #ffffff | hoja de un documento: blanca también en modo oscuro |

**Modo oscuro:** sigue `prefers-color-scheme`. El papel pasa a tinta azul noche (`--paper` #14161f) y el texto se aclara; las tintas se suman con `screen` en vez de `multiply`, y las hojas de documento, el área de firma y las firmas guardadas siguen siendo blancas.
| `--danger` | #c8102e | errores y páginas quitadas |

`body[data-tool]` redefine `--tool`, `--tool-on` (texto sobre la tinta), `--tool-text` (tinta legible como texto) y `--tool-wash` (fondo suave). Las tintas solo se usan como relleno; para texto se usa `--tool-text`.

## Tipografía

Archivo (variable, con eje de ancho). Titulares en `font-stretch: 72%`, peso 850. Cuerpo en ancho normal, 15px. Numerales tabulares en todo el documento.

## Reglas

- Una tinta por herramienta: es la dueña de la pestaña activa, la acción principal y la selección.
- La selección es el único uso de la tinta dentro de la cuadrícula de páginas.
- Nada desaparece: quitar una página la marca como QUITADA y se puede recuperar hasta guardar.
- Iconos SVG propios, trazo 1.75, sin emoji.
- Titulares con dos tintas desregistradas debajo de la negra (`--ink-a` / `--ink-b`); al cambiar de herramienta llegan desplazadas y se asientan en registro.

## Movimiento (css/motion.css, js/core/motion.js)

Curva base `cubic-bezier(.16,1,.3,1)`. Cada animación explica un cambio de estado o es parte de la firma riso.

- **Firma (unir):** las hojas salen de la lista, llegan desregistradas al centro, tiemblan hasta quedar en registro y el pliego viaja al botón.
- **Pestañas:** la tinta se desliza a la pestaña activa; el panel entra con un escalonado corto (máx. 200 ms).
- **Listas y páginas:** reordenar usa FLIP; los elementos nuevos se imprimen con una barrida (`clip-path`); al quitar, salen hacia la derecha en 180 ms.
- **Estado:** los contadores cuentan hasta su valor, la selección hace pop, el sello QUITADA golpea, el botón ocupado muestra franjas en movimiento, las miniaturas aparecen como tinta que se asienta.
- **Movimiento reducido:** se quitan los desplazamientos y se mantienen fundidos y cambios de color que comunican estado.
- Escritorio: área de trabajo y panel lateral de 320px. A menos de 820px el panel pasa abajo y la acción principal queda fija abajo de la pantalla.
