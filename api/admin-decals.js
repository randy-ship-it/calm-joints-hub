// Manual fallback queue. CJ_ADMIN_KEY required.
// Lists paid orders with margin, artwork, and ship-to. POST marks an order placed or shipped.
const { send, readRaw } = require('../lib/intake');
const D = require('../lib/drive-orders');

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!D.adminAuthed(req, env)) { send(res, 401, { ok: false, message: 'Wrong key.' }); return; }
  if (req.method === 'GET') {
    try {
      const orders = await D.listOrders(env);
      send(res, 200, { ok: true, orders, adapters: D.adapterReport(env) });
    } catch (err) {
      console.error('[decals] list failed', err && err.message);
      send(res, 503, { ok: false, message: 'Could not load the queue.' });
    }
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body.slice(0, 20000)); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false, message: 'Send JSON with an order id.' }); return; }
  try {
    const id = body.id || body.order_id;
    const out = body.action === 'paid' ? await D.markPaid(id, env, { origin: D.originFrom(req) }) : await D.markOrdered(id, body, env);
    send(res, out.status, out.json);
  } catch (err) {
    console.error('[decals] mark failed', err && err.message);
    send(res, 503, { ok: false, message: 'Could not update that order.' });
  }
};
