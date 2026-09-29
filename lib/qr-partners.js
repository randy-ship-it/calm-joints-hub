/**
 * Calm Joints QR partner program.
 * A partner (venue, arena, studio, recovery audience) signs up on /partners,
 * gets a unique slug, an optional co-brand logo, and a QR code that points at
 * https://calmjoints.org/p/<slug>. Visits and emails captured on that landing
 * page are tagged partner:<slug> so billing can be attributed later.
 *
 * Storage: private Vercel Blob (records + logos) and Friday CRM (people).
 */
const crypto = require('crypto');
const { postFriday, sendEmailAlert, sendAlert, rateLimit } = require('./intake');

const SITE = 'https://calmjoints.org';
const LOGO_MAX = 800 * 1024;
const LOGO_TYPES = {
  png: { mime: 'image/png', magic: (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' },
  jpg: { mime: 'image/jpeg', magic: (b) => b.slice(0, 3).toString('hex') === 'ffd8ff' },
  webp: { mime: 'image/webp', magic: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
};
const VENUE_TYPES = {
  arena: 'Sports arena or rink',
  court: 'Courts, clubs and leagues',
  gym: 'Gym or fitness studio',
  recovery: 'Recovery or wellness studio',
  event: 'Events and tournaments',
  other: 'Something else',
};

const PARTNER_TERMS = {
  version: 'cj-partner-2026-09-29d',
  text: [
      "Partnership, not a referral fee. Calm Joints does not pay for patients or referrals. Your location and Clairvoyant Holdings Inc., operating as Calm Joints, form a commercial partnership under the Partnerships Act (Ontario) to serve your own customers who have recovery needs.",
      "Partnership revenue. Visits booked through your code are billed in the partnership’s name, and that revenue belongs to the partnership.",
      "Profit and your share. Partnership profit is billed revenue minus physiotherapist pay and card processing fees. Your location’s share is 25% of that profit and Calm Joints’ share is 75%. Both sides share in the proceeds, and in the commercial risks, in those same proportions.",
      "Care stays with Calm Joints. All care is given by registered physiotherapists engaged by Calm Joints, which alone handles clinical decisions, booking, health records, privacy and billing. You never receive or handle patient health information.",
      "Your part. Display the kit as we provide it. Don’t change it, add health claims or promises about results, or offer patients anything of value to book.",
      "Independent parties. Neither side is the other’s agent or employee, and neither can sign or commit on the other’s behalf.",
      "Statements and payouts. We send a monthly statement, with no patient details, and pay your share on the last day of each month for the prior month’s collected patient activity. Each side handles its own income taxes. HST is handled as set out in the signed partner agreement.",
      "No guarantees. Calm Joints doesn’t promise any number of visits or any level of earnings. Calculator figures are estimates only.",
      "Liability. Each side is responsible for its own premises, staff and conduct. Calm Joints is not liable for indirect, incidental or consequential losses or lost profits, and its total liability to you is limited to the share paid to you in the 12 months before a claim. You agree to cover claims that come from your premises or from statements you make that aren’t in the kit.",
      "Ending it. Either side can end the partnership with 30 days’ notice by email. Shares earned before the end date are still paid.",
      "Signed agreement governs. A written partner agreement, which we send after sign-up, sets out these terms in full and governs if anything differs. No share is paid until it’s signed. Ontario law applies."
  ],
};

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254; }
function validSlug(s) { return typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(s); }

function makeSlug(venue) {
  const base = clean(venue, 60).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'partner';
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

function parseLogo(raw) {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: 'We couldn’t read that logo. Try a PNG or JPG?' };
  const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) return { error: 'Logos can be PNG, JPG or WebP.' };
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch { buf = null; }
  if (!buf || !buf.length) return { error: 'That logo looks empty.' };
  if (buf.length > LOGO_MAX) return { error: 'That logo is over 800 KB. A smaller PNG works great.' };
  if (!LOGO_TYPES[ext].magic(buf)) return { error: 'That file doesn’t look like an image.' };
  return { value: { ext, mime: LOGO_TYPES[ext].mime, buffer: buf } };
}

function blob() { return require('@vercel/blob'); }

async function putJson(path, obj, env, overwrite) {
  return blob().put(path, JSON.stringify(obj), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: Boolean(overwrite), token: env.BLOB_READ_WRITE_TOKEN });
}

async function readJson(path, env) {
  const out = await blob().get(path, { access: 'private', token: env.BLOB_READ_WRITE_TOKEN });
  if (!out || !out.stream) return null;
  const text = await new Response(out.stream).text();
  return JSON.parse(text);
}

async function getPartner(slug, env) {
  if (!validSlug(slug)) return null;
  try { return await readJson(`qr-partners/${slug}/partner.json`, env); } catch { return null; }
}

function publicPartner(p) {
  return {
    slug: p.slug,
    venue: p.venue,
    venue_type: p.venue_type,
    logo_url: p.logo_path ? `${SITE}/api/qr-partner?slug=${p.slug}&logo=1` : null,
    landing_url: `${SITE}/p/${p.slug}`,
  };
}

async function createPartner(body, env, ctx = {}) {
  const name = clean(body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const venue = clean(body.venue, 80);
  const venueType = VENUE_TYPES[clean(body.venue_type, 20)] ? clean(body.venue_type, 20) : 'other';
  const phone = clean(body.phone, 40);
  const city = clean(body.city, 80);
  if (!venue || venue.length < 2) return { status: 400, json: { ok: false, message: 'What’s the name of your venue or group?' } };
  if (!name || name.length < 2) return { status: 400, json: { ok: false, message: 'What should we call you?' } };
  if (!validEmail(email)) return { status: 400, json: { ok: false, message: 'That email doesn’t look quite right.' } };
  if (body.agree !== true && body.agree !== 'on' && body.agree !== 'true') return { status: 400, json: { ok: false, message: 'Tick the box to accept the partner terms.' } };
  const logo = parseLogo(body.logo);
  if (logo.error) return { status: 400, json: { ok: false, message: logo.error } };
  if (!env.BLOB_READ_WRITE_TOKEN) return { status: 503, json: { ok: false, message: 'Partner sign-up is warming up. Email info@calmjoints.org and we’ll set you up by hand.' } };

  const slug = makeSlug(venue);
  const now = (ctx.now || new Date()).toISOString();
  let logoPath = null;
  if (logo.value) {
    logoPath = `qr-partners/${slug}/logo.${logo.value.ext}`;
    await blob().put(logoPath, logo.value.buffer, { access: 'private', contentType: logo.value.mime, addRandomSuffix: false, allowOverwrite: false, token: env.BLOB_READ_WRITE_TOKEN });
  }
  const record = {
    slug, venue, venue_type: venueType, venue_type_label: VENUE_TYPES[venueType], city: city || null,
    contact: { name, email, phone: phone || null },
    logo_path: logoPath, logo_mime: logo.value ? logo.value.mime : null,
    terms: { version: PARTNER_TERMS.version, accepted_at: now, share: '25% of partnership profit', text: PARTNER_TERMS.text },
    status: 'active', created_at: now,
  };
  await putJson(`qr-partners/${slug}/partner.json`, record, env, false);

  const parts = name.split(' ');
  const friday = {
    externalId: `cj-qrpartner-${slug}`,
    email, firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined,
    site: 'calmjoints.org', org: 'calmjoints', source: 'calmjoints_qr_partner', path: '/partners', kind: 'form',
    message: `QR partner sign-up: ${venue} (${VENUE_TYPES[venueType]}${city ? `, ${city}` : ''}). Landing ${SITE}/p/${slug}`,
    meta: { partner_slug: slug, venue, venue_type: venueType, city: city || null, phone: phone || null, logo: Boolean(logoPath) },
    tags: ['calmjoints', 'partner', 'qr-partner', `partner:${slug}`],
  };
  const fetchImpl = ctx.fetchImpl || fetch;
  const f = await postFriday(friday, env, fetchImpl).catch(() => ({ ok: false }));
  await Promise.all([
    sendAlert('partner', { ...friday, meta: { track_label: 'QR partner' } }, env, fetchImpl).catch(() => null),
    sendEmailAlert('partner', { ...friday, meta: { track_label: 'QR partner' } }, env, fetchImpl).catch(() => null),
  ]);
  console.log(`[qr-partner] created=${slug} friday=${f.ok ? 'ok' : 'no'} logo=${logoPath ? 'yes' : 'no'}`);
  return { status: 200, json: { ok: true, partner: publicPartner(record) } };
}

async function recordLead(body, env, ctx = {}) {
  const slug = clean(body.slug, 48).toLowerCase();
  const event = ['visit', 'email', 'book'].includes(body.event) ? body.event : 'email';
  const partner = await getPartner(slug, env);
  if (!partner) return { status: 404, json: { ok: false, message: 'We couldn’t find that partner code.' } };
  const email = clean(body.email, 254).toLowerCase();
  if (event === 'email' && !validEmail(email)) return { status: 400, json: { ok: false, message: 'That email doesn’t look quite right.' } };
  const now = (ctx.now || new Date()).toISOString();
  const id = `${now.replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const hasEmail = email && validEmail(email);
  const rec = { slug, event, email: event === 'visit' ? null : (hasEmail ? email : null), src: clean(body.src, 20) || 'qr', at: now };
  await putJson(`qr-leads/${slug}/${event}/${id}.json`, rec, env, false);
  if (event === 'email' || (event === 'book' && hasEmail)) {
    const friday = {
      externalId: `cj-qrlead-${slug}-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`,
      email, site: 'calmjoints.org', org: 'calmjoints', source: 'calmjoints_qr_lead', path: `/p/${slug}`, kind: 'form',
      message: event === 'book' ? `Clicked through to book a visit (partner ${partner.venue}, ${slug}).` : `Came in through partner ${partner.venue} (${slug}) and was connected to booking.`,
      meta: { partner_slug: slug, partner_venue: partner.venue, qr_event: event },
      tags: ['calmjoints', 'qr-lead', `partner:${slug}`, ...(event === 'book' ? ['booking-click'] : [])],
    };
    const f = await postFriday(friday, env, ctx.fetchImpl || fetch).catch(() => ({ ok: false }));
    console.log(`[qr-lead] ${slug} ${event} friday=${f.ok ? 'ok' : 'no'}`);
  }
  return { status: 200, json: { ok: true } };
}

module.exports = { PARTNER_TERMS, createPartner, recordLead, getPartner, publicPartner, parseLogo, makeSlug, validSlug, VENUE_TYPES, rateLimit };
