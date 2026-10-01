// End-to-end test of the partner ledger with an in-memory Blob store and a fake Resend.
// node scripts/test-partner-ledger.js            run assertions
// PREVIEW=1 node scripts/test-partner-ledger.js  also serve the site with the seeded data on :8798
const assert = require('assert');
const path = require('path');
const store = new Map();
const Module = require('module');
const origLoad = Module._load;
const fakeBlob = {
  async put(p, body, o) { if (store.has(p) && !o.allowOverwrite) throw new Error('This blob already exists'); store.set(p, Buffer.isBuffer(body) ? body : Buffer.from(String(body))); return { pathname: p }; },
  async get(p) { if (!store.has(p)) throw new Error('not found'); return { stream: new Response(store.get(p)).body }; },
  async list({ prefix }) { return { blobs: [...store.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false }; },
};
Module._load = function (req, ...rest) { return req === '@vercel/blob' ? fakeBlob : origLoad.call(this, req, ...rest); };
const env = { BLOB_READ_WRITE_TOKEN: 'x', INTAKE_WEBHOOK_SECRET: 'test-secret-123', CJ_RESEND_API_KEY: 'k', CJ_ALERT_EMAILS: 'team@example.com' };
Object.assign(process.env, env);
const mails = [];
const fakeFetch = async (url, opts) => { if (String(url).includes('resend')) mails.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({}) }; };
global.fetch = fakeFetch;
const L = require('../lib/partner-ledger');

(async () => {
  const put = (p, o) => store.set(p, Buffer.from(JSON.stringify(o)));
  put('qr-partners/maple-tennis-club/partner.json', { slug: 'maple-tennis-club', venue: 'Maple Tennis Club', contact: { name: 'Dana Fox', email: 'dana@mapletennis.ca' }, status: 'active', terms: { version: 'cj-partner-2026-10-01a' } });
  for (let i = 0; i < 38; i++) put(`qr-leads/maple-tennis-club/visit/v${i}.json`, { slug: 'maple-tennis-club', event: 'visit', at: '2026-10-01T12:00:00Z' });
  for (let i = 0; i < 9; i++) put(`qr-leads/maple-tennis-club/book/b${i}.json`, { slug: 'maple-tennis-club', event: 'book', at: '2026-10-01T12:00:00Z' });
  put('qr-leads/maple-tennis-club/email/e1.json', { slug: 'maple-tennis-club', event: 'email', email: 'pat@example.com', at: '2026-10-01T12:00:00Z' });

  // tokens
  const tk = L.makeToken('maple-tennis-club', env);
  assert.strictEqual(L.readToken(tk, env), 'maple-tennis-club');
  assert.strictEqual(L.readToken(tk.slice(0, -2) + 'xx', env), null, 'tampered token rejected');
  assert.strictEqual(L.readToken(L.makeToken('maple-tennis-club', env, 1, Date.now() - 3 * 86400000), env), null, 'expired token rejected');
  assert.strictEqual(L.serverAuthed({ headers: { authorization: 'Bearer nope' } }, env), false);
  assert.strictEqual(L.serverAuthed({ headers: { authorization: 'Bearer test-secret-123' } }, env), true);

  // booking attributed by patient email -> first-booking nudge
  let r = await L.recordEvent({ type: 'booking', patient_email: 'PAT@example.com', ref: 'jane-1001', net: 50, source: 'jane' }, env);
  assert.strictEqual(r.json.slug, 'maple-tennis-club'); assert.deepStrictEqual(r.json.nudges, ['first_booking']);
  assert.ok(mails.some((m) => m.to[0] === 'dana@mapletennis.ca' && /first Calm Joints booking/.test(m.subject)));
  // duplicate is a no-op
  r = await L.recordEvent({ type: 'booking', slug: 'maple-tennis-club', ref: 'jane-1001' }, env); assert.strictEqual(r.json.duplicate, true);
  // unattributed patient
  r = await L.recordEvent({ type: 'booking', patient_email: 'nobody@example.com', ref: 'x' }, env); assert.strictEqual(r.json.attributed, false);
  // visits: $60 share then cross $100
  r = await L.recordEvent({ type: 'visit', slug: 'maple-tennis-club', ref: 'jane-1001', billed: 120, net: 240 }, env); // share 60
  assert.deepStrictEqual(r.json.nudges, [], 'no reminder within 7 days of the first-booking email');
  r = await L.recordEvent({ type: 'visit', slug: 'maple-tennis-club', ref: 'jane-1002', net: 200, product: 'scalehub' }, env); // +50 = 110
  assert.deepStrictEqual(r.json.nudges, ['over_100']);
  // 8 days later the cron sends one payout-setup reminder, then not again for a week
  let n = await L.runNudges('maple-tennis-club', env, fakeFetch, new Date(Date.now() + 8 * 86400000)); assert.deepStrictEqual(n.sent, ['payout_reminder']);
  n = await L.runNudges('maple-tennis-club', env, fakeFetch, new Date(Date.now() + 9 * 86400000)); assert.deepStrictEqual(n.sent, []);
  let { s } = await L.summary('maple-tennis-club', env);
  assert.strictEqual(s.earned, 110); assert.strictEqual(s.owed, 110); assert.strictEqual(s.pending, 0); assert.strictEqual(s.payout_due, false);
  assert.strictEqual(s.scans, 38); assert.strictEqual(s.booking_clicks, 9); assert.strictEqual(s.product, L.PRODUCTS.scalehub);
  // payout setup request -> team mail, idempotent
  const before = mails.length;
  r = await L.requestPayoutSetup('maple-tennis-club', env); assert.strictEqual(r.json.payout.status, 'requested');
  assert.ok(mails.slice(before).some((m) => m.to[0] === 'team@example.com' && /Send payout invite/.test(m.subject)));
  await L.requestPayoutSetup('maple-tennis-club', env); assert.strictEqual(mails.length, before + 1);
  // cross $500 -> team payout due
  r = await L.recordEvent({ type: 'adjustment', slug: 'maple-tennis-club', ref: 'adj-1', share: 400 }, env);
  assert.ok(r.json.nudges.includes('team_payout_due'));
  // record payout -> owed drops
  await L.recordEvent({ type: 'payout', slug: 'maple-tennis-club', ref: 'po-1', amount: 510 }, env);
  ({ s } = await L.summary('maple-tennis-club', env)); assert.strictEqual(s.owed, 0); assert.strictEqual(s.paid, 510);
  // no bank fields anywhere in stored data
  for (const [k, v] of store) assert.ok(!/account_number|transit|routing|institution/i.test(v.toString()), `no bank data in ${k}`);
  // every partner email warns about bank details by email
  assert.ok(mails.every((m) => /never ask for your bank details by email/.test(m.text)));
  console.log(`partner-ledger: all checks passed (${mails.length} emails)`);

  if (process.env.PREVIEW) {
    // reset to a nice demo state
    for (const k of [...store.keys()]) if (k.startsWith('qr-ledger/') || k.endsWith('account.json')) store.delete(k);
    const evs = [['booking', 'd1', 0, 60, '2026-09-22'], ['visit', 'd1', 240, 0, '2026-09-24'], ['booking', 'd2', 0, 0, '2026-09-25'], ['visit', 'd2', 200, 0, '2026-09-26'], ['visit', 'd3', 260, 0, '2026-09-28'], ['booking', 'd5', 0, 0, '2026-09-29'], ['visit', 'd5', 300, 0, '2026-09-30'], ['booking', 'd6', 200, 0, '2026-10-01'], ['booking', 'd7', 220, 0, '2026-10-01']];
    for (const [type, ref, net, , at] of evs) await L.recordEvent({ type, slug: 'maple-tennis-club', ref, net, at: at + 'T15:00:00Z' }, env);
    const http = require('http'); const fs = require('fs'); const root = path.join(__dirname, '..');
    const portal = require('../api/partner-portal');
    http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/api/partner-portal') return portal(req, res);
      let rel = u.pathname === '/' ? '/index.html' : u.pathname; if (!path.extname(rel)) rel += '.html';
      fs.readFile(path.join(root, rel), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(b); });
    }).listen(8798, () => console.log('preview http://127.0.0.1:8798/partner?t=' + encodeURIComponent(L.makeToken('maple-tennis-club', env))));
  }
})().catch((e) => { console.error(e); process.exit(1); });
