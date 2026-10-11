// Admin-only ambassador partner create.
// Auth: Authorization: Bearer $CJ_ADMIN_KEY (or x-cj-admin-key).
// POST { slug, name, email, alias?, notify? }
// Writes the partner record and optional pen alias. Does not email the team.
// notify:true emails only the ambassador.
const crypto = require('crypto');
const { createAmbassador, getPartner } = require('../lib/qr-partners');
const { welcome } = require('../lib/partner-ledger');
const { send, readRaw, clientIp, rateLimit } = require('../lib/intake');

function authed(req, env) {
  const k = (env.CJ_ADMIN_KEY || '').trim();
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || String(req.headers['x-cj-admin-key'] || '').trim();
  if (!k || !h) return false;
  const a = crypto.createHash('sha256').update(h).digest();
  const b = crypto.createHash('sha256').update(k).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  const env = process.env;
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  if (!authed(req, env)) { send(res, 401, { ok: false, message: 'Wrong key.' }); return; }
  if (!rateLimit(`amb-admin:${clientIp(req)}`, { limit: 20 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body.slice(0, 20000)); } catch { body = null; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { send(res, 400, { ok: false, message: 'Send JSON with slug, name, and email.' }); return; }
  try {
    const out = await createAmbassador(body, env);
    if (out.status === 200 && (body.notify === true || body.notify === 'true')) {
      const full = await getPartner(out.json.partner.slug, env).catch(() => null);
      const mail = await welcome(full, env).catch(() => null);
      out.json.emailed = Boolean(mail && mail.ok);
    }
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[admin-partner] create failed', err && err.message);
    send(res, 503, { ok: false, message: 'Could not save that ambassador just now.' });
  }
};
