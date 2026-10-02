'use strict';
// Partner ledger + dashboard + nudges for Calm Joints QR partners.
// Storage: private Vercel Blob (same store as qr-partners/ and qr-leads/).
//   qr-ledger/<slug>/<key>.json    one event per file; key = hash of (type, ref) so re-posts are no-ops
//   qr-partners/<slug>/account.json  nudge + payout-setup state (no bank details, ever)
// Bank details never touch this site: payout setup goes through the payment provider's own
// secure page (Plooto invite), and the team marks the partner ready once that's done.
const crypto = require('crypto');
const { getPartner, validSlug, validEmail } = require('./qr-partners');
const { rateLimit, postFriday } = require('./intake');

const SITE = 'https://calmjoints.org';
const PAYOUT_MIN = 500;      // pay out once more than this is owed
const NUDGE_EARNED = 100;    // "you're past $100" nudge
const SHARE = 0.25;          // 25% of partnership profit
const PRODUCTS = { cj: 'Calm Joints physio', scalehub: 'Co-branded hub (full store with physio)' };
const TYPES = new Set(['booking', 'visit', 'adjustment', 'payout']);

function blob() { return require('@vercel/blob'); }
const tok = (env) => env.BLOB_READ_WRITE_TOKEN;
const money = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function putJson(path, obj, env, overwrite) {
  return blob().put(path, JSON.stringify(obj), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: Boolean(overwrite), token: tok(env) });
}
async function readJson(path, env) {
  try {
    const out = await blob().get(path, { access: 'private', token: tok(env) });
    if (!out || !out.stream) return null;
    return JSON.parse(await new Response(out.stream).text());
  } catch { return null; }
}
async function listAll(prefix, env) {
  const out = []; let cursor;
  do {
    const page = await blob().list({ prefix, cursor, token: tok(env), limit: 1000 });
    out.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// ---------- auth ----------
function secretOf(env) { return (env.PARTNER_PORTAL_SECRET || env.INTAKE_WEBHOOK_SECRET || env.FRIDAY_API_KEY || '').trim(); }
function signKey(env) { return crypto.createHmac('sha256', secretOf(env)).update('cj-partner-portal-v1').digest(); }
function makeToken(slug, env, days = 14, now = Date.now()) {
  const exp = Math.floor(now / 1000) + days * 86400;
  const body = `${slug}.${exp}`;
  const sig = crypto.createHmac('sha256', signKey(env)).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(t, env, now = Date.now()) {
  const m = /^([a-z0-9-]{3,48})\.(\d{9,11})\.([A-Za-z0-9_-]{20,})$/.exec(String(t || ''));
  if (!m || !secretOf(env)) return null;
  const want = crypto.createHmac('sha256', signKey(env)).update(`${m[1]}.${m[2]}`).digest('base64url');
  const a = Buffer.from(want), b = Buffer.from(m[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(m[2]) * 1000 < now) return null;
  return m[1];
}
function serverAuthed(req, env) {
  const s = secretOf(env); if (!s) return false;
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || String(req.headers['x-intake-secret'] || '').trim();
  const a = Buffer.from(sha(h)), b = Buffer.from(sha(s));
  return h.length > 0 && crypto.timingSafeEqual(a, b);
}
function cronAuthed(req, env) {
  const c = (env.CRON_SECRET || '').trim();
  if (!c) return false;
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return h.length > 0 && crypto.timingSafeEqual(Buffer.from(sha(h)), Buffer.from(sha(c)));
}

// ---------- account ----------
async function getAccount(slug, env) {
  return (await readJson(`qr-partners/${slug}/account.json`, env)) || { slug, product: 'cj', nudges: {}, payout: { status: 'not_started' } };
}
async function saveAccount(acct, env) { acct.updated_at = new Date().toISOString(); await putJson(`qr-partners/${acct.slug}/account.json`, acct, env, true); return acct; }

// ---------- attribution ----------
// First partner that captured a patient's email gets the credit (same rule as scripts/partner-payout.js).
async function slugForPatient(email, env) { const r = await refForPatient(email, env); return r ? r.slug : null; }
async function refForPatient(email, env) {
  const e = clean(email, 254).toLowerCase(); if (!e) return null;
  const idx = await readJson(`qr-ledger-index/patients/${sha(e)}.json`, env);
  if (idx && idx.slug) return idx;
  let best = null;
  for (const b of await listAll('qr-leads/', env)) {
    if (!/\/(email|book)\//.test(b.pathname)) continue;
    const r = await readJson(b.pathname, env);
    if (r && r.email === e && (!best || r.at < best.at)) best = r;
  }
  if (!best) return null;
  const idx2 = { slug: best.slug, code: best.code || null, at: best.at };
  await putJson(`qr-ledger-index/patients/${sha(e)}.json`, idx2, env, true).catch(() => null);
  return idx2;
}
const codeOf = (p) => { const m = /_([a-f0-9]{6})(?:_([a-z]+))?\.json$/.exec(p); return m ? { code: m[1], size: m[2] || null } : null; };

// ---------- summary ----------
async function summary(slug, env) {
  const [ledger, scans, emails, clicks, acct, downloads] = await Promise.all([
    listAll(`qr-ledger/${slug}/`, env), listAll(`qr-leads/${slug}/visit/`, env), listAll(`qr-leads/${slug}/email/`, env), listAll(`qr-leads/${slug}/book/`, env), getAccount(slug, env), listAll(`qr-leads/${slug}/download/`, env),
  ]);
  const ev = (await Promise.all(ledger.map((b) => readJson(b.pathname, env)))).filter(Boolean);
  const s = { bookings: 0, visits: 0, pending: 0, earned: 0, paid: 0, by_product: {}, recent: [] };
  for (const e of ev) {
    if (e.type === 'booking') { s.bookings++; s.pending += e.expected_share || 0; }
    if (e.type === 'visit') { s.visits++; s.earned += e.share || 0; }
    if (e.type === 'adjustment') s.earned += e.share || 0;
    if (e.type === 'payout') s.paid += e.amount || 0;
    if (e.type === 'visit' || e.type === 'booking') {
      const p = e.product || 'cj'; s.by_product[p] = s.by_product[p] || { label: PRODUCTS[p] || p, visits: 0, bookings: 0, earned: 0 };
      s.by_product[p][e.type === 'visit' ? 'visits' : 'bookings']++; if (e.type === 'visit') s.by_product[p].earned += e.share || 0;
    }
  }
  s.recent = ev.filter((e) => e.type !== 'adjustment').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12)
    .map((e) => ({ type: e.type, at: e.at, product: PRODUCTS[e.product || 'cj'], share: e.type === 'visit' ? e.share : e.type === 'payout' ? -e.amount : e.expected_share || null }));
  const r2 = (n) => Math.round(n * 100) / 100;
  s.pending = r2(s.pending); s.earned = r2(s.earned); s.paid = r2(s.paid);
  s.owed = r2(s.earned - s.paid);
  s.scans = scans.length; s.emails = emails.length; s.booking_clicks = clicks.length; s.downloads = downloads.length;
  const codes = {};
  for (const b of downloads) { const c = codeOf(b.pathname); if (c) codes[c.code] = { code: c.code, size: c.size, scans: 0, emails: 0, booking_clicks: 0, bookings: 0, visits: 0 }; }
  const bump = (list, key) => { for (const b of list) { const c = codeOf(b.pathname); if (c && codes[c.code]) codes[c.code][key]++; } };
  bump(scans, 'scans'); bump(emails, 'emails'); bump(clicks, 'booking_clicks');
  for (const e of ev) if (e.code && codes[e.code] && (e.type === 'visit' || e.type === 'booking')) codes[e.code][e.type === 'visit' ? 'visits' : 'bookings']++;
  s.by_code = Object.values(codes).sort((a, b) => b.scans - a.scans);
  s.payout_min = PAYOUT_MIN; s.to_next_payout = r2(Math.max(0, PAYOUT_MIN - s.owed));
  s.payout_due = s.owed > PAYOUT_MIN;
  s.payout_setup = acct.payout || { status: 'not_started' };
  s.product = PRODUCTS[acct.product || 'cj'];
  return { s, acct, ev };
}

// ---------- email ----------
function partnerEmail(subject, lines, cta) {
  const body = lines.map((l) => `<p style="margin:8px 0;color:#0B1D16">${esc(l)}</p>`).join('');
  const btn = cta ? `<p style="margin:18px 0"><a href="${esc(cta.url)}" style="background:#15803D;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:bold;display:inline-block">${esc(cta.label)}</a></p>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;background:#ffffff;max-width:560px;padding:20px"><p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#15803D">Calm Joints partners</p><h2 style="margin:0 0 12px;font-size:20px;color:#0B1D16">${esc(subject)}</h2>${body}${btn}<p style="margin:16px 0 0;font-size:13px;color:#4B5E54">We will never ask for your bank details by email. Questions? Reply or write info@calmjoints.org.</p></div>`;
  const text = `${subject}\n\n${lines.join('\n\n')}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}\n\nWe will never ask for your bank details by email. Questions? info@calmjoints.org`;
  return { subject, html, text };
}
async function sendMail(to, mail, env, fetchImpl = fetch, replyTo = 'info@calmjoints.org') {
  const key = (env.CJ_RESEND_API_KEY || '').trim();
  if (!key || !to || !to.length) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: (env.CJ_PARTNER_FROM || env.CJ_ALERT_FROM || 'Calm Joints <alerts@scalehealth.ca>').trim(), to, reply_to: replyTo, subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) { console.error('[ledger] mail failed', err && err.message); return { ok: false }; }
}
const teamTo = (env) => String(env.CJ_ALERT_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean);
const dashLink = (slug, env) => `${SITE}/partner?t=${encodeURIComponent(makeToken(slug, env))}`;

// Decide and send any nudges due for this partner. Each fires once, tracked in account.nudges.
async function runNudges(slug, env, fetchImpl = fetch, now = new Date()) {
  const partner = await getPartner(slug, env); if (!partner) return { sent: [] };
  const { s, acct } = await summary(slug, env);
  const to = partner.contact && partner.contact.email ? [partner.contact.email] : [];
  const first = (partner.contact && partner.contact.name || '').split(' ')[0];
  const hi = first ? `Hi ${first},` : 'Hi,';
  const sent = []; acct.nudges = acct.nudges || {};
  const link = dashLink(slug, env);
  const setupDone = acct.payout && acct.payout.status === 'ready';
  if (!acct.nudges.first_booking && (s.bookings > 0 || s.visits > 0)) {
    const r = await sendMail(to, partnerEmail(`Your first Calm Joints booking came in`, [hi, `Someone booked a physio visit through your ${partner.venue} QR code. Your partnership share starts building in your dashboard as visits are completed.`, setupDone ? 'Your payout details are already set up, so there is nothing else to do.' : 'While you are there, start your secure payout setup so we can pay you once your share passes $500.'], { label: 'Open my dashboard', url: link }), env, fetchImpl);
    if (r.ok || r.skipped) { acct.nudges.first_booking = now.toISOString(); sent.push('first_booking'); }
  }
  if (!acct.nudges.over_100 && s.earned >= NUDGE_EARNED) {
    const r = await sendMail(to, partnerEmail(`You're past $100 with Calm Joints`, [hi, `Your share from ${partner.venue} is now $${s.owed.toFixed(2)}. We pay out once it passes $${PAYOUT_MIN}.`, setupDone ? 'Your payout details are set up. You are all set.' : 'To make sure we can pay you, finish your secure payout setup from your dashboard. It only takes a few minutes, and your bank details go straight to our payment provider, never to us by email.'], { label: setupDone ? 'See my balance' : 'Set up my payout', url: link }), env, fetchImpl);
    if (r.ok || r.skipped) { acct.nudges.over_100 = now.toISOString(); sent.push('over_100'); }
  }
  // Payout setup reminder: once they've earned something and setup isn't done, at most every 7 days, max 4.
  const stamps = [acct.nudges.payout_reminder_at, acct.nudges.first_booking, acct.nudges.over_100].filter(Boolean).map((x) => new Date(x).getTime());
  const last = stamps.length ? new Date(Math.max(...stamps)) : null; // any partner email in the last 7 days counts
  const count = acct.nudges.payout_reminders || 0;
  if (!setupDone && s.earned > 0 && count < 4 && (!last || now - last > 7 * 86400000)) {
    const r = await sendMail(to, partnerEmail(`One step left so we can pay you`, [hi, `You have $${s.owed.toFixed(2)} building with Calm Joints. Your payout setup isn't finished yet.`, 'Open your dashboard and tap "Set up my payout". You will get a secure invite from our payment provider to add your bank details there. We never ask for them by email.'], { label: 'Set up my payout', url: link }), env, fetchImpl);
    if (r.ok) { acct.nudges.payout_reminder_at = now.toISOString(); acct.nudges.payout_reminders = count + 1; sent.push('payout_reminder'); }
  }
  // Team: payout due.
  if (s.payout_due && acct.nudges.payout_due_owed !== s.owed) {
    const r = await sendMail(teamTo(env), partnerEmail(`Partner payout due: ${partner.venue}`, [`${partner.venue} (${slug}) is owed $${s.owed.toFixed(2)}, over the $${PAYOUT_MIN} payout line.`, `Payout setup: ${setupDone ? 'ready' : (acct.payout && acct.payout.status) || 'not started'}.`, 'After paying, record it with: node scripts/partner-admin.js payout ' + slug + ' <amount>'], null), env, fetchImpl, partner.contact && partner.contact.email);
    if (r.ok || r.skipped) { acct.nudges.payout_due_owed = s.owed; sent.push('team_payout_due'); }
  }
  if (sent.length) await saveAccount(acct, env);
  return { sent, owed: s.owed };
}

// ---------- ingest ----------
// Sales with no QR partner (direct, or booked through a brand hub) are still kept, tagged with their channel, so every
// dollar has a source. Each booking/visit also goes to Friday as a deal with its value.
async function recordDirect(type, body, env, ctx = {}) {
  const ref = clean(body.ref, 120); if (!ref) return;
  const rec = { type, slug: null, channel: clean(body.channel || body.source, 40) || 'direct', product: PRODUCTS[clean(body.product, 20)] ? clean(body.product, 20) : 'cj', ref_hash: sha(`${type}:${ref}`).slice(0, 24),
    at: body.at && !Number.isNaN(new Date(body.at).getTime()) ? new Date(body.at).toISOString() : (ctx.now || new Date()).toISOString(), billed: money(body.billed), net: body.net != null ? money(body.net) : null };
  try { await putJson(`cj-sales/direct/${rec.ref_hash}.json`, rec, env, false); } catch (err) { if (/already exists|overwrite/i.test(String(err && err.message))) return; throw err; }
  await postSale(rec, body, rec.channel, env, ctx.fetchImpl || fetch);
}
async function postSale(rec, body, via, env, fetchImpl = fetch) {
  const email = clean(body.patient_email, 254).toLowerCase();
  const billed = money(body.billed);
  const what = rec.type === 'visit' ? 'Paid visit' : 'Booking';
  const f = await postFriday({
    externalId: `cj-sale-${rec.ref_hash}`, ...(validEmail(email) ? { email } : {}),
    site: 'calmjoints.org', org: 'calmjoints', source: 'calmjoints_sale', path: rec.slug ? `/p/${rec.slug}` : '/', kind: 'form',
    message: `${what}${billed ? ` $${billed.toFixed(2)}` : ''} via ${via}.`, ...(billed ? { value: billed } : {}),
    meta: { sale_type: rec.type, product: rec.product, partner_slug: rec.slug, qr_code: rec.code || null, channel: rec.slug ? 'qr_partner' : (rec.channel || 'direct'), at: rec.at },
    tags: ['calmjoints', 'sale', rec.type === 'visit' ? 'paid-visit' : 'booking', ...(rec.slug ? [`partner:${rec.slug}`] : [`channel:${rec.channel || 'direct'}`]), ...(rec.code ? [`qr:${rec.code}`] : [])],
  }, env, fetchImpl).catch(() => ({ ok: false }));
  console.log(`[ledger] sale ${rec.type} ${rec.slug || rec.channel} friday=${f.ok ? 'ok' : 'no'}`);
}

async function recordEvent(body, env, ctx = {}) {
  const type = clean(body.type, 20);
  if (!TYPES.has(type)) return { status: 400, json: { ok: false, message: 'type must be booking, visit, adjustment or payout' } };
  let slug = clean(body.slug, 48).toLowerCase();
  let code = /^[a-f0-9]{6}$/.test(String(body.code || '')) ? String(body.code) : null;
  if (!slug && body.patient_email) { const pr = await refForPatient(body.patient_email, env); if (pr) { slug = pr.slug; code = code || pr.code || null; } }
  if (!slug) {
    if (type === 'booking' || type === 'visit') await recordDirect(type, body, env, ctx).catch((e) => console.error('[ledger] direct sale failed', e && e.message));
    return { status: 202, json: { ok: true, attributed: false, message: 'No partner for this patient.' } };
  }
  if (!validSlug(slug) || !(await getPartner(slug, env))) return { status: 404, json: { ok: false, message: 'Unknown partner.' } };
  const product = PRODUCTS[clean(body.product, 20)] ? clean(body.product, 20) : 'cj';
  const ref = clean(body.ref, 120);
  if (!ref) return { status: 400, json: { ok: false, message: 'ref (a unique booking/visit/payout id) is required.' } };
  const at = body.at && !Number.isNaN(new Date(body.at).getTime()) ? new Date(body.at).toISOString() : (ctx.now || new Date()).toISOString();
  const billed = money(body.billed), net = body.net != null ? money(body.net) : null;
  const rec = { type, slug, code, product, source: clean(body.source, 40) || 'api', ref_hash: sha(`${type}:${ref}`).slice(0, 24), at, recorded_at: (ctx.now || new Date()).toISOString() };
  if (type === 'booking') rec.expected_share = body.expected_share != null ? money(body.expected_share) : (net != null ? money(net * SHARE) : 0);
  if (type === 'visit') { rec.billed = billed; rec.net = net; rec.share = body.share != null ? money(body.share) : money((net != null ? net : 0) * SHARE); }
  if (type === 'adjustment') { rec.share = money(body.share); rec.note = clean(body.note, 200); }
  if (type === 'payout') { rec.amount = money(body.amount); rec.method = clean(body.method, 40) || 'eft'; }
  // A visit replaces its booking's pending amount: same ref, different type, so both are kept; summary counts the booking as pending
  // only while no visit with the same ref exists.
  try {
    await putJson(`qr-ledger/${slug}/${rec.ref_hash}.json`, rec, env, false);
  } catch (err) {
    if (/already exists|overwrite/i.test(String(err && err.message))) return { status: 200, json: { ok: true, duplicate: true, slug } };
    throw err;
  }
  if (type === 'visit') { // clear the matching booking's pending share
    const bk = `qr-ledger/${slug}/${sha(`booking:${ref}`).slice(0, 24)}.json`;
    const b = await readJson(bk, env); if (b && b.expected_share) { b.expected_share = 0; b.completed = true; await putJson(bk, b, env, true).catch(() => null); }
  }
  if (type === 'booking' || type === 'visit') await postSale(rec, body, `QR partner ${(await getPartner(slug, env)).venue}${code ? ` (sign ${code})` : ''}`, env, ctx.fetchImpl || fetch);
  if (type === 'booking' || type === 'visit') { const a = await getAccount(slug, env); if (a.product !== product && product === 'scalehub') { a.product = 'scalehub'; await saveAccount(a, env); } }
  const n = await runNudges(slug, env, ctx.fetchImpl || fetch).catch((e) => { console.error('[ledger] nudge failed', e && e.message); return { sent: [] }; });
  console.log(`[ledger] ${slug} ${type} ${product} nudges=${n.sent.join(',') || '-'}`);
  return { status: 200, json: { ok: true, slug, nudges: n.sent } };
}

async function setPayoutStatus(slug, status, env, note) {
  if (!['not_started', 'requested', 'invited', 'ready'].includes(status)) return { status: 400, json: { ok: false } };
  if (!(await getPartner(slug, env))) return { status: 404, json: { ok: false } };
  const a = await getAccount(slug, env);
  a.payout = { ...(a.payout || {}), status, [`${status}_at`]: new Date().toISOString(), note: note ? clean(note, 200) : (a.payout || {}).note };
  await saveAccount(a, env);
  return { status: 200, json: { ok: true, slug, payout: a.payout } };
}

// ---------- portal ----------
async function partnersByEmail(email, env) {
  const e = clean(email, 254).toLowerCase(); const out = [];
  for (const b of await listAll('qr-partners/', env)) {
    if (!/\/partner\.json$/.test(b.pathname)) continue;
    const p = await readJson(b.pathname, env);
    if (p && p.status !== 'deleted' && p.contact && String(p.contact.email).toLowerCase() === e) out.push(p);
  }
  return out;
}
async function sendLoginLink(email, env, fetchImpl = fetch) {
  const list = await partnersByEmail(email, env);
  for (const p of list.slice(0, 5)) {
    await sendMail([p.contact.email], partnerEmail(`Your Calm Joints partner dashboard`, [`Here is your sign-in link for ${p.venue}. It works for 14 days and only on this email.`], { label: 'Open my dashboard', url: dashLink(p.slug, env) }), env, fetchImpl);
  }
  return list.length;
}
async function dashboard(slug, env) {
  const p = await getPartner(slug, env); if (!p) return null;
  const { s } = await summary(slug, env);
  return { venue: p.venue, slug, landing_url: `${SITE}/p/${slug}`, qr_kit_url: `${SITE}/partners#kit`, terms_version: p.terms && p.terms.version, ...s };
}
async function requestPayoutSetup(slug, env, fetchImpl = fetch) {
  const p = await getPartner(slug, env); if (!p) return { status: 404, json: { ok: false } };
  const a = await getAccount(slug, env);
  if (a.payout && ['requested', 'invited', 'ready'].includes(a.payout.status)) return { status: 200, json: { ok: true, payout: a.payout } };
  a.payout = { status: 'requested', requested_at: new Date().toISOString() };
  await saveAccount(a, env);
  await sendMail(teamTo(env), partnerEmail(`Send payout invite: ${p.venue}`, [`${p.contact.name} at ${p.venue} (${slug}) asked to set up payouts.`, `Send a secure payee invite from Plooto to ${p.contact.email}. Do not collect bank details by email.`, `When it's done: node scripts/partner-admin.js setup ${slug} invited (then "ready" once they finish).`], null), env, fetchImpl, p.contact.email);
  return { status: 200, json: { ok: true, payout: a.payout } };
}
async function welcome(partner, env, fetchImpl = fetch) {
  if (!partner || !partner.contact) return { ok: false };
  const first = (partner.contact.name || '').split(' ')[0];
  return sendMail([partner.contact.email], partnerEmail(`Welcome to Calm Joints partners`, [first ? `Hi ${first},` : 'Hi,', `${partner.venue} is set up. Your QR code points to ${SITE}/p/${partner.slug}, and every scan and booking through it is tracked to you.`, `Your dashboard shows your scans, bookings and your share building. We pay out once more than $${PAYOUT_MIN} is owed to you. Payout setup is done through our payment provider's secure page. We never ask for bank details by email.`], { label: 'Open my dashboard', url: dashLink(partner.slug, env) }), env, fetchImpl);
}

module.exports = { PAYOUT_MIN, NUDGE_EARNED, PRODUCTS, makeToken, readToken, serverAuthed, cronAuthed, recordEvent, setPayoutStatus, runNudges, summary, dashboard, readJson, sendLoginLink, requestPayoutSetup, welcome, listAll, slugForPatient, rateLimit };
