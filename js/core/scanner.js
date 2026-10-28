/* Escáner con la cámara: video en vivo con un marco guía del tamaño del
   documento. En cada cuadro se busca el documento; cuando está dentro del marco,
   con su forma y quieto un momento, se toma la foto sola (también a mano).
   Nada sale del equipo: el video solo se ve en la página. */
(function(F){
  "use strict";
  var U = F.util, UI = F.ui, CR = F.cropper;
  var EVERY = 140;        // ms entre análisis
  var HOLD = 900;         // ms quieto antes de capturar
  var SMALL = 320;        // px del cuadro que se analiza

  var dlg, video, frame, found, status, ring, btnShot;
  var stream = null, timer = null, opts = null, prev = null, stillSince = 0, done = false;

  function $(s){ return dlg.querySelector(s); }

  function setup(){
    if(dlg) return;
    dlg = document.querySelector('[data-scanner]');
    if(!dlg) return;
    video = $('video'); frame = $('[data-scan-frame]'); found = $('[data-scan-found]');
    status = $('[data-scan-status]'); ring = $('[data-scan-ring]'); btnShot = $('[data-scan-shot]');
    $('[data-scan-close]').addEventListener('click', function(){ close(); });
    dlg.addEventListener('cancel', function(e){ e.preventDefault(); close(); });
    btnShot.addEventListener('click', function(){ capture(); });
    window.addEventListener('resize', function(){ if(dlg.open) layout(); });
  }

  function supported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  // opts: { aspect, title, onCapture(file), onFail() }
  async function open(o){
    setup();
    if(!dlg || !supported()){ if(o.onFail) o.onFail(); return; }
    opts = o; prev = null; stillSince = 0; done = false;
    $('[data-scan-title]').textContent = o.title || 'Escanear documento';
    say('Iniciando la cámara…');
    progress(0);
    found.hidden = true;
    if(typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    }catch(err){
      close();
      UI.toast(err && err.name === 'NotAllowedError'
        ? 'No se dio permiso para usar la cámara. Puedes tomar la foto de forma normal.'
        : 'No se encontró una cámara disponible. Puedes elegir una foto.', 'error');
      if(o.onFail) o.onFail();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(function(){});
    await new Promise(function(r){ if(video.videoWidth) r(); else video.addEventListener('loadedmetadata', r, { once: true }); });
    layout();
    say('Pon el documento dentro del recuadro, sobre una superficie de otro color.');
    timer = setInterval(tick, EVERY);
  }

  // El marco guía: la proporción del documento, lo más grande posible dentro del
  // video visible (con márgenes), en px de la pantalla.
  function view(){
    var r = video.getBoundingClientRect(), vw = video.videoWidth, vh = video.videoHeight;
    var s = Math.min(r.width / vw, r.height / vh); // object-fit: contain
    var w = vw * s, h = vh * s;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, scale: s };
  }

  function guide(){
    var v = view(), a = opts.aspect;
    var w = v.width * 0.86, h = w / a;
    if(h > v.height * 0.8){ h = v.height * 0.8; w = h * a; }
    return { x: (v.width - w) / 2, y: (v.height - h) / 2, w: w, h: h, v: v }; // relativo al video visible
  }

  function layout(){
    var g = guide(), host = dlg.querySelector('.scanner__stage').getBoundingClientRect();
    frame.style.setProperty('--fx', (g.v.left - host.left + g.x) + 'px');
    frame.style.setProperty('--fy', (g.v.top - host.top + g.y) + 'px');
    frame.style.setProperty('--fw', g.w + 'px');
    frame.style.setProperty('--fh', g.h + 'px');
  }

  function say(t){ status.textContent = t; }
  function progress(k){ ring.style.setProperty('--p', Math.max(0, Math.min(1, k))); }

  // Un análisis: ¿hay un documento con la forma pedida, dentro del marco, quieto?
  function tick(){
    if(!video.videoWidth || done) return;
    var vw = video.videoWidth, vh = video.videoHeight, k = SMALL / Math.max(vw, vh);
    var c = document.createElement('canvas');
    c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, c.width, c.height);
    var box = CR.detect(c);
    var g = guide(), gs = g.v.scale / k; // px de pantalla por px del cuadro analizado
    var gx = g.x / gs, gy = g.y / gs, gw = g.w / gs, gh = g.h / gs;

    var ok = false, hint;
    if(!box){
      hint = 'Pon el documento dentro del recuadro, sobre una superficie de otro color.';
    }else{
      var ratio = (box.w / box.h) / opts.aspect;
      var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      var centered = Math.abs(cx - (gx + gw / 2)) < gw * 0.18 && Math.abs(cy - (gy + gh / 2)) < gh * 0.22;
      if(ratio < 0.78 || ratio > 1.28) hint = opts.aspect >= 1 ? 'Gira el documento: debe quedar acostado.' : 'Gira el documento: debe quedar de pie.';
      else if(box.w < gw * 0.62) hint = 'Acércate un poco más.';
      else if(box.w > gw * 1.18) hint = 'Aléjate un poco.';
      else if(!centered) hint = 'Centra el documento en el recuadro.';
      else{ ok = true; hint = 'Mantén quieto…'; }
      showFound(box, c, ok);
    }
    if(!box) found.hidden = true;

    // quieto: la caja casi no cambia entre análisis seguidos
    var now = performance.now();
    if(ok && prev && Math.abs(box.x - prev.x) + Math.abs(box.y - prev.y) + Math.abs(box.w - prev.w) + Math.abs(box.h - prev.h) < c.width * 0.05){
      if(!stillSince) stillSince = now;
    }else{
      stillSince = ok ? now : 0;
    }
    prev = ok ? box : null;
    var held = stillSince ? now - stillSince : 0;
    progress(ok ? held / HOLD : 0);
    say(hint);
    if(ok && held >= HOLD) capture();
  }

  // recuadro sobre lo que se encontró (verde cuando está bien)
  function showFound(box, c, ok){
    var v = view(), host = dlg.querySelector('.scanner__stage').getBoundingClientRect();
    var s = v.width / c.width;
    found.hidden = false;
    found.classList.toggle('is-ok', ok);
    found.style.setProperty('--bx', (v.left - host.left + box.x * s) + 'px');
    found.style.setProperty('--by', (v.top - host.top + box.y * s) + 'px');
    found.style.setProperty('--bw', box.w * s + 'px');
    found.style.setProperty('--bh', box.h * s + 'px');
  }

  // Foto a resolución completa del cuadro actual.
  async function capture(){
    if(done || !video.videoWidth) return;
    done = true;
    clearInterval(timer); timer = null;
    say('¡Listo!');
    progress(1);
    dlg.classList.add('is-flash');
    var c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    var blob = await new Promise(function(r){ c.toBlob(r, 'image/jpeg', 0.92); });
    var cb = opts.onCapture;
    await U.sleep(U.reducedMotion() ? 0 : 260);
    close();
    if(blob && cb) cb(new File([blob], 'escaneo.jpg', { type: 'image/jpeg' }));
  }

  function close(){
    clearInterval(timer); timer = null;
    if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; }
    if(video) video.srcObject = null;
    if(dlg){
      dlg.classList.remove('is-flash');
      if(dlg.open && typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    }
  }

  F.scanner = { open: open, supported: supported };
})(window.Fusor);
