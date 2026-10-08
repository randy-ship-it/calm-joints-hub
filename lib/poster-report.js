'use strict';
// "Report a poster" intake. Logs the report, emails the team, and drafts a
// one-time takedown note. It never emails the partner.
const crypto = require('crypto');
const { matchReport } = require('./qr-partners');
const { rateLimit } = require('./intake');

const TEAM = ['info@calmjoints.org', 'randy@silverbirchgrowth.com'];
const PHOTO_MAX = 2 * 1024 * 1024;
const PHOTO_TYPES = {
  png: { mime: 'image/png', magic: (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' },
  jpg: { mime: 'image/jpeg', magic: (b) => b.slice(0, 3).toString('hex') === 'ffd8ff' },
  webp: { mime: 'image/webp', magic: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
};

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function blob() { return require('@vercel/blob'); }

function parsePhoto(raw) {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: 'We couldn’t read that photo. Try a JPG or PNG?' };
  const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) return { error: 'Photos can be PNG, JPG or WebP.' };
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch { buf = null; }
  if (!buf || !buf.length) return { error: 'That photo looks empty.' };
  if (buf.length > PHOTO_MAX) return { error: 'That photo is over 2 MB. A smaller one works.' };
  if (!PHOTO_TYPES[ext].magic(buf)) return { error: 'That file doesn’t look like a photo.' };
  return { value: { ext, mime: PHOTO_TYPES[ext].mime, buffer: buf } };
}

function takedownDraft(partner, location) {
  const who = partner && partner.name && !String(partner.name).includes('@') ? partner.name.split(' ')[0] : 'there';
  const lines = [
    'Subject: Please take down your Calm Joints poster',
    '',
    `Hi ${who},`,
    '',
    'Someone let us know a Calm Joints poster tied to your code is up somewhere it should not be.',
    '',
    `Location reported: ${location || '(not given)'}`,
    '',
    'Please take that poster down promptly. You agreed that if we ask once, you will remove it.',
    '',
    'Thanks,',
    'Calm Joints',
    'info@calmjoints.org',
  ];
  return lines.join('\n');
}

async function sendTeam(mail, env, fetchImpl) {
  const key = (env.CJ_RESEND_API_KEY || '').trim();
  const extra = String(env.CJ_ALERT_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const to = [...new Set([...TEAM, ...extra])];
  if (!key) return { ok: false, skipped: true, to };
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: (env.CJ_ALERT_FROM || 'Calm Joints <alerts@scalehealth.ca>').trim(),
      to,
      reply_to: 'info@calmjoints.org',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(mail.attachments ? { attachments: mail.attachments } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: res.ok, status: res.status, to };
}

async function submitReport(body, env, ctx = {}) {
  const location = clean(body.location, 300);
  const note = clean(body.note, 500);
  const code = clean(body.code, 200);
  const contact = clean(body.contact, 200);
  if (!location || location.length < 3) return { status: 400, json: { ok: false, message: 'Where is the poster? A street, a building or a short description is enough.' } };
  const photo = parsePhoto(body.photo);
  if (photo.error) return { status: 400, json: { ok: false, message: photo.error } };
  if (!env.BLOB_READ_WRITE_TOKEN) return { status: 503, json: { ok: false, message: 'We couldn’t save that just now. Email info@calmjoints.org with the photo.' } };
  const now = (ctx.now || new Date()).toISOString();
  const id = `${now.replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  let match = { slug: null, code: null, partner: null };
  try { match = await matchReport(code, env); } catch (err) { console.error('[poster-report] match failed', err && err.message); }
  let photoPath = null;
  if (photo.value) {
    photoPath = `poster-reports/${id}/photo.${photo.value.ext}`;
    await blob().put(photoPath, photo.value.buffer, { access: 'private', contentType: photo.value.mime, addRandomSuffix: false, allowOverwrite: false, token: env.BLOB_READ_WRITE_TOKEN });
  }
  const draft = takedownDraft(match.partner, location);
  const rec = {
    id, at: now, location, note: note || null, code: code || null,
    contact: contact || null, photo_path: photoPath,
    matched_slug: match.slug, matched_code: match.code,
    // Partner email stays in the team mail only. The public response never includes it.
    partner_email: match.partner && match.partner.email || null,
    status: 'open',
  };
  await blob().put(`poster-reports/${id}/report.json`, JSON.stringify(rec), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false, token: env.BLOB_READ_WRITE_TOKEN });
  const who = match.partner ? `${match.partner.venue} (${match.partner.slug})` : 'No partner matched. Check the photo or the code.';
  const subject = `Poster report${match.partner ? ': ' + match.partner.venue : ''}`;
  const text = [
    'A Calm Joints poster was reported. This email did NOT go to the partner.',
    '',
    `Location: ${location}`,
    note ? `Note: ${note}` : null,
    code ? `Code or name given: ${code}` : 'No code or name given.',
    contact ? `Reporter contact: ${contact}` : 'Reporter left no contact.',
    `Match: ${who}`,
    photoPath ? `Photo saved privately as ${photoPath}` : 'No photo.',
    `Report id: ${id}`,
    '',
    'Draft takedown to copy and send yourself. Do not treat this as already sent.',
    '',
    draft,
  ].filter((x) => x !== null).join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0B1D16"><p><b>This did not go to the partner.</b> Copy the draft below if you want to ask them once.</p><p>Location: ${esc(location)}</p>${note ? `<p>Note: ${esc(note)}</p>` : ''}<p>${esc(code ? 'Code or name given: ' + code : 'No code or name given.')}</p><p>${esc(contact ? 'Reporter contact: ' + contact : 'Reporter left no contact.')}</p><p>Match: ${esc(who)}</p><p>Report id: ${esc(id)}</p><pre style="white-space:pre-wrap;background:#F5F8F6;padding:12px;border-radius:8px">${esc(draft)}</pre></div>`;
  const attachments = photo.value && photo.value.buffer.length <= 1500 * 1024
    ? [{ filename: `poster.${photo.value.ext}`, content: photo.value.buffer.toString('base64') }]
    : undefined;
  const fetchImpl = ctx.fetchImpl || fetch;
  let mailed = { ok: false };
  try { mailed = await sendTeam({ subject, html, text, attachments }, env, fetchImpl); }
  catch (err) { console.error('[poster-report] mail failed', err && err.message); }
  console.log(`[poster-report] id=${id} match=${match.slug || '-'} mail=${mailed.ok ? 'ok' : mailed.skipped ? 'skipped' : 'no'}`);
  return { status: 200, json: { ok: true, id, matched: Boolean(match.slug), message: 'Thanks. We’ll ask them to take it down.' }, _mail: mailed, _draft: draft };
}

module.exports = { submitReport, takedownDraft, parsePhoto, TEAM, rateLimit };
