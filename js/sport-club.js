(function () {
  var modal = document.getElementById('club-modal');
  if (!modal) return;
  var dialog = modal.querySelector('.club-modal-dialog');
  var form = modal.querySelector('#club-qr-form');
  var status = form && form.querySelector('.club-status');
  var tierSelect = form && form.querySelector('[name="tier"]');
  var title = form && form.querySelector('#club-form-title');
  var pill = document.getElementById('club-pill');
  if (!dialog || !form || !status || !tierSelect) return;
  var lastFocus = null;

  function setView(view) {
    view = view === 'full' ? 'full' : 'physio';
    modal.setAttribute('data-view', view);
    modal.querySelectorAll('[data-club-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-club-panel') !== view;
    });
    modal.querySelectorAll('[data-club-view]').forEach(function (tab) {
      tab.setAttribute('aria-pressed', tab.getAttribute('data-club-view') === view ? 'true' : 'false');
    });
    var titles = modal.querySelectorAll('.club-modal-title');
    titles.forEach(function (h) { h.removeAttribute('id'); });
    var active = modal.querySelector('[data-club-panel="' + view + '"] .club-modal-title');
    if (active) active.id = 'club-modal-title';
    tierSelect.value = view;
    if (title) title.textContent = view === 'full' ? 'Request full recovery activation' : 'Request a Physio QR';
  }

  function open(view, focusForm) {
    lastFocus = document.activeElement;
    setView(view);
    modal.hidden = false;
    document.body.classList.add('club-open-modal');
    if (focusForm) {
      var club = form.querySelector('[name="club"]');
      if (club) {
        club.focus({ preventScroll: true });
        form.scrollIntoView({ block: 'start' });
        return;
      }
    }
    dialog.scrollTop = 0;
    dialog.focus({ preventScroll: true });
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('club-open-modal');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.querySelectorAll('[data-club-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { open(btn.getAttribute('data-club-open'), false); });
  });
  document.querySelectorAll('[data-club-tier]').forEach(function (btn) {
    btn.addEventListener('click', function () { open(btn.getAttribute('data-club-tier'), true); });
  });
  modal.querySelectorAll('[data-club-view]').forEach(function (tab) {
    tab.addEventListener('click', function () { setView(tab.getAttribute('data-club-view')); });
  });
  modal.querySelectorAll('[data-club-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  tierSelect.addEventListener('change', function () { setView(tierSelect.value); });
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(
      dialog.querySelectorAll('button, a[href], input:not([type="hidden"]):not([tabindex="-1"]), select, textarea'),
      function (el) { return el.offsetParent !== null; }
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  if (pill && 'IntersectionObserver' in window) {
    var strip = document.getElementById('club-strip');
    var band = document.getElementById('club-partner');
    var seen = { strip: true, band: false };
    var update = function () {
      pill.classList.toggle('is-visible', !seen.strip && !seen.band && window.scrollY > 200);
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.target === strip) seen.strip = en.isIntersecting;
        if (en.target === band) seen.band = en.isIntersecting;
      });
      update();
    });
    if (strip) io.observe(strip); else seen.strip = false;
    if (band) io.observe(band);
    window.addEventListener('scroll', update, { passive: true });
  } else if (pill) {
    pill.classList.add('is-visible');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'club-status';
    status.textContent = 'Sending…';
    var data = {
      club: (form.club.value || '').trim(),
      name: (form.name.value || '').trim(),
      email: (form.email.value || '').trim(),
      phone: (form.phone.value || '').trim(),
      sport: (form.sport.value || '').trim(),
      path: (form.path.value || '').trim(),
      tier: (form.tier.value || '').trim(),
      message: (form.message.value || '').trim(),
      company: (form.company.value || '').trim()
    };
    fetch('/api/club-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().then(function (json) { return { res: res, json: json }; });
    }).then(function (out) {
      var ok = out.res.ok && out.json && out.json.ok;
      status.className = 'club-status ' + (ok ? 'is-ok' : 'is-err');
      status.textContent = (out.json && out.json.message) || (ok ? 'Thanks. Your request is in, and a person will be in touch soon.' : 'We couldn’t send that just now. Try again, or email info@calmjoints.org.');
      if (ok) {
        form.querySelectorAll('input:not([readonly]):not([type="hidden"]), textarea').forEach(function (el) {
          if (el.name !== 'sport_label') el.value = '';
        });
      }
    }).catch(function () {
      status.className = 'club-status is-err';
      status.textContent = 'We couldn’t send that just now. Try again, or email info@calmjoints.org.';
    });
  });
})();
