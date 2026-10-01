const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validatePartner, validateNewsletter, validateApply, validateQuestion, alertText, processIntake, PROVINCES, FRIDAY_INTAKE_URL, fridayBody } = require('../lib/intake');

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
  assert.strictEqual(news.value.notify_email, 'info@calmjoints.org');
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
    site: 'calmjoints.org',
    org: 'calmjoints',
    source: 'calmjoints_newsletter',
    path: '/newsletter',
    kind: 'form',
    tags: ['calmjoints', 'newsletter'],
    meta: { name: 'Ada Lovelace' },
  });
  const newsBare = fridayBody('newsletter', { email: 'bea@example.com', name: null }, 'cj-news-bare');
  assert.strictEqual(newsBare.meta, undefined);
  assert.strictEqual(newsBare.site, 'calmjoints.org');
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
  assert.strictEqual(applyFriday.site, 'calmjoints.org');
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
  assert.strictEqual(rows[0].source, 'calmjoints.org');
  assert.strictEqual(rows[0].payload.email, 'ada@example.com');
  assert.strictEqual(rows[0].payload.source, 'calmjoints_newsletter');
  assert.strictEqual(rows[0].payload.site, 'calmjoints.org');
  assert.match(rows[0].payload.externalId, /^cj-news-/);
  assert.deepStrictEqual(rows[0].payload.meta, { name: 'Ada' });
  assert.strictEqual(rows[0].notify_email, 'info@calmjoints.org');
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
        site: 'calmjoints.org',
        org: 'calmjoints',
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

  let scaleCopies = 0;
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
      if (body.org === 'scalehealth') {
        scaleCopies += 1;
        assert.strictEqual(body.externalId, 'scale-cj-physio-priya');
        assert.strictEqual(body.site, 'scalehealth.ca');
        assert.strictEqual(body.lane, 'fulfillment-ca');
        assert.strictEqual(body.company, 'Calm Joints');
        assert.deepStrictEqual(body.tags, ['calmjoints', 'calmjoints-staff', 'physio-apply']);
        assert.strictEqual(body.email, 'priya@example.com');
        return { ok: true, status: 201 };
      }
      assert.strictEqual(body.org, 'calmjoints');
      assert.strictEqual(body.externalId, 'cj-physio-priya');
      assert.strictEqual(body.source, 'calmjoints_physio_apply');
      assert.strictEqual(body.site, 'calmjoints.org');
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
  assert.strictEqual(scaleCopies, 1, 'physio apply should mirror once into Scale');
  assert.strictEqual(readLines().length, before, 'Friday apply success should not write the fallback file');

  const fallback = await processIntake('newsletter', { email: 'cy@example.com', name: 'Cy' }, {
    env: fridayEnv,
    ip: '5.5.5.5',
    fetchImpl: async () => ({ ok: false, status: 502 }),
  });
  assert.strictEqual(fallback.status, 200);
  assert.match(fallback.json.message, /email you tips/i);
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

  // Questions: validated, tagged, and alerted to Slack when a webhook is set.
  assert.ok(validateQuestion({ email: 'q@example.com', message: 'hi' }).error);
  const q = validateQuestion({ email: 'Q@Example.com', name: 'Quinn Ray', message: 'Do you take benefits receipts?', notes: 'on' });
  assert.strictEqual(q.value.email, 'q@example.com');
  const qBody = fridayBody('question', q.value, 'cj-question-fixed');
  assert.strictEqual(qBody.source, 'calmjoints_question');
  assert.strictEqual(qBody.kind, 'form');
  assert.strictEqual(qBody.firstName, 'Quinn');
  assert.deepStrictEqual(qBody.tags, ['calmjoints', 'question', 'newsletter']);
  assert.match(alertText('question', qBody), /New question/);
  const alerts = [];
  const qRes = await processIntake('question', { email: 'q2@example.com', message: 'Can I book for my dad?' }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k', CJ_ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.test/x' },
    ip: '7.7.7.7',
    fetchImpl: async (url, init) => {
      if (String(url).startsWith('https://hooks.slack.test')) alerts.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    },
  });
  assert.strictEqual(qRes.status, 200);
  assert.strictEqual(alerts.length, 1);
  assert.match(alerts[0].text, /New question/);
  assert.match(alerts[0].text, /q2@example.com/);

  // intake + careers
  const { validateIntake, validateCareers } = require('../lib/intake');
  assert.ok(validateIntake({ website: '', name: 'A', email: 'a@b.co' }).error);
  const iv = validateIntake({ website: 'example.com', name: 'Ann Lee', email: 'A@B.co', message: 'hi' });
  assert.strictEqual(iv.value.website, 'https://example.com');
  const ib = fridayBody('intake', iv.value, 'cj-intake-x');
  assert.strictEqual(ib.source, 'calmjoints_intake');
  assert.strictEqual(ib.kind, 'form');
  assert.deepStrictEqual(ib.tags, ['calmjoints', 'intake']);
  assert.match(alertText('intake', ib), /New intake/);
  assert.ok(validateCareers({ name: 'Ann', email: 'a@b.co', role: 'nope' }).error);
  const cv = validateCareers({ name: 'Ann Lee', email: 'a@b.co', role: 'mobile-physio', link: 'linkedin.com/in/ann' });
  const cb = fridayBody('careers', cv.value, 'cj-careers-x');
  assert.strictEqual(cb.kind, 'providers');
  assert.deepStrictEqual(cb.tags, ['calmjoints', 'careers', 'role:mobile-physio']);
  const ab = fridayBody('careers', validateCareers({ name: 'Ann', email: 'a@b.co', role: 'accessibility' }).value, 'x');
  assert.strictEqual(ab.kind, 'form');
  const posts = [];
  const cRes = await processIntake('careers', { name: 'Ann Lee', email: 'c@example.com', role: 'accessibility' }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k' }, ip: '8.8.8.1',
    fetchImpl: async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(cRes.status, 200);
  assert.strictEqual(posts.length, 1, 'accessibility role is not mirrored to Scale');

  // Resume upload: type + magic checks, blob store, signed link into Friday meta.
  const { cleanResume, resumeSig } = require('../lib/intake');
  const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
  assert.ok(cleanResume({ name: 'cv.exe', data: pdf }).error);
  assert.ok(cleanResume({ name: 'cv.pdf', data: Buffer.from('MZ fake').toString('base64') }).error);
  assert.ok(cleanResume({ name: 'cv.pdf', data: Buffer.alloc(3 * 1024 * 1024 + 10, 65).toString('base64') }).error);
  assert.strictEqual(cleanResume({ name: 'My CV (2026).pdf', data: pdf }).value.name, 'My-CV-2026-.pdf');
  const puts = [];
  const rPosts = [];
  const rRes = await processIntake('careers', { name: 'Ann Lee', email: 'r@example.com', role: 'digital', resume: { name: 'cv.pdf', type: 'application/pdf', data: pdf } }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k' }, ip: '8.8.8.2', externalId: 'cj-careers-t1',
    blobPut: async (pathname, buf, opts) => { puts.push({ pathname, opts, len: buf.length }); return { pathname }; },
    fetchImpl: async (url, init) => { rPosts.push(JSON.parse(init.body)); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(rRes.status, 200);
  assert.strictEqual(puts[0].pathname, 'resumes/cj-careers-t1/cv.pdf');
  assert.strictEqual(puts[0].opts.access, 'private');
  const sig = resumeSig('resumes/cj-careers-t1/cv.pdf', { INTAKE_WEBHOOK_SECRET: 'k' });
  assert.strictEqual(rPosts[0].meta.resume_url, `https://calmjoints.org/api/resume?f=resumes%2Fcj-careers-t1%2Fcv.pdf&s=${sig}`);
  assert.ok(rPosts[0].tags.includes('has-resume'));
  assert.strictEqual(rPosts.length, 2, 'physio resume also mirrored to Scale');
  assert.strictEqual(rPosts[1].meta.resume_url, rPosts[0].meta.resume_url);

  // Careers multi-select and brands form routing to Scale's hub lane.
  const mv = validateCareers({ name: 'Ann Lee', email: 'a@b.co', roles: ['digital', 'in-home', 'digital'] });
  assert.deepStrictEqual(mv.value.roles, ['digital', 'in-home']);
  const mb = fridayBody('careers', mv.value, 'cj-careers-m');
  assert.deepStrictEqual(mb.tags, ['calmjoints', 'careers', 'role:digital', 'role:in-home']);
  assert.strictEqual(mb.kind, 'providers');
  assert.ok(validateCareers({ name: 'Ann Lee', email: 'a@b.co', roles: [] }).error);
  const bPosts = [];
  const bRes = await processIntake('intake', { website: 'brand.com', name: 'Bo Li', email: 'bo@brand.com', org_type: 'gym' }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k' }, ip: '8.8.8.3',
    fetchImpl: async (url, init) => { bPosts.push(JSON.parse(init.body)); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(bRes.status, 200);
  assert.strictEqual(bPosts.length, 2, 'brands form mirrored to Scale');
  assert.strictEqual(bPosts[0].meta.org_type, 'gym');
  assert.strictEqual(bPosts[1].site, 'scalehealth.ca');
  assert.strictEqual(bPosts[1].lane, 'hubs');
  assert.ok(bPosts[1].tags.includes('hub-intake'));

  // Partner pop-up: track + name + email required; website/phone optional; emails the team.
  assert.ok(validatePartner({ name: 'Bo Li', email: 'bo@x.co' }).error, 'track required');
  assert.ok(validatePartner({ track: 'managed', email: 'bo@x.co' }).error, 'name required');
  assert.ok(validatePartner({ track: 'managed', name: 'Bo Li' }).error, 'email required');
  const pv = validatePartner({ track: 'free-hub', name: 'Bo Li', email: 'BO@x.co' });
  assert.strictEqual(pv.value.website, null);
  assert.strictEqual(pv.value.email, 'bo@x.co');
  assert.ok(validatePartner({ track: 'other', name: 'Bo Li', email: 'bo@x.co', phone: 'call me' }).error);
  const pCalls = [];
  const pRes = await processIntake('partner', { track: 'managed', name: 'Bo Li', email: 'bo@gym.com', website: 'gym.com', phone: '416 555 0100', message: 'Hi <there>' }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k', CJ_RESEND_API_KEY: 're_test', CJ_ALERT_EMAILS: 'a@x.co, b@y.co' }, ip: '8.8.8.4',
    fetchImpl: async (url, init) => { pCalls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return { ok: true, status: 200 }; },
  });
  assert.strictEqual(pRes.status, 200);
  assert.strictEqual(pCalls.length, 2, 'friday + email, no Scale copy');
  const pf = pCalls.find((c) => c.url.includes('fridayapp'));
  assert.strictEqual(pf.body.source, 'calmjoints_partner');
  assert.deepStrictEqual(pf.body.tags, ['calmjoints', 'partner', 'track:managed']);
  assert.strictEqual(pf.body.meta.phone, '416 555 0100');
  const pm = pCalls.find((c) => c.url.includes('resend'));
  assert.deepStrictEqual(pm.body.to, ['a@x.co', 'b@y.co']);
  assert.strictEqual(pm.body.reply_to, 'bo@gym.com');
  assert.strictEqual(pm.auth, 'Bearer re_test');
  assert.match(pm.body.subject, /New partner request: Bo Li/);
  assert.match(pm.body.html, /CJ Managed Services/);
  assert.match(pm.body.html, /Hi &lt;there&gt;/);
  const nCalls = [];
  await processIntake('newsletter', { email: 'n@x.co' }, {
    env: { INTAKE_WEBHOOK_SECRET: 'k', CJ_RESEND_API_KEY: 're_test', CJ_ALERT_EMAILS: 'a@x.co' }, ip: '8.8.8.5',
    fetchImpl: async (url) => { nCalls.push(url); return { ok: true, status: 200 }; },
  });
  assert.ok(nCalls.some((u) => u.includes('resend')), 'email alert for newsletter signup');
  for (const li of ['linkedin.com/in/jane-doe', 'www.linkedin.com/in/jane', 'ca.linkedin.com/in/jane/']) {
    assert.ok(!validateApply({ name: 'Jane Doe', email: 'j@x.co', provinces: ['ON'], linkedin: li, bio: 'Physio for ten years' }).error, `linkedin ${li}`);
  }
  assert.ok(validateApply({ name: 'Jane Doe', email: 'j@x.co', provinces: ['ON'], linkedin: 'evil.com/in/x', bio: 'Physio for ten years' }).error);

  fs.rmSync(store, { force: true });
  console.log('intake tests ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
