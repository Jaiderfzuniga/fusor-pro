/* Utilidades compartidas. Todo cuelga de window.Fusor para funcionar
   sin módulos ES (así la app también abre con doble clic). */
window.Fusor = window.Fusor || {};

(function(F){
  "use strict";

  function fmtBytes(b){
    if(b < 1024) return b + ' B';
    if(b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  function uid(){ return 'f' + Math.random().toString(36).slice(2, 10); }

  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }

  function isPdf(file){
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  function baseName(name){ return name.replace(/\.pdf$/i, ''); }

  // Deja un nombre de archivo válido; si queda vacío usa el de respaldo.
  function cleanName(value, fallback){
    var v = String(value || '').trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
    return v || fallback;
  }

  // "1-3, 5, 8-" -> índices base 0 ordenados y sin repetir.
  function parseRanges(text, max){
    var src = String(text || '').trim();
    if(!src) return { pages: [] };
    var set = {};
    var parts = src.split(/[,;\s]+/).filter(Boolean);
    for(var i = 0; i < parts.length; i++){
      var m = parts[i].match(/^(\d+)?\s*-\s*(\d+)?$|^(\d+)$/);
      if(!m) return { error: '“' + parts[i] + '” no es un número ni un rango.' };
      var a, b;
      if(m[3]){ a = b = +m[3]; }
      else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
      if(a < 1 || b < 1) return { error: 'Las páginas empiezan en 1.' };
      if(a > max || b > max) return { error: 'El documento solo tiene ' + plural(max, 'página', 'páginas') + '.' };
      if(a > b){ var t = a; a = b; b = t; }
      for(var p = a; p <= b; p++) set[p - 1] = true;
    }
    return { pages: Object.keys(set).map(Number).sort(function(x, y){ return x - y; }) };
  }

  // [0,1,2,4] -> "1-3, 5"
  function formatRanges(indices){
    var out = [], start = null, prev = null;
    indices.forEach(function(i){
      if(start === null){ start = prev = i; return; }
      if(i === prev + 1){ prev = i; return; }
      out.push(start === prev ? String(start + 1) : (start + 1) + '-' + (prev + 1));
      start = prev = i;
    });
    if(start !== null) out.push(start === prev ? String(start + 1) : (start + 1) + '-' + (prev + 1));
    return out.join(', ');
  }

  function pdfBlob(bytes){ return new Blob([bytes], { type: 'application/pdf' }); }

  function saveBlob(blob, name){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    return url;
  }

  function move(arr, from, to){
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  function reducedMotion(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function icon(name){
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  F.util = {
    fmtBytes: fmtBytes, uid: uid, plural: plural, isPdf: isPdf, baseName: baseName,
    cleanName: cleanName, parseRanges: parseRanges, formatRanges: formatRanges,
    pdfBlob: pdfBlob, saveBlob: saveBlob, move: move, sleep: sleep,
    reducedMotion: reducedMotion, icon: icon, escapeHtml: escapeHtml
  };
})(window.Fusor);
