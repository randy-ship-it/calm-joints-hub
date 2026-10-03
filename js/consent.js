/*
 * Calm Joints: cookie consent + consent-gated analytics.
 * PIPEDA / CASL / Quebec Law 25 friendly: nothing optional loads until the
 * visitor says yes. The choice lives in a first-party cookie for 180 days.
 *
 *   cj_consent = v1.a<0|1>.m<0|1>.<unix seconds>
 *     a = analytics (Vercel Web Analytics + Speed Insights, and GA4 once an ID is set)
 *     m = marketing (Meta pixel once an ID is set)
 *
 * ── ANALYTICS IDS: ADD LATER ────────────────────────────────────────────────
 * No GA4 or Meta pixel IDs existed in the repo or the Vercel env (Oct 2026).
 * When Randy has real ones, set them here (or in config.js under
 * window.CALM_JOINTS.analytics). Empty strings mean "don't load".
 * Never invent or paste a placeholder ID.
 */
(function () {
  var CFG = {
    vercelAnalytics: true,   // cookieless; still waits for an analytics yes
    speedInsights: true,     // cookieless; still waits for an analytics yes
    ga4Id: '',               // GA4 placeholder, e.g. 'G-XXXXXXXXXX' (add the real ID later)
    metaPixelId: '',         // Meta pixel placeholder, digits only (add the real ID later)
  };
  var ext = (window.CALM_JOINTS && window.CALM_JOINTS.analytics) || {};
  for (var k in ext) if (Object.prototype.hasOwnProperty.call(ext, k)) CFG[k] = ext[k];

  var NAME = 'cj_consent', MAX_AGE = 180 * 24 * 3600, listeners = [], loaded = {};

  function read() {
    var m = document.cookie.match(/(?:^|;\s*)cj_consent=([^;]+)/);
    if (!m) return null;
    var p = decodeURIComponent(m[1]).split('.');
    if (p[0] !== 'v1' || p.length < 4) return null;
    return { analytics: p[1] === 'a1', marketing: p[2] === 'm1', at: +p[3] || 0 };
  }
  function write(c) {
    var v = 'v1.a' + (c.analytics ? 1 : 0) + '.m' + (c.marketing ? 1 : 0) + '.' + Math.floor(Date.now() / 1000);
    document.cookie = NAME + '=' + v + '; Max-Age=' + MAX_AGE + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }
  function addScript(src, attrs) {
    var s = document.createElement('script'); s.src = src; s.defer = true;
    if (attrs) for (var a in attrs) s.setAttribute(a, attrs[a]);
    document.head.appendChild(s); return s;
  }

  // Loaders run only after a yes. Each loads at most once per page view.
  function loadAnalytics() {
    if (loaded.analytics) return; loaded.analytics = true;
    if (CFG.vercelAnalytics) {
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
      addScript('/_vercel/insights/script.js', { 'data-cj': 'vercel-analytics' });
    }
    if (CFG.speedInsights) {
      window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
      addScript('/_vercel/speed-insights/script.js', { 'data-cj': 'speed-insights' });
    }
    if (CFG.ga4Id && /^G-[A-Z0-9]+$/.test(CFG.ga4Id)) {
      // GA4 hook: only runs when a real ID is configured above.
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', CFG.ga4Id, { anonymize_ip: true });
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.ga4Id), { 'data-cj': 'ga4' });
    }
  }
  function loadMarketing() {
    if (loaded.marketing) return; loaded.marketing = true;
    if (CFG.metaPixelId && /^\d{6,20}$/.test(CFG.metaPixelId)) {
      // Meta pixel hook: only runs when a real ID is configured above.
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;t.setAttribute('data-cj','meta-pixel');s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', CFG.metaPixelId); window.fbq('track', 'PageView');
    }
  }
  function apply(c) {
    if (!c) return;
    if (c.analytics) loadAnalytics();
    if (c.marketing) loadMarketing();
  }

  // ---------- banner ----------
  var el, more;
  function build() {
    if (el) return el;
    el = document.createElement('section');
    el.className = 'cc'; el.id = 'cj-consent'; el.hidden = true;
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Cookie choices');
    el.innerHTML =
      '<div class="cc-top">' +
        '<p class="cc-txt"><b>Cookies, calmly.</b> We use a few essentials to run the site. With your OK, we also measure visits to make it better. Nothing else loads unless you say yes. Questions: <a href="mailto:info@calmjoints.org">info@calmjoints.org</a>.</p>' +
        '<div class="cc-btns">' +
          '<button type="button" class="cc-btn" data-cc="reject">Reject</button>' +
          '<button type="button" class="cc-btn pri" data-cc="accept">Accept</button>' +
          '<button type="button" class="cc-btn link" data-cc="manage" aria-expanded="false" aria-controls="cc-more">Manage</button>' +
        '</div>' +
      '</div>' +
      '<div class="cc-more" id="cc-more" hidden>' +
        '<label class="cc-opt"><input type="checkbox" checked disabled><span><b>Essential.</b> Remembers this choice and keeps forms working. Always on.</span></label>' +
        '<label class="cc-opt"><input type="checkbox" id="cc-a"><span><b>Analytics.</b> Counts visits and page speed so we can improve the site. No ads.</span></label>' +
        '<label class="cc-opt"><input type="checkbox" id="cc-m"><span><b>Marketing.</b> Lets us measure our ads. Off unless you turn it on.</span></label>' +
        '<button type="button" class="cc-btn pri cc-save" data-cc="save">Save my choices</button>' +
      '</div>';
    document.body.appendChild(el);
    more = el.querySelector('#cc-more');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cc]'); if (!b) return;
      var act = b.getAttribute('data-cc');
      if (act === 'accept') decide({ analytics: true, marketing: true });
      if (act === 'reject') decide({ analytics: false, marketing: false });
      if (act === 'manage') { var o = more.hidden; more.hidden = !o; b.setAttribute('aria-expanded', o ? 'true' : 'false'); if (o) el.querySelector('#cc-a').focus(); }
      if (act === 'save') decide({ analytics: el.querySelector('#cc-a').checked, marketing: el.querySelector('#cc-m').checked });
    });
    return el;
  }
  function open() {
    build(); var c = read();
    el.querySelector('#cc-a').checked = !!(c && c.analytics);
    el.querySelector('#cc-m').checked = !!(c && c.marketing);
    if (c) { more.hidden = false; el.querySelector('[data-cc=manage]').setAttribute('aria-expanded', 'true'); }
    el.hidden = false;
  }
  function decide(c) {
    var prev = read();
    write(c);
    if (el) el.hidden = true;
    // Scripts can't be unloaded, so a downgrade reloads the page clean.
    if (prev && ((prev.analytics && !c.analytics) || (prev.marketing && !c.marketing)) && (loaded.analytics || loaded.marketing)) { location.reload(); return; }
    apply(c);
    listeners.forEach(function (fn) { try { fn(c); } catch (e) {} });
    document.dispatchEvent(new CustomEvent('cj:consent', { detail: c }));
  }

  window.CJConsent = {
    get: read,
    decided: function () { return !!read(); },
    visible: function () { return !!(el && !el.hidden); },
    open: open,
    onChange: function (fn) { listeners.push(fn); },
    config: CFG,
  };

  function init() {
    var c = read();
    if (c) apply(c); else open();
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-cookie-settings]');
      if (a) { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
