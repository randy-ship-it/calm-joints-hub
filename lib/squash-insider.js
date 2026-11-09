'use strict';

const crypto = require('crypto');
const { rateLimit } = require('./intake');
const store = require('./squash-wishlist-store');

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
    use: 'Massage',
    brand: 'ROLL Recovery',
    highlight: true,
    name: 'R8 Deep Tissue Massage Tool',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$149.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r8-new',
    image: '/media/squash/wishlist/roll-r8.webp',
    alt: 'ROLL Recovery R8 roller in alpine white',
    about: [
      'A handled roller with two rolling inserts.',
      'The maker says the inserts can be changed and the frame uses springs.',
    ],
  },
  {
    id: 'roll-r8plus',
    use: 'Massage',
    brand: 'ROLL Recovery',
    name: 'R8 Plus Deep Tissue Massage Tool',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$179.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r8plus',
    image: '/media/squash/wishlist/roll-r8plus.webp',
    alt: 'ROLL Recovery R8 Plus roller in alpine white',
    about: [
      'The larger R8, with a dial the maker says changes how much force you use.',
      'The maker describes it as an FDA-registered device.',
    ],
  },
  {
    id: 'roll-r3',
    use: 'Massage',
    brand: 'ROLL Recovery',
    name: 'R3 Orthopedic Foot Roller',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$35.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r3',
    image: '/media/squash/wishlist/roll-r3.webp',
    alt: 'ROLL Recovery R3 foot roller',
    about: [
      'A small foot roller.',
      'The maker says the shape is not symmetrical, so it can press the inner, middle, and outer foot.',
    ],
  },
  {
    id: 'roll-stretchmat',
    use: 'Massage',
    brand: 'ROLL Recovery',
    name: 'StretchMat',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$65.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/stretchmat',
    image: '/media/squash/wishlist/roll-stretchmat.webp',
    alt: 'ROLL Recovery StretchMat in black',
    about: [
      'A foldable mat for stretching.',
      'The maker lists a soft top, 5 mm of padding, and a non-slip waterproof bottom.',
    ],
  },
  {
    id: 'drho-tens-pro',
    use: 'Massage',
    brand: 'DR-HO’S',
    name: 'TENS Pro Essentials',
    detail: 'Pain Therapy System Pro, Essential Package',
    price_label: 'CA$249.95',
    price_kind: 'Listed price',
    source: 'drhonow.com, 8 Nov 2026',
    href: 'https://drhonow.com/products/pain-therapy-system-pro-basic-package',
    image: '/media/squash/wishlist/drho-tens-pro.webp',
    alt: 'DR-HO’S Pain Therapy System Pro unit',
    about: [
      'A handheld unit with a screen and pads.',
      'The maker lists four pads and six modes, and describes the unit as combining EMS, TENS, and AMP.',
    ],
  },
  {
    id: 'roll-r1',
    use: 'Massage',
    brand: 'ROLL Recovery',
    name: 'R1 Percussion',
    detail: 'ROLL Recovery. Same listed price for each colour.',
    price_label: 'US$139.00',
    price_kind: 'Listed price',
    source: 'rollrecovery.com, 8 Nov 2026',
    href: 'https://rollrecovery.com/products/r1',
    image: '/media/squash/wishlist/roll-r1.webp',
    alt: 'ROLL Recovery R1 percussion tool in its case',
    about: [
      'A compact percussion tool that comes with a case.',
      'The maker lists four speed settings and four attachment heads.',
    ],
  },
  {
    id: 'kalaya-6x-cream',
    use: 'Topical',
    brand: 'KaLaya',
    highlight: true,
    name: '6x Extra Strength Pain Relief Cream',
    detail: '120 g cream.',
    price_label: 'CA$16.95',
    price_kind: 'Listed price',
    source: 'kalaya.ca, 8 Nov 2026',
    href: 'https://kalaya.ca/products/6xpainrelief',
    image: '/media/squash/wishlist/kalaya-6x-cream.webp',
    alt: 'KaLaya 6x Extra Strength Pain Relief Cream, 120 g',
    about: [
      'A 120 g cream.',
      'The maker lists arnica, eucalyptus, menthol, and camphor, and also shows a compare-at price of CA$18.95.',
    ],
  },
  {
    id: 'kalaya-6x-massager',
    use: 'Topical',
    brand: 'KaLaya',
    name: '6x Extra Strength Pain Relief Massager',
    detail: '120 g cream with a massager top.',
    price_label: 'CA$17.95',
    price_kind: 'Listed price',
    source: 'kalaya.ca, 8 Nov 2026',
    href: 'https://kalaya.ca/products/6xpainrelief-massager',
    image: '/media/squash/wishlist/kalaya-6x-massager.webp',
    alt: 'KaLaya 6x cream bottle with a massager top',
    about: [
      'The 120 g 6x cream in a bottle with a massager top.',
      'The maker page also shows a compare-at price of CA$19.95.',
    ],
  },
  {
    id: 'kalaya-foam',
    use: 'Topical',
    brand: 'KaLaya',
    name: 'Extra Strength Pain Relief Foam with Arnica',
    detail: '80 mL foam.',
    price_label: 'CA$17.95',
    price_kind: 'Listed price',
    source: 'kalaya.ca, 8 Nov 2026',
    href: 'https://kalaya.ca/products/pain-relief-foam',
    image: '/media/squash/wishlist/kalaya-foam.webp',
    alt: 'KaLaya Extra Strength Pain Relief Foam bottle',
    about: [
      'An 80 mL foam.',
      'The maker lists arnica, methyl salicylate, menthol, camphor, and eucalyptus, and also shows a compare-at price of CA$24.00.',
    ],
  },
  {
    id: 'kalaya-gel',
    use: 'Topical',
    brand: 'KaLaya',
    name: 'Extra Strength Pain Relief Gel with Arnica',
    detail: '100 g gel. Single tube.',
    price_label: 'CA$17.95',
    price_kind: 'Listed price',
    source: 'kalaya.ca, 8 Nov 2026',
    href: 'https://kalaya.ca/products/kalaya-extra-strength-pain-relief-gel',
    image: '/media/squash/wishlist/kalaya-gel.webp',
    alt: 'KaLaya Extra Strength Pain Relief Gel tube',
    about: [
      'A 100 g gel. This price is the single tube.',
      'The maker lists arnica, and also shows a compare-at price of CA$20.00.',
    ],
  },
  {
    id: 'kalaya-spray',
    use: 'Topical',
    brand: 'KaLaya',
    name: 'Cooling Pain Relief Spray for Back and Neck',
    detail: '60 mL spray.',
    price_label: 'CA$14.95',
    price_kind: 'Listed price',
    source: 'kalaya.ca, 8 Nov 2026',
    href: 'https://kalaya.ca/products/backandneckspray',
    image: '/media/squash/wishlist/kalaya-spray.webp',
    alt: 'KaLaya cooling spray for the back and neck',
    about: [
      'A 60 mL spray the maker describes for the back and neck.',
      'The maker says the bottle is an airless pump with a locking cap.',
    ],
  },
  {
    id: 'sole-active-medium',
    use: 'Feet',
    brand: 'SOLE',
    highlight: true,
    name: 'Active Medium footbed',
    detail: 'EVA insole. Same listed price for each size.',
    price_label: 'CA$65.00',
    price_kind: 'Listed price',
    source: 'yoursole.com/ca, 8 Nov 2026',
    href: 'https://yoursole.com/ca/shop/footbeds/active-medium',
    image: '/media/squash/wishlist/sole-active-medium.webp',
    alt: 'SOLE Active Medium footbed, side view',
    about: [
      'An EVA footbed in the medium thickness.',
      'The maker lists 1.6 mm of Softec foam and says medium thickness suits most sneakers and court shoes such as tennis shoes.',
    ],
  },
  {
    id: 'sole-performance-medium',
    use: 'Feet',
    brand: 'SOLE',
    name: 'Performance Medium footbed',
    detail: 'Cork insole. Same listed price for each size.',
    price_label: 'CA$65.00',
    price_kind: 'Listed price',
    source: 'yoursole.com/ca, 8 Nov 2026',
    href: 'https://yoursole.com/ca/shop/footbeds/performance-medium',
    image: '/media/squash/wishlist/sole-performance-medium.webp',
    alt: 'SOLE Performance Medium cork footbed',
    about: [
      'A medium footbed with a recycled-cork base.',
      'The maker lists 1.6 mm of foam and says the cork comes from its ReCORK program.',
    ],
  },
  {
    id: 'sole-active-thin',
    use: 'Feet',
    brand: 'SOLE',
    name: 'Active Thin footbed',
    detail: 'Thinner EVA insole. Same listed price for each size.',
    price_label: 'CA$65.00',
    price_kind: 'Listed price',
    source: 'yoursole.com/ca, 8 Nov 2026',
    href: 'https://yoursole.com/ca/shop/footbeds/active-thin',
    image: '/media/squash/wishlist/sole-active-thin.webp',
    alt: 'SOLE Active Thin footbed, side view',
    about: [
      'A thinner EVA footbed.',
      'The maker recommends thin footbeds for tight, low-profile shoes.',
    ],
  },
  {
    id: 'c88-knee',
    use: 'Compression',
    brand: 'Copper 88',
    highlight: true,
    name: 'Compression Knee Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$17.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-knee-sleeve-mens',
    image: '/media/squash/wishlist/c88-knee.webp',
    alt: 'Copper 88 knee sleeve on a leg',
    about: [
      'A unisex knee sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex, and also shows a compare-at price of CA$19.99.',
    ],
  },
  {
    id: 'c88-calf',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Calf Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$19.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-calf-sleeve-mens',
    image: '/media/squash/wishlist/c88-calf.webp',
    alt: 'Copper 88 calf sleeve',
    about: [
      'A unisex calf sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex.',
    ],
  },
  {
    id: 'c88-ankle',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Ankle Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$19.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-ankle-sleeve-unisex-m',
    image: '/media/squash/wishlist/c88-ankle.webp',
    alt: 'Copper 88 ankle sleeve',
    about: [
      'A unisex ankle sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex.',
    ],
  },
  {
    id: 'c88-elbow',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Elbow Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$19.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-elbow-sleeve-mens',
    image: '/media/squash/wishlist/c88-elbow.webp',
    alt: 'Copper 88 elbow sleeve',
    about: [
      'A unisex elbow sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex.',
    ],
  },
  {
    id: 'c88-arm',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Arm Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$19.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-compression-arm-sleeve-mens',
    image: '/media/squash/wishlist/c88-arm.webp',
    alt: 'Copper 88 arm sleeve',
    about: [
      'A unisex arm sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex.',
    ],
  },
  {
    id: 'c88-wrist',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Wrist Sleeve',
    detail: 'Unisex sleeve. Same listed price for each size.',
    price_label: 'CA$19.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-wrist-sleeve-mens',
    image: '/media/squash/wishlist/c88-wrist.webp',
    alt: 'Copper 88 wrist sleeve',
    about: [
      'A unisex wrist sleeve. Every size on the maker page is this price.',
      'The maker lists the fabric as 88% copper-embedded nylon and 12% spandex.',
    ],
  },
  {
    id: 'c88-knee-socks',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Knee Socks',
    detail: 'Black or white. Men’s and women’s sizes share this price.',
    price_label: 'CA$29.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-compression-knee-socks-black-mens',
    image: '/media/squash/wishlist/c88-knee-socks.webp',
    alt: 'Copper 88 black knee-high compression socks',
    about: [
      'Knee-high socks. The maker lists black and white, and men’s and women’s sizes, at this price.',
      'The maker lists the knit as 75% nylon, 18% copper nylon, and 7% Lycra, and lists moderate compression of 15–20 mmHg.',
    ],
  },
  {
    id: 'c88-midcalf-socks',
    use: 'Compression',
    brand: 'Copper 88',
    name: 'Compression Mid-Calf Socks',
    detail: 'Black or white. Men’s and women’s sizes share this price.',
    price_label: 'CA$29.99',
    price_kind: 'Listed price',
    source: 'copper88.com, 8 Nov 2026',
    href: 'https://www.copper88.com/products/copper-compression-mid-calf-socks-black-mens',
    image: '/media/squash/wishlist/c88-midcalf-socks.webp',
    alt: 'Copper 88 black mid-calf compression socks',
    about: [
      'Mid-calf socks. The maker lists black and white, and men’s and women’s sizes, at this price.',
      'The maker lists the knit as 75% nylon, 18% copper nylon, and 7% Lycra, and lists moderate compression of 15–20 mmHg.',
    ],
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

function wishlistLines(products, quantities) {
  const qty = quantities && typeof quantities === 'object' ? quantities : {};
  const lines = [];
  for (const item of products) {
    const raw = qty[item.id] == null ? 1 : qty[item.id];
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
    const price = store.retailSnapshot(item.price_label);
    if (!price) return null;
    lines.push({
      product_id: item.id,
      name: item.name,
      quantity,
      variant_status: 'unspecified',
      variant_note: item.detail,
      catalog_source: String(item.source || '').split(',')[0].trim(),
      catalog_href: item.href,
      mapping_status: 'unmapped',
      scale_sku: null,
      ...price,
    });
  }
  return lines;
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
    image: item.image,
    alt: item.alt,
    about: item.about,
    brand: item.brand,
    highlight: Boolean(item.highlight),
  }));
}

function limited(ip, action) {
  return rateLimit('squash-insider:' + action + ':' + ip, {
    limit: action === 'interest' ? 4 : 8,
    windowMs: 10 * 60 * 1000,
    store: buckets,
  });
}

function staffText(email, products, record) {
  const lines = [
    'Squash wishlist',
    'To: ' + RECIPIENT,
    'Person: ' + email,
    'Insider code: accepted',
    'Wishlist only. No order, payment, reservation, or credit.',
    'Insider pricing coming soon. No insider price is stored.',
    'Wholesale amount: unconfirmed. Cart: not created.',
    'Store link, browse only: ' + STORE.href,
    record && record.id ? 'Record: ' + record.id : 'Record: not stored',
    'Products:',
  ];
  products.forEach((item) => lines.push('- ' + (item.product_id || item.id) + ': ' + item.name + ' (' + (item.retail_label || item.price_label) + ', qty ' + (item.quantity || 1) + ')'));
  return lines.join('\n');
}

function visitorText(products, record) {
  const lines = [
    record && record.id ? 'Your wishlist is saved.' : 'Your Calm Joints squash wishlist',
    'This is a wishlist, not an order. Nothing was reserved or charged. No account or cart has been created.',
    'You asked about:',
  ];
  products.forEach((item) => lines.push('- ' + item.name + ': ' + (item.retail_label || item.price_label) + ' listed price, qty ' + (item.quantity || 1)));
  lines.push(
    'Insider pricing is coming soon. We are aiming to have wholesale rates and cart preparation ready within a week, possibly sooner. That timing is a target, not a guarantee. No insider price is set on this list.',
    'We intend to pass along our business wholesale rates: the margin, except processing fees. That rate is not active yet.',
    'The Industry Insider’s Store is where a buying link is meant to go when insider pricing is loaded:',
    STORE.href,
    'That link opens the store. It does not sign you in, and these products are not in a cart. We will write again with a buying link when insider pricing is loaded. Automatic cart loading is not available yet.',
  );
  return lines.join('\n');
}

async function deliverBoth(env, fetchImpl, email, products, record) {
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
      text: staffText(email, products, record),
    });
    if (!staffOk) return { ok: false, delivery: 'failed' };
    const visitorOk = await one({
      to: email,
      replyTo: RECIPIENT,
      subject: 'Your Calm Joints squash wishlist',
      text: visitorText(products, record),
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
  const email = emailOk(payload.email).toLowerCase();
  if (!email) return { status: 400, json: { ok: false, error: 'email' } };
  const products = chosenProducts(payload.product_ids);
  if (!products) return { status: 400, json: { ok: false, error: 'products' } };
  const lines = wishlistLines(products, payload.quantities);
  if (!lines) return { status: 400, json: { ok: false, error: 'products' } };
  const record = store.buildRecord({ email, lines, now: new Date().toISOString() });
  let stored = { ok: false, persistence: 'unconfigured', duplicate: false, record: null };
  try {
    stored = await store.saveWishlist(env, record);
  } catch (err) {
    console.error('[wishlist] save failed', err && err.message);
    stored = { ok: false, persistence: 'failed', duplicate: false, record: null };
  }
  const saved = stored.ok ? stored.record : null;
  const emailAlreadySent = Boolean(saved && saved.email_status === 'sent');
  let sent = { ok: true, delivery: 'already_recorded' };
  if (!emailAlreadySent) {
    sent = await deliverBoth(env, fetchImpl, email, lines, saved);
    if (stored.ok) await store.markEmail(env, record.id, sent.ok ? 'sent' : sent.delivery);
  }
  let sheetStatus = 'unconfigured';
  if (stored.ok) {
    const synced = await store.syncRecord(env, saved);
    sheetStatus = synced.status;
  }
  const bodyJson = {
    ok: Boolean(sent.ok || stored.ok),
    persisted: stored.ok,
    duplicate: Boolean(stored.duplicate),
    delivery: sent.delivery,
    persistence: stored.persistence,
    sheet_status: sheetStatus,
  };
  if (sent.ok || stored.ok) return { status: 200, json: bodyJson };
  return { status: sent.delivery === 'unconfigured' ? 503 : 502, json: bodyJson };
}

module.exports = {
  RECIPIENT,
  PRODUCTS,
  OFFER,
  codeAccepted,
  handleInsider,
  staffText,
  visitorText,
  wishlistLines,
  buckets,
  STORE,
};
