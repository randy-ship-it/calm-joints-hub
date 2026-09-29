const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateNewsletter, validateApply, processIntake, PROVINCES } = require('../lib/intake');

const store = path.join(os.tmpdir(), `cj-intake-${process.pid}.jsonl`);
const env = { INTAKE_STORE_PATH: store };

function readLines() {
  if (!fs.existsSync(store)) return [];
  return fs.readFileSync(store, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  assert.strictEqual(Object.keys(PROVINCES).length, 13);

  assert.ok(validateNewsletter({ email: 'not-an-email' }).error);
  const news = validateNewsletter({ email: '  Ada@Example.com ', name: 'Ada Lovelace' });
  assert.strictEqual(news.value.email, 'ada@example.com');
  assert.strictEqual(news.value.notify_email, 'info@calmjoints.ca');
  assert.ok(validateNewsletter({ email: 'ada@example.com', name: '<script>' }).error);

  assert.ok(validateApply({ email: 'a@b.co', name: 'Jo', provinces: [] }).error);
  const apply = validateApply({
    name: 'Priya Shah',
    email: 'priya@example.com',
    phone: '',
    provinces: ['on', 'BC'],
    registration_number: 'PT 12345',
    linkedin: '@priya-physio',
    bio: 'I like stubborn knees and people who garden.',
    years_experience: '8',
    availability: 'Tue evenings',
  });
  assert.deepStrictEqual(apply.value.provinces, ['ON', 'BC']);
  assert.strictEqual(apply.value.years_experience, 8);
  assert.strictEqual(apply.value.linkedin, 'priya-physio');
  assert.ok(validateApply({
    name: 'Priya Shah',
    email: 'priya@example.com',
    provinces: ['ON'],
    linkedin: 'https://evil.example/in/priya',
    bio: 'Enough words here to pass.',
  }).error);

  fs.rmSync(store, { force: true });
  const honeypot = await processIntake('newsletter', { email: 'bot@example.com', company: 'acme' }, { env, ip: '1.1.1.1' });
  assert.strictEqual(honeypot.status, 200);
  assert.strictEqual(fs.existsSync(store), false);

  const saved = await processIntake('newsletter', { email: 'ada@example.com', name: 'Ada' }, { env, ip: '2.2.2.2' });
  assert.strictEqual(saved.status, 200);
  const rows = readLines();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].type, 'newsletter');
  assert.strictEqual(rows[0].source, 'calmjoints.ca');
  assert.strictEqual(rows[0].payload.email, 'ada@example.com');
  assert.ok(rows[0].received_at);

  const bad = await processIntake('apply', { name: 'Jo', email: 'jo@example.com' }, { env, ip: '3.3.3.3' });
  assert.strictEqual(bad.status, 400);

  const applied = await processIntake('apply', {
    name: 'Priya Shah',
    email: 'priya@example.com',
    provinces: ['NS'],
    bio: 'Coastal physio, knees and surfers.',
    linkedin: 'https://www.linkedin.com/in/priya',
  }, { env, ip: '3.3.3.3' });
  assert.strictEqual(applied.status, 200);
  assert.strictEqual(readLines()[2] ? readLines().at(-1).type : readLines()[1].type, 'apply');
  assert.strictEqual(readLines().at(-1).payload.linkedin, 'https://www.linkedin.com/in/priya');

  let fridayCalls = 0;
  const fridayEnv = { ...env, FRIDAY_INTAKE_URL: 'https://friday.example/intake', FRIDAY_INTAKE_SECRET: 'sekret' };
  const before = readLines().length;
  const viaFriday = await processIntake('newsletter', { email: 'bea@example.com' }, {
    env: fridayEnv,
    ip: '4.4.4.4',
    fetchImpl: async (url, init) => {
      fridayCalls += 1;
      assert.strictEqual(url, 'https://friday.example/intake');
      const body = JSON.parse(init.body);
      assert.deepStrictEqual(Object.keys(body).sort(), ['payload', 'received_at', 'source', 'type']);
      assert.strictEqual(body.source, 'calmjoints.ca');
      assert.strictEqual(init.headers.Authorization, 'Bearer sekret');
      return { ok: true, status: 200 };
    },
  });
  assert.strictEqual(viaFriday.status, 200);
  assert.strictEqual(fridayCalls, 1);
  assert.strictEqual(readLines().length, before, 'Friday success should not also write the fallback file');

  const fallback = await processIntake('newsletter', { email: 'cy@example.com' }, {
    env: fridayEnv,
    ip: '5.5.5.5',
    fetchImpl: async () => ({ ok: false, status: 502 }),
  });
  assert.strictEqual(fallback.status, 200);
  assert.strictEqual(readLines().at(-1).payload.email, 'cy@example.com');

  const rateStore = new Map();
  for (let i = 0; i < 8; i += 1) {
    const res = await processIntake('newsletter', { email: `n${i}@example.com` }, {
      env,
      ip: '9.9.9.9',
      rate: { store: rateStore, limit: 8, windowMs: 60000 },
    });
    assert.strictEqual(res.status, 200);
  }
  const limited = await processIntake('newsletter', { email: 'late@example.com' }, {
    env,
    ip: '9.9.9.9',
    rate: { store: rateStore, limit: 8, windowMs: 60000 },
  });
  assert.strictEqual(limited.status, 429);

  fs.rmSync(store, { force: true });
  console.log('intake tests ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
