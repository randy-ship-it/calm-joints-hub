/* Switches the shared application form between physiotherapist and field ambassador. */
(function () {
  var form = document.querySelector('[data-apply-form]');
  if (!form) return;
  function apply() {
    var picked = form.querySelector('input[name="role"]:checked');
    var role = picked && picked.value === 'ambassador' ? 'ambassador' : 'physiotherapist';
    form.querySelectorAll('[data-for-role]').forEach(function (el) {
      var on = el.getAttribute('data-for-role') === role;
      el.hidden = !on;
      el.querySelectorAll('input,select,textarea').forEach(function (i) { i.disabled = !on; });
    });
    var ep = form.getAttribute(role === 'ambassador' ? 'data-endpoint-ambassador' : 'data-endpoint-physio');
    if (ep) form.setAttribute('data-endpoint', ep);
  }
  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'role') apply();
  });
  apply();
})();
