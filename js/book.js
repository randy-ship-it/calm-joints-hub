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
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/guide.css?v=14'; l.setAttribute('data-cjg', ''); document.head.appendChild(l);
    }
    // One-tap share helper (js/share.js), used inside the guide.
    if (!window.CJShare && !document.querySelector('script[data-cjs]')) {
      var sh = document.createElement('script'); sh.src = '/js/share.js?v=8'; sh.async = true; sh.setAttribute('data-cjs', ''); document.head.appendChild(sh);
    }
    var s = document.querySelector('script[data-cjg]');
    if (!s) {
      s = document.createElement('script'); s.src = '/js/guide.js?v=19'; s.async = true; s.setAttribute('data-cjg', '');
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
      // "Book now" goes straight to booking; "Talk to Glen or Gwen" is its own button.
      if (e.metaKey || e.ctrlKey || e.shiftKey || (el.hasAttribute && el.hasAttribute('data-book-direct'))) { trackBook(); return; }
      e.preventDefault();
      loadGuide(function () { if (window.CJGuide) window.CJGuide.open(); });
    });
  });
})();

/* Call or text Glen: header, under the hero, and footer. Phones hide the header line with the other plain nav links. */
(function () {
  var TEL = 'tel:+16476926575', SMS = 'sms:+16476926575';
  function glenLine(extra) {
    var wrap = document.createElement('span');
    wrap.className = 'tg-line' + (extra ? ' ' + extra : '');
    wrap.setAttribute('data-text-glen', '');
    wrap.appendChild(document.createTextNode('Call or text Glen: '));
    var tel = document.createElement('a');
    tel.href = TEL;
    tel.textContent = '(647) 692-6575';
    wrap.appendChild(tel);
    var text = document.createElement('a');
    text.href = SMS;
    text.className = 'tg-sms';
    text.textContent = 'Text';
    wrap.appendChild(text);
    return wrap;
  }
  function run() {
    if (!document.querySelector || !document.getElementById || !document.head) return;
    if (document.querySelector('[data-text-glen]')) return;
    var st = document.createElement('style');
    // Header nav hides plain links on phones, so the hero and footer lines stay visible there.
    st.textContent = '.tg-line{font-weight:600;color:var(--green,#14803C)}.tg-line a{color:var(--green,#14803C);font-weight:700}.tg-sms{font-size:.8em;font-weight:600;margin-left:.4rem;text-decoration:underline}.tg-nav{white-space:nowrap}.tg-hero{margin:1rem 0 0;text-align:center}.tg-hero .tg-line{font-size:1.05rem}.tg-hero small{display:block;opacity:.75;font-size:.8rem;font-weight:400;margin-top:.2rem}footer [data-text-glen]{font-weight:600;color:var(--green,#14803C)}@media (max-width:760px){.nav-links .tg-nav{display:none}.tg-hero{display:block}footer [data-text-glen]{display:inline}}';
    document.head.appendChild(st);
    var nb = document.getElementById('nav-book');
    // Pages with the Talk button in the header/hero already offer text and call there.
    if (nb && nb.parentNode && !document.querySelector('.nav [data-talk]')) nb.parentNode.insertBefore(glenLine('tg-nav'), nb);
    var ctas = document.querySelector('.hero .ctas');
    if (ctas && !ctas.querySelector('[data-talk]')) {
      var p = document.createElement('p'); p.className = 'tg-hero'; p.appendChild(glenLine(''));
      var s = document.createElement('small'); s.textContent = 'Virtual guide, not a clinician · msg rates may apply.';
      p.appendChild(s); ctas.parentNode.insertBefore(p, ctas.nextSibling);
    }
    var mail = document.querySelector('footer nav a[href^="mailto:"]');
    if (mail) mail.parentNode.insertBefore(glenLine(''), mail);
  }
  if (document.readyState === 'loading' && document.addEventListener) document.addEventListener('DOMContentLoaded', run); else run();
})();
