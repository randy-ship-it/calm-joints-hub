// Self-serve QR partner + poster report. In-memory blob, fake Resend.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const Module = require('module');
const store = new Map();
const origLoad = Module._load;
const fakeBlob = {
  async put(p, body, o) {
    if (store.has(p) && o && !o.allowOverwrite) throw new Error('This blob already exists');
    store.set(p, Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    return { pathname: p };
  },
  async get(p) {
    if (!store.has(p)) throw new Error('not found');
    return { stream: new Response(store.get(p)).body };
  },
  async list({ prefix }) {
    return { blobs: [...store.keys()].filter((k) => k.startsWith(prefix || '')).map((pathname) => ({ pathname })), hasMore: false };
  },
  async del(p) { store.delete(p); },
};
Module._load = function (req, ...rest) { return req === '@vercel/blob' ? fakeBlob : origLoad.call(this, req, ...rest); };

const env = { BLOB_READ_WRITE_TOKEN: 'x', INTAKE_WEBHOOK_SECRET: 'test-secret-123', CJ_RESEND_API_KEY: 'k', CJ_ALERT_EMAILS: 'team@example.com' };
Object.assign(process.env, env);
const mails = [];
global.fetch = async (url, opts) => {
  if (String(url).includes('resend')) mails.push(JSON.parse(opts.body));
  return { ok: true, status: 200, json: async () => ({}) };
};

const Q = require('../lib/qr-partners');
const R = require('../lib/poster-report');
const L = require('../lib/partner-ledger');

(async () => {
  let out = await Q.createPartner({ kind: 'share', email: 'qrsmoke@calmjoints.org', agree: true, phone: '416-555-0100' }, env);
  assert.strictEqual(out.status, 200, JSON.stringify(out.json));
  assert.strictEqual(out.json.partner.kind, 'share');
  assert.strictEqual(out.json.partner.display_name, null);
  assert.ok(out.json.partner.landing_url.startsWith('https://calmjoints.org/p/'));
  const anon = await Q.getPartner(out.json.partner.slug, env);
  assert.strictEqual(anon.test, true);
  assert.strictEqual(anon.terms.version, Q.SHARE_TERMS.version);
  assert.strictEqual(anon.terms.share, '25% of partnership profit');
  assert.ok(anon.terms.text.join('\n').includes('25% of partnership profit'));
  assert.ok(anon.terms.text.join('\n').includes('more than $500'));
  assert.ok(!/Union Station|partner clinic|\bAI\b/i.test(anon.terms.text.join('\n')));

  out = await Q.createPartner({ kind: 'share', name: 'Alex Chen', email: 'alex@example.com', agree: true }, env);
  assert.strictEqual(out.json.partner.display_name, 'Alex Chen');
  const alex = out.json.partner.slug;
  assert.strictEqual((await Q.getPartner(alex, env)).test, false);

  assert.strictEqual((await Q.createPartner({ kind: 'share', email: 'alex@example.com', agree: false }, env)).status, 400);
  assert.strictEqual((await Q.createPartner({ kind: 'share', email: 'not-an-email', agree: true }, env)).status, 400);
  assert.strictEqual((await Q.createPartner({ name: 'Sam', email: 'sam@example.com', agree: true }, env)).status, 400, 'venue form still requires a venue');

  const dl = await Q.recordLead({ slug: alex, event: 'download', size: 'poster' }, env);
  assert.ok(/^[a-f0-9]{6}$/.test(dl.json.code));
  let m = await Q.matchReport(dl.json.code, env);
  assert.strictEqual(m.slug, alex);
  m = await Q.matchReport('https://calmjoints.org/p/' + alex + '?src=qr&c=' + dl.json.code, env);
  assert.strictEqual(m.slug, alex);
  m = await Q.matchReport('Alex Chen', env);
  assert.strictEqual(m.partner.slug, alex);
  assert.strictEqual(m.partner.email, 'alex@example.com');

  const before = mails.length;
  const rep = await R.submitReport({ location: 'On a lamp post outside a shop', code: dl.json.code, contact: 'neighbour@example.com', note: 'Blocking a doorway' }, env);
  assert.strictEqual(rep.status, 200);
  assert.strictEqual(rep.json.matched, true);
  assert.ok(!rep.json.partner, 'public payload has no partner record');
  const mail = mails[mails.length - 1];
  assert.deepStrictEqual(mail.to, ['info@calmjoints.org', 'randy@silverbirchgrowth.com']);
  assert.ok(!mail.to.includes('alex@example.com'), 'takedown was not sent to the partner');
  assert.ok(/did NOT go to the partner/i.test(mail.text));
  assert.ok(/Please take that poster down promptly/.test(mail.text));
  assert.ok(/Alex/.test(mail.text));
  assert.ok(mails.length === before + 1);
  const saved = [...store.keys()].find((k) => k.startsWith('poster-reports/') && k.endsWith('report.json'));
  const rec = JSON.parse(store.get(saved).toString());
  assert.strictEqual(rec.matched_slug, alex);
  assert.ok(!/health|diagnosis|patient_name/i.test(JSON.stringify(rec)));

  const w = await L.welcome(await Q.getPartner(alex, env), env);
  assert.strictEqual(w.ok, true);
  const welcome = mails[mails.length - 1];
  assert.strictEqual(welcome.to[0], 'alex@example.com');
  assert.ok(/Your Calm Joints QR is ready/.test(welcome.subject));
  assert.ok(/never ask for bank details by email/i.test(welcome.text));
  assert.ok(welcome.text.includes('https://calmjoints.org/partner?t='));

  const ctx = { window: {}, navigator: { userAgent: 'test' }, document: { createElement() { return {}; } }, TextEncoder, Uint8Array };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/qrcode.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/share-poster.js', 'utf8'), ctx);
  const svg = ctx.CJPoster.svg({ url: 'https://calmjoints.org/p/' + alex + '?src=qr', name: 'Alex Chen', size: 'letter' });
  assert.ok(svg.includes('Hurt? Talk to Glen, 24/7'));
  assert.ok(svg.includes('Shared by Alex Chen'));
  assert.ok(svg.includes('In the moment recovery care'));
  assert.ok(svg.includes('calmjoints.org/report'));
  assert.ok(!/Union Station|partner clinic|\bAI\b/i.test(svg));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = Buffer.from(ctx.CJPoster.pdfFromJpeg(jpeg, 612, 792, 100, 100));
  assert.ok(pdf.slice(0, 5).toString() === '%PDF-');
  assert.ok(pdf.includes(jpeg));

  for (const f of ['partners.html', 'partner-terms.html', 'report.html', 'partner.html']) {
    const html = fs.readFileSync(f, 'utf8');
    assert.ok(!/Union Station/i.test(html), f);
    assert.ok(!/partner clinic/i.test(html), f);
    assert.ok(!/\bAI\b/.test(html), f + ' says AI');
  }
  const partners = fs.readFileSync('partners.html', 'utf8');
  assert.ok(partners.includes('id="share"') && partners.includes('kind: \'share\''));
  assert.ok(partners.includes('/partner-terms') && partners.includes('/report'));
  const terms = fs.readFileSync('partner-terms.html', 'utf8');
  assert.ok(terms.includes('25%') && terms.includes('$500') && terms.includes('T4A') && terms.includes('ask once'));
  for (const f of ['index.html', 'partners.html', 'privacy.html', 'careers.html', 'blog/index.html']) {
    assert.ok(fs.readFileSync(f, 'utf8').includes('href="/report"'), f + ' footer missing report');
  }
  assert.ok(fs.readFileSync('vercel.json', 'utf8').includes('api/poster-report.js'));
  console.log('share-poster: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
