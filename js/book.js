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
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/guide.css?v=8'; l.setAttribute('data-cjg', ''); document.head.appendChild(l);
    }
    // One-tap share helper (js/share.js), used inside the guide.
    if (!window.CJShare && !document.querySelector('script[data-cjs]')) {
      var sh = document.createElement('script'); sh.src = '/js/share.js?v=6'; sh.async = true; sh.setAttribute('data-cjs', ''); document.head.appendChild(sh);
    }
    var s = document.querySelector('script[data-cjg]');
    if (!s) {
      s = document.createElement('script'); s.src = '/js/guide.js?v=10'; s.async = true; s.setAttribute('data-cjg', '');
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

/* Text Glen: visible SMS line in header, hero CTA and footer (Glen is SMS-only). */
(function () {
  var HREF = 'sms:+16476926575', TXT = 'Text Glen: (647) 692-6575';
  function link(cls) { var a = document.createElement('a'); a.href = HREF; a.textContent = TXT; a.className = cls; a.setAttribute('data-text-glen', ''); return a; }
  function run() {
    if (!document.querySelector || !document.getElementById || !document.head) return;
    if (document.querySelector('[data-text-glen]')) return;
    var st = document.createElement('style');
    // Header nav hides plain links on phones, so the hero and footer lines stay visible there.
    st.textContent = '.tg-nav{font-weight:600;color:var(--green,#14803C);white-space:nowrap}.tg-hero{margin:1rem 0 0;text-align:center}.tg-hero a{font-weight:700;color:var(--green,#14803C);font-size:1.05rem}.tg-hero small{display:block;opacity:.75;font-size:.8rem;margin-top:.2rem}footer [data-text-glen]{font-weight:600;color:var(--green,#14803C)}@media (max-width:760px){.nav-links a.tg-nav{display:none}.tg-hero{display:block}footer [data-text-glen]{display:inline}}';
    document.head.appendChild(st);
    var nb = document.getElementById('nav-book');
    if (nb && nb.parentNode) nb.parentNode.insertBefore(link('tg-nav'), nb);
    var ctas = document.querySelector('.hero .ctas');
    if (ctas) {
      var p = document.createElement('p'); p.className = 'tg-hero'; p.appendChild(link(''));
      var s = document.createElement('small'); s.textContent = 'Glen is Calm Joints’ AI guide, not a physio. Text only. Msg & data rates may apply.';
      p.appendChild(s); ctas.parentNode.insertBefore(p, ctas.nextSibling);
    }
    var mail = document.querySelector('footer nav a[href^="mailto:"]');
    if (mail) mail.parentNode.insertBefore(link(''), mail);
  }
  if (document.readyState === 'loading' && document.addEventListener) document.addEventListener('DOMContentLoaded', run); else run();
})();
