'use strict';

const assert = require('assert');
const insider = require('../lib/squash-insider');
const store = require('../lib/squash-wishlist-store');
const storeSheet = require('../lib/squash-wishlist-sheet');

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
  assert.strictEqual(off.body.sheet.active, false);
  assert.strictEqual(off.body.sheet.destination_recorded, true);
  assert.strictEqual(off.body.sheet.headers_verified_live, false);

  assert.strictEqual(first.json.sheet_status, 'unconfigured');
  assert.strictEqual(stored.sheet_status, 'unconfigured');
  assert.ok(allowed.body.sheet && allowed.body.sheet.active === false);
  assert.deepStrictEqual(allowed.body.sheet.missing.sort(), ['CJ_WISHLIST_SHEET_CLIENT_EMAIL', 'CJ_WISHLIST_SHEET_ID', 'CJ_WISHLIST_SHEET_PRIVATE_KEY']);

  let leaked = false;
  const rejected = await insider.handleInsider({
    body: { intent: 'interest', code: '', email: 'nobody@example.com', product_ids: ['roll-r1'] },
    ip: '203.0.113.80',
    env: { CJ_RESEND_API_KEY: 're_test', wishlistBlob: memoryBlob(), wishlistFetch: async () => { leaked = true; return { ok: false }; } },
    fetchImpl: async () => { leaked = true; return { ok: true }; },
  });
  assert.strictEqual(rejected.status, 401);
  assert.strictEqual(leaked, false);

  const { generateKeyPairSync } = require('crypto');
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const sheetCalls = [];
  const ids = { wish: ['wishlist_id'], line: ['line_id'] };
  const sheetBlob = memoryBlob();
  const sheetEnv = {
    CJ_RESEND_API_KEY: 're_test',
    wishlistBlob: sheetBlob,
    CJ_WISHLIST_SHEET_ID: storeSheet.SHEET_ID,
    CJ_WISHLIST_SHEET_CLIENT_EMAIL: 'sheet-bot@example.invalid',
    CJ_WISHLIST_SHEET_PRIVATE_KEY: pem,
    wishlistFetch: async (url, opts) => {
      const address = String(url);
      const payload = opts && opts.body ? String(opts.body) : '';
      sheetCalls.push({ address, payload, method: opts && opts.method });
      if (address.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      if (address.includes('wishlists!1%3A1')) return { ok: true, json: async () => ({ values: [storeSheet.WISHLIST_HEADERS] }) };
      if (address.includes('lines!1%3A1')) return { ok: true, json: async () => ({ values: [storeSheet.LINE_HEADERS] }) };
      if (address.includes('wishlists!A%3AA')) return { ok: true, json: async () => ({ values: ids.wish.map((id) => [id]) }) };
      if (address.includes('lines!A%3AA')) return { ok: true, json: async () => ({ values: ids.line.map((id) => [id]) }) };
      if (address.includes(':append') || address.includes('%3Aappend')) {
        const rows = JSON.parse(payload).values;
        rows.forEach((row) => {
          if (address.includes('wishlists')) ids.wish.push(row[0]);
          if (address.includes('lines')) ids.line.push(row[0]);
        });
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    },
  };
  const named = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'sheet@example.com', product_ids: ['roll-r8'] },
    ip: '203.0.113.81',
    env: sheetEnv,
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.strictEqual(named.json.sheet_status, 'synced');
  assert.ok(sheetCalls.some((call) => call.address.includes('sheets.googleapis.com') && call.payload.includes('sheet@example.com')));
  assert.ok(sheetCalls.every((call) => !call.payload.toLowerCase().includes('randywholesale') && !call.payload.includes('BEGIN PRIVATE KEY')));
  const appends = () => sheetCalls.filter((call) => call.method === 'POST' && call.address.includes(':append')).length;
  const before = appends();
  assert.strictEqual(before, 2);
  const againSheet = await insider.handleInsider({
    body: { intent: 'interest', code: 'RANDYWHOLESALE', email: 'sheet@example.com', product_ids: ['roll-r8'] },
    ip: '203.0.113.82',
    env: sheetEnv,
    fetchImpl: async () => { throw new Error('second mail'); },
  });
  assert.strictEqual(againSheet.json.delivery, 'already_recorded');
  const after = appends();
  assert.strictEqual(after, before);

  const tricky = storeSheet.lineRow(
    { id: 'abc', created_at: 't', email: 'a@b.co' },
    { product_id: 'x', name: '=HYPERLINK("http://evil")', quantity: 1, retail_currency: 'USD', retail_amount_cents: 100, variant_status: 'unspecified', variant_note: '+note' },
    'now',
  );
  assert.strictEqual(tricky[3][0], "'");
  assert.strictEqual(tricky[5][0], "'");
  assert.strictEqual(tricky.length, storeSheet.LINE_HEADERS.length);
  assert.strictEqual(storeSheet.wishlistRow({ id: 'abc', created_at: 't', email: 'a@b.co', lines: [{ retail_currency: 'USD', retail_amount_cents: 100, quantity: 1 }] }, 'now').length, storeSheet.WISHLIST_HEADERS.length);

  const mismatchCalls = [];
  const mismatch = await store.syncRecord({
    ...sheetEnv,
    wishlistBlob: sheetBlob,
    wishlistFetch: async (url) => {
      mismatchCalls.push(String(url));
      if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, json: async () => ({ values: [['wrong']] }) };
    },
  }, JSON.parse([...sheetBlob.files.values()].find((raw) => raw.includes('sheet@example.com'))));
  assert.strictEqual(mismatch.status, 'header_mismatch');
  assert.ok(!mismatchCalls.some((url) => url.includes('append') || url.includes('valueInputOption')));

  const retry = resMock();
  await store.handleWishlistAdmin({
    method: 'POST',
    url: '/api/squash-wishlist-admin',
    headers: { authorization: 'Bearer admin-key', 'x-forwarded-for': '203.0.113.83' },
    body: { action: 'retry_sheet' },
  }, retry, { CJ_ADMIN_KEY: 'admin-key', wishlistBlob: memoryBlob() });
  assert.strictEqual(retry.statusCode, 503);
  assert.strictEqual(retry.body.sheet.active, false);

  const sameLines = [{ product_id: 'roll-r8', quantity: 1 }];
  const squashId = store.buildRecord({ email: 'a@b.co', lines: sameLines, now: 't' });
  const squashAgain = store.buildRecord({ email: 'a@b.co', lines: sameLines, now: 't', sport: 'squash' });
  const tennisId = store.buildRecord({ email: 'a@b.co', lines: sameLines, now: 't', sport: 'tennis' });
  const unknownSport = store.buildRecord({ email: 'a@b.co', lines: sameLines, now: 't', sport: 'platform-tennis' });
  assert.strictEqual(squashId.id, squashAgain.id);
  assert.strictEqual(squashId.id, unknownSport.id);
  assert.notStrictEqual(squashId.id, tennisId.id);
  assert.strictEqual(tennisId.sport, 'tennis');
  assert.strictEqual(tennisId.source, 'tennis-insider');
  const tennisRow = storeSheet.wishlistRow(tennisId, 'now');
  assert.strictEqual(tennisRow.length, storeSheet.WISHLIST_HEADERS.length);
  assert.strictEqual(tennisRow[4], 'squash-insider');
  assert.ok(tennisRow.some((value) => String(value).includes('Sport: tennis')));

  console.log('squash-wishlist: checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
