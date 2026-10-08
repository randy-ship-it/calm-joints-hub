/*
 * Share your AI recovery concierge (v3): "Send them Glen" / "Send them Gwen".
 * Each pick shares a guide-specific link, https://calmjoints.org/chat?guide=<glen|gwen>&ref=share,
 * which opens /chat with that guide pre-selected and has its own link preview (og image + text).
 * 1) Web Share API on phones (share sheet), 2) otherwise a panel with Copy link (auto-copied on
 *    desktop), Text it (iOS sms:&body=, others sms:?body=), Email and Copy message.
 * The friend-facing message names the guide and carries the link once. Web Share gets { text } only:
 * no url field (iOS/Android append it again, doubling the link) and no title (stray text in Messages).
 * Tracking: gtag events cj_share_* with { guide, method, placement } (consent-gated by consent.js),
 * plus an anonymous count per guide/event/placement posted to /api/qr-lead (kind=share-event).
 * No personal data, no cookies. Old API kept: url, message, payload(), smsHref(), html(), bind(), mount().
 */
(function () {
  'use strict';
  if (window.CJShare) return;
  var CJ = window.CALM_JOINTS || {};
  var CFG = CJ.guide || {};
  var BASE = 'https://calmjoints.org/chat';
  var SMS_CFG = CFG.sms || null; // { number, label, name: 'Glen' } when "Text Glen" is live
  var DEF_GUIDES = {
    glen: { name: 'Glen', avatar: '/media/cj-guide-glen.webp', he: 'he', him: 'him' },
    gwen: { name: 'Gwen', avatar: '/media/cj-guide-gwen.webp', he: 'she', him: 'her' },
  };
  var GUIDES = {};
  Object.keys(DEF_GUIDES).forEach(function (k) {
    var c = (CFG.guides && CFG.guides[k]) || {};
    GUIDES[k] = { key: k, name: c.name || DEF_GUIDES[k].name, avatar: c.avatar || DEF_GUIDES[k].avatar, he: c.he || DEF_GUIDES[k].he, him: c.him || DEF_GUIDES[k].him };
  });
  var KEYS = Object.keys(GUIDES);
  var DEFAULT = GUIDES[CFG.defaultGuide] ? CFG.defaultGuide : 'glen';
  function key(g) { g = String(g || '').toLowerCase(); return GUIDES[g] ? g : DEFAULT; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function urlFor(g) { return BASE + '?guide=' + key(g) + '&ref=share'; }
  // Written to the friend who receives it. Link appears once. No claims beyond "AI guide".
  function messageFor(g) {
    var G = GUIDES[key(g)];
    var textLine = (SMS_CFG && SMS_CFG.number && SMS_CFG.label && (SMS_CFG.name || 'Glen') === G.name) ? ' (or text ' + G.name + ' at ' + SMS_CFG.label + ')' : '';
    return 'Thought of you. If something\u2019s hurting, ask ' + G.name + ', Calm Joints\u2019 free 24/7 AI recovery concierge. Tell ' + G.him + ' what\u2019s going on and ' + G.he + '\u2019ll help with next steps. No app needed: ' + urlFor(G.key) + textLine;
  }
  function payload(g) { return { text: messageFor(g) }; }
  function mailHref(g) {
    var G = GUIDES[key(g)];
    return 'mailto:?subject=' + encodeURIComponent('Ask ' + G.name + ' about that pain (free, 24/7)') + '&body=' + encodeURIComponent(messageFor(g));
  }

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
    return 'sms:' + (ios ? '&' : '?') + 'body=' + encodeURIComponent(body == null ? messageFor(DEFAULT) : body);
  }

  // ---- tracking: gtag (consent-gated) + anonymous server count by guide ----
  var EVENTS = { click: 1, done: 1, copy: 1, sms: 1, email: 1, visit: 1, text_guide: 1 };
  function beacon(ev, g, method, placement) {
    if (!EVENTS[ev]) return;
    var body = JSON.stringify({ kind: 'share-event', event: ev, guide: key(g), method: method || '', placement: placement || '', page: (location.pathname || '/').slice(0, 40) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/qr-lead', new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch('/api/qr-lead', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function track(ev, g, method, placement) {
    try { if (window.gtag) window.gtag('event', 'cj_share_' + ev, { guide: key(g), method: method || '', placement: placement || '', page: location.pathname }); } catch (e) {}
    beacon(ev, g, method, placement);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(new Error('copy failed')); } catch (e) { rej(e); } finally { t.remove(); }
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

  // Markup. o.placement: home | chat-gate | chat | helped | header | popup. o.compact drops the sub line.
  // o.first puts that guide first (e.g. the guide you just talked with). o.lead === false drops the headline.
  function html(o) {
    o = o || {};
    var order = KEYS.slice();
    if (o.first && GUIDES[o.first]) order.sort(function (a, b) { return (b === o.first) - (a === o.first); });
    var head = o.lead === false ? '' :
      '<p class="cjs-h">' + esc(o.title || 'Share your AI recovery concierge') + '</p>' +
      (o.compact ? '' : '<p class="cjs-sub">' + esc(o.sub || ('Know someone who\u2019s hurting? Send them ' + order.map(function (k) { return GUIDES[k].name; }).join(' or ') + '. Free and 24/7.')) + '</p>');
    var pick = '<div class="cjs-pick" role="group" aria-label="Pick a guide to send">' + order.map(function (k) {
      var G = GUIDES[k];
      return '<button type="button" class="cjs-g" data-cjs-g="' + k + '"><img src="' + esc(G.avatar) + '" alt="" width="44" height="44" loading="lazy"><span class="cjs-gt"><b>Send them ' + esc(G.name) + '</b><small>AI concierge \u00B7 24/7</small></span>' + ICON + '</button>';
    }).join('') + '</div>';
    var alt = '<div class="cjs-alt" data-cjs-alt hidden><p class="cjs-alt-t" data-cjs-alt-t></p>' +
      '<div class="cjs-link"><input type="text" readonly aria-label="Share link" data-cjs-url value=""><button type="button" class="cjs-copy" data-cjs-copy>Copy link</button></div>' +
      '<div class="cjs-row"><a class="cjs-chip" data-cjs-sms href="#">Text it</a><a class="cjs-chip" data-cjs-mail href="#">Email</a><button type="button" class="cjs-chip" data-cjs-copymsg>Copy message</button></div>' +
      '<span class="cjs-msg" role="status" aria-live="polite"></span></div>';
    return '<div class="cjs' + (o.compact ? ' cjs-compact' : '') + '" data-cjs data-place="' + esc(o.placement || 'site') + '">' + head + pick + alt + (o.textGuide === false ? '' : textGuideHtml()) + '</div>';
  }
  // "Call or text Glen: (xxx) xxx-xxxx": number dials, small Text link opens Messages.
  function textGuideHtml() {
    if (!SMS_CFG || !SMS_CFG.number || !SMS_CFG.label) return '';
    var name = SMS_CFG.name || 'Glen';
    var num = String(SMS_CFG.number);
    var tel = num.charAt(0) === '+' ? num : '+' + num;
    return '<p class="cjs-text"><span class="cjs-call">Call or text ' + name + ': <a href="tel:' + tel + '" data-cjs-textguide><b>' + SMS_CFG.label + '</b></a> <a class="cjs-sms" href="sms:' + tel + '">Text</a></span><small>Canada \u00B7 AI guide, not a physio \u00B7 msg rates may apply</small></p>';
  }

  function bind(root) {
    if (!root || root.__cjs) return; root.__cjs = true;
    var place = root.getAttribute('data-place') || 'site';
    var alt = root.querySelector('[data-cjs-alt]'), msg = root.querySelector('.cjs-msg'), cur = null;
    function panel(g, copied) {
      cur = key(g); var G = GUIDES[cur];
      root.querySelectorAll('[data-cjs-g]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cjs-g') === cur)); });
      root.querySelector('[data-cjs-alt-t]').innerHTML = 'Send <b>' + esc(G.name) + '</b> with this link:';
      var inp = root.querySelector('[data-cjs-url]'); inp.value = urlFor(cur);
      root.querySelector('[data-cjs-sms]').setAttribute('href', smsHref(isIOS(), messageFor(cur)));
      root.querySelector('[data-cjs-mail]').setAttribute('href', mailHref(cur));
      msg.textContent = copied ? 'Link copied. Paste it in a text, email or DM.' : '';
      alt.hidden = false;
    }
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cjs-g],[data-cjs-copy],[data-cjs-copymsg],[data-cjs-sms],[data-cjs-mail],[data-cjs-textguide],[data-cjs-url]'); if (!t || !root.contains(t)) return;
      if (t.hasAttribute('data-cjs-url')) { try { t.select(); } catch (er) {} return; }
      if (t.hasAttribute('data-cjs-sms')) { track('sms', cur, 'sms', place); return; } // let the link open Messages
      if (t.hasAttribute('data-cjs-mail')) { track('email', cur, 'email', place); return; }
      if (t.hasAttribute('data-cjs-textguide')) { track('text_guide', SMS_CFG && SMS_CFG.name ? SMS_CFG.name.toLowerCase() : 'glen', 'tel', place); return; }
      e.preventDefault();
      if (t.hasAttribute('data-cjs-copy') || t.hasAttribute('data-cjs-copymsg')) {
        var link = t.hasAttribute('data-cjs-copy'), text = link ? urlFor(cur) : messageFor(cur);
        copy(text).then(function () { msg.textContent = link ? 'Link copied' : 'Message copied'; track('copy', cur, link ? 'link' : 'message', place); }, function () { msg.textContent = text; });
        return;
      }
      var g = key(t.getAttribute('data-cjs-g'));
      track('click', g, 'button', place);
      if (navigator.share && isMobile()) {
        navigator.share(payload(g)).then(function () { track('done', g, 'webshare', place); }, function (err) {
          if (!err || err.name !== 'AbortError') panel(g, false); // real failure: offer copy / text
        });
      } else {
        // Desktop: copy the link right away and show the panel.
        copy(urlFor(g)).then(function () { panel(g, true); track('copy', g, 'auto', place); }, function () { panel(g, false); });
      }
    });
  }
  function mount(el, o) { if (!el) return null; el.innerHTML = html(o); bind(el.firstChild); return el.firstChild; }

  // Header / menu: a small sheet with the picker (works from anywhere on the page).
  var sheet = null;
  function openSheet(o) {
    o = o || {};
    if (!sheet) {
      sheet = document.createElement('dialog'); sheet.className = 'cjs-sheet'; sheet.setAttribute('aria-label', 'Share your AI recovery concierge');
      sheet.innerHTML = '<button type="button" class="cjs-x" aria-label="Close">&times;</button><div data-cjs-sheet></div>';
      document.body.appendChild(sheet);
      sheet.querySelector('.cjs-x').addEventListener('click', function () { sheet.close(); });
      sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); });
    }
    mount(sheet.querySelector('[data-cjs-sheet]'), { placement: o.placement || 'header', first: o.first });
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
    try { var f = sheet.querySelector('[data-cjs-g]'); if (f) f.focus({ preventScroll: true }); } catch (e) {}
    try { if (window.gtag) window.gtag('event', 'cj_share_open', { placement: o.placement || 'header', page: location.pathname }); } catch (e) {}
    return sheet;
  }

  var API = {
    url: urlFor(DEFAULT), urlFor: urlFor, message: messageFor(DEFAULT), messageFor: messageFor, text: messageFor(DEFAULT), smsText: messageFor(DEFAULT),
    sms: SMS_CFG, guides: GUIDES, payload: payload, smsHref: smsHref, mailHref: mailHref, isIOS: isIOS,
    html: html, bind: bind, mount: mount, openSheet: openSheet, track: track,
  };
  window.CJShare = API;
  if (typeof module !== 'undefined') module.exports = API;

  function auto() {
    document.querySelectorAll('[data-cjs-mount]').forEach(function (el) {
      if (!el.querySelector('[data-cjs]')) mount(el, { placement: el.getAttribute('data-place') || 'site', compact: el.hasAttribute('data-compact'), textGuide: !el.hasAttribute('data-no-textguide') });
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-cjs-open]'); if (!t) return;
      e.preventDefault(); openSheet({ placement: t.getAttribute('data-cjs-open') || 'header' });
    });
    // Landing from a shared link: count the visit once per session, by guide.
    try {
      var q = new URLSearchParams(location.search), via = q.get('ref') || q.get('src');
      if (via === 'share' && !sessionStorage.getItem('cj_share_visit')) {
        sessionStorage.setItem('cj_share_visit', '1');
        var p = location.pathname.replace(/\/$/, ''), g = q.get('guide') || (p === '/gwen' ? 'gwen' : p === '/glen' ? 'glen' : window.CJ_PAGE_GUIDE);
        beacon('visit', g, 'link', 'landing');
      }
    } catch (e) {}
  }
  if (typeof document !== 'undefined' && document.querySelectorAll) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto(); }
})();
