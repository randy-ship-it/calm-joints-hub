const assert = require('assert');
const fs = require('fs');
const { validateGuideLead, guideFridayBody, recordGuideLead, PREFILL_CONSENT_TEXT, PREFILL_MESSAGE } = require('../lib/guide-lead');

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
  assert.strictEqual(out.json.message, 'Got it. We’ll email you a link to book.');
  assert.ok(!payload.tags.includes('intake-prefill'));

  const pre = validateGuideLead({
    email: 'Pat@Example.com', first_name: 'Pat', province: 'ON', area: 'knee', day_time: 'Thu evening',
    intake_prefill: 'yes', symptoms: 'sharp pain for 3 years', history: 'surgery 2019', transcript: 'full chat log', diagnosis: 'osteoarthritis',
  });
  assert.strictEqual(pre.value.intake_prefill, true);
  const preBody = guideFridayBody(pre.value, 'cj-guide-pre');
  const dumped = JSON.stringify(preBody);
  assert.ok(preBody.tags.includes('intake-prefill'));
  assert.strictEqual(preBody.meta.intake_prefill, true);
  assert.strictEqual(preBody.meta.prefill.non_medical, true);
  assert.strictEqual(preBody.meta.prefill.consent.text, PREFILL_CONSENT_TEXT);
  assert.strictEqual(preBody.meta.prefill.area, 'knee');
  for (const leak of ['sharp pain', 'surgery', 'full chat', 'osteoarthritis']) {
    assert.ok(!dumped.includes(leak), 'prefill leaked: ' + leak);
  }
  const alias = validateGuideLead({ email: 'pat@example.com', intake_opt_in: '1' });
  assert.strictEqual(alias.value.intake_prefill, true);
  const biz = validateGuideLead({ email: 'pat@example.com', lead_type: 'business', intake_prefill: true, business_type: 'gym-studio', interest: 'hub' });
  assert.strictEqual(biz.value.intake_prefill, false);

  const outPre = await recordGuideLead({
    email: 'qa+test@calmjoints.org', test: true, session_id: 'pre', intake_opt_in: true,
    area: 'hip', province: 'BC', symptoms: 'hidden ache', history: 'hidden history',
  }, { INTAKE_WEBHOOK_SECRET: 'k' }, fetchImpl);
  assert.strictEqual(outPre.status, 200);
  assert.strictEqual(outPre.json.message, PREFILL_MESSAGE);
  const stored = JSON.parse(sent.init.body);
  assert.ok(stored.tags.includes('intake-prefill'));
  assert.ok(!JSON.stringify(stored).includes('hidden'));

  const queries = [];
  const neonSql = (strings, ...vals) => { queries.push({ text: strings.join('?'), vals }); return Promise.resolve([]); };
  const outNeon = await recordGuideLead({
    email: 'qa+test@calmjoints.org', test: true, session_id: 'neon', intake_prefill: true, area: 'knee', symptoms: 'do not store',
  }, { INTAKE_WEBHOOK_SECRET: 'k', NEON_DATABASE_URL: 'postgres://guide:guide@example.invalid/cj', neonSql }, fetchImpl);
  assert.strictEqual(outNeon.status, 200);
  assert.strictEqual(outNeon.json.message, PREFILL_MESSAGE);
  assert.strictEqual(queries.length, 2, 'create table + insert');
  assert.ok(/calm_joints_intakes/.test(queries[0].text));
  assert.ok(/INSERT INTO calm_joints_intakes/.test(queries[1].text));
  assert.strictEqual(queries[1].vals[0], 'guide-intake-prefill');
  assert.strictEqual(queries[1].vals[1], 'calmjoints.org');
  const neonPayload = JSON.parse(queries[1].vals[2]);
  assert.strictEqual(neonPayload.meta.intake_prefill, true);
  assert.ok(!JSON.stringify(neonPayload).includes('do not store'));

  assert.ok(fs.readFileSync('chat.html', 'utf8').includes('/js/guide.js?v=18'));
  assert.ok(fs.readFileSync('js/guide.js', 'utf8').includes('name="intake_prefill"'));
  assert.ok(fs.readFileSync('js/book.js', 'utf8').includes('/js/guide.js?v=18'));

  const banned = /\b(CHI|Clairvoyant|Align|Jane|Scale|Birch|BirchReserve|Silver Birch)\b/;
  for (const f of ['chat.html', 'js/guide.js', 'css/guide.css', 'js/book.js']) {
    assert.ok(!banned.test(fs.readFileSync(f, 'utf8')), f + ' has a name that must not reach visitors');
  }
  console.log('guide tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
