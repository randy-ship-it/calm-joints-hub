/* Rotating sport hints. Without this script, every hint stays visible.
   Reduced motion keeps that static list. Otherwise one hint shows at a time. */
(function () {
  var root = document.querySelector('[data-hints]');
  if (!root) return;
  var items = [].slice.call(root.querySelectorAll('li'));
  if (items.length < 2) return;
  var bar = root.closest('.hints');
  if (!bar) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var index = 0;
  var timer = null;
  var paused = false;
  var pauseBtn = bar.querySelector('[data-hint="pause"]');
  var delay = 7000;

  function tallest() {
    var h = 0;
    items.forEach(function (li) {
      li.classList.add('is-on');
      li.style.display = 'block';
      h = Math.max(h, li.offsetHeight);
      li.style.display = '';
      li.classList.remove('is-on');
    });
    return h;
  }

  function show(n) {
    index = (n + items.length) % items.length;
    items.forEach(function (li, i) {
      var on = i === index;
      li.classList.toggle('is-on', on);
      if (on) li.removeAttribute('hidden');
      else li.setAttribute('hidden', '');
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (paused) return;
    timer = setInterval(function () { show(index + 1); }, delay);
  }

  root.style.minHeight = tallest() + 'px';
  bar.classList.add('is-rotating');
  show(0);
  start();

  bar.querySelector('[data-hint="prev"]').addEventListener('click', function () {
    show(index - 1);
    start();
  });
  bar.querySelector('[data-hint="next"]').addEventListener('click', function () {
    show(index + 1);
    start();
  });
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      pauseBtn.textContent = paused ? 'Play' : 'Pause';
      if (paused) stop();
      else start();
    });
  }
})();
