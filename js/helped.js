/*
 * Post-help share for the Calm Joints guide (/chat): "Glen helped? Pass him on 💚" with Send them Glen / Gwen.
 * Shown after ~4 exchanges in text chat, or when the visitor taps "This helped".
 * Builds a 1080x1350 share card on a canvas (guide avatar, a friendly line, the CJ logo).
 * About the AI guide only: no chat content, no booking push, no clinical outcome claims,
 * no physio testimonials. Shared links carry src=helped.
 */
(function () {
  'use strict';
  if (window.CJHelped) return;
  var URL_ = 'https://calmjoints.org/chat?src=helped';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function line(name) { return name + ' helped me make sense of my aches today \uD83D\uDC9A'; }
  function shareText(name) { return line(name) + ' Free 24/7 AI injury guide \u2192 ' + URL_; }
  function xHref(name) { return 'https://x.com/intent/post?text=' + encodeURIComponent(line(name) + ' Free 24/7 AI injury guide \u2192') + '&url=' + encodeURIComponent(URL_); }
  function track(ev) { try { if (window.gtag) window.gtag('event', 'cj_helped_' + ev, { page: location.pathname }); } catch (e) {} }

  function loadImg(src) {
    return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; });
  }
  function wrap(ctx, text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function pill(ctx, x, y, w, h, fill, stroke) {
    var r = h / 2; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // 1080x1350 portrait card (Instagram feed/Stories friendly, fine on X).
  function makeCard(g) {
    var W = 1080, H = 1350, F = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
    var av = String(g.avatar || '/media/cj-guide-glen.webp').replace(/\.webp$/, '.png');
    var fonts = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('800 64px "DM Sans"'), document.fonts.load('600 40px "DM Sans"')]).catch(function () {}) : Promise.resolve();
    return Promise.all([loadImg(av), loadImg('/media/apple-touch-icon.png'), fonts]).then(function (r) {
      var avatar = r[0], mark = r[1];
      var c = document.createElement('canvas'); c.width = W; c.height = H; var ctx = c.getContext('2d');
      var bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#F2FCF6'); bg.addColorStop(.6, '#DDF7E7'); bg.addColorStop(1, '#C8F1D7');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // logo
      if (mark) ctx.drawImage(mark, 84, 78, 92, 92);
      ctx.fillStyle = '#0B1D16'; ctx.font = '700 52px ' + F; ctx.textBaseline = 'middle'; ctx.fillText('Calm Joints', mark ? 196 : 84, 125);
      // avatar
      var cx = W / 2, cy = 470, R = 230;
      ctx.save(); ctx.shadowColor = 'rgba(4,36,20,.28)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
      ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#E3F9EA'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      if (avatar) ctx.drawImage(avatar, cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
      // name pill
      ctx.font = '700 36px ' + F; var tag = (g.name || 'Glen') + ' \u00B7 AI injury guide'; var tw = ctx.measureText(tag).width + 64;
      pill(ctx, cx - tw / 2, cy + R - 10, tw, 66, '#fff', '#B7E4C7'); ctx.fillStyle = '#0A3D22'; ctx.textAlign = 'center'; ctx.fillText(tag, cx, cy + R + 23);
      // main line
      ctx.font = '800 66px ' + F; ctx.fillStyle = '#0B1D16';
      var lines = wrap(ctx, line(g.name || 'Glen'), 880), y = 860;
      lines.forEach(function (l) { ctx.fillText(l, cx, y); y += 80; });
      ctx.font = '600 44px ' + F; ctx.fillStyle = '#15803D'; ctx.fillText('Free 24/7 AI injury guide', cx, y + 28);
      // url pill
      ctx.font = '800 46px ' + F; var u = 'calmjoints.org/chat', uw = ctx.measureText(u).width + 90;
      pill(ctx, cx - uw / 2, H - 230, uw, 92, '#15803D'); ctx.fillStyle = '#fff'; ctx.fillText(u, cx, H - 184);
      ctx.font = '500 28px ' + F; ctx.fillStyle = '#4B5E54'; ctx.fillText('AI guide, not a physio. General info, not medical advice.', cx, H - 82);
      return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/png'); });
    });
  }
  // Leads with "Send them Glen / Send them Gwen" (js/share.js: guide-specific link + preview), then an optional image card.
  function html(g) {
    var n = esc(g.name || 'Glen'), him = (String(g.key || '').toLowerCase() === 'gwen' || g.name === 'Gwen') ? 'her' : 'him';
    var pick = window.CJShare ? window.CJShare.html({ placement: 'helped', lead: false, first: g.key, textGuide: false }) : '';
    return '<div class="cjh" data-cjh><p class="cjh-t"><b>' + n + ' helped? Pass ' + him + ' on \uD83D\uDC9A</b><span>Send a friend your AI recovery concierge. Nothing from your chat is shared.</span></p>' + pick +
      '<details class="cjh-more"' + (pick ? '' : ' open') + '><summary>Or share an image card</summary>' +
      '<div class="cjh-prev"><img data-cjh-img alt="Share card: ' + esc(line(g.name || 'Glen')) + ' Free 24/7 AI injury guide, calmjoints.org/chat" width="216" height="270"></div>' +
      '<div class="cjh-row"><button type="button" class="cjh-btn pri" data-cjh-share>Share</button>' +
      '<a class="cjh-btn" data-cjh-x href="' + esc(xHref(g.name || 'Glen')) + '" target="_blank" rel="noopener">Post on X</a>' +
      '<a class="cjh-btn" data-cjh-save href="#" download="calm-joints-' + esc(String(g.key || g.name || 'guide').toLowerCase()) + '.png">Save image</a></div></details></div>';
  }
  function bind(root, g) {
    var box = root.querySelector('[data-cjh]'); if (!box || box.__cjh) return; box.__cjh = true;
    if (window.CJShare) box.querySelectorAll('[data-cjs]').forEach(function (el) { window.CJShare.bind(el); });
    var name = g.name || 'Glen', file = null, blobUrl = null;
    var ready = makeCard(g).then(function (blob) {
      if (!blob) return;
      blobUrl = URL.createObjectURL(blob);
      box.querySelector('[data-cjh-img]').src = blobUrl;
      box.querySelector('[data-cjh-save]').href = blobUrl;
      try { file = new File([blob], 'calm-joints-' + String(g.key || name).toLowerCase() + '.png', { type: 'image/png' }); } catch (e) { file = null; }
    });
    box.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cjh-share],[data-cjh-x],[data-cjh-save]'); if (!t) return;
      if (t.hasAttribute('data-cjh-x')) { track('x'); return; }
      if (t.hasAttribute('data-cjh-save')) { if (!blobUrl) e.preventDefault(); track('save'); return; }
      e.preventDefault(); track('share');
      ready.then(function () {
        var text = shareText(name);
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: text });
        if (navigator.share) return navigator.share({ text: text });
        window.open(xHref(name), '_blank', 'noopener');
      }).catch(function () {});
    });
  }
  window.CJHelped = { url: URL_, line: line, shareText: shareText, xHref: xHref, makeCard: makeCard, html: html, bind: bind };
})();
