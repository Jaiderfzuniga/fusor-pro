/* Carga pdf.js (módulo ES, incluido en el proyecto) y lo expone a los scripts
   clásicos. Si falla (por ejemplo, al abrir con doble clic), la app sigue
   funcionando sin miniaturas. */
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event('fusor:pdfjs-ready'));
