/* Calm Joints partner kit: renders a co-branded QR sign on a canvas and
   downloads it as a print-ready PNG. Used on /partners. */
(function () {
  var WORD = '/media/calm-joints-wordmark.svg';
  var SIZES = {
    poster: { label: 'Poster 18 × 24 in', w: 2700, h: 3600, wide: false },
    tent: { label: 'Table tent 5 × 7 in', w: 1500, h: 2100, wide: false },
    sticker: { label: 'Sticker 4 × 5.5 in', w: 1200, h: 1650, wide: false },
    banner: { label: 'Banner 6 × 3 ft', w: 3600, h: 1800, wide: true },
  };
  function loadImg(src) {
    return new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = src; });
  }
  function drawQR(ctx, text, x, y, size) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), quiet = 3, cell = size / (n + quiet * 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#0B1D16';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c))
      ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  }
  function fitLogo(ctx, img, x, y, maxW, maxH) {
    var k = Math.min(maxW / img.width, maxH / img.height);
    var w = img.width * k, h = img.height * k;
    ctx.drawImage(img, x, y + (maxH - h) / 2, w, h);
    return w;
  }
  function logoRow(ctx, word, partner, x, y, rowH) {
    var ww = fitLogo(ctx, word, x, y, rowH * 3.66, rowH);
    if (!partner) return;
    ctx.fillStyle = '#9AA8A0'; ctx.font = '700 ' + Math.round(rowH * 0.6) + 'px "DM Sans", Arial';
    ctx.textBaseline = 'middle';
    var xx = x + ww + rowH * 0.35; ctx.fillText('×', xx, y + rowH / 2);
    fitLogo(ctx, partner, xx + rowH * 0.7, y, rowH * 3.2, rowH);
    ctx.textBaseline = 'alphabetic';
  }
  async function render(canvas, opts) {
    var s = SIZES[opts.size] || SIZES.poster;
    canvas.width = s.w; canvas.height = s.h;
    var ctx = canvas.getContext('2d');
    var word = await loadImg(WORD);
    var partner = opts.logo ? await loadImg(opts.logo).catch(function () { return null; }) : null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, s.w, s.h);
    var headline = opts.headline || 'Scan to see a physio';
    ctx.textBaseline = 'alphabetic';
    function fit(txt, weight, px, maxW) {
      ctx.font = weight + ' ' + Math.round(px) + 'px "DM Sans", Arial';
      while (ctx.measureText(txt).width > maxW && px > 10) { px *= 0.95; ctx.font = weight + ' ' + Math.round(px) + 'px "DM Sans", Arial'; }
    }
    if (!s.wide) {
      var pad = s.w * 0.08, rowH = s.w * 0.1, tw = s.w - pad * 2;
      logoRow(ctx, word, partner, pad, pad, rowH);
      var hPx = s.w * 0.075, subPx = s.w * 0.04, textH = hPx * 1.4 + subPx * 1.6 + subPx * 1.9;
      var qy = pad * 1.8 + rowH;
      var q = Math.min(tw, s.h - qy - textH - pad * 1.2);
      drawQR(ctx, opts.url, (s.w - q) / 2, qy, q);
      var y = qy + q + hPx * 1.35;
      ctx.fillStyle = '#0B1D16'; ctx.textAlign = 'center';
      fit(headline, '700', hPx, tw); ctx.fillText(headline, s.w / 2, y);
      y += subPx * 1.7;
      ctx.fillStyle = '#4B5E54'; fit('Video visits with a registered physiotherapist', '500', subPx, tw);
      ctx.fillText('Video visits with a registered physiotherapist', s.w / 2, y);
      ctx.fillStyle = '#15803D'; ctx.font = '700 ' + Math.round(subPx) + 'px "DM Sans", Arial';
      ctx.fillText('calmjoints.org', s.w / 2, s.h - pad * 0.8);
    } else {
      var p = s.h * 0.1, qs = s.h - p * 2, lw = s.w - qs - p * 3, rh = s.h * 0.12;
      logoRow(ctx, word, partner, p, p, rh);
      drawQR(ctx, opts.url, s.w - p - qs, p, qs);
      ctx.textAlign = 'left'; ctx.fillStyle = '#0B1D16';
      fit('Sore after the game?', '700', s.h * 0.11, lw);
      var big = ctx.font;
      ctx.fillText('Sore after the game?', p, s.h * 0.56);
      ctx.fillStyle = '#15803D'; fit(headline + '.', '700', parseFloat(big.split(' ')[1]), lw);
      ctx.fillText(headline + '.', p, s.h * 0.56 + s.h * 0.15);
      ctx.fillStyle = '#4B5E54'; fit('Registered physios by video · calmjoints.org', '500', s.h * 0.055, lw);
      ctx.fillText('Registered physios by video · calmjoints.org', p, s.h - p);
    }
    return canvas;
  }
  function download(canvas, name) {
    canvas.toBlob(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  }
  window.CJKit = { render: render, download: download, SIZES: SIZES };
})();
