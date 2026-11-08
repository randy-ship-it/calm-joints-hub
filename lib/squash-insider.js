'use strict';

const crypto = require('crypto');
const { rateLimit } = require('./intake');

const RECIPIENT = 'info@calmjoints.com';
const ACCESS_CODE = 'randywholesale';
const buckets = new Map();

const OFFER = [
  'We intend to pass along our business wholesale rates: the margin, except processing fees. That is not active on this page. We will confirm eligibility in a follow-up and send a link to buy when it is ready. This is not a guaranteed discount.',
  'Choose products for a wishlist. No payment is taken, nothing is reserved, and no credit is awarded now.',
];
const STORE = {
  href: 'https://www.scalehealth.ca/calmjoints?src=cjsite&place=home',
  note: 'A free membership at the Industry Insider’s Store is separate from this page. It does not turn these rates on, and nothing is synced.',
};

const PRODUCTS = [
  {
    id: 'roll-r8',
    use: 'Legs',
    name: 'R8 Deep Tissue Massage Tool',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$149.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r8-new',
  },
  {
    id: 'roll-r8plus',
    use: 'Legs',
    name: 'R8 Plus Deep Tissue Massage Tool',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$179.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r8plus',
  },
  {
    id: 'roll-r3',
    use: 'Feet',
    name: 'R3 Orthopedic Foot Roller',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$35.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r3',
  },
  {
    id: 'roll-stretchmat',
    use: 'Stretch',
    name: 'StretchMat',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$65.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/stretchmat',
  },
  {
    id: 'drho-tens-pro',
    use: 'Recovery',
    name: 'TENS Pro Essentials',
    detail: 'Pain Therapy System Pro, Essential Package',
    price_label: 'CA$249.95',
    price_kind: 'Listed price',
    source: 'drhonow.com, 8 Nov 2026',
    href: 'https://drhonow.com/products/pain-therapy-system-pro-basic-package',
  },
  {
    id: 'roll-r1',
    use: 'Recovery',
    name: 'R1 Percussion',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$139.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r1',
  },
];

function codeAccepted(input) {
  const phrase = String(input || '').trim().toLowerCase();
  if (!/^randy\s*wholesale$/.test(phrase)) return false;
  const given = Buffer.from(phrase.replace(/\s+/g, ''));
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
    use: item.use,
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

function staffText(email, products) {
  const lines = [
    'Squash wishlist',
    'To: ' + RECIPIENT,
    'Person: ' + email,
    'Insider code: accepted',
    'Wishlist only. No order, payment, reservation, or credit.',
    'Tell them when wholesale rates are applied and send a transaction link when it is ready.',
    'Products:',
  ];
  products.forEach((item) => lines.push('- ' + item.id + ': ' + item.name + ' (' + item.price_label + ')'));
  return lines.join('\n');
}

function visitorText(products) {
  const lines = [
    'Your Calm Joints squash wishlist',
    'This is a wishlist, not an order. Nothing was reserved or charged.',
    'We will write when wholesale rates are applied and send a link to buy when it is ready. That offer is not active yet.',
    'You asked about:',
  ];
  products.forEach((item) => lines.push('- ' + item.name + ': ' + item.price_label + ' listed price'));
  return lines.join('\n');
}

async function deliverBoth(env, fetchImpl, email, products) {
  const key = String((env && env.CJ_RESEND_API_KEY) || '').trim();
  if (!key) return { ok: false, delivery: 'unconfigured' };
  const from = String((env && env.CJ_ALERT_FROM) || 'Calm Joints <alerts@scalehealth.ca>').trim();
  async function one(mail) {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        from,
        to: [mail.to],
        reply_to: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  }
  try {
    const staffOk = await one({
      to: RECIPIENT,
      replyTo: email,
      subject: 'Squash wishlist',
      text: staffText(email, products),
    });
    if (!staffOk) return { ok: false, delivery: 'failed' };
    const visitorOk = await one({
      to: email,
      replyTo: RECIPIENT,
      subject: 'Your Calm Joints squash wishlist',
      text: visitorText(products),
    });
    if (!visitorOk) return { ok: false, delivery: 'failed' };
    return { ok: true, delivery: 'sent' };
  } catch (err) {
    return { ok: false, delivery: 'failed' };
  }
}

async function handleInsider({ body, ip, env, fetchImpl }) {
  const payload = body && typeof body === 'object' ? body : {};
  if (String(payload.company || '').trim()) return { status: 400, json: { ok: false, error: 'rejected' } };
  const intent = payload.intent === 'interest' ? 'interest' : payload.intent === 'open' ? 'open' : '';
  if (!intent) return { status: 400, json: { ok: false, error: 'intent' } };
  if (!limited(ip || 'unknown', intent)) return { status: 429, json: { ok: false, error: 'rate' } };
  if (!codeAccepted(payload.code)) return { status: 401, json: { ok: false, error: 'code' } };
  if (intent === 'open') {
    return { status: 200, json: { ok: true, offer: OFFER, products: publicProducts(), store: STORE } };
  }
  const email = emailOk(payload.email);
  if (!email) return { status: 400, json: { ok: false, error: 'email' } };
  const products = chosenProducts(payload.product_ids);
  if (!products) return { status: 400, json: { ok: false, error: 'products' } };
  const sent = await deliverBoth(env, fetchImpl, email, products);
  if (!sent.ok) return { status: sent.delivery === 'unconfigured' ? 503 : 502, json: { ok: false, delivery: sent.delivery } };
  return { status: 200, json: { ok: true, delivery: 'sent' } };
}

module.exports = {
  RECIPIENT,
  PRODUCTS,
  OFFER,
  codeAccepted,
  handleInsider,
  staffText,
  visitorText,
  buckets,
};
