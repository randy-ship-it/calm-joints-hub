/* Illustrative Physio API estimate. Not a payout guarantee.
   contribution = patients × sessions × net per session
   per-patient net = sessions × net per session
   The period labels the patient count. It does not annualize. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CJEstimate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SESSIONS = [4, 5, 6, 7, 8];
  var NET_MIN = 25;
  var NET_MAX = 40;
  var PATIENT_MAX = 10000000;
  var PERIODS = { month: 'One month', quarter: 'One quarter', cohort: 'One cohort' };

  function clampInt(value, min, max) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function sessionsOf(value) {
    var n = Math.round(Number(value));
    if (SESSIONS.indexOf(n) >= 0) return n;
    if (!isFinite(n) || n < 4) return 4;
    return 8;
  }

  function periodOf(value) {
    return PERIODS[value] ? value : 'month';
  }

  function estimate(input) {
    input = input || {};
    var patients = clampInt(input.patients, 0, PATIENT_MAX);
    var sessions = sessionsOf(input.sessions);
    var netPerSession = clampInt(input.netPerSession, NET_MIN, NET_MAX);
    var perPatient = sessions * netPerSession;
    var contribution = patients * perPatient;
    return {
      patients: patients,
      sessions: sessions,
      netPerSession: netPerSession,
      period: periodOf(input.period),
      perPatient: perPatient,
      contribution: contribution
    };
  }

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-CA');
  }

  function bind(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.getElementById) return;
    var form = doc.getElementById('est-form');
    var out = doc.getElementById('est-out');
    if (!form || !out) return;
    var period = 'month';
    var sessions = 6;
    function press(sel, on) {
      var nodes = form.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('aria-pressed', nodes[i] === on ? 'true' : 'false');
    }
    function render() {
      var patients = doc.getElementById('est-patients').value;
      var net = doc.getElementById('est-net').value;
      var result = estimate({ patients: patients, sessions: sessions, netPerSession: net, period: period });
      var label = PERIODS[result.period];
      out.innerHTML = money(result.contribution) + ' CAD<small>Estimated incremental net contribution under selected assumptions. ' +
        result.patients.toLocaleString('en-CA') + ' patients in ' + label.toLowerCase() + ' × ' + result.sessions +
        ' sessions × ' + money(result.netPerSession) + ' CAD. Per patient, ' + money(result.perPatient) +
        ' CAD (' + result.sessions + ' × ' + money(result.netPerSession) + '). Illustrative. Not a guarantee.</small>';
    }
    form.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b || !form.contains(b)) return;
      if (b.getAttribute('data-period')) {
        period = b.getAttribute('data-period');
        press('[data-period]', b);
      }
      if (b.getAttribute('data-sessions')) {
        sessions = Number(b.getAttribute('data-sessions'));
        press('[data-sessions]', b);
      }
      render();
    });
    form.addEventListener('input', render);
    render();
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bind(document); });
    else bind(document);
  }

  return {
    SESSIONS: SESSIONS,
    NET_MIN: NET_MIN,
    NET_MAX: NET_MAX,
    PERIODS: PERIODS,
    estimate: estimate,
    bind: bind
  };
});
