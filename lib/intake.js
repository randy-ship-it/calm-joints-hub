/**
 * Calm Joints intake — validate, lightly rate-limit, persist.
 * Friday webhook is primary. If it is missing or fails, write a local JSONL
 * file and, when configured, a Neon row so a submission is not dropped.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'calmjoints.org';
const NOTIFY_EMAIL = 'info@calmjoints.org';

const PROVINCES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const buckets = new Map();
let neonReady = null;

function cleanText(value, max) {
  if (value == null) return '';
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
  return text.slice(0, max);
}

function validEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateNewsletter(body) {
  const email = cleanText(body.email, 254).toLowerCase();
  const name = cleanText(body.name, 80);
  if (!validEmail(email)) {
    return { error: 'That email doesn’t look quite right. Try once more?' };
  }
  if (name && !/^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]{0,79}$/u.test(name)) {
    return { error: 'Name can be letters, spaces, and a hyphen — or leave it blank.' };
  }
  return {
    value: {
      email,
      name: name || null,
      notify_email: NOTIFY_EMAIL,
      interests: ['blogs', 'newsletters', 'latest'],
    },
  };
}

function validateQuestion(body) {
  const email = cleanText(body.email, 254).toLowerCase();
  const name = cleanText(body.name, 80);
  const message = String(body.message == null ? '' : body.message).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, 1200);
  if (!validEmail(email)) {
    return { error: 'That email doesn’t look quite right. Try once more?' };
  }
  if (name && !/^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]{0,79}$/u.test(name)) {
    return { error: 'Name can be letters, spaces, and a hyphen — or leave it blank.' };
  }
  if (message.length < 5) {
    return { error: 'Add a line or two so we know how to help.' };
  }
  const notes = body.notes === true || body.notes === 'on' || body.notes === 'yes' || body.notes === 'true';
  return {
    value: {
      email,
      name: name || null,
      message,
      notes,
      notify_email: NOTIFY_EMAIL,
    },
  };
}

function cleanMessage(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function cleanWebsite(raw) {
  const value = cleanText(raw, 300);
  if (!value) return { error: 'Add your website so we know who you are.' };
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: 'That website doesn’t look quite right.' };
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) {
    return { error: 'That website doesn’t look quite right.' };
  }
  return { value: url.toString().replace(/\/$/, '') };
}

function validName(name, required) {
  if (!name) return !required;
  return /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]{0,79}$/u.test(name);
}

// Home-page intake: website, name, email, optional note.
function validateIntake(body) {
  const site = cleanWebsite(body.website);
  if (site.error) return { error: site.error };
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  if (!name || !validName(name, true)) return { error: 'What should we call you?' };
  if (!validEmail(email)) return { error: 'That email doesn’t look quite right.' };
  const message = cleanMessage(body.message, 1500);
  return { value: { website: site.value, name, email, message: message || null, notify_email: NOTIFY_EMAIL } };
}

const CAREER_ROLES = {
  'mobile-physio': 'Mobile physiotherapist',
  'remote-physio': 'Remote physiotherapist',
  accessibility: 'Accessibility role',
  digital: 'Fully digital clinician',
  'in-home': 'In-home clinician',
  'on-site': 'On-site at partner locations',
};

// Careers page: name, email, role, optional link and note.
function validateCareers(body) {
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const role = cleanText(body.role, 40);
  if (!name || !validName(name, true)) return { error: 'What should we call you?' };
  if (!validEmail(email)) return { error: 'That email doesn’t look quite right.' };
  if (!CAREER_ROLES[role]) return { error: 'Pick the role you want.' };
  let link = null;
  const rawLink = cleanText(body.link, 300);
  if (rawLink) {
    const parsed = cleanWebsite(rawLink);
    if (parsed.error) return { error: 'That link doesn’t look quite right. LinkedIn or a website is perfect.' };
    link = parsed.value;
  }
  const message = cleanMessage(body.message, 1500);
  return { value: { name, email, role, role_label: CAREER_ROLES[role], link, message: message || null, notify_email: NOTIFY_EMAIL } };
}

function cleanLinkedin(raw) {
  const value = cleanText(raw, 200);
  if (!value) return { value: null };
  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return { error: 'That LinkedIn link doesn’t look quite right.' };
    }
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return { error: 'Use a linkedin.com link, or just your handle.' };
    }
    return { value: url.toString() };
  }
  const handle = value.replace(/^@/, '').replace(/^in\//i, '');
  if (!/^[A-Za-z0-9\-_%]{2,80}$/.test(handle)) {
    return { error: 'LinkedIn can be your public URL or a handle like your-name.' };
  }
  return { value: handle };
}

function validateApply(body) {
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phoneRaw = cleanText(body.phone, 22);
  const registration = cleanText(body.registration_number || body.registration, 60);
  const bio = cleanText(body.bio, 800);
  const availability = cleanText(body.availability, 400);
  const yearsRaw = body.years_experience;

  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]{1,79}$/u.test(name)) {
    return { error: 'What should we call you? A first and last name is perfect.' };
  }
  if (!validEmail(email)) {
    return { error: 'We need a real email so we can write you back.' };
  }

  let phone = null;
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '');
    if (!/^[0-9+().\-\s]{7,22}$/.test(phoneRaw) || digits.length < 7 || digits.length > 15) {
      return { error: 'Phone can be blank, or a normal number we can dial.' };
    }
    phone = phoneRaw;
  }

  const incoming = Array.isArray(body.provinces)
    ? body.provinces
    : String(body.provinces || body.province || '').split(/[,/]/);
  const provinces = [...new Set(incoming.map((code) => cleanText(code, 8).toUpperCase()).filter(Boolean))];
  if (!provinces.length) {
    return { error: 'Pick at least one province or territory where you’re registered.' };
  }
  if (provinces.some((code) => !PROVINCES[code])) {
    return { error: 'One of those provinces didn’t match. Use the chips on the form.' };
  }

  if (registration && !/^[A-Za-z0-9][A-Za-z0-9 .#\-_/]{0,59}$/.test(registration)) {
    return { error: 'Registration number can be blank, or the college number as printed.' };
  }

  const linkedin = cleanLinkedin(body.linkedin);
  if (linkedin.error) return { error: linkedin.error };
  if (!linkedin.value) {
    return { error: 'Add a LinkedIn handle or linkedin.com link so we can find you.' };
  }

  if (bio.length < 12) {
    return { error: 'A sentence or two about you is plenty — just not a blank box.' };
  }

  let years = null;
  if (yearsRaw !== undefined && yearsRaw !== null && String(yearsRaw).trim() !== '') {
    const n = Number(yearsRaw);
    if (!Number.isInteger(n) || n < 0 || n > 60) {
      return { error: 'Years of experience can be blank, or a whole number up to 60.' };
    }
    years = n;
  }

  return {
    value: {
      name,
      email,
      phone,
      provinces,
      province_names: provinces.map((code) => PROVINCES[code]),
      registration_number: registration || null,
      linkedin: linkedin.value,
      bio,
      years_experience: years,
      availability: availability || null,
      notify_email: NOTIFY_EMAIL,
      country: 'Canada',
    },
  };
}

function rateLimit(key, opts = {}) {
  const now = opts.now || Date.now();
  const limit = opts.limit || 8;
  const windowMs = opts.windowMs || 10 * 60 * 1000;
  const store = opts.store || buckets;
  const prev = (store.get(key) || []).filter((t) => now - t < windowMs);
  if (prev.length >= limit) {
    store.set(key, prev);
    return false;
  }
  prev.push(now);
  store.set(key, prev);
  return true;
}

const FRIDAY_INTAKE_URL = 'https://fridayapp.org/api/intake';

function intakeSecret(env) {
  return (env.INTAKE_WEBHOOK_SECRET || env.FRIDAY_API_KEY || '').trim();
}

function splitName(name) {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const firstName = (first || '').slice(0, 80);
  const lastName = rest.join(' ').slice(0, 80);
  return lastName ? { firstName, lastName } : { firstName };
}

function linkedinUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.linkedin.com/in/${value}`;
}

function externalIdFor(kind, explicit) {
  if (explicit) return String(explicit).slice(0, 160);
  const id = crypto.randomUUID();
  if (kind === 'newsletter') return `cj-news-${id}`;
  if (kind === 'question') return `cj-question-${id}`;
  if (kind === 'intake') return `cj-intake-${id}`;
  if (kind === 'careers') return `cj-careers-${id}`;
  return `cj-physio-${id}`;
}

function fridayBody(kind, value, externalId) {
  if (kind === 'newsletter') {
    const body = {
      externalId,
      email: value.email,
      site: SOURCE,
      org: 'calmjoints',
      source: 'calmjoints_newsletter',
      path: '/newsletter',
      kind: 'form',
      tags: ['calmjoints', 'newsletter'],
    };
    if (value.name) body.meta = { name: value.name };
    return body;
  }

  if (kind === 'question') {
    const body = {
      externalId,
      email: value.email,
      site: SOURCE,
      org: 'calmjoints',
      source: 'calmjoints_question',
      path: '/question',
      kind: 'form',
      message: value.message,
      tags: value.notes ? ['calmjoints', 'question', 'newsletter'] : ['calmjoints', 'question'],
    };
    if (value.name) Object.assign(body, splitName(value.name));
    return body;
  }

  if (kind === 'intake') {
    return {
      externalId,
      email: value.email,
      ...splitName(value.name),
      site: SOURCE,
      org: 'calmjoints',
      source: 'calmjoints_intake',
      path: '/',
      kind: 'form',
      website: value.website,
      ...(value.message ? { message: value.message } : {}),
      tags: ['calmjoints', 'intake'],
    };
  }

  if (kind === 'careers') {
    const physio = value.role !== 'accessibility';
    const meta = { role: value.role, role_label: value.role_label };
    if (value.link) meta.link = value.link;
    return {
      externalId,
      email: value.email,
      ...splitName(value.name),
      site: SOURCE,
      org: 'calmjoints',
      source: 'calmjoints_careers',
      path: '/careers',
      kind: physio ? 'providers' : 'form',
      ...(physio ? { country: 'CA' } : {}),
      ...(value.link ? { website: value.link } : {}),
      ...(value.message ? { message: value.message } : {}),
      meta,
      tags: ['calmjoints', 'careers', `role:${value.role}`],
    };
  }

  const meta = { linkedin: value.linkedin };
  if (value.registration_number) meta.license = value.registration_number;
  if (value.phone) meta.phone = value.phone;
  if (value.provinces && value.provinces.length) meta.provinces = value.provinces;
  if (value.years_experience != null) meta.years_experience = value.years_experience;
  if (value.availability) meta.availability = value.availability;

  return {
    externalId,
    email: value.email,
    ...splitName(value.name),
    site: SOURCE,
    org: 'calmjoints',
    source: 'calmjoints_physio_apply',
    path: '/apply',
    kind: 'providers',
    country: 'CA',
    province: value.provinces[0],
    website: linkedinUrl(value.linkedin),
    message: value.bio,
    meta,
    tags: ['calmjoints', 'physio-apply'],
  };
}

// Calm Joints is one provider inside the Scale network; its physios are staff.
// Mirror each physio application into Scale's CA fulfillment lane, tagged.
function scaleCopyBody(payload) {
  return {
    ...payload,
    externalId: `scale-${payload.externalId}`.slice(0, 160),
    site: 'scalehealth.ca',
    org: 'scalehealth',
    lane: 'fulfillment-ca',
    company: 'Calm Joints',
    source: payload.source,
    tags: [...new Set([...(payload.tags || []), 'calmjoints-staff'])],
  };
}

function recordBody(type, payload, receivedAt) {
  return {
    type,
    source: SOURCE,
    payload,
    received_at: receivedAt,
    notify_email: NOTIFY_EMAIL,
  };
}

// Team alert: a short Slack post for every real submission. Opt-in through
// CJ_ALERT_SLACK_WEBHOOK_URL (a Slack incoming webhook). Never blocks the visitor.
function alertText(kind, payload) {
  const who = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || (payload.meta && payload.meta.name) || '';
  const labels = { apply: 'New physio application', question: 'New question', intake: 'New intake', careers: 'New careers application', newsletter: 'New email signup' };
  const label = labels[kind] || 'New submission';
  const lines = [`*${label}* on calmjoints.org`, `${who ? `${who} · ` : ''}${payload.email}`];
  if (kind === 'apply') {
    const m = payload.meta || {};
    if (m.provinces && m.provinces.length) lines.push(`Registered: ${m.provinces.join(', ')}`);
    if (m.years_experience != null) lines.push(`Years in practice: ${m.years_experience}`);
    if (payload.website) lines.push(payload.website);
  }
  if (kind === 'intake' && payload.website) lines.push(payload.website);
  if (kind === 'careers') {
    lines.push(`Role: ${(payload.meta && payload.meta.role_label) || ''}`);
    if (payload.website) lines.push(payload.website);
  }
  if (payload.message) lines.push(`> ${String(payload.message).slice(0, 500).replace(/\n+/g, ' ')}`);
  lines.push('In Friday under Calm Joints (and Scale, tagged calmjoints, for applications).');
  return lines.join('\n');
}

async function sendAlert(kind, payload, env, fetchImpl) {
  const url = (env.CJ_ALERT_SLACK_WEBHOOK_URL || '').trim();
  if (!url) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: alertText(kind, payload) }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch (err) {
    console.error('[intake] alert failed', err && err.message);
    return { ok: false };
  }
}

async function postFriday(fridayPayload, env, fetchImpl) {
  const url = FRIDAY_INTAKE_URL;
  const key = intakeSecret(env);
  if (!key) return { ok: false, skipped: true, reason: 'unconfigured', url };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        'X-Intake-Secret': key,
      },
      body: JSON.stringify(fridayPayload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[intake] friday status', res.status);
      return { ok: false, skipped: false, status: res.status, url };
    }
    return { ok: true, status: res.status, url };
  } catch (err) {
    console.error('[intake] friday failed', err && err.message);
    return { ok: false, skipped: false, url };
  }
}

function storePaths(env) {
  const paths = [];
  if (env.INTAKE_STORE_PATH) paths.push(env.INTAKE_STORE_PATH);
  if (!env.VERCEL) paths.push(path.join(process.cwd(), 'data', 'intakes.jsonl'));
  paths.push('/tmp/calmjoints-intakes.jsonl');
  return paths;
}

function writeLocal(record, env) {
  const line = `${JSON.stringify(record)}\n`;
  for (const file of storePaths(env)) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 });
      return { ok: true, file };
    } catch (err) {
      console.error('[intake] local store skipped', file, err && err.message);
    }
  }
  return { ok: false };
}

async function writeNeon(record, env) {
  const url = env.NEON_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) return { ok: false, skipped: true };
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    if (!neonReady) {
      neonReady = sql`CREATE TABLE IF NOT EXISTS calm_joints_intakes (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        type text NOT NULL,
        source text NOT NULL,
        payload jsonb NOT NULL,
        received_at timestamptz NOT NULL,
        stored_at timestamptz NOT NULL DEFAULT now()
      )`;
    }
    await neonReady;
    await sql`INSERT INTO calm_joints_intakes (type, source, payload, received_at)
      VALUES (${record.type}, ${record.source}, ${JSON.stringify(record.payload)}::jsonb, ${record.received_at})`;
    return { ok: true };
  } catch (err) {
    neonReady = null;
    console.error('[intake] neon failed', err && err.message);
    return { ok: false, skipped: false };
  }
}

function successMessage(kind) {
  if (kind === 'newsletter') {
    return 'Thanks. We’ll email you tips now and then.';
  }
  if (kind === 'intake') return 'Thanks. We’ve got it, and a person will be in touch.';
  if (kind === 'careers') return 'Thanks. A person on the team will write you back.';
  if (kind === 'question') {
    return 'Thanks. Your question is with the team, and a person will write you back.';
  }
  return 'Got it. Your application is with the team, and a person will write you back.';
}

async function processIntake(kind, body, ctx = {}) {
  const env = ctx.env || process.env;
  const ip = ctx.ip || 'unknown';
  if (body && cleanText(body.company, 200)) {
    return { status: 200, json: { ok: true, message: successMessage(kind) } };
  }
  if (!rateLimit(`${kind}:${ip}`, ctx.rate || {})) {
    return {
      status: 429,
      json: {
        ok: false,
        message: 'Easy there — try again in a few minutes, or email info@calmjoints.org.',
      },
    };
  }

  const validators = { newsletter: validateNewsletter, question: validateQuestion, intake: validateIntake, careers: validateCareers, apply: validateApply };
  const parsed = (validators[kind] || validateApply)(body || {});
  if (parsed.error) return { status: 400, json: { ok: false, message: parsed.error } };

  const externalId = externalIdFor(kind, ctx.externalId);
  const fridayPayload = fridayBody(kind, parsed.value, externalId);
  const record = recordBody(kind, fridayPayload, (ctx.now || new Date()).toISOString());
  const fetchImpl = ctx.fetchImpl || fetch;
  const friday = await postFriday(fridayPayload, env, fetchImpl);
  // Only physio applicants are mirrored into Scale's CA fulfillment lane.
  if (fridayPayload.kind === 'providers') {
    try {
      const scale = await postFriday(scaleCopyBody(fridayPayload), env, fetchImpl);
      console.log(`[intake] scale-copy=${scale.ok ? 'ok' : 'no'}`);
    } catch (err) {
      console.log('[intake] scale-copy=error');
    }
  }
  let local = { ok: false, skipped: true };
  let neon = { ok: false, skipped: true };
  if (!friday.ok) {
    local = writeLocal(record, env);
    neon = await writeNeon(record, env);
  }
  const ok = Boolean(friday.ok || local.ok || neon.ok);
  if (ok) {
    const alert = await sendAlert(kind, fridayPayload, env, fetchImpl);
    if (!alert.skipped) console.log(`[intake] alert=${alert.ok ? 'ok' : 'no'}`);
  }
  console.log(`[intake] type=${kind} friday=${friday.ok ? 'ok' : 'no'} local=${local.ok ? 'ok' : 'no'} neon=${neon.ok ? 'ok' : 'no'}`);
  if (!ok) {
    return {
      status: 503,
      json: {
        ok: false,
        message: 'We couldn’t hold onto that just now. Email info@calmjoints.org and we’ll add you by hand.',
      },
    };
  }
  return { status: 200, json: { ok: true, message: successMessage(kind) } };
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function send(res, status, json) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(json);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Allow: 'POST',
  });
  res.end(JSON.stringify(json));
}

function createHandler(kind) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, message: 'Send that as a POST and we’ll take it from there.' });
      return;
    }
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && host) {
      try {
        if (new URL(origin).host !== String(host).split(',')[0].trim()) {
          send(res, 403, { ok: false, message: 'That request didn’t come from Calm Joints.' });
          return;
        }
      } catch {
        send(res, 400, { ok: false, message: 'We couldn’t read where that came from.' });
        return;
      }
    }

    let body = req.body;
    if (body == null && typeof req.on === 'function') {
      body = await readRaw(req);
    }
    if (typeof body === 'string') {
      if (body.length > 20000) {
        send(res, 400, { ok: false, message: 'That note is a bit long. Short and human is perfect.' });
        return;
      }
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      send(res, 400, { ok: false, message: 'We couldn’t read that. Try once more?' });
      return;
    }
    const result = await processIntake(kind, body, { ip: clientIp(req) });
    send(res, result.status, result.json);
  };
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = {
  PROVINCES,
  NOTIFY_EMAIL,
  SOURCE,
  FRIDAY_INTAKE_URL,
  fridayBody,
  splitName,
  linkedinUrl,
  externalIdFor,
  validateNewsletter,
  validateApply,
  validateQuestion,
  validateIntake,
  validateCareers,
  alertText,
  processIntake,
  createHandler,
  rateLimit,
  buckets,
};
