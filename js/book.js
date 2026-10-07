/*
 * Every Book / Book a visit control opens the Calm Joints guide pop-up:
 * disclaimer first, then Chat, Voice, or Book a video visit, plus a quick
 * triage email form. The booking page URL lives in config.js only
 * (CALM_JOINTS.booking.primaryUrl). /?intent=book&... goes straight to it.
 */
(function () {
  var cfg = window.CALM_JOINTS || {};
  var url = (cfg.booking && cfg.booking.primaryUrl) || '';
  if (!url) return;

  function trackBook() {
    try {
      var r = JSON.parse(localStorage.getItem('cj_ref') || 'null');
      if (r && r.slug && Date.now() - r.at < 30 * 864e5) {
        fetch('/api/qr-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: r.slug, event: 'book', email: r.email || '', src: 'home', c: r.c || '' }),
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // Booking hand-off used by the guide: /?intent=book&area=&province=&src=&venue=
  var qs = new URLSearchParams(location.search);
  if (qs.get('intent') === 'book' || location.hash === '#book') {
    trackBook();
    try { if (window.gtag) window.gtag('event', 'cj_book_handoff', { area: qs.get('area') || '', src: qs.get('src') || '', venue: qs.get('venue') || '' }); } catch (e) {}
    location.replace(url);
    return;
  }

  // Load the guide (styles + script) on every page that has this file.
  function loadGuide(cb) {
    if (window.CJGuide) { cb && cb(); return; }
    if (!document.querySelector('link[data-cjg]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/guide.css?v=5'; l.setAttribute('data-cjg', ''); document.head.appendChild(l);
    }
    // One-tap share helper (js/share.js), used inside the guide.
    if (!window.CJShare && !document.querySelector('script[data-cjs]')) {
      var sh = document.createElement('script'); sh.src = '/js/share.js?v=5'; sh.async = true; sh.setAttribute('data-cjs', ''); document.head.appendChild(sh);
    }
    var s = document.querySelector('script[data-cjg]');
    if (!s) {
      s = document.createElement('script'); s.src = '/js/guide.js?v=5'; s.async = true; s.setAttribute('data-cjg', '');
      s.addEventListener('error', function () { s.setAttribute('data-failed', '1'); });
      document.head.appendChild(s);
    }
    if (!cb) return;
    if (s.getAttribute && s.getAttribute('data-failed')) { trackBook(); window.open(url, '_blank', 'noopener'); return; }
    s.addEventListener('load', cb);
  }
  loadGuide();

  document.querySelectorAll('[data-book], a[href="/#book"], a[href="#book"]').forEach(function (el) {
    // Fallback if the guide can't load: the link still opens booking.
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) { trackBook(); return; }
      e.preventDefault();
      loadGuide(function () { if (window.CJGuide) window.CJGuide.open(); });
    });
  });
})();
