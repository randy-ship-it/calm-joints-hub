// Partner dashboard API. No passwords: a signed, time-limited link is emailed to the partner's address on file.
// POST { action:'login', email }      -> always the same reply (no account probing)
// GET  ?t=<token>                     -> dashboard JSON (counts and money only, never patient details)
// POST { action:'payout_setup', t }   -> asks the team to send a secure payment-provider invite
const L = require('../lib/partner-ledger');
const { clientIp, send, readRaw } = require('../lib/intake');

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'https://calmjoints.org');
  if (req.method === 'GET') {
    const slug = L.readToken(url.searchParams.get('t'), env);
    if (!slug) { send(res, 401, { ok: false, message: 'That link has expired. Ask for a new one below.' }); return; }
    try {
      const d = await L.dashboard(slug, env);
      if (!d) { send(res, 404, { ok: false, message: 'We couldn’t find that partner.' }); return; }
      send(res, 200, { ok: true, dashboard: d });
    } catch (err) { console.error('[portal] dash failed', err && err.message); send(res, 503, { ok: false, message: 'Your dashboard is busy. Try again in a minute.' }); }
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false, message: 'We couldn’t read that.' }); return; }
  try {
    if (body.action === 'login') {
      if (!L.rateLimit(`portal:${clientIp(req)}`, { limit: 5 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { send(res, 400, { ok: false, message: 'That email doesn’t look quite right.' }); return; }
      await L.sendLoginLink(email, env);
      send(res, 200, { ok: true, message: 'If that email is on a Calm Joints partner account, a sign-in link is on its way. Check your inbox.' });
      return;
    }
    if (body.action === 'payout_setup') {
      const slug = L.readToken(body.t, env);
      if (!slug) { send(res, 401, { ok: false, message: 'That link has expired. Ask for a new one.' }); return; }
      const out = await L.requestPayoutSetup(slug, env);
      send(res, out.status, out.json);
      return;
    }
    send(res, 400, { ok: false });
  } catch (err) { console.error('[portal] failed', err && err.message); send(res, 503, { ok: false, message: 'Something went wrong. Email info@calmjoints.org.' }); }
};
