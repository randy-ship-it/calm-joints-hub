// Cimpress Open status callback. Rejected unless CIMPRESS_WEBHOOK_SECRET matches.
const { send } = require('../lib/intake');
const D = require('../lib/drive-orders');

module.exports.config = { api: { bodyParser: false } };

function mapStatus(body) {
  const status = String(body.status || body.orderStatus || '').toLowerCase();
  const next = status === 'shipped' ? 'shipped' : (status === 'processing' || status === 'in_process' || status === 'in-process' ? 'processing' : '');
  return {
    orderId: body.orderId || body.order_id || (body.order && body.order.orderId) || '',
    status: next,
    tracking: body.tracking || body.trackingNumber || body.tracking_number || (body.shipment && body.shipment.trackingNumber) || null,
    carrier: body.carrier || null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  const env = process.env;
  let raw;
  try { raw = await D.rawBuffer(req); } catch { send(res, 400, { ok: false, message: 'Empty body.' }); return; }
  const auth = D.printerAuthed(req, raw, env, 'CIMPRESS_WEBHOOK_SECRET', 'x-cimpress-signature');
  if (!auth.ok) { send(res, auth.status, auth.json); return; }
  let body;
  try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { send(res, 400, { ok: false, message: 'Send JSON.' }); return; }
  const patch = mapStatus(body);
  if (!patch.orderId || !patch.status) { send(res, 200, { ok: true, ignored: true }); return; }
  const order = await D.applyPrinterStatus(patch.orderId, patch, env);
  send(res, 200, { ok: true, updated: Boolean(order), status: order && order.status });
};
