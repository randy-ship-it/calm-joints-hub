/*
 * Every Book / Book a visit control uses CALM_JOINTS.booking.primaryUrl.
 * Change the URL in config.js only.
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

  document.querySelectorAll('[data-book], a[href="/#book"], a[href="#book"]').forEach(function (el) {
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.addEventListener('click', trackBook);
  });

  // Old Book links landed on /#book and opened the partner popup. Send those straight to Jane.
  if (location.hash === '#book') {
    trackBook();
    location.replace(url);
  }
})();
