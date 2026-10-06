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
    body: 'I’m a Calm Joints guide, not a physiotherapist. This is general education, not an assessment, diagnosis, or treatment plan. A registered physiotherapist provides your care.',
    e911: 'If you have chest pain, trouble breathing, sudden weakness, new bowel or bladder changes, or pain after a major fall, stop and call 911 or go to emergency.',
    foot: 'Not a physio. Not official advice. Book a registered physiotherapist at <a href="https://calmjoints.org" target="_blank" rel="noopener">calmjoints.org</a>.',
    consent: 'Voice stays in this session. We don’t keep it as a health record. You can switch to text anytime.',
    opening: 'Hi, I’m the Calm Joints guide. I can explain common joint pain in plain language, or book you a video visit with a registered physiotherapist. I’m not a physio, and this isn’t a diagnosis.',
    qrAdd: ' You can book from here. You’ll book through our partner clinic.',
    bookLine: 'You’ll book through our partner clinic.',
    tips: 'Get tips for sore joints — short notes from the clinic, unsubscribe anytime.',
    cbConsent: 'I agree to receive a call from the Calm Joints AI guide about my request.',
    cbIntro: 'Leave your first name and number. The Calm Joints AI guide will call you in a minute or two. It’s not a physiotherapist, and it can help you book a video visit.',
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
  var CTX = { src: slug(qs.get('src'), 40) || (location.pathname.replace(/\/$/, '') === '/chat' ? 'chat' : 'site'), venue: slug(qs.get('venue')) || '' };
  try {
    if (CTX.src === 'qr' || CTX.venue) sessionStorage.setItem('cj_guide_ctx', JSON.stringify(CTX));
    else { var saved = JSON.parse(sessionStorage.getItem('cj_guide_ctx') || 'null'); if (saved && saved.src) CTX = saved; }
  } catch (e) {}
  var SID = (function () { try { var s = sessionStorage.getItem('cj_guide_sid'); if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); sessionStorage.setItem('cj_guide_sid', s); } return s; } catch (e) { return String(Date.now()); } })();
  var leadSaved = null; // last lead fields sent this session

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
    var body = Object.assign({ kind: 'guide-triage', src: CTX.src, venue: CTX.venue, session_id: SID, page: location.pathname }, fields);
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
      '<div class="cjg-head"><img src="/media/calm-joints-mark.svg" alt="" width="30" height="30"><b>Calm Joints</b>' +
      (o.onClose ? '<button type="button" class="cjg-x" aria-label="Close">&times;</button>' : '') + '</div>' +
      '<div class="cjg-body" data-s="gate">' +
        '<div class="cjg-card"><span class="cjg-av"><img src="/media/cj-guide-avatar.webp" alt="" width="64" height="64"></span><span class="cjg-card-t"><span class="cjg-badge">Calm Joints guide</span><b>Ask me about your injury</b><small>AI guide · not a physiotherapist</small></span></div>' +
        '<h2 id="cjg-title">' + T.title + '</h2><p>' + T.body + '</p><p class="cjg-911" role="note"><strong>Emergency?</strong> ' + T.e911 + '</p>' +
        '<div class="cjg-actions"><button type="button" class="cjg-btn pri" data-a="chat">' + ICON.chat + 'Chat</button>' +
        '<button type="button" class="cjg-btn" data-a="voice">' + ICON.mic + 'Voice</button>' +
        '<a class="cjg-btn soft" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">' + ICON.cal + 'Book a video visit</a>' +
        '<button type="button" class="cjg-btn" data-a="callback" data-cb hidden>' + ICON.phone + 'Get a call back</button></div>' +
        '<p class="cjg-note" style="text-align:center">' + T.bookLine + '</p>' +
        '<details' + (o.leadOpen ? ' open' : '') + ' data-lead><summary>Quick triage by email</summary>' + this.leadForm() + '</details>' +
      '</div>' +
      '<div class="cjg-body" data-s="consent" hidden><h2>Voice</h2><p>' + T.consent + '</p>' +
        '<div class="cjg-actions"><button type="button" class="cjg-btn pri" data-a="voice-go">' + ICON.mic + 'Start voice</button><button type="button" class="cjg-btn" data-a="chat">' + ICON.chat + 'Use text instead</button></div></div>' +
      '<div class="cjg-body" data-s="voice" hidden><div class="cjg-orb" aria-hidden="true"><img src="/media/cj-guide-avatar.webp" alt="" width="132" height="132"></div><div class="cjg-badge" style="display:table;margin:0 auto .5rem">Calm Joints guide</div><div class="cjg-status" aria-live="polite">Connecting…</div>' +
        '<div class="cjg-row" style="justify-content:center;margin-bottom:.8rem"><button type="button" class="cjg-chip" data-a="voice-end">End voice</button><button type="button" class="cjg-chip" data-a="chat">Switch to text</button><a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a></div>' +
        '<div class="cjg-log" data-log="voice" aria-live="polite"></div></div>' +
      '<div class="cjg-body" data-s="callback" hidden><h2>Get a call back</h2><p>' + T.cbIntro + '</p>' + this.callbackForm() +
        '<div class="cjg-row" style="margin-top:.9rem"><button type="button" class="cjg-chip" data-a="chat">Chat instead</button><a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a></div>' +
        '<p class="cjg-note cjg-911" style="margin-top:.9rem"><strong>Emergency?</strong> Call 911. Don’t wait for a call back.</p></div>' +
      '<div class="cjg-body" data-s="chat" hidden><div class="cjg-log" data-log="chat" aria-live="polite"></div></div>' +
      '<div class="cjg-tools" data-s="chat-tools" hidden><a class="cjg-chip pri" data-a="book" href="' + esc(bookingUrl('', '')) + '" target="_blank" rel="noopener">Book a video visit</a><button type="button" class="cjg-chip" data-a="voice">Switch to voice</button><button type="button" class="cjg-chip" data-a="lead">Email me a link</button><button type="button" class="cjg-chip" data-a="callback" data-cb hidden>Get a call back</button></div>' +
      '<form class="cjg-compose" data-s="compose" hidden autocomplete="off"><label class="cjg-sr" for="cjg-in">Message</label><input id="cjg-in" name="m" placeholder="Ask about knee, hip, back, neck or shoulder pain" maxlength="600" enterkeyhint="send"><button type="submit">Send</button></form>' +
      '<div class="cjg-foot">' + T.foot + '</div>';
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
    });
    var x = this.root.querySelector('.cjg-x'); if (x) x.addEventListener('click', function () { self.close(); });
    this.root.querySelector('[data-s="compose"]').addEventListener('submit', function (e) { e.preventDefault(); self.send(); });
    this.bindLead(this.root.querySelector('[data-lead] form'));
    this.bindCallback(this.root.querySelector('[data-cbform]'));
    var showCb = function () { self.root.querySelectorAll('[data-cb]').forEach(function (b) { b.hidden = false; }); };
    if (CALLBACK.preview) showCb(); else callbackStatus().then(function (on) { if (on) showCb(); });
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
      postLead({ via: 'form', first_name: f.get('first_name'), email: email, phone: f.get('phone'), province: f.get('province'), area: f.get('area'), day_time: dt, newsletter_opt_in: !!f.get('newsletter_opt_in') })
        .then(function (j) {
          btn.disabled = false;
          if (j && j.ok) { msg.className = 'cjg-msg ok'; msg.innerHTML = 'Got it. We’ll email you a link to book. Or <a href="' + esc(bookingUrl(f.get('area'), f.get('province'))) + '" target="_blank" rel="noopener" data-a="book">book a video visit now</a>.'; }
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
    this.screen = s;
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
    if (on && !t) { t = document.createElement('div'); t.className = 'cjg-typing'; t.innerHTML = '<img src="/media/cj-guide-avatar.webp" alt="" width="22" height="22">Calm Joints guide is typing…'; log.appendChild(t); }
    else if (!on && t) t.remove();
    var body = log.closest('.cjg-body'); body.scrollTop = body.scrollHeight;
  };
  Guide.prototype.track = function (ev) {
    try { if (window.gtag) window.gtag('event', 'cj_guide_' + ev, { src: CTX.src, venue: CTX.venue }); } catch (e) {}
  };
  Guide.prototype.tools = function () {
    var self = this;
    return {
      open_booking: function (p) {
        p = p || {};
        // A real slot link from get_next_availability opens that day on the partner clinic's booking page.
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
        return postLead({ via: self.mode === 'voice' ? 'voice' : 'chat', first_name: p.first_name, email: p.email, phone: p.phone, province: p.province, area: p.area, day_time: p.day_time, clicked_book: !!p.clicked_book, newsletter_opt_in: !!p.newsletter_opt_in,
          lead_type: lt, profession: p.profession, audience: !!p.audience, hours_available: p.hours_available, work_mode: p.work_mode, city: p.city, business_type: p.business_type, interest: p.interest, company: p.company, role: p.role, note: p.note, callback_requested: !!p.callback_requested })
          .then(function (j) { return j && j.ok ? (biz ? 'Saved. Tell them the team will be in touch (by email, or a call back if they asked).' : 'Saved. Tell them: Got it. We’ll email you a link to book.') : 'Could not save (' + ((j && j.message) || 'error') + '). Offer info@calmjoints.org instead.'; })
          .catch(function () { return 'Could not save right now. Offer the booking link instead.'; });
      },
    };
  };
  Guide.prototype.session = function (voice) {
    var self = this;
    var first = T.opening + (CTX.src === 'qr' ? T.qrAdd : '');
    if (voice && this.hadChat) first = 'I’m listening. What’s sore, or would you like to book a video visit?';
    return loadSdk().then(function (SDK) {
      var cfg = {
        agentId: AGENT_ID,
        connectionType: voice ? 'webrtc' : 'websocket',
        dynamicVariables: { src: CTX.src || 'site', venue: CTX.venue || 'none', mode: voice ? 'voice' : 'chat' },
        overrides: { agent: { firstMessage: first }, conversation: { textOnly: !voice } },
        clientTools: self.tools(),
        onMessage: function (m) {
          if (!m || !m.message) return;
          if (m.source === 'ai' || m.role === 'agent') { self.typing(false); self.add('ai', fmt(m.message)); }
          else if (voice) self.add('me', fmt(m.message));
        },
        onModeChange: function (m) { if (voice) self.voiceState(m.mode); },
        onStatusChange: function (s) { if (voice && s.status === 'connecting') self.voiceStatus('Connecting…'); },
        onError: function (msg) { console.warn('[cj-guide]', msg); },
        onDisconnect: function () { self.conv = null; self.typing(false); if (voice && self.mode === 'voice') self.voiceStatus('Voice ended. You can switch to text or book a visit.'); },
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
    i.value = ''; this.add('me', fmt(text)); this.typing(true);
    var go = function () { try { self.conv.sendUserMessage(text); } catch (e) { self.typing(false); self.add('sys', 'Message didn’t send. Try once more?'); } };
    if (this.conv) go();
    else this.session(false).then(function (c) { self.conv = c; setTimeout(go, 400); }).catch(function () { self.typing(false); self.add('sys', 'The guide couldn’t connect just now.'); });
  };
  Guide.prototype.voiceStatus = function (t) { var s = this.root.querySelector('.cjg-status'); if (s) s.textContent = t; };
  Guide.prototype.voiceState = function (mode) {
    var orb = this.root.querySelector('.cjg-orb'); orb.className = 'cjg-orb ' + (mode || '');
    this.voiceStatus(mode === 'speaking' ? 'Speaking…' : 'Listening…');
  };
  Guide.prototype.startVoice = function () {
    var self = this;
    if (this.starting) return;
    this.starting = true;
    this.stop(); this.mode = 'voice'; this.show('voice'); this.voiceStatus('Connecting…'); this.track('voice');
    this.session(true).then(function (c) { self.conv = c; self.starting = false; self.voiceState('listening'); })
      .catch(function (e) {
        self.starting = false; console.warn('[cj-guide] voice', e);
        var denied = e && /denied|NotAllowed|Permission/i.test(String(e.name || '') + String(e.message || e));
        self.voiceStatus(denied ? 'Microphone is off. You can switch to text anytime.' : 'Voice couldn’t connect just now. You can switch to text.');
      });
  };
  Guide.prototype.endVoice = function () { this.stop(); this.voiceStatus('Voice ended. You can switch to text or book a visit.'); var orb = this.root.querySelector('.cjg-orb'); orb.className = 'cjg-orb'; };
  Guide.prototype.showLead = function () {
    var self = this;
    var card = this.add('ai', this.leadForm(), 'card');
    card.style.maxWidth = '100%';
    this.bindLead(card.querySelector('form'));
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
    if (!popGuide.screen) popGuide.show('gate');
    popGuide.track('popup');
    if (o.start === 'chat') popGuide.startChat();
    return popGuide;
  }

  function mountPage(el, o) {
    var g = new Guide(el, o || {}); g.show('gate');
    return g;
  }

  function launcher() {
    if (document.querySelector('.cjg-launch') || location.pathname.replace(/\/$/, '') === '/chat') return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cjg-launch';
    b.innerHTML = '<img src="/media/calm-joints-mark.svg" alt="" width="26" height="26">Talk with Calm Joints';
    b.addEventListener('click', function () { openPopup(); });
    document.body.appendChild(b);
  }

  window.CJGuide = { open: openPopup, mountPage: mountPage, bookingUrl: bookingUrl, ctx: CTX, preload: loadSdk };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launcher); else launcher();
})();
