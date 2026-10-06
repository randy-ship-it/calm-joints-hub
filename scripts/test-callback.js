const assert = require('assert');
const cb = require('../lib/guide-callback');

assert.strictEqual(cb.toE164('(416) 555-0123'), '+14165550123');
assert.strictEqual(cb.toE164('1 604 555 0199'), '+16045550199');
assert.strictEqual(cb.toE164('911'), null);
assert.strictEqual(cb.toE164('1-800-555-0100'), null, 'no toll-free');
assert.ok(cb.validateCallback({ first_name: 'Sam', phone: '4165550123' }).error, 'consent required');
assert.ok(cb.validateCallback({ first_name: '123', phone: '4165550123', consent: true }).error);
assert.ok(cb.validateCallback({ first_name: 'Sam', phone: '555', consent: true }).error);
const ok = cb.validateCallback({ first_name: 'Sam Lee', phone: '416-555-0123', consent: 'on', src: 'QR', venue: 'Beach Volleyball' });
assert.strictEqual(ok.value.first_name, 'Sam');
assert.strictEqual(ok.value.venue, 'beach-volleyball');

const off = cb.callbackConfig({ ELEVENLABS_API_KEY: 'x' });
assert.strictEqual(off.enabled, false, 'gated without flag + number');
const on = cb.callbackConfig({ CJ_CALLBACK_ENABLED: '1', ELEVENLABS_API_KEY: 'x', CJ_CALLBACK_PHONE_NUMBER_ID: 'phnum_1' });
assert.strictEqual(on.enabled, true);

const fb = cb.callbackFridayBody(ok.value, 'id1');
assert.strictEqual(fb.form, 'guide-callback');
assert.ok(fb.tags.includes('consent:call'));
assert.ok(!('email' in fb));
const ob = cb.outboundBody(ok.value, on);
assert.strictEqual(ob.agent_phone_number_id, 'phnum_1');
assert.strictEqual(ob.conversation_initiation_client_data.dynamic_variables.mode, 'phone');
assert.ok(/^Hi Sam, it’s the Calm Joints guide calling back/.test(ob.conversation_initiation_client_data.conversation_config_override.agent.first_message));
assert.ok(!/randy|birch/i.test(JSON.stringify(ob)));

(async () => {
  const gated = await cb.requestCallback({ first_name: 'Sam', phone: '4165550123', consent: true }, {}, async () => { throw new Error('no network when gated'); });
  assert.strictEqual(gated.status, 503);
  assert.strictEqual(gated.json.gated, true);
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => (url.includes('elevenlabs') ? { success: true, conversation_id: 'c1' } : { contactId: 1 }) }; };
  const env = { CJ_CALLBACK_ENABLED: '1', ELEVENLABS_API_KEY: 'x', CJ_CALLBACK_PHONE_NUMBER_ID: 'phnum_1', INTAKE_WEBHOOK_SECRET: 'k' };
  const first = await cb.requestCallback({ first_name: 'Sam', phone: '4165550123', consent: true, test: true }, env, fetchImpl);
  assert.strictEqual(first.status, 200, JSON.stringify(first));
  assert.ok(calls.some((c) => c.url.endsWith('/api/intake') && c.body.form === 'guide-callback'));
  assert.ok(calls.some((c) => c.url.endsWith('/v1/convai/twilio/outbound-call') && c.body.to_number === '+14165550123'));
  const again = await cb.requestCallback({ first_name: 'Sam', phone: '(416) 555-0123', consent: true }, env, fetchImpl);
  assert.strictEqual(again.status, 429, 'one call per phone per 10 min');
  const dry = await cb.requestCallback({ first_name: 'Ana', phone: '6045550199', consent: true }, {}, fetchImpl, { dryRun: true });
  assert.strictEqual(dry.json.dry_run, true);
  console.log('callback tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
