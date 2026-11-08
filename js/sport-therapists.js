/* Compact therapist rail. Booking stays on the URL in config.js.
   A card adds the public staff path for the same treatment. */
(function () {
  var rail = document.querySelector('.th-rail');
  if (!rail) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function staffBookingUrl(base, id) {
    var treatment = (String(base).match(/treatment\/(\d+)/) || [])[1];
    if (!treatment || !/^\d+$/.test(String(id))) return base;
    return String(base).split('#')[0] + '#/staff_member/' + id + '/treatment/' + treatment;
  }

  document.querySelectorAll('[data-staff]').forEach(function (el) {
    if (!el.href) return;
    el.href = staffBookingUrl(el.href, el.getAttribute('data-staff'));
  });

  function cardWidth() {
    var card = rail.querySelector('.th-card');
    if (!card) return 220;
    var styles = window.getComputedStyle(rail);
    var gap = parseFloat(styles.columnGap || styles.gap) || 10;
    return card.getBoundingClientRect().width + gap;
  }

  function step(dir) {
    if (!reduce) {
      rail.classList.remove('is-turn-next', 'is-turn-prev');
      void rail.offsetWidth;
      rail.classList.add(dir > 0 ? 'is-turn-next' : 'is-turn-prev');
      window.setTimeout(function () {
        rail.classList.remove('is-turn-next', 'is-turn-prev');
      }, 360);
    }
    rail.scrollBy({ left: dir * cardWidth(), behavior: reduce ? 'auto' : 'smooth' });
  }

  var prev = document.querySelector('[data-th="prev"]');
  var next = document.querySelector('[data-th="next"]');
  if (prev) prev.addEventListener('click', function () { step(-1); });
  if (next) next.addEventListener('click', function () { step(1); });

  rail.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
})();
