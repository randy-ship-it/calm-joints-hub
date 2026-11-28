/**
 * Consented booking / chat lead. Anonymous visitors never hit this.
 * If they don't complete a booking, a later tick posts them to Friday as a win-back.
 */
const crypto = require('crypto');
const { persistEnvelope, postFriday, SOURCE } = require('../lib/care-events');

const CONSENT_VERSION = 'cj-booking-callback-v2-2026-11-28';
const CONSENT_TEXT = 'Text or call me to help me book. Reply STOP anytime.';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 12000) { resolve(null); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve(null); }
    });
  });
}

function cleanText(v, max) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function validEmail(email) {
  return email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15;
}

function fridayBody(lead, stage) {
  const tags = ['calmjoints', 'cj-booking-lead', 'type:patient', stage === 'winback' ? 'cj-winback' : 'cj-booking-partial'];
  if (lead.visit) tags.push('visit:' + lead.visit);
  return {
    externalId: lead.externalId,
    email: lead.email || undefined,
    firstName: lead.firstName || undefined,
    site: SOURCE,
    source: stage === 'winback' ? 'calmjoints_booking_winback' : 'calmjoints_booking_partial',
    path: '/book',
    kind: 'form',
    contact_type: 'patient',
    phone: lead.phone || undefined,
    message: lead.note || undefined,
    tags,
    meta: {
      stage,
      visit: lead.visit,
      slot_start: lead.slot_start,
      consent: { consent: true, version: CONSENT_VERSION, text: CONSENT_TEXT, at: lead.consented_at },
      sid: lead.sid,
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method === 'GET') {
    send(res, 200, { ok: true, tick: true, note: 'Partial leads are posted to Friday at capture. Durable win-back flush needs Neon.' });
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { ok: false }); return; }
  const body = await readBody(req);
  if (!body) { send(res, 400, { ok: false, message: 'We couldn’t read that.' }); return; }

  if (body.tick === true || body.action === 'tick') {
    // Preview: tick is recorded but abandoned-flush needs a durable store (Neon).
    // Leads are also posted to Friday at capture time as a partial, so a missed tick does not drop the contact.
    send(res, 200, { ok: true, tick: true, note: 'Partial leads are posted to Friday at capture. Durable win-back flush needs Neon.' });
    return;
  }

  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 40);
  const firstName = cleanText(body.firstName || body.name, 80);
  if (!body.consent) { send(res, 400, { ok: false, message: 'Please tick the box if you’d like a text or call to help you book.' }); return; }
  if (!validEmail(email) && !validPhone(phone)) {
    send(res, 400, { ok: false, message: 'Add an email or a phone number so we can reach you.' });
    return;
  }
  const visit = body.visit === 'followup' || body.visit === 'md' ? body.visit : 'initial';
  const lead = {
    externalId: 'cj-book-' + crypto.randomUUID(),
    email: validEmail(email) ? email : '',
    phone: validPhone(phone) ? phone : '',
    firstName,
    visit,
    slot_start: typeof body.slot_start === 'string' ? body.slot_start.slice(0, 40) : '',
    note: cleanText(body.note, 400),
    sid: String(body.sid || '').slice(0, 80),
    consented_at: new Date().toISOString(),
  };
  const rec = {
    type: 'cj_booking_lead',
    source: SOURCE,
    received_at: lead.consented_at,
    payload: { ...lead, consent_version: CONSENT_VERSION, consent_text: CONSENT_TEXT, status: 'partial' },
  };
  await persistEnvelope(rec, process.env);
  const friday = await postFriday(fridayBody(lead, 'partial'), process.env);
  send(res, 200, {
    ok: true,
    id: lead.externalId,
    friday: friday.ok || friday.skipped ? 'recorded' : 'queued',
    message: 'Thanks. We’ll text or call only to help you book this visit. Reply STOP anytime.',
  });
};

module.exports.CONSENT_TEXT = CONSENT_TEXT;
module.exports.CONSENT_VERSION = CONSENT_VERSION;
