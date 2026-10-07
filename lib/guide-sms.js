/**
 * Calm Joints guide by SMS ("Text Glen").
 * Twilio posts each inbound text to /api/sms (rewritten to api/qr-lead?kind=sms so the
 * function count stays the same). We validate X-Twilio-Signature, run the anti-abuse
 * and red-flag checks on the server, then relay the text to the Glen ElevenLabs agent
 * in text-only mode (mode=sms) and answer with TwiML.
 *
 * Stateless: conversation context, per-number caps, the 30-minute idle session and the
 * global daily ceiling are all read back from Twilio's own message log for this number,
 * so we store no SMS content anywhere else. Friday gets the phone number only (src:sms).
 * CASL: we only ever reply to someone who texted first; no follow-up marketing texts.
 */
const crypto = require('crypto');
const { SOURCE, NOTIFY_EMAIL } = require('./intake');
const { postFriday, recordGuideLead } = require('./guide-lead');

const DISCLAIMER = "Hi, I'm Glen, Calm Joints' AI guide (not a physio). If it's an emergency call 911. Reply STOP to opt out.";
const CHAT_LINK = 'https://calmjoints.org/chat?src=sms';
const BOOK_LINK = 'https://calmjoints.org/?intent=book';
const AGENT_ID = 'agent_8401m48tn2g5ehwsa0p84e8pnaf8';
// global: SMS replies/day across all numbers. Each text is one short ElevenLabs conversation and the
// Glen agent has a 200/day cap shared with /chat, so keep this well under it (env CJ_SMS_GLOBAL_DAILY).
const LIMITS = { day: 15, week: 40, global: 100, idleMs: 30 * 60 * 1000, maxChars: 300, redFlagDay: 4 };
const CAP_LINE = "That's the text limit for today. You can keep chatting with me anytime at https://calmjoints.org/chat?src=sms or book a video visit: https://calmjoints.org/?intent=book";
const BUSY_LINE = "I can't chat by text right now. Chat with me at https://calmjoints.org/chat?src=sms or book a video visit with a registered physiotherapist: https://calmjoints.org/?intent=book";
const US_LINE = 'Thanks for texting Calm Joints. Texting is Canada-only for now, but you can chat with our AI guide here: https://calmjoints.org/chat?src=sms';
const SLOW_LINE = "Sorry, I'm slow right now. You can chat with me at https://calmjoints.org/chat?src=sms or book a video visit: https://calmjoints.org/?intent=book";
const EMERGENCY_LINE = "That could be serious. Please call 911 or go to the nearest emergency department now. I'm an AI guide, not a physio, and I can't help with emergencies by text.";
// Guardrail stop or end_call: the reply ends with RESET_TAIL and the next text starts a fresh context.
const RESET_TAIL = 'Text again anytime to start a new chat.';
const RESET_LINE = "Sorry, I can't help with that. I'm Calm Joints' AI guide for joint pain and injuries. " + RESET_TAIL;
const CRISIS_LINE = "I'm sorry you're going through this. Please call or text 9-8-8 (Suicide Crisis Helpline) now, or call 911 if you're in danger. I'm an AI guide and can't help with this by text.";

// Carrier/Twilio keywords: Twilio handles these (opt-out, opt-in, help); we stay silent.
const OPT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'ARRET', 'ARRETE', 'START', 'UNSTOP', 'HELP', 'INFO', 'AIDE']);
const CA_AREA = new Set('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 403 416 418 428 431 437 438 450 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942'.split(' '));

const SPAM_RE = /\b(crypto|bitcoin|btc|usdt|forex|casino|betting|viagra|cialis|onlyfans|sugar ?daddy|gift ?cards?|free money|investment opportunit\w*|payday loan|loan approv\w*|click (here|the link|this link)|telegram|whats ?app me|earn \$|make money (fast|online|from home)|work from home|seo services?|backlinks?|promo code|you('ve| have) won|claim your (prize|reward))\b/i;
const URL_RE = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9][a-z0-9-]{0,62}\.(com|net|org|ly|io|co|xyz|info|biz|ru|cn|me|app|link|site|top|club|online|shop|live|click|ca|us|tk|gg)(\/\S*)?)/gi;
const EMAIL_RE = /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/gi;

const RED_FLAGS = [
  /\b911\b/, /\bemergenc(y|ies)\b/,
  /\bchest (pain|pressure|tightness)\b/, /\bheart attack\b/,
  /\b(can'?t|cannot|can ?not|trouble|hard to|struggling to) breath/, /\bshort(ness)? of breath\b/, /\bbreathless/,
  /\bstroke\b/, /\bface (is )?droop/, /\bslurr?(ed|ing) (speech|words)\b/, /\bsudden(ly)? (weak|numb|can'?t move)/,
  /\b(numb|numbness|tingling) (in|around) (my )?(groin|saddle|genitals|private|inner thighs?|butt|bum)/, /\bsaddle numb/,
  /\b(lost|losing|loss of|no) (control of )?(my )?(bladder|bowel)/, /\b(can'?t|cannot|can not|unable to) (pee|urinate)\b/, /\b(can'?t|cannot|can not|unable to|couldn'?t) (control|hold) (my )?(bladder|bowels?|pee|urine|poo)/, /\b(can'?t|cannot) feel (my )?(legs|feet)\b/, /\b(wet|peed|soiled) myself\b/, /\bincontinen/,
  /\bdislocat/, /\b(popped|came|is|still|stuck) out of (its |the )?(socket|place)\b/,
  /\b(can'?t|cannot|unable to) (walk|stand|bear weight|put weight)\b.*\b(fall|fell|crash|accident|hit)\b/, /\b(fall|fell|crash|accident)\b.*\b(can'?t|cannot|unable to) (walk|stand|bear weight|put weight)\b/,
  /\bbone (is )?(sticking|poking) out\b/, /\b(foot|hand|leg|arm|toes|fingers) (is |are |went |turned )?(cold|blue|white|pale) and (numb|cold|blue)/,
  /\b(hot|red),? swollen.*\bfever\b/, /\bfever\b.*\b(hot|red|swollen) (joint|knee|hip|shoulder|elbow|ankle)\b/,
  /\bpassed out\b/, /\bunconscious\b/, /\bbleeding (a lot|heavily|won'?t stop)\b/,
];
const CRISIS_RE = /\b(suicid\w*|kill (myself|me)|end (my|it all) life|end it all|want to die|self[- ]?harm|hurt myself)\b/i;
const NEG_RE = /\b(no|not|never|without|denies|don'?t have|haven'?t had|isn'?t|wasn'?t|no sign of)\b[^.?!]{0,25}$/i;

function redFlag(text) {
  const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'");
  if (CRISIS_RE.test(t)) return 'crisis';
  for (const re of RED_FLAGS) {
    const m = re.exec(t);
    if (m && !NEG_RE.test(t.slice(0, m.index))) return 'red';
  }
  return null;
}

function hasLink(text) {
  const t = String(text || '').replace(EMAIL_RE, ' ');
  const hits = t.match(URL_RE) || [];
  return hits.some((u) => !/(^|\/\/|\.)calmjoints\.org\b/i.test(u) && !/^e\.g\.?$/i.test(u));
}
function onlyLink(text) {
  const t = String(text || '').replace(URL_RE, '').replace(/\s+/g, '');
  return Boolean(String(text || '').match(URL_RE)) && t.length < 2;
}
function isSpam(text) { return hasLink(text) || SPAM_RE.test(String(text || '')); }

function isCanadian(from, fromCountry) {
  const d = String(from || '').replace(/[^\d+]/g, '');
  if (!/^\+1\d{10}$/.test(d)) return false;
  if (fromCountry && String(fromCountry).toUpperCase() !== 'CA') return false;
  return CA_AREA.has(d.slice(2, 5));
}

// Twilio signature: base64(HMAC-SHA1(authToken, url + sorted(key + value)...)).
function twilioSignature(authToken, url, params) {
  const data = Object.keys(params || {}).sort().reduce((acc, k) => {
    const v = params[k];
    return acc + (Array.isArray(v) ? v.map((x) => k + x).join('') : k + (v == null ? '' : v));
  }, url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}
function validSignature(authToken, url, params, header) {
  if (!authToken || !header) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(String(header));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// SMS-safe text: no markdown, GSM-7 friendly punctuation (curly quotes/dashes force UCS-2 = 3x cost).
function smsText(s, max = LIMITS.maxChars) {
  let t = String(s || '')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1: $2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,!?]|$)/g, '$1$2')
    .replace(/`+/g, '').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s*[—–]\s*/g, ' - ').replace(/…/g, '...').replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  // Too long: keep whole sentences from the start, but keep a closing question if there is one.
  const sents = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean); // URLs keep their dots
  const last = sents[sents.length - 1];
  const tail = sents.length > 1 && /\?$/.test(last) && last.length < max - 40 ? last : '';
  let out = '';
  for (const s2 of (tail ? sents.slice(0, -1) : sents)) {
    if ((out + ' ' + s2 + (tail ? ' ' + tail : '')).trim().length > max) break;
    out = (out + ' ' + s2).trim();
  }
  out = (out + (tail ? ' ' + tail : '')).trim();
  if (!out) out = t.slice(0, max - 3).replace(/\s+\S*$/, '') + '...';
  return out;
}

function twiml(text) {
  if (!text) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
}

// ---- Twilio REST (message log reads, async send) ----
function twAuth(env) { return 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'); }
function ymd(d) { return d.toISOString().slice(0, 10); }
async function listMessages(env, q, fetchImpl, pageSize = 100) {
  const p = new URLSearchParams({ PageSize: String(pageSize) });
  if (q.from) p.set('From', q.from);
  if (q.to) p.set('To', q.to);
  if (q.since) p.set('DateSent>', ymd(q.since));
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json?${p.toString()}`;
  const r = await fetchImpl(url, { headers: { Authorization: twAuth(env) }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('twilio list ' + r.status);
  const j = await r.json();
  return (j.messages || []).filter((m) => !q.direction || String(m.direction || '').startsWith(q.direction)).map((m) => ({ sid: m.sid, body: m.body || '', t: Date.parse(m.date_sent || m.date_created), status: m.status, direction: m.direction }));
}
async function sendSms(env, to, body, fetchImpl) {
  const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST', headers: { Authorization: twAuth(env), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: env.CJ_SMS_NUMBER, To: to, Body: body }).toString(), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) console.error('[sms] rest send failed', r.status);
  return r.ok;
}

// History for one number: inbound + outbound in the last 7 days, newest last.
// Same-account senders show each message twice (outbound-api + inbound legs), so filter by direction.
// Test numbers (CJ_SMS_TEST_NUMBERS) only count texts that carry the test prefix (see handleSms).
async function readState(env, from, msgSid, fetchImpl, now = Date.now(), testPrefix = '') {
  const weekAgo = new Date(now - 7 * 864e5);
  const today = new Date(now);
  const [inb, outb, globalOut] = await Promise.all([
    listMessages(env, { from, to: env.CJ_SMS_NUMBER, since: weekAgo, direction: 'inbound' }, fetchImpl),
    listMessages(env, { from: env.CJ_SMS_NUMBER, to: from, since: weekAgo, direction: 'outbound' }, fetchImpl),
    listMessages(env, { from: env.CJ_SMS_NUMBER, since: today, direction: 'outbound' }, fetchImpl, 1000).catch(() => []),
  ]);
  let inbound = inb.filter((m) => m.sid !== msgSid && now - m.t < 7 * 864e5);
  if (testPrefix) inbound = inbound.filter((m) => m.body.startsWith(testPrefix)).map((m) => ({ ...m, body: m.body.slice(testPrefix.length).trim() }));
  const outbound = outb.filter((m) => !/failed|undelivered|canceled/.test(m.status) && now - m.t < 7 * 864e5);
  const dayStart = Date.parse(ymd(today) + 'T00:00:00Z');
  const all = inbound.map((m) => ({ r: 'u', t: m.t, b: m.body }))
    .concat(outbound.map((m) => ({ r: 'a', t: m.t, b: m.body })))
    .sort((a, b) => a.t - b.t || (a.r === 'u' ? -1 : 1));
  // Session = messages since the last 30-minute gap.
  let start = all.length, prev = now;
  for (let i = all.length - 1; i >= 0; i--) { if (prev - all[i].t > LIMITS.idleMs) break; start = i; prev = all[i].t; }
  const session = all.slice(start);
  // Context for Glen starts after the last reset (guardrail stop / end_call) in this session.
  let ctxFrom = 0;
  session.forEach((m, i) => { if (m.r === 'a' && m.b.includes(RESET_TAIL)) ctxFrom = i + 1; });
  return {
    day: inbound.filter((m) => now - m.t < 864e5).length + 1,
    burst: inbound.filter((m) => now - m.t < 120e3).length + 1,
    week: inbound.length + 1,
    linkSender: inbound.some((m) => isSpam(m.body)),
    capSent: outbound.some((m) => now - m.t < 864e5 && m.body.startsWith(CAP_LINE.slice(0, 40))),
    usSent: outbound.some((m) => m.body.startsWith(US_LINE.slice(0, 40))),
    redFlagsToday: outbound.filter((m) => now - m.t < 864e5 && (m.body.includes(EMERGENCY_LINE.slice(0, 30)) || m.body.includes(CRISIS_LINE.slice(0, 30)))).length,
    globalToday: globalOut.filter((m) => m.t >= dayStart && !/failed|undelivered|canceled/.test(m.status)).length,
    session: session.slice(ctxFrom),
    newSession: !session.some((m) => m.r === 'a'),
  };
}

// ---- ElevenLabs relay (text-only websocket, one short conversation per text) ----
function historyText(session) {
  const turns = session.slice(-12).map((m) => {
    let b = m.b;
    if (m.r === 'a') b = b.replace(DISCLAIMER, '').trim();
    return b ? `${m.r === 'u' ? 'Person' : 'Glen'}: ${b}` : '';
  }).filter(Boolean);
  return turns.length ? 'Earlier in this SMS session (oldest first):\n' + turns.join('\n') : '';
}

function askGlen({ env, text, session, from, isTest, deadlineMs, WebSocketImpl, fetchImpl }) {
  const WS = WebSocketImpl || require('ws');
  const agentId = env.CJ_SMS_AGENT_ID || AGENT_ID;
  return new Promise((resolve) => {
    const out = [];
    let pendingTools = 0, quiet = null, done = false;
    const t0 = Date.now();
    const ws = new WS(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
    let closing = false;
    const finish = (why) => {
      if (done) return; done = true;
      clearTimeout(hard); clearTimeout(quiet);
      closing = true; try { ws.close(); } catch (e) { /* ignore */ }
      resolve({ text: out.join(' ').trim(), ms: Date.now() - t0, why });
    };
    const hard = setTimeout(() => finish('deadline'), deadlineMs);
    const settle = () => { clearTimeout(quiet); if (out.length && !pendingTools) quiet = setTimeout(() => finish('ok'), 900); };
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: { conversation: { text_only: true }, agent: { first_message: '' } },
        dynamic_variables: { src: 'sms', venue: 'none', mode: 'sms' },
      }));
      const ctx = historyText(session || []);
      if (ctx) ws.send(JSON.stringify({ type: 'contextual_update', text: ctx }));
      ws.send(JSON.stringify({ type: 'user_message', text }));
    });
    ws.on('message', async (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event && m.ping_event.event_id })); return; }
      if (m.type === 'agent_response') { const a = m.agent_response_event && m.agent_response_event.agent_response; if (a) out.push(a); settle(); return; }
      if (m.type === 'client_tool_call') {
        const c = m.client_tool_call || {}; pendingTools++; clearTimeout(quiet);
        let result = 'Done.';
        try {
          if (c.tool_name === 'open_booking') {
            const slot = String((c.parameters || {}).book_url || '');
            const url = /^https:\/\/calmjoints\.janeapp\.com\/locations\/calm-joints\/book#\/[a-z0-9_/-]+$/i.test(slot) ? slot : BOOK_LINK;
            result = `SMS channel: nothing opens on their phone. Text them this booking link in your reply: ${url}`;
          } else if (c.tool_name === 'save_lead') {
            const p = c.parameters || {};
            const r = await recordGuideLead({ ...p, phone: p.phone || from, src: 'sms', via: 'chat', page: '/api/sms', test: isTest }, env, fetchImpl);
            result = r.json && r.json.ok ? "Saved. Tell them: Got it. We'll email you a link to book." : 'Could not save. Give them the booking link instead.';
          }
        } catch (e) { result = 'Could not do that by text. Give them the booking link instead.'; }
        try { ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: c.tool_call_id, result, is_error: false })); } catch (e) { /* closed */ }
        pendingTools--; settle();
      }
    });
    ws.on('error', (e) => { console.error('[sms] ws error', e && e.message); finish('error'); });
    // Server-side close: 1008 + "guardrail" = guardrail stop; a close after a reply = end_call.
    ws.on('close', (code, reason) => {
      if (closing) return;
      const r = String(reason || '');
      if (code === 1008 && /guardrail/i.test(r)) return finish('guardrail');
      finish(out.length ? 'ended' : 'closed:' + code + (r ? ' ' + r.slice(0, 80) : ''));
    });
  });
}

function fridayBody(phone, isTest) {
  const externalId = `cj-sms-${isTest ? 'test-' : ''}${crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16)}`;
  const tags = ['calmjoints', 'cj-guide', 'guide-sms', 'src:sms'];
  if (isTest) tags.push('test');
  return {
    externalId, phone, site: SOURCE, org: 'calmjoints', source: 'cj-guide', form: 'guide-sms', path: '/api/sms', kind: 'form',
    notify_email: NOTIFY_EMAIL, tags,
    meta: { form: 'guide-sms', phone, src: 'sms', via: 'sms', lead_source: 'sms', ...(isTest ? { is_test: true } : {}) },
  };
}

function listEnv(v) { return String(v || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean); }

/**
 * Decide the reply for one inbound text. Returns { reply, later, log } where `later`
 * (optional) is a promise for work that may finish after we answer Twilio.
 */
async function handleSms(params, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const t0 = deps.t0 || Date.now();
  const from = String(params.From || '').trim();
  let body = String(params.Body || '').trim();
  const isTest = listEnv(env.CJ_SMS_TEST_NUMBERS).includes(from);
  // Internal test senders (e.g. another of our own numbers that has its own auto-responder):
  // only texts starting with CJ_SMS_TEST_PREFIX are answered, so two bots can't loop.
  const testPrefix = isTest ? (env.CJ_SMS_TEST_PREFIX || '[cjtest]') : '';
  const log = { from: from.replace(/\d(?=\d{4})/g, '*'), len: body.length };
  const word = body.toUpperCase().replace(/[^A-Z]/g, '');
  if (OPT_KEYWORDS.has(word) && body.length <= 12) return { reply: '', log: { ...log, step: 'keyword' } };
  if (listEnv(env.CJ_SMS_BLOCKLIST).includes(from)) return { reply: '', log: { ...log, step: 'blocklist' } };
  if (!/^\+\d{8,15}$/.test(from)) return { reply: '', log: { ...log, step: 'bad-from' } };

  if (testPrefix) {
    if (!body.startsWith(testPrefix)) return { reply: '', log: { ...log, step: 'test-number-no-prefix' } };
    body = body.slice(testPrefix.length).trim();
  }
  const st = await readState(env, from, params.MessageSid, fetchImpl, Date.now(), testPrefix);
  log.day = st.day; log.week = st.week; log.global = st.globalToday;

  if (!isCanadian(from, params.FromCountry)) {
    // +1 non-Canadian (US): one polite line pointing to the web chat (no 10DLC yet). Others: nothing.
    if (/^\+1\d{10}$/.test(from) && !st.usSent) return { reply: US_LINE, log: { ...log, step: 'us-line' } };
    return { reply: '', log: { ...log, step: 'non-ca-drop' } };
  }
  if (st.linkSender) return { reply: '', log: { ...log, step: 'blocked-link-sender' } };
  // Bursts (6+ texts in 2 minutes) look like a bot or a loop with another auto-responder: stay silent.
  if (st.burst > 6) return { reply: '', log: { ...log, step: 'burst-drop' } };
  if (body.length < 2 || onlyLink(body)) return { reply: '', log: { ...log, step: 'too-short-or-link' } };
  if (isSpam(body)) return { reply: '', log: { ...log, step: 'spam-blocked' } };

  const flag = redFlag(body);
  if (flag) {
    if (st.redFlagsToday >= LIMITS.redFlagDay) return { reply: '', log: { ...log, step: 'redflag-capped' } };
    const line = flag === 'crisis' ? CRISIS_LINE : EMERGENCY_LINE;
    return { reply: line, later: st.newSession ? postFriday(fridayBody(from, isTest), env, fetchImpl) : null, log: { ...log, step: 'red-flag-' + flag } };
  }
  if (st.day > LIMITS.day || st.week > LIMITS.week) {
    if (st.capSent) return { reply: '', log: { ...log, step: 'capped-drop' } };
    return { reply: CAP_LINE, log: { ...log, step: 'cap-line' } };
  }
  const prefix = st.newSession ? DISCLAIMER + ' ' : '';
  const friday = st.newSession ? postFriday(fridayBody(from, isTest), env, fetchImpl).then((r) => { console.log(`[sms] friday=${r && r.ok ? 'ok' : 'no'} test=${isTest}`); return r; }) : null;
  if (st.globalToday >= (Number(env.CJ_SMS_GLOBAL_DAILY) || LIMITS.global)) return { reply: prefix + BUSY_LINE, later: friday, log: { ...log, step: 'global-ceiling' } };

  const budget = Math.max(3000, (Number(env.CJ_SMS_BUDGET_MS) || 11500) - (Date.now() - t0));
  const glen = askGlen({ env, text: body.slice(0, 600), session: st.session, from, isTest, deadlineMs: 25000, WebSocketImpl: deps.WebSocket, fetchImpl });
  const raced = await Promise.race([glen, new Promise((r) => setTimeout(() => r(null), budget))]);
  if (raced) {
    let answer;
    if (raced.why === 'guardrail') answer = RESET_LINE;
    else if (raced.why === 'ended' && raced.text) answer = smsText(raced.text, LIMITS.maxChars - RESET_TAIL.length - 1) + ' ' + RESET_TAIL;
    else answer = raced.text ? smsText(raced.text, Math.max(180, LIMITS.maxChars - prefix.length)) : SLOW_LINE;
    return { reply: prefix + answer, later: friday, log: { ...log, step: 'glen', glen_ms: raced.ms, why: raced.why } };
  }
  // Glen is slow: answer Twilio now (empty) and send the reply by REST when it lands.
  const later = Promise.all([friday, glen.then((g) => sendSms(env, from, prefix + (g.why === 'guardrail' ? RESET_LINE : g.text ? smsText(g.text) + (g.why === 'ended' ? ' ' + RESET_TAIL : '') : SLOW_LINE), fetchImpl))]);
  return { reply: '', later, log: { ...log, step: 'glen-async' } };
}

module.exports = {
  handleSms, validSignature, twilioSignature, smsText, redFlag, isSpam, hasLink, onlyLink, isCanadian, twiml, fridayBody, historyText,
  DISCLAIMER, CAP_LINE, BUSY_LINE, RESET_LINE, RESET_TAIL, US_LINE, EMERGENCY_LINE, CRISIS_LINE, LIMITS,
};
