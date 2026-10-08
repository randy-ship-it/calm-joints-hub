// Landing-page events for a QR partner: a visit (scan) or an email captured
// before we hand the visitor to booking. Tagged partner:<slug> for attribution.
// Also carries the Calm Joints guide's quick-triage leads (kind=guide-triage)
// and "Get a call back" requests (kind=guide-callback), sharing one function.
// Also answers "Text Glen" SMS: Twilio posts to /api/sms, rewritten here as kind=sms.
const crypto = require('crypto');
const { recordLead } = require('../lib/qr-partners');
const { recordGuideLead } = require('../lib/guide-lead');
const { requestCallback, callbackConfig } = require('../lib/guide-callback');
const { nextAvailability } = require('../lib/guide-availability');
const { clientIp, send, readRaw, rateLimit } = require('../lib/intake');
const sms = require('../lib/guide-sms');
const { recordShareEvent, shareStats } = require('../lib/share-events');

function sameSite(req) {
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try { if (origin && host) return new URL(origin).host === host; } catch { return false; }
  return true;
}
function adminOk(req) {
  const want = (process.env.CJ_ADMIN_KEY || '').trim();
  const got = String(req.headers['x-cj-admin-key'] || '').trim();
  if (!want || !got || want.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

function isSms(req) {
  const u = String(req.url || '');
  if (u.startsWith('/api/sms')) return true;
  const q = (req.query && req.query.kind) || new URLSearchParams(u.split('?')[1] || '').get('kind');
  return q === 'sms';
}
function laterTask(p) {
  if (!p) return Promise.resolve();
  try { const { waitUntil } = require('@vercel/functions'); waitUntil(p); return Promise.resolve(); } catch (e) { return p.catch(() => {}); }
}
async function smsHandler(req, res) {
  const t0 = Date.now();
  const xml = (code, text) => { res.statusCode = code; res.setHeader('Content-Type', 'text/xml; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(sms.twiml(text)); };
  if (req.method !== 'POST') { xml(405, ''); return; }
  let params = req.body;
  if (params == null || typeof params === 'string' || Buffer.isBuffer(params)) {
    const raw = typeof params === 'string' ? params : Buffer.isBuffer(params) ? params.toString('utf8') : await readRaw(req);
    params = Object.fromEntries(new URLSearchParams(raw));
  }
  const env = process.env;
  const url = env.CJ_SMS_WEBHOOK_URL || 'https://calmjoints.org/api/sms';
  if (!sms.validSignature(env.TWILIO_AUTH_TOKEN, url, params, req.headers['x-twilio-signature'])) { console.warn('[sms] bad signature'); xml(403, ''); return; }
  if (env.CJ_SMS_NUMBER && params.To && params.To !== env.CJ_SMS_NUMBER) { xml(200, ''); return; }
  let out;
  try { out = await sms.handleSms(params, env, { t0 }); }
  catch (err) { console.error('[sms] failed', err && err.message); out = { reply: '', log: { step: 'error' } }; }
  console.log('[sms]', JSON.stringify({ ...out.log, ms: Date.now() - t0 }));
  await laterTask(out.later);
  xml(200, out.reply);
}

// "Share your AI recovery concierge" counts: sendBeacon posts text/plain JSON with kind=share-event.
// Own rate limit so share taps never use up the lead budget.
function asShareEvent(body) {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { if (!body.includes('"share-event"')) return null; try { body = JSON.parse(body.slice(0, 1000)); } catch { return null; } }
  return body && typeof body === 'object' && body.kind === 'share-event' ? body : null;
}
async function shareEventHandler(req, res, body) {
  if (!sameSite(req)) { send(res, 403, { ok: false }); return; }
  if (!rateLimit(`share:${clientIp(req)}`, { limit: 40 })) { send(res, 429, { ok: false }); return; }
  const out = await recordShareEvent(body, process.env);
  send(res, out.status, out.json);
}

module.exports = async function handler(req, res) {
  if (isSms(req)) return smsHandler(req, res);
  if (req.method === 'GET') {
    // Public status for the /chat page: is "Get a call back" switched on?
    const q = String(req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    if (params.get('kind') === 'guide-callback') { send(res, 200, { ok: true, enabled: callbackConfig(process.env).enabled }); return; }
    if (params.get('kind') === 'guide-availability') {
      // Read-only: next real openings on the Calm Joints public booking calendar (agent tool).
      if (!rateLimit(`avail:${clientIp(req)}`, { limit: 60 })) { send(res, 429, { ok: false }); return; }
      try { send(res, 200, await nextAvailability({ kind: params.get('visit') === 'followup' ? 'followup' : 'initial' })); }
      catch (err) { console.error('[guide-availability] failed', err && err.message); send(res, 200, { ok: false, message: 'Live availability could not be read right now. Offer today if available, otherwise the first available time, and open the booking page.' }); }
      return;
    }
    if (params.get('kind') === 'share-stats') {
      // Admin-only: share counts by guide / day / placement (anonymous events from js/share.js).
      if (!adminOk(req)) { send(res, 403, { ok: false }); return; }
      try { send(res, 200, await shareStats(process.env)); } catch (err) { console.error('[share] stats failed', err && err.message); send(res, 503, { ok: false }); }
      return;
    }
    send(res, 405, { ok: false }); return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  const shareEv = asShareEvent(body);
  if (shareEv) return shareEventHandler(req, res, shareEv);
  if (!rateLimit(`qrl:${clientIp(req)}`, { limit: 20 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  if (typeof body === 'string') { try { body = JSON.parse(body.slice(0, 4000)); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false }); return; }
  if ((body.kind === 'guide-triage' || body.kind === 'guide-callback') && !sameSite(req)) {
    send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' }); return;
  }
  try {
    let out;
    if (body.kind === 'guide-callback') {
      const dryRun = body.dry_run === true && adminOk(req);
      if (!dryRun && !rateLimit(`cb-ip:${clientIp(req)}`, { limit: 3 })) { send(res, 429, { ok: false, message: 'Too many call-back requests. Try again in a few minutes.' }); return; }
      out = await requestCallback(body, process.env, fetch, { dryRun });
    } else if (body.kind === 'guide-triage') {
      // Calm Joints guide quick-triage leads share this function.
      out = await recordGuideLead(body, process.env);
    } else {
      out = await recordLead(body, process.env);
    }
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[qr-lead] failed', err && err.message);
    send(res, 503, { ok: false, message: 'We’ll still get you booked.' });
  }
};
