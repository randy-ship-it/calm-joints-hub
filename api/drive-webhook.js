// Stripe fulfilment. The success page does not create the partner or the print job.
// checkout.session.completed fulfils only when payment_status is paid.
// checkout.session.async_payment_succeeded covers methods that settle later.
const D = require('../lib/drive-orders');

module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('{"ok":false}');
    return;
  }
  const missing = D.stripeMissing(env);
  if (missing.length) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Checkout webhook is not configured.', missing }));
    return;
  }
  let raw;
  try { raw = await D.rawBuffer(req); } catch {
    res.statusCode = 400;
    res.end('{"ok":false}');
    return;
  }
  let event;
  try {
    const Stripe = require('stripe');
    const client = new Stripe(String(env.STRIPE_SECRET_KEY).trim(), { apiVersion: '2026-09-30.endive' });
    event = client.webhooks.constructEvent(raw, req.headers['stripe-signature'], String(env.STRIPE_WEBHOOK_SECRET).trim());
  } catch (err) {
    console.error('[drive] webhook signature', err && err.message);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Bad signature.' }));
    return;
  }
  try {
    const out = await D.handleStripeEvent(event, env, { origin: D.originFrom(req) });
    res.statusCode = out.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out.json));
  } catch (err) {
    console.error('[drive] webhook fulfil failed', err && err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Fulfilment failed. Stripe will retry.' }));
  }
};
