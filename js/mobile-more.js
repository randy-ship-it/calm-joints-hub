/* Mobile copy toggle. Desktop ignores it: .mob-hide is only hidden at <=640px. */
(function () {
  var btn = document.querySelector('.m-more');
  if (!btn) return;
  var mq = window.matchMedia('(max-width: 640px)');

  function setOpen(on) {
    document.querySelectorAll('.mob-hide').forEach(function (el) {
      el.classList.toggle('is-open', on);
    });
    document.body.classList.toggle('show-more', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.textContent = on ? 'Less' : 'More';
  }

  function targetInFold(id) {
    if (!id) return null;
    var t = document.getElementById(id);
    if (!t) return null;
    if (t.classList.contains('mob-hide') || (t.closest && t.closest('.mob-hide'))) return t;
    return null;
  }

  btn.addEventListener('click', function () {
    var on = btn.getAttribute('aria-expanded') !== 'true';
    setOpen(on);
    if (on) window.dispatchEvent(new Event('resize'));
  });

  document.addEventListener('click', function (e) {
    if (!mq.matches) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var i = href.indexOf('#');
    if (i < 0) return;
    var path = href.slice(0, i);
    if (path && path !== location.pathname) return;
    var t = targetInFold(href.slice(i + 1));
    if (!t) return;
    setOpen(true);
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(function () { t.scrollIntoView({ block: 'start' }); });
  });

  function fromHash() {
    if (!mq.matches) return;
    var t = targetInFold((location.hash || '').slice(1));
    if (!t) return;
    setOpen(true);
    window.dispatchEvent(new Event('resize'));
  }
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
