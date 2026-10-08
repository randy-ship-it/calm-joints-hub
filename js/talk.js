/* "Talk to Glen or Gwen": one small white pop-up. Pick a guide, then Chat / Text / Call.
 * Any element with [data-talk] opens it. data-talk-place names the placement for analytics.
 * Chat and Call open the guide (js/guide.js) already set to the picked guide; Call starts voice
 * inside the same tap so iPhone Safari allows the mic and audio. Text opens the phone's SMS app. */
(function () {
  if (window.CJTalk) return;
  var C = window.CALM_JOINTS || {};
  var SMS = (C.guide && C.guide.sms) || { number: '+16476926575', label: '(647) 692-6575', name: 'Glen' };
  var G = {
    glen: { name: 'Glen', av: '/media/cj-guide-glen.webp', he: 'him' },
    gwen: { name: 'Gwen', av: '/media/cj-guide-gwen.webp', he: 'her' },
  };
  var pick = 'glen', place = 'site', dlg = null;
  try { var s = sessionStorage.getItem('cj_guide_pick'); if (G[s]) pick = s; } catch (e) {}

  function track(ev, extra) {
    var p = { guide: pick, placement: place };
    for (var k in extra || {}) p[k] = extra[k];
    try { if (window.gtag) window.gtag('event', 'cj_talk_' + ev, p); } catch (e) {}
  }
  function ios() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function smsHref() {
    var body = encodeURIComponent('Hi ' + SMS.name + ', I’d like some help with a sore spot.');
    return 'sms:' + SMS.number + (ios() ? '&' : '?') + 'body=' + body;
  }
  function disclose() { return G[pick].name + ' is Calm Joints’ virtual guide, not a clinician. General info only, not medical advice. Chats may be saved. In an emergency, call 911.'; }

  var CSS =
    '.cjt{border:0;padding:0;margin:auto;width:min(420px,calc(100vw - 24px));max-height:calc(100dvh - 24px);border-radius:22px;background:#fff;color:#0B1D16;box-shadow:0 30px 80px -20px rgba(11,29,22,.35);font-size:16px;line-height:1.45;overflow:auto}' +
    '.cjt::backdrop{background:rgba(11,29,22,.38)}' +
    '.cjt-in{padding:1.35rem 1.25rem 1.1rem;position:relative}' +
    '.cjt-x{position:absolute;top:.7rem;right:.7rem;width:40px;height:40px;border-radius:50%;border:0;background:#F4F6F5;color:#0B1D16;font-size:1.35rem;line-height:1;cursor:pointer}' +
    '.cjt h2{margin:0 2.6rem .25rem 0;font-size:1.3rem;letter-spacing:-.01em;line-height:1.2}' +
    '.cjt-sub{margin:0 0 1rem;color:#4B5E54;font-size:.95rem}' +
    '.cjt-pick{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin:0 0 1rem;padding:0;border:0}' +
    '.cjt-g{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border:1.5px solid #E1E8E4;border-radius:16px;background:#fff;cursor:pointer;font-weight:600;font-size:1rem;font-family:inherit;color:#0B1D16;min-width:0}' +
    '.cjt-g img{width:44px;height:44px;border-radius:50%;background:#EEF7F1;flex:none}' +
    '.cjt-g[aria-checked="true"]{border-color:#15803D;box-shadow:0 0 0 3px #DCFCE7}' +
    '.cjt-g:focus-visible,.cjt-a:focus-visible,.cjt-x:focus-visible{outline:3px solid #15803D;outline-offset:2px}' +
    '.cjt-acts{display:grid;gap:.5rem}' +
    '.cjt-a{display:flex;align-items:center;gap:.8rem;width:100%;padding:.8rem .9rem;border:1px solid #E1E8E4;border-radius:14px;background:#fff;color:#0B1D16;text-decoration:none;text-align:left;cursor:pointer;font:inherit}' +
    '.cjt-a:hover{border-color:#0B1D16}' +
    '.cjt-a svg{width:22px;height:22px;flex:none;color:#15803D}' +
    '.cjt-a b{display:block;font-size:1rem}.cjt-a small{display:block;color:#4B5E54;font-size:.84rem}' +
    '.cjt-a.pri{background:#15803D;border-color:#15803D;color:#fff}.cjt-a.pri svg,.cjt-a.pri small{color:#fff}.cjt-a.pri small{opacity:.9}.cjt-a.pri:hover{background:#116A32}' +
    '.cjt-disc{margin:1rem 0 0;font-size:.78rem;line-height:1.45;color:#5F7068}' +
    '@media (max-width:520px){.cjt{width:100vw;max-width:100vw;margin:auto 0 0;border-radius:22px 22px 0 0;max-height:92dvh}.cjt-in{padding-bottom:calc(1.1rem + env(safe-area-inset-bottom))}}';
  var I = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
  };

  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    dlg = document.createElement('dialog'); dlg.className = 'cjt'; dlg.setAttribute('aria-labelledby', 'cjt-title');
    dlg.innerHTML = '<div class="cjt-in">' +
      '<button type="button" class="cjt-x" data-t="x" aria-label="Close">&times;</button>' +
      '<h2 id="cjt-title">Talk to Glen or Gwen</h2>' +
      '<p class="cjt-sub">Free, 24/7. Tell them what hurts and get clear next steps.</p>' +
      '<div class="cjt-pick" role="radiogroup" aria-label="Who would you like to talk to?">' +
        Object.keys(G).map(function (k) { return '<button type="button" class="cjt-g" role="radio" data-g="' + k + '" aria-checked="false"><img src="' + G[k].av + '" alt="" width="44" height="44">' + G[k].name + '</button>'; }).join('') +
      '</div>' +
      '<div class="cjt-acts">' +
        '<button type="button" class="cjt-a pri" data-t="chat">' + I.chat + '<span><b data-n="chat">Chat</b><small>Type back and forth, right here.</small></span></button>' +
        '<a class="cjt-a" data-t="text" href="' + smsHref() + '">' + I.text + '<span><b>Text</b><small data-n="text">' + SMS.label + ' from your phone</small></span></a>' +
        '<button type="button" class="cjt-a" data-t="call">' + I.call + '<span><b>Call</b><small>Talk out loud in your browser.</small></span></button>' +
      '</div>' +
      '<p class="cjt-disc" data-n="disc"></p>' +
    '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) return close();
      var g = e.target.closest('[data-g]'); if (g) { setPick(g.getAttribute('data-g')); track('pick'); return; }
      var a = e.target.closest('[data-t]'); if (!a) return;
      var t = a.getAttribute('data-t');
      if (t === 'x') return close();
      if (t === 'text') { track('text'); return; } // let the sms: link open the phone's messages app
      e.preventDefault(); track(t);
      go(t === 'call' ? 'voice' : 'chat');
    });
    paint();
  }
  function setPick(k) { if (!G[k]) return; pick = k; try { sessionStorage.setItem('cj_guide_pick', k); } catch (e) {} paint(); }
  function paint() {
    if (!dlg) return;
    dlg.querySelectorAll('[data-g]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-g') === pick)); });
    dlg.querySelector('[data-n="chat"]').textContent = 'Chat with ' + G[pick].name;
    dlg.querySelector('[data-n="text"]').textContent = SMS.label + (pick === SMS.name.toLowerCase() ? ' from your phone' : ' · ' + SMS.name + ' replies by text');
    dlg.querySelector('[data-t="text"]').href = smsHref();
    dlg.querySelector('[data-n="disc"]').textContent = disclose();
  }
  function close() { if (dlg && dlg.open) dlg.close(); else if (dlg) dlg.removeAttribute('open'); }
  // Hand off to the guide in the same tap when it's loaded (keeps iPhone mic/audio permission tied to the tap).
  function go(start) {
    close();
    var o = { start: start, guide: pick };
    if (window.CJGuide && window.CJGuide.open) { window.CJGuide.open(o); return; }
    var s = document.querySelector('script[data-cjg]');
    if (start === 'voice') o.start = 'consent'; // gesture is gone once we wait; show the one-tap Start voice screen
    var done = false, fire = function () { if (done || !window.CJGuide) return; done = true; window.CJGuide.open(o); };
    if (s) s.addEventListener('load', fire);
    var n = 0, iv = setInterval(function () { if (window.CJGuide || ++n > 50) { clearInterval(iv); if (window.CJGuide) fire(); else location.href = '/chat?guide=' + pick; } }, 100);
  }
  function open(o) {
    o = o || {}; place = o.place || 'site';
    if (o.guide && G[o.guide]) pick = o.guide;
    if (!dlg) build(); else paint();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    track('open');
  }
  function bind(root) {
    (root || document).querySelectorAll('[data-talk]').forEach(function (el) {
      if (el.__cjt) return; el.__cjt = true;
      el.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab: falls through to /chat
        e.preventDefault(); open({ place: el.getAttribute('data-talk-place') || 'site', guide: el.getAttribute('data-talk-guide') });
      });
    });
  }
  window.CJTalk = { open: open, bind: bind, smsHref: smsHref };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bind(); }); else bind();
})();
