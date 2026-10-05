/*
 * Calming Newsletters: email capture for Calm Joints.
 *
 * Renders three placements from one template:
 *   <div data-calming="inline"></div>   mid-page band
 *   <div data-calming="footer"></div>   footer signup
 *   popup                                built here, when <body data-calming-pop> is set
 *
 * Popup rules: exit intent on desktop; on mobile after ~45s or 50% scroll,
 * whichever comes first. Shown at most once per 14 days, never after a signup,
 * never while the cookie banner or any other dialog is open.
 *
 * Signups go to the site's existing POST /api/newsletter (Friday CRM at
 * fridayapp.org) with src 'cj-calming-newsletter' and an explicit CASL opt-in.
 * Add ?cjqa=1 to a URL to mark signups from this tab as test entries.
 */
(function () {
  var SRC = 'cj-calming-newsletter';
  var CAP_MS = 14 * 24 * 3600 * 1000, MOBILE_DELAY = 45000, SCROLL_AT = 0.5, ARM_DESKTOP = 4000;
  var K_SHOWN = 'cj-calming-pop-at', K_SUB = 'cj-calming-sub';
  var CONSENT = 'Yes, email me Calming Newsletters from Calm Joints (Clairvoyant Holdings Inc.). I can unsubscribe anytime.';
  var SENDER = 'Sent by Calm Joints, a trade name of Clairvoyant Holdings Inc., Unit 777, 2255B Queen St E, Toronto ON M4E 1G3 · <a href="mailto:info@calmjoints.org">info@calmjoints.org</a>. Every email has an unsubscribe link.';
  var uid = 0;

  try { if (/[?&]cjqa=1\b/.test(location.search)) sessionStorage.setItem('cj-qa', '1'); } catch (e) {}
  function qa() { try { return sessionStorage.getItem('cj-qa') === '1'; } catch (e) { return false; } }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function formHtml(placement, cta) {
    var id = 'cn-' + placement + '-' + (++uid);
    return '<form class="cn-form" novalidate data-placement="' + placement + '">' +
      '<label class="cn-sr" for="' + id + '-e">Email</label>' +
      '<div class="cn-row"><input id="' + id + '-e" name="email" type="email" autocomplete="email" placeholder="you@email.com" maxlength="254" required>' +
      '<button class="cn-btn" type="submit">' + (cta || 'Subscribe') + '</button></div>' +
      '<label class="cn-ok"><input type="checkbox" name="consent" required><span>' + CONSENT + '</span></label>' +
      '<p class="cn-fine">' + SENDER + '</p>' +
      '<input class="cn-hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="cn-msg" role="status" aria-live="polite"></p>' +
    '</form>';
  }

  function wire(form, onOk) {
    var msg = form.querySelector('.cn-msg'), btn = form.querySelector('.cn-btn');
    var em = form.querySelector('input[type=email]'), ok = form.querySelector('input[name=consent]');
    em.addEventListener('input', function () { em.classList.remove('bad'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = em.value.trim();
      msg.className = 'cn-msg';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { em.classList.add('bad'); msg.className = 'cn-msg err'; msg.textContent = v ? 'That email doesn’t look quite right.' : 'Add your email first.'; em.focus(); return; }
      if (!ok.checked) { msg.className = 'cn-msg err'; msg.textContent = 'Tick the box so we know it’s OK to email you.'; ok.focus(); return; }
      btn.disabled = true; msg.textContent = 'One sec…';
      var body = { email: v, consent: true, src: SRC, placement: form.getAttribute('data-placement'), page: location.pathname, company: form.company.value };
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
  function capped() { var t = +get(K_SHOWN) || 0; return t && Date.now() - t < CAP_MS; }
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
      '<p class="cn-kick">Calming Newsletters</p><h2 id="cn-pop-h">A calmer inbox for sore joints.</h2>' +
      '<p class="cn-lede">Short notes from our physios with simple moves and straight answers. Now and then, never spammy.</p>' +
      formHtml(placement) + '<button class="cn-no" type="button">No thanks</button>';
    document.body.appendChild(pop);
    pop.querySelector('.cn-x').addEventListener('click', hide);
    pop.querySelector('.cn-no').addEventListener('click', hide);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    wire(pop.querySelector('form'), function () { setTimeout(hide, 2600); });

    // Never sit on top of the booking popup (or any other dialog).
    var mo = new MutationObserver(function () { if (document.querySelector('dialog[open]')) hide(); });
    document.querySelectorAll('dialog').forEach(function (d) { mo.observe(d, { attributes: true, attributeFilter: ['open'] }); });
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-book]')) hide(); }, true);

    var desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.innerWidth > 760;
    if (desktop) {
      var armed = false; setTimeout(function () { armed = true; }, ARM_DESKTOP);
      document.addEventListener('mouseout', function (e) {
        if (!armed || e.relatedTarget || e.toElement) return;
        if (e.clientY <= 0) trigger('exit-intent');
      });
    } else {
      setTimeout(function () { trigger('time-45s', true); }, MOBILE_DELAY);
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0 && window.scrollY / max >= SCROLL_AT) { window.removeEventListener('scroll', onScroll); trigger('scroll-50', true); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }
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
