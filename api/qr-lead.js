// Landing-page events for a QR partner: a visit (scan) or an email captured
// before we hand the visitor to booking. Tagged partner:<slug> for attribution.
// Also carries the Calm Joints guide's quick-triage leads (kind=guide-triage)
// and "Get a call back" requests (kind=guide-callback), sharing one function.
const crypto = require('crypto');
const { recordLead } = require('../lib/qr-partners');
const { recordGuideLead } = require('../lib/guide-lead');
const { requestCallback, callbackConfig } = require('../lib/guide-callback');
const { nextAvailability } = require('../lib/guide-availability');
const { clientIp, send, readRaw, rateLimit } = require('../lib/intake');

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

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    // Public status for the /chat page: is "Get a call back" switched on?
    const q = String(req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    if (params.get('kind') === 'guide-callback') { send(res, 200, { ok: true, enabled: callbackConfig(process.env).enabled }); return; }
    if (params.get('kind') === 'guide-availability') {
      // Read-only: next real openings on the partner clinic's public booking calendar (agent tool).
      if (!rateLimit(`avail:${clientIp(req)}`, { limit: 60 })) { send(res, 429, { ok: false }); return; }
      try { send(res, 200, await nextAvailability({ kind: params.get('visit') === 'followup' ? 'followup' : 'initial' })); }
      catch (err) { console.error('[guide-availability] failed', err && err.message); send(res, 200, { ok: false, message: 'Live availability could not be read right now. Offer today if available, otherwise the first available time, and open the booking page.' }); }
      return;
    }
    send(res, 405, { ok: false }); return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  if (!rateLimit(`qrl:${clientIp(req)}`, { limit: 20 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
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
