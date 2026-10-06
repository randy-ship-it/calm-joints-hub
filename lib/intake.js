/**
 * Calm Joints intake — validate, lightly rate-limit, persist.
 * Friday webhook is primary. If it is missing or fails, write a local JSONL
 * file and, when configured, a Neon row so a submission is not dropped.
 */

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

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

// Resumes: PDF, DOC or DOCX up to 3 MB, stored in a private Vercel Blob store.
// Friday gets a signed calmjoints.org link, never the raw storage URL.
const RESUME_MAX_BYTES = 3 * 1024 * 1024;
const RESUME_TYPES = {
  pdf: { mime: 'application/pdf', magic: (b) => b.slice(0, 4).toString('latin1') === '%PDF' },
  doc: { mime: 'application/msword', magic: (b) => b.slice(0, 4).toString('hex') === 'd0cf11e0' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: (b) => b.slice(0, 2).toString('latin1') === 'PK' },
};

function cleanResume(raw) {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'object' || typeof raw.data !== 'string') return { error: 'We couldn’t read that resume. Try a PDF or Word file?' };
  const name = cleanText(raw.name, 140) || 'resume';
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  const kind = ext && RESUME_TYPES[ext.toLowerCase()];
  if (!kind) return { error: 'Resumes can be a PDF or Word file (.pdf, .doc, .docx).' };
  const b64 = raw.data.replace(/^data:[^,]*,/, '');
  if (b64.length > Math.ceil(RESUME_MAX_BYTES / 3) * 4 + 8) return { error: 'That resume is over 3 MB. A smaller PDF works great.' };
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { buf = null; }
  if (!buf || !buf.length) return { error: 'That resume looks empty. Try once more?' };
  if (buf.length > RESUME_MAX_BYTES) return { error: 'That resume is over 3 MB. A smaller PDF works great.' };
  if (!kind.magic(buf)) return { error: 'That file doesn’t look like a PDF or Word document.' };
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || `resume.${ext}`;
  return { value: { name: safe, type: kind.mime, size: buf.length, buffer: buf } };
}

function resumeSig(pathname, env) {
  const key = intakeSecret(env);
  if (!key) return null;
  return nodeCrypto.createHmac('sha256', key).update(`resume:${pathname}`).digest('hex').slice(0, 40);
}

function resumeLink(pathname, env) {
  const sig = resumeSig(pathname, env);
  if (!sig) return null;
  return `https://${SOURCE}/api/resume?f=${encodeURIComponent(pathname)}&s=${sig}`;
}

async function storeResume(resume, externalId, env, ctx = {}) {
  if (!env.BLOB_READ_WRITE_TOKEN && !ctx.blobPut) return { ok: false, skipped: true };
  const pathname = `resumes/${externalId}/${resume.name}`;
  try {
    const put = ctx.blobPut || require('@vercel/blob').put;
    await put(pathname, resume.buffer, { access: 'private', contentType: resume.type, addRandomSuffix: false, allowOverwrite: false, token: env.BLOB_READ_WRITE_TOKEN });
    return { ok: true, pathname };
  } catch (err) {
    console.error('[intake] resume store failed', err && err.message);
    return { ok: false };
  }
}

function cleanText(value, max) {
  if (value == null) return '';
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
  return text.slice(0, max);
}

function validEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Calming Newsletters (CASL): express opt-in only. The checkbox text below is
// what the person agreed to, and we keep it with the signup as the consent record.
const CALMING_SRC = 'cj-calming-newsletter';
const CALMING_CONSENT_VERSION = 'calming-v1-2026-10';
const CALMING_CONSENT_TEXT = 'Yes, email me Calming Newsletters from Calm Joints (Clairvoyant Holdings Inc.). I can unsubscribe anytime. Sender: Calm Joints, a trade name of Clairvoyant Holdings Inc., Unit 777, 2255B Queen St E, Toronto ON M4E 1G3, info@calmjoints.org.';
const CALMING_PLACEMENTS = new Set(['popup', 'inline', 'footer', 'blog-footer', 'blog-popup']);

function truthy(v) {
  return v === true || v === 'on' || v === 'yes' || v === 'true' || v === '1';
}

function calmingExtras(body) {
  if (!truthy(body.consent)) {
    return { error: 'Tick the box so we know it’s OK to email you.' };
  }
  const placement = cleanText(body.placement, 24).toLowerCase();
  const page = cleanText(body.page, 200);
  return {
    value: {
      src: CALMING_SRC,
      list: 'Calming Newsletters',
      placement: CALMING_PLACEMENTS.has(placement) ? placement : 'other',
      page: page && page.startsWith('/') ? page : null,
      consent: {
        type: 'express',
        law: 'CASL',
        version: CALMING_CONSENT_VERSION,
        text: CALMING_CONSENT_TEXT,
      },
      // A clearly marked QA entry: tagged `test` in Friday and no team alert.
      test: body.test === true,
    },
  };
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
  if (body.src === CALMING_SRC) {
    const extra = calmingExtras(body);
    if (extra.error) return extra;
    return { value: { email, name: name || null, notify_email: NOTIFY_EMAIL, interests: ['newsletters'], ...extra.value } };
  }
  return {
    value: {
      email,
      name: name || null,
      notify_email: NOTIFY_EMAIL,
      interests: ['blogs', 'newsletters', 'latest'],
      ...(body.src === 'cj-brands-full' ? { src: 'cj-brands-full' } : {}),
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
// Brands form: who is asking. Routed to Scale's brand and hub lane.
const ORG_TYPES = { brand: 'Brand', gym: 'Gym or studio', clinic: 'Clinic', other: 'Other' };

function validateIntake(body) {
  const site = cleanWebsite(body.website);
  if (site.error) return { error: site.error };
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  if (!name || !validName(name, true)) return { error: 'What should we call you?' };
  if (!validEmail(email)) return { error: 'That email doesn’t look quite right.' };
  const message = cleanMessage(body.message, 1500);
  const orgType = ORG_TYPES[cleanText(body.org_type, 20)] ? cleanText(body.org_type, 20) : null;
  return { value: { website: site.value, name, email, message: message || null, org_type: orgType, notify_email: NOTIFY_EMAIL } };
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
  const rawRoles = Array.isArray(body.roles) ? body.roles : Array.isArray(body.role) ? body.role : [body.roles || body.role];
  const roles = [...new Set(rawRoles.map((r) => cleanText(r, 40)).filter(Boolean))].slice(0, 6);
  if (!name || !validName(name, true)) return { error: 'What should we call you?' };
  if (!validEmail(email)) return { error: 'That email doesn’t look quite right.' };
  if (!roles.length) return { error: 'Pick at least one way you want to work.' };
  if (roles.some((r) => !CAREER_ROLES[r])) return { error: 'Pick the role you want.' };
  const role = roles[0];
  let link = null;
  const rawLink = cleanText(body.link, 300);
  if (rawLink) {
    const parsed = cleanWebsite(rawLink);
    if (parsed.error) return { error: 'That link doesn’t look quite right. LinkedIn or a website is perfect.' };
    link = parsed.value;
  }
  const province = cleanText(body.province, 4).toUpperCase();
  if (!province) return { error: 'Pick the province you’re registered in.' };
  if (province !== 'NONE' && !PROVINCES[province]) return { error: 'Pick the province you’re registered in.' };
  const registered = body.registered === true || body.registered === 'yes' || body.registered === 'on' || body.registered === 'true';
  const message = cleanMessage(body.message, 1500);
  const resume = cleanResume(body.resume);
  if (resume.error) return { error: resume.error };
  // Provider details (optional, added for the Calm Joints guide's provider mode).
  const PROFESSIONS = ['physiotherapist', 'rmt', 'chiropractor', 'kinesiologist', 'occupational-therapist', 'multi-practitioner', 'other'];
  const profRaw = cleanText(body.profession, 40).toLowerCase();
  const profession = profRaw ? (PROFESSIONS.includes(profRaw) ? profRaw : 'other') : null;
  const phoneRaw = cleanText(body.phone, 22);
  if (phoneRaw && (!/^[0-9+().\-\s]{7,22}$/.test(phoneRaw) || phoneRaw.replace(/\D/g, '').length < 7)) return { error: 'Phone can be blank, or a normal number we can dial.' };
  const registration_number = cleanText(body.registration_number, 40) || null;
  const city = cleanText(body.city, 60) || null;
  const hours_available = cleanText(body.hours_available, 80) || null;
  const audience = body.audience === true || body.audience === 'yes' || body.audience === 'true';
  const via = ['guide', 'site'].includes(cleanText(body.via, 10)) ? cleanText(body.via, 10) : 'site';
  return { value: { profession, phone: phoneRaw || null, registration_number, city, hours_available, audience, via, name, email, role, role_label: CAREER_ROLES[role], province: province === 'NONE' ? null : province, province_name: province === 'NONE' ? null : PROVINCES[province], registered, link, message: message || null, resume: resume.value, roles, role_labels: roles.map((r) => CAREER_ROLES[r]), notify_email: NOTIFY_EMAIL } };
}

function cleanLinkedin(raw) {
  let value = cleanText(raw, 200);
  if (!value) return { value: null };
  if (/^([a-z0-9-]+\.)?linkedin\.com(\/|$)/i.test(value)) value = `https://${value}`;
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

// Footer "Partner with Calm Joints" pop-up: which track, who, how to reach them.
const PARTNER_TRACKS = { 'free-hub': 'Launch a Free Hub', managed: 'CJ Managed Services', other: 'Other' };

function validatePartner(body) {
  const trackKey = cleanText(body.track, 20);
  if (!PARTNER_TRACKS[trackKey]) return { error: 'Pick what you’d like to do with us.' };
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  if (!name || !validName(name, true)) return { error: 'What should we call you?' };
  if (!validEmail(email)) return { error: 'That email doesn’t look quite right.' };
  let website = null;
  if (cleanText(body.website, 300)) {
    const site = cleanWebsite(body.website);
    if (site.error) return { error: site.error };
    website = site.value;
  }
  const phone = cleanText(body.phone, 40);
  if (phone && !/^[+()\d][\d\s().+-]{6,}$/.test(phone)) return { error: 'That phone number doesn’t look quite right.' };
  const message = cleanMessage(body.message, 1000);
  return { value: { track: trackKey, track_label: PARTNER_TRACKS[trackKey], name, email, website, phone: phone || null, message: message || null, notify_email: NOTIFY_EMAIL } };
}

function externalIdFor(kind, explicit) {
  if (explicit) return String(explicit).slice(0, 160);
  const id = crypto.randomUUID();
  if (kind === 'newsletter') return `cj-news-${id}`;
  if (kind === 'question') return `cj-question-${id}`;
  if (kind === 'intake') return `cj-intake-${id}`;
  if (kind === 'careers') return `cj-careers-${id}`;
  if (kind === 'partner') return `cj-partner-${id}`;
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
    if (value.src === CALMING_SRC) {
      body.source = CALMING_SRC;
      body.path = value.page || '/';
      body.tags = ['calmjoints', 'newsletter', CALMING_SRC, 'calming-newsletters', `placement:${value.placement}`, 'consent:casl-express', ...(value.test ? ['test'] : [])];
      body.meta = {
        ...(value.name ? { name: value.name } : {}),
        list: value.list,
        placement: value.placement,
        consent: value.consent,
        ...(value.test ? { test: true } : {}),
      };
      return body;
    }
    if (value.src === 'cj-brands-full') {
      body.source = 'calmjoints_brands_full';
      body.path = '/#brands-full';
      body.tags = ['calmjoints', 'brands', 'cj-brands-full', 'scale-hubs', 'full-monetization'];
    }
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
      ...(value.org_type ? { meta: { org_type: value.org_type, org_type_label: ORG_TYPES[value.org_type] } } : {}),
      tags: ['calmjoints', 'intake', ...(value.org_type ? [`org:${value.org_type}`] : [])],
    };
  }

  if (kind === 'partner') {
    const meta = { track: value.track, track_label: value.track_label };
    if (value.phone) meta.phone = value.phone;
    return {
      externalId,
      email: value.email,
      ...splitName(value.name),
      site: SOURCE,
      org: 'calmjoints',
      source: 'calmjoints_partner',
      path: '/#partner',
      kind: 'form',
      ...(value.website ? { website: value.website } : {}),
      ...(value.message ? { message: value.message } : {}),
      meta,
      tags: ['calmjoints', 'partner', `track:${value.track}`],
    };
  }

  if (kind === 'careers') {
    const roles = value.roles || [value.role];
    const physio = roles.some((r) => r !== 'accessibility');
    const meta = { role: value.role, role_label: (value.role_labels || [value.role_label]).join(', '), roles };
    meta.registered = !!value.registered;
    meta.province = value.province || null;
    if (value.profession) meta.profession = value.profession;
    if (value.phone) meta.phone = value.phone;
    if (value.registration_number) meta.license = value.registration_number;
    if (value.city) meta.city = value.city;
    if (value.hours_available) meta.availability = value.hours_available;
    meta.work_mode = roles.includes('digital') && roles.some((r) => r === 'in-home' || r === 'on-site') ? 'virtual+in-person' : roles.includes('digital') ? 'virtual' : 'in-person';
    if (value.audience) meta.audience = true;
    if (value.via && value.via !== 'site') meta.via = value.via;
    if (value.province_name) meta.province_name = value.province_name;
    if (value.link) meta.link = value.link;
    if (value.resume_url) {
      meta.resume_url = value.resume_url;
      meta.resume_name = value.resume_name;
    } else if (value.resume) {
      meta.resume_status = 'upload_failed';
    }
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
      ...(value.phone ? { phone: value.phone } : {}),
      tags: ['calmjoints', 'careers', 'provider', ...(value.province === 'ON' ? ['provider-ontario'] : []), ...(value.profession ? [`profession:${value.profession}`] : []), ...(value.audience ? ['audience'] : []), ...roles.map((r) => `role:${r}`), ...(value.province ? [`province:${value.province}`] : ['province:none']), ...(value.registered ? ['registered'] : []), ...(value.resume_url ? ['has-resume'] : [])],
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
function scaleCopyBody(payload, lane = 'fulfillment-ca', extraTags = ['calmjoints-staff']) {
  return {
    ...payload,
    externalId: `scale-${payload.externalId}`.slice(0, 160),
    site: 'scalehealth.ca',
    org: 'scalehealth',
    lane,
    company: 'Calm Joints',
    source: payload.source,
    tags: [...new Set([...(payload.tags || []), ...extraTags])],
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
  const labels = { apply: 'New physio application', question: 'New question', intake: 'New intake', careers: 'New careers application', newsletter: 'New email signup', partner: 'New partner request', qrlead: 'New QR scan lead' };
  const label = labels[kind] || 'New submission';
  const lines = [`*${label}* on calmjoints.org`, `${who ? `${who} · ` : ''}${payload.email}`];
  if (kind === 'apply') {
    const m = payload.meta || {};
    if (m.provinces && m.provinces.length) lines.push(`Registered: ${m.provinces.join(', ')}`);
    if (m.years_experience != null) lines.push(`Years in practice: ${m.years_experience}`);
    if (payload.website) lines.push(payload.website);
  }
  if (kind === 'intake' && payload.meta && payload.meta.org_type_label) lines.push(`Type: ${payload.meta.org_type_label}`);
  if (kind === 'newsletter' && payload.source === 'calmjoints_brands_full') lines.push('From: Brands section, Full monetization (Scale Hubs)');
  if (kind === 'newsletter' && payload.source === CALMING_SRC) lines.push(`From: Calming Newsletters (${(payload.meta && payload.meta.placement) || 'site'})`);
  if (kind === 'intake' && payload.website) lines.push(payload.website);
  if (kind === 'careers') {
    lines.push(`Role: ${(payload.meta && payload.meta.role_label) || ''}`);
    if (payload.meta) lines.push(`Registered in: ${payload.meta.province_name || 'Not yet'}${payload.meta.registered ? ' (registered practitioner)' : ''}`);
    if (payload.meta && payload.meta.resume_url) lines.push(`Resume: ${payload.meta.resume_url}`);
    if (payload.website) lines.push(payload.website);
  }
  if (kind === 'partner') {
    const m = payload.meta || {};
    lines.push(`Wants: ${m.track_label || ''}`);
    if (m.phone) lines.push(`Phone: ${m.phone}`);
    if (payload.website) lines.push(payload.website);
  }
  if (payload.message) lines.push(`> ${String(payload.message).slice(0, 500).replace(/\n+/g, ' ')}`);
  lines.push('In Friday under Calm Joints, with a copy in Scale for physio applications and brand asks.');
  return lines.join('\n');
}

// Team email: goes out the moment a real submission lands. Sent through the
// Resend account with a sending-only key (CJ_RESEND_API_KEY) to CJ_ALERT_EMAILS.
// Newsletter signups are skipped so the inbox only gets things a person answers.
const EMAIL_ALERT_KINDS = new Set(['partner', 'intake', 'careers', 'apply', 'question', 'newsletter', 'qrlead']);

function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function alertEmailBody(kind, payload) {
  const lines = alertText(kind, payload).split('\n');
  const title = lines[0].replace(/\*/g, '');
  const rows = lines.slice(1).map((l) => {
    const t = escHtml(l.replace(/^> /, ''));
    const linked = t.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#15803D">$1</a>');
    return l.startsWith('> ')
      ? `<p style="margin:12px 0;padding:10px 14px;background:#F5F8F6;border-radius:10px;color:#0B1D16">${linked}</p>`
      : `<p style="margin:6px 0;color:#0B1D16">${linked}</p>`;
  }).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;background:#ffffff;max-width:560px;padding:20px"><p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#15803D">Calm Joints</p><h2 style="margin:0 0 12px;font-size:20px;color:#0B1D16">${escHtml(title)}</h2>${rows}<p style="margin:16px 0 0;font-size:13px;color:#4B5E54">Reply to this email to answer them directly.</p></div>`;
  return { subject: `${title.replace(/ on calmjoints\.org$/, '')}: ${[payload.firstName, payload.lastName].filter(Boolean).join(' ') || payload.email}`, html, text: lines.join('\n').replace(/\*/g, '') };
}

async function sendEmailAlert(kind, payload, env, fetchImpl) {
  const key = (env.CJ_RESEND_API_KEY || '').trim();
  const to = String(env.CJ_ALERT_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!key || !to.length || !EMAIL_ALERT_KINDS.has(kind)) return { ok: false, skipped: true };
  const mail = alertEmailBody(kind, payload);
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: (env.CJ_ALERT_FROM || 'Calm Joints <alerts@scalehealth.ca>').trim(),
        to,
        reply_to: payload.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error('[intake] email alert failed', err && err.message);
    return { ok: false };
  }
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

function successMessage(kind, value) {
  if (kind === 'newsletter' && value && value.src === CALMING_SRC) {
    return 'You’re in. Your first Calming Newsletter is on its way soon.';
  }
  if (kind === 'newsletter') {
    return 'Thanks. We’ll email you tips now and then.';
  }
  if (kind === 'intake') return 'Thanks. We’ve got it, and a person will be in touch.';
  if (kind === 'careers') return 'Thanks. A person on the team will write you back.';
  if (kind === 'partner') return 'Thanks. It’s with the team, and a person will be in touch soon.';
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

  const validators = { newsletter: validateNewsletter, question: validateQuestion, intake: validateIntake, careers: validateCareers, apply: validateApply, partner: validatePartner };
  const parsed = (validators[kind] || validateApply)(body || {});
  if (parsed.error) return { status: 400, json: { ok: false, message: parsed.error } };

  const externalId = externalIdFor(kind, ctx.externalId || (parsed.value.test ? `cj-news-test-${crypto.randomUUID()}` : null));
  if (parsed.value.resume) {
    const stored = await storeResume(parsed.value.resume, externalId, env, ctx);
    if (stored.ok) {
      parsed.value.resume_url = resumeLink(stored.pathname, env);
      parsed.value.resume_name = parsed.value.resume.name;
    }
    console.log(`[intake] resume=${stored.ok ? 'ok' : 'no'}`);
  }
  const fridayPayload = fridayBody(kind, parsed.value, externalId);
  const record = recordBody(kind, fridayPayload, (ctx.now || new Date()).toISOString());
  const fetchImpl = ctx.fetchImpl || fetch;
  const friday = await postFriday(fridayPayload, env, fetchImpl);
  // Physio applicants are mirrored into Scale's CA fulfillment lane. Brand,
  // gym and clinic asks from the brands form go to Scale's hub lane, since
  // Scale Health powers that intake.
  const scaleCopy = fridayPayload.kind === 'providers'
    ? scaleCopyBody(fridayPayload)
    : kind === 'intake'
      ? scaleCopyBody(fridayPayload, 'hubs', ['calmjoints-referral', 'hub-intake'])
      : null;
  if (scaleCopy) {
    try {
      const scale = await postFriday(scaleCopy, env, fetchImpl);
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
  const qa = Boolean(parsed.value.test);
  if (ok && !qa) {
    const [alert, mail] = await Promise.all([
      sendAlert(kind, fridayPayload, env, fetchImpl),
      sendEmailAlert(kind, fridayPayload, env, fetchImpl),
    ]);
    if (!alert.skipped) console.log(`[intake] alert=${alert.ok ? 'ok' : 'no'}`);
    if (!mail.skipped) console.log(`[intake] email=${mail.ok ? 'ok' : `no:${mail.status || ''}`}`);
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
  return { status: 200, json: { ok: true, message: successMessage(kind, parsed.value) } };
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
      if (body.length > (kind === 'careers' ? 4400000 : 20000)) {
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
  CALMING_SRC,
  CALMING_CONSENT_TEXT,
  postFriday,
  sendAlert,
  clientIp,
  send,
  readRaw,
  scaleCopyBody,
  ORG_TYPES,
  cleanResume,
  resumeSig,
  resumeLink,
  storeResume,
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
  validatePartner,
  sendEmailAlert,
  alertEmailBody,
  PARTNER_TRACKS,
  rateLimit,
  buckets,
};
