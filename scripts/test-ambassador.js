// Admin ambassador partners: exact slug, 20% of net revenue, optional pen alias, no team email.
const assert = require('assert');
const fs = require('fs');
const store = new Map();
const Module = require('module');
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

const env = {
  BLOB_READ_WRITE_TOKEN: 'x',
  INTAKE_WEBHOOK_SECRET: 'test-secret-123',
  CJ_RESEND_API_KEY: 'k',
  CJ_ALERT_EMAILS: 'team@example.com',
  CJ_ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.example/cj',
  CJ_ADMIN_KEY: 'admin-key-xyz',
};
Object.assign(process.env, env);
const mails = [];
const fridayPosts = [];
const slack = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  if (u.includes('resend')) mails.push(body);
  else if (u.includes('fridayapp')) fridayPosts.push(body);
  else if (u.includes('slack')) slack.push(body);
  return { ok: true, status: 200, json: async () => ({}) };
};

const Q = require('../lib/qr-partners');
const A = require('../lib/partner-alias');
const L = require('../lib/partner-ledger');
const admin = require('../api/admin-partner');
const aliasApi = require('../api/alias');

function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      writeHead(code, headers) { this.statusCode = code; if (headers) Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v)); },
      end(b) {
        let body = null;
        if (b) { try { body = JSON.parse(b); } catch { body = b; } }
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
    };
    Promise.resolve(handler(req, res)).catch((err) => { console.error(err); process.exit(1); });
  });
}

(async () => {
  const blocked = await Q.createPartner({ kind: 'ambassador', slug: 'amb-randyg-cj', name: 'Randy Gilling', email: 'randy@silverbirchgrowth.com', agree: true }, env);
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual([...store.keys()].length, 0, 'public signup cannot create an ambassador');

  const denied = await call(admin, { method: 'POST', headers: { authorization: 'Bearer nope' }, body: { slug: 'amb-randyg-cj', name: 'Randy Gilling', email: 'randy@silverbirchgrowth.com' } });
  assert.strictEqual(denied.status, 401);
  assert.strictEqual(mails.length, 0);
  assert.strictEqual(slack.length, 0);

  const created = await call(admin, {
    method: 'POST',
    headers: { authorization: 'Bearer admin-key-xyz', 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'amb-randyg-cj', name: 'Randy Gilling', email: 'Randy@SilverBirchGrowth.com', alias: 'Randy' }),
  });
  assert.strictEqual(created.status, 200, JSON.stringify(created.body));
  const view = created.body.partner;
  assert.strictEqual(view.slug, 'amb-randyg-cj');
  assert.strictEqual(view.contact_type, 'ambassador');
  assert.strictEqual(view.alias, 'randy');
  assert.strictEqual(view.alias_url, 'https://calmjoints.org/randy');
  assert.strictEqual(view.qr_url, 'https://calmjoints.org/p/amb-randyg-cj?src=qr');
  assert.strictEqual(view.pen_url, 'https://calmjoints.org/p/amb-randyg-cj?src=pen');
  assert.strictEqual(view.terms.share, '20% of net revenue');
  assert.strictEqual(created.body.friday, 'ok');
  assert.strictEqual(created.body.emailed, false);
  assert.strictEqual(mails.length, 0, 'create does not email anyone');
  assert.strictEqual(slack.length, 0, 'create does not alert Slack');

  const rec = await Q.getPartner('amb-randyg-cj', env);
  assert.strictEqual(rec.slug, 'amb-randyg-cj');
  assert.strictEqual(rec.kind, 'ambassador');
  assert.strictEqual(rec.contact_type, 'ambassador');
  assert.strictEqual(rec.contact.name, 'Randy Gilling');
  assert.strictEqual(rec.contact.email, 'randy@silverbirchgrowth.com');
  assert.strictEqual(rec.terms.rate, 0.2);
  assert.ok(rec.terms.text.join('\n').includes('20% of net revenue'));
  assert.ok(!/-[a-f0-9]{4}$/.test(rec.slug), 'slug is exact, with no random suffix');

  const friday = fridayPosts.find((x) => x.externalId === 'cj-qrpartner-amb-randyg-cj');
  assert.ok(friday);
  assert.strictEqual(friday.contact_type, 'ambassador');
  assert.strictEqual(friday.partner, 'amb-randyg-cj');
  assert.ok(friday.tags.includes('partner:amb-randyg-cj'));
  assert.ok(friday.tags.includes('type:ambassador'));
  assert.ok(friday.tags.length < 12);

  const again = await call(admin, {
    method: 'POST', headers: { authorization: 'Bearer admin-key-xyz' },
    body: { slug: 'amb-randyg-cj', name: 'Randy Gilling', email: 'randy@silverbirchgrowth.com', alias: 'randy' },
  });
  assert.strictEqual(again.status, 409);
  assert.strictEqual(fridayPosts.length, 1, 'a duplicate does not post Friday again');

  const clash = await call(admin, {
    method: 'POST', headers: { 'x-cj-admin-key': 'admin-key-xyz' },
    body: { slug: 'amb-other-cj', name: 'Other Person', email: 'other@example.com', alias: 'randy' },
  });
  assert.strictEqual(clash.status, 409);
  assert.strictEqual(await Q.getPartner('amb-other-cj', env), null);

  const reserved = await call(admin, {
    method: 'POST', headers: { authorization: 'Bearer admin-key-xyz' },
    body: { slug: 'amb-other-cj', name: 'Other Person', email: 'other@example.com', alias: 'partners' },
  });
  assert.strictEqual(reserved.status, 400);

  const bare = await Q.createAmbassador({ slug: 'amb-nora-cj', name: 'Nora Lee', email: 'nora@example.com' }, env);
  assert.strictEqual(bare.status, 200);
  assert.strictEqual(bare.json.partner.alias, null);
  assert.strictEqual(bare.json.emailed, false);

  const redir = await A.aliasRedirect('randy', env);
  assert.deepStrictEqual(redir, { alias: 'randy', slug: 'amb-randyg-cj', src: 'pen', location: '/p/amb-randyg-cj?src=pen' });
  assert.strictEqual(await A.aliasRedirect('partners', env), null);
  assert.strictEqual(await A.aliasRedirect('missing', env), null);
  const viaApi = await call(aliasApi, { method: 'GET', url: '/api/alias?name=randy', headers: {} });
  assert.strictEqual(viaApi.status, 302);
  assert.strictEqual(viaApi.headers.location, '/p/amb-randyg-cj?src=pen');

  const qr = await Q.recordLead({ slug: 'amb-randyg-cj', event: 'visit', src: 'qr' }, env);
  const pen = await Q.recordLead({ slug: 'amb-randyg-cj', event: 'visit', src: 'pen' }, env);
  assert.strictEqual(qr.status, 200);
  assert.strictEqual(pen.status, 200);
  const visitKeys = [...store.keys()].filter((k) => k.startsWith('qr-leads/amb-randyg-cj/visit/'));
  assert.strictEqual(visitKeys.length, 2);
  assert.ok(visitKeys.some((k) => k.includes('/qr.')));
  assert.ok(visitKeys.some((k) => k.includes('/pen.')));
  let { s } = await L.summary('amb-randyg-cj', env);
  assert.strictEqual(s.scans, 2);
  assert.strictEqual(s.by_src.qr, 1);
  assert.strictEqual(s.by_src.pen, 1);

  const sale = await L.recordEvent({ type: 'visit', slug: 'amb-randyg-cj', ref: 'amb-visit-1', net: 100, billed: 180 }, env);
  assert.strictEqual(sale.status, 200);
  const ledger = [...store.keys()].find((k) => k.startsWith('qr-ledger/amb-randyg-cj/') && JSON.parse(store.get(k)).ref_hash);
  const saved = JSON.parse(store.get(ledger));
  assert.strictEqual(saved.share, 20, 'ambassador share is 20% of net revenue');

  await fakeBlob.put('qr-partners/maple-court/partner.json', JSON.stringify({ slug: 'maple-court', venue: 'Maple Court', kind: 'venue', contact: { name: 'Dana', email: 'dana@maple.test' }, status: 'active', terms: { share: '25% of partnership profit' } }), { allowOverwrite: true });
  const venueSale = await L.recordEvent({ type: 'visit', slug: 'maple-court', ref: 'venue-1', net: 100 }, env);
  assert.strictEqual(venueSale.status, 200);
  const venueLedger = JSON.parse(store.get([...store.keys()].find((k) => k.startsWith('qr-ledger/maple-court/'))));
  assert.strictEqual(venueLedger.share, 25);

  const sales = require('../api/cj-sales');
  const feed = await call(sales, { method: 'GET', headers: { authorization: 'Bearer admin-key-xyz' } });
  assert.strictEqual(feed.status, 200);
  const row = feed.body.partners.find((p) => p.slug === 'amb-randyg-cj');
  assert.ok(row);
  assert.strictEqual(row.contact_type, 'ambassador');
  assert.strictEqual(row.alias, 'randy');
  assert.strictEqual(row.scans, 2);
  assert.strictEqual(row.by_src.pen, 1);
  assert.strictEqual(row.by_src.qr, 1);
  assert.ok(feed.body.totals.scans >= 2);

  const beforeMail = mails.length;
  const noticed = await call(admin, {
    method: 'POST', headers: { authorization: 'Bearer admin-key-xyz' },
    body: { slug: 'amb-lee-cj', name: 'Lee Chen', email: 'lee@example.com', alias: 'lee', notify: true },
  });
  assert.strictEqual(noticed.status, 200);
  assert.strictEqual(noticed.body.emailed, true);
  assert.strictEqual(mails.length, beforeMail + 1);
  const note = mails[mails.length - 1];
  assert.deepStrictEqual(note.to, ['lee@example.com']);
  assert.ok(!note.to.includes('team@example.com'));
  assert.match(note.subject, /ambassador code is ready/);
  assert.match(note.text, /20% of net revenue/);
  assert.match(note.text, /https:\/\/calmjoints\.org\/lee/);
  assert.match(note.text, /never ask for your bank details by email/i);
  assert.strictEqual(slack.length, 0);

  for (const f of fs.readdirSync('.').filter((n) => n.endsWith('.html'))) {
    const name = f.slice(0, -5);
    assert.ok(A.RESERVED_ALIASES.has(name), name + ' must be a reserved alias');
    assert.ok(A.ALIAS_MATCHER.includes(name + '$'), name + ' must be excluded from the alias matcher');
  }
  const mid = fs.readFileSync('middleware.js', 'utf8');
  assert.ok(mid.includes(A.ALIAS_MATCHER));
  assert.ok(mid.includes('status: 302'));
  assert.ok(mid.includes("src=pen") || mid.includes('aliasRedirect'));
  assert.ok(fs.readFileSync('p.html', 'utf8').includes("cj-visit-' + slug + '-' + src"));
  assert.ok(fs.readFileSync('sales.html', 'utf8').includes('p.alias') && fs.readFileSync('sales.html', 'utf8').includes('by_src'));
  assert.ok(fs.readFileSync('vercel.json', 'utf8').includes('api/admin-partner.js'));
  assert.ok(fs.readFileSync('scripts/dev-server.js', 'utf8').includes('aliasRedirect'));
  console.log('ambassador: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
