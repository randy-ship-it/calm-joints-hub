// Landing-page events for a QR partner: a visit (scan) or an email captured
// before we hand the visitor to booking. Tagged partner:<slug> for attribution.
const { recordLead } = require('../lib/qr-partners');
const { recordGuideLead } = require('../lib/guide-lead');
const { clientIp, send, readRaw, rateLimit } = require('../lib/intake');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  if (!rateLimit(`qrl:${clientIp(req)}`, { limit: 20 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body.slice(0, 4000)); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false }); return; }
  if (body.kind === 'guide-triage') {
    const origin = req.headers.origin;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    let sameSite = true;
    try { if (origin && host) sameSite = new URL(origin).host === host; } catch { sameSite = false; }
    if (!sameSite) { send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' }); return; }
  }
  try {
    // Calm Joints guide quick-triage leads share this function (kind=guide-triage).
    const out = body.kind === 'guide-triage'
      ? await recordGuideLead(body, process.env)
      : await recordLead(body, process.env);
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[qr-lead] failed', err && err.message);
    send(res, 503, { ok: false, message: 'We’ll still get you booked.' });
  }
};
