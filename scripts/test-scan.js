// Print/QR scan beacon: server validation + client sends from /chat, /partners and the book hand-off.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const S = require('../lib/scan-events');
assert.deepStrictEqual(S.validateScanEvent({ kind: 'scan-event', page: 'book', src: 'dh-t1' }), { page: 'book', src: 'dh-t1' });
assert.deepStrictEqual(S.validateScanEvent({ page: 'chat', src: 'DH T1!!' }), { page: 'chat', src: 'dh-t1' });
assert.strictEqual(S.validateScanEvent({ page: 'admin', src: 'x' }), null);
assert.strictEqual(S.validateScanEvent({ page: 'chat', src: '' }), null);
const p = S.eventPath({ page: 'partners', src: 'dh-t1' }, new Date('2026-10-09T01:00:00Z'), 'abc');
assert.strictEqual(p, 'cj-scan/ev/2026-10-09/partners.dh-t1.1791507600000abc.json');
assert.deepStrictEqual(S.summarize([p]).bySrc, { 'dh-t1': { partners: 1 } });
(async () => {
  let put = null;
  const r = await S.recordScanEvent({ page: 'book', src: 'dh-t1' }, {}, { put: async (k) => { put = k; } });
  assert.ok(r.json.ok && put.startsWith('cj-scan/ev/') && put.includes('/book.dh-t1.'));
  function run(file, url, extra) {
    const u = new URL(url); const sent = [];
    const store = {};
    const ctx = Object.assign({ URLSearchParams, JSON, String, Date,
      Blob: function (parts) { this.text = parts.join(''); },
      navigator: { sendBeacon: (to, b) => { sent.push({ to, body: JSON.parse(b.text) }); return true; } },
      sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
      localStorage: { getItem: () => null }, fetch: () => Promise.resolve(),
      location: { search: u.search, pathname: u.pathname, hash: '', replace: (to) => { ctx.redirected = to; } },
      document: { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, addEventListener() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} },
      window: {} }, extra || {});
    ctx.window = Object.assign(ctx.window, { CALM_JOINTS: { booking: { primaryUrl: 'https://calmjoints.janeapp.com/x' } } });
    vm.createContext(ctx);
    try { vm.runInContext(fs.readFileSync(file, 'utf8'), ctx); } catch (e) { /* later IIFEs need a real DOM */ }
    return { sent, ctx };
  }
  let o = run('js/scan.js', 'https://calmjoints.org/chat?src=dh-t1');
  assert.deepStrictEqual(o.sent, [{ to: '/api/qr-lead', body: { kind: 'scan-event', page: 'chat', src: 'dh-t1' } }]);
  o = run('js/scan.js', 'https://calmjoints.org/partners?src=dh-t1');
  assert.strictEqual(o.sent[0].body.page, 'partners');
  o = run('js/scan.js', 'https://calmjoints.org/chat');
  assert.strictEqual(o.sent.length, 0);
  o = run('js/book.js', 'https://calmjoints.org/?intent=book&src=dh-t1');
  assert.deepStrictEqual(o.sent[0], { to: '/api/qr-lead', body: { kind: 'scan-event', page: 'book', src: 'dh-t1' } });
  assert.strictEqual(o.ctx.redirected, 'https://calmjoints.janeapp.com/x', 'beacon queued, then redirect');
  for (const f of ['chat.html', 'chat-glen.html', 'chat-gwen.html', 'partners.html']) assert.ok(fs.readFileSync(f, 'utf8').includes('/js/scan.js?v=2'), f);
  // FieldTest1: follow-ups, user agent + timestamp in the stored record, test hits kept apart, campaign roll-up.
  o = run('js/scan.js', 'https://calmjoints.org/chat?src=FieldTest1');
  assert.deepStrictEqual(o.sent[0].body, { kind: 'scan-event', page: 'chat', src: 'FieldTest1' });
  o.ctx.window.cjScanFollow('chat-start'); o.ctx.window.cjScanFollow('chat-start'); o.ctx.window.cjScanFollow('book-click'); o.ctx.window.cjScanFollow('admin');
  assert.deepStrictEqual(o.sent.map((x) => x.body.page), ['chat', 'chat-start', 'book-click']);
  assert.ok(o.sent.every((x) => x.body.src === 'FieldTest1'));
  o = run('js/scan.js', 'https://calmjoints.org/chat');
  o.ctx.window.cjScanFollow('chat-start'); assert.strictEqual(o.sent.length, 0, 'no src, no follow-up');
  let saved = null;
  const now = new Date('2026-10-09T03:00:00Z');
  await S.recordScanEvent({ page: 'chat-start', src: 'FieldTest1-sticker' }, {}, { now, ua: 'Mozilla/5.0 (iPhone)\n', put: async (k, b) => { saved = { k, b: JSON.parse(b) }; } });
  assert.ok(saved.k.startsWith('cj-scan/ev/2026-10-09/chat-start.fieldtest1-sticker.'));
  assert.deepStrictEqual(saved.b, { ts: '2026-10-09T03:00:00.000Z', page: 'chat-start', src: 'fieldtest1-sticker', ua: 'Mozilla/5.0 (iPhone)' });
  await S.recordScanEvent({ page: 'chat', src: 'FieldTest1', test: true }, {}, { now, put: async (k, b) => { saved = { k, b: JSON.parse(b) }; } });
  assert.ok(saved.k.startsWith('cj-scan/test/') && saved.b.test === true);
  const sum = S.summarize(['cj-scan/ev/2026-10-09/chat.fieldtest1.1791514800000abc.json', 'cj-scan/ev/2026-10-09/book-click.fieldtest1-sticker.1791514800001abc.json', 'cj-scan/ev/2026-10-09/chat.dh-t1.1791514800002abc.json']);
  assert.deepStrictEqual(sum.campaigns.FieldTest1, { total: 2, byPage: { chat: 1, 'book-click': 1 }, bySrc: { fieldtest1: 1, 'fieldtest1-sticker': 1 } });
  assert.strictEqual(S.parsePath('cj-scan/ev/2026-10-09/chat.fieldtest1.1791514800000abc.json').ts, '2026-10-09T03:00:00.000Z');
  const st = await S.scanStats({}, { src: 'FieldTest1', list: async () => ({ blobs: [{ pathname: 'cj-scan/ev/2026-10-09/chat.fieldtest1.1791514800000abc.json' }], hasMore: false }) });
  assert.strictEqual(st.events.length, 1);
  assert.strictEqual(fs.readFileSync('js/guide.js', 'utf8').includes("window.cjScanFollow('chat-start')"), true);
  console.log('scan ok');
})().catch((e) => { console.error(e); process.exit(1); });
