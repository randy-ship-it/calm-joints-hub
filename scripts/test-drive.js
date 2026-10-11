// Drive kits: priced with a margin, gated checkout, partner + PDF + printer adapter.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const store = new Map();
const Module = require('module');
const origLoad = Module._load;
const fakeBlob = {
  async put(p, body, o) {
    if (store.has(p) && o && !o.allowOverwrite) throw new Error('This blob already exists');
    store.set(p, Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    return { pathname: p };
  },
  async get(p) {
    if (!store.has(p)) throw new Error('not found');
    return { stream: new Response(store.get(p)).body };
  },
  async list({ prefix }) {
    return { blobs: [...store.keys()].filter((k) => k.startsWith(prefix || '')).map((pathname) => ({ pathname })), hasMore: false };
  },
  async del(p) { store.delete(p); },
};
Module._load = function (req, ...rest) { return req === '@vercel/blob' ? fakeBlob : origLoad.call(this, req, ...rest); };

const env = {
  BLOB_READ_WRITE_TOKEN: 'x',
  INTAKE_WEBHOOK_SECRET: 'test-secret-123',
  CJ_RESEND_API_KEY: 're_test',
  CJ_ALERT_EMAILS: 'team@example.com',
  CJ_ADMIN_KEY: 'admin-key-xyz',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  CJ_DRIVE_LIVE: '',
};
Object.assign(process.env, env);

const hits = [];
global.fetch = async (url, opts) => {
  hits.push({ url: String(url), body: opts && opts.body, headers: (opts && opts.headers) || {} });
  return { ok: true, status: 200, json: async () => ({}) };
};

const { PDFDocument } = require('pdf-lib');
const Stripe = require('stripe');
const P = require('../lib/drive-pricing');
const Art = require('../lib/drive-artwork');
const Q = require('../lib/qr-partners');
const A = require('../lib/partner-alias');
const L = require('../lib/partner-ledger');
const F = require('../lib/fulfilment');
const D = require('../lib/drive-orders');
const checkout = require('../api/drive-checkout');
const webhook = require('../api/drive-webhook');
const artworkApi = require('../api/drive-artwork');
const admin = require('../api/admin-decals');
const cimpressHook = require('../api/cimpress-webhook');
const printfulHook = require('../api/printful-webhook');

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      writeHead(code, headers) { this.statusCode = code; if (headers) Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v)); },
      end(b) {
        let body = b;
        if (typeof b === 'string') { try { body = JSON.parse(b); } catch { body = b; } }
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function buyer(handle, extra) {
  return Object.assign({
    partner_type: 'rideshare', name: 'Avery Lane', email: 'avery@example.com', phone: '4165550199',
    line1: '10 King Street', line2: '', city: 'Toronto', province: 'ON', postal: 'M5V 1A1', handle,
  }, extra || {});
}

(async () => {
  const incar = P.quote(['incar']);
  const both = P.quote(['incar', 'exterior']);
  assert.ok(String(incar.price).endsWith('.99'), incar.price);
  assert.ok(String(both.price).endsWith('.99'), both.price);
  assert.ok(incar.margin_amount > 0, incar.margin_amount);
  assert.ok(both.margin_amount > 0, both.margin_amount);
  assert.ok(both.price > incar.price);
  assert.strictEqual(incar.price_cents, Math.round(incar.price * 100));
  const cat = P.catalog();
  assert.strictEqual(cat.rules_note, "Check your rideshare platform's rules before applying exterior decals.");
  assert.strictEqual(cat.incar.name, 'Rideshare in-car kit');
  assert.strictEqual(cat.exterior.name, 'Exterior decal add-on');
  assert.ok(!JSON.stringify(cat).includes('print_cost'));
  assert.ok(!JSON.stringify(cat).includes('margin_amount'));
  assert.strictEqual(cat.totals.both, both.price);

  const reserved = D.validate(buyer('drive'));
  assert.ok(reserved.errors.some((e) => /already used/.test(e)));
  assert.ok(D.validate(buyer('me')).errors.some((e) => /already used/.test(e)));
  assert.strictEqual(D.validate(buyer('avery-lane')).errors.length, 0);

  const closed = await D.createCheckout(buyer('avery-lane'), env, { skipRateLimit: true });
  assert.strictEqual(closed.status, 403);

  const bare = { ...env, CJ_DRIVE_LIVE: 'true', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' };
  const unconfigured = await D.createCheckout(buyer('avery-lane'), bare, { skipRateLimit: true });
  assert.strictEqual(unconfigured.status, 503);
  assert.deepStrictEqual(unconfigured.json.missing.sort(), ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);

  const blockedLive = await D.createCheckout(buyer('avery-lane'), { ...env, CJ_DRIVE_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_live_nope' }, { skipRateLimit: true });
  assert.strictEqual(blockedLive.status, 503);

  let sessionArgs = null;
  const stripe = { checkout: { sessions: { create: async (params) => { sessionArgs = params; return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }; } } } };
  const started = await D.createCheckout(buyer('avery-lane', { exterior: true }), { ...env, CJ_DRIVE_LIVE: 'true' }, { skipRateLimit: true, stripe, origin: 'https://calmjoints.org' });
  assert.strictEqual(started.status, 200, JSON.stringify(started.json));
  assert.strictEqual(sessionArgs.mode, 'payment');
  assert.ok(!Object.prototype.hasOwnProperty.call(sessionArgs, 'payment_method_types'));
  assert.ok(!Object.prototype.hasOwnProperty.call(sessionArgs, 'automatic_tax'));
  assert.match(sessionArgs.integration_identifier, /^cjdrive[a-zA-Z]{8}$/);
  assert.strictEqual(sessionArgs.line_items.length, 1);
  assert.strictEqual(sessionArgs.line_items[0].price_data.unit_amount, both.price_cents);
  assert.strictEqual(sessionArgs.line_items[0].price_data.currency, 'cad');
  const again = await D.createCheckout(buyer('avery-lane'), { ...env, CJ_DRIVE_LIVE: 'true' }, { skipRateLimit: true, stripe });
  assert.strictEqual(again.status, 409);

  const amb = await Q.createDrivePartner({ partner_type: 'ambassador', alias: 'pat-drive', name: 'Pat Cole', email: 'pat@example.com', phone: '4165550101' }, env, { fetchImpl: global.fetch });
  assert.strictEqual(amb.status, 200, JSON.stringify(amb.json));
  assert.strictEqual(amb.json.partner.contact_type, 'ambassador');
  assert.strictEqual(amb.json.partner.terms.rate, 0.2);
  assert.strictEqual(amb.json.partner.terms.pending_randy, false);
  const ride = await Q.createDrivePartner({ partner_type: 'rideshare', alias: 'ride-kim', name: 'Kim Roy', email: 'kim@example.com' }, env, { fetchImpl: global.fetch });
  assert.strictEqual(ride.status, 200);
  assert.strictEqual(ride.json.partner.contact_type, 'rideshare');
  assert.strictEqual(ride.json.partner.terms.rate, 0.1);
  assert.strictEqual(ride.json.partner.terms.pending_randy, true);
  assert.strictEqual(ride.json.partner.terms.decision, 'PENDING RANDY DECISION');
  const friday = hits.map((h) => { try { return JSON.parse(h.body); } catch { return null; } }).filter((b) => b && b.externalId === 'cj-qrpartner-drv-ride-kim');
  assert.strictEqual(friday.length, 1);
  assert.strictEqual(friday[0].contact_type, 'rideshare');
  assert.ok(friday[0].tags.length < 12);
  assert.ok(friday[0].tags.includes('drive'));
  assert.ok(friday[0].tags.includes('type:rideshare'));
  const pen = await A.aliasRedirect('ride-kim', env);
  assert.strictEqual(pen.src, 'pen');
  assert.strictEqual(pen.location, '/p/drv-ride-kim?src=pen');
  const decal = await A.aliasRedirect('ride-kim', env, 'decal');
  assert.strictEqual(decal.location, '/p/drv-ride-kim?src=decal');
  assert.strictEqual((await A.aliasRedirect('ride-kim', env, 'evil')).src, 'pen');
  assert.strictEqual(await A.aliasRedirect('drive', env, 'decal'), null);
  assert.strictEqual(await A.aliasRedirect('me', env), null);

  const pieces = await Art.renderOrder({ handle: 'ride-kim', kits: ['incar', 'exterior'] });
  const expectSize = { headrest: [8, 10], pocket: [4, 6], side: [5, 5], rear: [5, 5] };
  for (const piece of pieces) {
    const doc = await PDFDocument.load(piece.pdf);
    const size = doc.getPages()[0].getSize();
    assert.strictEqual(Math.round(size.width), expectSize[piece.id][0] * 72);
    assert.strictEqual(Math.round(size.height), expectSize[piece.id][1] * 72);
    assert.ok(piece.pdf.slice(0, 5).toString() === '%PDF-');
    if (piece.id === 'side' || piece.id === 'rear') assert.ok(piece.qr_in >= 3, piece.qr_in);
  }
  assert.deepStrictEqual(pieces.map((p) => p.id), ['headrest', 'pocket', 'side', 'rear']);

  assert.strictEqual(F.selectAdapter({}).id, 'manual');
  assert.strictEqual(F.stickermule.ready({ STICKERMULE_API_KEY: 'x' }), false);
  const printEnv = {
    PRINTFUL_API_TOKEN: 'pf',
    PRINTFUL_VARIANT_HEADREST: '801',
    PRINTFUL_VARIANT_POCKET: '802',
    PRINTFUL_VARIANT_SIDE: '803',
    PRINTFUL_VARIANT_REAR: '804',
  };
  assert.strictEqual(F.selectAdapter(printEnv).id, 'printful');
  const cimpressEnv = { ...printEnv, CIMPRESS_CLIENT_ID: 'id', CIMPRESS_SECRET: 'sec', CIMPRESS_PARTNER_ID: 'partner', CIMPRESS_VARIANT_ID: 'var-1' };
  assert.strictEqual(F.selectAdapter(cimpressEnv).id, 'cimpress');
  assert.match(F.report({}).automated_today, /^None\./);
  assert.match(F.report(printEnv).automated_today, /^Printful\./);
  assert.match(F.report(cimpressEnv).automated_today, /^Cimpress Open\./);

  const sample = {
    id: 'drv_sample', paid_at: '2026-10-11T00:00:00.000Z', name: 'Avery Lane', email: 'avery@example.com', phone: '4165550199',
    ship: { line1: '10 King Street', line2: '', city: 'Toronto', province: 'ON', postal: 'M5V 1A1', country: 'CA' },
    pieces: pieces.map((p) => ({ ...p, artwork_url: `https://calmjoints.org/api/drive-artwork?piece=${p.id}` })),
  };
  const pfCalls = [];
  const pf = await F.printful.submit(sample, printEnv, {
    fetchImpl: async (url, opts) => {
      pfCalls.push({ url: String(url), body: opts.body, headers: opts.headers });
      if (String(url).endsWith('/confirm')) return { ok: true, status: 200, json: async () => ({ data: { id: 55, status: 'pending' } }) };
      return { ok: true, status: 200, json: async () => ({ data: { id: 55 } }) };
    },
  });
  assert.strictEqual(pf.ok, true);
  assert.strictEqual(pfCalls[0].url, 'https://api.printful.com/v2/orders');
  const pfBody = JSON.parse(pfCalls[0].body);
  assert.strictEqual(pfBody.order_items[0].catalog_variant_id, 801);
  assert.ok(pfBody.order_items.every((item) => item.placements[0].layers[0].url.includes('drive-artwork')));
  assert.ok(!JSON.stringify(pfBody).includes('11513'));
  const draft = await F.printful.submit(sample, printEnv, {
    fetchImpl: async (url) => String(url).endsWith('/confirm')
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ data: { id: 56 } }) },
  });
  assert.strictEqual(draft.status, 'draft');
  assert.strictEqual(draft.fallback, false);

  const ciCalls = [];
  const ci = await F.cimpress.submit(sample, cimpressEnv, {
    fetchImpl: async (url, opts) => {
      ciCalls.push({ url: String(url), body: String(opts.body), headers: opts.headers });
      if (String(url).includes('oauth')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, status: 200, json: async () => ({ orderId: 'drv_sample' }) };
    },
  });
  assert.strictEqual(ci.ok, true);
  assert.strictEqual(ciCalls[0].url, 'https://oauth.cimpress.io/v2/token');
  assert.match(ciCalls[0].body, /grant_type=client_credentials/);
  assert.strictEqual(ciCalls[1].url, 'https://partnerapi.cimpressopen.cimpress.io/partner/v1/orders');
  const ciBody = JSON.parse(ciCalls[1].body);
  assert.strictEqual(ciBody.orderId, 'drv_sample');
  assert.strictEqual(ciBody.items[0].artwork.type, 'pdf');
  assert.ok(ciBody.items[0].artwork.url);
  const sm = await F.stickermule.submit(sample, {});
  assert.strictEqual(sm.ok, false);
  assert.strictEqual(sm.fallback, false);

  const paid = await D.handleStripeEvent({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', payment_status: 'unpaid', metadata: { order_id: started.json.order_id }, client_reference_id: started.json.order_id } },
  }, { ...env, CJ_DRIVE_LIVE: 'true' }, { fetchImpl: global.fetch, origin: 'https://calmjoints.org' });
  assert.strictEqual(paid.json.fulfilled, false);
  assert.strictEqual(await Q.getPartner('drv-avery-lane', env), null);

  const beforeMail = hits.filter((h) => h.url.includes('resend')).length;
  const done = await D.handleStripeEvent({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { order_id: started.json.order_id }, client_reference_id: started.json.order_id } },
  }, { ...env, CJ_DRIVE_LIVE: 'true' }, { fetchImpl: global.fetch, origin: 'https://calmjoints.org' });
  assert.strictEqual(done.status, 200, JSON.stringify(done.json));
  const partner = await Q.getPartner('drv-avery-lane', env);
  assert.strictEqual(partner.contact_type, 'rideshare');
  assert.strictEqual(partner.terms.pending_randy, true);
  assert.ok(store.has('drive-orders/' + started.json.order_id + '/headrest.pdf'));
  assert.ok(store.get('drive-orders/' + started.json.order_id + '/side.pdf').slice(0, 5).toString() === '%PDF-');
  const order = await D.readOrder(started.json.order_id, env);
  assert.strictEqual(order.fulfilment.adapter, 'manual');
  assert.ok(order.pricing.margin_amount > 0);
  const teamMail = hits.filter((h) => h.url.includes('resend')).slice(beforeMail);
  assert.ok(teamMail.length >= 2);
  const team = JSON.parse(teamMail[0].body);
  assert.ok(team.to.includes('team@example.com'));
  assert.match(team.text, /Margin \$/);
  assert.match(team.text, /Vistaprint has no ordering API/);
  assert.match(team.text, /drive-artwork/);
  const who = JSON.parse(teamMail[1].body);
  assert.match(who.text, /https:\/\/calmjoints\.org\/me\/avery-lane\?t=/);
  assert.match(who.text, /PENDING RANDY DECISION/);
  assert.match(who.text, /once \$500 is owed/);

  const dup = await D.fulfilPaid({ id: 'cs_test_1', payment_status: 'paid', metadata: { order_id: started.json.order_id } }, env, { fetchImpl: global.fetch });
  assert.strictEqual(dup.duplicate, true);
  assert.strictEqual([...store.keys()].filter((k) => k === 'qr-partners/drv-avery-lane/partner.json').length, 1);

  store.set('qr-leads/drv-avery-lane/visit/decal.2026-10-11.json', Buffer.from('{}'));
  store.set('qr-ledger/drv-avery-lane/visit1.json', Buffer.from(JSON.stringify({ type: 'visit', billed: 80, share: 8, at: '2026-10-11T00:00:00.000Z' })));
  const dash = await L.dashboard('drv-avery-lane', env);
  assert.strictEqual(dash.handle, 'avery-lane');
  assert.strictEqual(dash.scans, 1);
  assert.strictEqual(dash.revenue, 80);
  assert.strictEqual(dash.commission_owed, 8);
  assert.match(dash.payout_rule, /Paid monthly once \$500 is owed/);

  const denied = await call(admin, { method: 'GET', url: '/api/admin-decals', headers: { authorization: 'Bearer nope' } });
  assert.strictEqual(denied.status, 401);
  const listed = await call(admin, { method: 'GET', url: '/api/admin-decals', headers: { authorization: 'Bearer admin-key-xyz' } });
  assert.strictEqual(listed.status, 200);
  const row = listed.body.orders.find((o) => o.handle === 'avery-lane');
  assert.ok(row.margin_amount > 0);
  assert.ok(row.print_cost > 0);
  assert.ok(row.pieces.find((p) => p.id === 'headrest').artwork_url);
  assert.match(listed.body.adapters.automated_today, /^None\./);
  const marked = await call(admin, { method: 'POST', url: '/api/admin-decals', headers: { authorization: 'Bearer admin-key-xyz' }, body: { id: row.id, tracking: '' } });
  assert.strictEqual(marked.status, 200);
  assert.strictEqual(marked.body.order.status, 'ordered');
  const shipped = await call(admin, { method: 'POST', url: '/api/admin-decals', headers: { authorization: 'Bearer admin-key-xyz' }, body: { id: row.id, tracking: '1Z999' } });
  assert.strictEqual(shipped.body.order.status, 'shipped');
  assert.strictEqual(shipped.body.order.fulfilment.tracking, '1Z999');
  const back = await D.markOrdered(row.id, { tracking: '' }, env);
  assert.strictEqual(back.status, 409);

  const link = D.publicArtLink('https://calmjoints.org', row.id, 'headrest', env);
  const url = new URL(link);
  const pdf = await call(artworkApi, { method: 'GET', url: url.pathname + url.search, headers: {} });
  assert.strictEqual(pdf.status, 200);
  assert.strictEqual(pdf.headers['content-type'], 'application/pdf');
  assert.ok(Buffer.isBuffer(pdf.body) && pdf.body.slice(0, 5).toString() === '%PDF-');

  const stripeClient = new Stripe('sk_test_123', { apiVersion: '2026-09-30.endive' });
  const payload = JSON.stringify({
    id: 'evt_test', object: 'event', type: 'checkout.session.expired',
    data: { object: { id: 'cs_x', metadata: { order_id: 'drv_missing' }, client_reference_id: 'drv_missing' } },
  });
  const bad = await call(webhook, { method: 'POST', url: '/api/drive-webhook', headers: { 'stripe-signature': 't=1,v1=nope' }, rawBody: payload });
  assert.strictEqual(bad.status, 400);
  const sig = await stripeClient.webhooks.generateTestHeaderStringAsync({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  const signed = await call(webhook, { method: 'POST', url: '/api/drive-webhook', headers: { 'stripe-signature': sig }, rawBody: payload });
  assert.strictEqual(signed.status, 200, JSON.stringify(signed.body));
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const missingHook = await call(webhook, { method: 'POST', url: '/api/drive-webhook', headers: {}, rawBody: payload });
  assert.strictEqual(missingHook.status, 503);
  assert.ok(missingHook.body.missing.includes('STRIPE_WEBHOOK_SECRET'));
  process.env.STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

  const noSecret = await call(cimpressHook, { method: 'POST', url: '/api/cimpress-webhook', headers: {}, rawBody: '{}' });
  assert.strictEqual(noSecret.status, 503);
  assert.deepStrictEqual(noSecret.body.missing, ['CIMPRESS_WEBHOOK_SECRET']);
  process.env.CIMPRESS_WEBHOOK_SECRET = 'cimpress-hook';
  const rawCi = JSON.stringify({ orderId: row.id, status: 'processing', trackingNumber: 'CIM1' });
  const deniedCi = await call(cimpressHook, { method: 'POST', url: '/api/cimpress-webhook', headers: { authorization: 'Bearer wrong' }, rawBody: rawCi });
  assert.strictEqual(deniedCi.status, 401);
  const okCi = await call(cimpressHook, { method: 'POST', url: '/api/cimpress-webhook', headers: { authorization: 'Bearer cimpress-hook' }, rawBody: rawCi });
  assert.strictEqual(okCi.status, 200);
  assert.strictEqual((await D.readOrder(row.id, env)).status, 'shipped', 'processing must not downgrade a shipped order');
  const rawPf = JSON.stringify({ type: 'package_shipped', data: { order: { external_id: row.id }, shipment: { tracking_number: 'PF9', carrier: 'UPS' } } });
  delete process.env.PRINTFUL_WEBHOOK_SECRET;
  const noPf = await call(printfulHook, { method: 'POST', url: '/api/printful-webhook', headers: {}, rawBody: rawPf });
  assert.strictEqual(noPf.status, 503);
  process.env.PRINTFUL_WEBHOOK_SECRET = 'pf-hook';
  const mac = crypto.createHmac('sha256', 'pf-hook').update(rawPf).digest('hex');
  const okPf = await call(printfulHook, { method: 'POST', url: '/api/printful-webhook', headers: { 'x-printful-signature': mac }, rawBody: rawPf });
  assert.strictEqual(okPf.status, 200);
  const afterPf = await D.readOrder(row.id, env);
  assert.strictEqual(afterPf.fulfilment.tracking, 'PF9');
  assert.strictEqual(afterPf.status, 'shipped');

  const page = fs.readFileSync('drive.html', 'utf8');
  assert.ok(page.includes('Your car. Your code. Your cut.'));
  assert.ok(page.includes("Check your rideshare platform's rules before applying exterior decals."));
  assert.ok(page.includes('noindex'));
  assert.ok(fs.readFileSync('me.html', 'utf8').includes('noindex'));
  assert.ok(fs.readFileSync('admin/decals.html', 'utf8').includes('Vistaprint has no public ordering API'));
  assert.ok(fs.readFileSync('admin/decals.html', 'utf8').includes('margin'));
  assert.ok(!fs.readFileSync('sitemap.xml', 'utf8').includes('/drive'));
  assert.ok(fs.readFileSync('robots.txt', 'utf8').includes('Disallow: /drive'));
  assert.ok(fs.readFileSync('vercel.json', 'utf8').includes('X-Robots-Tag'));
  assert.ok(fs.readFileSync('middleware.js', 'utf8').includes('drive$') && fs.readFileSync('middleware.js', 'utf8').includes('me$'));
  for (const f of fs.readdirSync('.').filter((n) => n.endsWith('.html') && n !== 'drive.html')) {
    assert.ok(!fs.readFileSync(f, 'utf8').includes('href="/drive"'), f);
  }

  const catalogRes = await call(checkout, { method: 'GET', url: '/api/drive-checkout', headers: {} });
  assert.strictEqual(catalogRes.body.live, false);
  assert.ok(!JSON.stringify(catalogRes.body).includes('print_cost'));
  const foreign = await call(checkout, { method: 'POST', url: '/api/drive-checkout', headers: { origin: 'https://evil.example', host: 'calmjoints.org' }, body: buyer('nope') });
  assert.strictEqual(foreign.status, 403);

  console.log('drive: all checks passed', { incar: incar.price, both: both.price, margin: both.margin_amount });
})().catch((e) => { console.error(e); process.exit(1); });
