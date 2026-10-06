/**
 * Calm Joints guide — "Get a call back".
 * The visitor leaves a first name, a phone number and explicit consent.
 * We save the lead to Friday the same way the guide's save_lead does
 * (form=guide-callback, no symptoms or history), then ask ElevenLabs to place
 * an outbound call from the Calm Joints guide agent.
 *
 * Off unless CJ_CALLBACK_ENABLED=1 AND ELEVENLABS_API_KEY AND
 * CJ_CALLBACK_PHONE_NUMBER_ID are set (Vercel env vars, never in the repo).
 * One call per phone number per 10 minutes (Blob marker + in-memory backup).
 */
const crypto = require('crypto');
const { NOTIFY_EMAIL, SOURCE, rateLimit } = require('./intake');
const { postFriday } = require('./guide-lead');

const DEFAULT_AGENT_ID = 'agent_8401m48tn2g5ehwsa0p84e8pnaf8';
const WINDOW_MS = 10 * 60 * 1000;
const CALLBACK_CONSENT_VERSION = 'guide-callback-v1-2026-10';
const CALLBACK_CONSENT_TEXT = 'I agree to receive a call from the Calm Joints AI guide about my request.';
const OUTBOUND_URL = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
const memory = new Map();

function clean(v, max) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function slug(v, max) {
  return clean(v, max).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}
function truthy(v) { return v === true || v === 'on' || v === 'yes' || v === 'true' || v === '1'; }
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// North American numbers only (Canada/US): returns E.164 (+1XXXXXXXXXX) or null.
function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  let d = digits;
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null; // NANP area code + exchange
  if (/^(800|833|844|855|866|877|888|900|911)/.test(d)) return null; // no toll-free / premium / 911
  return `+1${d}`;
}

function callbackConfig(env) {
  const apiKey = (env.ELEVENLABS_API_KEY || '').trim();
  const phoneNumberId = (env.CJ_CALLBACK_PHONE_NUMBER_ID || '').trim();
  const agentId = (env.CJ_GUIDE_AGENT_ID || DEFAULT_AGENT_ID).trim();
  const flag = (env.CJ_CALLBACK_ENABLED || '').trim() === '1';
  return { enabled: Boolean(flag && apiKey && phoneNumberId), flag, apiKey, phoneNumberId, agentId };
}

function validateCallback(body) {
  const firstName = clean(body.first_name || body.firstName || body.name, 40).split(' ')[0];
  if (!firstName || !/^[\p{L}\p{M}][\p{L}\p{M}'’.\-]{0,39}$/u.test(firstName)) {
    return { error: 'Add your first name (letters only) so the guide knows who to ask for.' };
  }
  const phone = toE164(clean(body.phone, 30));
  if (!phone) return { error: 'Enter a 10-digit Canadian or US phone number, like 416 555 0123.' };
  if (!truthy(body.consent)) return { error: 'Tick the box so we know it’s okay to call you.' };
  return {
    value: {
      first_name: firstName,
      phone,
      src: slug(body.src, 40) || 'chat',
      venue: slug(body.venue, 60) || null,
      page: (() => { const p = clean(body.page, 200); return p.startsWith('/') ? p : null; })(),
      test: body.test === true || truthy(body.is_test),
    },
  };
}

function firstMessage(name) {
  return `Hi ${name}, it’s the Calm Joints guide calling back like you asked. I’m an AI guide, not a physiotherapist. What’s going on with your joints?`;
}

function callbackFridayBody(v, externalId) {
  const tags = ['calmjoints', 'cj-guide', 'guide-callback', 'consent:call', `src:${v.src}`];
  if (v.venue) tags.push(`venue:${v.venue}`);
  if (v.test) tags.push('test');
  return {
    externalId,
    firstName: v.first_name,
    phone: v.phone,
    site: SOURCE,
    org: 'calmjoints',
    source: 'cj-guide',
    form: 'guide-callback',
    path: v.page || '/chat',
    kind: 'form',
    notify_email: NOTIFY_EMAIL,
    tags,
    meta: {
      form: 'guide-callback',
      phone: v.phone,
      src: v.src,
      venue: v.venue,
      via: 'callback',
      lead_source: v.src === 'qr' ? 'qr' : 'site',
      consent: { type: 'express', scope: 'one AI call-back about this request', version: CALLBACK_CONSENT_VERSION, text: CALLBACK_CONSENT_TEXT, at: new Date().toISOString() },
      ...(v.test ? { is_test: true } : {}),
    },
  };
}

function outboundBody(v, cfg) {
  return {
    agent_id: cfg.agentId,
    agent_phone_number_id: cfg.phoneNumberId,
    to_number: v.phone,
    conversation_initiation_client_data: {
      dynamic_variables: { src: 'callback', venue: v.venue || '', mode: 'phone', first_name: v.first_name },
      conversation_config_override: { agent: { first_message: firstMessage(v.first_name) } },
    },
  };
}

// ---- per-phone limit: Blob marker survives cold starts; memory map is the backup ----
function blob() { return require('@vercel/blob'); }
async function recentCall(phone, env, now) {
  const key = sha(`cjcb:${phone}`);
  const m = memory.get(key);
  if (m && now - m < WINDOW_MS) return true;
  if (!env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    const out = await blob().get(`cj-callback/rl/${key}.json`, { access: 'private', token: env.BLOB_READ_WRITE_TOKEN });
    if (!out || !out.stream) return false;
    const j = JSON.parse(await new Response(out.stream).text());
    return Boolean(j && j.at && now - j.at < WINDOW_MS);
  } catch { return false; }
}
async function markCall(phone, env, now) {
  const key = sha(`cjcb:${phone}`);
  memory.set(key, now);
  if (!env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await blob().put(`cj-callback/rl/${key}.json`, JSON.stringify({ at: now }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: env.BLOB_READ_WRITE_TOKEN });
  } catch (err) { console.error('[guide-callback] rl mark failed', err && err.message); }
}

async function placeCall(v, cfg, fetchImpl) {
  try {
    const res = await fetchImpl(OUTBOUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': cfg.apiKey },
      body: JSON.stringify(outboundBody(v, cfg)),
      signal: AbortSignal.timeout(15000),
    });
    let json = null; try { json = await res.json(); } catch { json = null; }
    const ok = res.ok && json && json.success !== false;
    if (!ok) console.error('[guide-callback] outbound status', res.status, json && (json.message || JSON.stringify(json.detail || '').slice(0, 200)));
    return { ok, status: res.status, conversationId: json && json.conversation_id };
  } catch (err) {
    console.error('[guide-callback] outbound failed', err && err.message);
    return { ok: false };
  }
}

/**
 * opts.dryRun: validate and build both payloads, but don't save, dial or rate-limit.
 */
async function requestCallback(body, env, fetchImpl = fetch, opts = {}) {
  const cfg = callbackConfig(env);
  if (body && body.company) return { status: 200, json: { ok: true, message: 'Thanks.' } }; // honeypot
  const parsed = validateCallback(body || {});
  if (parsed.error) return { status: 400, json: { ok: false, message: parsed.error } };
  const v = parsed.value;
  if (opts.dryRun) {
    const ob = outboundBody(v, { ...cfg, phoneNumberId: cfg.phoneNumberId || '(not set)' });
    return { status: 200, json: { ok: true, dry_run: true, enabled: cfg.enabled, flag: cfg.flag, has_api_key: Boolean(cfg.apiKey), has_phone_number_id: Boolean(cfg.phoneNumberId), outbound: { ...ob, to_number: v.phone.replace(/\d(?=\d{4})/g, '•') }, friday_form: 'guide-callback' } };
  }
  if (!cfg.enabled) {
    return { status: 503, json: { ok: false, gated: true, message: 'Call-backs aren’t switched on yet. You can chat with the guide or book a video visit now.' } };
  }
  const now = Date.now();
  if (await recentCall(v.phone, env, now)) {
    return { status: 429, json: { ok: false, message: 'We’re already calling that number. Give it 10 minutes before asking again.' } };
  }
  await markCall(v.phone, env, now);
  const externalId = `cj-callback-${v.test ? 'test-' : ''}${sha(v.phone).slice(0, 16)}-${now}`;
  const friday = await postFriday(callbackFridayBody(v, externalId), env, fetchImpl);
  const call = await placeCall(v, cfg, fetchImpl);
  console.log(`[guide-callback] friday=${friday.ok ? 'ok' : 'no'} call=${call.ok ? 'ok' : 'no'} src=${v.src} test=${v.test}${call.conversationId ? ` conv=${call.conversationId}` : ''}`);
  if (!call.ok) {
    return { status: 502, json: { ok: false, message: 'We couldn’t start the call just now. You can chat with the guide or book a video visit instead.' } };
  }
  return { status: 200, json: { ok: true, message: `Thanks, ${v.first_name}. The Calm Joints guide will call you in a minute or two.` } };
}

module.exports = { requestCallback, validateCallback, callbackConfig, callbackFridayBody, outboundBody, toE164, firstMessage, CALLBACK_CONSENT_TEXT, _memory: memory };
