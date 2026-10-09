/*
 * QR / print scan beacon. On /chat (and /chat?guide=..) and /partners, a visit that carries ?src=
 * (e.g. door hangers: ?src=dh-t1) sends one anonymous scan event to /api/qr-lead (kind=scan-event).
 * The /?intent=book hand-off sends the same event from js/book.js before redirecting to booking.
 */
(function () {
  try {
    var src = new URLSearchParams(location.search).get('src');
    if (!src) return;
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    var page = /^\/chat/.test(path) ? 'chat' : path === '/partners' ? 'partners' : '';
    if (!page) return;
    var key = 'cj_scan:' + page + ':' + src;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    var body = JSON.stringify({ kind: 'scan-event', page: page, src: String(src).slice(0, 40) });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/qr-lead', new Blob([body], { type: 'text/plain' }))) return;
    fetch('/api/qr-lead', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {});
  } catch (e) {}
})();
