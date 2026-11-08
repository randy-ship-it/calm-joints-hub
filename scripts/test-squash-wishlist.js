'use strict';

const assert = require('assert');
const insider = require('../lib/squash-insider');
const store = require('../lib/squash-wishlist-store');

function memoryBlob() {
  const files = new Map();
  return {
    files,
    async get(path) {
      const raw = files.get(path);
      return raw ? JSON.parse(raw) : null;
    },
    async put(path, obj, overwrite) {
      if (files.has(path) && !overwrite) {
        const err = new Error('exists');
        throw err;
      }
      files.set(path, JSON.stringify(obj));
    },
    async list(prefix) {
      return [...files.keys()].filter((path) => path.startsWith(prefix));
    },
  };
}

function resMock() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    raw: '',
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; },
    writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers); },
    end(body) { this.raw = body; },
  };
}

(async () => {
  const price = store.retailSnapshot('US$149.00');
  assert.deepStrictEqual(price, {
    price_kind: 'retail_listed',
    retail_currency: 'USD',
    retail_amount_cents: 14900,
    retail_label: 'US$149.00',
    wholesale_amount_cents: null,
    wholesale_status: 'unconfirmed',
  });
  assert.strictEqual(store.retailSnapshot('CA$16.95').retail_currency, 'CAD');
  assert.strictEqual(store.retailSnapshot('CA$16.95').retail_amount_cents, 1695);

  const blob = memoryBlob();
  const env = { CJ_RESEND_API_KEY: 're_test', wishlistBlob: blob };
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200 };
  };
  insider.buckets.clear();
  const first = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'Player@Example.com', product_ids: ['roll-r8', 'kalaya-6x-cream'], quantities: { 'roll-r8': 2 } },
    ip: '203.0.113.40',
    env,
    fetchImpl,
  });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.json.persisted, true);
  assert.strictEqual(first.json.delivery, 'sent');
  assert.strictEqual(first.json.duplicate, false);
  assert.strictEqual(blob.files.size, 1);
  const stored = JSON.parse([...blob.files.values()][0]);
  assert.strictEqual(stored.email, 'player@example.com');
  assert.strictEqual(stored.offer_id, 'squash-insider-unconfirmed');
  assert.strictEqual(stored.cart_status, 'blocked');
  assert.deepStrictEqual(stored.gates, { hub_products_loaded: false, guest_checkout: false, corporate_codes: false });
  assert.strictEqual(stored.email_status, 'sent');
  assert.strictEqual(stored.lines.find((line) => line.product_id === 'roll-r8').quantity, 2);
  assert.strictEqual(stored.lines.every((line) => line.wholesale_amount_cents === null && line.mapping_status === 'unmapped' && line.scale_sku === null), true);
  assert.ok(!JSON.stringify(stored).toLowerCase().includes('randywholesale'));
  assert.ok(!JSON.stringify(first.json).toLowerCase().includes('randywholesale'));
  assert.ok(!first.json.wishlists);
  const visitor = calls.find((mail) => mail.to[0] === 'player@example.com');
  assert.ok(visitor.text.includes('qty 2'));
  assert.ok(visitor.text.includes('within a week, possibly sooner'));

  const again = await insider.handleInsider({
    body: { intent: 'interest', code: 'Randy wholesale', email: 'player@example.com', product_ids: ['kalaya-6x-cream', 'roll-r8'], quantities: { 'roll-r8': 2 } },
    ip: '203.0.113.41',
    env,
    fetchImpl,
  });
  assert.strictEqual(again.json.duplicate, true);
  assert.strictEqual(again.json.delivery, 'already_recorded');
  assert.strictEqual(blob.files.size, 1);
  assert.strictEqual(calls.length, 2);

  const failedMail = memoryBlob();
  const failEnv = {
    CJ_RESEND_API_KEY: 're_test',
    wishlistBlob: failedMail,
  };
  const failed = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'second@example.com', product_ids: ['roll-r3'] },
    ip: '203.0.113.42',
    env: failEnv,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  assert.strictEqual(failed.status, 200);
  assert.strictEqual(failed.json.persisted, true);
  assert.strictEqual(failed.json.delivery, 'failed');
  assert.strictEqual(JSON.parse([...failedMail.files.values()][0]).email_status, 'failed');

  const broken = {
    async get() { return null; },
    async put() { throw new Error('blob down'); },
    async list() { return []; },
  };
  const stillMailed = [];
  const mailed = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'third@example.com', product_ids: ['roll-r1'] },
    ip: '203.0.113.43',
    env: { CJ_RESEND_API_KEY: 're_test', wishlistBlob: broken },
    fetchImpl: async (url, opts) => { stillMailed.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(mailed.json.persisted, false);
  assert.strictEqual(mailed.json.persistence, 'failed');
  assert.strictEqual(mailed.json.delivery, 'sent');
  assert.strictEqual(stillMailed.length, 2);

  const badQty = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'fourth@example.com', product_ids: ['roll-r1'], quantities: { 'roll-r1': 11 } },
    ip: '203.0.113.44',
    env,
    fetchImpl: async () => { throw new Error('should not send'); },
  });
  assert.strictEqual(badQty.status, 400);

  const denied = resMock();
  await store.handleWishlistAdmin({ method: 'GET', url: '/api/squash-wishlist-admin', headers: {} }, denied, env);
  assert.strictEqual(denied.statusCode, 401);

  const allowed = resMock();
  await store.handleWishlistAdmin({
    method: 'GET',
    url: '/api/squash-wishlist-admin',
    headers: { authorization: 'Bearer admin-key', 'x-forwarded-for': '203.0.113.50' },
  }, allowed, { ...env, CJ_ADMIN_KEY: 'admin-key' });
  assert.strictEqual(allowed.statusCode, 200);
  assert.strictEqual(allowed.body.cart_conversion, 'blocked');
  assert.strictEqual(allowed.body.gates.guest_checkout, false);
  const r8 = allowed.body.interest.find((row) => row.product_id === 'roll-r8');
  assert.strictEqual(r8.wishlist_count, 1);
  assert.strictEqual(r8.quantity_total, 2);
  assert.ok(allowed.body.blocker.includes('blocked'));
  assert.ok(!JSON.stringify(allowed.body).toLowerCase().includes('randywholesale'));

  const csv = resMock();
  await store.handleWishlistAdmin({
    method: 'GET',
    url: '/api/squash-wishlist-admin?format=csv',
    headers: { authorization: 'Bearer admin-key', 'x-forwarded-for': '203.0.113.51' },
  }, csv, { ...env, CJ_ADMIN_KEY: 'admin-key' });
  assert.strictEqual(csv.statusCode, 200);
  assert.ok(csv.raw.includes('player@example.com'));
  assert.ok(csv.raw.includes('unconfirmed'));
  assert.ok(!csv.raw.toLowerCase().includes('randywholesale'));

  const off = resMock();
  await store.handleWishlistAdmin({
    method: 'GET',
    url: '/api/squash-wishlist-admin',
    headers: { authorization: 'Bearer admin-key', 'x-forwarded-for': '203.0.113.52' },
  }, off, { CJ_ADMIN_KEY: 'admin-key' });
  assert.strictEqual(off.statusCode, 503);
  assert.strictEqual(off.body.persistence, 'unconfigured');
  assert.ok(off.body.blocker.includes('not been applied'));

  console.log('squash-wishlist: checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
