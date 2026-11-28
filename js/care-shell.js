/* Small chat button only. No auto-open, no squirrel, no Glen billboard. */
(function () {
  if (document.querySelector('.care-chat-btn')) return;
  var path = (location.pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/chat' || path.indexOf('/chat-') === 0 || path === '/glen' || path === '/gwen') return;
  var a = document.createElement('a');
  a.className = 'care-chat-btn';
  a.href = '/chat';
  a.setAttribute('data-talk', '');
  a.setAttribute('data-talk-place', 'chip');
  a.innerHTML = '<img src="/media/cj-guide-glen.webp" alt="" width="28" height="28"><span>Chat</span>';
  a.setAttribute('aria-label', 'Chat with a Calm Joints guide');
  document.body.appendChild(a);

  // First-party site visit once per tab
  try {
    if (!sessionStorage.getItem('cj_site_visit')) {
      sessionStorage.setItem('cj_site_visit', '1');
      var sid = localStorage.getItem('cj_sid');
      if (!sid) { sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cj_sid', sid); }
      var body = JSON.stringify({ e: 'site_visit', ts: new Date().toISOString(), sid: sid, path: location.pathname });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/funnel', new Blob([body], { type: 'application/json' }));
    }
  } catch (e) {}
})();
