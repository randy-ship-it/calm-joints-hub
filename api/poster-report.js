// Report a Calm Joints poster. Emails the team. Never emails the partner.
const { submitReport, rateLimit } = require('../lib/poster-report');
const { clientIp, send, readRaw } = require('../lib/intake');

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return true;
  try { return new URL(origin).host === String(host).split(',')[0].trim(); } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  if (!sameOrigin(req)) { send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' }); return; }
  if (!rateLimit(`poster:${clientIp(req)}`, { limit: 6 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') {
    if (body.length > 2800000) { send(res, 400, { ok: false, message: 'That photo is too big. Try a smaller one.' }); return; }
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false, message: 'We couldn’t read that. Try once more?' }); return; }
  if (body.company_site) { send(res, 200, { ok: true, message: 'Thanks. We’ll ask them to take it down.' }); return; }
  try {
    const out = await submitReport(body, process.env);
    const pub = { ok: out.json.ok, message: out.json.message, matched: out.json.matched };
    if (!out.json.ok) pub.message = out.json.message;
    send(res, out.status, out.status === 200 ? { ok: true, message: out.json.message } : out.json);
  } catch (err) {
    console.error('[poster-report] failed', err && err.message);
    send(res, 503, { ok: false, message: 'We couldn’t save that just now. Email info@calmjoints.org with the photo.' });
  }
};
