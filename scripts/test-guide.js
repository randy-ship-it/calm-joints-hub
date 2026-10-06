const assert = require('assert');
const fs = require('fs');
const { validateGuideLead, guideFridayBody, recordGuideLead } = require('../lib/guide-lead');

const bad = validateGuideLead({ email: 'nope' });
assert.ok(bad.error);

const ok = validateGuideLead({ email: 'Pat@Example.com', first_name: 'Pat', province: 'Ontario', area: 'Knees', day_time: 'Thu evening', src: 'qr', venue: 'Beach Volleyball', clicked_book: true, newsletter_opt_in: 'yes', symptoms: 'should be dropped', history: 'dropped' });
assert.ok(ok.value);
assert.strictEqual(ok.value.province, 'ON');
assert.strictEqual(ok.value.area, 'knee');
assert.strictEqual(ok.value.venue, 'beach-volleyball');
const body = guideFridayBody(ok.value, 'cj-guide-x');
assert.strictEqual(body.org, 'calmjoints');
assert.strictEqual(body.form, 'guide-triage');
assert.ok(body.tags.includes('cj-guide') && body.tags.includes('src:qr') && body.tags.includes('venue:beach-volleyball'));
assert.ok(body.meta.consent && body.meta.consent.law === 'CASL');
assert.ok(!JSON.stringify(body).includes('dropped'), 'no symptoms or history ever reach the CRM');

(async () => {
  let sent = null;
  const fetchImpl = async (url, init) => { sent = { url, init }; return { ok: true, status: 200, json: async () => ({ contactId: 1, dealId: 2 }) }; };
  const out = await recordGuideLead({ email: 'qa+test@calmjoints.org', test: true, session_id: 'abc' }, { INTAKE_WEBHOOK_SECRET: 'k' }, fetchImpl);
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.json.contactId, 1);
  assert.ok(sent.url.endsWith('/api/intake'));
  const payload = JSON.parse(sent.init.body);
  assert.strictEqual(payload.externalId, 'cj-guide-test-abc');
  assert.strictEqual(payload.meta.is_test, true);

  const banned = /\b(CHI|Clairvoyant|Align|Jane|Scale|Birch|BirchReserve|Silver Birch)\b/;
  for (const f of ['chat.html', 'js/guide.js', 'css/guide.css', 'js/book.js']) {
    assert.ok(!banned.test(fs.readFileSync(f, 'utf8')), f + ' has a name that must not reach visitors');
  }
  console.log('guide tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
