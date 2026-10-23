/* Imágenes: abrir fotos (respetando la orientación de la cámara), girarlas,
   reducirlas y «sanearlas» para documentos. Volver a codificar en un lienzo
   también borra los metadatos (ubicación GPS, modelo del teléfono…). */
(function(F){
  "use strict";
  var MAX_BYTES = 40 * 1024 * 1024;
  var TYPES = /^image\/(png|jpeg|webp|gif|bmp)$/;
  var EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;

  function isImage(file){ return TYPES.test(file.type || '') || EXT.test(file.name || ''); }

  async function load(file){
    if(file.size > MAX_BYTES) throw new Error('Es demasiado grande (máximo 40 MB).');
    if(file.size === 0) throw new Error('El archivo está vacío.');
    try{ return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch(e){
      try{ return await createImageBitmap(file); }
      catch(e2){ throw new Error(/\.hei[cf]$/i.test(file.name) ? 'Las fotos HEIC no se pueden abrir aquí; compártela como JPG.' : 'No se pudo abrir la imagen.'); }
    }
  }

  // Dibuja la imagen girada (múltiplos de 90°), sin pasar de maxSide px por lado.
  function draw(src, rotate, maxSide, crop){
    var sw = crop ? crop.w : src.width, sh = crop ? crop.h : src.height;
    var s = maxSide ? Math.min(1, maxSide / Math.max(sw, sh)) : 1;
    var w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
    var quarter = rotate % 180 !== 0;
    var c = document.createElement('canvas');
    c.width = quarter ? h : w; c.height = quarter ? w : h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rotate * Math.PI / 180);
    if(crop) ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, -w / 2, -h / 2, w, h);
    else ctx.drawImage(src, -w / 2, -h / 2, w, h);
    return c;
  }

  function canvasBytes(canvas, type, quality){
    return new Promise(function(resolve, reject){
      canvas.toBlob(function(b){
        if(!b) return reject(new Error('No se pudo crear la imagen'));
        b.arrayBuffer().then(function(buf){ resolve(new Uint8Array(buf)); }, reject);
      }, type, quality);
    });
  }

  // JPG del lienzo. Con dpi, el archivo guarda su resolución: así una foto de
  // 3 × 4 cm se imprime a 3 × 4 cm (sin ella, Word o Windows suponen 72–96 ppp).
  async function jpegBytes(canvas, quality, dpi){
    var b = await canvasBytes(canvas, 'image/jpeg', quality || 0.86);
    return dpi ? jpegDpi(b, dpi) : b;
  }

  async function pngBytes(canvas, dpi){
    var b = await canvasBytes(canvas, 'image/png');
    return dpi ? pngDpi(b, dpi) : b;
  }

  // Densidad en el encabezado JFIF (unidades: puntos por pulgada).
  function jpegDpi(b, dpi){
    var hi = (dpi >> 8) & 255, lo = dpi & 255;
    if(b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46){
      b[13] = 1; b[14] = hi; b[15] = lo; b[16] = hi; b[17] = lo;
      return b;
    }
    var app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, hi, lo, hi, lo, 0, 0]);
    var out = new Uint8Array(b.length + app0.length);
    out.set(b.subarray(0, 2)); out.set(app0, 2); out.set(b.subarray(2), 2 + app0.length);
    return out;
  }

  // Bloque pHYs (puntos por metro) justo después de IHDR.
  function pngDpi(b, dpi){
    var ppm = Math.round(dpi / 0.0254);
    var chunk = new Uint8Array(21), v = new DataView(chunk.buffer);
    v.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // «pHYs»
    v.setUint32(8, ppm); v.setUint32(12, ppm); chunk[16] = 1;
    v.setUint32(17, crc32(chunk.subarray(4, 17)));
    var at = 8 + 25; // firma + IHDR
    var out = new Uint8Array(b.length + chunk.length);
    out.set(b.subarray(0, at)); out.set(chunk, at); out.set(b.subarray(at), at + chunk.length);
    return out;
  }

  var CRC = null;
  function crc32(bytes){
    if(!CRC){
      CRC = new Uint32Array(256);
      for(var n = 0; n < 256; n++){ var c = n; for(var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
    }
    var r = 0xffffffff;
    for(var i = 0; i < bytes.length; i++) r = CRC[(r ^ bytes[i]) & 255] ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
  }

  // Niveles automáticos: el 1 % más oscuro pasa a negro y el 1 % más claro a blanco.
  function levels(lum){
    var hist = new Uint32Array(256), n = lum.length;
    for(var i = 0; i < n; i++) hist[lum[i]]++;
    var lo = 0, hi = 255, acc = 0, cut = n * 0.01;
    for(lo = 0; lo < 255; lo++){ acc += hist[lo]; if(acc > cut) break; }
    acc = 0;
    for(hi = 255; hi > 0; hi--){ acc += hist[hi]; if(acc > cut) break; }
    if(hi - lo < 30){ lo = Math.max(0, lo - 15); hi = Math.min(255, hi + 15); }
    return { lo: lo, hi: hi };
  }

  // mode: 'color' (mejorado), 'gray' (escala de grises) o 'bw' (fotocopia en blanco y negro)
  function clean(canvas, mode){
    if(!mode || mode === 'none') return canvas;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
    var n = d.length / 4, lum = new Uint8Array(n);
    for(var i = 0, j = 0; i < d.length; i += 4, j++) lum[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    var L = levels(lum), span = Math.max(1, L.hi - L.lo);
    var lut = new Uint8ClampedArray(256);
    for(var v = 0; v < 256; v++){
      var t = Math.min(1, Math.max(0, (v - L.lo) / span));
      if(mode === 'bw'){
        // curva muy marcada: el papel queda blanco y la tinta negra, sin perder detalle fino
        t = t < 0.45 ? Math.pow(t / 0.45, 1.6) * 0.25 : t > 0.62 ? 1 : 0.25 + (t - 0.45) / 0.17 * 0.75;
      }
      lut[v] = Math.round(t * 255);
    }
    for(var k = 0, m = 0; k < d.length; k += 4, m++){
      if(mode === 'color'){
        d[k] = lut[d[k]]; d[k + 1] = lut[d[k + 1]]; d[k + 2] = lut[d[k + 2]];
      }else{
        var g = lut[lum[m]];
        d[k] = d[k + 1] = d[k + 2] = g;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  F.imaging = { isImage: isImage, load: load, draw: draw, jpegBytes: jpegBytes, pngBytes: pngBytes, clean: clean };
})(window.Fusor);
