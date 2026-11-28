/* In-site physio calendar + doctor request. Tracks the booking funnel first-party. */
(function () {
  var sid = (function () {
    try {
      var s = localStorage.getItem('cj_sid');
      if (s && /^[a-zA-Z0-9_-]{8,80}$/.test(s)) return s;
      s = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('cj_sid', s);
      return s;
    } catch (e) { return 's' + String(Date.now()); }
  })();

  function track(e, extra) {
    var body = Object.assign({ e: e, ts: new Date().toISOString(), sid: sid, path: location.pathname + location.search }, extra || {});
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/funnel', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      else fetch('/api/funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (err) {}
    try { if (window.va) window.va('event', { name: e, slots_count: body.slots_count }); } catch (err) {}
    try { if (window.gtag) window.gtag('event', 'cj_' + e, { slots_count: body.slots_count, visit: body.visit }); } catch (err) {}
  }

  var params = new URLSearchParams(location.search);
  var visit = params.get('visit') === 'followup' ? 'followup' : (params.get('visit') === 'md' ? 'md' : 'initial');
  var state = { visit: visit === 'md' ? 'initial' : visit, days: {}, count: 0, slot: null, startDay: 0, booking_page: '' };

  track('booking_page_view', { visit: visit });
  if (!sessionStorage.getItem('cj_site_visit')) {
    sessionStorage.setItem('cj_site_visit', '1');
    track('site_visit');
  }

  var tabP = document.getElementById('tab-physio');
  var tabM = document.getElementById('tab-md');
  var panP = document.getElementById('panel-physio');
  var panM = document.getElementById('panel-md');

  function show(which) {
    var md = which === 'md';
    tabP.setAttribute('aria-selected', md ? 'false' : 'true');
    tabM.setAttribute('aria-selected', md ? 'true' : 'false');
    panP.classList.toggle('is-on', !md);
    panM.classList.toggle('is-on', md);
    panP.hidden = md;
    panM.hidden = !md;
    if (md) history.replaceState({}, '', '/book?visit=md');
    else history.replaceState({}, '', '/book?visit=' + state.visit);
  }
  tabP.addEventListener('click', function () { show('physio'); });
  tabM.addEventListener('click', function () { show('md'); });
  if (visit === 'md') show('md');

  document.querySelectorAll('.svc').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.svc').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      state.visit = btn.getAttribute('data-visit');
      state.slot = null;
      document.getElementById('physio-go').disabled = true;
      history.replaceState({}, '', '/book?visit=' + state.visit);
      loadSlots();
    });
  });

  function weekdayLabel(iso) {
    var d = new Date(iso + 'T12:00:00-05:00');
    return { dow: d.toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'America/Toronto' }), num: d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' }) };
  }
  function ymdAdd(iso, n) {
    var d = new Date(iso + 'T12:00:00-05:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  }
  function todayYmd() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  }

  function render() {
    var root = document.getElementById('cal-days');
    var msg = document.getElementById('cal-msg');
    var countEl = document.getElementById('cal-count');
    var start = ymdAdd(todayYmd(), state.startDay);
    var html = '';
    var shown = 0;
    for (var i = 0; i < 7; i++) {
      var day = ymdAdd(start, i);
      var pack = state.days[day] || { count: 0, slots: [] };
      var lab = weekdayLabel(day);
      html += '<div class="cal-day" data-day="' + day + '"><h3>' + lab.dow + '<b>' + lab.num + '</b></h3>';
      if (!pack.slots.length) html += '<p class="empty">No times</p>';
      else {
        var max = 6;
        pack.slots.slice(0, max).forEach(function (s) {
          shown += 1;
          var on = state.slot && state.slot.start_at === s.start_at && state.slot.book_url === s.book_url;
          html += '<button type="button" class="slot" aria-pressed="' + (on ? 'true' : 'false') + '" data-start="' + s.start_at + '" data-url="' + String(s.book_url).replace(/"/g, '') + '">' + s.time + '</button>';
        });
        if (pack.slots.length > max) html += '<p class="empty">+' + (pack.slots.length - max) + ' more</p>';
      }
      html += '</div>';
    }
    root.innerHTML = html;
    countEl.textContent = state.count
      ? (state.count + ' openings in the next two weeks. Showing a week starting ' + weekdayLabel(start).num + '.')
      : 'No openings loaded.';
    msg.hidden = !state.message;
    msg.textContent = state.message || '';
    root.querySelectorAll('.slot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.slot = { start_at: btn.getAttribute('data-start'), book_url: btn.getAttribute('data-url') };
        document.getElementById('physio-go').disabled = false;
        track('slot_picked', { visit: state.visit, slot_start: state.slot.start_at, slots_count: state.count });
        render();
      });
    });
  }

  function loadSlots() {
    document.getElementById('cal-count').textContent = 'Loading live openings…';
    fetch('/api/openings?visit=' + encodeURIComponent(state.visit), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.days = data.days || {};
        state.count = Number(data.count) || 0;
        state.message = data.ok ? '' : (data.message || '');
        state.booking_page = data.booking_page || '';
        track('slots_shown', { visit: state.visit, slots_count: state.count });
        render();
      })
      .catch(function () {
        state.days = {};
        state.count = 0;
        state.message = 'We couldn’t load times just now. You can still continue to the booking page.';
        state.booking_page = (window.CALM_JOINTS && window.CALM_JOINTS.booking && window.CALM_JOINTS.booking.primaryUrl) || '';
        render();
      });
  }

  document.getElementById('cal-prev').addEventListener('click', function () {
    state.startDay = Math.max(0, state.startDay - 7);
    render();
  });
  document.getElementById('cal-next').addEventListener('click', function () {
    state.startDay = Math.min(7, state.startDay + 7);
    render();
  });

  function maybeLead(form, visitKind, slotStart) {
    var fd = new FormData(form);
    var email = String(fd.get('email') || '').trim();
    var phone = String(fd.get('phone') || '').trim();
    var consent = form.querySelector('[name=consent]').checked;
    if (!consent || (!email && !phone)) return Promise.resolve(null);
    return fetch('/api/booking-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: String(fd.get('firstName') || '').trim(),
        email: email,
        phone: phone,
        note: String(fd.get('note') || '').trim(),
        consent: true,
        visit: visitKind,
        slot_start: slotStart || '',
        sid: sid,
      }),
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  document.getElementById('physio-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = (state.slot && state.slot.book_url) || state.booking_page;
    if (!url) return;
    var status = document.getElementById('physio-status');
    status.textContent = 'Opening the official booking page…';
    maybeLead(e.target, state.visit, state.slot && state.slot.start_at).then(function (lead) {
      if (lead && lead.message) status.textContent = lead.message;
      track('booking_started', { visit: state.visit, slot_start: state.slot && state.slot.start_at, slots_count: state.count });
      window.location.href = url;
    });
  });

  document.getElementById('md-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var status = document.getElementById('md-status');
    var btn = document.getElementById('md-go');
    btn.disabled = true;
    status.textContent = 'Sending your request…';
    maybeLead(e.target, 'md', '').then(function (lead) {
      if (lead && lead.ok) {
        status.textContent = lead.message || 'Thanks. We’ll follow up about the doctor visit.';
        track('booking_started', { visit: 'md' });
      } else {
        btn.disabled = false;
        status.textContent = (lead && lead.message) || 'Please add an email or phone, and tick the callback box.';
      }
    });
  });

  window.addEventListener('pagehide', function () {
    track('exit', { visit: state.visit, slots_count: state.count, slot_start: state.slot && state.slot.start_at });
  });

  loadSlots();
})();
