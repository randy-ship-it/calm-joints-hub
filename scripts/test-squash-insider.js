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

  for (const code of ['RANDYWHOLESALE', 'randywholesale', 'RandyWholesale', ' RANDYWHOLESALE ']) {
    const opened = await run({ intent: 'open', code });
    assert.strictEqual(opened.status, 200, code);
    assert.deepStrictEqual(opened.json.products.map((item) => item.id), ['drho-tens-pro', 'roll-r8', 'roll-r3', 'roll-stretchmat']);
    assert.deepStrictEqual(opened.json.products.map((item) => item.price_label), ['CA$249.95', 'US$149.00', 'US$35.00', 'US$65.00']);
    assert.ok(opened.json.offer.join(' ').includes('wholesale-rate access'));
    assert.ok(!/randywholesale|randy30|30%|35%|\$[0-9]+\s*off|margin/i.test(JSON.stringify(opened.json)));
  }
  for (const code of ['Randy30', 'RANDY30', 'randy30', 'Randy 30', 'RANDY WHOLESALE']) {
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
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.resend.com/emails');
  assert.deepStrictEqual(calls[0].body.to, ['info@calmjoints.com']);
  assert.strictEqual(calls[0].body.reply_to, 'player@example.com');
  assert.ok(calls[0].body.text.includes('Insider code: accepted'));
  assert.ok(!/randywholesale|randy30/i.test(calls[0].body.text));
  assert.ok(calls[0].body.text.includes('TENS Pro Essentials'));
  assert.ok(calls[0].body.text.includes('No order, payment'));
  assert.ok(!/scalehealth\.ca\/api|scale-partner/i.test(calls[0].url));

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
