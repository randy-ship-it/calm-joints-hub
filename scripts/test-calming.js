const assert = require('assert');
const { validateNewsletter, processIntake, fridayBody } = require('../lib/intake');

async function main() {
  // Calming Newsletters: CASL express opt-in required, tagged for Friday.
  assert.ok(validateNewsletter({ email: 'cal@x.co', src: 'cj-calming-newsletter' }).error, 'consent required');
  assert.ok(validateNewsletter({ email: 'cal@x.co', src: 'cj-calming-newsletter', consent: false }).error, 'consent false rejected');
  const cal = validateNewsletter({ email: 'Cal@X.co', src: 'cj-calming-newsletter', consent: 'on', placement: 'popup', page: '/blog' });
  assert.ok(!cal.error);
  const calBody = fridayBody('newsletter', cal.value, 'cj-news-cal');
  assert.strictEqual(calBody.source, 'cj-calming-newsletter');
  assert.strictEqual(calBody.path, '/blog');
  assert.ok(calBody.tags.includes('cj-calming-newsletter'));
  assert.ok(calBody.tags.includes('placement:popup'));
  assert.ok(!calBody.tags.includes('test'));
  assert.strictEqual(calBody.meta.consent.type, 'express');
  assert.match(calBody.meta.consent.text, /Subscribe/);
  assert.match(calBody.meta.consent.sender, /Unit 777, 2255B Queen St E, Toronto ON M4E 1G3/);
  assert.ok(!/Beaufort/i.test(JSON.stringify(calBody)));
  const odd = validateNewsletter({ email: 'o@x.co', src: 'cj-calming-newsletter', consent: true, placement: '<script>', page: 'https://evil.example' });
  assert.strictEqual(odd.value.placement, 'other');
  assert.strictEqual(odd.value.page, null);
  const qaCalls = [];
  const qa = await processIntake('newsletter', { email: 'qa@x.co', src: 'cj-calming-newsletter', consent: true, placement: 'inline', test: true }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k', CJ_RESEND_API_KEY: 're_test', CJ_ALERT_EMAILS: 'a@x.co', CJ_ALERT_SLACK_WEBHOOK_URL: 'https://hooks.example/x' }, ip: '8.8.8.6',
    fetchImpl: async (url, init) => { qaCalls.push({ url, body: init && init.body }); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(qa.status, 200);
  assert.match(qa.json.message, /Calming Newsletter/);
  assert.strictEqual(qaCalls.length, 1, 'QA entry goes to Friday only, no team alerts');
  const qaBody = JSON.parse(qaCalls[0].body);
  assert.ok(qaBody.tags.includes('test'));
  assert.match(qaBody.externalId, /^cj-news-test-/);

  console.log('calming newsletter tests ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
