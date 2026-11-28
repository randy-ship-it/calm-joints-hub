/**
 * First-party booking funnel events. Anonymous by default (session id only).
 * No email, phone, or name on this endpoint — those go to /api/booking-lead with consent.
 *
 * Events: site_visit, booking_page_view, slots_shown, slot_picked,
 *         booking_started, booking_completed, exit
 */
const fs = require('fs');
const path = require('path');
const { persistEnvelope } = require('../lib/care-events');

const EVENTS = new Set([
  'site_visit', 'booking_page_view', 'slots_shown', 'slot_picked',
  'booking_started', 'booking_completed', 'exit',
]);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 8000) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

function cleanSid(v) {
  const s = String(v || '').trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(s) ? s : '';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  const body = await readBody(req);
  if (!body) { send(res, 400, { ok: false }); return; }
  const event = String(body.e || body.event || '').slice(0, 40);
  if (!EVENTS.has(event)) { send(res, 400, { ok: false, message: 'Unknown event' }); return; }
  const sid = cleanSid(body.sid);
  const rec = {
    type: 'cj_funnel',
    source: 'calmjoints.org',
    received_at: new Date().toISOString(),
    payload: {
      e: event,
      ts: body.ts || new Date().toISOString(),
      sid,
      path: String(body.path || '').slice(0, 180),
      visit: body.visit === 'followup' || body.visit === 'md' ? body.visit : (body.visit === 'initial' ? 'initial' : ''),
      slots_count: Number.isFinite(Number(body.slots_count)) ? Number(body.slots_count) : undefined,
      slot_start: typeof body.slot_start === 'string' ? body.slot_start.slice(0, 40) : undefined,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 40) : undefined,
    },
  };
  try { await persistEnvelope(rec, process.env); } catch (err) { console.error('[funnel]', err && err.message); }
  send(res, 204, { ok: true });
};
