// QR partner program: POST creates a partner (self-serve), GET returns the
// public skin (venue name + logo) for /p/<slug>, GET &logo=1 streams the logo.
const { Readable } = require('stream');
const { createPartner, getPartner, publicPartner } = require('../lib/qr-partners');
const { clientIp, send, readRaw, rateLimit } = require('../lib/intake');
const { welcome } = require('../lib/partner-ledger');

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return true;
  try { return new URL(origin).host === String(host).split(',')[0].trim(); } catch { return false; }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'https://calmjoints.org');
  if (req.method === 'GET') {
    const partner = await getPartner((url.searchParams.get('slug') || '').toLowerCase(), process.env);
    if (!partner) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false}'); return; }
    if (url.searchParams.get('logo') === '1') {
      if (!partner.logo_path) { res.statusCode = 404; res.end('Not found'); return; }
      try {
        const { get } = require('@vercel/blob');
        const out = await get(partner.logo_path, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
        res.statusCode = 200;
        res.setHeader('Content-Type', partner.logo_mime || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        Readable.fromWeb(out.stream).pipe(res);
      } catch (err) {
        console.error('[qr-partner] logo failed', err && err.message);
        res.statusCode = 502; res.end('Could not load that logo.');
      }
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end(JSON.stringify({ ok: true, partner: publicPartner(partner) }));
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  if (!sameOrigin(req)) { send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' }); return; }
  if (!rateLimit(`qrp:${clientIp(req)}`, { limit: 6 })) { send(res, 429, { ok: false, message: 'Easy there. Try again in a few minutes.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') {
    if (body.length > 1200000) { send(res, 400, { ok: false, message: 'That logo is too big. Try a smaller PNG.' }); return; }
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false, message: 'We couldn’t read that. Try once more?' }); return; }
  try {
    const out = await createPartner(body, process.env);
    if (out.status === 200 && out.json.partner) {
      const full = await getPartner(out.json.partner.slug, process.env).catch(() => null);
      await welcome(full, process.env).catch(() => null);
    }
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[qr-partner] create failed', err && err.message);
    send(res, 503, { ok: false, message: 'We couldn’t save that just now. Email info@calmjoints.org and we’ll set you up by hand.' });
  }
};
