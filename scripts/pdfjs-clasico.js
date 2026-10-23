// Convierte pdf.js (build «legacy», módulos ES .mjs) en scripts clásicos .js.
// Así FUSOR funciona también al abrir index.html con doble clic (file://):
// Chrome bloquea los módulos ES y los workers desde archivos locales, pero no
// los scripts clásicos.
//
// Uso: node scripts/pdfjs-clasico.js <carpeta con pdf.min.mjs y pdf.worker.min.mjs>
//      (por ejemplo node_modules/pdfjs-dist/legacy/build)
const fs = require('fs');
const path = require('path');

const origen = process.argv[2];
if(!origen){ console.error('Indica la carpeta de pdfjs-dist/legacy/build'); process.exit(1); }
const destino = path.join(__dirname, '..', 'js', 'vendor', 'pdfjs');

// La lista final «export{a as B,…}» pasa a ser un objeto { B: a, … }.
function exportsAObjeto(codigo, archivo){
  const m = codigo.match(/export\{([^}]*)\};?\s*$/);
  if(!m) throw new Error(archivo + ': no se encontró la lista de exportaciones');
  const pares = m[1].split(',').map(function(p){
    const [local, nombre] = p.trim().split(/\s+as\s+/);
    return (nombre || local) + ':' + local;
  });
  return { cuerpo: codigo.slice(0, m.index), objeto: '{' + pares.join(',') + '}' };
}

function convertir(entrada, salida, asignar){
  let codigo = fs.readFileSync(path.join(origen, entrada), 'utf8');
  // import.meta solo se usa en las ramas de Node.js, nunca en el navegador
  codigo = codigo.replace(/import\.meta\.url/g, '""');
  const { cuerpo, objeto } = exportsAObjeto(codigo, entrada);
  // dentro de una función para no dejar variables globales sueltas
  const final = '/* Generado por scripts/pdfjs-clasico.js a partir de ' + entrada + '. No editar a mano. */\n' +
    '(function(){\n' + cuerpo + '\n' + asignar + '=' + objeto + ';\n})();\n';
  fs.writeFileSync(path.join(destino, salida), final);
  console.log(salida, Math.round(final.length / 1024) + ' KB');
}

convertir('pdf.min.mjs', 'pdf.min.js', 'globalThis.pdfjsLib');
// Como worker real se inicia solo; como script de la página deja el motor en
// globalThis.pdfjsWorker para que pdf.js trabaje sin worker (file://).
convertir('pdf.worker.min.mjs', 'pdf.worker.min.js', 'globalThis.pdfjsWorker');
