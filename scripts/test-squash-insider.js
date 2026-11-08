'use strict';

const assert = require('assert');
const insider = require('../lib/squash-insider');

function run(body, env, fetchImpl) {
  insider.buckets.clear();
  return insider.handleInsider({
    body,
    ip: '203.0.113.10',
    env: env || {},
    fetchImpl: fetchImpl || (async () => { throw new Error('fetch should not run'); }),
  });
}

(async () => {
  const bad = await run({ intent: 'open', code: 'nope' });
  assert.strictEqual(bad.status, 401);
  assert.strictEqual(bad.json.ok, false);
  assert.ok(!bad.json.products);

  for (const code of ['RANDYWHOLESALE', 'randywholesale', 'RandyWholesale', ' RANDYWHOLESALE ', 'Randy wholesale', 'RANDY  WHOLESALE', 'randy   wholesale']) {
    const opened = await run({ intent: 'open', code });
    assert.strictEqual(opened.status, 200, code);
    assert.deepStrictEqual(opened.json.products.map((item) => item.id), [
      'roll-r8', 'roll-r8plus', 'roll-r3', 'roll-stretchmat', 'drho-tens-pro', 'roll-r1',
      'kalaya-6x-cream', 'kalaya-6x-massager', 'kalaya-foam', 'kalaya-gel', 'kalaya-spray',
      'sole-active-medium', 'sole-performance-medium', 'sole-active-thin',
      'c88-knee', 'c88-calf', 'c88-ankle', 'c88-elbow', 'c88-arm', 'c88-wrist', 'c88-knee-socks', 'c88-midcalf-socks',
    ]);
    assert.deepStrictEqual(opened.json.products.map((item) => item.use), [
      'Massage', 'Massage', 'Massage', 'Massage', 'Massage', 'Massage',
      'Topical', 'Topical', 'Topical', 'Topical', 'Topical',
      'Feet', 'Feet', 'Feet',
      'Compression', 'Compression', 'Compression', 'Compression', 'Compression', 'Compression', 'Compression', 'Compression',
    ]);
    assert.deepStrictEqual(opened.json.products.filter((item) => item.highlight).map((item) => item.id), ['roll-r8', 'kalaya-6x-cream', 'sole-active-medium', 'c88-knee']);
    assert.deepStrictEqual(opened.json.products.map((item) => item.price_label), [
      'US$149.00', 'US$179.00', 'US$35.00', 'US$65.00', 'CA$249.95', 'US$139.00',
      'CA$16.95', 'CA$17.95', 'CA$17.95', 'CA$17.95', 'CA$14.95',
      'CA$65.00', 'CA$65.00', 'CA$65.00',
      'CA$17.99', 'CA$19.99', 'CA$19.99', 'CA$19.99', 'CA$19.99', 'CA$19.99', 'CA$29.99', 'CA$29.99',
    ]);
    const fs = require('fs');
    for (const item of opened.json.products) {
      assert.ok(item.image.startsWith('/media/squash/wishlist/') && item.image.endsWith('.webp'), item.id);
      assert.ok(item.alt && item.alt.length > 8, item.id);
      assert.ok(Array.isArray(item.about) && item.about.length >= 2, item.id);
      const photo = fs.readFileSync(item.image.replace(/^\//, ''));
      assert.strictEqual(photo.slice(0, 4).toString(), 'RIFF', item.image);
      assert.strictEqual(photo.slice(8, 12).toString(), 'WEBP', item.image);
      const copy = (item.about.join(' ') + ' ' + item.detail).toLowerCase();
      for (const banned of ['heal', 'treats', 'prevents', 'wholesale', 'in stock', '% off', 'guaranteed']) {
        assert.ok(!copy.includes(banned), item.id + ' ' + banned);
      }
    }
    assert.ok(opened.json.offer.join(' ').includes('processing fees'));
    assert.ok(opened.json.store.href.includes('scalehealth.ca/calmjoints'));
    assert.ok(!/randywholesale|randy30|30%|35%|\$[0-9]+\s*off/i.test(JSON.stringify(opened.json)));
  }
  for (const code of ['Randy30', 'RANDY30', 'randy30', 'Randy 30', 'wholesale randy', 'randy-wholesale']) {
    const retired = await run({ intent: 'open', code });
    assert.strictEqual(retired.status, 401, code);
    assert.ok(!retired.json.products);
  }

  const flagged = await run({ intent: 'interest', insider: true, email: 'a@b.co', product_ids: ['roll-r3'] });
  assert.strictEqual(flagged.status, 401);

  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    return { ok: true, status: 200 };
  };
  const sent = await insider.handleInsider({
    body: { intent: 'interest', code: 'rAnDyWhOlEsAlE', email: 'player@example.com', product_ids: ['drho-tens-pro', 'roll-r8'] },
    ip: '203.0.113.11',
    env: { CJ_RESEND_API_KEY: 're_test' },
    fetchImpl,
  });
  assert.strictEqual(sent.status, 200);
  assert.strictEqual(sent.json.delivery, 'sent');
  assert.strictEqual(calls.length, 2);
  const staff = calls.find((call) => call.body.to[0] === 'info@calmjoints.com');
  const visitor = calls.find((call) => call.body.to[0] === 'player@example.com');
  assert.ok(staff && visitor);
  assert.strictEqual(staff.body.reply_to, 'player@example.com');
  assert.ok(staff.body.text.includes('Insider code: accepted'));
  assert.ok(staff.body.text.includes('drho-tens-pro'));
  assert.ok(staff.body.text.includes('TENS Pro Essentials'));
  assert.ok(visitor.body.text.includes('wishlist'));
  assert.ok(!/randywholesale|randy30/i.test(staff.body.text + visitor.body.text));
  assert.ok(calls.every((call) => call.url === 'https://api.resend.com/emails'));

  const quiet = await run({ intent: 'interest', code: 'RandyWholesale', email: 'a@b.co', product_ids: ['roll-r3'] }, {});
  assert.strictEqual(quiet.status, 503);
  assert.strictEqual(quiet.json.delivery, 'unconfigured');
  assert.notStrictEqual(quiet.json.delivery, 'sent');

  const unknown = await run({ intent: 'interest', code: 'RandyWholesale', email: 'a@b.co', product_ids: ['roll-r4'] }, { CJ_RESEND_API_KEY: 're_test' }, fetchImpl);
  assert.strictEqual(unknown.status, 400);
  const oldInterest = await run({ intent: 'interest', code: 'Randy30', email: 'a@b.co', product_ids: ['roll-r3'] }, { CJ_RESEND_API_KEY: 're_test' }, fetchImpl);
  assert.strictEqual(oldInterest.status, 401);
  const honey = await run({ intent: 'open', code: 'RANDYWHOLESALE', company: 'spam' });
  assert.strictEqual(honey.status, 400);

  insider.buckets.clear();
  let last = null;
  for (let i = 0; i < 9; i += 1) {
    last = await insider.handleInsider({
      body: { intent: 'open', code: 'wrong' },
      ip: '203.0.113.12',
      env: {},
      fetchImpl,
    });
  }
  assert.strictEqual(last.status, 429);

  const page = require('fs').readFileSync('squash.html', 'utf8');
  assert.ok(page.includes('id="insider"'));
  assert.ok(!/randy30/i.test(page));
  console.log('squash-insider: checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
