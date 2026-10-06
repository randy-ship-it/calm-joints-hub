/**
 * Calm Joints guide — quick triage lead.
 * Posted by the guide pop-up / chat (form or the agent's save_lead tool) and
 * sent server-side to Friday (calmjoints org) as form=guide-triage.
 * Only the fields the guide instruction allows: first name, email, phone,
 * province, what's sore (label), preferred day/time window, src, venue,
 * clicked book, newsletter opt-in. No symptoms, no transcript, no history.
 */
const crypto = require('crypto');
const { PROVINCES, NOTIFY_EMAIL, SOURCE, FRIDAY_INTAKE_URL } = require('./intake');

// Same door as lib/intake.js postFriday, but keeps Friday's JSON (contact/deal ids).
async function postFriday(payload, env, fetchImpl) {
  const key = (env.INTAKE_WEBHOOK_SECRET || env.FRIDAY_API_KEY || '').trim();
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl(FRIDAY_INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}`, 'X-Intake-Secret': key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) console.error('[guide-lead] friday status', res.status);
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    console.error('[guide-lead] friday failed', err && err.message);
    return { ok: false };
  }
}

const AREAS = new Set(['knee', 'hip', 'back', 'neck', 'shoulder', 'other']);
const GUIDE_CONSENT_VERSION = 'guide-tips-v1-2026-10';
const GUIDE_CONSENT_TEXT = 'Yes, email me Get tips for sore joints from Calm Joints. I can unsubscribe anytime. Contact: info@calmjoints.org.';

function clean(v, max) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function slug(v, max) {
  return clean(v, max).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}
function truthy(v) {
  return v === true || v === 'on' || v === 'yes' || v === 'true' || v === '1';
}
function provinceCode(v) {
  const raw = clean(v, 40);
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (PROVINCES[up]) return up;
  const hit = Object.entries(PROVINCES).find(([, name]) => name.toLowerCase() === raw.toLowerCase());
  return hit ? hit[0] : null;
}
function areaLabel(v) {
  const a = clean(v, 30).toLowerCase().replace(/s$/, '');
  if (!a) return null;
  if (AREAS.has(a)) return a;
  if (/lower back|low back|spine/.test(a)) return 'back';
  return 'other';
}

function validateGuideLead(body) {
  const email = clean(body.email, 254).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'That email doesn’t look quite right. Try once more?' };
  }
  const firstName = clean(body.first_name || body.firstName || body.name, 60).split(' ')[0];
  if (firstName && !/^[\p{L}\p{M}][\p{L}\p{M}'’.\-]{0,59}$/u.test(firstName)) {
    return { error: 'First name can be letters and a hyphen — or leave it blank.' };
  }
  const phoneRaw = clean(body.phone, 30);
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, '') : '';
  if (phone && (phone.replace(/\D/g, '').length < 10 || phone.length > 16)) {
    return { error: 'That phone number looks short. Leave it blank if you like.' };
  }
  const optIn = truthy(body.newsletter_opt_in);
  return {
    value: {
      email,
      first_name: firstName || null,
      phone: phone || null,
      province: provinceCode(body.province),
      area: areaLabel(body.area),
      day_time: clean(body.day_time, 60) || null,
      src: slug(body.src, 40) || 'direct',
      venue: slug(body.venue, 60) || null,
      via: ['form', 'chat', 'voice'].includes(clean(body.via, 10)) ? clean(body.via, 10) : 'form',
      clicked_book: truthy(body.clicked_book),
      newsletter_opt_in: optIn,
      page: (() => { const p = clean(body.page, 200); return p.startsWith('/') ? p : null; })(),
      test: body.test === true || truthy(body.is_test),
    },
  };
}

function guideFridayBody(v, externalId) {
  const tags = ['calmjoints', 'cj-guide', 'guide-triage', `src:${v.src}`];
  if (v.venue) tags.push(`venue:${v.venue}`);
  if (v.area) tags.push(`area:${v.area}`);
  if (v.province) tags.push(`province:${v.province}`);
  if (v.clicked_book) tags.push('clicked-book');
  if (v.newsletter_opt_in) tags.push('newsletter', 'consent:casl-express');
  if (v.test) tags.push('test');
  const meta = {
    form: 'guide-triage',
    province: v.province,
    area: v.area,
    day_time: v.day_time,
    src: v.src,
    venue: v.venue,
    via: v.via,
    clicked_book: v.clicked_book,
    newsletter_opt_in: v.newsletter_opt_in,
    lead_source: v.src === 'qr' ? 'qr' : 'site',
    ...(v.phone ? { phone: v.phone } : {}),
    ...(v.newsletter_opt_in ? { consent: { type: 'express', law: 'CASL', version: GUIDE_CONSENT_VERSION, text: GUIDE_CONSENT_TEXT } } : {}),
    ...(v.test ? { is_test: true } : {}),
  };
  return {
    externalId,
    email: v.email,
    ...(v.first_name ? { firstName: v.first_name } : {}),
    ...(v.phone ? { phone: v.phone } : {}),
    site: SOURCE,
    org: 'calmjoints',
    source: 'cj-guide',
    form: 'guide-triage',
    path: v.page || '/chat',
    kind: 'form',
    notify_email: NOTIFY_EMAIL,
    tags,
    meta,
  };
}

async function recordGuideLead(body, env, fetchImpl = fetch) {
  const parsed = validateGuideLead(body || {});
  if (parsed.error) return { status: 400, json: { ok: false, message: parsed.error } };
  const v = parsed.value;
  // Stable per visitor session so a later "clicked book" updates the same record.
  const sid = slug(body.session_id, 64);
  const externalId = `cj-guide-${v.test ? 'test-' : ''}${sid || crypto.randomUUID()}`;
  const payload = guideFridayBody(v, externalId);
  const friday = await postFriday(payload, env, fetchImpl);
  let ids = null;
  if (friday.ok && friday.json) ids = { contactId: friday.json.contactId, dealId: friday.json.dealId };
  console.log(`[guide-lead] friday=${friday.ok ? 'ok' : 'no'} src=${v.src} venue=${v.venue || '-'} test=${v.test}${ids ? ` contact=${ids.contactId} deal=${ids.dealId}` : ''}`);
  if (!friday.ok) {
    return { status: 503, json: { ok: false, message: 'We couldn’t save that just now. Email info@calmjoints.org and we’ll follow up.' } };
  }
  return { status: 200, json: { ok: true, message: 'Got it. We’ll email you a link to book.', ...(v.test && ids ? ids : {}) } };
}

module.exports = { validateGuideLead, guideFridayBody, recordGuideLead, GUIDE_CONSENT_TEXT };
