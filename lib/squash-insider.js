'use strict';

const crypto = require('crypto');
const { rateLimit } = require('./intake');

const RECIPIENT = 'info@calmjoints.com';
const ACCESS_CODE = 'randywholesale';
const buckets = new Map();

const OFFER = [
  'Something good is coming: wholesale-rate access for selected Calm Joints insiders. Product eligibility and final offers will be confirmed before anything is available to buy.',
  'Choose the products you want a reply about. No payment is taken, and no credit is awarded now.',
];

const PRODUCTS = [
  {
    id: 'drho-tens-pro',
    name: 'TENS Pro Essentials',
    detail: 'Pain Therapy System Pro, Essential Package',
    price_label: 'CA$249.95',
    price_kind: 'Listed price',
    source: 'drhonow.com, 8 Nov 2026',
    href: 'https://drhonow.com/products/pain-therapy-system-pro-basic-package',
  },
  {
    id: 'roll-r8',
    name: 'R8 Deep Tissue Massage Tool',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$149.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r8-new',
  },
  {
    id: 'roll-r3',
    name: 'R3 Orthopedic Foot Roller',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$35.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r3',
  },
  {
    id: 'roll-stretchmat',
    name: 'StretchMat',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$65.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/stretchmat',
  },
];

function codeAccepted(input) {
  const given = Buffer.from(String(input || '').trim().toLowerCase());
  const want = Buffer.from(ACCESS_CODE);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

function emailOk(value) {
  const email = String(value || '').trim();
  if (email.length < 6 || email.length > 120) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function chosenProducts(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > PRODUCTS.length) return null;
  const byId = new Map(PRODUCTS.map((item) => [item.id, item]));
  const seen = new Set();
  const picked = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item || seen.has(id)) return null;
    seen.add(id);
    picked.push(item);
  }
  return picked;
}

function publicProducts() {
  return PRODUCTS.map((item) => ({
    id: item.id,
    name: item.name,
    detail: item.detail,
    price_label: item.price_label,
    price_kind: item.price_kind,
    source: item.source,
    href: item.href,
  }));
}

function limited(ip, action) {
  return rateLimit('squash-insider:' + action + ':' + ip, {
    limit: action === 'interest' ? 4 : 8,
    windowMs: 10 * 60 * 1000,
    store: buckets,
  });
}

async function deliver(env, fetchImpl, mail) {
  const key = String((env && env.CJ_RESEND_API_KEY) || '').trim();
  if (!key) return { ok: false, delivery: 'unconfigured' };
  const from = String((env && env.CJ_ALERT_FROM) || 'Calm Joints <alerts@scalehealth.ca>').trim();
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, delivery: 'failed' };
    return { ok: true, delivery: 'sent' };
  } catch (err) {
    return { ok: false, delivery: 'failed' };
  }
}

function interestText(email, products) {
  const lines = [
    'Squash product interest',
    'Inbox: ' + RECIPIENT,
    'Reply to: ' + email,
    'Insider code: accepted',
    'This is interest only. No order, payment, reservation, or credit.',
    'Products:',
  ];
  products.forEach((item) => lines.push('- ' + item.name));
  return lines.join('\n');
}

async function handleInsider({ body, ip, env, fetchImpl }) {
  const payload = body && typeof body === 'object' ? body : {};
  if (String(payload.company || '').trim()) return { status: 400, json: { ok: false, error: 'rejected' } };
  const intent = payload.intent === 'interest' ? 'interest' : payload.intent === 'open' ? 'open' : '';
  if (!intent) return { status: 400, json: { ok: false, error: 'intent' } };
  if (!limited(ip || 'unknown', intent)) return { status: 429, json: { ok: false, error: 'rate' } };
  if (!codeAccepted(payload.code)) return { status: 401, json: { ok: false, error: 'code' } };
  if (intent === 'open') {
    return { status: 200, json: { ok: true, offer: OFFER, products: publicProducts() } };
  }
  const email = emailOk(payload.email);
  if (!email) return { status: 400, json: { ok: false, error: 'email' } };
  const products = chosenProducts(payload.product_ids);
  if (!products) return { status: 400, json: { ok: false, error: 'products' } };
  const text = interestText(email, products);
  const sent = await deliver(env, fetchImpl, {
    replyTo: email,
    subject: 'Squash product interest',
    text,
  });
  if (!sent.ok) return { status: sent.delivery === 'unconfigured' ? 503 : 502, json: { ok: false, delivery: sent.delivery } };
  return { status: 200, json: { ok: true, delivery: 'sent' } };
}

module.exports = {
  RECIPIENT,
  PRODUCTS,
  OFFER,
  codeAccepted,
  handleInsider,
  interestText,
  buckets,
};
