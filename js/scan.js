/*
 * QR / print scan beacon. On /chat (and /chat?guide=..) and /partners, a visit that carries ?src=
 * (e.g. door hangers: ?src=FieldTest1) sends one anonymous scan event to /api/qr-lead (kind=scan-event).
 * The /?intent=book hand-off sends the same event from js/book.js before redirecting to booking.
 * The src is kept for the tab session so the guide can report follow-ups once each:
 * window.cjScanFollow('chat-start') and window.cjScanFollow('book-click') (called from js/guide.js).
 */
(function () {
  function beacon(page, src) {
    var body = JSON.stringify({ kind: 'scan-event', page: page, src: String(src).slice(0, 40) });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/qr-lead', new Blob([body], { type: 'text/plain' }))) return;
    fetch('/api/qr-lead', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {});
  }
  function once(page, src) {
    var key = 'cj_scan:' + page + ':' + src;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    beacon(page, src);
  }
  try {
    window.cjScanFollow = function (page) {
      try {
        if (page !== 'chat-start' && page !== 'book-click') return;
        var s = sessionStorage.getItem('cj_scan_src');
        if (s) once(page, s);
      } catch (e) {}
    };
    var src = new URLSearchParams(location.search).get('src');
    if (!src) return;
    try { sessionStorage.setItem('cj_scan_src', String(src).slice(0, 40)); } catch (e) {}
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    var page = /^\/chat/.test(path) ? 'chat' : path === '/partners' ? 'partners' : '';
    if (!page) return;
    once(page, src);
  } catch (e) {}
})();
