// Servidor estático mínimo para las pruebas (sin dependencias).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.argv[2] || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'
};

http.createServer(function(req, res){
  var url = decodeURIComponent(req.url.split('?')[0]);
  var file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if(!file.startsWith(ROOT + path.sep) && file !== ROOT){ res.writeHead(403); return res.end(); }
  fs.readFile(file, function(err, data){
    if(err){ res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', function(){ console.log('FUSOR en http://127.0.0.1:' + PORT); });
