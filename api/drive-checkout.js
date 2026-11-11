// Public kit prices for /drive.
// CJ_DRIVE_MODE=manual records an order and reserves the handle. This form never accepts card numbers.
// Otherwise POST starts Stripe Checkout only when CJ_DRIVE_LIVE is exactly "true".
// GET returns the charm price only. Costs and margin stay off this response.
const { send, readRaw } = require('../lib/intake');
const D = require('../lib/drive-orders');

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://calmjoints.org');
    const handle = url.searchParams.get('handle');
    if (handle) {
      const parsed = D.parseHandle(handle);
      if (parsed.error) { send(res, 200, { ok: true, available: false, message: parsed.error }); return; }
      try {
        const taken = await D.handleTaken(parsed.handle, env);
        send(res, 200, { ok: true, available: !taken, handle: parsed.handle });
      } catch (err) {
        console.error('[drive] handle check failed', err && err.message);
        send(res, 503, { ok: false, message: 'Could not check that handle.' });
      }
      return;
    }
    const mode = D.driveMode(env);
    send(res, 200, { ok: true, live: mode !== 'closed', mode, catalog: D.catalog() });
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  if (!sameOrigin(req)) { send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') {
    try { body = JSON.parse(body.slice(0, 20000)); } catch { body = null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { send(res, 400, { ok: false, message: 'We couldn’t read that.' }); return; }
  try {
    const ctx = { ip: D.clientIp(req), origin: D.originFrom(req) };
    const out = D.driveMode(env) === 'manual' ? await D.createManualOrder(body, env, ctx) : await D.createCheckout(body, env, ctx);
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[drive] checkout failed', err && err.message);
    send(res, 503, { ok: false, message: 'Checkout could not start. Nothing was charged.' });
  }
};
