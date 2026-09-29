// Landing-page events for a QR partner: a visit (scan) or an email captured
// before we hand the visitor to booking. Tagged partner:<slug> for attribution.
const { recordLead } = require('../lib/qr-partners');
const { clientIp, send, readRaw, rateLimit } = require('../lib/intake');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  if (!rateLimit(`qrl:${clientIp(req)}`, { limit: 20 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body.slice(0, 4000)); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false }); return; }
  try {
    const out = await recordLead(body, process.env);
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[qr-lead] failed', err && err.message);
    send(res, 503, { ok: false, message: 'We’ll still get you booked.' });
  }
};
