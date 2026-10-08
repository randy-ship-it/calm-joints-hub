/* Personal Calm Joints poster: PNG (canvas), SVG and a print PDF.
   White page, big QR, wordmark, slogan, one hook line. No place names. */
(function () {
  var SIZES = {
    letter: { label: 'Letter', w: 1275, h: 1650, pageW: 612, pageH: 792 },
    poster: { label: '18 × 24 in', w: 2700, h: 3600, pageW: 1296, pageH: 1728 },
  };
  function qrOf(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q;
  }
  function xml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function loadImg(src) {
    return new Promise(function (ok, bad) {
      var i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = bad;
      i.src = src;
    });
  }
  function drawQR(ctx, q, x, y, size) {
    var n = q.getModuleCount(), quiet = 4, cell = size / (n + quiet * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#0B1D16';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c))
      ctx.fillRect(Math.round(x + (c + quiet) * cell), Math.round(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  }
  function fit(ctx, text, weight, px, maxW) {
    var size = px;
    ctx.font = weight + ' ' + Math.round(size) + 'px "DM Sans", Arial, sans-serif';
    while (ctx.measureText(text).width > maxW && size > 18) {
      size *= 0.94;
      ctx.font = weight + ' ' + Math.round(size) + 'px "DM Sans", Arial, sans-serif';
    }
    return size;
  }
  async function draw(canvas, opts) {
    var s = SIZES[opts.size] || SIZES.poster;
    canvas.width = s.w;
    canvas.height = s.h;
    var ctx = canvas.getContext('2d');
    var word = await loadImg('/media/calm-joints-wordmark.svg');
    var q = qrOf(opts.url);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s.w, s.h);
    var pad = s.w * 0.08;
    var rowH = s.w * 0.09;
    var k = Math.min((s.w - pad * 2) / word.width, rowH / word.height);
    var ww = word.width * k, wh = word.height * k;
    ctx.drawImage(word, (s.w - ww) / 2, pad, ww, wh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#15803D';
    ctx.font = '600 ' + Math.round(s.w * 0.028) + 'px "DM Sans", Arial, sans-serif';
    ctx.fillText('In the moment recovery care', s.w / 2, pad + wh + s.w * 0.045);
    var hook = 'Hurt? Talk to Glen, 24/7';
    var hookPx = fit(ctx, hook, '700', s.w * 0.072, s.w - pad * 2);
    var hookY = pad + wh + s.w * 0.12;
    ctx.fillStyle = '#0B1D16';
    ctx.fillText(hook, s.w / 2, hookY);
    var name = (opts.name || '').trim();
    var nameLine = name ? 'Shared by ' + name : '';
    var bottomBlock = s.h * 0.16;
    var qTop = hookY + hookPx * 0.45;
    var qSize = Math.min(s.w - pad * 2, s.h - qTop - bottomBlock);
    drawQR(ctx, q, (s.w - qSize) / 2, qTop, qSize);
    var y = qTop + qSize + s.w * 0.06;
    if (nameLine) {
      ctx.fillStyle = '#0B1D16';
      fit(ctx, nameLine, '600', s.w * 0.038, s.w - pad * 2);
      ctx.fillText(nameLine, s.w / 2, y);
      y += s.w * 0.045;
    }
    ctx.fillStyle = '#15803D';
    ctx.font = '700 ' + Math.round(s.w * 0.032) + 'px "DM Sans", Arial, sans-serif';
    ctx.fillText('calmjoints.org', s.w / 2, y);
    ctx.fillStyle = '#4B5E54';
    ctx.font = '500 ' + Math.round(s.w * 0.02) + 'px "DM Sans", Arial, sans-serif';
    ctx.fillText('calmjoints.org/report', s.w / 2, s.h - pad * 0.55);
    return canvas;
  }
  function svg(opts) {
    var s = SIZES[opts.size] || SIZES.poster;
    var q = qrOf(opts.url);
    var n = q.getModuleCount(), quiet = 4;
    var pad = s.w * 0.08;
    var qSize = s.w * 0.72;
    var qx = (s.w - qSize) / 2, qy = s.h * 0.30;
    var cell = qSize / (n + quiet * 2);
    var rects = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c))
      rects += '<rect x="' + (qx + (c + quiet) * cell).toFixed(2) + '" y="' + (qy + (r + quiet) * cell).toFixed(2) + '" width="' + (cell + 0.4).toFixed(2) + '" height="' + (cell + 0.4).toFixed(2) + '" fill="#0B1D16"/>';
    var name = (opts.name || '').trim();
    var nameSvg = name ? '<text x="50%" y="' + (qy + qSize + s.w * 0.07).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.038) + '" fill="#0B1D16">Shared by ' + xml(name) + '</text>' : '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + s.w + '" height="' + s.h + '" viewBox="0 0 ' + s.w + ' ' + s.h + '">'
      + '<rect width="100%" height="100%" fill="#ffffff"/>'
      + '<text x="50%" y="' + (pad + s.w * 0.06).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.055) + '" font-weight="700" fill="#0B1D16">Calm Joints</text>'
      + '<text x="50%" y="' + (pad + s.w * 0.1).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.026) + '" fill="#15803D">In the moment recovery care</text>'
      + '<text x="50%" y="' + (s.h * 0.24).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.064) + '" font-weight="700" fill="#0B1D16">Hurt? Talk to Glen, 24/7</text>'
      + '<rect x="' + qx.toFixed(2) + '" y="' + qy.toFixed(2) + '" width="' + qSize.toFixed(2) + '" height="' + qSize.toFixed(2) + '" fill="#ffffff"/>'
      + rects
      + nameSvg
      + '<text x="50%" y="' + (qy + qSize + s.w * (name ? 0.12 : 0.07)).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.032) + '" font-weight="700" fill="#15803D">calmjoints.org</text>'
      + '<text x="50%" y="' + (s.h - pad * 0.5).toFixed(0) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + Math.round(s.w * 0.02) + '" fill="#4B5E54">calmjoints.org/report</text>'
      + '</svg>\n';
  }
  function pdfFromJpeg(jpeg, pageW, pageH, imgW, imgH) {
    var stream = 'q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im Do\nQ\n';
    var content = new TextEncoder().encode(stream);
    function obj(body) { parts.push(body); }
    var parts = [];
    var header = '%PDF-1.4\n';
    var chunks = [new TextEncoder().encode(header)];
    var offsets = [0];
    function pushObj(n, bytes) {
      offsets[n] = chunks.reduce(function (a, c) { return a + c.length; }, 0);
      chunks.push(bytes);
    }
    function ascii(s) { return new TextEncoder().encode(s); }
    pushObj(1, ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
    pushObj(2, ascii('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n'));
    pushObj(3, ascii('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>\nendobj\n'));
    pushObj(4, ascii('4 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + stream + 'endstream\nendobj\n'));
    var imgHead = ascii('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    var imgTail = ascii('\nendstream\nendobj\n');
    offsets[5] = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    chunks.push(imgHead, jpeg, imgTail);
    var startxref = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF\n';
    chunks.push(ascii(xref));
    var total = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(total);
    var o = 0;
    chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  async function files(opts) {
    var canvas = document.createElement('canvas');
    await draw(canvas, opts);
    var png = await new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); });
    var jpg = await new Promise(function (ok) { canvas.toBlob(function (b) { b.arrayBuffer().then(ok); }, 'image/jpeg', 0.92); });
    var spec = SIZES[opts.size] || SIZES.poster;
    var pdf = pdfFromJpeg(new Uint8Array(jpg), spec.pageW, spec.pageH, canvas.width, canvas.height);
    var svgText = svg(opts);
    return { png: png, svg: new Blob([svgText], { type: 'image/svg+xml' }), pdf: new Blob([pdf], { type: 'application/pdf' }), svgText: svgText };
  }
  window.CJPoster = { SIZES: SIZES, draw: draw, svg: svg, pdfFromJpeg: pdfFromJpeg, files: files, download: download };
})();
