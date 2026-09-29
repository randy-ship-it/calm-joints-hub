/**
 * Calm Joints intake — validate, lightly rate-limit, persist.
 * Friday webhook is primary. If it is missing or fails, write a local JSONL
 * file and, when configured, a Neon row so a submission is not dropped.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'calmjoints.ca';
const NOTIFY_EMAIL = 'info@calmjoints.ca';

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

function recordBody(type, payload, receivedAt) {
  return {
    type,
    source: SOURCE,
    payload,
    received_at: receivedAt,
  };
}

async function postFriday(record, env, fetchImpl) {
  const url = env.FRIDAY_INTAKE_URL;
  if (!url) return { ok: false, skipped: true, reason: 'unconfigured' };
  const secret = env.FRIDAY_INTAKE_SECRET || '';
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['X-Friday-Secret'] = secret;
  }
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[intake] friday status', res.status);
      return { ok: false, skipped: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error('[intake] friday failed', err && err.message);
    return { ok: false, skipped: false };
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
    return 'You’re on the list. We’ll send the blogs and news there — and a note goes to info@calmjoints.ca too.';
  }
  return 'Got it. A person at Calm Joints will read your hello. If we need anything else, we’ll write you.';
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
        message: 'Easy there — try again in a few minutes, or email info@calmjoints.ca.',
      },
    };
  }

  const parsed = kind === 'newsletter' ? validateNewsletter(body || {}) : validateApply(body || {});
  if (parsed.error) return { status: 400, json: { ok: false, message: parsed.error } };

  const record = recordBody(kind, parsed.value, (ctx.now || new Date()).toISOString());
  const fetchImpl = ctx.fetchImpl || fetch;
  const friday = await postFriday(record, env, fetchImpl);
  let local = { ok: false, skipped: true };
  let neon = { ok: false, skipped: true };
  if (!friday.ok) {
    local = writeLocal(record, env);
    neon = await writeNeon(record, env);
  }
  const ok = Boolean(friday.ok || local.ok || neon.ok);
  console.log(`[intake] type=${kind} friday=${friday.ok ? 'ok' : 'no'} local=${local.ok ? 'ok' : 'no'} neon=${neon.ok ? 'ok' : 'no'}`);
  if (!ok) {
    return {
      status: 503,
      json: {
        ok: false,
        message: 'We couldn’t hold onto that just now. Email info@calmjoints.ca and we’ll add you by hand.',
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
  validateNewsletter,
  validateApply,
  processIntake,
  createHandler,
  rateLimit,
  buckets,
};
