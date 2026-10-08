// One-tap share + Glen/Gwen guide config checks.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ctx = { window: {}, navigator: { userAgent: 'test', maxTouchPoints: 0 }, location: { pathname: '/chat' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('config.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('js/share.js', 'utf8'), ctx);
const S = ctx.window.CJShare;
// v3: share the AI recovery concierge. Guide-specific links open /chat with that guide pre-selected.
assert.strictEqual(S.urlFor('glen'), 'https://calmjoints.org/chat?guide=glen&ref=share');
assert.strictEqual(S.urlFor('gwen'), 'https://calmjoints.org/chat?guide=gwen&ref=share');
assert.strictEqual(S.urlFor('nope'), 'https://calmjoints.org/chat?guide=glen&ref=share');
assert.strictEqual(S.url, S.urlFor('glen'));
for (const g of ['glen', 'gwen']) {
  const name = g === 'glen' ? 'Glen' : 'Gwen';
  const url = S.urlFor(g);
  const msg = S.messageFor(g);
  assert.ok(msg.startsWith('Thought of you.'), msg);
  assert.ok(msg.includes('ask ' + name + ', Calm Joints’ free 24/7 AI recovery concierge'), msg);
  assert.ok(g === 'glen' ? /Tell him .* he’ll/.test(msg) : /Tell her .* she’ll/.test(msg), 'pronouns: ' + msg);
  assert.strictEqual(msg.split(url).length, 2, 'link appears exactly once');
  assert.strictEqual(msg.split('https://').length, 2);
  assert.ok(msg.length <= 260, 'share text length: ' + msg.length);
  assert.ok(!/(guarantee|diagnos|cure|best|expert|specialist|partner clinic)/i.test(msg), 'no guarantee/diagnosis/superiority claims');
  // Text Glen line only on Glen's message
  assert.strictEqual(msg.endsWith(' (or text Glen at (647) 692-6575)'), g === 'glen', msg);
  for (const h of [S.smsHref(true, msg), S.smsHref(false, msg)]) {
    const body = h.replace(/^sms:[&?]body=/, '');
    assert.ok(!/[\s&?#]/.test(body), 'body must be URL-encoded: ' + body);
    assert.strictEqual(decodeURIComponent(body), msg);
  }
  assert.ok(S.smsHref(true, msg).startsWith('sms:&body=') && S.smsHref(false, msg).startsWith('sms:?body='));
  // Web Share: text only (link once), no url field (doubles on iOS/Android), no title (stray text in Messages).
  const pl = JSON.parse(JSON.stringify(S.payload(g)));
  assert.deepStrictEqual(Object.keys(pl), ['text']);
  assert.strictEqual(pl.text, msg);
  assert.ok(S.mailHref(g).startsWith('mailto:?subject=') && decodeURIComponent(S.mailHref(g)).includes(url));
}
const H3 = S.html({ placement: 'home' });
assert.ok(H3.includes('Share your AI recovery concierge'), 'headline');
assert.ok(H3.includes('Send them Glen') && H3.includes('Send them Gwen'), 'picker');
assert.ok(H3.includes('data-cjs-g="glen"') && H3.includes('data-cjs-g="gwen"') && H3.includes('/media/cj-guide-gwen.webp'));
assert.ok(H3.includes('data-cjs-copy') && H3.includes('Copy link'), 'copy-link fallback');
assert.ok(H3.includes('data-place="home"'));
assert.ok(S.html({ first: 'gwen' }).indexOf('data-cjs-g="gwen"') < S.html({ first: 'gwen' }).indexOf('data-cjs-g="glen"'), 'first guide first');
// Text Glen line
assert.ok(S.html().includes('href="tel:+16476926575"') && S.html().includes('Call or text Glen: <a href="tel:+16476926575"') && S.html().includes('href="sms:+16476926575">Text</a>') && S.html().includes('AI guide, not a physio · msg rates may apply'));
assert.ok(!S.html({ textGuide: false }).includes('data-cjs-textguide'));
assert.ok(S.isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5));
assert.ok(S.isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'iPadOS desktop UA');
assert.ok(!S.isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5));
assert.ok(S.html().includes('Copy message') && S.html().includes('Text it') && S.html().includes('Email'));

const g = ctx.window.CALM_JOINTS.guide;
assert.strictEqual(g.defaultGuide, 'glen');
assert.strictEqual(g.guides.glen.name, 'Glen');
assert.strictEqual(g.guides.gwen.name, 'Gwen');
assert.strictEqual(g.guides.glen.agentId, 'agent_8401m48tn2g5ehwsa0p84e8pnaf8');
assert.strictEqual(g.guides.gwen.agentId, 'agent_8701m49rk5stf07avtka9ef8nvs0');
assert.deepStrictEqual(JSON.parse(JSON.stringify(g.aliases)), { randy: 'glen', emma: 'gwen' });

// Post-help share (js/helped.js)
vm.runInContext(fs.readFileSync('js/helped.js', 'utf8'), ctx);
const H = ctx.window.CJHelped;
assert.strictEqual(H.url, 'https://calmjoints.org/chat?src=helped');
assert.strictEqual(H.shareText('Gwen').split('https://').length, 2);
assert.ok(H.shareText('Glen').startsWith('Glen helped me make sense of my aches today'));
assert.ok(H.xHref('Glen').startsWith('https://x.com/intent/post?text=') && H.xHref('Glen').includes('url=https%3A%2F%2Fcalmjoints.org%2Fchat%3Fsrc%3Dhelped'));
assert.ok(H.html({ name: 'Gwen', key: 'gwen' }).includes('Gwen helped? Pass her on'));
assert.ok(H.html({ name: 'Glen', key: 'glen' }).includes('Glen helped? Pass him on'));
assert.ok(H.html({ name: 'Gwen', key: 'gwen' }).includes('Send them Gwen'), 'post-help card leads with the concierge picker');
assert.ok(H.html({ name: 'Gwen', key: 'gwen' }).indexOf('data-cjs-g="gwen"') < H.html({ name: 'Gwen', key: 'gwen' }).indexOf('data-cjs-g="glen"'), 'current guide first');
assert.ok(!/(book|diagnos|cure|guarantee|physiotherapist said|recovered)/i.test(H.shareText('Glen') + H.html({ name: 'Glen' }).replace(/not a physio/g, '')), 'helped card: AI guide only');
for (const f of ['chat.html', 'chat-glen.html', 'chat-gwen.html', 'js/guide.js', 'css/guide.css', 'js/share.js', 'js/helped.js']) {
  const src = fs.readFileSync(f, 'utf8');
  assert.ok(!/Talk with (Randy|Emma)|I’m (Randy|Emma)/.test(src), f + ' still shows an old guide name');
  assert.ok(!/\b(CHI|Clairvoyant|Align|Jane|Scale|Birch|BirchReserve|Silver Birch)\b/.test(src), f + ' has a name that must not reach visitors');
}
// Site footers carry no legal/sender boilerplate (it lives only in outbound email footers).
for (const f of ['index.html', 'partners.html', 'chat.html', 'chat-glen.html', 'chat-gwen.html', 'careers.html', 'partner.html', 'p.html', 'sales.html', ...fs.readdirSync('blog').filter((n) => n.endsWith('.html')).map((n) => 'blog/' + n)]) {
  const src = fs.readFileSync(f, 'utf8');
  assert.ok(!/trade name of|operated by Clairvoyant/i.test(src), f + ' still shows the trade-name/sender line');
}
// Partnership fine print names Calm Joints only (same terms text is stored on accept).
for (const f of ['partners.html', 'lib/qr-partners.js']) {
  assert.ok(!/\bClairvoyant\b/.test(fs.readFileSync(f, 'utf8')), f + ' fine print still names Clairvoyant');
}

// Guide pages: built from chat.html, guide pre-selected, guide-specific link preview; routes in vercel.json.
const { buildAll } = require('./build-guide-pages');
for (const [f, want] of Object.entries(buildAll())) {
  assert.strictEqual(fs.readFileSync(f, 'utf8'), want, f + ' is stale: run node scripts/build-guide-pages.js');
}
for (const g of ['glen', 'gwen']) {
  const src = fs.readFileSync(`chat-${g}.html`, 'utf8');
  const name = g === 'glen' ? 'Glen' : 'Gwen';
  assert.ok(src.startsWith('<!doctype html>'), 'doctype first');
  assert.ok(src.includes(`window.CJ_PAGE_GUIDE = '${g}'`));
  assert.ok(src.includes(`<meta property="og:image" content="https://calmjoints.org/media/og-${g}.jpg?v=`));
  assert.ok(src.includes(`<meta property="og:title" content="Hurting? Ask ${name}, free 24/7">`));
  assert.ok(src.includes(`<meta property="og:url" content="https://calmjoints.org/chat?guide=${g}">`));
  assert.ok(src.includes('<link rel="canonical" href="https://calmjoints.org/chat">'));
  assert.ok(fs.statSync(`media/og-${g}.jpg`).size > 20000);
}
const vj = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
for (const g of ['glen', 'gwen']) {
  assert.ok(vj.routes.some((r) => r.src === '/chat/?' && r.dest === `/chat-${g}` && r.has && r.has[0].key === 'guide' && r.has[0].value === g), 'route /chat?guide=' + g);
  assert.ok(vj.routes.some((r) => r.src === `/${g}/?` && r.dest === `/chat-${g}`), 'route /' + g);
}
assert.ok(vj.routes.findIndex((r) => r.dest === '/chat-glen') < vj.routes.findIndex((r) => r.status === 404), 'guide routes come first');
// Placements: homepage block + header/menu sheet, /chat gate + header + chat card + post-help card.
const home = fs.readFileSync('index.html', 'utf8');
assert.ok(home.includes('data-cjs-mount data-place="home"') && home.includes('data-cjs-open="header"'));
const gj = fs.readFileSync('js/guide.js', 'utf8');
assert.ok(gj.includes("qs.get('src') || qs.get('ref')") && gj.includes('window.CJ_PAGE_GUIDE') && gj.includes('openSheet'));

// Anonymous share counts by guide (lib/share-events.js)
const E = require('../lib/share-events');
assert.deepStrictEqual(E.validateShareEvent({ guide: 'Gwen', event: 'click', placement: 'home', method: 'button', page: '/' }), { guide: 'gwen', event: 'click', method: 'button', placement: 'home', page: 'home' });
assert.strictEqual(E.validateShareEvent({ guide: 'randy', event: 'click' }), null);
assert.strictEqual(E.validateShareEvent({ guide: 'glen', event: 'hack' }), null);
const p1 = E.eventPath({ guide: 'gwen', event: 'click', placement: 'helped', method: 'button' }, new Date('2026-10-08T18:00:00Z'), 'abc123');
assert.strictEqual(p1, 'cj-share/ev/2026-10-08/gwen.click.helped.button.1791482400000abc123.json');
const sum = E.summarize([p1, 'cj-share/ev/2026-10-08/glen.copy.home.auto.1abc.json', 'cj-share/ev/2026-10-08/gwen.click.home.button.2xyz.json', 'junk']);
assert.strictEqual(sum.total, 3);
assert.deepStrictEqual(sum.byGuide, { gwen: { click: 2 }, glen: { copy: 1 } });
assert.strictEqual(sum.byPlacement.helped.gwen.click, 1);
(async () => {
  let put = null;
  const out = await E.recordShareEvent({ guide: 'glen', event: 'visit', placement: 'landing', method: 'link', page: '/chat' }, {}, { put: async (path, body, o) => { put = { path, body, o }; }, now: new Date('2026-10-08T18:00:00Z') });
  assert.deepStrictEqual(out.json, { ok: true, stored: true });
  assert.ok(put.path.startsWith('cj-share/ev/2026-10-08/glen.visit.landing.link.') && put.o.access === 'private' && put.body === '{}');
  const bad = await E.recordShareEvent({ guide: 'x' }, {}, { put: async () => {} });
  assert.strictEqual(bad.status, 400);
  const stats = await E.shareStats({}, { list: async () => ({ blobs: [{ pathname: p1 }], hasMore: false }) });
  assert.strictEqual(stats.byGuide.gwen.click, 1);
  console.log('share + guide-name tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
