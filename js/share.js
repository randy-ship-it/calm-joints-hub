/*
 * One-tap share for the Calm Joints guide: "Know somebody with an injury? Send them this link."
 * 1) Web Share API (mobile share sheet), 2) sms: link with a prefilled body
 *    (iOS uses sms:&body=, Android/others sms:?body=), 3) copy link.
 * The shared URL carries src=share so visits and leads are tracked.
 */
(function () {
  'use strict';
  if (window.CJShare) return;
  var CFG = (window.CALM_JOINTS && window.CALM_JOINTS.guide) || {};
  var URL_ = CFG.shareUrl || 'https://calmjoints.org/chat?src=share';
  var TITLE = 'Calm Joints injury guide, 24/7';
  var TEXT = 'Know somebody with an injury? The Calm Joints AI guide answers questions about joint pain 24/7 and can book a video visit with a registered physiotherapist.';
  var SMS_TEXT = 'Thought this might help with your injury. The Calm Joints AI injury guide is there 24/7 to answer questions and book a video visit with a registered physiotherapist: ' + URL_;

  function isIOS(ua, touch) {
    ua = ua == null ? navigator.userAgent : ua;
    touch = touch == null ? (navigator.maxTouchPoints || 0) : touch;
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1);
  }
  function isMobile() {
    try { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch (e) { return false; }
  }
  // iOS: sms:&body=   Android and others: sms:?body=
  function smsHref(ios, body) {
    return 'sms:' + (ios ? '&' : '?') + 'body=' + encodeURIComponent(body == null ? SMS_TEXT : body);
  }
  function track(ev, method) {
    try { if (window.gtag) window.gtag('event', 'cj_share_' + ev, { method: method || '', page: location.pathname }); } catch (e) {}
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(new Error('copy failed')); } catch (e) { rej(e); } finally { t.remove(); }
    });
  }
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

  // Markup: a "Send them this link" button plus a fallback row (Text it / Copy link) shown when there is no share sheet.
  function html(o) {
    o = o || {};
    var ios = isIOS();
    return '<div class="cjs" data-cjs>' +
      (o.lead === false ? '' : '<p class="cjs-lead"><b>Know somebody with an injury?</b> Send them this link. The guide is there 24/7.</p>') +
      '<button type="button" class="cjs-btn" data-cjs-share>' + ICON + '<span>' + (o.label || 'Send them this link') + '</span></button>' +
      '<div class="cjs-alt" data-cjs-alt hidden><a class="cjs-chip" data-cjs-sms href="' + smsHref(ios).replace(/&/g, '&amp;') + '">Text it</a>' +
      '<button type="button" class="cjs-chip" data-cjs-copy>Copy link</button><span class="cjs-msg" role="status" aria-live="polite"></span></div>' +
      '</div>';
  }
  function bind(root) {
    if (!root || root.__cjs) return; root.__cjs = true;
    var alt = root.querySelector('[data-cjs-alt]'), msg = root.querySelector('.cjs-msg');
    function showAlt() { if (alt) alt.hidden = false; }
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cjs-share],[data-cjs-copy],[data-cjs-sms]'); if (!t) return;
      if (t.hasAttribute('data-cjs-sms')) { track('sms', 'sms'); return; } // let the link open Messages
      e.preventDefault();
      if (t.hasAttribute('data-cjs-copy')) {
        copy(URL_).then(function () { msg.textContent = 'Link copied'; track('copy', 'copy'); }, function () { msg.textContent = URL_; });
        return;
      }
      track('tap', 'button');
      if (navigator.share && isMobile()) {
        navigator.share({ title: TITLE, text: TEXT, url: URL_ }).then(function () { track('done', 'webshare'); }, function (err) {
          if (!err || err.name !== 'AbortError') showAlt(); // real failure: offer text / copy
        });
      } else {
        showAlt();
      }
    });
  }
  function mount(el, o) { if (!el) return null; el.innerHTML = html(o); bind(el.firstChild); return el.firstChild; }

  window.CJShare = { url: URL_, text: TEXT, smsText: SMS_TEXT, smsHref: smsHref, isIOS: isIOS, html: html, bind: bind, mount: mount };
  if (typeof module !== 'undefined') module.exports = window.CJShare;
  function auto() { document.querySelectorAll('[data-cjs-mount]').forEach(function (el) { if (!el.firstChild || !el.querySelector('[data-cjs]')) mount(el, { label: el.getAttribute('data-label') || undefined }); }); }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto(); }
})();
