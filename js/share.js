/*
 * One-tap share for the Calm Joints guide: "Know somebody with an injury? Send them this link."
 * 1) Web Share API (mobile share sheet), 2) sms: link with a prefilled body
 *    (iOS uses sms:&body=, Android/others sms:?body=), 3) copy the message.
 * All three send the same friend-facing message (MSG) with the link inside it once.
 * Web Share gets { text } only: no url field (iOS/Android append it again, doubling the
 * link) and no title (Messages can show it as stray text). The shared URL carries
 * src=share so visits and leads are tracked. When texting is live (guide.sms), the
 * message ends with "Or text Glen at (xxx) xxx-xxxx." and the block shows a Text Glen line.
 */
(function () {
  'use strict';
  if (window.CJShare) return;
  var CFG = (window.CALM_JOINTS && window.CALM_JOINTS.guide) || {};
  var URL_ = CFG.shareUrl || 'https://calmjoints.org/chat?src=share';
  var SMS_CFG = CFG.sms || null; // { number: '+1…', label: '(xxx) xxx-xxxx', name: 'Glen' } when texting is live
  // Written to the friend who receives it (~225 chars with the text line). Link appears once. No claims beyond "AI guide".
  var MSG = 'Thought of you \u2014 if something\u2019s hurting, Glen is Calm Joints\u2019 free 24/7 AI injury guide. Tell him what\u2019s going on and he\u2019ll help you figure out next steps: ' + URL_ +
    (SMS_CFG && SMS_CFG.number && SMS_CFG.label ? ' (or text ' + (SMS_CFG.name || 'Glen') + ' at ' + SMS_CFG.label + ')' : '');
  var TEXT = MSG, SMS_TEXT = MSG; // kept for older callers
  function payload() { return { text: MSG }; }

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
  var SMS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

  // Markup: a "Send them this link" button plus a fallback row (Text it / Copy link) shown when there is no share sheet.
  function html(o) {
    o = o || {};
    var ios = isIOS();
    return '<div class="cjs" data-cjs>' +
      (o.lead === false ? '' : '<p class="cjs-lead"><b>Know somebody with an injury?</b> Send them this link. The guide is there 24/7.</p>') +
      '<button type="button" class="cjs-btn" data-cjs-share>' + ICON + '<span>' + (o.label || 'Send them this link') + '</span></button>' +
      '<div class="cjs-alt" data-cjs-alt hidden><a class="cjs-chip" data-cjs-sms href="' + smsHref(ios).replace(/&/g, '&amp;') + '">Text it</a>' +
      '<button type="button" class="cjs-chip" data-cjs-copy>Copy message</button><span class="cjs-msg" role="status" aria-live="polite"></span></div>' +
      (o.textGuide === false ? '' : textGuideHtml()) +
      '</div>';
  }
  // "Text Glen: (xxx) xxx-xxxx" — opens Messages to the guide's own number.
  function textGuideHtml() {
    if (!SMS_CFG || !SMS_CFG.number || !SMS_CFG.label) return '';
    return '<p class="cjs-text"><a href="sms:' + SMS_CFG.number + '" data-cjs-textguide>' + SMS_ICON + '<span>Text ' + (SMS_CFG.name || 'Glen') + ': <b>' + SMS_CFG.label + '</b></span></a><small>Canada · AI guide, not a physio · msg rates may apply</small></p>';
  }
  function bind(root) {
    if (!root || root.__cjs) return; root.__cjs = true;
    var alt = root.querySelector('[data-cjs-alt]'), msg = root.querySelector('.cjs-msg');
    function showAlt() { if (alt) alt.hidden = false; }
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cjs-share],[data-cjs-copy],[data-cjs-sms],[data-cjs-textguide]'); if (!t) return;
      if (t.hasAttribute('data-cjs-sms')) { track('sms', 'sms'); return; } // let the link open Messages
      if (t.hasAttribute('data-cjs-textguide')) { track('text_guide', 'sms'); return; }
      e.preventDefault();
      if (t.hasAttribute('data-cjs-copy')) {
        copy(MSG).then(function () { msg.textContent = 'Message copied'; track('copy', 'copy'); }, function () { msg.textContent = MSG; });
        return;
      }
      track('tap', 'button');
      if (navigator.share && isMobile()) {
        navigator.share(payload()).then(function () { track('done', 'webshare'); }, function (err) {
          if (!err || err.name !== 'AbortError') showAlt(); // real failure: offer text / copy
        });
      } else {
        showAlt();
      }
    });
  }
  function mount(el, o) { if (!el) return null; el.innerHTML = html(o); bind(el.firstChild); return el.firstChild; }

  window.CJShare = { url: URL_, message: MSG, text: TEXT, smsText: SMS_TEXT, sms: SMS_CFG, payload: payload, smsHref: smsHref, isIOS: isIOS, html: html, bind: bind, mount: mount };
  if (typeof module !== 'undefined') module.exports = window.CJShare;
  function auto() { document.querySelectorAll('[data-cjs-mount]').forEach(function (el) { if (!el.firstChild || !el.querySelector('[data-cjs]')) mount(el, { label: el.getAttribute('data-label') || undefined }); }); }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto(); }
})();
