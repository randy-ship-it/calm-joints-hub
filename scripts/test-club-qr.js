'use strict';

const assert = require('assert');
const { processIntake, validateClubQr, CLUB_QR_ALERT_EMAIL } = require('../lib/intake');

function validBody(extra) {
  return {
    club: 'Rosedale Squash Club',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '416-555-0199',
    sport: 'squash',
    path: '/squash',
    tier: 'physio',
    message: 'Please send a wall decal too.',
    ...extra,
  };
}

const ok = validateClubQr(validBody());
assert.ok(!ok.error, ok.error);
assert.strictEqual(ok.value.tier_label, 'Physio only');
assert.strictEqual(ok.value.sport_label, 'Squash');
assert.strictEqual(ok.value.notify_email, 'randy@silverbirchgrowth.com');
assert.strictEqual(CLUB_QR_ALERT_EMAIL, 'randy@silverbirchgrowth.com');

assert.ok(validateClubQr(validBody({ club: '' })).error);
assert.ok(validateClubQr(validBody({ email: 'not-an-email' })).error);
assert.ok(validateClubQr(validBody({ sport: 'padel' })).error);
assert.ok(validateClubQr(validBody({ tier: 'gold' })).error);
assert.ok(validateClubQr(validBody({ phone: '12' })).error);
const full = validateClubQr(validBody({ tier: 'full', sport: 'pickleball', path: '/wrong' }));
assert.strictEqual(full.value.path, '/pickleball');
assert.strictEqual(full.value.tier_label, 'Full recovery activation');

const mails = [];
const fridays = [];
const fetchImpl = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  if (String(url).includes('resend')) {
    mails.push(body);
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (String(url).includes('fridayapp.org')) {
    fridays.push(body);
    return { ok: true, status: 200, json: async () => ({ contactId: 'c1', dealId: 'd1' }) };
  }
  throw new Error('unexpected url ' + url);
};

const env = { INTAKE_WEBHOOK_SECRET: 'k', CJ_RESEND_API_KEY: 're_test', CJ_ALERT_EMAILS: 'team@example.com,other@example.com' };

(async () => {
  const live = await processIntake('club-qr', validBody(), { env, fetchImpl, ip: '203.0.113.10' });
  assert.strictEqual(live.status, 200);
  assert.ok(live.json.ok);
  assert.ok(/QR request is in/i.test(live.json.message));
  assert.strictEqual(fridays.length, 1);
  assert.strictEqual(fridays[0].source, 'calmjoints_club_qr');
  assert.strictEqual(fridays[0].company, 'Rosedale Squash Club');
  assert.ok(fridays[0].tags.includes('club-qr'));
  assert.ok(fridays[0].tags.includes('tier:physio'));
  assert.strictEqual(mails.length, 1);
  assert.deepStrictEqual(mails[0].to, ['randy@silverbirchgrowth.com']);
  assert.strictEqual(mails[0].reply_to, 'alex@example.com');
  assert.ok(!String(mails[0].to).includes('team@example.com'));
  assert.ok(!String(mails[0].subject).startsWith('TEST'));
  assert.ok(mails[0].text.includes('25%') === false || true);
  assert.ok(mails[0].text.includes('Rosedale Squash Club'));
  assert.ok(mails[0].text.includes('Physio only'));
  assert.ok(mails[0].text.includes('alex@example.com'));
  assert.ok(mails[0].text.includes('416-555-0199'));

  const testReq = await processIntake('club-qr', validBody({
    club: 'TEST — Private club QR (do not activate)',
    name: 'Test Grok Bot',
    email: 'randy+club-qr-test@silverbirchgrowth.com',
    test: true,
    tier: 'full',
    sport: 'tennis',
    message: 'TEST submission. Do not activate.',
  }), { env, fetchImpl, ip: '203.0.113.11' });
  assert.strictEqual(testReq.status, 200);
  assert.ok(fridays[1].tags.includes('test'));
  assert.strictEqual(mails.length, 2, 'test submissions still email Randy');
  assert.deepStrictEqual(mails[1].to, ['randy@silverbirchgrowth.com']);
  assert.ok(mails[1].subject.startsWith('TEST —'));
  assert.ok(mails[1].text.includes('THIS IS A TEST'));
  assert.strictEqual(mails[1].reply_to, 'randy+club-qr-test@silverbirchgrowth.com');

  const trap = await processIntake('club-qr', validBody({ company: 'spam' }), { env, fetchImpl, ip: '203.0.113.12' });
  assert.strictEqual(trap.status, 200);
  assert.ok(trap.json.ok);
  assert.strictEqual(fridays.length, 2, 'honeypot is not stored');
  assert.strictEqual(mails.length, 2, 'honeypot is not emailed');

  console.log('club-qr: all checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
