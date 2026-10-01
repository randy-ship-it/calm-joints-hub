// Server-to-server partner ledger intake. Auth: Bearer INTAKE_WEBHOOK_SECRET.
// POST { type: booking|visit|adjustment|payout, slug? | patient_email?, ref, product: cj|scalehub, billed?, net?, share?, amount?, source? }
// POST { action: 'payout_setup', slug, status: requested|invited|ready }
// GET  (Vercel cron, Bearer CRON_SECRET) runs payout-setup reminders for every partner.
const L = require('../lib/partner-ledger');
const { send, readRaw } = require('../lib/intake');

module.exports = async function handler(req, res) {
  const env = process.env;
  if (req.method === 'GET') {
    if (!L.cronAuthed(req, env) && !L.serverAuthed(req, env)) { send(res, 401, { ok: false }); return; }
    const slugs = new Set((await L.listAll('qr-partners/', env)).map((b) => (b.pathname.split('/')[1] || '')).filter(Boolean));
    const out = {};
    for (const s of slugs) out[s] = (await L.runNudges(s, env).catch(() => ({ sent: ['error'] }))).sent;
    send(res, 200, { ok: true, partners: slugs.size, sent: out });
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  if (!L.serverAuthed(req, env)) { send(res, 401, { ok: false, message: 'Unauthorized.' }); return; }
  let body = req.body;
  if (body == null && typeof req.on === 'function') body = await readRaw(req);
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { ok: false, message: 'Send JSON.' }); return; }
  try {
    const list = Array.isArray(body.events) ? body.events.slice(0, 200) : [body];
    const results = [];
    for (const ev of list) {
      const out = ev.action === 'payout_setup' ? await L.setPayoutStatus(String(ev.slug || '').toLowerCase(), String(ev.status || ''), env, ev.note) : await L.recordEvent(ev, env);
      results.push({ status: out.status, ...out.json });
    }
    if (Array.isArray(body.events)) send(res, 200, { ok: true, results });
    else send(res, results[0].status, results[0]);
  } catch (err) {
    console.error('[partner-events] failed', err && err.message);
    send(res, 503, { ok: false, message: 'Could not record that just now.' });
  }
};
