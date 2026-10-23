# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Público general: estudiantes, personas de oficina y cualquiera que necesita resolver una tarea rápida con PDF (juntar, separar o reordenar páginas) sin instalar programas ni crear cuentas. Llegan con un objetivo concreto, lo cumplen y se van.

## Product Purpose

FUSOR es una herramienta web para trabajar con PDF directamente en el navegador. El éxito es que la persona termine su tarea en menos de un minuto y descargue el resultado sin dudas.

## Positioning

Todo el procesamiento ocurre localmente en el navegador: ningún archivo se sube a un servidor. Esto es verificable (no hay backend) y es la diferencia frente a herramientas en línea que suben los documentos.

## Capabilities and Constraints

- Herramientas: **Unir** varios PDF, **Dividir / extraer** páginas (por rangos o una por archivo), **Organizar** páginas (miniaturas, reordenar, rotar, eliminar), **Firmar** documentos (PDF, Word, imágenes o texto; crear, guardar y arrastrar firmas; rellenar formularios; sellos e iniciales; descargar en PDF, Word, PNG o JPG), **Comprimir** PDF, **Imágenes a PDF** y **Ampliar documento** (cédula o pasaporte al 100/150/200 % en una hoja).
- HTML, CSS y JS puros, sin build step ni backend. Publicable en GitHub Pages o Netlify.
- pdf-lib y fflate incluidos localmente en `js/vendor/` para manipular PDF, leer Word y crear .zip/.docx.
- Interfaz en español.

## Brand Commitments

- Nombre: FUSOR.
- Mensaje de privacidad ("tus archivos nunca salen de tu equipo") se mantiene.

## Evidence on Hand

No hay testimonios, métricas ni usuarios reales. No inventarlos.

## Product Principles

1. La tarea primero: cada herramienta se entiende y se completa sin instrucciones.
2. Privacidad demostrable: nada se sube, y la interfaz lo dice sin exagerar.
3. Sin fricción: sin cuentas, sin anuncios, sin pasos innecesarios.
4. Errores claros: si un PDF está dañado o protegido, se explica qué pasó.

## Accessibility & Inclusion

Todo debe funcionar con teclado (incluido reordenar), contraste AA y respeto a `prefers-reduced-motion`.
