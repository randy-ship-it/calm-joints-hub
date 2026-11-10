(function () {
  var root = document.getElementById('club-partner');
  if (!root) return;
  var form = root.querySelector('#club-qr-form');
  var status = form && form.querySelector('.club-status');
  var tierSelect = form && form.querySelector('[name="tier"]');
  if (!form || !status || !tierSelect) return;

  function openForm(tier) {
    if (tier) tierSelect.value = tier;
    form.hidden = false;
    var club = form.querySelector('[name="club"]');
    if (club) club.focus();
  }

  root.querySelectorAll('[data-club-tier]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var details = root.querySelector('details');
      if (details && !details.open) details.open = true;
      openForm(btn.getAttribute('data-club-tier'));
    });
  });

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
      status.textContent = (out.json && out.json.message) || (ok ? 'Thanks. Your QR request is in, and a person will be in touch soon.' : 'We couldn’t send that just now. Try again, or email info@calmjoints.org.');
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
