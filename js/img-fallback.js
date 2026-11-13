/* Graceful fallback when a carousel or card image is missing or broken. */
(function (root) {
  var PLACEHOLDER =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  var SELECTOR = '.frame img, .pc-frame img, .th-card img, .hubpop img, img[data-fallback-src]';

  function isTarget(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.hasAttribute('data-fallback-src')) return true;
    try {
      return !!(img.closest && img.closest('.frame, .pc-frame, .th-card, .hubpop'));
    } catch (e) {
      return false;
    }
  }

  function apply(img) {
    if (!img || img.getAttribute('data-fallback-done') === '1') return;
    var next = img.getAttribute('data-fallback-src');
    var current = img.getAttribute('src') || '';
    if (next && current !== next) {
      img.setAttribute('data-fallback-done', '1');
      img.classList.add('is-fallback');
      img.src = next;
      return;
    }
    img.setAttribute('data-fallback-done', '1');
    img.classList.add('is-missing');
    img.src = PLACEHOLDER;
  }

  function bind(img) {
    if (!img || img.getAttribute('data-fallback-bound') === '1') return;
    img.setAttribute('data-fallback-bound', '1');
    img.addEventListener('error', function () { apply(img); });
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) apply(img);
  }

  function scan(rootEl) {
    var scope = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll(SELECTOR), bind);
  }

  var api = { bind: bind, scan: scan, apply: apply, isTarget: isTarget, SELECTOR: SELECTOR };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof document !== 'undefined') {
    if (typeof window !== 'undefined') window.cjImgFallback = api;
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (isTarget(img)) apply(img);
    }, true);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { scan(document); });
    } else {
      scan(document);
    }
  }
})(typeof window !== 'undefined' ? window : this);
