/*
 * Calm Joints guide — disclaimer gate, then Chat, Voice, or Book a video visit.
 * Same agent for chat and voice (ElevenLabs Agents). Session only: nothing
 * here stores a transcript. Quick triage leads go to /api/qr-lead
 * (kind=guide-triage), which forwards to the CRM server-side.
 */
(function () {
  'use strict';
  if (window.CJGuide) return;
  var CFG = window.CALM_JOINTS || {};
  var AGENT_ID = (CFG.guide && CFG.guide.agentId) || '';
  var BOOK_BASE = 'https://calmjoints.org/';
  // ElevenLabs client SDK (pinned), loaded only when Chat or Voice starts.
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';

  var T = {
    title: 'Talk with Calm Joints',
    // The one disclosure line: small on the gate, and once at the start of each chat or voice session.
    disclose: '{name} is Calm Joints’ virtual guide, not a clinician. General info only, not medical advice. Chats may be saved. In an emergency, call 911.',
    e911: 'Chest pain, trouble breathing, sudden weakness, new bowel or bladder changes, or a bad fall? Call 911 or go to emergency.',
    foot: 'Virtual guide, not a clinician. General info only. <a href="https://calmjoints.org/?intent=book" target="_blank" rel="noopener">Book a registered physio</a>.',
    consent: 'Voice chats may be saved to help us improve, but not as a health record. You can switch to text anytime.',
    openingNamed: 'Hi, I’m {name}, Calm Joints’ virtual guide. What’s going on with your body today?',
    opening: 'Hi, I’m Calm Joints’ virtual guide. What’s going on with your body today?',
    qrAdd: ' I can help you book a visit with a Calm Joints physio from here.',
    bookLine: 'You’ll book with Calm Joints, with a College-registered physio.',
    tips: 'Get tips for sore joints — short notes from the clinic, unsubscribe anytime.',
    prefill: 'Start my intake with this (name, contact, what’s sore, preferred time). No symptoms or chat history. Your physio reviews it at booking.',
    cbConsent: 'I agree to receive a call from the Calm Joints virtual guide about my request.',
    cbIntro: 'Leave your first name and number. The Calm Joints virtual guide will call you in a minute or two. It’s not a physiotherapist, and it can help you book a video visit.',
  };
  // "Get a call back": hidden unless the server says it's switched on (?callback=preview shows it for checks).
  var CALLBACK = { on: false, preview: /(^|&)callback=preview(&|$)/.test(location.search.slice(1)) };
  var cbStatus = null;
  function callbackStatus() {
    if (!cbStatus) cbStatus = fetch('/api/qr-lead?kind=guide-callback', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { CALLBACK.on = !!(j && j.enabled); return CALLBACK.on; }, function () { return false; });
    return cbStatus;
  }
  var PROVS = [['', 'Province or territory'], ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'], ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon']];
  var AREAS = [['', 'What’s sore?'], ['knee', 'Knee'], ['hip', 'Hip'], ['back', 'Back'], ['neck', 'Neck'], ['shoulder', 'Shoulder'], ['other', 'Other']];
  var DAYS = [['', 'Any day'], ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];
  var WINDOWS = [['', 'Any time'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  };

  // ---- context (src / venue) ----
  var qs = new URLSearchParams(location.search);
  function slug(v, n) { return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 60); }
  var CTX = { src: slug(qs.get('src') || qs.get('ref'), 40) || (location.pathname.replace(/\/$/, '') === '/chat' ? 'chat' : 'site'), venue: slug(qs.get('venue')) || '' };
  try {
    if (CTX.src === 'qr' || CTX.src === 'share' || CTX.src === 'helped' || CTX.venue) sessionStorage.setItem('cj_guide_ctx', JSON.stringify(CTX));
    else { var saved = JSON.parse(sessionStorage.getItem('cj_guide_ctx') || 'null'); if (saved && saved.src) CTX = saved; }
  } catch (e) {}
  var SID = (function () { try { var s = sessionStorage.getItem('cj_guide_sid'); if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); sessionStorage.setItem('cj_guide_sid', s); } return s; } catch (e) { return String(Date.now()); } })();
  var leadSaved = null; // last lead fields sent this session

  // ---- guide picker (Glen default, Gwen optional). Same tools, rules and lead flow; only the agent, voice and avatar differ. ----
  var GUIDES = {};
  var GCFG = (CFG.guide && CFG.guide.guides) || {};
  Object.keys(GCFG).forEach(function (k) { if (GCFG[k] && GCFG[k].agentId) GUIDES[k] = GCFG[k]; });
  if (!GUIDES.glen) GUIDES.glen = { name: 'Glen', agentId: AGENT_ID, avatar: '/media/cj-guide-avatar.webp' };
  var GUIDE_KEYS = Object.keys(GUIDES);
  // Old links and saved picks: ?guide=randy -> glen, ?guide=emma -> gwen.
  var ALIASES = Object.assign({ randy: 'glen', emma: 'gwen' }, (CFG.guide && CFG.guide.aliases) || {});
  function guideKey(v) { v = slug(v, 12); if (GUIDES[v]) return v; return GUIDES[ALIASES[v]] ? ALIASES[v] : ''; }
  var DEFAULT_GUIDE = guideKey(CFG.guide && CFG.guide.defaultGuide) || 'glen';
  var PICK = (function () {
    var q = guideKey(qs.get('guide') || window.CJ_PAGE_GUIDE); // /chat?guide=gwen, or the /glen and /gwen pages
    if (q) { try { sessionStorage.setItem('cj_guide_pick', q); } catch (e) {} return q; }
    try { var s = guideKey(sessionStorage.getItem('cj_guide_pick')); if (s) return s; } catch (e) {}
    return DEFAULT_GUIDE;
  })();
  function guide() { return GUIDES[PICK] || GUIDES[DEFAULT_GUIDE] || GUIDES[GUIDE_KEYS[0]]; }
  function disclose() { return T.disclose.replace('{name}', guide().name || 'Our guide'); }
  function guideAv(k) { return esc((GUIDES[k] || guide()).avatar || '/media/cj-guide-avatar.webp'); }
  function guideAlt(k) { var g = GUIDES[k] || guide(); return esc(g.alt || (g.name + ', Calm Joints’ virtual guide (illustration)')); }
  // Share your recovery concierge (js/share.js): Send them Glen / Send them Gwen, current guide first.
  function shareHtml(o) { return window.CJShare ? '<div class="cjg-share">' + window.CJShare.html(Object.assign({ compact: true, first: PICK }, o)) + '</div>' : ''; }
  function pickerHtml() {
    if (GUIDE_KEYS.length < 2) return '';
    return '<div class="cjg-pick" role="radiogroup" aria-label="Choose your guide">' + GUIDE_KEYS.map(function (k) {
      return '<button type="button" class="cjg-pk" role="radio" data-a="pick" data-g="' + esc(k) + '" aria-checked="' + (k === PICK) + '"><img src="' + guideAv(k) + '" alt="" width="40" height="40"><span>Talk with ' + esc(GUIDES[k].name) + '</span></button>';
    }).join('') + '</div>';
  }

  function bookingUrl(area, province) {
    var p = new URLSearchParams({ intent: 'book', area: slug(area, 20) || '', province: String(province || '').toUpperCase().slice(0, 2), src: CTX.src || '', venue: CTX.venue || '' });
    return BOOK_BASE + '?' + p.toString();
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function opts(list) { return list.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join(''); }
  function fmt(text) {
    var safe = esc(String(text || '').replace(/\*\*(.+?)\*\*/g, '$1'));
    safe = safe.replace(/\[([^\]]{1,80})\]\((https?:\/\/[^\s)]+)\)/g, '$1 $2');
    safe = safe.replace(/https?:\/\/[^\s<]+/g, function (u) {
      var trail = ''; while (/[.,;:!?)\]]$/.test(u)) { trail = u.slice(-1) + trail; u = u.slice(0, -1); }
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u.replace(/^https?:\/\//, '').replace(/\/$/, '') + '</a>' + trail;
    });
    return safe.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  function postLead(fields) {
    var body = Object.assign({ kind: 'guide-triage', src: CTX.src, venue: CTX.venue, session_id: SID, page: location.pathname, guide: PICK }, fields);
    if (/(\+test@|@example\.(com|org)$)/i.test(body.email || '') || qs.get('cjtest') === '1') body.test = true;
    return fetch('/api/qr-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (j) { if (j && j.ok) leadSaved = body; return j; });
  }
  function noteBookClick(area, province) {
    if (leadSaved) postLead(Object.assign({}, leadSaved, { clicked_book: true, area: area || leadSaved.area, province: province || leadSaved.province })).catch(function () {});
  }

  var sdkPromise = null;
  function loadSdk() {
    if (window.ElevenLabsClient) return Promise.resolve(window.ElevenLabsClient);
    if (sdkPromise) return sdkPromise;
    sdkPromise = import(SDK_URL).then(function (m) { window.ElevenLabsClient = m; return m; }, function (e) { sdkPromise = null; throw e; });
    return sdkPromise;
  }

  // ---- one guide instance bound to a root element ----
  function Guide(root, o) {
    this.root = root; this.o = o || {}; this.conv = null; this.mode = null; this.starting = false;
    this.render();
  }
  Guide.prototype.render = function () {
    var self = this, o = this.o;
    this.root.classList.add('cjg');
    this.root.innerHTML =
      '<div class="cjg-head"><img src="/media/calm-joints-mark.svg" alt="" width="30" height="30"><span class="cjg-brand"><b>Calm Joints</b><small class="cj-tag-g">In the moment recovery care</small></span>' +
      (window.CJShare ? '<button type="button" class="cjg-hshare" data-a="hshare" aria-label="Share your recovery concierge: send someone Glen or Gwen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>Share</button>' : '') +
      (o.onClose ? '<button type="button" class="cjg-x" aria-label="Close">&times;</button>' : '') + '</div>' +
      '<div class="cjg-body" data-s="gate">' +
        pickerHtml() +
        '<div class="cjg-card"><span class="cjg-av"><img src="' + guideAv() + '" alt="' + guideAlt() + '" width="64" height="64" data-gav data-galt></span><span class="cjg-card-t"><span class="cjg-badge" data-gname>' + esc(this.badge()) + '</span><b>' + (CTX.src === 'share' ? 'A friend sent you my way' : 'Ask me about your injury') + '</b><small>Virtual guide · not a clinician</small></span></div>' +
        '<h2 id="cjg-title">' + T.title + '</h2><p class="cjg-disc" data-gdisc>' + esc(disclose()) + '</p><p class="cjg-911" role="note"><strong>Emergency?</strong> ' + T.e911 + '</p>' +
        '<div class="cjg-actions"><button type="button" class="cjg-btn pri" data-a="chat">' + ICON.chat + 'Chat</button>' +
        '<button type="button" class="cjg-btn" data-a="voice">' + ICON.mic + 'Voice</button>' +
        '<a class="cjg-btn soft" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">' + ICON.cal + 'Book a video visit</a>' +
        '<button type="button" class="cjg-btn" data-a="callback" data-cb hidden>' + ICON.phone + 'Get a call back</button></div>' +
        '<p class="cjg-note" style="text-align:center">' + T.bookLine + '</p>' +
        shareHtml({ placement: o.onClose ? 'popup' : 'chat-gate' }) +
        '<details' + (o.leadOpen ? ' open' : '') + ' data-lead><summary>Quick triage by email</summary>' + this.leadForm() + '</details>' +
      '</div>' +
      '<div class="cjg-body" data-s="consent" hidden><h2>Voice</h2><p>' + T.consent + '</p>' +
        '<div class="cjg-actions"><button type="button" class="cjg-btn pri" data-a="voice-go">' + ICON.mic + 'Start voice</button><button type="button" class="cjg-btn" data-a="chat">' + ICON.chat + 'Use text instead</button></div></div>' +
      '<div class="cjg-body" data-s="voice" hidden><div class="cjg-orb" aria-hidden="true"><img src="' + guideAv() + '" alt="" width="132" height="132" data-gav></div><div class="cjg-badge" style="display:table;margin:0 auto .5rem" data-gname>' + esc(this.badge()) + '</div><div class="cjg-status" aria-live="polite">Connecting…</div>' +
        '<div class="cjg-row" style="justify-content:center;margin-bottom:.8rem"><button type="button" class="cjg-chip" data-a="voice-end">End voice</button><button type="button" class="cjg-chip" data-a="chat">Switch to text</button>' + this.swapChip() + '<a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a></div>' +
        '<div class="cjg-log" data-log="voice" aria-live="polite"></div></div>' +
      '<div class="cjg-body" data-s="callback" hidden><h2>Get a call back</h2><p>' + T.cbIntro + '</p>' + this.callbackForm() +
        '<div class="cjg-row" style="margin-top:.9rem"><button type="button" class="cjg-chip" data-a="chat">Chat instead</button><a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a></div>' +
        '<p class="cjg-note cjg-911" style="margin-top:.9rem"><strong>Emergency?</strong> Call 911. Don’t wait for a call back.</p></div>' +
      '<div class="cjg-body" data-s="chat" hidden><div class="cjg-log" data-log="chat" aria-live="polite"></div></div>' +
      '<div class="cjg-tools" data-s="chat-tools" hidden><a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a><button type="button" class="cjg-chip" data-a="voice">Switch to voice</button>' + this.swapChip() + '<button type="button" class="cjg-chip" data-a="lead">Email me a link</button><button type="button" class="cjg-chip" data-a="callback" data-cb hidden>Get a call back</button><button type="button" class="cjg-chip" data-a="share">Share</button>' + (window.CJHelped ? '<button type="button" class="cjg-chip" data-a="helped">\uD83D\uDC4D This helped</button>' : '') + '</div>' +
      '<form class="cjg-compose" data-s="compose" hidden autocomplete="off"><label class="cjg-sr" for="cjg-in">Message</label><input id="cjg-in" name="m" placeholder="Ask about knee, hip, back, neck or shoulder pain" maxlength="600" enterkeyhint="send"><button type="submit">Send</button></form>' +
      '<div class="cjg-foot" data-gdisc>' + esc(disclose()) + '</div>';
    this.root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a || !self.root.contains(a)) return;
      var act = a.getAttribute('data-a');
      if (act === 'book') { self.track('book'); noteBookClick(); return; }
      e.preventDefault();
      if (act === 'chat') self.startChat();
      else if (act === 'voice') self.show('consent');
      else if (act === 'voice-go') self.startVoice();
      else if (act === 'voice-end') self.endVoice();
      else if (act === 'lead') self.showLead();
      else if (act === 'callback') { self.stop(); self.track('callback'); self.show('callback'); }
      else if (act === 'pick') self.setGuide(a.getAttribute('data-g'));
      else if (act === 'swap') self.setGuide(self.otherGuide());
      else if (act === 'share') self.showShare();
      else if (act === 'helped') self.showHelped(true);
      else if (act === 'hshare') self.headerShare();
    });
    this.paintGuide();
    var x = this.root.querySelector('.cjg-x'); if (x) x.addEventListener('click', function () { self.close(); });
    this.root.querySelector('[data-s="compose"]').addEventListener('submit', function (e) { e.preventDefault(); self.send(); });
    this.bindLead(this.root.querySelector('[data-lead] form'));
    if (window.CJShare) this.root.querySelectorAll('[data-cjs]').forEach(function (el) { window.CJShare.bind(el); });
    this.bindCallback(this.root.querySelector('[data-cbform]'));
    var showCb = function () { self.root.querySelectorAll('[data-cb]').forEach(function (b) { b.hidden = false; }); };
    if (CALLBACK.preview) showCb(); else callbackStatus().then(function (on) { if (on) showCb(); });
  };
  Guide.prototype.badge = function () { return guide().name + ' · Calm Joints guide'; };
  Guide.prototype.otherGuide = function () { var i = GUIDE_KEYS.indexOf(PICK); return GUIDE_KEYS[(i + 1) % GUIDE_KEYS.length]; };
  Guide.prototype.swapChip = function () {
    if (GUIDE_KEYS.length < 2) return '';
    var o = this.otherGuide();
    return '<button type="button" class="cjg-chip cjg-swap" data-a="swap" data-gswap aria-label="Talk with ' + esc(GUIDES[o].name) + ' instead"><img src="' + guideAv(o) + '" alt="" width="22" height="22"><span>' + esc(GUIDES[o].name) + '</span></button>';
  };
  Guide.prototype.paintGuide = function () {
    var g = guide(), self = this;
    this.root.setAttribute('data-guide', PICK);
    this.root.querySelectorAll('[data-gav]').forEach(function (i) { i.src = g.avatar || '/media/cj-guide-avatar.webp'; });
    this.root.querySelectorAll('[data-galt]').forEach(function (i) { i.alt = g.alt || (g.name + ', Calm Joints’ virtual guide (illustration)'); });
    this.root.querySelectorAll('[data-gname]').forEach(function (b) { b.textContent = self.badge(); });
    this.root.querySelectorAll('[data-gdisc]').forEach(function (b) { b.textContent = disclose(); });
    this.root.querySelectorAll('.cjg-pk').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-g') === PICK)); });
    var o = this.otherGuide();
    this.root.querySelectorAll('[data-gswap]').forEach(function (b) { b.setAttribute('aria-label', 'Talk with ' + GUIDES[o].name + ' instead'); b.querySelector('img').src = GUIDES[o].avatar || '/media/cj-guide-avatar.webp'; b.querySelector('span').textContent = GUIDES[o].name; });
  };
  Guide.prototype.setGuide = function (k) {
    if (!GUIDES[k] || k === PICK) { this.paintGuide(); return; }
    PICK = k;
    try { sessionStorage.setItem('cj_guide_pick', k); } catch (e) {}
    this.paintGuide(); this.track('pick');
    // Mid-conversation switch: end the current session and reconnect with the other guide in the same mode.
    var live = this.screen === 'chat' || this.screen === 'voice';
    if (!live) return;
    var self = this, voice = this.screen === 'voice';
    this.add('sys', 'You’re now talking with ' + esc(guide().name) + '.');
    var ended = this.stop(); this.conv = null; this.mode = null; this.starting = false; this.typing(false);
    Promise.resolve(ended).catch(function () {}).then(function () { if (voice) self.startVoice(); else self.startChat(); });
  };
  Guide.prototype.callbackForm = function () {
    return '<form novalidate data-cbform>' +
      '<label>First name<input name="first_name" autocomplete="given-name" maxlength="40" required></label>' +
      '<label>Mobile or home phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="416 555 0123" required></label>' +
      '<label class="cjg-check"><input type="checkbox" name="consent" value="yes" required><span>' + T.cbConsent + '</span></label>' +
      '<input name="company" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<button type="submit" class="cjg-btn pri">' + ICON.phone + 'Call me back</button>' +
      '<p class="cjg-note" style="margin:0">One call about your request. Canada and US numbers. No health history needed.</p>' +
      '<p class="cjg-msg" role="status" aria-live="polite"></p></form>';
  };
  Guide.prototype.bindCallback = function (form) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form), msg = form.querySelector('.cjg-msg'), btn = form.querySelector('button[type=submit]');
      if (f.get('company')) return;
      var name = String(f.get('first_name') || '').trim(), phone = String(f.get('phone') || '').replace(/\D/g, '');
      var err = !name ? 'Add your first name so the guide knows who to ask for.'
        : (phone.length !== 10 && !(phone.length === 11 && phone[0] === '1')) ? 'Enter a 10-digit phone number, like 416 555 0123.'
        : !f.get('consent') ? 'Tick the box so we know it’s okay to call you.' : '';
      if (err) { msg.className = 'cjg-msg err'; msg.textContent = err; return; }
      btn.disabled = true; msg.className = 'cjg-msg'; msg.textContent = 'Requesting your call…';
      fetch('/api/qr-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'guide-callback', first_name: name, phone: f.get('phone'), consent: true, src: CTX.src, venue: CTX.venue, page: location.pathname, session_id: SID }) })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (j) {
          if (j && j.ok) { msg.className = 'cjg-msg ok'; msg.textContent = j.message || 'Thanks. The Calm Joints guide will call you shortly.'; form.reset(); }
          else { btn.disabled = false; msg.className = 'cjg-msg err'; msg.textContent = (j && j.message) || 'We couldn’t start the call just now. You can chat or book a video visit instead.'; }
        }).catch(function () { btn.disabled = false; msg.className = 'cjg-msg err'; msg.textContent = 'We couldn’t start the call just now. You can chat or book a video visit instead.'; });
    });
  };
  Guide.prototype.leadForm = function () {
    return '<form novalidate data-leadform><p class="cjg-note" style="margin:0">Leave your email and we’ll send a link to book a video visit. Only what’s below. No health history.</p>' +
      '<div class="cjg-2"><label>First name (optional)<input name="first_name" autocomplete="given-name" maxlength="60"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label></div>' +
      '<div class="cjg-2"><label>Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="30"></label><label>Province<select name="province">' + opts(PROVS) + '</select></label></div>' +
      '<div class="cjg-2"><label>What’s sore<select name="area">' + opts(AREAS) + '</select></label><label>Preferred day<select name="day">' + opts(DAYS) + '</select></label></div>' +
      '<label>Time window<select name="win">' + opts(WINDOWS) + '</select></label>' +
      '<label class="cjg-check"><input type="checkbox" name="newsletter_opt_in" value="yes"><span>' + T.tips + '</span></label>' +
      '<label class="cjg-check"><input type="checkbox" name="intake_prefill" value="yes"><span>' + T.prefill + '</span></label>' +
      '<input name="company" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<button type="submit" class="cjg-btn pri">Email me a booking link</button><p class="cjg-msg" role="status" aria-live="polite"></p></form>';
  };
  Guide.prototype.bindLead = function (form) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form), msg = form.querySelector('.cjg-msg'), btn = form.querySelector('button[type=submit]');
      if (f.get('company')) return;
      var email = String(f.get('email') || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.className = 'cjg-msg err'; msg.textContent = 'That email doesn’t look quite right. Try once more?'; return; }
      var dt = [f.get('day'), f.get('win')].filter(Boolean).join(' ');
      btn.disabled = true; msg.className = 'cjg-msg'; msg.textContent = 'Sending…';
      postLead({ via: 'form', first_name: f.get('first_name'), email: email, phone: f.get('phone'), province: f.get('province'), area: f.get('area'), day_time: dt, newsletter_opt_in: !!f.get('newsletter_opt_in'), intake_prefill: !!f.get('intake_prefill') })
        .then(function (j) {
          btn.disabled = false;
          if (j && j.ok) { msg.className = 'cjg-msg ok'; var line = j.message || 'Got it. We’ll email you a link to book.'; msg.innerHTML = esc(line) + ' Or <a href="' + esc(bookingUrl(f.get('area'), f.get('province'))) + '" target="_blank" rel="noopener" data-a="book">book a video visit now</a>.'; }
          else { msg.className = 'cjg-msg err'; msg.textContent = (j && j.message) || 'We couldn’t save that just now. Email info@calmjoints.org.'; }
        }).catch(function () { btn.disabled = false; msg.className = 'cjg-msg err'; msg.textContent = 'We couldn’t save that just now. Email info@calmjoints.org.'; });
    });
  };
  Guide.prototype.show = function (s) {
    var chat = s === 'chat';
    this.root.querySelectorAll('[data-s]').forEach(function (el) {
      var k = el.getAttribute('data-s');
      el.hidden = !(k === s || (chat && (k === 'chat-tools' || k === 'compose')));
    });
    this.screen = s; this.paintGuide();
    if (chat) { var i = this.root.querySelector('#cjg-in'); if (i && window.matchMedia('(min-width: 700px)').matches) i.focus(); }
  };
  Guide.prototype.log = function () { return this.root.querySelector('[data-log="' + (this.mode === 'voice' ? 'voice' : 'chat') + '"]'); };
  Guide.prototype.add = function (who, html, cls) {
    var log = this.log(); var d = document.createElement('div');
    d.className = 'cjg-b ' + who + (cls ? ' ' + cls : ''); d.innerHTML = html; log.appendChild(d);
    var body = log.closest('.cjg-body'); body.scrollTop = body.scrollHeight; return d;
  };
  Guide.prototype.typing = function (on) {
    var log = this.log(); var t = log.querySelector('.cjg-typing');
    if (on && !t) { t = document.createElement('div'); t.className = 'cjg-typing'; t.innerHTML = '<img src="' + guideAv() + '" alt="" width="22" height="22">' + esc(guide().name) + ' is typing…'; log.appendChild(t); }
    else if (!on && t) t.remove();
    var body = log.closest('.cjg-body'); body.scrollTop = body.scrollHeight;
  };
  Guide.prototype.track = function (ev) {
    try { if (window.gtag) window.gtag('event', 'cj_guide_' + ev, { src: CTX.src, venue: CTX.venue, guide: PICK }); } catch (e) {}
  };
  Guide.prototype.tools = function () {
    var self = this;
    return {
      open_booking: function (p) {
        p = p || {};
        // A real slot link from get_next_availability opens that day on the Calm Joints booking page.
        var slot = String(p.book_url || '');
        var url = /^https:\/\/calmjoints\.janeapp\.com\/locations\/calm-joints\/book#\/[a-z0-9_\/-]+$/i.test(slot) ? slot : bookingUrl(p.area, p.province);
        self.track('book_tool'); noteBookClick(p.area, p.province);
        var w = null; try { w = window.open(url, '_blank', 'noopener'); } catch (e) {}
        self.add('ai', '<p><strong>Book a video visit' + (p.slot_label ? ' — ' + esc(p.slot_label) : '') + '</strong><br>' + T.bookLine + (p.slot_label ? ' Tap the ' + esc(String(p.slot_label).replace(/^.* at /, '')) + ' time to confirm it.' : ' You’ll pick a time on their booking page.') + '</p><p><a class="cjg-btn pri" style="color:#fff;margin-top:.4rem" href="' + esc(url) + '" target="_blank" rel="noopener" data-a="book">Open booking page</a></p>', 'card');
        return 'Booking page ' + (w ? 'opened in a new tab' : 'link shown as a button') + ': ' + url;
      },
      save_lead: function (p) {
        p = p || {};
        var lt = String(p.lead_type || '').toLowerCase(); lt = (lt === 'business' || lt === 'provider') ? lt : '';
        var biz = !!lt;
        return postLead({ via: self.mode === 'voice' ? 'voice' : 'chat', first_name: p.first_name, email: p.email, phone: p.phone, province: p.province, area: p.area, day_time: p.day_time, clicked_book: !!p.clicked_book, newsletter_opt_in: !!p.newsletter_opt_in, intake_prefill: !!(p.intake_prefill || p.intake_opt_in),
          lead_type: lt, profession: p.profession, audience: !!p.audience, hours_available: p.hours_available, work_mode: p.work_mode, city: p.city, business_type: p.business_type, interest: p.interest, company: p.company, role: p.role, note: p.note, callback_requested: !!p.callback_requested })
          .then(function (j) { return j && j.ok ? (biz ? 'Saved. Tell them the team will be in touch (by email, or a call back if they asked).' : ('Saved. Tell them: ' + (j.message || 'Got it. We’ll email you a link to book.'))) : 'Could not save (' + ((j && j.message) || 'error') + '). Offer info@calmjoints.org instead.'; })
          .catch(function () { return 'Could not save right now. Offer the booking link instead.'; });
      },
    };
  };
  Guide.prototype.session = function (voice) {
    var self = this;
    var g = guide();
    var first = (g.name ? T.openingNamed.replace('{name}', g.name) : T.opening) + (CTX.src === 'qr' ? T.qrAdd : '');
    if (voice && this.hadChat) first = 'I’m listening. What’s sore, or would you like to book a video visit?';
    this.connectedAt = 0;
    var tok = this.tok = (this.tok || 0) + 1; // ignore late events from a session we already ended (guide switch)
    return loadSdk().then(function (SDK) {
      var cfg = {
        agentId: g.agentId || AGENT_ID,
        // Voice and chat both use the WebSocket transport. WebRTC sessions were rejected at start-up
        // (call_initialization_error, auth 'invalid' under the agent's origin allowlist) and hung up instantly.
        connectionType: 'websocket',
        dynamicVariables: { src: CTX.src || 'site', venue: CTX.venue || 'none', mode: voice ? 'voice' : 'chat' },
        overrides: { agent: { firstMessage: first }, conversation: { textOnly: !voice } },
        clientTools: self.tools(),
        onMessage: function (m) {
          if (!m || !m.message || tok !== self.tok) return;
          if (m.source === 'ai' || m.role === 'agent') {
            if (voice) self.heard = true;
            self.typing(false); self.add('ai', fmt(m.message));
            // After ~4 exchanges in text chat, offer the post-help share once.
            if (!voice && (self.turns || 0) >= 4 && !self.helpedShown) setTimeout(function () { self.showHelped(false); }, 1500);
          }
          else if (voice) self.add('me', fmt(m.message));
        },
        onModeChange: function (m) { if (voice && tok === self.tok) { if (m.mode === 'speaking') self.heard = true; self.voiceState(m.mode); } },
        onStatusChange: function (s) { if (voice && s.status === 'connecting') self.voiceStatus('Connecting…'); },
        onError: function (msg) { console.warn('[cj-guide]', msg); },
        onConnect: function () { if (tok === self.tok) self.connectedAt = Date.now(); },
        onDisconnect: function (d) {
          if (tok !== self.tok) return; self.conv = null; self.typing(false);
          var early = self.connectedAt && Date.now() - self.connectedAt < 4000 && !(d && d.reason === 'user');
          if (voice) clearTimeout(self.voiceDog);
          if (voice && early && self.mode === 'voice') { self.track('voice_early_end'); return self.voiceFallback('Voice dropped on this connection, so I switched you to text.'); }
          if (voice && self.mode === 'voice') self.voiceStatus('Voice ended. You can switch to text or book a visit.');
        },
      };
      if (!voice) cfg.textOnly = true;
      return SDK.Conversation.startSession(cfg);
    });
  };
  Guide.prototype.stop = function () {
    var c = this.conv; this.conv = null;
    if (c) { try { return c.endSession(); } catch (e) {} }
    return Promise.resolve();
  };
  Guide.prototype.startChat = function () {
    var self = this;
    if (this.mode === 'chat' && this.conv) { this.show('chat'); return; }
    this.stop(); this.mode = 'chat'; this.hadChat = true; this.show('chat'); this.track('chat');
    this.typing(true);
    var send = this.root.querySelector('.cjg-compose button'); send.disabled = true;
    this.session(false).then(function (c) { self.conv = c; send.disabled = false; })
      .catch(function (e) { console.warn('[cj-guide] chat', e); self.typing(false); send.disabled = false; self.add('sys', 'The guide couldn’t connect just now. You can still <a href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener" data-a="book">book a video visit</a>.'); });
  };
  Guide.prototype.send = function () {
    var self = this, i = this.root.querySelector('#cjg-in'), text = (i.value || '').trim();
    if (!text) return;
    i.value = ''; this.turns = (this.turns || 0) + 1; this.add('me', fmt(text)); this.typing(true);
    var go = function () { try { self.conv.sendUserMessage(text); } catch (e) { self.typing(false); self.add('sys', 'Message didn’t send. Try once more?'); } };
    if (this.conv) go();
    else this.session(false).then(function (c) { self.conv = c; setTimeout(go, 400); }).catch(function () { self.typing(false); self.add('sys', 'The guide couldn’t connect just now.'); });
  };
  // One short disclosure line at the start of each chat / voice log (not repeated on reconnects).
  Guide.prototype.discloseOnce = function (mode) {
    this.disclosed = this.disclosed || {};
    if (this.disclosed[mode]) return; this.disclosed[mode] = true;
    var log = this.root.querySelector('[data-log="' + mode + '"]'); if (!log) return;
    var p = document.createElement('p'); p.className = 'cjg-disc in-log'; p.textContent = disclose(); log.appendChild(p);
  };
  Guide.prototype.voiceStatus = function (t) { var s = this.root.querySelector('.cjg-status'); if (s) s.textContent = t; };
  Guide.prototype.voiceState = function (mode) {
    var orb = this.root.querySelector('.cjg-orb'); orb.className = 'cjg-orb ' + (mode || '');
    this.voiceStatus(mode === 'speaking' ? 'Speaking…' : 'Listening…');
  };
  // iOS Safari: ask for the mic and unlock Web Audio inside the tap itself, before any async work,
  // otherwise the agent's audio context can stay suspended and the session sits on "Listening…" in silence.
  function primeAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ac = primeAudio.ac || (primeAudio.ac = new AC());
        if (ac.state !== 'running' && ac.resume) ac.resume();
        var src = ac.createBufferSource(); src.buffer = ac.createBuffer(1, 1, 22050); src.connect(ac.destination); src.start(0);
      }
    } catch (e) {}
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.reject(new Error('NotSupported: no microphone access in this browser'));
    return md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  }
  function stopStream(st) { try { st && st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
  Guide.prototype.startVoice = function () {
    var self = this;
    if (this.starting) return;
    this.starting = true; this.heard = false;
    this.stop(); this.mode = 'voice'; this.show('voice'); this.voiceStatus('Connecting…'); this.track('voice');
    var pre = null;
    primeAudio().then(function (st) { pre = st; return self.session(true); })
      .then(function (c) {
        self.conv = c; self.starting = false; self.voiceState('listening'); stopStream(pre);
        // Watchdog: if the guide hasn't said anything within 10s, voice isn't getting through on this
        // device. Move to text automatically so nobody is left staring at "Listening…".
        var tok = self.tok;
        clearTimeout(self.voiceDog);
        self.voiceDog = setTimeout(function () {
          if (tok === self.tok && self.mode === 'voice' && !self.heard) { self.track('voice_silent_fallback'); self.voiceFallback('Voice isn’t coming through on this device, so I switched you to text. ' + (guide().name || 'Your guide') + ' is right here.'); }
        }, 10000);
      })
      .catch(function (e) {
        self.starting = false; stopStream(pre); console.warn('[cj-guide] voice', e);
        var denied = e && /denied|NotAllowed|Permission/i.test(String(e.name || '') + String(e.message || e));
        self.track(denied ? 'voice_mic_denied' : 'voice_connect_fail');
        self.voiceFallback(denied ? 'Your microphone is off, so I switched you to text. You can type here instead.' : 'Voice couldn’t connect on this device, so I switched you to text.');
      });
  };
  // Never leave anyone stuck in voice: end it, open text chat, and say why in one plain line.
  Guide.prototype.voiceFallback = function (why) {
    var self = this;
    clearTimeout(this.voiceDog);
    var orb = this.root.querySelector('.cjg-orb'); if (orb) orb.className = 'cjg-orb';
    this.mode = null;
    Promise.resolve(this.stop()).catch(function () {}).then(function () {
      self.startChat();
      self.add('sys', esc(why));
    });
  };
  Guide.prototype.endVoice = function () { clearTimeout(this.voiceDog); this.stop(); this.voiceStatus('Voice ended. You can switch to text or book a visit.'); var orb = this.root.querySelector('.cjg-orb'); orb.className = 'cjg-orb'; };
  Guide.prototype.showLead = function () {
    var self = this;
    var card = this.add('ai', this.leadForm(), 'card');
    card.style.maxWidth = '100%';
    this.bindLead(card.querySelector('form'));
  };
  // Header "Share": opens the share sheet (Send them Glen / Send them Gwen) from any screen.
  Guide.prototype.headerShare = function () {
    this.track('share_header');
    if (window.CJShare && window.CJShare.openSheet) return window.CJShare.openSheet({ placement: this.o.onClose ? 'popup-header' : 'chat-header', first: PICK });
    return this.showShare();
  };
  Guide.prototype.showShare = function () {
    this.track('share');
    var card = this.add('ai', shareHtml({ placement: 'chat' }) || ('<p>Know someone who’s hurting? Send them Glen or Gwen: ' + fmt('https://calmjoints.org/chat?guide=' + PICK + '&ref=share') + '</p>'), 'card');
    card.style.maxWidth = '100%';
    var el = card.querySelector('[data-cjs]'); if (el && window.CJShare) window.CJShare.bind(el);
  };
  // "Glen helped? Pass it on" (js/helped.js): share card about the AI guide only, shared as src=helped.
  Guide.prototype.showHelped = function (tapped) {
    if (!window.CJHelped || this.helpedShown) return;
    this.helpedShown = true; this.track(tapped ? 'helped_tap' : 'helped_prompt');
    var g = guide(), card = this.add('ai', window.CJHelped.html({ name: g.name, key: PICK, avatar: g.avatar }), 'card');
    card.style.maxWidth = '100%';
    window.CJHelped.bind(card, { name: g.name, key: PICK, avatar: g.avatar });
    var chip = this.root.querySelector('[data-a="helped"]'); if (chip) chip.hidden = true;
  };
  Guide.prototype.close = function () { this.stop(); if (this.o.onClose) this.o.onClose(); };

  // ---- pop-up used by every Book / CTA button ----
  var dlg = null, popGuide = null;
  function openPopup(o) {
    o = o || {};
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'cjg-dlg'; dlg.setAttribute('aria-labelledby', 'cjg-title');
      var inner = document.createElement('div'); dlg.appendChild(inner); document.body.appendChild(dlg);
      popGuide = new Guide(inner, { leadOpen: true, onClose: function () { dlg.close(); } });
      dlg.addEventListener('cancel', function () { popGuide.stop(); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) { popGuide.stop(); dlg.close(); } });
    }
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
    // Talk pop-up hand-off: { guide: 'glen'|'gwen', start: 'chat'|'voice'|'consent' }.
    if (o.guide && GUIDES[o.guide] && o.guide !== PICK) {
      if (popGuide.conv || popGuide.starting) { popGuide.stop(); popGuide.conv = null; popGuide.mode = null; popGuide.starting = false; popGuide.typing(false); }
      PICK = o.guide;
      try { sessionStorage.setItem('cj_guide_pick', PICK); } catch (e) {}
      popGuide.paintGuide();
    }
    if (!popGuide.screen) popGuide.show('gate');
    popGuide.track('popup');
    if (o.start === 'chat') popGuide.startChat();
    else if (o.start === 'voice') popGuide.startVoice(); // still inside the tap: mic + audio unlock on iPhone
    else if (o.start === 'consent') popGuide.show('consent');
    return popGuide;
  }

  function mountPage(el, o) {
    var g = new Guide(el, o || {}); g.show('gate');
    return g;
  }

  function launcher() {
    // Pages with a "Talk to Glen or Gwen" button (header/hero/sticky) don't need the floating launcher too.
    if (document.querySelector('.cjg-launch') || document.querySelector('[data-talk]') || location.pathname.replace(/\/$/, '') === '/chat') return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cjg-launch';
    b.innerHTML = '<img src="/media/calm-joints-mark.svg" alt="" width="26" height="26">Talk with Calm Joints';
    b.addEventListener('click', function () { openPopup(); });
    document.body.appendChild(b);
  }

  window.CJGuide = { open: openPopup, mountPage: mountPage, bookingUrl: bookingUrl, ctx: CTX, preload: loadSdk, guide: function () { return { key: PICK, name: guide().name, agentId: guide().agentId }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launcher); else launcher();
})();
