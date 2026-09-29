const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateNewsletter, validateApply, processIntake, PROVINCES, FRIDAY_INTAKE_URL, fridayBody } = require('../lib/intake');

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
  assert.ok(validateApply({
    name: 'Priya Shah',
    email: 'priya@example.com',
    provinces: ['ON'],
    bio: 'Enough words here to pass.',
  }).error);

  const newsBody = fridayBody('newsletter', news.value, 'cj-news-fixed');
  assert.deepStrictEqual(newsBody, {
    externalId: 'cj-news-fixed',
    email: 'ada@example.com',
    site: 'calmjoints.ca',
    source: 'calmjoints_newsletter',
    path: '/newsletter',
    kind: 'form',
    tags: ['calmjoints', 'newsletter'],
    meta: { name: 'Ada Lovelace' },
  });
  const newsBare = fridayBody('newsletter', { email: 'bea@example.com', name: null }, 'cj-news-bare');
  assert.strictEqual(newsBare.meta, undefined);
  assert.strictEqual(newsBare.site, 'calmjoints.ca');
  assert.strictEqual(newsBare.kind, 'form');

  const applyFriday = fridayBody('apply', apply.value, 'cj-physio-fixed');
  assert.strictEqual(applyFriday.externalId, 'cj-physio-fixed');
  assert.strictEqual(applyFriday.firstName, 'Priya');
  assert.strictEqual(applyFriday.lastName, 'Shah');
  assert.strictEqual(applyFriday.message, 'I like stubborn knees and people who garden.');
  assert.strictEqual(applyFriday.province, 'ON');
  assert.strictEqual(applyFriday.country, 'CA');
  assert.strictEqual(applyFriday.website, 'https://www.linkedin.com/in/priya-physio');
  assert.strictEqual(applyFriday.kind, 'providers');
  assert.strictEqual(applyFriday.path, '/apply');
  assert.strictEqual(applyFriday.site, 'calmjoints.ca');
  assert.strictEqual(applyFriday.source, 'calmjoints_physio_apply');
  assert.deepStrictEqual(applyFriday.tags, ['calmjoints', 'physio-apply']);
  assert.strictEqual(applyFriday.meta.linkedin, 'priya-physio');
  assert.strictEqual(applyFriday.meta.license, 'PT 12345');
  assert.strictEqual(applyFriday.meta.years_experience, 8);
  assert.strictEqual(applyFriday.meta.availability, 'Tue evenings');
  assert.deepStrictEqual(applyFriday.meta.provinces, ['ON', 'BC']);
  assert.strictEqual(applyFriday.phone, undefined);

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
  assert.strictEqual(rows[0].payload.source, 'calmjoints_newsletter');
  assert.strictEqual(rows[0].payload.site, 'calmjoints.ca');
  assert.match(rows[0].payload.externalId, /^cj-news-/);
  assert.deepStrictEqual(rows[0].payload.meta, { name: 'Ada' });
  assert.strictEqual(rows[0].notify_email, 'info@calmjoints.ca');
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
  const lastApply = readLines().at(-1);
  assert.strictEqual(lastApply.payload.website, 'https://www.linkedin.com/in/priya');
  assert.strictEqual(lastApply.payload.message, 'Coastal physio, knees and surfers.');
  assert.strictEqual(lastApply.payload.province, 'NS');
  assert.deepStrictEqual(lastApply.payload.meta.provinces, ['NS']);
  assert.strictEqual(lastApply.payload.meta.linkedin, 'https://www.linkedin.com/in/priya');
  assert.strictEqual(lastApply.payload.meta.license, undefined);
  assert.strictEqual(lastApply.payload.source, 'calmjoints_physio_apply');
  assert.match(lastApply.payload.externalId, /^cj-physio-/);
  assert.strictEqual(lastApply.payload.kind, 'providers');

  let fridayCalls = 0;
  const fridayEnv = { ...env, INTAKE_WEBHOOK_SECRET: 'door-key' };
  const before = readLines().length;
  const viaFriday = await processIntake('newsletter', { email: 'bea@example.com' }, {
    env: fridayEnv,
    ip: '4.4.4.4',
    externalId: 'cj-news-bea',
    fetchImpl: async (url, init) => {
      fridayCalls += 1;
      assert.strictEqual(url, FRIDAY_INTAKE_URL);
      assert.strictEqual(url, 'https://fridayapp.org/api/intake');
      assert.ok(!url.includes('/webhooks/calmjoints'));
      const body = JSON.parse(init.body);
      assert.deepStrictEqual(body, {
        externalId: 'cj-news-bea',
        email: 'bea@example.com',
        site: 'calmjoints.ca',
        source: 'calmjoints_newsletter',
        path: '/newsletter',
        kind: 'form',
        tags: ['calmjoints', 'newsletter'],
      });
      assert.strictEqual(init.headers.Authorization, 'Bearer door-key');
      assert.strictEqual(init.headers['X-Intake-Secret'], 'door-key');
      return { ok: true, status: 201 };
    },
  });
  assert.strictEqual(viaFriday.status, 200);
  assert.strictEqual(fridayCalls, 1);
  assert.strictEqual(readLines().length, before, 'Friday success should not also write the fallback file');

  const viaApply = await processIntake('apply', {
    name: 'Priya Shah',
    email: 'priya@example.com',
    provinces: ['ON'],
    bio: 'Knees, gardens, and Tuesday evenings.',
    linkedin: 'priya-physio',
    phone: '416-555-0199',
    registration_number: 'PT 9',
  }, {
    env: { ...env, FRIDAY_API_KEY: 'door-key' },
    ip: '4.4.4.5',
    externalId: 'cj-physio-priya',
    fetchImpl: async (url, init) => {
      fridayCalls += 1;
      assert.strictEqual(url, 'https://fridayapp.org/api/intake');
      const body = JSON.parse(init.body);
      assert.strictEqual(body.externalId, 'cj-physio-priya');
      assert.strictEqual(body.source, 'calmjoints_physio_apply');
      assert.strictEqual(body.site, 'calmjoints.ca');
      assert.strictEqual(body.message, 'Knees, gardens, and Tuesday evenings.');
      assert.strictEqual(body.website, 'https://www.linkedin.com/in/priya-physio');
      assert.strictEqual(body.meta.linkedin, 'priya-physio');
      assert.strictEqual(body.meta.phone, '416-555-0199');
      assert.strictEqual(body.meta.license, 'PT 9');
      assert.strictEqual(body.province, 'ON');
      assert.strictEqual(body.firstName, 'Priya');
      assert.strictEqual(body.lastName, 'Shah');
      assert.strictEqual(init.headers.Authorization, 'Bearer door-key');
      assert.strictEqual(init.headers['X-Intake-Secret'], 'door-key');
      return { ok: true, status: 201 };
    },
  });
  assert.strictEqual(viaApply.status, 200);
  assert.strictEqual(readLines().length, before, 'Friday apply success should not write the fallback file');

  const fallback = await processIntake('newsletter', { email: 'cy@example.com', name: 'Cy' }, {
    env: fridayEnv,
    ip: '5.5.5.5',
    fetchImpl: async () => ({ ok: false, status: 502 }),
  });
  assert.strictEqual(fallback.status, 200);
  assert.match(fallback.json.message, /on the list/i);
  const queued = readLines().at(-1);
  assert.strictEqual(queued.payload.email, 'cy@example.com');
  assert.strictEqual(queued.payload.source, 'calmjoints_newsletter');
  assert.deepStrictEqual(queued.payload.meta, { name: 'Cy' });

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
