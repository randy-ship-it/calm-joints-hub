// Printful status callback. Rejected unless PRINTFUL_WEBHOOK_SECRET matches.
// package_shipped stores tracking. in_process stores processing.
const { send } = require('../lib/intake');
const D = require('../lib/drive-orders');

module.exports.config = { api: { bodyParser: false } };

function mapStatus(body) {
  const type = String(body.type || '').toLowerCase();
  const data = body.data || {};
  const order = data.order || body.order || {};
  const shipment = data.shipment || body.shipment || {};
  const rawStatus = String(order.status || data.status || body.status || '').toLowerCase();
  let status = '';
  if (type === 'package_shipped' || type === 'order_shipped' || rawStatus === 'shipped') status = 'shipped';
  else if (type === 'order_in_process' || type === 'in_process' || rawStatus === 'in_process' || rawStatus === 'processing') status = 'processing';
  return {
    orderId: order.external_id || data.external_id || body.external_id || '',
    status,
    tracking: shipment.tracking_number || shipment.tracking || data.tracking_number || null,
    carrier: shipment.carrier || shipment.service || null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { ok: false, message: 'Use POST.' }); return; }
  const env = process.env;
  let raw;
  try { raw = await D.rawBuffer(req); } catch { send(res, 400, { ok: false, message: 'Empty body.' }); return; }
  const auth = D.printerAuthed(req, raw, env, 'PRINTFUL_WEBHOOK_SECRET', 'x-printful-signature');
  if (!auth.ok) { send(res, auth.status, auth.json); return; }
  let body;
  try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { send(res, 400, { ok: false, message: 'Send JSON.' }); return; }
  const patch = mapStatus(body);
  if (!patch.orderId || !patch.status) { send(res, 200, { ok: true, ignored: true }); return; }
  const order = await D.applyPrinterStatus(patch.orderId, patch, env);
  send(res, 200, { ok: true, updated: Boolean(order), status: order && order.status });
};
