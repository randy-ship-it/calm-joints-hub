/*
 * Calming Newsletters: email capture for Calm Joints.
 *
 * Renders three placements from one template:
 *   <div data-calming="inline"></div>   mid-page band
 *   <div data-calming="footer"></div>   footer signup
 *   popup                                built here, when <body data-calming-pop> is set
 *
 * Popup rules: once per visitor, about 15s after load. Easy to dismiss
 * (close, "No thanks", or Escape). Never after a signup, and never while the
 * cookie banner or any other dialog is open.
 *
 * Signups go to the site's existing POST /api/newsletter (Friday CRM at
 * fridayapp.org) with src 'cj-calming-newsletter'. Typing an email and pressing
 * the button is the express CASL opt-in (nothing pre-filled or pre-ticked).
 * The popup button reads "Count me in"; the inline and footer forms still say
 * Subscribe. Add ?cjqa=1 to a URL to mark signups from this tab as test entries.
 */
(function () {
  var SRC = 'cj-calming-newsletter';
  var POP_DELAY = 15000;
  var K_SHOWN = 'cj-calming-pop-once', K_SUB = 'cj-calming-sub';
  // Kept short on purpose: email, one button, and one line. Sender ID and the
  // unsubscribe link live in every outbound email (CASL), not on the site.
  var FINE = 'Unsubscribe anytime.';
  var uid = 0;

  try { if (/[?&]cjqa=1\b/.test(location.search)) sessionStorage.setItem('cj-qa', '1'); } catch (e) {}
  function qa() { try { return sessionStorage.getItem('cj-qa') === '1'; } catch (e) { return false; } }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // Same stored partner/QR the booking ledger reads (cj_ref, 30 days).
  function storedRef() {
    try {
      var r = JSON.parse(localStorage.getItem('cj_ref') || 'null');
      if (!r || !r.slug || Date.now() - r.at >= 30 * 864e5) return {};
      var out = {};
      if (/^[a-z0-9-]{3,48}$/.test(r.slug)) out.partner = r.slug;
      if (r.c && /^[a-f0-9]{6}$/.test(String(r.c))) out.qr = String(r.c);
      return out;
    } catch (e) { return {}; }
  }

  function formHtml(placement, cta) {
    var id = 'cn-' + placement + '-' + (++uid);
    return '<form class="cn-form" novalidate data-placement="' + placement + '">' +
      '<label class="cn-sr" for="' + id + '-e">Email</label>' +
      '<div class="cn-row"><input id="' + id + '-e" name="email" type="email" autocomplete="email" placeholder="you@email.com" maxlength="254" required>' +
      '<button class="cn-btn" type="submit">' + (cta || 'Subscribe') + '</button></div>' +
      '<p class="cn-fine">' + FINE + '</p>' +
      '<input class="cn-hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="cn-msg" role="status" aria-live="polite"></p>' +
    '</form>';
  }

  function wire(form, onOk) {
    var msg = form.querySelector('.cn-msg'), btn = form.querySelector('.cn-btn');
    var em = form.querySelector('input[type=email]');
    em.addEventListener('input', function () { em.classList.remove('bad'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = em.value.trim();
      msg.className = 'cn-msg';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { em.classList.add('bad'); msg.className = 'cn-msg err'; msg.textContent = v ? 'That email doesn’t look quite right.' : 'Add your email first.'; em.focus(); return; }
      btn.disabled = true; msg.textContent = 'One sec…';
      var body = { email: v, consent: true, src: SRC, placement: form.getAttribute('data-placement'), page: location.pathname, company: form.company.value };
      var ref = storedRef();
      if (ref.partner) body.partner = ref.partner;
      if (ref.qr) body.qr = ref.qr;
      if (qa()) body.test = true;
      fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (out) { if (!r.ok || !out.ok) throw new Error(out.message || 'We couldn’t save that just now. Try once more?'); return out; }); })
        .then(function (out) {
          set(K_SUB, String(Date.now()));
          form.classList.add('cn-done'); msg.className = 'cn-msg ok'; msg.textContent = out.message || 'You’re in.';
          document.dispatchEvent(new CustomEvent('cj:calming-subscribed', { detail: { placement: body.placement, test: !!body.test } }));
          if (onOk) onOk();
        })
        .catch(function (err) { msg.className = 'cn-msg err'; msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    });
  }

  function renderInline(host) {
    host.className = 'cn cn-inline'; host.id = host.id || 'calming-newsletters';
    host.setAttribute('aria-labelledby', 'cn-inline-h');
    host.innerHTML = '<div class="cn-in"><div><p class="cn-kick">Calming Newsletters</p><h2 id="cn-inline-h">Calmer joints, one short email at a time.</h2>' +
      '<p class="cn-lede">Simple moves and straight answers from our physios, now and then. Free, and easy to leave.</p></div>' +
      '<div class="cn-card">' + formHtml('inline') + '</div></div>';
    wire(host.querySelector('form'));
  }
  function renderFooter(host) {
    var p = host.getAttribute('data-placement') || 'footer';
    host.className = 'cn cn-foot';
    host.innerHTML = '<div><h2>Calming Newsletters</h2><p class="cn-sub">Short, calm notes from our physios. No spam.</p></div>' + formHtml(p);
    wire(host.querySelector('form'));
  }

  // ---------- popup ----------
  var pop, shown = false, pending = false, lastFocus = null, retry = null;
  function subscribed() { return !!get(K_SUB); }
  function capped() { return !!get(K_SHOWN); }
  function eligible() { return !shown && !subscribed() && !capped(); }
  function blocked() {
    if (document.querySelector('dialog[open]')) return true;                       // partner, hub, or other dialogs
    if (window.CJConsent && (window.CJConsent.visible() || !window.CJConsent.decided())) return true; // cookie banner first
    var a = document.activeElement;                                                 // don't interrupt typing
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !(pop && pop.contains(a))) return true;
    return false;
  }
  function trigger(reason, queue) {
    if (!pop || !eligible()) return;
    if (blocked() && !queue) return;              // exit intent: just wait for the next one
    if (blocked()) { pending = reason; if (!retry) retry = setInterval(function () { if (!eligible()) { clearInterval(retry); retry = null; return; } if (!blocked()) { clearInterval(retry); retry = null; show(pending); } }, 1500); return; }
    show(reason);
  }
  function show(reason) {
    if (!eligible()) return;
    shown = true; set(K_SHOWN, String(Date.now()));
    lastFocus = document.activeElement;
    pop.setAttribute('data-reason', reason || '');
    pop.classList.add('on'); pop.setAttribute('aria-hidden', 'false');
    pop.focus({ preventScroll: true });
  }
  function hide() {
    if (!pop.classList.contains('on')) return;
    pop.classList.remove('on'); pop.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function buildPop() {
    var placement = document.body.getAttribute('data-calming-pop') || 'popup';
    pop = document.createElement('aside');
    pop.className = 'cn cn-pop'; pop.id = 'cn-pop'; pop.tabIndex = -1;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'cn-pop-h'); pop.setAttribute('aria-hidden', 'true');
    pop.innerHTML = '<button class="cn-x" type="button" aria-label="Close">×</button>' +
      '<h2 id="cn-pop-h">Be first to know.</h2>' +
      '<p class="cn-lede">Follow our challenges and get first look at new products and insider deals from our brand partners.</p>' +
      formHtml(placement, 'Count me in') + '<button class="cn-no" type="button">No thanks</button>';
    document.body.appendChild(pop);
    pop.querySelector('.cn-x').addEventListener('click', hide);
    pop.querySelector('.cn-no').addEventListener('click', hide);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    wire(pop.querySelector('form'), function () { setTimeout(hide, 2600); });

    // Never sit on top of the booking popup (or any other dialog).
    var mo = new MutationObserver(function () { if (document.querySelector('dialog[open]')) hide(); });
    document.querySelectorAll('dialog').forEach(function (d) { mo.observe(d, { attributes: true, attributeFilter: ['open'] }); });
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-book]')) hide(); }, true);

    setTimeout(function () { trigger('time-15s', true); }, POP_DELAY);
  }

  function init() {
    document.querySelectorAll('[data-calming="inline"]').forEach(renderInline);
    document.querySelectorAll('[data-calming="footer"]').forEach(renderFooter);
    if (document.body.hasAttribute('data-calming-pop')) buildPop();
    window.CJCalming = {
      trigger: trigger, hide: hide,
      state: function () { return { shown: shown, subscribed: subscribed(), capped: !!capped(), blocked: blocked(), visible: !!(pop && pop.classList.contains('on')), reason: pop && pop.getAttribute('data-reason') }; },
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
